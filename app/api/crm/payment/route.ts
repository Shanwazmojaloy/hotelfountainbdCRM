// POST /api/crm/payment — Phase 3 MONEY route. Mirrors RecordPaymentModal exactly:
// derive net bill server-side, insert into `transactions` with the client idempotency_key
// (the dual-write trigger mirrors to payment_transactions; uq indexes + key-aware guard block
// duplicates), treat 23505 as success, then bump reservations.paid_amount floored at the net
// bill. Session-gated. Body: { reservation_id, amount, type, fiscal_day, idempotency_key }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';
import { openBusinessDay, clampFiscalDay } from '@/lib/businessDay';
import { sendCapiEvent } from '@/lib/capi';
import { tenantScoped } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Tenant is bound to the SIGNED session (not env/header/body) — non-spoofable. Env fallback
  // only for legacy cookies minted before tenant binding shipped.
  const TENANT = sess.tenant_id || ENV_TENANT;
  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const reservationId = body.reservation_id;
  const a = +(body.amount as number);
  const type = (typeof body.type === 'string' && body.type) || 'Room Payment (Cash)';
  const idempotencyKey = (typeof body.idempotency_key === 'string' && body.idempotency_key) || crypto.randomUUID();
  if (!reservationId) return NextResponse.json({ error: 'Missing reservation_id.' }, { status: 400 });
  if (!a || a <= 0) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 });

  // fiscal_day is the OPEN business day, not the calendar date — collections accrue to the
  // open day until it's closed. A modal defaulting to "today" snaps back to the open day;
  // an explicit back-date (≤ open) is honored for offline reconciliation.
  const { data: closes } = await db.from('night_audit_log').select('audit_date, status');
  const fiscalDay = clampFiscalDay(typeof body.fiscal_day === 'string' ? body.fiscal_day : null, openBusinessDay(closes));

  // Derive bill math server-side (do not trust the client).
  const { data: rrows } = await db.from('reservations').select('id, guest_name, room_ids, total_amount, discount_amount, discount, paid_amount, source, email, phone, fbp, fbc, fb_purchase_sent_at').eq('id', reservationId).limit(1);
  const r = rrows && rrows[0];
  if (!r) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
  const net = Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0));
  const room = Array.isArray(r.room_ids) ? r.room_ids[0] : r.room_number;

  // Cap the payment at the outstanding balance (owner rule 2026-07-01). bump_paid_amount already
  // floors paid_amount at net so the balance can't go negative, BUT an over-amount would still be
  // written to `transactions` and inflate today's collections/revenue (double-count). Reject here
  // on the service-role path so the anon-key SPA cannot bypass it. balanceDue read fresh from the
  // reservation's own paid_amount (source of truth).
  const paidPrev = +r.paid_amount || 0;
  const balanceDue = Math.max(0, net - paidPrev);
  if (a > balanceDue) {
    return NextResponse.json({
      error: balanceDue > 0
        ? `Amount exceeds the outstanding balance (৳${balanceDue.toLocaleString('en-US')}).`
        : 'This reservation is already fully settled — no outstanding balance.',
    }, { status: 400 });
  }

  const { error: txErr } = await db.from('transactions').insert({
    room_number: room, guest_name: r.guest_name, type, amount: a,
    fiscal_day: fiscalDay, reservation_id: r.id, idempotency_key: idempotencyKey,
  });
  if (txErr) {
    // 23505 -> this exact payment already landed; treat as success, skip the paid_amount bump.
    if (/23505|duplicate key|uq_transactions_idempotency|uq_payment_tx_idempotency/i.test(txErr.message || '')) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[crm/payment] tx insert:', txErr.message);
    return NextResponse.json({ error: 'Could not record payment.' }, { status: 500 });
  }

  // Atomic increment floored at net — a single UPDATE (LEAST(net, paid+a)) in the DB so two
  // concurrent payments from different terminals serialize on the row lock instead of both
  // reading the same paid_amount and clobbering each other (lost-update race). paid_amount
  // stays the source of truth (not recomputed from the tx sum).
  const { data: newPaid, error: upErr } = await supabase.rpc('bump_paid_amount', { p_res_id: r.id, p_amount: a, p_net: net });
  if (upErr) {
    console.error('[crm/payment] paid_amount bump:', upErr.message);
    return NextResponse.json({ error: 'Payment recorded but balance update failed — check the folio.' }, { status: 500 });
  }

  // ── Meta CAPI Purchase — fires ONCE, only for website-sourced reservations that carry
  //    ad-click context (fbp/fbc), when the booking becomes fully settled. Walk-in / desk
  //    bookings are never sent, so organic revenue isn't mis-attributed to ads. Fail-soft +
  //    idempotent (fb_purchase_sent_at stamp prevents re-fire on later payments). ──
  const settled = net > 0 && (+newPaid || 0) >= net;
  const hasClickCtx = !!(r.fbp || r.fbc);
  if (settled && hasClickCtx && r.source === 'WEBSITE' && !r.fb_purchase_sent_at) {
    try {
      const stamp = await db
        .from('reservations')
        .update({ fb_purchase_sent_at: new Date().toISOString() })
        .eq('id', r.id)
        .is('fb_purchase_sent_at', null)
        .select('id');
      // Only emit if THIS request won the idempotent stamp (no row → another request already sent).
      if (stamp.data && stamp.data.length === 1) {
        void sendCapiEvent({
          eventName: 'Purchase',
          eventId: `${r.id}:purchase`,
          actionSource: 'website',
          value: net,
          currency: 'BDT',
          user: {
            email: r.email, phone: r.phone, externalId: r.id,
            fbp: r.fbp, fbc: r.fbc, country: 'bd',
          },
        });
      }
    } catch (e) {
      console.error('[crm/payment] CAPI Purchase skipped:', e);
    }
  }

  return NextResponse.json({ ok: true, paid_amount: newPaid });
}
