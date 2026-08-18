// GET /api/crm/data?resource=reservations|transactions|guests[&order=col.dir][&limit=N]
//
// C3 — session-gated READ route for the sensitive tables. The browser uses the PUBLIC anon
// key, and RLS on these tables only isolates by tenant (not by authentication), so a direct
// anon PostgREST read exposes all guest PII + financials WITHOUT a login. This route verifies
// the signed staff session and reads on the SERVICE ROLE, tenant-scoped to the SIGNED session.
// Once every SPA read is migrated here, anon SELECT on these tables is revoked.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Bounds worst-case latency: without this, a stalled PostgREST/network call
// hangs until Vercel kills the function at maxDuration (raw 504, no body).
// With it, the route fails fast with a clear, retryable JSON error instead.
// 8s (was 15s, 2026-07-30): with functions now colocated with Supabase in iad1, a
// healthy query returns in <1s — a 15s hang just held a Fluid instance hostage and
// amplified post-deploy queueing. Fail fast; the client retries.
const QUERY_TIMEOUT_MS = 8_000;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const MAX_LIMIT = 5000;

// Whitelisted resources + the columns a client may sort on (prevents arbitrary order injection).
const RESOURCES: Record<string, { orderCols: Set<string>; defaultOrder: string }> = {
  reservations: { orderCols: new Set(['created_at', 'check_in', 'check_out']), defaultOrder: 'created_at' },
  transactions: { orderCols: new Set(['created_at', 'fiscal_day']),            defaultOrder: 'created_at' },
  guests:       { orderCols: new Set(['name']),                                defaultOrder: 'name' },
  // C3 slice 1 (2026-08-17). WorkflowMonitor was the ONLY reader of workflow_runs
  // and read it straight off the anon key, so its 727 rows were readable by anyone
  // holding the publishable key. Routing it here is what lets anon SELECT on
  // workflow_runs be revoked - see supabase/migrations/20260817_revoke_anon_read_workflow_runs_s5.sql
  workflow_runs:{ orderCols: new Set(['ran_at']),                                defaultOrder: 'ran_at' },
  // C3 slice 2 (2026-08-17). Housekeeping.jsx read this straight off the anon key.
  housekeeping_tasks: { orderCols: new Set(['created_at']),                     defaultOrder: 'created_at' },
};
const ALLOWED_STATUS = new Set(['RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'PENDING']);

// PERF (2026-07-30): the staff.session_v probe ran on EVERY data request — the Header
// polls fire 2-3 of these per minute per open tab, each serializing an extra DB round
// trip in FRONT of the actual read. session_v only changes on logout/password reset,
// so a short per-instance cache is safe. The cache ONLY short-circuits the happy path
// (cached v matches the cookie); any mismatch always re-verifies against the DB, so a
// fresh re-login is never falsely 401'd. Worst case: a just-revoked session keeps
// reading for <= 15s on an already-warm instance.
const SESS_TTL_MS = 15_000;
const sessCache = new Map<string, { v: number; ts: number }>();

export async function GET(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT;
  // JWT-switch pilot route: with TENANT_JWT_MODE=on this client runs as the
  // crm_tenant role under RLS; otherwise it's the plain service-role client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = tenantClient(TENANT);
  const db = tenantScoped(supabase, TENANT);

  const timeoutSignal = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);

  const sessKey = `${TENANT}:${sess.id}`;
  const cached = sessCache.get(sessKey);
  let dbSessV: number | null =
    cached && Date.now() - cached.ts < SESS_TTL_MS ? cached.v : null;
  // Cache miss OR cached value disagrees with the cookie -> always re-verify against
  // the DB (never 401 off a stale cache entry — e.g. right after a re-login bumps v).
  if (dbSessV === null || dbSessV !== sess.session_v) {
    let srow;
    try {
      const res = await db.from('staff').select('session_v').eq('id', sess.id).limit(1).abortSignal(timeoutSignal());
      srow = res.data;
      if (res.error) console.error('[crm/data] staff check error:', res.error.code, res.error.message, res.error.hint ?? '');
    } catch (e) {
      console.error('[crm/data] staff check timed out/failed:', e instanceof Error ? e.message : String(e));
      return NextResponse.json({ error: 'Database timeout — please retry.' }, { status: 504 });
    }
    dbSessV = srow && srow[0] ? (srow[0].session_v || 1) : null;
    if (dbSessV !== null) {
      if (sessCache.size > 500) sessCache.clear(); // tiny staff table; hard cap just in case
      sessCache.set(sessKey, { v: dbSessV, ts: Date.now() });
    }
  }
  // Surfaces PostgREST auth errors (e.g. a rejected tenant JWT) that otherwise
  // masquerade as an expired session — essential while TENANT_JWT_MODE rolls out.
  if (dbSessV === null || dbSessV !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resource = String(searchParams.get('resource') || '');
  const cfg = RESOURCES[resource];
  if (!cfg) return NextResponse.json({ error: 'Unknown resource.' }, { status: 400 });

  // order = "col.dir" (dir optional, defaults desc). Column must be whitelisted for this resource.
  const [orderColRaw, orderDirRaw] = String(searchParams.get('order') || '').split('.');
  const orderCol = cfg.orderCols.has(orderColRaw) ? orderColRaw : cfg.defaultOrder;
  const ascending = orderDirRaw === 'asc';

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || String(MAX_LIMIT), 10) || MAX_LIMIT));

  // Optional column projection: ?cols=id,name — trims payload for big list reads (e.g. the
  // Reservations tab only needs id+name from guests). Validated to a safe token charset;
  // falls back to '*' if empty/invalid. Backward-compatible: callers that omit it get '*'.
  const colsRaw = String(searchParams.get('cols') || '').trim();
  const cols = /^[a-z0-9_]+(,[a-z0-9_]+)*$/.test(colsRaw) ? colsRaw : '*';
  let query = db.from(resource).select(cols);

  // Optional safe filters. `ids` = UUID CSV → .in('id', …); `fiscal_day` (transactions only) → .eq.
  const idsParam = searchParams.get('ids');
  if (idsParam != null) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter((s) => /^[0-9a-fA-F-]{36}$/.test(s));
    if (!ids.length) return NextResponse.json({ rows: [] });
    query = query.in('id', ids);
  }
  const fiscalDay = searchParams.get('fiscal_day');
  if (fiscalDay && resource === 'transactions') query = query.eq('fiscal_day', fiscalDay);

  // status filters (reservations): ?status=PENDING (eq) or ?status_in=A,B,C (in). Validated.
  const statusEq = searchParams.get('status');
  if (statusEq && ALLOWED_STATUS.has(statusEq.toUpperCase())) query = query.eq('status', statusEq.toUpperCase());
  const statusIn = searchParams.get('status_in');
  if (statusIn) {
    const ss = statusIn.split(',').map((s) => s.trim().toUpperCase()).filter((s) => ALLOWED_STATUS.has(s));
    if (ss.length) query = query.in('status', ss);
  }
  // guest autocomplete: ?q=text → ilike name/phone (sanitized to keep PostgREST or-syntax intact).
  const q = searchParams.get('q');
  if (q && resource === 'guests') {
    const safe = q.replace(/[^a-zA-Z0-9 @.+_-]/g, '').slice(0, 40);
    if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  let data, error;
  try {
    ({ data, error } = await query.order(orderCol, { ascending }).limit(limit).abortSignal(timeoutSignal()));
  } catch (e) {
    console.error(`[crm/data] ${resource} read timed out:`, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'Database timeout — please retry.' }, { status: 504 });
  }

  if (error) {
    console.error(`[crm/data] ${resource} read:`, error.message);
    return NextResponse.json({ error: 'Could not load data.' }, { status: 500 });
  }
  return NextResponse.json({ rows: data || [] });
}
