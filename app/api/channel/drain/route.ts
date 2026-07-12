// [Hotel-CRM] Channel Manager Phase 2 - queue drain sweep
// GET /api/channel/drain  (Vercel cron, daily; also callable manually)
// CRON_SECRET Bearer guard, fail closed - same invariant as /api/agents/*.
// Real-time draining rides on webhook traffic; this sweep catches retries,
// overbook alerts from the nightly DB reconcile, and anything stranded.

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { drainOnce, notifyReviews, pollInboundFeeds } from '@/lib/channel/drain';

export const runtime = 'nodejs';
export const maxDuration = 60;

function drainKeyOk(req: Request): boolean {
  const secret = process.env.CHANNEL_WEBHOOK_SECRET;
  const got = req.headers.get('x-drain-key');
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  // Two callers: Vercel cron (Bearer CRON_SECRET) and the Supabase pg_cron
  // 15-min drain (x-drain-key = channel shared secret). Both fail closed.
  const authHeader = req.headers.get('authorization');
  const bearerOk =
    !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!bearerOk && !drainKeyOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Up to 3 passes of 25 while there is work, inside maxDuration.
  const totals = { claimed: 0, done: 0, failed: 0, errors: [] as string[] };
  for (let pass = 0; pass < 3; pass++) {
    const r = await drainOnce(25);
    totals.claimed += r.claimed;
    totals.done += r.done;
    totals.failed += r.failed;
    totals.errors.push(...r.errors);
    if (r.claimed < 25) break; // queue exhausted
  }

  // Feed backstop: pick up lost webhooks / unacked revisions, then drain
  // any outbound rows their processing enqueued.
  const feed = await pollInboundFeeds();
  if (feed.processed > 0) {
    const r = await drainOnce(25);
    totals.claimed += r.claimed;
    totals.done += r.done;
    totals.failed += r.failed;
    totals.errors.push(...r.errors);
  }
  totals.errors.push(...feed.errors);

  // Surface held REVIEW items to the owner (once per row).
  let reviewsNotified = 0;
  try { reviewsNotified = await notifyReviews(); } catch (e: any) {
    totals.errors.push(`notify: ${e?.message || e}`);
  }

  return NextResponse.json({
    ok: true,
    feed_processed: feed.processed,
    reviews_notified: reviewsNotified,
    ...totals,
  });
}
