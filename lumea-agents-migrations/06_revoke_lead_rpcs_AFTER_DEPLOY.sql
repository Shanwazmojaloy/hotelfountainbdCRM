-- 06_revoke_lead_rpcs_AFTER_DEPLOY.sql — ref mynwfkgksqqwlqowlscj
-- DO NOT RUN YET. Ordering is mandatory:
--   1. Commit + push the 9 agent-route edits (SB_KEY now prefers SUPABASE_SERVICE_ROLE_KEY).
--   2. Confirm SUPABASE_SERVICE_ROLE_KEY is set in Vercel and the crons run green post-deploy.
--   3. THEN run this file. Running it before deploy will 401 the agent cron routes
--      (they currently reach these RPCs via the anon key).
--
-- These 20 lead-management SECURITY DEFINER RPCs are reachable by the public anon/publishable
-- key today (lead-PII exposure). After the routes use service_role, anon no longer needs them.

REVOKE EXECUTE ON FUNCTION public.ceo_get_log_with_lead(p_log_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ceo_update_lead(p_lead_id uuid, p_status text, p_deal_score integer, p_updated_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ceo_update_log(p_log_id uuid, p_deal_score integer, p_deal_score_reason text, p_ceo_next_action text, p_is_deal_ready boolean, p_audited_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deal_log_notification(p_tenant_id uuid, p_workflow text, p_body text, p_status text, p_triggered_by text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deal_mark_alert_sent(p_log_id uuid, p_alert_sent_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.digest_get_recent_replies(p_tenant_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.followup_get_eligible_leads(p_tenant_id uuid, p_limit integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_lead_contact_email(p_lead_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.import_corporate_leads(p_leads jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_find_lead_by_domain(p_tenant_id uuid, p_domain text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_find_lead_by_email(p_tenant_id uuid, p_email text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_log_inbound(p_tenant_id uuid, p_lead_id uuid, p_direction text, p_channel text, p_subject text, p_body text, p_sent_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_mark_lead_activated(p_lead_id uuid, p_activated_at timestamp with time zone, p_subdomain text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_mark_lead_payment_pending(p_lead_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.intake_mark_lead_replied(p_lead_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outreach_get_pending_leads(p_tenant_id uuid, p_limit integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outreach_log_entry(p_tenant_id uuid, p_lead_id uuid, p_direction text, p_channel text, p_subject text, p_body text, p_sent_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outreach_update_lead_status(p_lead_id uuid, p_status text, p_last_contacted_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.poll_get_contactable_leads(p_tenant_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.poll_get_outbound_subjects_by_lead(p_tenant_id uuid) FROM anon, authenticated;

-- Rollback if a cron 401s: GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon, authenticated;
