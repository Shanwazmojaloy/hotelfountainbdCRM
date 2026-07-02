-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Phase C hardening: drop the `OR tenant_id IS NULL` arm from every
-- tenant_isolation policy. Migration: 20260703_phase_c_drop_null_tenant_arm.sql
-- (applied to prod 2026-07-03 via MCP)
--
-- WHY NOW: prod CRM reads run RLS-bound as crm_tenant (TENANT_JWT_MODE=on,
-- 2026-07-03), so the IS NULL arm is a live cross-tenant exposure vector — any
-- future row inserted with a NULL tenant_id would be visible to EVERY tenant.
--
-- SAFETY (verified before applying): census across all 32 tenant_isolation
-- tables found ZERO rows with tenant_id IS NULL — nothing depends on the arm.
-- Service-role paths bypass RLS; bare anon already saw 0 rows. WITH CHECK
-- inherits the tightened USING, so NULL-tenant INSERTs are now rejected for
-- RLS-bound roles (tenantScoped() stamps tenant_id on every insert).
--
-- EXCLUDED (documented, untouched):
--   invoice_line_items — no tenant_id column; isolation derives via parent.
--   rate_plans        — legacy qual referencing profiles/uid(); its qual does
--                       not contain the IS NULL arm pattern. Flagged for a
--                       future cleanup (the qual looks self-referencing/buggy).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
      AND qual LIKE '%tenant_id IS NULL%'
  LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON public.%I', p.tablename);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING (tenant_id = current_tenant_id())',
      p.tablename);
    RAISE NOTICE 'tightened: %', p.tablename;
  END LOOP;
END $$;

-- ✓ EXPECT after apply: zero policies retain the IS NULL arm
-- SELECT tablename FROM pg_policies WHERE schemaname='public'
--   AND policyname='tenant_isolation' AND qual LIKE '%tenant_id IS NULL%';
