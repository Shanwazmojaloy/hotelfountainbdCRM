// ─────────────────────────────────────────────────────────────────────────────
// Lumea — GET /api/agents/audit-purge
//
// Daily cron (vercel.json: "0 0 * * *") that enforces 30-day retention on
// public.audit_logs. Calls the SQL function purge_audit_logs(p_days)
// via service-role REST. Auth: Vercel's automatic CRON_SECRET header.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logEvent } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 30;

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const requestId = req.headers.get('x-request-id');

  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 });
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/purge_audit_logs`, {
      method: 'POST',
      headers: {
        apikey:         SB_KEY,
        Authorization:  `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_days: RETENTION_DAYS }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    if (!r.ok) {
      void logEvent({
        event_type:    'cron_audit_purge',
        action_target: 'GET /api/agents/audit-purge',
        status_code:   r.status,
        result:        'failure',
        duration_ms:   Date.now() - t0,
        request_id:    requestId,
        role:          'cron',
        error:         text.slice(0, 500),
      });
      return NextResponse.json({ error: 'upstream_error', detail: text }, { status: 502 });
    }
    const deleted = Number(text) || 0;

    void logEvent({
      event_type:    'cron_audit_purge',
      action_target: 'audit_logs',
      status_code:   200,
      result:        'success',
      duration_ms:   Date.now() - t0,
      request_id:    requestId,
      role:          'cron',
      payload_summary: { retention_days: RETENTION_DAYS, rows_deleted: deleted },
    });

    return NextResponse.json({ ok: true, retention_days: RETENTION_DAYS, deleted });
  } catch (err) {
    return NextResponse.json({ error: 'internal', detail: String(err) }, { status: 500 });
  }
}
