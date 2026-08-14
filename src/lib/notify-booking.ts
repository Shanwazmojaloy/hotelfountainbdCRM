// ---------------------------------------------------------------------------
// Website booking notifications  —  WhatsApp Cloud API + front-desk email.
//
// A reservation created from fountainbd.com must reach a human immediately on
// two independent channels. Both are FAIL-SOFT: a notification failure must
// never turn a successfully-persisted reservation into an error for the guest
// (that is the ৳13,600-class "swallowed success" bug in reverse).
//
// Channel 1 — WhatsApp Cloud API (Meta Graph):
//   WHATSAPP_PHONE_NUMBER_ID   WABA sender phone-number ID (NOT the recipient)
//   WHATSAPP_TOKEN             permanent System User token with whatsapp_business_messaging
//   HOTEL_WHATSAPP_TO          recipient MSISDN, digits only, no '+'  (default 8801322840799)
//   WHATSAPP_BOOKING_TEMPLATE  approved template name (default new_booking_alert)
//   WHATSAPP_TEMPLATE_LANG     template language code  (default en)
//   WHATSAPP_GRAPH_VERSION     Graph API version       (default v21.0)
//
//   Business-initiated messages outside a 24h customer-service window REQUIRE an
//   approved template, so the template path is the default. Set
//   WHATSAPP_ALLOW_TEXT=1 only if the desk number actively messages the WABA
//   number (then a free-form text is cheaper and needs no template).
//
// Channel 2 — front-desk email via the existing Google Workspace SMTP mailer.
//   HOTEL_BOOKING_EMAIL        recipient (default hotellfountainbd@gmail.com)
// ---------------------------------------------------------------------------
import { sendMail, isMailConfigured } from '@/lib/mailer';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_TEMPLATE = process.env.WHATSAPP_BOOKING_TEMPLATE || 'new_booking_alert';
const WA_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en';
const WA_ALLOW_TEXT = process.env.WHATSAPP_ALLOW_TEXT === '1';

/** Recipient MSISDN, digits only. Meta rejects a leading '+' or any separator. */
const WA_TO = (process.env.HOTEL_WHATSAPP_TO || '8801322840799').replace(/\D/g, '');

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

const bdt = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`;

export function isWhatsAppConfigured(): boolean {
  return Boolean(WA_PHONE_ID && WA_TOKEN && WA_TO);
}

/** Graph call with a hard timeout so a hung Meta edge can't eat the 30s budget. */
async function graphPost(payload: unknown, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${text}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Send the new-booking alert to the hotel's WhatsApp.
 * Template body expects 6 ordered variables:
 *   {{1}} guest name  {{2}} phone  {{3}} room type
 *   {{4}} check-in    {{5}} check-out  {{6}} guests + nights + value
 */
export async function sendBookingWhatsApp(b: BookingNotice): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.warn('[notify-booking] WhatsApp not configured — skipping (set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_TOKEN)');
    return;
  }

  const nights = nightsBetween(b.checkIn, b.checkOut);
  const summary = `${b.guests} guest(s), ${nights} night(s), est. ${bdt(b.valueBDT)}`;

  if (WA_ALLOW_TEXT) {
    await graphPost({
      messaging_product: 'whatsapp',
      to: WA_TO,
      type: 'text',
      text: {
        preview_url: false,
        body:
          `🔔 NEW WEBSITE BOOKING\n\n` +
          `Guest: ${b.name}\n` +
          `Phone: ${b.phone || '—'}\n` +
          `Email: ${b.email}\n` +
          `Room: ${b.roomType || '—'}\n` +
          `Check-in: ${b.checkIn}\n` +
          `Check-out: ${b.checkOut}\n` +
          `${summary}\n\n` +
          `Ref: ${b.reservationId}`,
      },
    });
    return;
  }

  await graphPost({
    messaging_product: 'whatsapp',
    to: WA_TO,
    type: 'template',
    template: {
      name: WA_TEMPLATE,
      language: { code: WA_LANG },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: b.name },
            { type: 'text', text: b.phone || 'not given' },
            { type: 'text', text: b.roomType || 'not specified' },
            { type: 'text', text: b.checkIn },
            { type: 'text', text: b.checkOut },
            { type: 'text', text: summary },
          ],
        },
      ],
    },
  });
}

/** Send the new-booking alert to the front-desk mailbox. */
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
      <h1 style="margin:10px 0 20px;font:400 24px/1.3 'Libre Baskerville',Georgia,serif;color:#1C1510">New website reservation</h1>
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

/**
 * Fire both channels concurrently, never throwing.
 * Returns per-channel outcome so the route can log precisely which leg failed.
 */
export async function notifyNewBooking(b: BookingNotice): Promise<{ whatsapp: boolean; email: boolean }> {
  const [wa, mail] = await Promise.allSettled([sendBookingWhatsApp(b), sendBookingEmail(b)]);
  if (wa.status === 'rejected') console.error('[notify-booking] whatsapp leg failed:', wa.reason);
  if (mail.status === 'rejected') console.error('[notify-booking] email leg failed:', mail.reason);
  return { whatsapp: wa.status === 'fulfilled', email: mail.status === 'fulfilled' };
}
