-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Per-tenant AI token usage & daily budget (Phase A, G5)
-- Migration: 20260702_tenant_ai_usage.sql
--
-- NOT YET APPLIED TO PROD (2026-07-02). The app code (src/lib/aiBudget.ts) is
-- fail-open: it works unchanged whether or not this migration has run.
--
-- ai_daily_token_cap is NULL by default = unlimited, so applying this changes
-- NOTHING until a cap is set per tenant. Usage rows accrue per Dhaka day.
-- Service-role only: RLS enabled with no policies; RPC revoked from anon.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Per-tenant daily token ceiling (NULL = unlimited)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS ai_daily_token_cap INT;

CREATE TABLE IF NOT EXISTS public.tenant_ai_usage (
  tenant_id  UUID   NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usage_day  DATE   NOT NULL,
  tokens_in  BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  calls      INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, usage_day)
);

-- Server-side only: enable RLS with NO permissive policies → anon/authenticated
-- denied by default; service role bypasses (same posture as public.tenants).
ALTER TABLE public.tenant_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_ai_usage FROM PUBLIC, anon, authenticated;

-- Atomic accumulate — one UPSERT so concurrent AI calls never lose updates.
CREATE OR REPLACE FUNCTION public.consume_ai_budget(
  p_tenant_id  uuid,
  p_tokens_in  bigint,
  p_tokens_out bigint
) RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.tenant_ai_usage (tenant_id, usage_day, tokens_in, tokens_out, calls)
  VALUES (p_tenant_id, (now() AT TIME ZONE 'Asia/Dhaka')::date, GREATEST(p_tokens_in, 0), GREATEST(p_tokens_out, 0), 1)
  ON CONFLICT (tenant_id, usage_day) DO UPDATE
    SET tokens_in  = tenant_ai_usage.tokens_in  + EXCLUDED.tokens_in,
        tokens_out = tenant_ai_usage.tokens_out + EXCLUDED.tokens_out,
        calls      = tenant_ai_usage.calls + 1;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_budget(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ✓ EXPECT after apply: table exists, empty; tenants.ai_daily_token_cap all NULL
-- SELECT tenant_id, usage_day, tokens_in, tokens_out, calls FROM public.tenant_ai_usage;
