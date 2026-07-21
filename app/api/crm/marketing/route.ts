// /api/crm/marketing — DISABLED 2026-07-21 (owner request).
// The Marketing Studio tab and its two agent crons (marketing-publisher,
// marketing-strategist) were retired. This route is kept as a hard no-op so no
// content_calendar row can be created, approved, or published to Facebook/Instagram.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function disabled() {
  return NextResponse.json({ disabled: true, module: 'marketing' }, { status: 410 });
}

export const GET = disabled;
export const POST = disabled;
