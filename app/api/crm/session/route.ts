// GET /api/crm/session - sliding-session refresh. Re-issues the HttpOnly lumea_sess cookie
// with a fresh window so active staff never get logged out mid-shift. Honors session_v
// (Logout-All): a revoked/rotated session is NOT refreshed and returns 401.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession, signSession, sessionCookieHeader } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 10;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// PERF (2026-07-30): this route is polled every 60s by EVERY open tab, and it ran a
// session_v read + an AWAITED last_seen_at write per poll — two serial DB round trips
// on the hot path. Same treatment as /api/crm/data: short session_v cache that only
// short-circuits the happy path (mismatch always re-verifies, so Logout-All still
// works within <= 15s), and the presence heartbeat is throttled to one write per
// 60s per staff member (Settings->Staff "Active" needs <= 5 min freshness).
const SESS_TTL_MS = 15_000;
const sessCache = new Map<string, { v: number; ts: number }>();
const HEARTBEAT_MS = 60_000;
const lastBeat = new Map<string, number>();

export async function GET(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ ok: false, error: 'No session' }, { status: 401 });
  if (SB_SERVICE_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const key = `${sess.tenant_id || ''}:${sess.id}`;
    const cached = sessCache.get(key);
    let dbV: number | null = cached && Date.now() - cached.ts < SESS_TTL_MS ? cached.v : null;
    if (dbV === null || dbV !== sess.session_v) {
      const { data } = await supabase.from('staff').select('session_v').eq('id', sess.id).limit(1);
      dbV = data && data[0] ? (data[0].session_v || 1) : null;
      if (dbV !== null) {
        if (sessCache.size > 500) sessCache.clear();
        sessCache.set(key, { v: dbV, ts: Date.now() });
      }
    }
    if (dbV === null || dbV !== sess.session_v) {
      return NextResponse.json({ ok: false, error: 'Session revoked' }, { status: 401 });
    }
    // Presence heartbeat — Settings→Staff shows "Active" when last_seen_at is fresh (≤5 min).
    // Best-effort: a failed stamp must never break the session refresh.
    if ((lastBeat.get(key) || 0) < Date.now() - HEARTBEAT_MS) {
      lastBeat.set(key, Date.now());
      try { await supabase.from('staff').update({ last_seen_at: new Date().toISOString() }).eq('id', sess.id); } catch { /* non-fatal */ }
    }
  }
  const res = NextResponse.json({ ok: true });
  // Preserve tenant_id on refresh — dropping it silently rebinds the session to the env
  // fallback tenant on every route (harmless single-tenant, cross-tenant bug at tenant #2).
  res.headers.set('Set-Cookie', sessionCookieHeader(signSession({ id: sess.id, role: sess.role, session_v: sess.session_v, tenant_id: sess.tenant_id })));
  return res;
}
