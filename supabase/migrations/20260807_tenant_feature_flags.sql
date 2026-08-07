-- Per-tenant feature flags (owner-approved 2026-08-07). One JSONB column gates all
-- future features (e.g. {"pos_phase2": true}) — no external flag service, no
-- per-request SDK cost. Read via src/lib/featureFlags.ts (fail-CLOSED: unknown/
-- unreadable flag = feature OFF, so a DB hiccup can never expose an unfinished
-- feature). Additive + idempotent; no RLS change needed (tenants registry is
-- already service-role-read like ai_daily_token_cap).
-- APPLIED to prod 2026-08-07 via Supabase MCP (migration name: tenant_feature_flags).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN tenants.feature_flags IS 'Per-tenant feature gates, e.g. {"pos_phase2": true}. Missing key = OFF. Read via src/lib/featureFlags.ts.';
