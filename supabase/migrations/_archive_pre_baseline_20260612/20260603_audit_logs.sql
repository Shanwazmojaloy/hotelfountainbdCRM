-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Centralized Audit & Activity Log
-- Migration: 20260603_audit_logs.sql
--
-- Single source of truth for user actions, record mutations, auth events and
-- LLM executions. Multi-tenant scoped, RLS-protected, JSONB payload for
-- flexible event shapes. Writes happen via SUPABASE_SERVICE_ROLE_KEY from
-- src/lib/audit.ts — clients never insert directly.
--
-- Retention: 30-day rolling window enforced by /api/agents/audit-purge cron.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. TABLE ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  tenant_id       UUID         REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id      TEXT,                                       -- from x-request-id middleware header
  event_type      TEXT         NOT NULL,                       -- user_login | record_edit | status_change | llm_execution | api_hit | …
  user_id         TEXT,                                        -- email or supabase auth uid; nullable for system/cron
  role            TEXT,                                        -- owner | manager | staff | system | cron | anon
  action_target   TEXT,                                        -- route, table name, or record id (e.g. "POST /api/admin/onboard-tenant" or "reservations:uuid")
  status_code     INT,                                         -- HTTP status or null for non-route events
  result          TEXT         NOT NULL DEFAULT 'success'
                  CHECK (result IN ('success','failure','partial','denied')),
  duration_ms     INT,                                         -- end-to-end handler time
  ip              INET,                                        -- best-effort from x-forwarded-for
  user_agent      TEXT,
  payload_summary JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- SANITIZED — never raw secrets
  error           TEXT                                          -- short error message on failure
);

-- ── 2. INDEXES ──────────────────────────────────────────────────────────────
-- Default dashboard query: most-recent rows per tenant, optionally filtered
-- by event_type or user_id. Drop unused indexes later if write volume grows.

CREATE INDEX IF NOT EXISTS audit_logs_tenant_ts_idx
  ON public.audit_logs (tenant_id, ts DESC);

CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx
  ON public.audit_logs (event_type, ts DESC);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON public.audit_logs (user_id, ts DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_request_id_idx
  ON public.audit_logs (request_id)
  WHERE request_id IS NOT NULL;

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Tenant-scoped reads for authenticated users in the same tenant (matches
-- existing Lumea pattern — JWT claim "tenant_id"). Anon = no access.
-- Service role bypasses RLS entirely, which is how the logger writes.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_tenant_select ON public.audit_logs;
CREATE POLICY audit_logs_tenant_select
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- No INSERT / UPDATE / DELETE policy → writes must use service role.

-- ── 4. RETENTION HELPER ─────────────────────────────────────────────────────
-- Called by /api/agents/audit-purge. SECURITY INVOKER (project default) —
-- caller must be service role.

CREATE OR REPLACE FUNCTION public.purge_audit_logs(p_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.audit_logs
   WHERE ts < (now() - make_interval(days => p_days))
  RETURNING 1 INTO v_deleted;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMIT;
