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

export async function GET(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ ok: false, error: 'No session' }, { status: 401 });
  if (SB_SERVICE_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase.from('staff').select('session_v').eq('id', sess.id).limit(1);
    if (!data || !data[0] || (data[0].session_v || 1) !== sess.session_v) {
      return NextResponse.json({ ok: false, error: 'Session revoked' }, { status: 401 });
    }
    // Presence heartbeat — Settings→Staff shows "Active" when last_seen_at is fresh (≤5 min).
    // Best-effort: a failed stamp must never break the session refresh.
    try { await supabase.from('staff').update({ last_seen_at: new Date().toISOString() }).eq('id', sess.id); } catch { /* non-fatal */ }
  }
  const res = NextResponse.json({ ok: true });
  // Preserve tenant_id on refresh — dropping it silently rebinds the session to the env
  // fallback tenant on every route (harmless single-tenant, cross-tenant bug at tenant #2).
  res.headers.set('Set-Cookie', sessionCookieHeader(signSession({ id: sess.id, role: sess.role, session_v: sess.session_v, tenant_id: sess.tenant_id })));
  return res;
}
