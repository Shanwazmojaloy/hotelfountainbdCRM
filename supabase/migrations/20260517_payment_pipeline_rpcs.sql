-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Payment Pipeline RPCs
-- Migration: 20260517_payment_pipeline_rpcs.sql
--
-- Covers ALL SECURITY DEFINER RPCs called by agent routes so anon key
-- can never touch tables directly:
--
--   reply-intake  : intake_find_lead_by_email, intake_find_lead_by_domain,
--                   intake_log_inbound, intake_mark_lead_replied
--   ceo-auditor   : ceo_update_log, ceo_update_lead, ceo_get_log_with_lead
--   deal-alert    : deal_mark_alert_sent, deal_log_notification
--   payment-send  : get_lead_contact_email, intake_mark_lead_payment_pending
--   payment-confirm: intake_mark_lead_activated
--
-- Schema changes:
--   corporate_leads.status  → adds payment_pending, activated
--   corporate_leads         → adds payment_pending_at, activated_at, subdomain
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend status CHECK constraint ────────────────────────────────────────
ALTER TABLE corporate_leads
  DROP CONSTRAINT IF EXISTS corporate_leads_status_check;

ALTER TABLE corporate_leads
  ADD CONSTRAINT corporate_leads_status_check
  CHECK (status IN (
    'pending', 'contacted', 'replied', 'audited',
    'deal_ready', 'payment_pending', 'activated',
    'closed_won', 'not_interested'
  ));

-- ── 2. New columns on corporate_leads ────────────────────────────────────────
ALTER TABLE corporate_leads
  ADD COLUMN IF NOT EXISTS payment_pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subdomain          TEXT;

-- ── 3. intake_find_lead_by_email ─────────────────────────────────────────────
-- Returns leads matching an exact email address.
CREATE OR REPLACE FUNCTION intake_find_lead_by_email(
  p_tenant_id UUID,
  p_email     TEXT
)
RETURNS TABLE (
  id            UUID,
  company_name  TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  status        TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, company_name, contact_name, contact_email, status
  FROM   corporate_leads
  WHERE  tenant_id     = p_tenant_id
    AND  LOWER(TRIM(contact_email)) = LOWER(TRIM(p_email))
  LIMIT  1;
$$;

-- ── 4. intake_find_lead_by_domain ────────────────────────────────────────────
-- Returns leads whose contact_email domain matches (fallback lookup).
CREATE OR REPLACE FUNCTION intake_find_lead_by_domain(
  p_tenant_id UUID,
  p_domain    TEXT
)
RETURNS TABLE (
  id            UUID,
  company_name  TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  status        TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, company_name, contact_name, contact_email, status
  FROM   corporate_leads
  WHERE  tenant_id = p_tenant_id
    AND  LOWER(SPLIT_PART(contact_email, '@', 2)) = LOWER(TRIM(p_domain))
  ORDER  BY created_at ASC
  LIMIT  1;
$$;

-- ── 5. intake_log_inbound ────────────────────────────────────────────────────
-- Inserts a new inbound entry into outreach_log. Returns the new row UUID.
CREATE OR REPLACE FUNCTION intake_log_inbound(
  p_tenant_id UUID,
  p_lead_id   UUID,
  p_direction TEXT,
  p_channel   TEXT,
  p_subject   TEXT,
  p_body      TEXT,
  p_sent_at   TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO outreach_log
    (tenant_id, lead_id, direction, channel, subject, body, sent_at)
  VALUES
    (p_tenant_id, p_lead_id, p_direction, p_channel, p_subject, p_body, p_sent_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 6. intake_mark_lead_replied ──────────────────────────────────────────────
-- Sets a lead status to 'replied' and stamps last_contacted_at.
CREATE OR REPLACE FUNCTION intake_mark_lead_replied(
  p_lead_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE corporate_leads
  SET    status            = 'replied',
         last_contacted_at = NOW(),
         updated_at        = NOW()
  WHERE  id     = p_lead_id
    AND  status NOT IN ('deal_ready', 'payment_pending', 'activated', 'closed_won');
END;
$$;

-- ── 7. ceo_update_log ────────────────────────────────────────────────────────
-- Writes CEO audit results onto an outreach_log row.
CREATE OR REPLACE FUNCTION ceo_update_log(
  p_log_id             UUID,
  p_deal_score         INTEGER,
  p_deal_score_reason  TEXT,
  p_ceo_next_action    TEXT,
  p_is_deal_ready      BOOLEAN,
  p_audited_at         TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE outreach_log
  SET    deal_score        = p_deal_score,
         deal_score_reason = p_deal_score_reason,
         ceo_next_action   = p_ceo_next_action,
         is_deal_ready     = p_is_deal_ready,
         audited_at        = p_audited_at
  WHERE  id = p_log_id;
END;
$$;

-- ── 8. ceo_update_lead ───────────────────────────────────────────────────────
-- Updates a lead's status and deal_score after CEO audit.
CREATE OR REPLACE FUNCTION ceo_update_lead(
  p_lead_id    UUID,
  p_status     TEXT,
  p_deal_score INTEGER,
  p_updated_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE corporate_leads
  SET    status     = p_status,
         deal_score = p_deal_score,
         updated_at = p_updated_at
  WHERE  id = p_lead_id;
END;
$$;

-- ── 9. ceo_get_log_with_lead ─────────────────────────────────────────────────
-- Returns outreach_log row joined with its parent lead — used for manual re-audit.
CREATE OR REPLACE FUNCTION ceo_get_log_with_lead(
  p_log_id UUID
)
RETURNS TABLE (
  log_id            UUID,
  log_lead_id       UUID,
  log_subject       TEXT,
  log_body          TEXT,
  log_sent_at       TIMESTAMPTZ,
  lead_company_name TEXT,
  lead_contact_name TEXT,
  lead_status       TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ol.id            AS log_id,
    ol.lead_id       AS log_lead_id,
    ol.subject       AS log_subject,
    ol.body          AS log_body,
    ol.sent_at       AS log_sent_at,
    cl.company_name  AS lead_company_name,
    cl.contact_name  AS lead_contact_name,
    cl.status        AS lead_status
  FROM   outreach_log  ol
  LEFT   JOIN corporate_leads cl ON cl.id = ol.lead_id
  WHERE  ol.id = p_log_id
  LIMIT  1;
$$;

-- ── 10. deal_mark_alert_sent ─────────────────────────────────────────────────
-- Stamps alert_sent = true on an outreach_log row after deal-alert fires.
CREATE OR REPLACE FUNCTION deal_mark_alert_sent(
  p_log_id        UUID,
  p_alert_sent_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE outreach_log
  SET    alert_sent    = TRUE,
         alert_sent_at = p_alert_sent_at
  WHERE  id = p_log_id;
END;
$$;

-- ── 11. deal_log_notification ────────────────────────────────────────────────
-- Inserts a row into notifications_log — used by deal-alert, payment-send,
-- payment-confirm for audit trail.
CREATE OR REPLACE FUNCTION deal_log_notification(
  p_tenant_id    UUID,
  p_workflow     TEXT,
  p_body         TEXT,
  p_status       TEXT,
  p_triggered_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notifications_log
    (tenant_id, workflow, body, status, triggered_by, created_at)
  VALUES
    (p_tenant_id, p_workflow, p_body, p_status, p_triggered_by, NOW());
END;
$$;

-- ── 12. get_lead_contact_email ───────────────────────────────────────────────
-- Returns contact_email for a given lead UUID. Used by payment-send when
-- contact_email was not threaded through from deal-alert.
CREATE OR REPLACE FUNCTION get_lead_contact_email(
  p_lead_id UUID
)
RETURNS TABLE (
  contact_email TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT contact_email
  FROM   corporate_leads
  WHERE  id = p_lead_id
  LIMIT  1;
$$;

-- ── 13. intake_mark_lead_payment_pending ─────────────────────────────────────
-- Advances a lead to payment_pending after payment instructions are sent.
CREATE OR REPLACE FUNCTION intake_mark_lead_payment_pending(
  p_lead_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE corporate_leads
  SET    status              = 'payment_pending',
         payment_pending_at = NOW(),
         updated_at         = NOW()
  WHERE  id     = p_lead_id
    AND  status NOT IN ('activated', 'closed_won');
END;
$$;

-- ── 14. intake_mark_lead_activated ───────────────────────────────────────────
-- Marks a lead as fully activated after Shan confirms payment and clicks
-- the one-tap payment-confirm link.
CREATE OR REPLACE FUNCTION intake_mark_lead_activated(
  p_lead_id      UUID,
  p_activated_at TIMESTAMPTZ,
  p_subdomain    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE corporate_leads
  SET    status       = 'activated',
         activated_at = p_activated_at,
         subdomain    = p_subdomain,
         updated_at   = NOW()
  WHERE  id = p_lead_id;
END;
$$;

-- ── 15. leads_pipeline view (updated) ────────────────────────────────────────
-- Replaces existing view to include new statuses and columns.
CREATE OR REPLACE VIEW leads_pipeline AS
SELECT
  cl.id,
  cl.tenant_id,
  cl.company_name,
  cl.contact_name,
  cl.contact_email,
  cl.contact_title,
  cl.industry,
  cl.icp_score,
  cl.priority,
  cl.status,
  cl.deal_score,
  cl.last_contacted_at,
  cl.payment_pending_at,
  cl.activated_at,
  cl.subdomain,
  cl.notes,
  cl.created_at,
  -- Latest outreach log summary
  (
    SELECT ol.subject
    FROM   outreach_log ol
    WHERE  ol.lead_id = cl.id
    ORDER  BY ol.sent_at DESC
    LIMIT  1
  ) AS last_subject,
  (
    SELECT ol.deal_score
    FROM   outreach_log ol
    WHERE  ol.lead_id = cl.id
      AND  ol.is_deal_ready = TRUE
    ORDER  BY ol.audited_at DESC
    LIMIT  1
  ) AS latest_deal_score,
  (
    SELECT ol.ceo_next_action
    FROM   outreach_log ol
    WHERE  ol.lead_id = cl.id
    ORDER  BY ol.sent_at DESC
    LIMIT  1
  ) AS ceo_next_action
FROM corporate_leads cl;

-- Grant anon access to view (read-only, via RLS on underlying tables)
GRANT SELECT ON leads_pipeline TO anon;

-- ── Grant EXECUTE on all RPCs to anon (agents call via anon key) ──────────────
GRANT EXECUTE ON FUNCTION intake_find_lead_by_email(UUID, TEXT)                              TO anon;
GRANT EXECUTE ON FUNCTION intake_find_lead_by_domain(UUID, TEXT)                             TO anon;
GRANT EXECUTE ON FUNCTION intake_log_inbound(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION intake_mark_lead_replied(UUID)                                     TO anon;
GRANT EXECUTE ON FUNCTION ceo_update_log(UUID, INTEGER, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ)    TO anon;
GRANT EXECUTE ON FUNCTION ceo_update_lead(UUID, TEXT, INTEGER, TIMESTAMPTZ)                  TO anon;
GRANT EXECUTE ON FUNCTION ceo_get_log_with_lead(UUID)                                        TO anon;
GRANT EXECUTE ON FUNCTION deal_mark_alert_sent(UUID, TIMESTAMPTZ)                            TO anon;
GRANT EXECUTE ON FUNCTION deal_log_notification(UUID, TEXT, TEXT, TEXT, TEXT)                TO anon;
GRANT EXECUTE ON FUNCTION get_lead_contact_email(UUID)                                       TO anon;
GRANT EXECUTE ON FUNCTION intake_mark_lead_payment_pending(UUID)                             TO anon;
GRANT EXECUTE ON FUNCTION intake_mark_lead_activated(UUID, TIMESTAMPTZ, TEXT)                TO anon;
