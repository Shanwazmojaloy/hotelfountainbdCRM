-- 20260815 · C-4 — night_audit_log: the missing crm_tenant GRANT
--
-- APPLIED TO PRODUCTION 2026-08-15 via Supabase MCP (migration
-- `fix_night_audit_log_crm_tenant_grant_and_tenant_not_null`). Kept here so the
-- repo can reproduce it.
--
-- The `nal_tenant_update` POLICY had been added out-of-band, but the table-level
-- GRANT behind it never was. A policy without a grant is not a permission — crm_tenant
-- hit 42501 on every drawer write from app/api/crm/close-day/route.ts:74, and because
-- that call discarded its return value the failure was completely silent. Closed days
-- therefore re-downloaded with opening_token = 0 and payouts = 0, which on a typical
-- day is a ~17,000 BDT error in the Closing Balance.
--
-- Same root cause as the documented 2026-07-04 incident. That one was worked around in
-- /api/crm/payment and /api/crm/reservation with a service-role fallback; close-day and
-- restaurant never got the workaround, and the root cause was never fixed.
--
-- Pre-flight verified: 62 rows, 0 NULL tenant_id, 1 distinct tenant.
-- Post-flight verified: 62 rows writable as crm_tenant with app.current_tenant_id set.

GRANT INSERT, UPDATE ON public.night_audit_log TO crm_tenant;

ALTER TABLE public.night_audit_log ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.night_audit_log DROP CONSTRAINT IF EXISTS nal_tenant_fk;
ALTER TABLE public.night_audit_log
  ADD CONSTRAINT nal_tenant_fk FOREIGN KEY (tenant_id)
  REFERENCES public.tenants(id) ON DELETE CASCADE;

-- The 2026-07-03 Phase-C sweep removed `OR tenant_id IS NULL` from every policy NAMED
-- tenant_isolation. This one is named nal_tenant_read, so it was missed.
DROP POLICY IF EXISTS nal_tenant_read ON public.night_audit_log;
CREATE POLICY nal_tenant_read ON public.night_audit_log
  FOR SELECT USING (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS nal_tenant_insert ON public.night_audit_log;
CREATE POLICY nal_tenant_insert ON public.night_audit_log
  FOR INSERT TO crm_tenant WITH CHECK (tenant_id = (SELECT current_tenant_id()));

-- Stop the snapshot-grant problem recurring. `GRANT ... ON ALL SEQUENCES` expands at
-- execution time and covers nothing created afterwards, which is what made this class
-- of bug possible twice.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO crm_tenant;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_tenant;
