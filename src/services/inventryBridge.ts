/**
 * inventryBridge.ts
 * Hotel Fountain CRM ↔ MojaInventry Integration
 *
 * This service is the single entry point for all inventory sync events.
 * It writes events to the bridge_events Supabase queue and dispatches them
 * to the MojaInventry REST API.
 *
 * Intentionally modelled after make.ts — same shape, same error handling style.
 * See docs/mojaInventry-bridge.md for full architecture notes.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// ── Supabase client ────────────────────────────────────────────────────────────
// Uses the service role key so bridge_events can be written server-side.
// The browser anon key is blocked by RLS on this table by design.
const supabaseUrl = process.env.SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── MojaInventry API config ────────────────────────────────────────────────────
const INVENTRY_API_URL = process.env.MOJAINVENTRY_API_URL ?? '';
const INVENTRY_API_KEY = process.env.MOJAINVENTRY_API_KEY ?? '';

// Max retries before a bridge event is permanently marked 'failed'
const MAX_RETRY_COUNT = 3;

// ── Types ──────────────────────────────────────────────────────────────────────

export type BridgeEventType =
  | 'checkout'
  | 'supplier_order'
  | 'night_audit'
  | 'maintenance';

export interface BridgeEventPayload {
  [key: string]: unknown;
}

export interface BridgeEvent {
  id: string;
  event_type: BridgeEventType;
  source_app: string;
  target_app: string;
  payload: BridgeEventPayload;
  status: 'pending' | 'sent' | 'failed' | 'acknowledged';
  retry_count: number;
  error_message: string | null;
  tenant_id: string | null;
  created_at: string;
  processed_at: string | null;
}

// ── 1. logBridgeEvent ──────────────────────────────────────────────────────────
/**
 * Write a new event to the bridge_events queue.
 * Called immediately after the triggering CRM operation (e.g. doCheckout).
 *
 * @returns The new event's UUID, or null if the insert failed.
 *
 * @example
 * const eventId = await logBridgeEvent('checkout', {
 *   room_number: '201',
 *   room_type: 'Deluxe Double',
 *   reservation_id: activeRes.id,
 *   ...
 * });
 */
export async function logBridgeEvent(
  eventType: BridgeEventType,
  payload: BridgeEventPayload
): Promise<string | null> {
  if (!supabaseServiceKey) {
    console.warn('[inventryBridge] SUPABASE_SERVICE_ROLE_KEY is not configured.');
    return null;
  }

  const { data, error } = await supabase
    .from('bridge_events')
    .insert([{ event_type: eventType, payload }])
    .select('id')
    .single();

  if (error) {
    console.error('[inventryBridge] Failed to log bridge event:', error.message);
    return null;
  }

  console.log(`[inventryBridge] Event logged — id: ${data.id}, type: ${eventType}`);
  return data.id as string;
}

// ── 2. syncToMojaInventry ──────────────────────────────────────────────────────
/**
 * Fetch a queued event and POST it to the MojaInventry REST API.
 * Updates the event's status to 'sent' on success, 'failed' after MAX_RETRY_COUNT.
 *
 * @returns true if the delivery succeeded, false otherwise.
 *
 * @example
 * const eventId = await logBridgeEvent('checkout', payload);
 * if (eventId) await syncToMojaInventry(eventId);
 */
export async function syncToMojaInventry(eventId: string): Promise<boolean> {
  if (!INVENTRY_API_URL || !INVENTRY_API_KEY) {
    console.warn('[inventryBridge] MOJAINVENTRY_API_URL or MOJAINVENTRY_API_KEY is not configured.');
    return false;
  }

  // 1. Fetch the event from the queue
  const { data: event, error: fetchError } = await supabase
    .from('bridge_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    console.error(`[inventryBridge] Could not fetch event ${eventId}:`, fetchError?.message);
    return false;
  }

  // 2. POST to MojaInventry API
  try {
    const response = await fetch(`${INVENTRY_API_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INVENTRY_API_KEY}`,
      },
      body: JSON.stringify({
        event_type: event.event_type,
        payload: event.payload,
        source_event_id: event.id,
        source_app: event.source_app,
      }),
    });

    // 3. Success: mark as sent
    if (response.ok) {
      const { error: updateError } = await supabase
        .from('bridge_events')
        .update({
          status: 'sent',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', eventId);

      if (updateError) {
        console.error(`[inventryBridge] Sent to MojaInventry but failed to update status for ${eventId}:`, updateError.message);
      } else {
        console.log(`[inventryBridge] Event ${eventId} delivered successfully.`);
      }
      return true;
    }

    // Non-2xx response — treat as failure
    const errorBody = await response.text();
    throw new Error(`MojaInventry returned ${response.status}: ${errorBody}`);

  } catch (err) {
    // 4. Failure: increment retry_count, mark failed if exhausted
    const errorMessage = err instanceof Error ? err.message : String(err);
    const newRetryCount = (event.retry_count ?? 0) + 1;
    const newStatus = newRetryCount >= MAX_RETRY_COUNT ? 'failed' : 'pending';

    const { error: retryUpdateError } = await supabase
      .from('bridge_events')
      .update({
        status: newStatus,
        retry_count: newRetryCount,
        error_message: errorMessage,
        processed_at: newStatus === 'failed' ? new Date().toISOString() : null,
      })
      .eq('id', eventId);

    if (retryUpdateError) {
      console.error(`[inventryBridge] Failed to record retry for event ${eventId}:`, retryUpdateError.message);
    }

    console.error(
      `[inventryBridge] Delivery failed for event ${eventId} (attempt ${newRetryCount}/${MAX_RETRY_COUNT}): ${errorMessage}`
    );

    // 5. Return false — caller can decide whether to alert
    return false;
  }
}

// ── 3. getBridgeEventStatus ────────────────────────────────────────────────────
/**
 * Look up the current status of a bridge event by ID.
 * Useful for polling from the frontend or a retry dashboard.
 *
 * @returns The status string ('pending' | 'sent' | 'failed' | 'acknowledged'),
 *          or null if the event does not exist.
 */
export async function getBridgeEventStatus(eventId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('bridge_events')
    .select('status')
    .eq('id', eventId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Row not found
    console.error(`[inventryBridge] Error fetching status for event ${eventId}:`, error.message);
    return null;
  }

  return data?.status ?? null;
}

// ── 4. getPendingBridgeEvents ──────────────────────────────────────────────────
/**
 * Return all events with status 'pending' or 'failed', ordered oldest-first.
 * Used by the retry dashboard and the Phase 2 Edge Function sweep.
 *
 * Only returns events that still have retries remaining (retry_count < MAX_RETRY_COUNT).
 *
 * @returns An array of BridgeEvent rows (empty array on error).
 */
export async function getPendingBridgeEvents(): Promise<BridgeEvent[]> {
  const { data, error } = await supabase
    .from('bridge_events')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('retry_count', MAX_RETRY_COUNT)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[inventryBridge] Error fetching pending events:', error.message);
    return [];
  }

  return (data ?? []) as BridgeEvent[];
}

// ── Convenience: log + sync in one call ───────────────────────────────────────
/**
 * Shorthand that logs a bridge event and immediately attempts delivery.
 * Use this for Phase 1 inline calls from doCheckout() where you want
 * fire-and-forget behaviour with no await needed on the sync step.
 *
 * @example
 * // Non-blocking: don't await the sync, just log the event
 * const eventId = await logBridgeEvent('checkout', payload);
 * if (eventId) syncToMojaInventry(eventId); // intentionally not awaited
 */
export async function logAndSync(
  eventType: BridgeEventType,
  payload: BridgeEventPayload
): Promise<{ eventId: string | null; delivered: boolean }> {
  const eventId = await logBridgeEvent(eventType, payload);
  if (!eventId) return { eventId: null, delivered: false };

  const delivered = await syncToMojaInventry(eventId);
  return { eventId, delivered };
}
