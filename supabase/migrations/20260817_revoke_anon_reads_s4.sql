-- S-4. The narrow, verified version of S-3 (which took the CRM down).
-- Applied 2026-08-17 as `revoke_anon_reads_s4_unreferenced_only`.
--
-- ESTABLISHED FIRST, by reading the code instead of arguing from history:
--   src/components/AuthGate.jsx persists its session as
--   localStorage['lumea_session'] = {id, session_v, name, role} and never calls
--   supabase.auth anywhere. The CRM's login is entirely app-level. The browser
--   therefore has NO Supabase identity, ever - every browser -> PostgREST
--   request is `anon` permanently and by design, and the anon SELECT grant is
--   load-bearing. That is why S-3 broke the dashboard.
--
-- SO: revoke anon SELECT only on tables that NO code path references.
-- Keep-list = every table appearing in any from('...') across src/ and app/
-- (deliberately over-inclusive - it counts server routes too), plus the three
-- tables that read identically with and without x-tenant-host, i.e. public by
-- deliberate policy.
--
-- CLOSED - rows that were readable by any anonymous caller sending one header:
--   review_queue      1373  guest_email
--   notifications_log 1194  recipient_email, subject, body
--   upsell_offers      768  guest_name, phone, room_number, check_in
--   review_requests    306  guest_name, phone
--   account_churn_profile 84 | room_assets 84 | b2b_outreach_log 17
--   workflow_locks 17 | manus_config 10 | b2b_partners 5
--   tenant_role_permissions 4 | marketing_content 2 | fountain_demand_thresholds 1
--   38 tables, ~3,900 rows, and every guest email/name/phone outside the
--   reservation tables.
--
-- STILL EXPOSED, knowingly: housekeeping_tasks 1003, workflow_runs 727,
-- folios 155, night_audit_log 62, hotel_settings 33, rooms 28. The browser
-- genuinely reads these and has no identity to read them with. Closing them is
-- an application change - route reads through /api/crm/* the way writes already
-- are, or adopt real Supabase Auth sessions - not a grant change.
--
-- VERIFIED IN THE BROWSER AFTER APPLYING, which is the step S-3 skipped:
--   /crm            Available 27, Dirty 1, 28 rooms, revenue chart intact
--   /crm/reservations   1,712 rows
--   /crm/housekeeping   board loads, 829 completed
--   /crm/reports        dues table, Total Due 33,600, 10 outstanding
--   /crm/settings       hotel name, VAT 15, SC 5 all populated
--   /crm/guests         1,821 of 1,821
do $$
declare
  r record;
  n int := 0;
  keep text[] := array[
    'activities','authorized_devices','billing_invoices','bridge_events',
    'channel_accounts','content_calendar','deals','folios','guest_ledger','guests',
    'hotel_settings','housekeeping_tasks','inventory_ledger','invoice_line_items',
    'leads','night_audit_log','notifications','payment_transactions','prospects',
    'referral_queue','reservation_requests','reservations','restaurant_menu_items',
    'restaurant_order_items','restaurant_orders','restaurant_register_shifts',
    'rooms','staff','sync_queue','tenant_ai_usage','tenants','transactions',
    'workflow_runs',
    'fountain_inventory','lead_course_dates','system_permissions'
  ];
begin
  for r in
    select c.oid::regclass as t
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'SELECT')
      and not (c.relname = any(keep))
  loop
    execute format('revoke select on table %s from anon', r.t);
    n := n + 1;
  end loop;
  raise notice 'S-4: revoked anon SELECT on % unreferenced tables', n;
end $$;
