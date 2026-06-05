// ─────────────────────────────────────────────────────────────────────────────
// Lumea — POST /api/book
// Server-side website booking. Validates input, enforces source='WEBSITE',
// inserts with the service role, and returns real errors (no silent failures).
// The DB trigger trg_notify_new_booking fires the staff push on insert.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SR      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT  = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const ROOM_TYPES = ['Fountain Deluxe', 'Premium Deluxe', 'Superior Deluxe', 'Twin Deluxe', 'Royal Suite'];

function sb(path: string, init?: RequestInit) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!SR) return NextResponse.json({ error: 'Booking service not configured.' }, { status: 500 });

    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const name     = String(b.name || '').trim();
    const email    = String(b.email || '').trim().toLowerCase();
    const phone    = String(b.phone || '').trim();
    const address  = String(b.address || '').trim();
    const roomType = String(b.room_type || '').trim();
    const checkIn  = String(b.check_in || '').slice(0, 10);
    const checkOut = String(b.check_out || '').slice(0, 10);
    const guests   = Math.max(1, Math.min(12, parseInt(String(b.guests ?? '2'), 10) || 2));

    if (name.length < 2) return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    if (roomType && !ROOM_TYPES.includes(roomType)) return NextResponse.json({ error: 'Unknown room type.' }, { status: 400 });
    if (!checkIn || !checkOut) return NextResponse.json({ error: 'Please select check-in and check-out dates.' }, { status: 400 });
    if (new Date(checkOut) <= new Date(checkIn)) return NextResponse.json({ error: 'Check-out must be after check-in.' }, { status: 400 });

    // Find or create the guest record.
    let guestId: string | null = null;
    const gq = await sb(`guests?email=eq.${encodeURIComponent(email)}&tenant_id=eq.${TENANT}&select=id&limit=1`);
    const gex = await gq.json().catch(() => []);
    if (Array.isArray(gex) && gex[0]?.id) {
      guestId = gex[0].id;
    } else {
      const gi = await sb('guests', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{ name, email, phone, address: address || null, tenant_id: TENANT, total_stays: 0, total_spent: 0, loyalty_points: 0, outstanding_balance: 0, vip: false }]),
      });
      if (gi.ok) { const gr = await gi.json().catch(() => []); guestId = gr?.[0]?.id || null; }
    }

    // Insert the reservation (PENDING / WEBSITE).
    const ri = await sb('reservations', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        guest_name: name, email, phone, room_type: roomType || null,
        check_in: checkIn, check_out: checkOut, guests,
        status: 'PENDING', source: 'WEBSITE', room_ids: [], guest_ids: guestId ? [guestId] : [],
        tenant_id: TENANT,
      }]),
    });
    if (!ri.ok) {
      const detail = await ri.text().catch(() => '');
      console.error('Booking insert failed', ri.status, detail);
      return NextResponse.json({ error: 'Sorry, we could not submit your booking. Please call +880 1322-840799.' }, { status: 502 });
    }
    const rr = await ri.json().catch(() => []);
    return NextResponse.json({ ok: true, id: rr?.[0]?.id || null });
  } catch (e) {
    console.error('Booking route error', e);
    return NextResponse.json({ error: 'Unexpected error. Please try again.' }, { status: 500 });
  }
}
