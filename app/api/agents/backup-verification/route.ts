export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { triggerEdgeFunction } from '@/lib/workflow-trigger';

// Vercel Cron: 0 23 * * 0 — forwards to the wf-backup-verify edge function.
async function run() {
  const res = await triggerEdgeFunction('wf-backup-verify', {});
  return NextResponse.json(res.data, { status: res.ok ? 200 : res.status });
}

export const GET = run;
export const POST = run;
