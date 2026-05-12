-- ============================================================
-- MojaInventry Bridge Events Table
-- Hotel Fountain CRM ↔ MojaInventry Integration
-- ============================================================
-- This table is the durable event queue between the two apps.
-- Events are written atomically with the CRM operation that
-- triggers them. The bridge service reads from this queue and
-- delivers payloads to MojaInventry's REST API.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bridge_events (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  event_type    TEXT          NOT NULL,
  -- 'checkout'        → room checkout; triggers cleaning supply deduction
  -- 'supplier_order'  → supplier order placed; creates purchase order in MojaInventry
  -- 'night_audit'     → night audit closed; syncs daily consumption report
  -- 'maintenance'     → maintenance task logged; deducts parts if category is known

  source_app    TEXT          NOT NULL DEFAULT 'hotel-fountain-crm',
  target_app    TEXT          NOT NULL DEFAULT 'mojaInventry',

  payload       JSONB         NOT NULL,
  -- Shape varies by event_type. See docs/mojaInventry-bridge.md for full schemas.

  status        TEXT          NOT NULL DEFAULT 'pending'
                CONSTRAINT bridge_events_status_check
                CHECK (status IN ('pending', 'sent', 'failed', 'acknowledged')),
  -- pending      → written, not yet dispatched to MojaInventry
  -- sent         → successfully POSTed; MojaInventry returned 2xx
  -- failed       → all retries exhausted (retry_count >= 3)
  -- acknowledged → MojaInventry confirmed processing (Phase 2: webhook callback)

  retry_count   INTEGER       NOT NULL DEFAULT 0,
  -- Incremented each time syncToMojaInventry() fails.
  -- Bridge service stops retrying at retry_count = 3 and marks status = 'failed'.

  error_message TEXT          NULL,
  -- Last error returned by MojaInventry or network, for debugging failed events.

  tenant_id     UUID          NULL,
  -- Populated from the CRM's active tenant (currently '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8').
  -- Reserved for Phase 2 multi-tenant SaaS expansion.

  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ   NULL,
  -- Set to NOW() when status transitions to 'sent', 'failed', or 'acknowledged'.

  CONSTRAINT bridge_events_pkey PRIMARY KEY (id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
-- These indexes are essential for the retry sweep query:
-- WHERE status = 'pending' AND retry_count < 3

CREATE INDEX IF NOT EXISTS idx_bridge_events_status
  ON public.bridge_events USING btree (status);

CREATE INDEX IF NOT EXISTS idx_bridge_events_event_type
  ON public.bridge_events USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_bridge_events_created_at
  ON public.bridge_events USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_events_tenant_id
  ON public.bridge_events USING btree (tenant_id);

-- Composite index for the retry sweep (Phase 2 Edge Function):
-- SELECT * FROM bridge_events WHERE status = 'pending' AND retry_count < 3 ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_bridge_events_retry_sweep
  ON public.bridge_events USING btree (status, retry_count, created_at)
  WHERE status = 'pending';

-- ── Row-Level Security ─────────────────────────────────────────────────────────
-- Only the service role key (used server-side in inventryBridge.ts) can
-- insert or update bridge_events. The browser anon key cannot touch this table.

ALTER TABLE public.bridge_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bridge_events' AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY service_role_full_access ON public.bridge_events
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ── updated_at trigger (mirrors guests_table.sql pattern) ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bridge_events_processed_at'
  ) THEN
    -- Note: uses the existing handle_updated_at() function already present in this Supabase project.
    -- If that function is not available, replace with a custom trigger body below.
    CREATE TRIGGER trg_bridge_events_processed_at
      BEFORE UPDATE ON public.bridge_events
      FOR EACH ROW
      EXECUTE FUNCTION handle_updated_at();
  END IF;
END $$;

-- ── Sample rows for local testing ─────────────────────────────────────────────
-- Remove before deploying to production. Useful for verifying the service works.

/*
INSERT INTO public.bridge_events (event_type, payload, tenant_id)
VALUES
  (
    'checkout',
    '{
      "room_number": "201",
      "room_type": "Deluxe Double",
      "reservation_id": "00000000-0000-0000-0000-000000000001",
      "guest_name": "Test Guest",
      "nights_stayed": 2,
      "checkout_time": "2026-04-13T10:30:00+06:00",
      "housekeeping_required": true
    }'::jsonb,
    '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
  ),
  (
    'maintenance',
    '{
      "task_id": "00000000-0000-0000-0000-000000000002",
      "room_number": "105",
      "task_type": "AC Repair",
      "reported_by": "HK Staff",
      "parts_category": "HVAC",
      "estimated_parts": ["AC Filter", "Thermostat Wire"],
      "logged_at": "2026-04-13T14:22:00+06:00"
    }'::jsonb,
    '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
  );
*/
