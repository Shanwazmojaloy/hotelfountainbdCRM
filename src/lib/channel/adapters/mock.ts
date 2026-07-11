// [Hotel-CRM] Channel Manager Phase 2 - mock adapter
// Dry-run provider used until a real CM contract is signed.
// Webhook auth: HMAC-SHA256 of the raw body with the secret named by
// channel_accounts.credentials_ref (default env CHANNEL_WEBHOOK_SECRET),
// sent in the x-channel-signature header (hex). Fails CLOSED.

import crypto from 'crypto';
import type {
  CMAdapter,
  ChannelAccountRow,
  ChannelEventType,
  InboundBooking,
} from '../adapter';

const EVENT_TYPES: ChannelEventType[] = [
  'booking_created',
  'booking_modified',
  'booking_cancelled',
];

function secretFor(account: ChannelAccountRow): string | null {
  const ref = account.credentials_ref || 'CHANNEL_WEBHOOK_SECRET';
  return process.env[ref] || null;
}

function req(v: unknown, field: string): string {
  const s = v == null ? '' : String(v).trim();
  if (!s) throw new Error(`MALFORMED_PAYLOAD: missing ${field}`);
  return s;
}

export const mockAdapter: CMAdapter = {
  provider: 'mock',

  verifyWebhook(request, rawBody, account) {
    const secret = secretFor(account);
    if (!secret) return false; // fail closed: unset secret = reject all
    const sig = request.headers.get('x-channel-signature') || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  parseWebhook(rawBody, _account) {
    const p = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = req(p.event_type, 'event_type') as ChannelEventType;
    if (!EVENT_TYPES.includes(eventType)) {
      throw new Error(`MALFORMED_PAYLOAD: unknown event_type ${eventType}`);
    }
    const booking: InboundBooking = {
      eventType,
      externalEventId: req(p.event_id, 'event_id'),
      externalBookingId: req(p.booking_id, 'booking_id'),
      category: req(p.category, 'category'),
      checkIn: req(p.check_in, 'check_in'),
      checkOut: req(p.check_out, 'check_out'),
      guestName: eventType === 'booking_created' ? req(p.guest_name, 'guest_name') : String(p.guest_name || ''),
      phone: (p.phone as string) || null,
      email: (p.email as string) || null,
      totalAmount: Number(p.total_amount || 0),
      commissionPct: Number(p.commission_pct || 0),
      raw: p,
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(booking.checkOut)) {
      throw new Error('MALFORMED_PAYLOAD: dates must be YYYY-MM-DD');
    }
    return booking;
  },

  async pushAvailability(update, account) {
    // Dry run: no external CM yet. Log for observability; report success
    // so the queue drains. Swap for a real HTTP call in the live adapter.
    console.log(
      `[channel:mock] pushAvailability channel=${account.channel} ` +
      `category=${update.category} from=${update.from} to=${update.to}`
    );
    return { ok: true };
  },
};
