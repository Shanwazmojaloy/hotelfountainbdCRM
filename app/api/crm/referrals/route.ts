// GET/POST /api/crm/referrals — the referral_queue SENDER path (added 2026-08-09).
//
// Why this exists: agent_referral_queue_builder (pg_cron */30) has been queuing post-checkout
// referral messages since 2026-05-12, but NOTHING ever consumed the queue — 210 rows sat at
// sent=false for three months. There is no WhatsApp Business API on this stack, so the send
// channel is a one-tap wa.me deep link opened by the front desk; this route serves the queue
// and records the send.
//
// Security: same shape as /api/crm/task — signed session cookie + session_v re-check, then
// reads/writes on the tenant-scoped client. referral_queue carries guest PII (name + phone),
// so anon/authenticated grants were revoked 2026-08-09 and a tenant_isolation policy added.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

// Front desk + management only. Housekeeping / restaurant roles never see guest phone numbers.
const SEND_ROLES = new Set(['owner', 'admin', 'manager', 'front_desk_supervisor', 'receptionist']);

async function auth(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (!SB_SERVICE_KEY) return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) };

  const role = String(sess.role || '').trim().toLowerCase();
  if (!SEND_ROLES.has(role)) {
    return { error: NextResponse.json({ error: 'Not permitted.' }, { status: 403 }) };
  }

  const TENANT = sess.tenant_id || ENV_TENANT;
  const db = tenantScoped(tenantClient(TENANT), TENANT);

  // Honour Logout All Devices: the cookie's session_v must still match the DB.
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return { error: NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 }) };
  }
  return { db, sess };
}

// GET — the unsent queue, newest checkout first. `?all=1` includes already-sent rows.
export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (a.error) return a.error;

  const includeSent = req.nextUrl.searchParams.get('all') === '1';
  let q = a.db
    .from('referral_queue')
    .select('id,guest_name,phone,room,checkout_date,message,sent,sent_at,converted')
    .order('checkout_date', { ascending: false })
    .limit(500);
  if (!includeSent) q = q.eq('sent', false);

  const { data, error } = await q;
  if (error) {
    console.error('[crm/referrals] select error:', error.message);
    return NextResponse.json({ error: 'Could not load referrals.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: data || [] });
}

// POST { id } — mark one referral as sent. Idempotent: re-posting an already-sent row is a
// no-op that still returns ok, so a double-tap on a flaky phone connection cannot corrupt state.
export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (a.error) return a.error;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const { data, error } = await a.db
    .from('referral_queue')
    .update({ sent: true, sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('sent', false)
    .select('id');

  if (error) {
    console.error('[crm/referrals] update error:', error.message);
    return NextResponse.json({ error: 'Could not mark as sent.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: (data || []).length });
}
