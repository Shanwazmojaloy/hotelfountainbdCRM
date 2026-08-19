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

// Access state (demo clock / subscription clock) rides on this poll rather than getting
// its own timer — every open tab already hits this route every 2 min, so a banner needs
// no new traffic. Cached PER TENANT for 60s, so N tabs cost one RPC a minute, not N.
// The home tenant short-circuits before any DB call: it is neither a demo nor a
// subscriber, and it is most of the traffic.
const HOME_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const ACCESS_TTL_MS = 60_000;
const accessCache = new Map<string, { a: unknown; ts: number }>();

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
  // Access state for the in-app banner. Best-effort: a failure here must never break the
  // session refresh, so it falls through to no banner rather than throwing.
  let access: unknown = null;
  const tid = sess.tenant_id || HOME_TENANT;
  if (SB_SERVICE_KEY && tid !== HOME_TENANT) {
    const cachedA = accessCache.get(tid);
    if (cachedA && Date.now() - cachedA.ts < ACCESS_TTL_MS) {
      access = cachedA.a;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data } = await sb.rpc('tenant_access_state', { p_tenant_id: tid });
        if (data) {
          access = data;
          if (accessCache.size > 500) accessCache.clear();
          accessCache.set(tid, { a: data, ts: Date.now() });
        }
      } catch { /* non-fatal — no banner is better than a broken session refresh */ }
    }
  }

  const res = NextResponse.json({ ok: true, access });
  // Preserve tenant_id on refresh — dropping it silently rebinds the session to the env
  // fallback tenant on every route (harmless single-tenant, cross-tenant bug at tenant #2).
  res.headers.set('Set-Cookie', sessionCookieHeader(signSession({ id: sess.id, role: sess.role, session_v: sess.session_v, tenant_id: sess.tenant_id })));
  return res;
}
