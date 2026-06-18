import { NextResponse } from 'next/server';
import { getReservationById, updateReservation, insertTransaction, markNotificationRead, getAllNotifications } from '@/services/supabase';

export const dynamic = 'force-dynamic';

async function sendConfirmationEmail(params: { guestName: string; guestEmail: string; roomCategory: string; roomNumber: string; checkIn: string; checkOut: string; numGuests: number; totalAmount: number; ratePerNight: number }) {
  const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!makeWebhookUrl) { console.warn('[ConfirmEmail] MAKE_WEBHOOK_URL not set – email skipped.'); return; }

  const nights = Math.ceil((new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / (1000 * 60 * 60 * 24));

  const payload = {
    event: 'reservation_confirmed',
    to: params.guestEmail,
    subject: `Booking Confirmed – Hotel Fountain | Room ${params.roomNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0a0a0a;color:#ededed;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#06b6d4,#6366f1);padding:32px 24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:28px;">Booking Confirmed!</h1>
          <p style="color:rgba(255,255,255,0.8);margin-top:8px;">Hotel Fountain, Dhaka</p>
        </div>
        <div style="padding:32px 24px;">
          <p style="font-size:18px;">Dear <strong>${params.guestName}</strong>,</p>
          <p>Your reservation at <strong>Hotel Fountain</strong> is confirmed.</p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;background:rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;">
            <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8;">Room</td><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);font-weight:bold;">${params.roomCategory} – Room ${params.roomNumber}</td></tr>
            <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8;">Check-In</td><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);">${params.checkIn}</td></tr>
            <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8;">Check-Out</td><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);">${params.checkOut}</td></tr>
            <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8;">Nights</td><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);">${nights}</td></tr>
            <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8;">Guests</td><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);">${params.numGuests}</td></tr>
            <tr style="background:rgba(6,182,212,0.1);"><td style="padding:12px 16px;color:#06b6d4;font-weight:bold;">Total</td><td style="padding:12px 16px;color:#06b6d4;font-weight:bold;font-size:18px;">Tk. ${params.totalAmount.toLocaleString()}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:14px;">Questions? Email <a href="mailto:info@hotelfountainbd.com" style="color:#06b6d4;">info@hotelfountainbd.com</a></p>
          <p style="margin-top:24px;"><strong>Hotel Fountain Team</strong></p>
        </div>
      </div>`,
    reservation: params,
  };

  const axios = (await import('axios')).default;
  await axios.post(makeWebhookUrl, payload, { timeout: 10_000 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reservation_id, room_number, billing_notes } = body;

    if (!reservation_id || !room_number) {
      return NextResponse.json({ error: 'reservation_id and room_number are required.' }, { status: 400 });
    }

    const reservation = await getReservationById(reservation_id);
    if (!reservation) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
    if (reservation.status === 'confirmed') return NextResponse.json({ error: 'Already confirmed.' }, { status: 409 });

    const confirmed = await updateReservation(reservation_id, { room_number, status: 'confirmed' });

    try {
      await insertTransaction({ lead_id: reservation_id, room_number, check_in_date: reservation.check_in_date, check_out_date: reservation.check_out_date, amount: reservation.total_amount ?? reservation.rate_per_night, status: 'confirmed' });
    } catch (txErr) { console.error('[Confirm] Transaction sync failed:', txErr); }

    try {
      const notifications = await getAllNotifications();
      const related = notifications.find((n) => n.reservation_id === reservation_id && !n.is_read);
      if (related?.id) await markNotificationRead(related.id);
    } catch (notifErr) { console.error('[Confirm] Notification update failed:', notifErr); }

    try {
      await sendConfirmationEmail({ guestName: reservation.guest_name, guestEmail: reservation.guest_email, roomCategory: reservation.room_category, roomNumber: room_number, checkIn: reservation.check_in_date, checkOut: reservation.check_out_date, numGuests: reservation.num_guests, totalAmount: reservation.total_amount ?? reservation.rate_per_night, ratePerNight: reservation.rate_per_night });
    } catch (emailErr) { console.error('[Confirm] Email send failed:', emailErr); }

    return NextResponse.json({ success: true, message: `Room ${room_number} assigned. Confirmation email sent to ${reservation.guest_email}.`, reservation: confirmed, billing_notes: billing_notes ?? null });
  } catch (err) {
    console.error('[ReservationConfirm] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
