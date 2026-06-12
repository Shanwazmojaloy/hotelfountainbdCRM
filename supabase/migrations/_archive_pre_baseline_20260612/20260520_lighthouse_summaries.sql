-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Lighthouse Anchor Cache
-- Migration: 20260520_lighthouse_summaries.sql
--
-- Daily structured + narrative snapshot of hotel state, written by the
-- `lighthouse-summary` Edge Function at ~01:00 BDT (19:00 UTC prior day).
-- Read by /api/ai/assist to prepend a "Global Anchor" to every Claude call,
-- so the LLM doesn't re-discover hotel-wide context from raw rows.
--
-- Reservation-centric: aggregates are derived from raw transactions
-- filtered by reservation_id (never cached on the reservation row itself).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.lighthouse_summaries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date   DATE        NOT NULL,                       -- the Dhaka calendar day summarised
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Structured anchors (deterministic SQL — cheap, queryable)
  occupancy_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,        -- 0.00 – 100.00
  rooms_occupied      INT          NOT NULL DEFAULT 0,
  rooms_total         INT          NOT NULL DEFAULT 0,
  arrivals_today      INT          NOT NULL DEFAULT 0,
  departures_today    INT          NOT NULL DEFAULT 0,
  in_house_guests     INT          NOT NULL DEFAULT 0,
  vip_in_house        INT          NOT NULL DEFAULT 0,
  revenue_today_bdt   NUMERIC(12,2) NOT NULL DEFAULT 0,       -- sum of payments received in window
  revenue_mtd_bdt     NUMERIC(14,2) NOT NULL DEFAULT 0,
  adr_bdt             NUMERIC(10,2) NOT NULL DEFAULT 0,       -- avg daily rate
  unpaid_balance_bdt  NUMERIC(14,2) NOT NULL DEFAULT 0,       -- sum across open folios
  orphan_folios_count INT          NOT NULL DEFAULT 0,        -- folios missing reservation_id
  blocked_rooms       INT          NOT NULL DEFAULT 0,
  pending_leads       INT          NOT NULL DEFAULT 0,

  -- LLM-synthesised narrative (Haiku, ~150 tokens)
  narrative_md    TEXT        NOT NULL DEFAULT '',

  -- Raw structured payload for future fields without schema churn
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (tenant_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_lighthouse_tenant_date
  ON public.lighthouse_summaries (tenant_id, snapshot_date DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.lighthouse_summaries ENABLE ROW LEVEL SECURITY;

-- Service role only (Edge Function writes, API route reads via service key).
-- No anon/auth policy: clients never read this directly.
DROP POLICY IF EXISTS lighthouse_service_all ON public.lighthouse_summaries;
CREATE POLICY lighthouse_service_all
  ON public.lighthouse_summaries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Latest-anchor view (SECURITY INVOKER per project baseline) ──────────────
CREATE OR REPLACE VIEW public.v_lighthouse_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (tenant_id)
  tenant_id,
  snapshot_date,
  generated_at,
  occupancy_pct,
  rooms_occupied,
  rooms_total,
  arrivals_today,
  departures_today,
  in_house_guests,
  vip_in_house,
  revenue_today_bdt,
  revenue_mtd_bdt,
  adr_bdt,
  unpaid_balance_bdt,
  orphan_folios_count,
  blocked_rooms,
  pending_leads,
  narrative_md,
  payload
FROM public.lighthouse_summaries
ORDER BY tenant_id, snapshot_date DESC, generated_at DESC;

COMMIT;
