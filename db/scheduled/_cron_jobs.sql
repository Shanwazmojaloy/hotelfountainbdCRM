-- pg_cron schedule snapshot — Supabase project mynwfkgksqqwlqowlscj
-- 51 jobs, ordered by jobid. Credentials replaced with <ANON_KEY> / <REDACTED>.
--
-- 2026-08-15: jobids 30 and 40 set active=false (kept, not unscheduled, so the
-- definition survives and re-enabling is one cron.alter_job call). jobids 31
-- and 32 moved off the 00:00 slot because run_all_agents() (jobid 21, 0 0 * * *)
-- already invokes both of their functions at that hour, and the two would race.
-- Restore: cron.alter_job(30, active := true); cron.alter_job(40, active := true);
--          cron.alter_job(31, schedule := '0 */4 * * *');
--          cron.alter_job(32, schedule := '0 */6 * * *');

-- jobid 2 | active
select cron.schedule('hf-checkout-reminder', '30 4 * * *', $job$

  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-checkout-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := '{"mode":"reminder"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  
$job$);

-- jobid 3 | active
select cron.schedule('hf-overdue-alert', '30 6 * * *', $job$

  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-checkout-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := '{"mode":"overdue"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  
$job$);

-- jobid 4 | active
select cron.schedule('hf-evening-report', '0 15 * * *', $job$

  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-evening-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  
$job$);

-- jobid 7 | active
select cron.schedule('hf-competitor-monitor', '0 0 * * *', $job$

  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-competitor-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  
$job$);

-- jobid 8 | active
select cron.schedule('hf-backup-verify', '0 17 * * 0', $job$

  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-backup-verify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  
$job$);

-- jobid 9 | active
select cron.schedule('hf-booking-confirm', '*/5 * * * *', $job$

  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-guest-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := '{"mode":"confirmation"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  
$job$);

-- jobid 10 | active
select cron.schedule('hf-review-request', '*/15 * * * *', $job$

  -- Process all pending review emails where send_after has passed
  SELECT net.http_post(
    url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-guest-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>'
    ),
    body := jsonb_build_object(
      'mode', 'review_batch',
      'reservation_ids', (
        SELECT jsonb_agg(reservation_id)
        FROM (
          SELECT reservation_id
          FROM review_queue
          WHERE status = 'pending' AND send_after <= NOW()
          ORDER BY send_after
          LIMIT 10
        ) q
      )
    ),
    timeout_milliseconds := 30000
  ) AS request_id
  WHERE EXISTS (
    SELECT 1 FROM review_queue 
    WHERE status = 'pending' AND send_after <= NOW()
  );
  
$job$);

-- jobid 11 | active
select cron.schedule('b2b-daily-followup-check', '0 3 * * *', $job$

  INSERT INTO b2b_followup_log (
    partner_id, agency_name, contact_name, phone,
    channel, message_sent, sent_at, next_followup_days, tenant_id
  )
  SELECT
    p.id, p.agency_name, p.contact_name, p.phone,
    'WHATSAPP',
    format(
      'Follow-up #%s for %s — Hotel Fountain BD. Please confirm your first booking. Wholesale ৳%s/night + %s%% commission.',
      p.followup_count + 1, p.contact_name, p.wholesale_rate, p.commission_pct
    ),
    NOW(),
    7,
    p.tenant_id
  FROM b2b_partners p
  WHERE p.next_followup_date <= CURRENT_DATE
    AND p.status IN ('ACTIVE','PROSPECT')
    AND p.total_bookings = 0;
  
$job$);

-- jobid 12 | active
select cron.schedule('b2b-auto-cold-mark', '0 4 * * *', $job$

  UPDATE b2b_partners
  SET status = 'COLD',
      priority_tier = 'LOW'
  WHERE followup_count >= 5
    AND total_bookings = 0
    AND status NOT IN ('COLD','CONVERTED');

  UPDATE leads SET status = 'LOST', updated_at = NOW()
  WHERE source = 'B2B_PARTNER'
    AND company IN (
      SELECT agency_name FROM b2b_partners
      WHERE status = 'COLD' AND total_bookings = 0
    );
  
$job$);

-- jobid 13 | active
select cron.schedule('lumea-billing-heal', '0 */6 * * *', $job$
SELECT agent_billing_selfheal()
$job$);

-- jobid 14 | active
select cron.schedule('lumea-rooms-heal', '*/30 * * * *', $job$
SELECT agent_rooms_selfheal()
$job$);

-- jobid 15 | active
select cron.schedule('lumea-reservations-heal', '0 * * * *', $job$
SELECT agent_reservations_selfheal()
$job$);

-- jobid 16 | active
select cron.schedule('lumea-guests-heal', '0 19 * * *', $job$
SELECT agent_guests_selfheal()
$job$);

-- jobid 17 | active
select cron.schedule('lumea-housekeeping-heal', '*/15 * * * *', $job$
SELECT agent_housekeeping_selfheal()
$job$);

-- jobid 19 | active
select cron.schedule('lumea-leads-heal', '0 3 * * *', $job$
SELECT agent_leads_selfheal()
$job$);

-- jobid 20 | active
select cron.schedule('lumea-audit-heal', '0 16 * * *', $job$
SELECT agent_audit_selfheal()
$job$);

-- jobid 21 | active
select cron.schedule('lumea-master-sweep', '0 0 * * *', $job$
SELECT run_all_agents()
$job$);

-- jobid 25 | active
select cron.schedule('lumea-airline-heal', '0 8  * * 1', $job$
SELECT agent_airline_leads_selfheal()
$job$);

-- jobid 26 | active
select cron.schedule('lumea-ngo-heal', '0 8  * * 2', $job$
SELECT agent_ngo_leads_selfheal()
$job$);

-- jobid 27 | active
select cron.schedule('lumea-corporate-leads-heal', '0 8 * * 3', $job$
SELECT agent_corporate_leads_selfheal()
$job$);

-- jobid 28 | active
select cron.schedule('lumea-ceo-followup', '0 9 */3 * *', $job$
SELECT agent_ceo_followup()
$job$);

-- jobid 29 | active
select cron.schedule('lumea-ceo-inbox', '0 * * * *', $job$
SELECT ceo_process_inbox()
$job$);

-- jobid 30 | DISABLED 2026-08-15 (D-9: duplicate of jobid 32)
select cron.schedule('lumea-corporate-detect', '0 */6 * * *', $job$

  INSERT INTO leads(id,name,email,phone,company,source,status,notes,tenant_id,created_at,updated_at)
  SELECT gen_random_uuid(),g.name,g.email,g.phone,
    'Corporate Prospect','CORPORATE_DETECT','NEW',
    format('High spend: spent %s in one stay on %s — corporate account candidate',
      r.total_amount, r.check_out::date),
    r.tenant_id,NOW(),NOW()
  FROM reservations r
  JOIN guests g ON g.id=ANY(r.guest_ids)
  LEFT JOIN leads l ON l.phone=g.phone AND l.source='CORPORATE_DETECT'
  WHERE r.total_amount>=15000 AND r.status='CHECKED_OUT'
    AND l.id IS NULL AND is_valid_bd_phone(g.phone);

$job$);

-- jobid 31 | active
select cron.schedule('lumea-ota-monitor', '0 4,8,12,16,20 * * *', $job$
SELECT agent_ota_monitor()
$job$);

-- jobid 32 | active
select cron.schedule('lumea-corp-detect', '0 6,12,18 * * *', $job$
SELECT agent_corporate_spend_detect()
$job$);

-- jobid 33 | active
select cron.schedule('lumea-weekend-campaign', '0 9 * * 2', $job$
SELECT agent_social_weekend_campaign()
$job$);

-- jobid 34 | active
select cron.schedule('lumea-referral-queue', '*/30 * * * *', $job$
SELECT agent_referral_queue_builder()
$job$);

-- jobid 35 | active
select cron.schedule('lumea-biman-prep', '0 8 * * *', $job$
SELECT agent_biman_site_visit_prep()
$job$);

-- jobid 36 | active
select cron.schedule('lumea-upsell-run', '*/15 * * * *', $job$
SELECT agent_upsell_checkin()
$job$);

-- jobid 37 | active
select cron.schedule('lumea-flash-run', '0 11-23 * * *', $job$
SELECT agent_flash_sale()
$job$);

-- jobid 38 | active
select cron.schedule('lumea-pricing-run', '0 6 * * *', $job$
SELECT agent_dynamic_pricing()
$job$);

-- jobid 39 | active
select cron.schedule('lumea-seo-review', '0 14 * * *', $job$
SELECT agent_seo_review_request()
$job$);

-- jobid 40 | DISABLED 2026-08-15 (D-8: duplicate of jobid 31)
select cron.schedule('lumea-ota-run', '0 */4 * * *', $job$
SELECT agent_ota_monitor()
$job$);

-- jobid 41 | active
select cron.schedule('lumea-strategist-run', '0 8 * * 1', $job$
SELECT agent_content_strategist()
$job$);

-- jobid 42 | active
select cron.schedule('lumea-bn-copy-run', '30 8 * * 1', $job$
SELECT agent_copywriter_bn()
$job$);

-- jobid 43 | active
select cron.schedule('lumea-en-copy-run', '0 9 * * 1', $job$
SELECT agent_copywriter_en()
$job$);

-- jobid 44 | active
select cron.schedule('lumea-visual-run', '30 9 * * 1', $job$
SELECT agent_visual_brief()
$job$);

-- jobid 45 | active
select cron.schedule('lumea-editor-run', '0 10 * * 1', $job$
SELECT agent_editor_review()
$job$);

-- jobid 46 | active
select cron.schedule('lumea-analytics-run', '0 8 * * 0', $job$
SELECT agent_content_analytics()
$job$);

-- jobid 47 | active
select cron.schedule('lumea-ceo-content-run', '0 11 * * 1', $job$
SELECT ceo_approve_content()
$job$);

-- jobid 48 | active
select cron.schedule('lumea-content-daily', '0 7 * * *', $job$
SELECT agent_copywriter_bn(); SELECT agent_copywriter_en(); SELECT agent_visual_brief();
$job$);

-- jobid 49 | active
select cron.schedule('lumea-content-pipeline', '0 2 * * 1', $job$
SELECT agent_content_pipeline()
$job$);

-- jobid 51 | active
select cron.schedule('outreach-bot-daily', '0 3 * * *', $job$

  SELECT net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/outreach-bot',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_token'
      )
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  
$job$);

-- jobid 52 | active
select cron.schedule('weekly-retention-monday', '0 3 * * 1', $job$

  SELECT net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/weekly-retention',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_token'
      )
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  
$job$);

-- jobid 53 | active
select cron.schedule('lighthouse-summary-nightly', '0 19 * * *', $job$
 SELECT public.fn_invoke_lighthouse_summary(); 
$job$);

-- jobid 54 | active
select cron.schedule('billing-integrity-daily', '15 1 * * *', $job$
select public.check_billing_integrity();
$job$);

-- jobid 55 | active
select cron.schedule('fountain-demand-to-leads', '30 2 * * *', $job$
SELECT public.rpc_sync_demand_to_leads();
$job$);

-- jobid 56 | active
select cron.schedule('lumea-flash-attribution', '30 0 * * *', $job$
SELECT public.agent_flash_attribution()
$job$);

-- jobid 57 | active
select cron.schedule('lumea-flash-nudge', '15 11 * * *', $job$

  SELECT net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/wf-flash-nudge',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_token'
      )
    ),
    body := '{}'::jsonb
  );

$job$);

-- jobid 58 | active
select cron.schedule('channel-reconcile-nightly', '30 22 * * *', $job$
 SELECT public.fn_channel_reconcile(); 
$job$);

-- jobid 59 | active
select cron.schedule('channel-drain-15min', '*/15 * * * *', $job$

  SELECT net.http_get(
    url := 'https://fountainbd.com/api/channel/drain',
    headers := jsonb_build_object('x-drain-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'CHANNEL_DRAIN_KEY')),
    timeout_milliseconds := 15000
  );
  
$job$);
