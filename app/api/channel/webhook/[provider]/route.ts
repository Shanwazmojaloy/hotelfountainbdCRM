// [Hotel-CRM] Channel Manager - inbound webhook (Phase 3.1)
// POST /api/channel/webhook/:provider
// Fail-closed auth -> adapter resolve -> shared processInbound
// (created / cancelled / modified / multi-room / REVIEW routing) ->
// inline outbound drain. Outside the CRM perimeter gate by design.

import { NextRequest, NextResponse } from 'next/server';
import { getAdapter, type ChannelAccountRow } from '@/lib/channel/adapter';
import { drainOnce, serviceClient } from '@/lib/channel/drain';
import { processInbound } from '@/lib/channel/inbound';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;

  const adapter = getAdapter(provider);
  if (!adapter) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const db = serviceClient();
  const { data: account } = await db
    .from('channel_accounts')
    .select('*')
    .eq('provider', provider)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: 'No active channel account' }, { status: 403 });
  }
  const acct = account as ChannelAccountRow;

  const rawBody = await req.text();
  if (!adapter.verifyWebhook(req, rawBody, acct)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let booking;
  try {
    if (adapter.resolveWebhook) {
      booking = await adapter.resolveWebhook(rawBody, acct);
    } else if (adapter.parseWebhook) {
      booking = adapter.parseWebhook(rawBody, acct);
    } else {
      return NextResponse.json({ error: 'Adapter has no parser' }, { status: 500 });
    }
  } catch (e: any) {
    const msg: string = e?.message || 'Malformed payload';
    // MALFORMED = permanent (400, no retry); anything else = 500 so the
    // provider redelivers for up to 24h (feed poll is the backstop).
    const permanent = msg.startsWith('MALFORMED_PAYLOAD');
    return NextResponse.json({ error: msg }, { status: permanent ? 400 : 500 });
  }

  // Non-booking event (ari, sync_error, reviews...): acknowledge and ignore.
  if (booking === null) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const outcome = await processInbound(db, adapter, acct, booking);

  // Push resulting availability changes out now (crons are daily-only;
  // the 15-min pg_cron drain is the sweep).
  let drained = 0;
  if (outcome.httpStatus === 200) {
    try { drained = (await drainOnce(10)).done; } catch { /* sweep catches it */ }
  }

  return NextResponse.json({ ...outcome.body, drained }, { status: outcome.httpStatus });
}
