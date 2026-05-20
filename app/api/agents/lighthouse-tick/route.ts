/**
 * /api/agents/lighthouse-tick — Vercel cron forwarder (REDUNDANT, kept for resilience)
 *
 * PRIMARY trigger is pg_cron job 'lighthouse-summary-nightly' inside Supabase,
 * which fires at 19:00 UTC and calls the Edge Function via pg_net directly.
 *
 * This Vercel cron also fires at 19:00 UTC as a backup. Both succeeding is fine —
 * the Edge Function upserts on (tenant_id, snapshot_date) UNIQUE, so the second
 * call just overwrites the first with identical data.
 *
 * Auth model:
 *   - Caller (Vercel cron OR manual curl) must present `Authorization: Bearer ${process.env.CRON_SECRET}`
 *   - We forward to Supabase Edge Function with a SEPARATE hardcoded secret
 *     that matches the embedded value in supabase/functions/lighthouse-summary/index.ts.
 *   - Why hardcoded: Vercel's CRON_SECRET is marked Sensitive and cannot be
 *     retrieved to mirror into Supabase Edge Function Secrets. The Edge Function
 *     embeds the value as a const fallback for the same reason.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Matches the embedded CRON_SECRET inside supabase/functions/lighthouse-summary/index.ts.
// Rotate both files together if you change this.
const SUPABASE_FN_SECRET = '53qwrP5uOQpNTsbrlDIHfOHH1ZDNIL6dAIFnOoIywvcx';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/lighthouse-summary`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_FN_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
