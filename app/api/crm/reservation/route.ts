// POST /api/crm/reservation — Phase 3 route for bookings. action = create | update.
// Mirrors NewReservationModal (insert + room OCCUPIED on check-in + advance TX) and
// ReservationEditModal.save (room-status sync on add/remove/transition, Stay-Extension TX on
// checkout push-out, Advance-Payment TX on paid increase, authoritative recalc). Session-gated.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';
import { recalcResTotalServer } from '@/lib/recalcResTotal.server';

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

  try {
    if (action === 'create') {
      const roomNos: string[] = Array.isArray(body.room_ids) ? (body.room_ids as string[]).filter(Boolean) : [];
      const status = String(body.status || 'RESERVED');
      const paid = +(body.paid_amount as number) || 0;
      const ins: Record<string, unknown> = {
        guest_ids: body.guest_ids || [], room_ids: roomNos, guest_name: body.guest_name || null,
        check_in: body.check_in || null, check_out: body.check_out || null, status,
        total_amount: +(body.total_amount as number) || 0, paid_amount: paid,
        discount_amount: +(body.discount_amount as number) || 0, payment_method: body.payment_method || null,
        special_requests: body.special_requests || null, on_duty_officer: body.on_duty_officer || null,
        stay_type: body.stay_type || null, tenant_id: TENANT,
      };
      const { data: created, error } = await supabase.from('reservations').insert(ins).select('id').limit(1);
      if (error) throw error;
      const newId = created && created[0]?.id;
      if (status === 'CHECKED_IN') {
        for (const rn of roomNos) await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('room_number', rn).eq('tenant_id', TENANT);
      }
      if (paid > 0 && newId) {
        // Method rides in the composite type string — transactions has NO payment_method column.
        const pm = (body.payment_method as string) || '';
        await supabase.from('transactions').insert({
          room_number: roomNos[0] || '?', guest_name: body.guest_name || null,
          type: pm ? `Advance Payment (${pm})` : 'Advance Payment',
          amount: paid, fiscal_day: (body.fiscal_day as string) || todayDhaka(), reservation_id: newId,
          tenant_id: TENANT, idempotency_key: (body.idempotency_key as string) || crypto.randomUUID(),
        });
      }
      return NextResponse.json({ ok: true, id: newId });
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
      const fiscal = (body.fiscal_day as string) || todayDhaka();
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
      // Does NOT recalc/overwrite a canonical total; sets rate×nights only when the web
      // booking arrived without a total. Room status is NOT flipped (matrix reserves at
      // check-in, matching NewReservationModal's future-reservation behaviour).
      const id = body.id as string;
      const roomNos: string[] = Array.isArray(body.room_ids) ? (body.room_ids as string[]).filter(Boolean) : [];
      if (!id) return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });
      if (!roomNos.length) return NextResponse.json({ error: 'Select a room first.' }, { status: 400 });
      const { data: prevRows } = await supabase.from('reservations').select('id, status, check_in, check_out, total_amount').eq('id', id).eq('tenant_id', TENANT).limit(1);
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

      const upd: Record<string, unknown> = { room_ids: roomNos, status: 'RESERVED' };
      if (!(+prev.total_amount > 0)) {
        const rs = await ratesSumOf(supabase, roomNos);
        const n = nights(prev.check_in, prev.check_out) || 1;
        if (rs > 0) upd.total_amount = rs * n;
      }
      const { error: cfErr } = await supabase.from('reservations').update(upd).eq('id', id).eq('tenant_id', TENANT);
      if (cfErr) throw cfErr;
      console.log(`[crm/reservation] CONFIRM ${id} rooms=${roomNos.join('/')} by staff ${sess.id} (${staffRole})`);
      return NextResponse.json({ ok: true });
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
