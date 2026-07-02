-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Phase B/C: dedicated PostgREST role for the service-role→JWT switch
-- Migration: 20260702_crm_tenant_role.sql (applied to prod 2026-07-02)
--
-- `crm_tenant` is the role CRM API routes will run as once TENANT_JWT_MODE=on:
-- the server mints an HS256 JWT { role: 'crm_tenant', app_tenant_id: <uuid> }
-- signed with the project JWT secret; PostgREST switches to this role and RLS
-- (tenant_isolation → current_tenant_id() → app_tenant_id claim) scopes every
-- query. Unlike the service role, crm_tenant CANNOT bypass RLS.
--
-- INERT until a crm_tenant JWT is presented — and only holders of the project
-- JWT secret can mint one. No existing path uses this role.
--
-- Deliberately NOT granted: tenants (identity+secrets stay service-only),
-- tenant_ai_usage, vault RPCs (tenant_secret_set/get), audit_logs writes.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_tenant') THEN
    CREATE ROLE crm_tenant NOLOGIN NOINHERIT;
  END IF;
END $$;

-- PostgREST switches into this role when the JWT's `role` claim says so.
GRANT crm_tenant TO authenticator;

GRANT USAGE ON SCHEMA public TO crm_tenant;

-- The 32 tenant-isolated tables (source: pg_policies tenant_isolation, 2026-07-02).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.b2b_bookings, public.b2b_invoices, public.b2b_outreach_log, public.b2b_partners,
  public.billing_invoices, public.corporate_leads, public.daily_closing, public.folios,
  public.fountain_demand_thresholds, public.guest_ledger, public.guests, public.hotel_settings,
  public.housekeeping_tasks, public.invoice_line_items, public.leads, public.maintenance_events,
  public.manus_config, public.marketing_content, public.notifications_log, public.outreach_log,
  public.payment_transactions, public.rate_plans, public.reservations, public.review_queue,
  public.room_assets, public.rooms, public.staff, public.swarm_leads, public.transactions,
  public.upsell_offers, public.workflow_locks, public.workflow_runs
TO crm_tenant;

-- Serial/identity columns on those tables need sequence access for INSERTs.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_tenant;

-- RLS policy expressions and route RPCs the role must be able to execute.
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO crm_tenant;
GRANT EXECUTE ON FUNCTION public.bump_paid_amount(uuid, numeric, numeric) TO crm_tenant;

COMMIT;

-- night-audit / financial RPCs are granted separately when their routes migrate
-- (they take target_tenant_id args and re-check authorization internally).
-- ✓ EXPECT: SET ROLE crm_tenant + request.jwt.claims app_tenant_id=<t> sees only
--   tenant <t>'s rows on all 32 tables; cross-tenant UPDATE matches 0 rows.
