-- Persist the cash-drawer inputs entered at close so closed-day re-downloads
-- reconstruct the exact Closing Balance (Opening Token + Cash - Payouts).
-- Additive only; RLS unchanged; safe defaults so existing rows read 0.
ALTER TABLE public.night_audit_log
  ADD COLUMN IF NOT EXISTS opening_token numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payouts       numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.night_audit_log.opening_token IS 'Cash float carried into the day (manual input at close). Persisted so closed-day re-downloads show the exact Closing Balance.';
COMMENT ON COLUMN public.night_audit_log.payouts IS 'Cash paid out during the day (manual input at close). Persisted for exact closing-balance reconstruction.';
