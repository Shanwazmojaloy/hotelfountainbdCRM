// [Hotel-CRM] Channel Manager Phase 2 - inbound webhook
// POST /api/channel/webhook/:provider
// Fail-closed HMAC auth -> idempotent sync_queue intake -> fn_guard_and_book
// (retry once on deadlock 40P01) -> inline outbound drain.
// Outside the CRM perimeter gate by design (CM servers must reach it).

import { NextRequest, NextResponse } from 'next/server';
import { getAdapter, type ChannelAccountRow } from '@/lib/channel/adapter';
import { drainOnce, serviceClient } from '@/lib/channel/drain';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEADLOCK = '40P01';

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
    // No active account for this provider: reject (fail closed).
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
      // Thin-trigger providers (Channex): fetch the full booking upstream.
      booking = await adapter.resolveWebhook(rawBody, acct);
    } else if (adapter.parseWebhook) {
      booking = adapter.parseWebhook(rawBody, acct);
    } else {
      return NextResponse.json({ error: 'Adapter has no parser' }, { status: 500 });
    }
  } catch (e: any) {
    const msg: string = e?.message || 'Malformed payload';
    // MALFORMED = permanent (400, no retry); anything else (provider API
    // down, unmapped room) = 500 so the provider redelivers for up to 24h.
    const permanent = msg.startsWith('MALFORMED_PAYLOAD');
    return NextResponse.json({ error: msg }, { status: permanent ? 400 : 500 });
  }

  // Non-booking event (ari, sync_error, reviews...): acknowledge and ignore.
  if (booking === null) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Idempotent intake: partial-unique (channel_account_id, external_event_id)
  // makes a redelivered webhook a no-op.
  const { data: queued, error: insErr } = await db
    .from('sync_queue')
    .insert({
      tenant_id: acct.tenant_id,
      channel_account_id: acct.id,
      direction: 'inbound',
      event_type: booking.eventType,
      external_event_id: booking.externalEventId,
      payload: booking.raw,
    })
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  const queueId = queued.id as string;

  // booking_modified / booking_cancelled: leave pending; the drainer marks
  // them UNHANDLED (Phase 3) so they surface instead of vanishing.
  if (booking.eventType !== 'booking_created') {
    return NextResponse.json({ ok: true, queued: true, event: booking.eventType });
  }

  // Process booking_created inline (atomic gate in the DB).
  const args = {
    p_channel_account_id: acct.id,
    p_external_booking_id: booking.externalBookingId,
    p_category: booking.category,
    p_check_in: booking.checkIn,
    p_check_out: booking.checkOut,
    p_guest_name: booking.guestName,
    p_phone: booking.phone ?? null,
    p_email: booking.email ?? null,
    p_total_amount: booking.totalAmount ?? 0,
    p_commission_pct: booking.commissionPct ?? 0,
  };

  let result = await db.rpc('fn_guard_and_book', args);
  if (result.error && result.error.code === DEADLOCK) {
    result = await db.rpc('fn_guard_and_book', args); // retry once
  }

  if (result.error) {
    const msg = result.error.message || 'booking failed';
    await db.rpc('fn_sync_queue_complete', { p_id: queueId, p_ok: false, p_error: msg });
    const noAvail = msg.includes('NO_AVAILABILITY');
    // 409 tells the CM the room is gone; other errors are retryable 500s
    // (the queue row keeps the payload for the drainer retry path).
    return NextResponse.json({ error: msg }, { status: noAvail ? 409 : 500 });
  }

  await db.rpc('fn_sync_queue_complete', { p_id: queueId, p_ok: true, p_error: null });

  // Ack upstream (Channex revisions) - best effort; the unacked feed is
  // the backstop if this fails.
  if (adapter.ackEvent && booking.ackRef) {
    try { await adapter.ackEvent(booking.ackRef, acct); } catch { /* feed backstop */ }
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;

  // Crons are daily-only: push availability_update fan-out now, best effort.
  let drain;
  try {
    drain = await drainOnce(5);
  } catch {
    drain = null; // sweep cron will catch it
  }

  return NextResponse.json({
    ok: true,
    reservation_id: row?.reservation_id ?? null,
    created: row?.created ?? null,
    drained: drain ? drain.done : 0,
  });
}
