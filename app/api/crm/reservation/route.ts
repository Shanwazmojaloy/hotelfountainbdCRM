// POST /api/crm/reservation — Phase 3 route for bookings. action = create | update.
// Mirrors NewReservationModal (insert + room OCCUPIED on check-in + advance TX) and
// ReservationEditModal.save (room-status sync on add/remove/transition, Stay-Extension TX on
// checkout push-out, Advance-Payment TX on paid increase, authoritative recalc). Session-gated.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';
import { recalcResTotalServer } from '@/lib/recalcResTotal.server';
import { openBusinessDay, clampFiscalDay } from '@/lib/businessDay';

export const runtime = 'nodejs';
export const maxDuration = 20;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const nights = (ci: string, co: string) => { if (!ci || !co) return 0; const n = Math.round((+new Date(co) - +new Date(ci)) / 86400000); return n > 0 ? n : 0; };
const todayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ratesSumOf(supabase: any, roomNos: string[]): Promise<number> {
  if (!roomNos.length) return 0;
  const { data } = await supabase.from('rooms').select('room_number, price').in('room_number', roomNos.map(String));
  const arr = (data || []) as Array<{ room_number: string | number; price: number }>;
  return roomNos.reduce((a, rn) => a + (Number(arr.find((r) => String(r.room_number) === String(rn))?.price) || 0), 0);
}

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: srow } = await supabase.from('staff').select('session_v, role').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }
  const staffRole = String(srow[0].role || '').toLowerCase();

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');

  // ── Boundary validation: reject malformed writes. There is NO DB CHECK on status (only an
  // uppercase trigger), and amounts/dates are otherwise unguarded — so validate here.
  if (action === 'create' || action === 'update') {
    const ALLOWED_STATUS = new Set(['RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'PENDING']);
    if (body.status != null && !ALLOWED_STATUS.has(String(body.status).toUpperCase())) {
      return NextResponse.json({ error: 'Invalid reservation status.' }, { status: 400 });
    }
    for (const k of ['total_amount', 'paid_amount', 'discount_amount'] as const) {
      const v = body[k];
      if (v != null && (!Number.isFinite(+(v as number)) || +(v as number) < 0)) {
        return NextResponse.json({ error: `${k.replace('_', ' ')} must be a non-negative number.` }, { status: 400 });
      }
    }
    const ci = body.check_in ? new Date(String(body.check_in)) : null;
    const co = body.check_out ? new Date(String(body.check_out)) : null;
    if (ci && isNaN(ci.getTime())) return NextResponse.json({ error: 'Invalid check-in date.' }, { status: 400 });
    if (co && isNaN(co.getTime())) return NextResponse.json({ error: 'Invalid check-out date.' }, { status: 400 });
    if (ci && co && co.getTime() < ci.getTime()) return NextResponse.json({ error: 'Check-out cannot be before check-in.' }, { status: 400 });
  }

  // Open business day for any TX this request writes (advance / stay-extension / paid-increase).
  // Collections accrue to the open day, not the calendar date, until "Closing Complete".
  const { data: _closes } = await supabase.from('night_audit_log').select('audit_date, status').eq('tenant_id', TENANT);
  const openDay = openBusinessDay(_closes, todayDhaka());
  const txFiscal = clampFiscalDay(typeof body.fiscal_day === 'string' ? (body.fiscal_day as string) : null, openDay);

  try {
    if (action === 'create') {
      const roomNos: string[] = Array.isArray(body.room_ids) ? (body.room_ids as string[]).filter(Boolean) : [];
      if (!roomNos.length) return NextResponse.json({ error: 'Select at least one room.' }, { status: 400 });
      const status = String(body.status || 'RESERVED');
      const paid = +(body.paid_amount as number) || 0;
      const wantTotalRaw = +(body.total_amount as number) || 0;
      const discount = +(body.discount_amount as number) || 0;
      const checkIn = (body.check_in as string) || null;
      const checkOut = (body.check_out as string) || null;
      const pm = (body.payment_method as string) || '';
      const baseIns: Record<string, unknown> = {
        guest_ids: body.guest_ids || [], guest_name: body.guest_name || null,
        check_in: checkIn, check_out: checkOut, status,
        payment_method: body.payment_method || null,
        special_requests: body.special_requests || null, on_duty_officer: body.on_duty_officer || null,
        stay_type: body.stay_type || null, tenant_id: TENANT,
      };

      // PER-ROOM BOOKINGS (house rule 2026-06-14): a multi-room booking is stored as ONE reservation
      // PER ROOM, so check-out / billing / room-status are INDEPENDENT per room. Previously a single
      // multi-room row shared one `status`, so checking out one room checked out all of them
      // (ABDULLAH BIN SAFAT 405/501/506 incident). Money split rule: each room's gross = its own
      // rate × nights; the (possibly negotiated) entered total & discount are PRORATED to those
      // grosses with the rounding remainder on the first room; the paid pool fills each room's net
      // (total − discount) in order so earliest rooms settle first. Invariant: the children's
      // totals/discount/paid sum EXACTLY back to the entered figures. Single-room bookings are
      // mathematically identical to the old single-insert path.
      const n = nights(String(checkIn || ''), String(checkOut || '')) || 1;
      const { data: rateRows } = await supabase.from('rooms').select('room_number, price').in('room_number', roomNos.map(String));
      const rates = (rateRows || []) as Array<{ room_number: string | number; price: number }>;
      const rateOf = (rn: string) => Number(rates.find((r) => String(r.room_number) === String(rn))?.price) || 0;
      const gross = roomNos.map((rn) => rateOf(rn) * n);
      const grossSum = gross.reduce((a, b) => a + b, 0);
      const wantTotal = wantTotalRaw > 0 ? wantTotalRaw : grossSum;
      // per-room total: prorate the entered total by rate-weight; equal split if rates unknown
      const totals = roomNos.map((_, i) => {
        if (wantTotalRaw > 0 && grossSum > 0) return Math.round(wantTotalRaw * gross[i] / grossSum);
        if (wantTotalRaw > 0) return Math.round(wantTotalRaw / roomNos.length);
        return gross[i];
      });
      totals[0] += wantTotal - totals.reduce((a, b) => a + b, 0); // exact-sum remainder on first
      // discount prorated to per-room total; remainder on first
      const disc = roomNos.map((_, i) => wantTotal > 0 ? Math.round(discount * totals[i] / wantTotal) : 0);
      disc[0] += discount - disc.reduce((a, b) => a + b, 0);
      // paid pool fills each room's net in order; any overpayment lands on the last room
      let pool = paid;
      const paidArr = roomNos.map((_, i) => { const net = Math.max(0, totals[i] - disc[i]); const p = Math.min(pool, net); pool -= p; return p; });
      if (pool > 0) paidArr[paidArr.length - 1] += pool;

      const ids: string[] = [];
      for (let i = 0; i < roomNos.length; i++) {
        const rn = roomNos[i];
        const { data: created, error } = await supabase.from('reservations').insert({
          ...baseIns, room_ids: [rn], total_amount: totals[i], paid_amount: paidArr[i], discount_amount: disc[i],
        }).select('id').limit(1);
        if (error) throw error;
        const newId = created && created[0]?.id;
        if (newId) ids.push(newId);
        if (status === 'CHECKED_IN') await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('room_number', rn).eq('tenant_id', TENANT);
        if (paidArr[i] > 0 && newId) {
          // Method rides in the composite type string — transactions has NO payment_method column.
          await supabase.from('transactions').insert({
            room_number: rn, guest_name: body.guest_name || null,
            type: pm ? `Advance Payment (${pm})` : 'Advance Payment',
            amount: paidArr[i], fiscal_day: txFiscal, reservation_id: newId,
            tenant_id: TENANT, idempotency_key: crypto.randomUUID(),
          });
        }
      }
      return NextResponse.json({ ok: true, id: ids[0], ids });
    }

    if (action === 'update') {
      const id = body.id as string;
      if (!id) return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });
      const { data: prevRows } = await supabase.from('reservations').select('*').eq('id', id).limit(1);
      const prev = prevRows && prevRows[0];
      if (!prev) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });

      const newRoomNos: string[] = Array.isArray(body.room_ids) ? (body.room_ids as string[]).filter(Boolean) : [];
      const oldRoomNos: string[] = Array.isArray(prev.room_ids) ? prev.room_ids.filter(Boolean) : [];
      const status = String(body.status || prev.status);
      const paidNum = +(body.paid_amount as number) || 0;
      const discountNum = +(body.discount_amount as number) || 0;
      const checkIn = (body.check_in as string) || prev.check_in;
      const checkOut = (body.check_out as string) || prev.check_out;
      const gn = (body.guest_name as string) || prev.guest_name || null;

      // removed rooms -> AVAILABLE
      for (const rn of oldRoomNos.filter((rn) => !newRoomNos.includes(rn))) {
        await supabase.from('rooms').update({ status: 'AVAILABLE' }).eq('room_number', rn).eq('tenant_id', TENANT);
      }
      if (status === 'CHECKED_IN') {
        for (const rn of newRoomNos) await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('room_number', rn).eq('tenant_id', TENANT);
      }
      if (status === 'CHECKED_OUT' && prev.status !== 'CHECKED_OUT') {
        for (const rn of newRoomNos) await supabase.from('rooms').update({ status: 'DIRTY' }).eq('room_number', rn).eq('tenant_id', TENANT);
      }

      // Stay-Extension TX when checkout pushed out
      const ratesSum = await ratesSumOf(supabase, newRoomNos);
      const nNew = nights(checkIn, checkOut);
      const extNights = Math.max(0, nNew - nights(prev.check_in, prev.check_out));
      const fiscal = txFiscal; // open business day (clamped), not calendar date
      if (checkOut && String(checkOut).slice(0, 10) !== String(prev.check_out || '').slice(0, 10) && extNights > 0 && ratesSum > 0) {
        await supabase.from('transactions').insert({
          room_number: newRoomNos[0] || '?', guest_name: gn,
          type: `Stay Extension (+${extNights} night${extNights !== 1 ? 's' : ''})`,
          amount: extNights * ratesSum, fiscal_day: fiscal, reservation_id: id, tenant_id: TENANT, idempotency_key: crypto.randomUUID(),
        });
      }
      // Advance-Payment TX when paid_amount increases (method embedded in composite type)
      const payIncrease = paidNum - (+prev.paid_amount || 0);
      if (payIncrease > 0) {
        const pm2 = (body.payment_method as string) || (prev.payment_method as string) || '';
        await supabase.from('transactions').insert({
          room_number: newRoomNos[0] || '?', guest_name: gn,
          type: pm2 ? `Advance Payment (${pm2})` : 'Advance Payment',
          amount: payIncrease, fiscal_day: fiscal, reservation_id: id, tenant_id: TENANT, idempotency_key: crypto.randomUUID(),
        });
      }

      const { error: upErr } = await supabase.from('reservations').update({
        status, paid_amount: paidNum, discount_amount: discountNum, notes: (body.notes as string) ?? prev.notes,
        check_in: checkIn, check_out: checkOut, room_ids: newRoomNos, guest_name: gn,
      }).eq('id', id);
      if (upErr) throw upErr;
      // Recalc ONLY when dates/rooms changed — unconditional recalc clobbered negotiated /
      // custom totals on every edit (audit HIGH-3, 2026-06-10). Mirrors the modal's
      // _isUserEditing rule: untouched stay = canonical total preserved.
      const datesChanged = String(checkIn || '').slice(0, 10) !== String(prev.check_in || '').slice(0, 10)
        || String(checkOut || '').slice(0, 10) !== String(prev.check_out || '').slice(0, 10);
      const roomsChanged = JSON.stringify([...newRoomNos].sort()) !== JSON.stringify([...oldRoomNos].sort());
      if (datesChanged || roomsChanged) await recalcResTotalServer(supabase, id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'confirm') {
      // WEB-BOOKING PIPELINE: PENDING (from /api/book) → RESERVED with rooms assigned.
      // PER-ROOM FAN-OUT (house rule 2026-06-14): a multi-room web booking becomes ONE
      // reservation PER ROOM — the existing PENDING row is repurposed for the first room and
      // a sibling reservation is INSERTed for each additional room — so check-out / billing /
      // room-status stay INDEPENDENT per room. This mirrors the CRM `create` fan-out and closes
      // the public-site entry point for the 405/501/506 all-rooms-checkout cascade. PENDING web
      // rows carry no total/discount/paid and no transactions (see /api/book), so the money
      // split is rate×nights prorated (entered total honoured when present); a single-room
      // booking is mathematically identical to the old single-update path. Room status is NOT
      // flipped (the matrix reserves at check-in, matching NewReservationModal future-bookings).
      const id = body.id as string;
      const roomNos: string[] = Array.isArray(body.room_ids) ? (body.room_ids as string[]).filter(Boolean) : [];
      if (!id) return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });
      if (!roomNos.length) return NextResponse.json({ error: 'Select a room first.' }, { status: 400 });
      const { data: prevRows } = await supabase.from('reservations').select('*').eq('id', id).eq('tenant_id', TENANT).limit(1);
      const prev = prevRows && prevRows[0];
      if (!prev) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
      if (String(prev.status) !== 'PENDING') return NextResponse.json({ error: `Already ${prev.status}.` }, { status: 409 });

      // server-side double-booking guard for the requested window
      const { data: clash } = await supabase.from('reservations')
        .select('room_ids, guest_name, check_in, check_out')
        .in('status', ['RESERVED', 'CHECKED_IN', 'CONFIRMED'])
        .lt('check_in', prev.check_out).gt('check_out', prev.check_in);
      const taken = new Set<string>();
      (clash || []).forEach((r: { room_ids?: string[] }) => (r.room_ids || []).forEach((rn) => taken.add(String(rn))));
      const blocked = roomNos.filter((rn) => taken.has(String(rn)));
      if (blocked.length) return NextResponse.json({ error: `Room ${blocked.join(', ')} is already booked for those dates.` }, { status: 409 });

      // ---- per-room money split (mirrors `create`) ----
      const n = nights(String(prev.check_in || ''), String(prev.check_out || '')) || 1;
      const { data: rateRows } = await supabase.from('rooms').select('room_number, price').in('room_number', roomNos.map(String));
      const rates = (rateRows || []) as Array<{ room_number: string | number; price: number }>;
      const rateOf = (rn: string) => Number(rates.find((r) => String(r.room_number) === String(rn))?.price) || 0;
      const gross = roomNos.map((rn) => rateOf(rn) * n);
      const grossSum = gross.reduce((a, b) => a + b, 0);
      const wantTotalRaw = +prev.total_amount > 0 ? +prev.total_amount : 0;
      const wantTotal = wantTotalRaw > 0 ? wantTotalRaw : grossSum;
      const totals = roomNos.map((_, i) => {
        if (wantTotalRaw > 0 && grossSum > 0) return Math.round(wantTotalRaw * gross[i] / grossSum);
        if (wantTotalRaw > 0) return Math.round(wantTotalRaw / roomNos.length);
        return gross[i];
      });
      totals[0] += wantTotal - totals.reduce((a, b) => a + b, 0); // exact-sum remainder on first
      const discount = +prev.discount_amount || 0;
      const disc = roomNos.map((_, i) => wantTotal > 0 ? Math.round(discount * totals[i] / wantTotal) : 0);
      disc[0] += discount - disc.reduce((a, b) => a + b, 0);
      let pool = +prev.paid_amount || 0; // PENDING web rows have none; defensive for staff-edited drafts
      const paidArr = roomNos.map((_, i) => { const net = Math.max(0, totals[i] - disc[i]); const p = Math.min(pool, net); pool -= p; return p; });
      if (pool > 0) paidArr[paidArr.length - 1] += pool;

      // first room → repurpose the existing PENDING row
      const { error: cfErr } = await supabase.from('reservations').update({
        room_ids: [roomNos[0]], status: 'RESERVED',
        total_amount: totals[0], discount_amount: disc[0], paid_amount: paidArr[0],
      }).eq('id', id).eq('tenant_id', TENANT);
      if (cfErr) throw cfErr;
      const ids: string[] = [id];

      // additional rooms → sibling reservations cloned from the PENDING row (one per room)
      if (roomNos.length > 1) {
        const clone: Record<string, unknown> = {
          guest_ids: prev.guest_ids || [], guest_name: prev.guest_name || null,
          email: prev.email || null, phone: prev.phone || null, room_type: prev.room_type || null,
          guests: prev.guests ?? null, source: prev.source || 'WEBSITE',
          special_requests: prev.special_requests || null, on_duty_officer: prev.on_duty_officer || null,
          stay_type: prev.stay_type || null, payment_method: prev.payment_method || null,
          check_in: prev.check_in, check_out: prev.check_out, created_at: prev.created_at,
          tenant_id: TENANT, status: 'RESERVED',
        };
        for (let i = 1; i < roomNos.length; i++) {
          const { data: created, error } = await supabase.from('reservations').insert({
            ...clone, room_ids: [roomNos[i]], total_amount: totals[i], discount_amount: disc[i], paid_amount: paidArr[i],
          }).select('id').limit(1);
          if (error) throw error;
          if (created && created[0]?.id) ids.push(created[0].id);
        }
      }
      console.log(`[crm/reservation] CONFIRM ${id} rooms=${roomNos.join('/')} fanned=${ids.length} by staff ${sess.id} (${staffRole})`);
      return NextResponse.json({ ok: true, id, ids });
    }

    if (action === 'cancel_pending') {
      const id = body.id as string;
      if (!id) return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });
      const { error: cnErr } = await supabase.from('reservations').update({ status: 'CANCELLED' }).eq('id', id).eq('tenant_id', TENANT).eq('status', 'PENDING');
      if (cnErr) throw cnErr;
      console.log(`[crm/reservation] CANCEL-PENDING ${id} by staff ${sess.id} (${staffRole})`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
      // CASCADE DELETE (house rule): reservations FKs cascade to transactions,
      // payment_transactions, folios, guest_ledger, billing_invoices (DB-verified 2026-06-10) —
      // one DELETE removes the full financial trail, no orphans.
      // RBAC 2026-06-10: ADMIN-ONLY (owner/manager/admin) — receptionist cannot delete.
      if (!['owner', 'manager', 'admin'].includes(staffRole)) {
        return NextResponse.json({ error: 'Only management can delete reservations.' }, { status: 403 });
      }
      const id = body.id as string;
      if (!id) return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });
      const { data: prevRows } = await supabase.from('reservations').select('id, status, room_ids, guest_name').eq('id', id).eq('tenant_id', TENANT).limit(1);
      const prev = prevRows && prevRows[0];
      if (!prev) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });

      // Free rooms held by this reservation (an erroneous record shouldn't pin a room)
      if (['CHECKED_IN', 'RESERVED'].includes(String(prev.status))) {
        const roomNos: string[] = Array.isArray(prev.room_ids) ? prev.room_ids.filter(Boolean) : [];
        for (const rn of roomNos) {
          await supabase.from('rooms').update({ status: 'AVAILABLE' }).eq('room_number', rn).eq('tenant_id', TENANT);
        }
      }
      const { error: delErr } = await supabase.from('reservations').delete().eq('id', id).eq('tenant_id', TENANT);
      if (delErr) throw delErr;
      console.log(`[crm/reservation] DELETE ${id} (${prev.guest_name || '—'}) by staff ${sess.id} (${staffRole})`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/reservation]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not save reservation.' }, { status: 500 });
  }
}
