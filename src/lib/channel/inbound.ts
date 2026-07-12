// [Hotel-CRM] Channel Manager Phase 3.1 - shared inbound processor
// One code path for webhook deliveries AND feed-poll backstop.
//
// booking_created  -> fn_guard_and_book per room (multi-room fans out one
//                     reservation PER ROOM, external ids suffixed #1, #2 -
//                     owner house rule from the ABDULLAH BIN SAFAT incident).
// booking_cancelled-> guarded DELETE (owner rule 2026-07-12): only rows that
//                     are RESERVED/PENDING with paid_amount=0 and ZERO
//                     transactions. Anything money-touched goes to REVIEW.
// booking_modified -> conservative v1: same dates + same category = update
//                     guest fields + total_amount. Anything else = REVIEW.
// REVIEW = sync_queue row status 'dead' with last_error 'REVIEW: ...' -
// visible, never retried, never guessed (13,600-Taka rule).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelAccountRow, CMAdapter, InboundBooking } from './adapter';

const DEADLOCK = '40P01';
const OCCUPYING_SAFE = ['RESERVED', 'PENDING']; // deletable states

export interface InboundOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

async function markDead(db: SupabaseClient, queueId: string, reason: string) {
  await db
    .from('sync_queue')
    .update({ status: 'dead', last_error: reason.slice(0, 500), processed_at: new Date().toISOString() })
    .eq('id', queueId);
}

async function complete(db: SupabaseClient, queueId: string, ok: boolean, error?: string) {
  await db.rpc('fn_sync_queue_complete', { p_id: queueId, p_ok: ok, p_error: error ?? null });
}

async function ack(adapter: CMAdapter, booking: InboundBooking, acct: ChannelAccountRow) {
  if (adapter.ackEvent && booking.ackRef) {
    try { await adapter.ackEvent(booking.ackRef, acct); } catch { /* feed backstop */ }
  }
}

function externalIds(booking: InboundBooking): string[] {
  const n = booking.roomsDetail?.length || 1;
  if (n <= 1) return [booking.externalBookingId];
  return Array.from({ length: n }, (_, i) => `${booking.externalBookingId}#${i + 1}`);
}

export async function processInbound(
  db: SupabaseClient,
  adapter: CMAdapter,
  acct: ChannelAccountRow,
  booking: InboundBooking
): Promise<InboundOutcome> {
  // Idempotent intake (partial-unique on channel_account_id+external_event_id)
  const { data: queued, error: insErr } = await db
    .from('sync_queue')
    .insert({
      tenant_id: acct.tenant_id,
      channel_account_id: acct.id,
      direction: 'inbound',
      event_type: booking.eventType,
      external_event_id: booking.externalEventId,
      payload: booking.raw,
    })
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      await ack(adapter, booking, acct); // replay of an already-seen revision
      return { httpStatus: 200, body: { ok: true, duplicate: true } };
    }
    return { httpStatus: 500, body: { error: insErr.message } };
  }
  const queueId = queued.id as string;

  // ---------- booking_created: guard_and_book per room ----------
  if (booking.eventType === 'booking_created') {
    const rooms = booking.roomsDetail?.length
      ? booking.roomsDetail
      : [{ category: booking.category, amount: booking.totalAmount ?? 0 }];
    const ids = externalIds(booking);
    const created: string[] = [];

    for (let i = 0; i < rooms.length; i++) {
      const args = {
        p_channel_account_id: acct.id,
        p_external_booking_id: ids[i],
        p_category: rooms[i].category,
        p_check_in: booking.checkIn,
        p_check_out: booking.checkOut,
        p_guest_name: booking.guestName,
        p_phone: booking.phone ?? null,
        p_email: booking.email ?? null,
        p_total_amount: rooms[i].amount,
        p_commission_pct: booking.commissionPct ?? 0,
      };
      let r = await db.rpc('fn_guard_and_book', args);
      if (r.error && r.error.code === DEADLOCK) r = await db.rpc('fn_guard_and_book', args);
      if (r.error) {
        const msg = `${r.error.message} (room ${i + 1}/${rooms.length})`;
        await complete(db, queueId, false, msg);
        // rooms already booked stay booked (idempotent replays skip them)
        const noAvail = r.error.message.includes('NO_AVAILABILITY');
        return { httpStatus: noAvail ? 409 : 500, body: { error: msg, created } };
      }
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (row?.reservation_id) created.push(row.reservation_id);
    }

    await complete(db, queueId, true);
    await ack(adapter, booking, acct);
    return { httpStatus: 200, body: { ok: true, created: true, reservation_ids: created } };
  }

  // ---------- find existing reservations for cancel/modify ----------
  const ids = externalIds(booking);
  const { data: existing } = await db
    .from('reservations')
    .select('id, status, paid_amount, external_booking_id, room_type, check_in, check_out')
    .eq('tenant_id', acct.tenant_id)
    .or(
      `external_booking_id.eq.${booking.externalBookingId},external_booking_id.like.${booking.externalBookingId}#%`
    );
  const rows = existing || [];

  if (rows.length === 0) {
    await markDead(db, queueId, `REVIEW: ${booking.eventType} for unknown booking ${booking.externalBookingId}`);
    await ack(adapter, booking, acct);
    return { httpStatus: 200, body: { ok: true, review: true, reason: 'unknown_booking' } };
  }

  // ---------- booking_cancelled: guarded cascade delete ----------
  if (booking.eventType === 'booking_cancelled') {
    const deleted: string[] = [];
    const held: string[] = [];

    for (const res of rows) {
      const { count: txCount } = await db
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('reservation_id', res.id);
      const safe =
        OCCUPYING_SAFE.includes(res.status) &&
        Number(res.paid_amount || 0) === 0 &&
        (txCount || 0) === 0;
      if (safe) {
        const { error: delErr } = await db.from('reservations').delete().eq('id', res.id);
        if (delErr) held.push(`${res.id}: ${delErr.message}`);
        else deleted.push(res.id);
      } else {
        held.push(`${res.id}: status=${res.status} paid=${res.paid_amount} tx=${txCount}`);
      }
    }

    if (held.length > 0) {
      await markDead(db, queueId,
        `REVIEW: cancel partially held - money/status guard. deleted=${deleted.length} held: ${held.join('; ')}`);
    } else {
      await complete(db, queueId, true);
    }
    await ack(adapter, booking, acct);
    return {
      httpStatus: 200,
      body: { ok: true, cancelled: deleted.length, review: held.length > 0 },
    };
  }

  // ---------- booking_modified: conservative v1 ----------
  if (booking.eventType === 'booking_modified') {
    const sameShape =
      rows.length === 1 &&
      (booking.roomsDetail?.length || 1) === 1 &&
      rows[0].room_type === (booking.roomsDetail?.[0]?.category || booking.category) &&
      String(rows[0].check_in).slice(0, 10) === booking.checkIn;
    // check_out compare: stored as timestamptz noon Dhaka; date part must match
    const sameDates = sameShape && String(rows[0].check_out).slice(0, 10) === booking.checkOut;

    if (sameDates) {
      const { error: updErr } = await db
        .from('reservations')
        .update({
          guest_name: booking.guestName,
          phone: booking.phone ?? null,
          email: booking.email ?? null,
          total_amount: booking.totalAmount ?? 0, // gross - billing anchor rule
        })
        .eq('id', rows[0].id);
      if (updErr) {
        await complete(db, queueId, false, updErr.message);
        return { httpStatus: 500, body: { error: updErr.message } };
      }
      await complete(db, queueId, true);
      await ack(adapter, booking, acct);
      return { httpStatus: 200, body: { ok: true, modified: rows[0].id } };
    }

    await markDead(db, queueId,
      `REVIEW: modification changes dates/rooms (${booking.externalBookingId}) - apply manually in Reservations`);
    await ack(adapter, booking, acct);
    return { httpStatus: 200, body: { ok: true, review: true, reason: 'complex_modification' } };
  }

  await markDead(db, queueId, `REVIEW: unhandled event ${booking.eventType}`);
  await ack(adapter, booking, acct);
  return { httpStatus: 200, body: { ok: true, review: true } };
}
