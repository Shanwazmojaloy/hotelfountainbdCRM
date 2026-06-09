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
  const { data: srow } = await supabase.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

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
        await supabase.from('transactions').insert({
          room_number: roomNos[0] || '?', guest_name: body.guest_name || null, type: 'Advance Payment',
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
      // Advance-Payment TX when paid_amount increases
      const payIncrease = paidNum - (+prev.paid_amount || 0);
      if (payIncrease > 0) {
        await supabase.from('transactions').insert({
          room_number: newRoomNos[0] || '?', guest_name: gn, type: 'Advance Payment',
          amount: payIncrease, fiscal_day: fiscal, reservation_id: id, tenant_id: TENANT, idempotency_key: crypto.randomUUID(),
        });
      }

      const { error: upErr } = await supabase.from('reservations').update({
        status, paid_amount: paidNum, discount_amount: discountNum, notes: (body.notes as string) ?? prev.notes,
        check_in: checkIn, check_out: checkOut, room_ids: newRoomNos, guest_name: gn,
      }).eq('id', id);
      if (upErr) throw upErr;
      await recalcResTotalServer(supabase, id); // authoritative recompute
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/reservation]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not save reservation.' }, { status: 500 });
  }
}
