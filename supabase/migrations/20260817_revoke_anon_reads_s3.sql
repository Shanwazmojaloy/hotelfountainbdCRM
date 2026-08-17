-- S-3. Revoke anon SELECT across public, except three deliberately-public tables.
-- Applied to mynwfkgksqqwlqowlscj on 2026-08-17 as `revoke_anon_reads_s3`.
--
-- MEASURED EXPOSURE, publishable key + `x-tenant-host: hotel.fountainbd.com`.
-- 22 of the 49 anon-readable tables returned real rows to an anonymous caller:
--   review_queue          1373  guest_email
--   notifications_log     1194  recipient_email, subject, body (full sent emails)
--   housekeeping_tasks    1003
--   upsell_offers          768  guest_name, phone, room_number, check_in
--   workflow_runs          727
--   review_requests        306  guest_name, phone
--   folios                 155  per-reservation charges, room_number, amounts
--   account_churn_profile   84 | room_assets 84 | night_audit_log 62
--   hotel_settings          33  incl. the daily night-audit cash tokens
--   rooms 28 | b2b_outreach_log 17 | workflow_locks 17 | manus_config 10
--   b2b_partners 5 | tenant_role_permissions 4 | marketing_content 2
--   fountain_demand_thresholds 1
-- Every one returned ZERO rows without the header. That is the finding: the
-- header IS the authentication, and the header is supplied by the caller.
--
-- NOT credentials. hotel_settings and manus_config are key/value tables, and the
-- keys matching /token|key|secret/ are `token_YYYY-MM-DD` night-audit CASH
-- figures with 1-5 character values. This is PII and financial exposure, not
-- credential exposure - worth stating precisely rather than inflating.
--
-- WHY THIS IS SAFE:
--   The CRM browser client uses NEXT_PUBLIC_SUPABASE_ANON_KEY as its apikey, but
--   after sign-in the request carries the user's JWT and runs as `authenticated`,
--   not `anon`. The proof is historical, not theoretical: S-1 removed anon
--   INSERT/UPDATE/DELETE on reservations, guests and transactions on 2026-08-15,
--   and check-in, folio charges and payments have worked every day since. If the
--   CRM ran as anon, S-1 would have broken it that afternoon.
--   AuthGate.jsx performs no table reads at all, so nothing is read before login.
--   Server routes use tenantClient() -> crm_tenant or service_role, untouched.
--
-- PRESERVED - these three read the same with or without the header, i.e. they are
-- public by deliberate policy. No consumer for them exists anywhere in this repo,
-- so they are most likely read by something outside it, and breaking an unknown
-- external reader is worse than leaving three low-sensitivity tables public:
--   fountain_inventory, lead_course_dates, system_permissions
--
-- AFTER: anon 3 SELECT / 0 INSERT. authenticated 68 / 65, crm_tenant 47,
-- service_role 108 - all unchanged. Re-probed: 46 tables now return 42501.
do $$
declare r record; n int := 0;
begin
  for r in
    select c.oid::regclass as t
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'SELECT')
      and c.relname not in ('fountain_inventory','lead_course_dates','system_permissions')
  loop
    execute format('revoke select on table %s from anon', r.t);
    n := n + 1;
  end loop;
  raise notice 'S-3: revoked anon SELECT on % tables', n;
end $$;
