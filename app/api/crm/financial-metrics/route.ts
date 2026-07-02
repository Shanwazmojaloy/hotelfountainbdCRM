// GET /api/crm/financial-metrics — tenant financial summary via the network-level
// secure RPC. Session-gated, service-role. The RPC (get_secure_financial_metrics)
// asserts the caller's role holds 'financials:view' for this tenant BEFORE running
// any aggregation, and throws SQLSTATE 42501 otherwise — so authorization is enforced
// at the database layer, not just in the route. caller_staff_id is the VERIFIED
// session id (never trusted from the client).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';
import { tenantScoped } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 10;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export async function GET(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // ── session gate (mirror /api/crm/close-day) ──
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  // ── secure RPC: DB asserts financials:view for the caller's role in this tenant ──
  const { data, error } = await supabase.rpc('get_secure_financial_metrics', {
    target_tenant_id: TENANT,
    caller_staff_id: sess.id, // verified session id, NOT from the client
  });

  if (error) {
    // 42501 = insufficient_privilege thrown by the RPC's authorization gate
    if (error.code === '42501') {
      return NextResponse.json({ error: 'You do not have permission to view financials.' }, { status: 403 });
    }
    console.error('[crm/financial-metrics] rpc:', error.message);
    return NextResponse.json({ error: 'Could not load financial metrics.' }, { status: 500 });
  }

  // RPC RETURNS TABLE -> supabase returns an array; surface the single row.
  const m = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, metrics: m ?? null });
}
