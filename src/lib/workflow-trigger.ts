// Server-side helper that invokes a Supabase Edge Function workflow.
// Used by the /api/agents/* cron routes so Vercel Cron can fire the same
// edge functions the CRM Settings "Run" buttons call.
//
// CREDENTIALS (corrected 2026-08-15): this file used to carry a hardcoded
// legacy HS256 anon JWT as its fallback. That key is now DISABLED in Supabase
// (Option B migration, 2026-07-02) — the only reason the forwarders still
// worked is that their target edge functions run with verify_jwt=false. A
// hardcoded, dead credential that happens to be ignored is not a fallback, so
// it is gone. Resolution order is now env-only:
//   SUPABASE_URL      -> NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY -> NEXT_PUBLIC_SUPABASE_ANON_KEY   (sb_publishable_...)
// Both NEXT_PUBLIC_* vars are set in every Vercel environment, so nothing
// changes operationally. If neither resolves we fail closed with a named
// error rather than firing an unauthenticated request.
// (The old comment claimed the key was "already embedded in crm.html" —
// crm.html was deleted 2026-08-08.)

import { NextResponse } from 'next/server';

// Cron auth guard for /api/agents/* forwarder routes. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
// Fails CLOSED: if CRON_SECRET is unset we return 500 rather than allowing the
// endpoint to run unauthenticated (the edge functions send real guest
// WhatsApp/email blasts and run reports).
export function assertCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

const BASE =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const ANON =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export interface TriggerResult {
  status: number;
  ok: boolean;
  data: unknown;
}

export async function triggerEdgeFunction(
  slug: string,
  body: Record<string, unknown> = {},
): Promise<TriggerResult> {
  // Fail closed, and say which var is missing. Checked here rather than at module
  // scope so a missing env var can never break `next build` — only the call.
  if (!BASE || !ANON) {
    const missing = [!BASE && 'SUPABASE_URL', !ANON && 'SUPABASE_ANON_KEY'].filter(Boolean);
    return {
      status: 500,
      ok: false,
      data: {
        error: `workflow-trigger: ${missing.join(' and ')} not configured`,
        hint: 'Set SUPABASE_URL / SUPABASE_ANON_KEY (or the NEXT_PUBLIC_* equivalents) in the Vercel environment.',
      },
    };
  }
  const r = await fetch(`${BASE}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}
