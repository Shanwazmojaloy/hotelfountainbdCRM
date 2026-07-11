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
  raw: unknown;
}

export interface AvailabilityUpdate {
  category: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD exclusive
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
  /** Throws on malformed payload (caller returns 400). */
  parseWebhook(rawBody: string, account: ChannelAccountRow): InboundBooking;
  pushAvailability(update: AvailabilityUpdate, account: ChannelAccountRow): Promise<PushResult>;
}

import { mockAdapter } from './adapters/mock';

const registry: Record<string, CMAdapter> = {
  [mockAdapter.provider]: mockAdapter,
};

export function getAdapter(provider: string): CMAdapter | null {
  return registry[provider] ?? null;
}
