import { NextResponse } from 'next/server';
import { insertReservation, insertNotification } from '@/services/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { guest_name, guest_email, guest_phone, room_category, check_in_date, check_out_date, num_guests, rate_per_night, special_requests } = body;

    if (!guest_name || !guest_email || !room_category || !check_in_date || !check_out_date || !num_guests || !rate_per_night) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const checkIn = new Date(check_in_date);
    const checkOut = new Date(check_out_date);
    if (checkOut <= checkIn) {
      return NextResponse.json({ error: 'Check-out date must be after check-in date.' }, { status: 400 });
    }

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const total_amount = nights * Number(rate_per_night);

    const reservation = await insertReservation({
      guest_name,
      guest_email,
      guest_phone: guest_phone ?? null,
      room_category,
      check_in_date,
      check_out_date,
      num_guests: Number(num_guests),
      rate_per_night: Number(rate_per_night),
      total_amount,
      special_requests: special_requests ?? null,
      status: 'pending',
    });

    try {
      await insertNotification({
        type: 'reservation',
        title: 'New Reservation Request',
        message: `${guest_name} has requested a ${room_category} room (${check_in_date} → ${check_out_date}, ${num_guests} guest${num_guests > 1 ? 's' : ''}). Total: Tk. ${total_amount.toLocaleString()}.`,
        reservation_id: reservation.id,
        is_read: false,
      });
    } catch (notifErr) {
      console.error('[Reservation] Notification insert failed:', notifErr);
    }

    return NextResponse.json({ success: true, message: 'Reservation submitted. Our team will confirm shortly.', reservation });
  } catch (err) {
    console.error('[Reservation] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { getAllReservations } = await import('@/services/supabase');
    const reservations = await getAllReservations();
    return NextResponse.json({ reservations });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
