-- Audit 2026-08-15, S-1b. Applied to prod 2026-08-15 via apply_migration
-- (migration name: revoke_anon_leads_grants_s1b). Companion to
-- 20260815_revoke_anon_billing_grants_s1.sql.
--
-- `leads` and `corporate_leads` both carry `tenant_isolation FOR ALL TO public
-- USING (tenant_id = current_tenant_id())`, and current_tenant_id() resolves from
-- the caller-supplied x-tenant-host header. With anon holding SELECT/INSERT/
-- UPDATE/DELETE, anyone with the publishable key could read, alter or delete lead
-- PII (name, phone, email) for any tenant they could name a host for. A probe
-- returned real `leads` rows with names and phone numbers exactly this way.
--
-- The only code touching these tables was src/services/supabase.ts, whose sole
-- importers are two SERVER routes (app/api/orchestrate, app/api/hardware-check).
-- Switched to the service role via tenantClient/tenantScoped in the same commit,
-- so no browser code needs these grants.
--
-- Note: insertLead() was almost certainly already failing. The tenant_isolation
-- policy has a NULL with_check, so Postgres applies USING to the INSERT; a server
-- call carries no x-tenant-host, so current_tenant_id() was NULL and the check
-- could never pass. Routing it through tenantScoped (which stamps tenant_id)
-- repairs that path as a side effect.
--
-- Verified after applying, the same request that had returned rows:
--   GET /rest/v1/leads?select=id,name,phone + x-tenant-host
--     before: 200 + real names and phone numbers
--     after:  401 42501 permission denied for table leads
--   leads row count unchanged at 2229.

REVOKE ALL ON TABLE public.leads           FROM anon, authenticated;
REVOKE ALL ON TABLE public.corporate_leads FROM anon, authenticated;
