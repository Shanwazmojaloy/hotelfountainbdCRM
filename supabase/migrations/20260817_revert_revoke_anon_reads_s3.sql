-- REVERT of S-3 (revoke_anon_reads_s3). Applied 2026-08-17.
-- S-2 (anon writes) is NOT reverted and remains in force - see below for why
-- that one is safe and this one was not.
--
-- WHAT HAPPENED: S-3 broke the live CRM. Confirmed in the browser minutes later:
--   GET /rest/v1/rooms            -> 401
--   GET /rest/v1/night_audit_log  -> 401
--   dashboard rendered "0 rooms" for a 28-room property.
-- After this revert the same three requests return 200 and the dashboard reads
-- "Available 27, Dirty 1, 28 rooms". /crm/reservations loads 1,712 rows.
--
-- WHY MY REASONING WAS WRONG - the important part:
--   I argued the CRM browser client runs as `authenticated` after sign-in, and
--   cited S-1 as evidence: S-1 removed anon WRITES on reservations/guests/
--   transactions on 15 Aug and the CRM kept working.
--   The truth is the opposite of my conclusion. The 401s prove the browser talks
--   to PostgREST as `anon`. The CRM's login is APP-LEVEL (AuthGate + its own
--   session); it is not Supabase Auth, so no user JWT is ever attached and every
--   browser request is anonymous. The UI showing "Shanwaz Ahmed OWNER" says
--   nothing about the Postgres role.
--   S-1 was survivable because the components' direct supabase.from(...).insert
--   write paths are largely superseded by the /api/crm/* server routes
--   (tenantClient -> crm_tenant / service_role). Reads were never moved, so they
--   still go direct - as anon - which is exactly what S-3 cut off.
--
-- WHY S-2 IS DIFFERENT AND STAYS:
--   S-2 revoked writes on 42 tables. NONE of them is written directly by the
--   browser. The tables the components do write - guests, reservations,
--   transactions, rooms, folios, hotel_settings, housekeeping_tasks - were
--   already not anon-writable before today, so S-2 could not and did not touch
--   those paths.
--
-- THE REAL FIX, not attempted here: the anon grant is load-bearing because the
-- browser has no Supabase identity. Closing the read exposure properly means
-- either moving the CRM onto real Supabase Auth sessions so reads run as
-- `authenticated`, or routing reads through /api/crm/* like the writes already
-- are. Revoking the grant while the browser is anonymous will always take the
-- application down with it.
grant select on table
  public.account_churn_profile, public.agent_revenue_snapshot, public.audit_logs,
  public.authorized_devices, public.b2b_bookings, public.b2b_followup_log,
  public.b2b_invoices, public.b2b_outreach_log, public.b2b_partners,
  public.ceo_pipeline, public.council_panelists, public.council_sessions,
  public.crm_build, public.crm_chunks, public.customers, public.daily_closing,
  public.email_chunks, public.event_inquiries, public.folios,
  public.fountain_demand_thresholds, public.hotel_settings,
  public.housekeeping_tasks, public.lighthouse_summaries, public.maintenance_events,
  public.manus_config, public.marketing_content, public.night_audit_log,
  public.notifications_log, public.ota_rate_plans, public.profiles,
  public.push_subscriptions, public.rate_plans, public.review_queue,
  public.review_requests, public.room_assets, public.rooms, public.subscriptions,
  public.tenant_guests, public.tenant_reservations, public.tenant_role_permissions,
  public.tenant_rooms, public.tenant_users, public.tenants, public.upsell_offers,
  public.workflow_locks, public.workflow_runs
to anon;
