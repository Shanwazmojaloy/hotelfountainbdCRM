-- S-2. Revoke anon INSERT/UPDATE/DELETE across public.
-- Applied to mynwfkgksqqwlqowlscj on 2026-08-17 as `revoke_anon_writes_s2`.
--
-- WHY (verified live, not inferred):
--   public.lumea_pre_request() is wired as pgrst.db_pre_request and therefore runs
--   on EVERY PostgREST request, including anonymous ones. It reads the
--   x-tenant-host / x-forwarded-host request header, resolves it through
--   resolve_tenant_by_host(), and sets app.current_tenant_id. current_tenant_id()
--   reads that GUC as its FIRST coalesce branch. 49 write policies in this schema
--   are of the form:
--       tenant_isolation FOR ALL USING (tenant_id = current_tenant_id())
--   so an anonymous caller who sends one header satisfies every one of them.
--
--   Proved with the publishable key against production:
--     GET b2b_partners, workflow_runs  ->  0 rows with no header
--                                      ->  real rows with x-tenant-host: hotel.fountainbd.com
--     GET reservations/guests/transactions -> 42501 in BOTH cases, because their
--                                      anon GRANT was already revoked in S-1.
--   That is the S-1 lesson restated: the policy is not the defence. The absent
--   GRANT is the defence.
--
-- WHY THIS IS SAFE (consumer audit, not a blind revoke):
--   Nothing in client code writes any of the 42 affected tables. Grepping app/
--   and src/ for `from('<table>')` across all of them found exactly ONE hit -
--   src/components/WorkflowMonitor.jsx:40 - and it is a .select(), a read, behind
--   AuthGate. public/ and the root HTML files contain no writes at all. Every real
--   writer is an edge function using SUPABASE_SERVICE_ROLE_KEY, and service_role
--   bypasses GRANT and RLS entirely.
--
--   Left untouched on purpose: `authenticated` (the logged-in CRM) and
--   `crm_tenant` (the least-privilege role the server-side /api/crm/* routes
--   assume via tenantClient() when TENANT_JWT_MODE=on - its broad grants are the
--   whole point of that design).
--
-- SELECT is deliberately NOT revoked. Read exposure is a separate and smaller
-- question, and revoking reads could break a public page this audit has not found.
-- Writes are the integrity risk, so writes go first.
--
-- BEFORE: 42 tables anon-writable.  AFTER: 0.
--   authenticated INSERT intact on 65 tables, service_role on 108.
--   Re-probed after applying: INSERT as anon returns 42501 on workflow_runs,
--   b2b_partners, daily_closing, marketing_content and reservations.
--
-- NOTE on measuring this: a PATCH filtered to a non-existent id returns 200 both
-- before and after the revoke, so it is NOT a privilege test. Use an INSERT and
-- read the SQLSTATE - 42501 means denied, a constraint error means granted.
do $$
declare r record; n int := 0;
begin
  for r in
    select c.oid::regclass as t
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE'))
  loop
    execute format('revoke insert, update, delete on table %s from anon', r.t);
    n := n + 1;
  end loop;
  raise notice 'S-2: revoked anon writes on % tables', n;
end $$;
