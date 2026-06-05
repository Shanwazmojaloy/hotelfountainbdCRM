import { NextResponse } from 'next/server';

// Lightweight, self-hosted client-error sink — no Sentry, no third-party account,
// no next.config / CSP rewrite. Client runtime errors POST here and are written to
// the SAME public.audit_logs table the admin dashboard already reads, as
// event_type='client_error'. This is BEST-EFFORT telemetry: if the write fails we
// log server-side and still return ok, so the error reporter can never itself
// surface an error to the guest/staff.

export const runtime = 'nodejs';
export const maxDuration = 15;

const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX = 4000; // cap any single field so a runaway stack can't bloat the table
const clip = (v: unknown, n = MAX) => (typeof v === 'string' ? v.slice(0, n) : v == null ? null : String(v).slice(0, n));

export async function POST(req: Request) {
  // Always resolve to 200 — telemetry must never break the page it is reporting on.
  try {
    if (!SB_URL || !SB_KEY) return NextResponse.json({ ok: true, stored: false });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore malformed */ }

    const ipHeader = req.headers.get('x-forwarded-for') || '';
    const ip = ipHeader.split(',')[0].trim() || null;
    const ua = clip(req.headers.get('user-agent'), 512);

    const message = clip(body.message) || 'Unknown client error';
    const stack = clip(body.stack);
    const source = clip(body.source, 512);   // file:line:col or page URL
    const kind = clip(body.kind, 64) || 'error'; // 'error' | 'unhandledrejection'

    const row = {
      event_type: 'client_error',
      result: 'failure',
      action_target: clip(body.url, 512) || source || 'crm-client',
      error: stack ? `${message}\n${stack}` : message,
      payload: {
        kind,
        source,
        url: clip(body.url, 512),
        appVersion: clip(body.appVersion, 128),
        ts_client: clip(body.ts_client, 64),
      },
      ip,
      user_agent: ua,
      tenant_id: TENANT,
    };

    const r = await fetch(`${SB_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok) {
      console.error('[/api/client-error] audit_logs insert failed:', r.status, await r.text());
      return NextResponse.json({ ok: true, stored: false });
    }
    return NextResponse.json({ ok: true, stored: true });
  } catch (e) {
    console.error('[/api/client-error] unexpected:', e);
    return NextResponse.json({ ok: true, stored: false });
  }
}
