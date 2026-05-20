/**
 * /api/agents/lighthouse-tick — Vercel cron forwarder
 *
 * Fires daily at 19:00 UTC (01:00 BDT next day). Forwards to the
 * Supabase Edge Function `lighthouse-summary` with service auth so the
 * heavy aggregation + Haiku call runs close to the database.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/lighthouse-summary`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
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
