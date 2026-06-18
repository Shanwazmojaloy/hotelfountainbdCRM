// GET /api/crm/data?resource=reservations|transactions|guests[&order=col.dir][&limit=N]
//
// C3 — session-gated READ route for the sensitive tables. The browser uses the PUBLIC anon
// key, and RLS on these tables only isolates by tenant (not by authentication), so a direct
// anon PostgREST read exposes all guest PII + financials WITHOUT a login. This route verifies
// the signed staff session and reads on the SERVICE ROLE, tenant-scoped to the SIGNED session.
// Once every SPA read is migrated here, anon SELECT on these tables is revoked.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 20;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const MAX_LIMIT = 5000;

// Whitelisted resources + the columns a client may sort on (prevents arbitrary order injection).
const RESOURCES: Record<string, { orderCols: Set<string>; defaultOrder: string }> = {
  reservations: { orderCols: new Set(['created_at', 'check_in', 'check_out']), defaultOrder: 'created_at' },
  transactions: { orderCols: new Set(['created_at', 'fiscal_day']),            defaultOrder: 'created_at' },
  guests:       { orderCols: new Set(['created_at', 'name']),                  defaultOrder: 'created_at' },
};

export async function GET(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: srow } = await supabase.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }
  const TENANT = sess.tenant_id || ENV_TENANT;

  const { searchParams } = new URL(req.url);
  const resource = String(searchParams.get('resource') || '');
  const cfg = RESOURCES[resource];
  if (!cfg) return NextResponse.json({ error: 'Unknown resource.' }, { status: 400 });

  // order = "col.dir" (dir optional, defaults desc). Column must be whitelisted for this resource.
  const [orderColRaw, orderDirRaw] = String(searchParams.get('order') || '').split('.');
  const orderCol = cfg.orderCols.has(orderColRaw) ? orderColRaw : cfg.defaultOrder;
  const ascending = orderDirRaw === 'asc';

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || String(MAX_LIMIT), 10) || MAX_LIMIT));

  const { data, error } = await supabase
    .from(resource)
    .select('*')
    .eq('tenant_id', TENANT)
    .order(orderCol, { ascending })
    .limit(limit);

  if (error) {
    console.error(`[crm/data] ${resource} read:`, error.message);
    return NextResponse.json({ error: 'Could not load data.' }, { status: 500 });
  }
  return NextResponse.json({ rows: data || [] });
}
