-- 20260815 · C-6 — single-use activation nonces
--
-- APPLIED TO PRODUCTION 2026-08-15 via Supabase MCP (migration
-- `add_activation_tokens_single_use_nonce`). Kept here so the repo can reproduce it.
--
-- deal-alert used to interpolate ADMIN_SECRET into the activation URL inside an email,
-- and payment-confirm performed tenant creation on GET. Two consequences:
--
--   1. A long-lived platform credential — the Bearer token for /api/admin/onboard-tenant
--      and /api/admin/logs — was copied into Brevo's outbound store, Google's mail store,
--      Vercel's HTTP access log (query strings are logged) and browser history, with no
--      expiry and no scoping.
--   2. Any link scanner, mail-security prefetch or accidental browser prefetch activated
--      the tenant and emailed the prospect "your dashboard is live" BEFORE payment landed.
--
-- Replacement: the email carries an opaque uuid; the payload lives here; the side effect
-- requires an explicit POST that consumes the nonce atomically.

CREATE TABLE IF NOT EXISTS public.activation_tokens (
  token       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '14 days',
  used_at     timestamptz,
  used_ip     text
);

COMMENT ON TABLE public.activation_tokens IS
  'Single-use activation nonces for the deal-alert -> payment-confirm flow. Replaces ADMIN_SECRET-in-URL (audit 2026-08-15 C-6).';

CREATE INDEX IF NOT EXISTS idx_activation_tokens_lead    ON public.activation_tokens (lead_id);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_expires ON public.activation_tokens (expires_at) WHERE used_at IS NULL;

-- Service role only. Never touched by the browser, by crm_tenant, or by anon.
-- RLS enabled with no policy is deliberate and fail-closed (same shape as
-- tenant_ai_usage / tenant_billing / plan_pricing).
ALTER TABLE public.activation_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activation_tokens FROM PUBLIC, anon, authenticated, crm_tenant;
GRANT SELECT, INSERT, UPDATE ON public.activation_tokens TO service_role;

-- Atomic consume. Returns the payload exactly once; a double-submit or a replayed
-- request gets NULL and cannot activate twice.
CREATE OR REPLACE FUNCTION public.consume_activation_token(p_token uuid, p_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.activation_tokens
     SET used_at = now(), used_ip = p_ip
   WHERE token = p_token AND used_at IS NULL AND expires_at > now()
  RETURNING payload;
$$;
REVOKE ALL ON FUNCTION public.consume_activation_token(uuid, text) FROM PUBLIC, anon, authenticated, crm_tenant;
GRANT EXECUTE ON FUNCTION public.consume_activation_token(uuid, text) TO service_role;

-- Peek without consuming, so the confirm screen can render a summary before the
-- operator commits. GET uses this; POST uses consume.
CREATE OR REPLACE FUNCTION public.peek_activation_token(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT payload FROM public.activation_tokens
   WHERE token = p_token AND used_at IS NULL AND expires_at > now();
$$;
REVOKE ALL ON FUNCTION public.peek_activation_token(uuid) FROM PUBLIC, anon, authenticated, crm_tenant;
GRANT EXECUTE ON FUNCTION public.peek_activation_token(uuid) TO service_role;
