# pg_cron schedule — Supabase project `mynwfkgksqqwlqowlscj`

51 jobs. Schedules are UTC (pg_cron runs in the database timezone, UTC on Supabase).

| jobid | jobname | schedule (UTC) | active | what it does |
|---:|---|---|---|---|
| 2 | `hf-checkout-reminder` | `30 4 * * *` | yes | POSTs to edge function wf-checkout-alerts (mode=reminder) |
| 3 | `hf-overdue-alert` | `30 6 * * *` | yes | POSTs to edge function wf-checkout-alerts (mode=overdue) |
| 4 | `hf-evening-report` | `0 15 * * *` | yes | POSTs to edge function wf-evening-report |
| 7 | `hf-competitor-monitor` | `0 0 * * *` | yes | POSTs to edge function wf-competitor-monitor |
| 8 | `hf-backup-verify` | `0 17 * * 0` | yes | POSTs to edge function wf-backup-verify (60s timeout) |
| 9 | `hf-booking-confirm` | `*/5 * * * *` | yes | POSTs to edge function wf-guest-emails (mode=confirmation) |
| 10 | `hf-review-request` | `*/15 * * * *` | yes | POSTs to edge function wf-guest-emails (mode=review_batch) with up to 10 due review_queue reservation ids |
| 11 | `b2b-daily-followup-check` | `0 3 * * *` | yes | Inserts WhatsApp follow-up rows into b2b_followup_log for due, zero-booking b2b_partners |
| 12 | `b2b-auto-cold-mark` | `0 4 * * *` | yes | Marks stale b2b_partners COLD/LOW and their matching leads LOST |
| 13 | `lumea-billing-heal` | `0 */6 * * *` | yes | calls agent_billing_selfheal() |
| 14 | `lumea-rooms-heal` | `*/30 * * * *` | yes | calls agent_rooms_selfheal() |
| 15 | `lumea-reservations-heal` | `0 * * * *` | yes | calls agent_reservations_selfheal() |
| 16 | `lumea-guests-heal` | `0 19 * * *` | yes | calls agent_guests_selfheal() |
| 17 | `lumea-housekeeping-heal` | `*/15 * * * *` | yes | calls agent_housekeeping_selfheal() |
| 19 | `lumea-leads-heal` | `0 3 * * *` | yes | calls agent_leads_selfheal() |
| 20 | `lumea-audit-heal` | `0 16 * * *` | yes | calls agent_audit_selfheal() |
| 21 | `lumea-master-sweep` | `0 0 * * *` | yes | calls run_all_agents() |
| 25 | `lumea-airline-heal` | `0 8  * * 1` | yes | calls agent_airline_leads_selfheal() |
| 26 | `lumea-ngo-heal` | `0 8  * * 2` | yes | calls agent_ngo_leads_selfheal() |
| 27 | `lumea-corporate-leads-heal` | `0 8 * * 3` | yes | calls agent_corporate_leads_selfheal() |
| 28 | `lumea-ceo-followup` | `0 9 */3 * *` | yes | calls agent_ceo_followup() |
| 29 | `lumea-ceo-inbox` | `0 * * * *` | yes | calls ceo_process_inbox() |
| 30 | `lumea-corporate-detect` | `0 */6 * * *` | yes | Inserts CORPORATE_DETECT leads from checked-out reservations >= 15000 with valid BD phone |
| 31 | `lumea-ota-monitor` | `0 */4 * * *` | yes | calls agent_ota_monitor() |
| 32 | `lumea-corp-detect` | `0 */6 * * *` | yes | calls agent_corporate_spend_detect() |
| 33 | `lumea-weekend-campaign` | `0 9 * * 2` | yes | calls agent_social_weekend_campaign() |
| 34 | `lumea-referral-queue` | `*/30 * * * *` | yes | calls agent_referral_queue_builder() |
| 35 | `lumea-biman-prep` | `0 8 * * *` | yes | calls agent_biman_site_visit_prep() |
| 36 | `lumea-upsell-run` | `*/15 * * * *` | yes | calls agent_upsell_checkin() |
| 37 | `lumea-flash-run` | `0 11-23 * * *` | yes | calls agent_flash_sale() |
| 38 | `lumea-pricing-run` | `0 6 * * *` | yes | calls agent_dynamic_pricing() |
| 39 | `lumea-seo-review` | `0 14 * * *` | yes | calls agent_seo_review_request() |
| 40 | `lumea-ota-run` | `0 */4 * * *` | yes | calls agent_ota_monitor() (duplicate of jobid 31) |
| 41 | `lumea-strategist-run` | `0 8 * * 1` | yes | calls agent_content_strategist() |
| 42 | `lumea-bn-copy-run` | `30 8 * * 1` | yes | calls agent_copywriter_bn() |
| 43 | `lumea-en-copy-run` | `0 9 * * 1` | yes | calls agent_copywriter_en() |
| 44 | `lumea-visual-run` | `30 9 * * 1` | yes | calls agent_visual_brief() |
| 45 | `lumea-editor-run` | `0 10 * * 1` | yes | calls agent_editor_review() |
| 46 | `lumea-analytics-run` | `0 8 * * 0` | yes | calls agent_content_analytics() |
| 47 | `lumea-ceo-content-run` | `0 11 * * 1` | yes | calls ceo_approve_content() |
| 48 | `lumea-content-daily` | `0 7 * * *` | yes | calls agent_copywriter_bn(), agent_copywriter_en(), agent_visual_brief() in sequence |
| 49 | `lumea-content-pipeline` | `0 2 * * 1` | yes | calls agent_content_pipeline() |
| 51 | `outreach-bot-daily` | `0 3 * * *` | yes | POSTs to edge function outreach-bot with a vault Bearer token |
| 52 | `weekly-retention-monday` | `0 3 * * 1` | yes | POSTs to edge function weekly-retention with a vault Bearer token |
| 53 | `lighthouse-summary-nightly` | `0 19 * * *` | yes | calls public.fn_invoke_lighthouse_summary() |
| 54 | `billing-integrity-daily` | `15 1 * * *` | yes | calls public.check_billing_integrity() |
| 55 | `fountain-demand-to-leads` | `30 2 * * *` | yes | calls public.rpc_sync_demand_to_leads() |
| 56 | `lumea-flash-attribution` | `30 0 * * *` | yes | calls public.agent_flash_attribution() |
| 57 | `lumea-flash-nudge` | `15 11 * * *` | yes | POSTs to edge function wf-flash-nudge with a vault Bearer token |
| 58 | `channel-reconcile-nightly` | `30 22 * * *` | yes | calls public.fn_channel_reconcile() |
| 59 | `channel-drain-15min` | `*/15 * * * *` | yes | GETs https://fountainbd.com/api/channel/drain with vault x-drain-key header |
