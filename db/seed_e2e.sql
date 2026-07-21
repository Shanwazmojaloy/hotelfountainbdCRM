-- ============================================================================
-- seed_e2e.sql  -- E2E TEST-TENANT seed. Run in the Supabase SQL editor of your
-- NON-PROD test database (a Supabase branch or a separate test project) — NEVER prod.
--
-- Creates 6 bookable rooms + an ACTIVATED Owner login so Playwright can authenticate
-- (bypasses the normal OTP self-activation). Idempotent — safe to re-run.
--
-- ---- Values to plug into GitHub (Settings -> Secrets and variables -> Actions) ----
--   E2E_BASE_URL   = <your test deploy URL>
--   E2E_EMAIL      = e2e-owner@fountainbd.test      (Secret)
--   E2E_PASSWORD   = E2eTestPass-2026               (Secret)
--   E2E_TEST_ROOMS = T01,T02,T03,T04,T05,T06        (repo Variable)
--
-- The test DEPLOY must scope to the tenant below — set its NEXT_PUBLIC_TENANT_ID env to
-- this uuid (and relax the perimeter gate: widen OFFICE_IPS or add 'owner' to REMOTE_ROLES,
-- which it already is, so the owner login works from the CI runner IP).
-- ============================================================================

do $$
declare
  v_tenant uuid := '00000000-e2e0-4000-a000-000000000001';  -- test tenant (match NEXT_PUBLIC_TENANT_ID)
begin
  -- 6 rooms (E2E_TEST_ROOMS): AVAILABLE, plain Standard category @ 2000 BDT.
  insert into public.rooms (room_number, category, price, status, tenant_id)
  select rn, 'Standard', 2000, 'AVAILABLE', v_tenant
  from unnest(array['T01','T02','T03','T04','T05','T06']) as rn
  where not exists (select 1 from public.rooms r where r.room_number = rn and r.tenant_id = v_tenant);

  -- Activated Owner account. pwh = bcrypt('E2eTestPass-2026'). Owner role so it passes the
  -- perimeter gate off-network and has every POS capability the specs exercise.
  if not exists (select 1 from public.staff where lower(email) = 'e2e-owner@fountainbd.test') then
    insert into public.staff (name, email, role, tenant_id, pwh, activated, session_v)
    values ('E2E Owner', 'e2e-owner@fountainbd.test', 'owner', v_tenant,
            '$2a$10$LvpaRC9BfSNUn18i7.rqwukroiz8RYMJm6.j5o2i9DTI59.P2xVI2', true, 1);
  end if;
end $$;

-- Sanity check (run after): should return the 6 rooms + the owner.
-- select room_number, status from public.rooms where tenant_id='00000000-e2e0-4000-a000-000000000001' order by 1;
-- select email, role, activated from public.staff where tenant_id='00000000-e2e0-4000-a000-000000000001';
