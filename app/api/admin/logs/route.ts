// ─────────────────────────────────────────────────────────────────────────────
// Lumea — GET /api/admin/logs
//
// Read-only window over public.audit_logs for the admin dashboard.
// Protected by ADMIN_SECRET (Bearer token) — same pattern as onboard-tenant.
//
// Query params (all optional):
//   ?since=ISO          default: start of current UTC day
//   ?until=ISO          default: now
//   ?event_type=str     filter on exact event_type
//   ?user_id=str        filter on user_id
//   ?tenant_id=uuid     filter on tenant_id
//   ?result=str         success | failure | partial | denied
//   ?limit=int          default 200, max 1000
//   ?offset=int         default 0
//
// Returns: { ok: true, count, rows: [...] }
// Service role read — RLS is bypassed.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!SB_URL || !SB_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const since      = url.searchParams.get('since')      || startOfDay.toISOString();
  const until      = url.searchParams.get('until')      || new Date().toISOString();
  const eventType  = url.searchParams.get('event_type') || '';
  const userId     = url.searchParams.get('user_id')    || '';
  const tenantId   = url.searchParams.get('tenant_id')  || '';
  const result     = url.searchParams.get('result')     || '';
  const limit      = Math.min(parseInt(url.searchParams.get('limit')  || '200', 10) || 200, 1000);
  const offset     = Math.max(parseInt(url.searchParams.get('offset') || '0',   10) || 0,   0);

  // Build PostgREST query
  const params: string[] = [
    'select=*',
    `ts=gte.${encodeURIComponent(since)}`,
    `ts=lte.${encodeURIComponent(until)}`,
    'order=ts.desc',
    `limit=${limit}`,
    `offset=${offset}`,
  ];
  if (eventType) params.push(`event_type=eq.${encodeURIComponent(eventType)}`);
  if (userId)    params.push(`user_id=eq.${encodeURIComponent(userId)}`);
  if (tenantId)  params.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`);
  if (result)    params.push(`result=eq.${encodeURIComponent(result)}`);

  const reqUrl = `${SB_URL}/rest/v1/audit_logs?${params.join('&')}`;

  let rows: unknown[] = [];
  try {
    const r = await fetch(reqUrl, {
      headers: {
        apikey:        SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer:        'count=exact',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: 'upstream_error', detail: text }, { status: 502 });
    }
    rows = await r.json();
  } catch (err) {
    return NextResponse.json({ error: 'internal', detail: String(err) }, { status: 500 });
  }

  return NextResponse.json({
    ok:    true,
    count: rows.length,
    window: { since, until },
    rows,
  });
}
