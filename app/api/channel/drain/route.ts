// [Hotel-CRM] Channel Manager Phase 2 - queue drain sweep
// GET /api/channel/drain  (Vercel cron, daily; also callable manually)
// CRON_SECRET Bearer guard, fail closed - same invariant as /api/agents/*.
// Real-time draining rides on webhook traffic; this sweep catches retries,
// overbook alerts from the nightly DB reconcile, and anything stranded.

import { NextResponse } from 'next/server';
import { drainOnce } from '@/lib/channel/drain';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  return NextResponse.json({ ok: true, ...totals });
}
