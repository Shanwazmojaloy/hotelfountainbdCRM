# MojaInventry Bridge — Architecture Document

**Project:** Hotel Fountain CRM ↔ MojaInventry Integration  
**Version:** 1.0 (Phase 1 Design)  
**Date:** April 2026  
**Status:** Architecture / Pre-build

---

## Overview

The MojaInventry Bridge is a lightweight event-driven integration layer that keeps Hotel Fountain's CRM and its inventory management system (MojaInventry) in sync — automatically, without manual data entry.

**The core problem it solves:** Hotel operations consume physical stock constantly — housekeeping uses cleaning supplies after every checkout, maintenance jobs burn through spare parts, night audit closes off daily F&B consumption, and supplier orders need to land in inventory as purchase orders. Today, none of this flows automatically into MojaInventry. Staff either double-enter data or skip it entirely, causing inventory drift.

**What the bridge does:** Every time a meaningful operational event fires inside the Hotel Fountain CRM, the bridge intercepts it, packages the relevant data into a structured payload, writes it to a shared `bridge_events` queue in Supabase, and dispatches an HTTP call to MojaInventry's REST API to trigger the corresponding inventory action. If the call fails, it retries. Everything is logged. Nothing is lost.

---

## Architecture Principles

The bridge is designed around three constraints specific to this codebase:

1. **No new infrastructure.** The CRM already runs on Supabase + Make.com webhooks. The bridge reuses both — Supabase as the event queue and Make.com (optionally) as a relay for complex multi-step flows.

2. **Decoupled by default.** The CRM never calls MojaInventry directly. It writes to `bridge_events`. A separate bridge service reads from that queue and handles delivery. This means a MojaInventry outage never breaks the CRM.

3. **Mirrored service pattern.** The bridge service (`inventryBridge.ts`) is intentionally modelled after `make.ts` — same shape, same error handling style — so any developer on this codebase can maintain it without learning new patterns.

---

## Sync Events

| Hotel Fountain CRM Event | Trigger Point | MojaInventry Action | Priority |
|---|---|---|---|
| **Room checkout** | `doCheckout()` in App.jsx completes → room moves to Dirty | Deduct: 1× cleaning supply set (soap, linen, toiletries) per room type | **Phase 1** |
| **Supplier order placed** | Suppliers page — order submitted | Create purchase order record in MojaInventry with line items + supplier ref | Phase 2 |
| **Night Audit closed** | Night audit workflow completes | Sync daily consumption report (F&B, amenities) to inventory | Phase 2 |
| **Maintenance task logged** | Housekeeping task type = 'Maintenance', 'AC Repair', or 'Plumbing' | Deduct: maintenance parts from category-mapped SKU list | Phase 2 |

### Event Payload Shapes

**checkout event:**
```json
{
  "room_number": "201",
  "room_type": "Deluxe Double",
  "reservation_id": "uuid",
  "guest_name": "John Doe",
  "nights_stayed": 2,
  "checkout_time": "2026-04-13T10:30:00+06:00",
  "housekeeping_required": true
}
```

**supplier_order event:**
```json
{
  "supplier_id": "uuid",
  "supplier_name": "Dhaka Cleaning Supplies Ltd.",
  "order_items": [
    { "sku": "CS-001", "name": "Liquid Soap 5L", "qty": 12, "unit_price": 350 }
  ],
  "total_amount": 4200,
  "order_date": "2026-04-13",
  "expected_delivery": "2026-04-16"
}
```

**night_audit event:**
```json
{
  "audit_date": "2026-04-13",
  "rooms_occupied": 18,
  "rooms_checked_out": 4,
  "fnb_consumption": [
    { "category": "Breakfast", "covers": 22 },
    { "category": "Room Service", "orders": 7 }
  ],
  "total_revenue": 84500
}
```

**maintenance event:**
```json
{
  "task_id": "uuid",
  "room_number": "105",
  "task_type": "AC Repair",
  "reported_by": "HK Staff",
  "parts_category": "HVAC",
  "estimated_parts": ["AC Filter", "Thermostat Wire"],
  "logged_at": "2026-04-13T14:22:00+06:00"
}
```

---

## Data Flow

```
Hotel Fountain CRM (Next.js 16 / App.jsx)
         │
         │  1. Operational event fires
         │     (checkout, supplier order, night audit, maintenance)
         ▼
  inventryBridge.ts → logBridgeEvent()
         │
         │  2. Writes event to Supabase bridge_events table
         │     (status = 'pending', payload = JSON)
         ▼
  Supabase: bridge_events table
         │
         │  3a. Immediate: syncToMojaInventry() called inline
         │  3b. Fallback: Supabase Edge Function polls pending events
         │      every 5 min (or Make.com scenario watches the table)
         ▼
  Bridge Service: syncToMojaInventry()
         │
         ├──▶  MojaInventry REST API
         │     POST /api/inventory/deduct     ← for checkout / maintenance
         │     POST /api/purchase-orders      ← for supplier orders
         │     POST /api/reports/consumption  ← for night audit
         │
         └──▶  bridge_events table updated
               status = 'sent' | 'failed'
               processed_at = NOW()
               retry_count incremented on failure
```

### Make.com Integration (Optional Relay)

The existing `make.ts` pattern can be extended for MojaInventry events that need multi-step orchestration (e.g., supplier order → notify procurement manager → update MojaInventry → log in Google Sheets). In that case, `inventryBridge.ts` posts to a dedicated Make.com scenario webhook, and Make handles the multi-destination fan-out.

---

## Shared Schema: bridge_events Table

The `bridge_events` table lives in the same Supabase project as the Hotel Fountain CRM. It acts as a **durable event queue** — events are written atomically with the CRM operation that triggers them, so no event is lost even if MojaInventry is temporarily unavailable.

See `db/bridge_events.sql` for the full DDL.

**Key design decisions:**

- `payload JSONB` — flexible enough to hold any event shape without schema migrations as the integration grows
- `status` with a CHECK constraint — prevents invalid states from being written
- `retry_count` — the bridge service increments this on each failed delivery attempt; after 3 retries, the status moves to `'failed'` and an alert fires (Phase 2: Slack/email notification)
- `processed_at` — allows the Make.com scenario or Edge Function to query `WHERE status = 'pending' AND created_at < NOW() - INTERVAL '5 minutes'` for retry sweeps
- `source_app` / `target_app` fields — future-proofs the table for bidirectional sync (MojaInventry → CRM) or additional target systems

**Recommended indexes (Phase 2):**
```sql
CREATE INDEX idx_bridge_events_status ON bridge_events(status);
CREATE INDEX idx_bridge_events_created_at ON bridge_events(created_at DESC);
CREATE INDEX idx_bridge_events_event_type ON bridge_events(event_type);
```

---

## Authentication Strategy

### API Key Management

MojaInventry API credentials must never be hardcoded or committed to the repository.

**Development:** Store in `.env.local` (gitignored). Reference `process.env.MOJAINVENTRY_API_KEY`.

**Production (Vercel):** Add `MOJAINVENTRY_API_URL` and `MOJAINVENTRY_API_KEY` as Vercel Environment Variables via the dashboard. They are injected at build/runtime and never exposed to the client.

**Supabase Edge Functions:** If the retry sweep runs as an Edge Function (like `wf-seo-lead-morning`), add the keys as Supabase Secrets via `supabase secrets set MOJAINVENTRY_API_KEY=...`.

### Request Signing (Phase 2)

Once the integration is live and handling real inventory data, add HMAC-SHA256 request signing:

```typescript
// Each outbound request includes:
headers: {
  'X-MojaInventry-Key': process.env.MOJAINVENTRY_API_KEY,
  'X-Request-Timestamp': Date.now().toString(),
  'X-Signature': hmacSha256(payload + timestamp, signingSecret)
}
```

MojaInventry validates the signature + timestamp (reject if > 5 min old) to prevent replay attacks.

### Supabase Row-Level Security

The `bridge_events` table should only be writable by the service role key (used server-side in `inventryBridge.ts`), not the anon key used in the browser. Add an RLS policy:

```sql
ALTER TABLE bridge_events ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/update
CREATE POLICY "service_only" ON bridge_events
  USING (auth.role() = 'service_role');
```

---

## Phase 1 — Checkout → Inventory Deduction

**What to build first:** The room checkout trigger. This is the highest-frequency event in any hotel (every occupied room generates one per stay) and the most predictable payload — making it the safest, highest-ROI starting point.

**Exact integration point in App.jsx:**

The `doCheckout()` function already exists and successfully completes the checkout flow. The bridge call should be added as a non-blocking side-effect after the Supabase writes succeed:

```typescript
// After existing checkout logic completes in doCheckout():
import { logBridgeEvent } from '../services/inventryBridge';

await logBridgeEvent('checkout', {
  room_number: room.room_number,
  room_type: room.room_type,
  reservation_id: activeRes.id,
  guest_name: guestName,
  nights_stayed: nights,
  checkout_time: new Date().toISOString(),
  housekeeping_required: true,
});
```

**What MojaInventry does with it:** Deducts 1× cleaning supply set from inventory, keyed by room type (Standard set vs. Deluxe set vs. Suite set). The SKU mapping lives in MojaInventry and doesn't need to be replicated in the CRM.

**Definition of done for Phase 1:**
- [ ] `bridge_events` table created in Supabase
- [ ] `inventryBridge.ts` service deployed
- [ ] `doCheckout()` in App.jsx calls `logBridgeEvent('checkout', ...)`
- [ ] MojaInventry receives POST and deducts inventory
- [ ] `bridge_events` row updated to `status = 'sent'`
- [ ] Manual test: check out a test room, confirm deduction in MojaInventry dashboard

---

## Phase 2 — Full Integration

After Phase 1 is stable (1–2 weeks of live data), proceed with:

1. **Supplier order sync** — wire up the Suppliers page submit handler to emit a `supplier_order` event. MojaInventry creates a purchase order, stock levels update on delivery confirmation.

2. **Night audit sync** — add a bridge call to the night audit close action. MojaInventry receives a daily consumption summary and adjusts running totals.

3. **Maintenance parts deduction** — when a housekeeping task of type `Maintenance`, `AC Repair`, or `Plumbing` is marked complete, emit a `maintenance` event. MojaInventry deducts from a category-mapped parts inventory.

4. **Retry sweep Edge Function** — deploy a Supabase Edge Function (scheduled, like `wf-seo-lead-morning`) that polls `bridge_events WHERE status = 'pending' AND retry_count < 3` every 5 minutes and retries failed deliveries.

5. **Bidirectional low-stock alerts** — MojaInventry posts a webhook to the CRM when any tracked SKU falls below reorder threshold. CRM surfaces an alert on the Suppliers page.

6. **HMAC request signing** — harden the outbound API calls as described in the Authentication section above.

---

## Files Created by This Architecture Plan

| File | Purpose |
|---|---|
| `docs/mojaInventry-bridge.md` | This document |
| `db/bridge_events.sql` | Supabase table DDL for the event queue |
| `src/services/inventryBridge.ts` | Bridge service (logBridgeEvent, syncToMojaInventry, getBridgeEventStatus) |
| `.env.example` | Updated with MOJAINVENTRY_API_URL and MOJAINVENTRY_API_KEY |

---

## Notes on Existing Architecture

From reading the codebase:

- **`src/services/supabase.ts`** — The Supabase client is already initialised with `SUPABASE_URL` + `SUPABASE_ANON_KEY`. The bridge service mirrors this pattern but uses `SUPABASE_SERVICE_ROLE_KEY` for write access to `bridge_events`.

- **`src/services/make.ts`** — The Make.com webhook pattern (`sendToMakeWebhook`) is the closest existing analogue to what `syncToMojaInventry` needs to do. The bridge service is intentionally modelled after it.

- **`supabase/functions/wf-seo-lead-morning/index.ts`** — Demonstrates how Edge Functions handle scheduled tasks, Supabase inserts, and external HTTP calls. The Phase 2 retry sweep Edge Function should follow the same pattern.

- **App.jsx — Suppliers page** — Confirmed accessible to `owner` and `manager` roles. The supplier order event hook goes here in Phase 2.

- **App.jsx — Housekeeping tasks** — Task types include `'Maintenance'`, `'AC Repair'`, `'Plumbing'` explicitly. These are the Phase 2 maintenance event triggers.

- **ZIP files noted (not unzipped):** `hotel-saas-platform.zip`, `hotelos-saas.zip` — may contain additional SaaS/multi-tenant context relevant to Phase 2 tenant-scoped inventory separation.

- **No existing inventory tracking found in App.jsx** — MojaInventry fills a genuine gap; there is no conflicting or overlapping inventory logic to reconcile.
