export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { triggerEdgeFunction, assertCron } from '@/lib/workflow-trigger';

// Vercel Cron: 0 8 * * 1 — forwards to wf-period-reports in weekly mode.
async function run(req: Request) {
  const denied = assertCron(req); if (denied) return denied;
  const res = await triggerEdgeFunction('wf-period-reports', { mode: 'weekly' });
  return NextResponse.json(res.data, { status: res.ok ? 200 : res.status });
}

export const GET = run;
export const POST = run;
