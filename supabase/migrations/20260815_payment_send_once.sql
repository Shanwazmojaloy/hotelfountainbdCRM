-- 20260815 · H-8 / M-16 — make the banking-details email a one-shot CLAIM
--
-- APPLIED TO PRODUCTION 2026-08-15 via Supabase MCP (migration
-- `add_payment_send_once_claim`). Kept here so the repo can reproduce it.
--
-- /api/agents/payment-send emails this hotel's bKash number and EBL account
-- 1241440007466 to a prospect. Two defects compounded:
--
--   1. No send-once guard. `intake_mark_lead_payment_pending` ran AFTER the send and
--      its result was never read, so ceo-auditor's GET re-audit path — and any retry of
--      reply-intake-poll, which only marks messages \Seen after its whole loop finishes —
--      re-sent banking details to the same prospect on every pass.
--
--   2. The recipient came from `payload.contact_email`, which originates in an SMTP
--      `From:` header (reply-intake). Nothing in this codebase checks SPF, DKIM or ARC,
--      so the caller effectively chose the address.
--
-- Chained with ceo-auditor trusting an unvalidated LLM `score`, one crafted reply could
-- drive repeated sends to an attacker-chosen address. The code fixes are in the same
-- commit; this is the half that has to be atomic.

ALTER TABLE public.corporate_leads
  ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz;

COMMENT ON COLUMN public.corporate_leads.payment_sent_at IS
  'Set atomically by claim_payment_send(). Non-null means banking details have already been emailed for this lead — never send again without an explicit human reset.';

-- The whole guard is one statement: the first caller to take the row wins, and the
-- recipient is read from the database rather than the request body.
CREATE OR REPLACE FUNCTION public.claim_payment_send(p_lead_id uuid)
RETURNS TABLE (contact_email text, company_name text, contact_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.corporate_leads
     SET payment_sent_at = now()
   WHERE id = p_lead_id
     AND payment_sent_at IS NULL
     AND contact_email IS NOT NULL
     AND contact_email <> ''
  RETURNING contact_email, company_name, contact_name;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_send(uuid) FROM PUBLIC, anon, authenticated, crm_tenant;
GRANT EXECUTE ON FUNCTION public.claim_payment_send(uuid) TO service_role;

-- Deliberate manual reset, so a genuine re-send is a conscious act rather than a retry.
CREATE OR REPLACE FUNCTION public.reset_payment_send(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.corporate_leads SET payment_sent_at = NULL
   WHERE id = p_lead_id AND payment_sent_at IS NOT NULL
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.reset_payment_send(uuid) FROM PUBLIC, anon, authenticated, crm_tenant;
GRANT EXECUTE ON FUNCTION public.reset_payment_send(uuid) TO service_role;
