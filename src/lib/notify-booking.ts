// ---------------------------------------------------------------------------
// Website booking notification  —  front-desk email.
//
// A reservation created from fountainbd.com must reach a human immediately.
// This is FAIL-SOFT: a notification failure must never turn a successfully
// persisted reservation into an error for the guest (that is the ৳13,600-class
// "swallowed success" bug in reverse).
//
// Delivery goes through the shared Google Workspace SMTP mailer (src/lib/mailer.ts).
//   HOTEL_BOOKING_EMAIL   recipient (default hotellfountainbd@gmail.com)
//
// NOTE (2026-08-14): a WhatsApp Cloud API leg was built and then removed at the
// owner's request — email only. Reinstating it would need a SECOND phone number
// registered as the WABA sender (a Cloud-API number stops working in the normal
// WhatsApp app, so the desk's own 8801322840799 can only ever be the recipient)
// plus an approved message template. See git history for the original module.
// ---------------------------------------------------------------------------
import { sendMail, isMailConfigured } from '@/lib/mailer';

const BOOKING_EMAIL = process.env.HOTEL_BOOKING_EMAIL || 'hotellfountainbd@gmail.com';

export interface BookingNotice {
  reservationId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  valueBDT: number;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(
    1,
    Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000),
  );
}

const bdt = (n: number) => `BDT ${Math.round(n).toLocaleString('en-US')}`;

/** Send the new-booking alert to the front-desk mailbox. Throws on SMTP rejection. */
export async function sendBookingEmail(b: BookingNotice): Promise<void> {
  if (!isMailConfigured()) {
    console.warn('[notify-booking] SMTP not configured — skipping booking email');
    return;
  }

  const nights = nightsBetween(b.checkIn, b.checkOut);
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#8A8175;font:12px/1.5 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap">${k}</td>` +
    `<td style="padding:6px 0;color:#1C1510;font:14px/1.5 -apple-system,Segoe UI,sans-serif"><strong>${v}</strong></td></tr>`;

  const html = `
  <div style="background:#FBF9F4;padding:28px 0">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #EAE6DD;border-radius:4px;padding:2rem">
      <div style="font:12px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#B08D57">Hotel Fountain — fountainbd.com</div>
      <h1 style="margin:10px 0 20px;font:400 24px/1.3 Georgia,'Libre Baskerville',serif;color:#1C1510">New website reservation</h1>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        ${row('Guest', b.name)}
        ${row('Phone', b.phone || '—')}
        ${row('Email', b.email)}
        ${row('Address', b.address || '—')}
        ${row('Room type', b.roomType || 'Not specified')}
        ${row('Check-in', b.checkIn)}
        ${row('Check-out', b.checkOut)}
        ${row('Nights', String(nights))}
        ${row('Guests', String(b.guests))}
        ${row('Est. value', bdt(b.valueBDT))}
        ${row('Status', 'PENDING — needs confirmation')}
      </table>
      <p style="margin:22px 0 0;font:13px/1.6 -apple-system,Segoe UI,sans-serif;color:#5A5248">
        Open it in the CRM:
        <a href="https://lumea.fountainbd.com/crm/reservations" style="color:#B08D57">Reservations</a>
      </p>
      <p style="margin:14px 0 0;font:11px/1.5 ui-monospace,'IBM Plex Mono',monospace;color:#8A8175">Ref ${b.reservationId}</p>
    </div>
  </div>`;

  const text =
    `NEW WEBSITE RESERVATION\n\n` +
    `Guest:      ${b.name}\n` +
    `Phone:      ${b.phone || '-'}\n` +
    `Email:      ${b.email}\n` +
    `Address:    ${b.address || '-'}\n` +
    `Room type:  ${b.roomType || 'Not specified'}\n` +
    `Check-in:   ${b.checkIn}\n` +
    `Check-out:  ${b.checkOut}\n` +
    `Nights:     ${nights}\n` +
    `Guests:     ${b.guests}\n` +
    `Est. value: ${bdt(b.valueBDT)}\n` +
    `Status:     PENDING\n\n` +
    `Ref ${b.reservationId}\n`;

  await sendMail({
    to: BOOKING_EMAIL,
    subject: `New booking — ${b.name}, ${b.checkIn} → ${b.checkOut} (${b.roomType || 'room TBD'})`,
    replyTo: b.email,
    html,
    text,
  });
}

/** Notify the front desk. Never throws — returns whether the email was accepted. */
export async function notifyNewBooking(b: BookingNotice): Promise<{ email: boolean }> {
  try {
    await sendBookingEmail(b);
    return { email: true };
  } catch (e) {
    console.error('[notify-booking] front-desk email failed:', e);
    return { email: false };
  }
}
