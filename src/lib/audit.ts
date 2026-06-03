// ─────────────────────────────────────────────────────────────────────────────
// Lumea — Centralized Audit Logger
//
// Two transports, both fire-and-forget:
//   1. STDOUT  → single-line JSON, captured by Vercel runtime logs
//   2. SUPABASE → public.audit_logs via service-role REST insert
//
// Never blocks the request path. Failures are swallowed (logged to stderr)
// so an audit outage cannot 500 a hotel transaction.
//
// Usage:
//   import { logEvent, withAudit } from '@/lib/audit';
//
//   // Direct call:
//   await logEvent({
//     event_type: 'record_edit',
//     user_id:    'shan@fountainbd.com',
//     role:       'owner',
//     action_target: 'reservations:7f3a…',
//     status_code: 200,
//     payload_summary: { field: 'balance_due', from: 13600, to: 0 },
//   });
//
//   // Route wrapper (recommended):
//   export const POST = withAudit('admin_onboard_tenant', async (req) => { … });
//
// ─────────────────────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sanitizePayload } from './audit-sanitize';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type AuditResult = 'success' | 'failure' | 'partial' | 'denied';

export interface AuditEvent {
  event_type:       string;
  user_id?:         string | null;
  role?:            string | null;
  action_target?:   string | null;
  status_code?:     number | null;
  result?:          AuditResult;
  duration_ms?:     number | null;
  ip?:              string | null;
  user_agent?:      string | null;
  tenant_id?:       string | null;
  request_id?:      string | null;
  payload_summary?: Record<string, unknown>;
  error?:           string | null;
}

// ── Internal: write to Supabase via service-role REST ────────────────────────

async function writeToSupabase(ev: AuditEvent): Promise<void> {
  if (!SB_URL || !SB_KEY) return; // logger silently no-ops if misconfigured

  const row = {
    event_type:      ev.event_type,
    user_id:         ev.user_id        ?? null,
    role:            ev.role           ?? null,
    action_target:   ev.action_target  ?? null,
    status_code:     ev.status_code    ?? null,
    result:          ev.result         ?? 'success',
    duration_ms:     ev.duration_ms    ?? null,
    ip:              ev.ip             ?? null,
    user_agent:      ev.user_agent     ?? null,
    tenant_id:       ev.tenant_id      ?? null,
    request_id:      ev.request_id     ?? null,
    payload_summary: sanitizePayload(ev.payload_summary ?? {}),
    error:           ev.error          ?? null,
  };

  try {
    await fetch(`${SB_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        apikey:          SB_KEY,
        Authorization:   `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json',
        Prefer:          'return=minimal',
      },
      body: JSON.stringify(row),
      // 4s ceiling — audit must never stall a request
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    // Last-resort stderr so we still see audit failures in Vercel logs
    console.error('[audit] supabase insert failed:', (err as Error).message);
  }
}

// ── Public: fire-and-forget event ────────────────────────────────────────────

export async function logEvent(ev: AuditEvent): Promise<void> {
  const enriched: AuditEvent = {
    ...ev,
    payload_summary: sanitizePayload(ev.payload_summary ?? {}),
  };

  // Transport 1: stdout (single-line JSON, ISO timestamp).
  const stdoutLine = {
    timestamp: new Date().toISOString(),
    ...enriched,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(stdoutLine));

  // Transport 2: Supabase. Awaited but bounded — see writeToSupabase timeout.
  await writeToSupabase(enriched);
}

// ── Public: route wrapper ────────────────────────────────────────────────────
// Wraps a Next.js route handler. Captures status, duration, error, and a
// shallow body summary (after sanitization). The wrapped handler is called
// exactly as before — no behavior change beyond logging.

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<Response> | Response;

export function withAudit(eventType: string, handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    const started   = Date.now();
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const tenantId  = req.headers.get('x-tenant-id') || null;
    const userAgent = req.headers.get('user-agent');
    const ip        = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    // Best-effort body capture for POST/PUT/PATCH. Clone so handler can still read.
    let bodySummary: Record<string, unknown> = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        const cloned = req.clone();
        const text   = await cloned.text();
        if (text) {
          try { bodySummary = JSON.parse(text); }
          catch { bodySummary = { _raw_len: text.length }; }
        }
      } catch { /* ignore body read failures */ }
    }

    let res: Response;
    let resultStatus: AuditResult = 'success';
    let errorMsg: string | null = null;

    try {
      res = await handler(req, ctx);
      if (res.status >= 500) resultStatus = 'failure';
      else if (res.status === 401 || res.status === 403) resultStatus = 'denied';
      else if (res.status >= 400) resultStatus = 'partial';
    } catch (err) {
      errorMsg = (err as Error).message ?? String(err);
      resultStatus = 'failure';
      res = NextResponse.json({ error: 'Internal error', request_id: requestId }, { status: 500 });
    }

    // Fire-and-forget — do not await; the response goes out first.
    void logEvent({
      event_type:    eventType,
      action_target: `${req.method} ${new URL(req.url).pathname}`,
      status_code:   res.status,
      result:        resultStatus,
      duration_ms:   Date.now() - started,
      ip,
      user_agent:    userAgent,
      tenant_id:     tenantId,
      request_id:    requestId,
      payload_summary: bodySummary,
      error:         errorMsg,
    });

    // Bubble request_id into the response so the client can correlate.
    res.headers.set('x-request-id', requestId);
    return res;
  };
}
