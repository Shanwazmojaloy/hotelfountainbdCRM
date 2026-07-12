// [Hotel-CRM] Channel Manager Phase 3 - Channex.io adapter
// Docs: https://docs.channex.io (API v1). Verified 2026-07-12.
//
// Inbound: Channex webhooks are THIN triggers ({booking_id, revision_id}) -
// resolveWebhook fetches the full Booking Revision, maps room_type_id ->
// Lumea category via channel_accounts.config.mappings, and the route acks
// the revision after successful processing. Feed poll = backstop.
//
// Security: Channex has NO HMAC signing. We register the webhook with a
// custom header (x-channel-signature: <secret>) and verify by constant-time
// equality. Fail-closed when the secret env is unset.
//
// Outbound: POST /availability with absolute per-date counts computed by
// the drainer from inventory_ledger (idempotent by design).
//
// channel_accounts contract for provider='channex':
//   credentials_ref      = env var NAME holding the user-api-key (default CHANNEX_API_KEY)
//   config.hotel_id      = Channex property_id (UUID)
//   config.api_base      = optional override; default staging
//   config.webhook_secret_ref = optional env NAME for the webhook header secret
//                               (default CHANNEL_WEBHOOK_SECRET)
//   config.mappings[]    = { category, cm_room_id: <room_type_id>, cm_rate_plan_id? }

import crypto from 'crypto';
import type {
  CMAdapter,
  ChannelAccountRow,
  ChannelEventType,
  InboundBooking,
} from '../adapter';

const STAGING_BASE = 'https://staging.channex.io/api/v1';

const BOOKING_EVENTS = [
  'booking',
  'booking_new',
  'booking_modification',
  'booking_cancellation',
];

const STATUS_MAP: Record<string, ChannelEventType> = {
  new: 'booking_created',
  modified: 'booking_modified',
  cancelled: 'booking_cancelled',
};

function apiBase(account: ChannelAccountRow): string {
  return (account.config.api_base as string) || STAGING_BASE;
}

function apiKey(account: ChannelAccountRow): string | null {
  const ref = account.credentials_ref || 'CHANNEX_API_KEY';
  return process.env[ref] || null;
}

function webhookSecret(account: ChannelAccountRow): string | null {
  const ref = (account.config.webhook_secret_ref as string) || 'CHANNEL_WEBHOOK_SECRET';
  return process.env[ref] || null;
}

/** Map a Channex Booking Revision (attributes) to the normalized shape.
 *  Multi-room revisions produce roomsDetail entries per room. */
function mapRevision(a: any, account: ChannelAccountRow): InboundBooking {
  const eventType = STATUS_MAP[a.status];
  if (!eventType) throw new Error(`CHANNEX_UNKNOWN_STATUS: ${a.status}`);

  const rooms: any[] = a.rooms || [];
  if (rooms.length === 0 && eventType !== 'booking_cancelled') {
    throw new Error('MALFORMED_PAYLOAD: revision has no rooms');
  }

  const roomsDetail = rooms.map((r) => {
    const mapping = (account.config.mappings || []).find(
      (m) => m.cm_room_id === r.room_type_id
    );
    if (!mapping) {
      throw new Error(`UNMAPPED_ROOM: room_type_id=${r.room_type_id ?? 'null'}`);
    }
    return { category: mapping.category, amount: Number(r.amount || 0) };
  });

  const guestName =
    [a.customer?.name, a.customer?.surname].filter(Boolean).join(' ').trim() ||
    'OTA Guest';

  return {
    eventType,
    externalEventId: String(a.system_id || a.id), // unique per revision
    externalBookingId: String(a.unique_id || a.booking_id), // stable across revisions
    category: roomsDetail[0]?.category || '',
    checkIn: a.arrival_date,
    checkOut: a.departure_date,
    guestName,
    phone: a.customer?.phone || null,
    email: a.customer?.mail || null, // Channex field is 'mail', not 'email'
    totalAmount: Number(a.amount || 0),
    commissionPct: 0, // ota_commission is an amount, not a pct
    ackRef: String(a.id),
    roomsDetail,
    raw: a,
  };
}

export const channexAdapter: CMAdapter = {
  provider: 'channex',

  verifyWebhook(request, _rawBody, account) {
    const secret = webhookSecret(account);
    if (!secret) return false; // fail closed
    const got = request.headers.get('x-channel-signature') || '';
    const a = Buffer.from(got);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  async resolveWebhook(rawBody, account) {
    let evt: any;
    try {
      evt = JSON.parse(rawBody);
    } catch {
      throw new Error('MALFORMED_PAYLOAD: not JSON');
    }

    // Non-booking events (ari, sync_error, reviews, ...) are ignored here;
    // Channex gets a 200 and does not retry.
    if (!BOOKING_EVENTS.includes(evt?.event)) return null;

    const revisionId = evt?.payload?.revision_id;
    if (!revisionId) throw new Error('MALFORMED_PAYLOAD: missing payload.revision_id');

    const key = apiKey(account);
    if (!key) throw new Error('CHANNEX_API_KEY_MISSING');

    // Webhook is a trigger only - always pull current state (docs: webhooks
    // can arrive out of order; never trust the event name for state).
    const res = await fetch(`${apiBase(account)}/booking_revisions/${revisionId}`, {
      headers: { 'user-api-key': key },
    });
    if (!res.ok) throw new Error(`CHANNEX_FETCH_FAILED: HTTP ${res.status}`);
    const body: any = await res.json();
    const a = body?.data?.attributes;
    if (!a) throw new Error('CHANNEX_FETCH_FAILED: empty revision');
    return mapRevision(a, account);
  },

  async pollFeed(account) {
    const key = apiKey(account);
    if (!key) return [];
    const res = await fetch(`${apiBase(account)}/booking_revisions/feed`, {
      headers: { 'user-api-key': key },
    });
    if (!res.ok) return [];
    const body: any = await res.json().catch(() => null);
    const out: InboundBooking[] = [];
    for (const row of body?.data || []) {
      try {
        out.push(mapRevision(row.attributes, account));
      } catch {
        // unmapped/malformed revisions stay unacked in the feed for a human
      }
    }
    return out;
  },

  async ackEvent(ackRef, account) {
    const key = apiKey(account);
    if (!key) return;
    // Best effort: unacked revisions stay in the feed (backstop), and
    // Channex emails a non_acked_booking warning after 30 min.
    await fetch(`${apiBase(account)}/booking_revisions/${ackRef}/ack`, {
      method: 'POST',
      headers: { 'user-api-key': key },
    }).catch(() => undefined);
  },

  async pushAvailability(update, account) {
    const key = apiKey(account);
    if (!key) return { ok: false, error: 'CHANNEX_API_KEY_MISSING' };

    const propertyId = account.config.hotel_id;
    if (!propertyId) return { ok: false, error: 'CONFIG_MISSING: hotel_id' };

    const mapping = (account.config.mappings || []).find(
      (m) => m.category === update.category
    );
    if (!mapping?.cm_room_id) {
      return { ok: false, error: `UNMAPPED_CATEGORY: ${update.category}` };
    }

    const counts = update.counts || [];
    if (counts.length === 0) return { ok: false, error: 'NO_COUNTS' };

    const values = counts.map((c) => ({
      property_id: propertyId,
      room_type_id: mapping.cm_room_id,
      date: c.date,
      availability: Math.max(0, Math.trunc(c.available)),
    }));

    const res = await fetch(`${apiBase(account)}/availability`, {
      method: 'POST',
      headers: { 'user-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    const body: any = await res.json().catch(() => null);

    if (!res.ok) {
      const detail = JSON.stringify(body?.errors || '').slice(0, 300);
      return { ok: false, error: `CHANNEX_PUSH_HTTP_${res.status}: ${detail}` };
    }
    // Channex returns 200 even when entries were dropped - warnings matter.
    const warnings = body?.meta?.warnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
      return { ok: false, error: `CHANNEX_WARNINGS: ${JSON.stringify(warnings).slice(0, 300)}` };
    }
    return { ok: true };
  },
};
