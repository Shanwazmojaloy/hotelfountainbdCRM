-- Audit 2026-08-15, S-1. Applied to prod 2026-08-15 via apply_migration
-- (migration name: revoke_anon_billing_grants_s1).
--
-- These four tables granted the browser's unauthenticated role full DML. Tenant
-- identity came from `x-tenant-host`, a caller-supplied header, and the
-- tenant_isolation policies are FOR ALL TO public with no check that anyone is
-- signed in. A live probe with the project's publishable key returned real
-- guest_ledger rows and a 204 on DELETE.
--
-- Safe to revoke: the billing hooks moved to /api/crm/billing (staff session
-- cookie + session_v re-check, service-role queries through tenantScoped), and no
-- browser-side code references these tables any more. Both server paths keep
-- their grants -- service_role today, crm_tenant under TENANT_JWT_MODE=on.
--
-- Verified after applying, same requests that had succeeded:
--   GET    /rest/v1/guest_ledger + x-forwarded-host -> 401 42501 permission denied
--   DELETE /rest/v1/guest_ledger + x-tenant-host    -> 401 42501 permission denied
--   guest_ledger row count unchanged at 917.
--
-- Reverting is a matching GRANT. Do not revert without first putting the browser
-- back on these tables -- that is the hole.

REVOKE ALL ON TABLE public.guest_ledger         FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_invoices     FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoice_line_items   FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_transactions FROM anon, authenticated;
