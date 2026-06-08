export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { triggerEdgeFunction } from '@/lib/workflow-trigger';

// Vercel Cron: 30 10 * * * — forwards to wf-checkout-alerts in reminder mode.
async function run() {
  const res = await triggerEdgeFunction('wf-checkout-alerts', { mode: 'reminder' });
  return NextResponse.json(res.data, { status: res.ok ? 200 : res.status });
}

export const GET = run;
export const POST = run;
