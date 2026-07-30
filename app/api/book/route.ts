import { NextResponse } from 'next/server';
import { sendCapiEvent, fbCookiesFrom } from '@/lib/capi';
import { ROOMS } from '@/lib/rooms';

// Server-side public booking endpoint.
// Replaces the old client-side direct-Supabase insert that could fail silently
// (the ৳13,600-class "swallowed catch" bug). This route inserts with the SERVICE
// ROLE, enforces source='WEBSITE', validates input, and returns REAL errors so the
// landing page can never show a false "success" again.

export const runtime = 'nodejs';
export const maxDuration = 30;

const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

function svcHeaders(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type BookBody = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  roomType?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number | string;
  fbp?: string;
  fbc?: string;
};

// Predicted booking value for ad-platform value optimization: nights × nightly rate (BDT).
// A website booking is a REQUEST (no payment now), so this is a Lead's predicted value —
// the settled Purchase value is sent later from the CRM payment path.
function predictedValueBDT(roomType: string, checkIn: string, checkOut: string): number {
  const room = ROOMS.find((r) => r.name === roomType);
  const rate = room?.priceBDT ?? Math.min(...ROOMS.map((r) => r.priceBDT));
  const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000));
  return rate * nights;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return bad('Server is not configured for bookings. Please call the hotel directly.', 500);
  }

  let body: BookBody;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid request body.');
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  const roomType = (body.roomType || '').trim();
  const checkIn = (body.checkIn || '').trim();
  const checkOut = (body.checkOut || '').trim();
  const guests = parseInt(String(body.guests ?? '2'), 10) || 2;

  // Meta click-attribution cookies: prefer client-forwarded values, fall back to the Cookie header.
  const cookieFb = fbCookiesFrom(req.headers.get('cookie'));
  const fbp = (body.fbp || cookieFb.fbp || '').trim() || null;
  const fbc = (body.fbc || cookieFb.fbc || '').trim() || null;

  // ---- validation (mirror of the landing form's own gating, enforced server-side) ----
  if (!name) return bad('Guest name is required.');
  if (!EMAIL_RE.test(email)) return bad('A valid email address is required.');
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) return bad('Valid check-in and check-out dates are required.');
  if (new Date(checkOut) <= new Date(checkIn)) return bad('Check-out must be after check-in.');
  if (guests < 1 || guests > 20) return bad('Guest count is out of range.');

  try {
    // ---- 1. find or create the guest record (service role; RLS-exempt) ----
    let guestId: string | null = null;

    const lookup = await fetch(
      `${BASE}/guests?select=id&email=eq.${encodeURIComponent(email)}&tenant_id=eq.${TENANT}&limit=1`,
      { headers: svcHeaders() },
    );
    if (!lookup.ok) throw new Error(`guest lookup failed: ${lookup.status} ${await lookup.text()}`);
    const found = (await lookup.json()) as Array<{ id: string }>;

    if (found[0]?.id) {
      guestId = found[0].id;
    } else {
      const create = await fetch(`${BASE}/guests`, {
        method: 'POST',
        headers: svcHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify([{
          name, email, phone: phone || null, address: address || null,
          tenant_id: TENANT, total_stays: 0, total_spent: 0,
          loyalty_points: 0, outstanding_balance: 0, vip: false,
        }]),
      });
      if (!create.ok) {
        const errTxt = await create.text();
        // Returning guest / concurrent double-submit: unique(email,tenant_id) tripped between
        // the lookup and this insert. Re-query and reuse the existing row — never 500 a booking.
        if (create.status === 409 || /23505|guests_unique_real_email|duplicate key/i.test(errTxt)) {
          const relookup = await fetch(
            `${BASE}/guests?select=id&email=eq.${encodeURIComponent(email)}&tenant_id=eq.${TENANT}&limit=1`,
            { headers: svcHeaders() },
          );
          const again = relookup.ok ? ((await relookup.json()) as Array<{ id: string }>) : [];
          guestId = again[0]?.id ?? null;
          if (!guestId) throw new Error(`guest insert failed: ${create.status} ${errTxt}`);
        } else {
          throw new Error(`guest insert failed: ${create.status} ${errTxt}`);
        }
      } else {
        const created = (await create.json()) as Array<{ id: string }>;
        guestId = created[0]?.id ?? null;
      }
    }

    // ---- 2. insert the reservation (source MUST be 'WEBSITE' to satisfy the CHECK
    //         constraint and to make the CRM bell pick it up as an online booking) ----
    const resInsert = await fetch(`${BASE}/reservations`, {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify([{
        guest_name: name, email, phone: phone || null,
        room_type: roomType || null, check_in: checkIn, check_out: checkOut,
        guests, status: 'PENDING', source: 'WEBSITE',
        created_at: new Date().toISOString(), room_ids: [],
        guest_ids: guestId ? [guestId] : [], tenant_id: TENANT,
        fbp, fbc, // captured for later server-side Purchase dedup/attribution
      }]),
    });
    if (!resInsert.ok) {
      throw new Error(`reservation insert failed: ${resInsert.status} ${await resInsert.text()}`);
    }
    const rows = (await resInsert.json()) as Array<{ id: string }>;
    const reservationId = rows[0]?.id ?? null;

    // ---- 3. fire Meta CAPI Lead (fail-soft; event_id = reservationId so it dedups with
    //         the browser Pixel's Lead fired on the confirmation card). ----
    if (reservationId) {
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
      void sendCapiEvent({
        eventName: 'Lead',
        eventId: reservationId,
        actionSource: 'website',
        eventSourceUrl: req.headers.get('referer') || 'https://fountainbd.com',
        value: predictedValueBDT(roomType, checkIn, checkOut),
        currency: 'BDT',
        contentName: roomType || undefined,
        user: {
          email, phone, externalId: reservationId, fbp, fbc,
          ip, userAgent: req.headers.get('user-agent'),
          city: address || null, country: 'bd',
        },
      });
    }

    return NextResponse.json({ ok: true, reservationId });
  } catch (e) {
    // Real error, surfaced to the client AND the server logs — never swallowed.
    console.error('[/api/book] booking failed:', e);
    return bad('We could not complete your booking. Please try again or call the hotel.', 502);
  }
}
