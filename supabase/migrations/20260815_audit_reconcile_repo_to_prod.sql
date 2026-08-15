-- ─────────────────────────────────────────────────────────────────────────────
-- 20260815 · Audit reconciliation — make the repo describe the database that
--            actually exists.
--
-- WHY THIS FILE EXISTS
-- The 2026-08-15 audit found that several hardening steps had been applied to
-- production out-of-band (via MCP / the SQL editor) and never written back into
-- supabase/migrations/. The repo therefore described a *weaker* database than the
-- one running, which is dangerous in both directions:
--
--   • a DR restore or preview branch built from this directory would come up
--     materially less secure than production, and
--   • a static reading of the repo reports critical findings that are already
--     fixed — four of the eight "criticals" in CODE_REVIEW.md turned out to be
--     drift artifacts, which is exactly how real findings get lost in noise.
--
-- Everything below is IDEMPOTENT and was verified against production on
-- 2026-08-15 before being written. Running it against prod is a no-op; running it
-- against a fresh database reproduces the hardening.
--
-- See docs/audit-2026-08-15/DRIFT_REPORT.md for the full repo↔prod diff.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. transactions.reservation_id — supersedes 20260513_transactions_reservation_id_fkey.sql
-- That file declares ON DELETE SET NULL. Production has had CASCADE since ~2026-06-10
-- (which is what app/api/crm/reservation/route.ts:361 has always claimed). Verified
-- 2026-08-15: confdeltype = 'c', and 0 rows with reservation_id IS NULL.
-- Without this, a rebuilt database would silently orphan every payment on a
-- reservation delete — the 13,600 BDT failure mode.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.transactions'::regclass
       AND conname  = 'transactions_reservation_id_fkey'
       AND confdeltype <> 'c'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_reservation_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.transactions'::regclass
       AND conname  = 'transactions_reservation_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_reservation_id_fkey
      FOREIGN KEY (reservation_id) REFERENCES public.reservations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. leads_pipeline — supersedes the GRANT block in 20260517_payment_pipeline_rpcs.sql
-- The migration creates the view WITHOUT security_invoker and grants SELECT to anon,
-- with a comment claiming isolation comes "via RLS on underlying tables". A non-invoker
-- view executes as its OWNER, so corporate_leads.tenant_isolation would never evaluate.
-- Production already carries security_invoker=true (verified 2026-08-15: anon sees 0 rows).
ALTER VIEW IF EXISTS public.leads_pipeline SET (security_invoker = true);

-- Defence in depth: anon has no legitimate use for this view. Every real caller
-- (reply-intake, ceo-auditor, payment-send, deal-alert) resolves the service-role key
-- first. Contained today only because current_tenant_id() is NULL for a bare anon
-- session — that is one host-routing change away from not being true.
REVOKE ALL ON public.leads_pipeline FROM anon, authenticated;
GRANT  SELECT ON public.leads_pipeline TO crm_tenant, service_role;

-- ── 3. payment-pipeline RPCs — supersedes the GRANT block in 20260517
-- The migration grants EXECUTE on 12 SECURITY DEFINER functions to anon and pins no
-- search_path. Production has already revoked anon and pinned `public, pg_temp` on all
-- twelve (verified 2026-08-15). Re-asserted here so a rebuild is not wide open.
--
-- NOTE the scope limit: the anon EXECUTE grants on the host→tenant ROUTING functions are
-- intentional and required (see memory: advisor_audit_2026_06_19). This block covers ONLY
-- these twelve lead-pipeline functions, which have no caller that needs anon.
DO $$
DECLARE
  fn text;
  sig text;
BEGIN
  FOR fn, sig IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'intake_find_lead_by_email','intake_find_lead_by_domain','intake_log_inbound',
         'intake_mark_lead_replied','ceo_update_log','ceo_update_lead','ceo_get_log_with_lead',
         'deal_mark_alert_sent','deal_log_notification','get_lead_contact_email',
         'intake_mark_lead_payment_pending','intake_mark_lead_activated')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', fn, sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn, sig);
    -- SECURITY DEFINER + unqualified table references + mutable search_path is a
    -- privilege-escalation path via schema shadowing. Every other definer function in
    -- this project already pins it; these twelve were the exception.
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', fn, sig);
  END LOOP;
END $$;

-- ── 4. Core money tables — RLS + tenant_isolation
-- 20260515_tenants.sql applies these to bgqs_raw.* (a STAGING schema) instead of public.*.
-- The public policies were created out-of-band and are the only thing standing between
-- tenants. Reproduced here verbatim from production (verified 2026-08-15), so a rebuilt
-- database is isolated rather than wide open.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rooms','guests','reservations','transactions','staff',
    'folios','hotel_settings','housekeeping_tasks','referral_queue'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, table not present', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    -- The (SELECT current_tenant_id()) wrapper is deliberate: it makes the call an
    -- InitPlan evaluated once per query instead of once per row.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING (tenant_id = (SELECT current_tenant_id()))', t);
  END LOOP;
END $$;

-- ── 5. Sequence/table default privileges for crm_tenant
-- 20260702_crm_tenant_role.sql uses `GRANT ... ON ALL SEQUENCES`, which expands at
-- execution time and therefore does NOT cover anything created afterwards. That snapshot
-- semantics is what produced the 2026-07-04 incident and the night_audit_log breakage.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO crm_tenant;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_tenant;

-- ── 6. Conformance assertion
-- Fails the migration if any tenant-scoped table is missing RLS, a tenant_isolation
-- policy, or a crm_tenant grant. This is the check that would have caught
-- night_audit_log in July instead of August.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname IN ('rooms','guests','reservations','transactions','staff','folios',
                       'hotel_settings','housekeeping_tasks','referral_queue','night_audit_log')
     AND (NOT c.relrowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.schemaname = 'public' AND p.tablename = c.relname)
          OR NOT has_table_privilege('crm_tenant', c.oid, 'SELECT'));

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant-isolation conformance failed for: %', bad;
  END IF;
END $$;
