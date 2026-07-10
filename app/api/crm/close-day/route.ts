// POST /api/crm/close-day — Night-audit "Closing Complete". Session-gated, service-role.
// SINGLE SOURCE OF TRUTH: this route is now a thin orchestrator. It resolves the OPEN
// business day and delegates ALL computation + the night_audit_log upsert to the
// execute_nightly_audit() RPC, which carries the canonical methodology (collections
// excl. BCF, rooms.status occupancy, all-status date counts/dues) PLUS the integer
// guest_ledger tax split (VAT/SC/net) and discrepancy flags. The browser never writes
// this table — only this route does, via the service role.
//
// Body: { audit_date?: 'YYYY-MM-DD', notes?: string }. Defaults to the open business day.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { openBusinessDay } from '@/lib/businessDay';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';
import { start } from 'workflow/api';
import { closeDayChain } from '@/workflows/close-day-chain';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const dhakaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  // ── session gate (mirror /api/crm/payment) ──
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = tenantClient(TENANT); // crm_tenant JWT when TENANT_JWT_MODE=on; RPC granted to crm_tenant
  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('name, role, session_v').eq('id', sess.id).limit(1);
  const staff = srow && srow[0];
  if (!staff || (staff.session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;
  // Manual cash-drawer inputs from the closing form (RPC doesn't compute these).
  const opening_token = Math.max(0, Number(body.opening_token) || 0);
  const payouts = Math.max(0, Number(body.payouts) || 0);

  // ── resolve the OPEN business day (latest closed + 1), unless an explicit
  //    audit_date is passed (re-close of a past day) ──
  const { data: closes } = await db.from('night_audit_log').select('audit_date, status');
  const openDay = openBusinessDay(closes, dhakaToday());
  const auditDate = (typeof body.audit_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.audit_date)) ? body.audit_date : openDay;

  // ── delegate all computation + upsert to the canonical RPC (service role) ──
  const { data: rpc, error } = await supabase.rpc('execute_nightly_audit', {
    target_tenant_id: TENANT,
    p_audit_date: auditDate,
    p_closed_by: staff.name || 'Staff',
    p_notes: notes,
  });

  if (error) {
    console.error('[crm/close-day] rpc:', error.message);
    return NextResponse.json({ error: 'Could not close the day.' }, { status: 500 });
  }
  if (rpc && rpc.success === false) {
    console.error('[crm/close-day] audit failed:', rpc.error, rpc.sqlstate);
    return NextResponse.json({ error: 'Could not close the day.' }, { status: 500 });
  }

  // Persist the manual cash-drawer inputs so closed-day re-downloads reconstruct the exact
  // Closing Balance (Opening Token + Cash - Payouts). The RPC owns every computed column;
  // this UPDATE only touches the two manual ones.
  await db.from('night_audit_log').update({ opening_token, payouts }).eq('audit_date', auditDate);

  // Return the persisted row (preserves the existing { ok, close } response shape).
  const { data: saved } = await db
    .from('night_audit_log')
    .select('*')
    .eq('audit_date', auditDate)
    .single();

  // Fire the post-close snapshot chain (verify -> shadow audit -> owner summary
  // email -> 9AM Dhaka dues follow-up). Fire-and-forget: an enqueue failure must
  // NEVER fail the close itself - the RPC already persisted the audit. The chain
  // is strictly read-only on money tables (see src/workflows/close-day-chain.ts).
  try {
    await start(closeDayChain, [{ auditDate, tenantId: TENANT, closedBy: staff.name || 'Staff' }]);
  } catch (e) {
    console.error('[crm/close-day] chain enqueue failed (close still OK):', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, close: saved, audit: rpc });
}
