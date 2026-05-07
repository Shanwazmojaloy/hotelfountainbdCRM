/**
 * booking-webhook — Supabase Edge Function
 * Receives booking notifications from Channel Managers (STAAH, Wubook, SiteMinder, etc.)
 * Normalises data → creates guest + reservation → blocks room → alerts staff
 *
 * Webhook URL (give to your Channel Manager):
 * https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/booking-webhook
 *
 * Security: Set WEBHOOK_SECRET in Supabase secrets.
 * Channel Manager must send: Authorization: Bearer <WEBHOOK_SECRET>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NormalisedBooking {
  external_id: string;       // Channel Manager booking reference
  platform: string;          // 'booking.com' | 'agoda' | 'expedia' | 'direct' | etc.
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;          // YYYY-MM-DD
  check_out: string;         // YYYY-MM-DD
  room_type: string;         // Must match rooms.room_type values
  adults: number;
  children: number;
  total_amount: number;      // BDT
  special_requests: string | null;
  status: 'new' | 'modified' | 'cancelled';
}

// ── Channel Normalisers ───────────────────────────────────────────────────────

function normaliseSTAAH(body: Record<string, unknown>): NormalisedBooking {
  // STAAH Connect webhook format
  const b = body as Record<string, string>;
  return {
    external_id: b.BookingId || b.ReservationId,
    platform: (b.OTAName || 'staah').toLowerCase(),
    guest_name: `${b.FirstName || ''} ${b.LastName || ''}`.trim(),
    guest_email: b.Email || null,
    guest_phone: b.Phone || b.Mobile || null,
    check_in: b.ArrivalDate?.substring(0, 10),
    check_out: b.DepartureDate?.substring(0, 10),
    room_type: b.RoomTypeName || b.RoomType,
    adults: parseInt(b.Adults || '1'),
    children: parseInt(b.Children || '0'),
    total_amount: parseFloat(b.TotalAmount || b.RoomRate || '0'),
    special_requests: b.SpecialRequest || null,
    status: b.Status === 'Cancelled' ? 'cancelled'
           : b.Status === 'Modified' ? 'modified'
           : 'new',
  };
}

function normaliseWubook(body: Record<string, unknown>): NormalisedBooking {
  // Wubook JSON webhook format
  const r = (body.reservation || body) as Record<string, unknown>;
  const g = (r.customer || {}) as Record<string, string>;
  return {
    external_id: String(r.id || r.rcode),
    platform: String(r.channel_name || 'wubook').toLowerCase(),
    guest_name: `${g.fname || ''} ${g.lname || ''}`.trim(),
    guest_email: g.mail || null,
    guest_phone: g.phone || null,
    check_in: String(r.dfrom || '').substring(0, 10),
    check_out: String(r.dto || '').substring(0, 10),
    room_type: String(r.rooms?.[0]?.room_name || r.room_type || ''),
    adults: parseInt(String(r.adults || '1')),
    children: parseInt(String(r.children || '0')),
    total_amount: parseFloat(String(r.amount || r.price || '0')),
    special_requests: String(r.customer_notes || r.notes || '') || null,
    status: r.status === 'cancelled' ? 'cancelled'
           : r.status === 'modified' ? 'modified'
           : 'new',
  };
}

function normaliseGeneric(body: Record<string, unknown>): NormalisedBooking {
  // Generic fallback — handles SiteMinder, Cloudbeds, RezReady, direct POST
  const get = (keys: string[]): string =>
    keys.map(k => body[k] as string).find(v => v) || '';

  return {
    external_id: get(['external_id', 'booking_id', 'reservation_id', 'id', 'BookingId']),
    platform: get(['platform', 'source', 'channel', 'OTAName', 'ota']) || 'channel_manager',
    guest_name: get(['guest_name', 'GuestName', 'customer_name', 'name', 'full_name']) ||
                `${get(['first_name', 'FirstName'])} ${get(['last_name', 'LastName'])}`.trim(),
    guest_email: get(['email', 'Email', 'guest_email']) || null,
    guest_phone: get(['phone', 'Phone', 'mobile', 'Mobile', 'telephone']) || null,
    check_in: get(['check_in', 'checkin', 'arrival', 'ArrivalDate', 'CheckIn']).substring(0, 10),
    check_out: get(['check_out', 'checkout', 'departure', 'DepartureDate', 'CheckOut']).substring(0, 10),
    room_type: get(['room_type', 'RoomType', 'room_name', 'RoomTypeName', 'roomtype']),
    adults: parseInt(get(['adults', 'Adults', 'pax', 'guests']) || '1'),
    children: parseInt(get(['children', 'Children', 'kids']) || '0'),
    total_amount: parseFloat(get(['total_amount', 'TotalAmount', 'amount', 'price', 'rate']) || '0'),
    special_requests: get(['special_requests', 'SpecialRequest', 'notes', 'comments']) || null,
    status: String(body.status || body.Status || 'new').toLowerCase().includes('cancel')
            ? 'cancelled'
            : String(body.status || '').toLowerCase().includes('modif')
            ? 'modified'
            : 'new',
  };
}

function detectAndNormalise(body: Record<string, unknown>): NormalisedBooking {
  if (body.BookingId && body.ArrivalDate) return normaliseSTAAH(body as Record<string, string>);
  if (body.reservation || (body.rcode && body.dfrom)) return normaliseWubook(body);
  return normaliseGeneric(body);
}

// ── Room Type Matcher ─────────────────────────────────────────────────────────

function matchRoomType(incoming: string): string {
  const map: Record<string, string> = {
    'fountain deluxe': 'Fountain Deluxe',
    'premium deluxe': 'Premium Deluxe',
    'superior deluxe': 'Superior Deluxe',
    'twin deluxe': 'Twin Deluxe',
    'royal suite': 'Royal Suite',
    'suite': 'Royal Suite',
    'twin': 'Twin Deluxe',
    'deluxe': 'Fountain Deluxe',
    'superior': 'Superior Deluxe',
    'premium': 'Premium Deluxe',
  };
  const key = incoming.toLowerCase().trim();
  for (const [pattern, canonical] of Object.entries(map)) {
    if (key.includes(pattern)) return canonical;
  }
  return incoming; // pass through if no match — let DB query fail gracefully
}

// ── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Webhook-Secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret) {
    const auth = req.headers.get('Authorization') || req.headers.get('X-Webhook-Secret') || '';
    const token = auth.replace('Bearer ', '').trim();
    if (token !== secret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  // ── Parse Body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else {
      // Some channel managers send form-encoded or XML — try JSON first
      const text = await req.text();
      try { body = JSON.parse(text); }
      catch { body = Object.fromEntries(new URLSearchParams(text)); }
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400 });
  }

  // ── Normalise ───────────────────────────────────────────────────────────────
  let booking: NormalisedBooking;
  try {
    booking = detectAndNormalise(body);
    if (!booking.external_id || !booking.check_in || !booking.check_out || !booking.guest_name) {
      throw new Error(`Missing required fields: external_id=${booking.external_id}, check_in=${booking.check_in}, check_out=${booking.check_out}, guest_name=${booking.guest_name}`);
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Normalisation failed', detail: String(e) }), { status: 422 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── Handle Cancellation ─────────────────────────────────────────────────────
  if (booking.status === 'cancelled') {
    const { data: existing } = await supabase
      .from('reservations')
      .select('id, room_ids')
      .eq('tenant_id', TENANT)
      .eq('external_booking_id', booking.external_id)
      .single();

    if (existing) {
      await supabase.from('reservations').update({ status: 'CANCELLED' }).eq('id', existing.id);
      if (existing.room_ids?.length) {
        await supabase.from('rooms').update({ status: 'AVAILABLE' })
          .in('id', existing.room_ids).eq('tenant_id', TENANT);
      }
      await supabase.from('notifications_log').insert({
        tenant_id: TENANT, workflow: 'booking-webhook',
        body: `❌ Booking CANCELLED: ${booking.guest_name} | ${booking.platform} | ${booking.check_in} → ${booking.check_out}`,
        status: 'warning', triggered_by: 'webhook:booking-webhook',
      });
    }
    return new Response(JSON.stringify({ ok: true, action: 'cancelled', external_id: booking.external_id }), { status: 200 });
  }

  // ── Idempotency — check for duplicate ───────────────────────────────────────
  const { data: dupCheck } = await supabase
    .from('reservations')
    .select('id')
    .eq('tenant_id', TENANT)
    .eq('external_booking_id', booking.external_id)
    .single();

  if (dupCheck) {
    return new Response(JSON.stringify({ ok: true, action: 'duplicate_skipped', reservation_id: dupCheck.id }), { status: 200 });
  }

  // ── Find Available Room ─────────────────────────────────────────────────────
  const canonicalType = matchRoomType(booking.room_type);
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, room_number, room_type, rate')
    .eq('tenant_id', TENANT)
    .eq('room_type', canonicalType)
    .eq('status', 'AVAILABLE')
    .limit(1);

  if (!rooms || rooms.length === 0) {
    // No room available — still create reservation as PENDING for staff to assign
    await supabase.from('notifications_log').insert({
      tenant_id: TENANT, workflow: 'booking-webhook',
      body: `⚠️ NEW BOOKING received but NO AVAILABLE ROOM found for type "${canonicalType}". Guest: ${booking.guest_name} | ${booking.platform} | ${booking.check_in}→${booking.check_out}. Manual room assignment required.`,
      status: 'warning', triggered_by: 'webhook:booking-webhook',
    });
  }

  const room = rooms?.[0] ?? null;

  // ── Upsert Guest ────────────────────────────────────────────────────────────
  let guestId: string | null = null;
  if (booking.guest_email) {
    const { data: existingGuest } = await supabase
      .from('guests')
      .select('id')
      .eq('tenant_id', TENANT)
      .eq('email', booking.guest_email)
      .single();

    if (existingGuest) {
      guestId = existingGuest.id;
      // Increment visit_count safely
      const { data: gd } = await supabase.from('guests').select('visit_count').eq('id', guestId).single();
      await supabase.from('guests').update({ visit_count: (gd?.visit_count ?? 0) + 1 }).eq('id', guestId);
    } else {
      const { data: newGuest } = await supabase.from('guests').insert({
        tenant_id: TENANT,
        name: booking.guest_name,
        email: booking.guest_email || null,
        phone: booking.guest_phone || null,
        source: booking.platform,
        visit_count: 1,
      }).select('id').single();
      guestId = newGuest?.id ?? null;
    }
  } else {
    const { data: newGuest } = await supabase.from('guests').insert({
      tenant_id: TENANT,
      name: booking.guest_name,
      email: null,
      phone: booking.guest_phone || null,
      source: booking.platform,
      visit_count: 1,
    }).select('id').single();
    guestId = newGuest?.id ?? null;
  }

  // ── Create Reservation ──────────────────────────────────────────────────────
  const { data: reservation, error: resError } = await supabase
    .from('reservations')
    .insert({
      tenant_id: TENANT,
      guest_id: guestId,
      room_ids: room ? [room.id] : [],
      check_in: booking.check_in,
      check_out: booking.check_out,
      adults: booking.adults,
      children: booking.children,
      total_amount: booking.total_amount || (room?.rate ?? 0),
      status: room ? 'RESERVED' : 'PENDING',
      source: booking.platform,
      external_booking_id: booking.external_id,
      special_requests: booking.special_requests || null,
      notes: `Auto-imported from ${booking.platform} via Channel Manager webhook`,
    })
    .select('id')
    .single();

  if (resError) {
    return new Response(JSON.stringify({ error: 'Failed to create reservation', detail: resError.message }), { status: 500 });
  }

  // ── Block Room ──────────────────────────────────────────────────────────────
  if (room) {
    await supabase.from('rooms')
      .update({ status: 'RESERVED' })
      .eq('id', room.id)
      .eq('tenant_id', TENANT);
  }

  // ── Notify Staff ────────────────────────────────────────────────────────────
  await supabase.from('notifications_log').insert({
    tenant_id: TENANT,
    workflow: 'booking-webhook',
    body: `✅ NEW BOOKING: ${booking.guest_name} | ${booking.platform.toUpperCase()} | Room: ${room?.room_number ?? 'UNASSIGNED'} (${canonicalType}) | ${booking.check_in} → ${booking.check_out} | ৳${booking.total_amount}`,
    status: 'success',
    triggered_by: 'webhook:booking-webhook',
  });

  return new Response(JSON.stringify({
    ok: true,
    action: 'created',
    reservation_id: reservation.id,
    room_assigned: room?.room_number ?? null,
    guest_id: guestId,
    platform: booking.platform,
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
});
