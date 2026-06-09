// POST /api/crm/close-day — Night-audit "Closing Complete". Session-gated, service-role.
// Snapshots the day's figures into night_audit_log (one canonical row per tenant/day, upserted
// so re-closing refreshes the snapshot + closed_at). The browser NEVER writes this table
// (no INSERT RLS policy) — only this route does, via the service role. The report reads it back
// (tenant-scoped SELECT) and uses closed_at as the cutoff for its post-close "fresh" delta view.
//
// All money math is derived server-side from canonical columns — the client is not trusted.
// Body: { audit_date?: 'YYYY-MM-DD', notes?: string }. Defaults to today (Asia/Dhaka).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const dhakaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const day = (s: unknown) => (typeof s === 'string' ? s.slice(0, 10) : '');
const notBCF = (t: { type?: string | null }) => !/balance carried forward/i.test(t.type ?? '');
const dueOf = (r: { total_amount?: number; discount_amount?: number; discount?: number; paid_amount?: number }) =>
  Math.max(0, (+(r.total_amount || 0)) - (+(r.discount_amount || r.discount || 0)) - (+(r.paid_amount || 0)));

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── session gate (mirror /api/crm/payment) ──
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: srow } = await supabase.from('staff').select('name, role, session_v').eq('id', sess.id).limit(1);
  const staff = srow && srow[0];
  if (!staff || (staff.session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const auditDate = (typeof body.audit_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.audit_date)) ? body.audit_date : dhakaToday();
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

  // ── pull canonical data (tenant-scoped) ──
  const [{ data: txs }, { data: res }, { data: rooms }] = await Promise.all([
    supabase.from('transactions').select('amount, type, fiscal_day, created_at').eq('tenant_id', TENANT),
    supabase.from('reservations').select('check_in, check_out, total_amount, discount_amount, discount, paid_amount, status').eq('tenant_id', TENANT),
    supabase.from('rooms').select('status').eq('tenant_id', TENANT),
  ]);

  const T = txs || [], R = res || [], RM = rooms || [];

  const collections = T
    .filter((t: { type?: string; fiscal_day?: string; created_at?: string }) => notBCF(t) && day(t.fiscal_day || t.created_at) === auditDate)
    .reduce((a: number, t: { amount?: number }) => a + (Number(t.amount) || 0), 0);

  const checkins = R.filter((r: { check_in?: string }) => day(r.check_in) === auditDate).length;
  const checkouts = R.filter((r: { check_out?: string }) => day(r.check_out) === auditDate).length;
  const carriedDues = R.reduce((a: number, r: Parameters<typeof dueOf>[0]) => a + dueOf(r), 0);

  const roomsOccupied = RM.filter((r: { status?: string }) => (r.status || '').toUpperCase() === 'OCCUPIED').length;
  const roomsVacant = RM.filter((r: { status?: string }) => ['AVAILABLE', 'CLEAN', 'VACANT'].includes((r.status || '').toUpperCase())).length;

  const row = {
    audit_date: auditDate,
    closed_at: new Date().toISOString(),
    closed_by: staff.name || 'Staff',
    total_checkins: checkins,
    total_checkouts: checkouts,
    total_collections: collections,
    carried_over_dues: carriedDues,
    rooms_occupied: roomsOccupied,
    rooms_vacant: roomsVacant,
    notes,
    tenant_id: TENANT,
    status: 'closed',
  };

  const { data: saved, error } = await supabase
    .from('night_audit_log')
    .upsert(row, { onConflict: 'tenant_id,audit_date' })
    .select()
    .single();

  if (error) {
    console.error('[crm/close-day] upsert:', error.message);
    return NextResponse.json({ error: 'Could not close the day.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, close: saved });
}
