export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

// DISABLED 2026-07-21 (owner request): the Checkout Reminder email workflow was retired.
// Cron removed from vercel.json and the Settings toggle removed. This handler is kept as a
// hard no-op so any lingering external trigger can never fire wf-checkout-alerts (no emails).
async function run() {
  return NextResponse.json({ disabled: true, workflow: 'checkout-reminder' }, { status: 410 });
}

export const GET = run;
export const POST = run;
