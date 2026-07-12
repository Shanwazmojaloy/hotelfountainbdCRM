// [Hotel-CRM] Channel Manager Phase 2 - CM adapter contract
// Bridge Booking = brain; the rented CM is plumbing behind this interface.
// Add a real provider by implementing CMAdapter and registering it below.

export type ChannelEventType =
  | 'booking_created'
  | 'booking_modified'
  | 'booking_cancelled';

/** Normalized inbound booking, already mapped to Lumea vocabulary. */
export interface InboundBooking {
  eventType: ChannelEventType;
  /** CM-side event id - dedup key for sync_queue inbound rows. */
  externalEventId: string;
  /** CM-side booking reference - maps to reservations.external_booking_id. */
  externalBookingId: string;
  /** Lumea room category (adapter resolves CM room id -> category via account config.mappings). */
  category: string;
  /** YYYY-MM-DD */
  checkIn: string;
  /** YYYY-MM-DD, exclusive (checkout day). */
  checkOut: string;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  /** BDT */
  totalAmount?: number;
  commissionPct?: number;
  /** Provider-side reference to acknowledge after successful processing
   *  (e.g. Channex booking revision id). */
  ackRef?: string;
  /** Per-room breakdown for multi-room bookings. When length > 1 the
   *  processor fans out ONE reservation PER ROOM (owner house rule),
   *  suffixing external ids with #1, #2, ... */
  roomsDetail?: { category: string; amount: number }[];
  raw: unknown;
}

export interface AvailabilityUpdate {
  category: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD exclusive
  /** Absolute free-unit counts per date, computed from inventory_ledger
   *  by the drainer. Adapters push these as-is (idempotent by design). */
  counts?: { date: string; available: number }[];
}

export interface CategoryMapping {
  category: string;
  cm_room_id?: string;
  cm_rate_plan_id?: string;
}

/** Row shape of public.channel_accounts. */
export interface ChannelAccountRow {
  id: string;
  tenant_id: string;
  provider: string;
  channel: string;
  status: string;
  config: { hotel_id?: string; mappings?: CategoryMapping[] } & Record<string, unknown>;
  credentials_ref: string | null;
}

export interface PushResult {
  ok: boolean;
  error?: string;
}

export interface CMAdapter {
  provider: string;
  /** MUST fail closed: no secret configured => false. */
  verifyWebhook(req: Request, rawBody: string, account: ChannelAccountRow): boolean;
  /** Sync parse when the webhook body carries the full booking.
   *  Throws MALFORMED_PAYLOAD on bad input (caller returns 400). */
  parseWebhook?(rawBody: string, account: ChannelAccountRow): InboundBooking;
  /** Async resolve when the webhook is a thin trigger and the booking must
   *  be fetched from the provider API (e.g. Channex booking revisions).
   *  Return null to ignore a non-booking event (caller returns 200).
   *  Throw MALFORMED_PAYLOAD* for 400; any other error => 500 (provider retries). */
  resolveWebhook?(rawBody: string, account: ChannelAccountRow): Promise<InboundBooking | null>;
  /** Acknowledge a processed event upstream (best effort). */
  ackEvent?(ackRef: string, account: ChannelAccountRow): Promise<void>;
  /** Pull-based backstop: fetch unacknowledged booking events from the
   *  provider (e.g. Channex booking revisions feed). */
  pollFeed?(account: ChannelAccountRow): Promise<InboundBooking[]>;
  pushAvailability(update: AvailabilityUpdate, account: ChannelAccountRow): Promise<PushResult>;
}

import { mockAdapter } from './adapters/mock';
import { channexAdapter } from './adapters/channex';

const registry: Record<string, CMAdapter> = {
  [mockAdapter.provider]: mockAdapter,
  [channexAdapter.provider]: channexAdapter,
};

export function getAdapter(provider: string): CMAdapter | null {
  return registry[provider] ?? null;
}
