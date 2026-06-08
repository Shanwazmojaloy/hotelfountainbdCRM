export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { triggerEdgeFunction } from '@/lib/workflow-trigger';

// Vercel Cron: 30 12 * * * — forwards to wf-checkout-alerts in overdue mode.
async function run() {
  const res = await triggerEdgeFunction('wf-checkout-alerts', { mode: 'overdue' });
  return NextResponse.json(res.data, { status: res.ok ? 200 : res.status });
}

export const GET = run;
export const POST = run;
