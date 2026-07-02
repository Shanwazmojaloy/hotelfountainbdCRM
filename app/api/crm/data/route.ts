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
export const maxDuration = 20;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const MAX_LIMIT = 5000;

// Whitelisted resources + the columns a client may sort on (prevents arbitrary order injection).
const RESOURCES: Record<string, { orderCols: Set<string>; defaultOrder: string }> = {
  reservations: { orderCols: new Set(['created_at', 'check_in', 'check_out']), defaultOrder: 'created_at' },
  transactions: { orderCols: new Set(['created_at', 'fiscal_day']),            defaultOrder: 'created_at' },
  guests:       { orderCols: new Set(['name']),                                defaultOrder: 'name' },
};
const ALLOWED_STATUS = new Set(['RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'PENDING']);

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
  const { data: srow, error: sErr } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  // Surfaces PostgREST auth errors (e.g. a rejected tenant JWT) that otherwise
  // masquerade as an expired session — essential while TENANT_JWT_MODE rolls out.
  if (sErr) console.error('[crm/data] staff check error:', sErr.code, sErr.message, sErr.hint ?? '');
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
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

  let query = db.from(resource).select('*');

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

  const { data, error } = await query.order(orderCol, { ascending }).limit(limit);

  if (error) {
    console.error(`[crm/data] ${resource} read:`, error.message);
    return NextResponse.json({ error: 'Could not load data.' }, { status: 500 });
  }
  return NextResponse.json({ rows: data || [] });
}
