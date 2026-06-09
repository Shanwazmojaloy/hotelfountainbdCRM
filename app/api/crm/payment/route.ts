// POST /api/crm/payment — Phase 3 MONEY route. Mirrors RecordPaymentModal exactly:
// derive net bill server-side, insert into `transactions` with the client idempotency_key
// (the dual-write trigger mirrors to payment_transactions; uq indexes + key-aware guard block
// duplicates), treat 23505 as success, then bump reservations.paid_amount floored at the net
// bill. Session-gated. Body: { reservation_id, amount, type, fiscal_day, idempotency_key }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: srow } = await supabase.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const reservationId = body.reservation_id;
  const a = +(body.amount as number);
  const type = (typeof body.type === 'string' && body.type) || 'Room Payment (Cash)';
  const fiscalDay = (typeof body.fiscal_day === 'string' && body.fiscal_day) || null;
  const idempotencyKey = (typeof body.idempotency_key === 'string' && body.idempotency_key) || crypto.randomUUID();
  if (!reservationId) return NextResponse.json({ error: 'Missing reservation_id.' }, { status: 400 });
  if (!a || a <= 0) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 });

  // Derive bill math server-side (do not trust the client).
  const { data: rrows } = await supabase.from('reservations').select('id, guest_name, room_ids, total_amount, discount_amount, discount, paid_amount').eq('id', reservationId).limit(1);
  const r = rrows && rrows[0];
  if (!r) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
  const net = Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0));
  const room = Array.isArray(r.room_ids) ? r.room_ids[0] : r.room_number;

  const { error: txErr } = await supabase.from('transactions').insert({
    room_number: room, guest_name: r.guest_name, type, amount: a,
    fiscal_day: fiscalDay, reservation_id: r.id, tenant_id: TENANT, idempotency_key: idempotencyKey,
  });
  if (txErr) {
    // 23505 -> this exact payment already landed; treat as success, skip the paid_amount bump.
    if (/23505|duplicate key|uq_transactions_idempotency|uq_payment_tx_idempotency/i.test(txErr.message || '')) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[crm/payment] tx insert:', txErr.message);
    return NextResponse.json({ error: 'Could not record payment.' }, { status: 500 });
  }

  // Fresh paid_amount, bump, floored at net so the balance can't go negative.
  const { data: fresh } = await supabase.from('reservations').select('paid_amount').eq('id', r.id).single();
  const newPaid = Math.min(net, (+(fresh?.paid_amount || 0)) + a);
  const { error: upErr } = await supabase.from('reservations').update({ paid_amount: newPaid }).eq('id', r.id);
  if (upErr) {
    console.error('[crm/payment] paid_amount update:', upErr.message);
    return NextResponse.json({ error: 'Payment recorded but balance update failed — check the folio.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, paid_amount: newPaid });
}
