# Multi-Tenant Cutover Runbook

Status as of 2026-06-06. The CRM is **built** multi-tenant (tenant tables, the
`/api/admin/onboard-tenant` API, per-tenant secrets, white-label) but **ran**
single-tenant via two crutches. This runbook tracks the safe path to full
multi-tenancy without disrupting the live Hotel Fountain operation.

## ✅ Done (safe foundation — already applied to prod)

Migration `multitenant_foundation_tenant_resolution`:

```sql
-- current_tenant_id() now resolves by real membership/ownership, fallback kept
create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(
    nullif(current_setting('app.current_tenant_id', true), '')::uuid,            -- per-request GUC
    (select tu.tenant_id from public.tenant_users tu where tu.user_id = auth.uid() limit 1), -- membership
    (select t.id from public.tenants t where t.owner_id = auth.uid() limit 1),   -- ownership
    '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid                                 -- legacy fallback
  );
$$;
-- tenants.owner_id linked to the owner (was null)
```

Verified inert: anon, owner, and unmapped staff all still resolve to Hotel
Fountain (`46bbc3ff…`). Also already applied earlier: cross-tenant RLS isolation
on 18 tables (`tenant_isolation` policy = `reservations` pattern), function
search_path hardening, FK indexes.

## ⛔ Remaining cutover (do on a Supabase branch, test, then merge)

These touch live, message-sending systems — **do NOT run blind on prod**.

### 1. Map the existing Hotel Fountain users into `tenant_users`
So they resolve by membership (not just the fallback). **Verify the `role`
values against how `crm-src.jsx` resolves CRM permissions first** — wrong roles
change what a user can see/do.

```sql
insert into public.tenant_users (tenant_id, user_id, role, is_owner, email) values
  ('46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8','c953d9cd-f1f1-446b-aa1a-025e2367dbc8','owner',true,'ahmedshanwaz5@gmail.com'),
  ('46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8','cfe519e0-aea3-414a-8845-3233156b4779','receptionist',false,'fo.hotelfountain799@gmail.com'),
  ('46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8','0dbe2eff-71b0-49cb-b33a-8e26ca3a5962','housekeeping',false,'hotelfountain.hk@gmail.com')
on conflict do nothing;
```

### 2. De-hardcode the agent cron routes (~15 files in `app/api/agents/*`)
Each has `const TENANT = '46bbc3ff…'` and queries `tenant_id=eq.${TENANT}`.
Wrap each route body in a per-tenant loop:

```ts
const tenants = await fetchJson(`${SB_URL}/rest/v1/tenants?select=id&is_active=eq.true`, { headers: svc });
for (const { id: TENANT } of tenants) {
  // ... existing per-tenant logic, unchanged ...
}
```
With 1 tenant this is behaviorally identical; with N tenants every hotel gets
serviced. Test each agent against a 2-tenant branch before merging — these send
real WhatsApp/email, so a bug spams customers.

### 3. Establish per-session tenant context in the web tier (optional)
The web CRM relies on `current_tenant_id()` resolving via membership (step 1).
If you instead want explicit per-request scoping, call
`select set_config('app.current_tenant_id', '<tenant>', true)` after auth, or set
a custom JWT claim and read it in `current_tenant_id()`.

### 4. Onboarding flow → wire the UI
`/api/admin/onboard-tenant` already creates a tenant + cron_secret + subdomain.
Add a signup screen that calls it, seeds rooms (`db/01_setup_and_rooms.sql` with
the new `tenant_id`), and inserts the first `tenant_users` row (owner).

### 5. Only after 1–4 are tested: remove the fallback
Drop the `'46bbc3ff…'::uuid` default from `current_tenant_id()` so an unresolved
session gets **no** tenant (deny-all) instead of leaking to Hotel Fountain. This
is the final hard cutover — do it last, on a branch, with every login path tested.

## Why staged
`current_tenant_id()`'s fallback is the only thing keeping the live site working.
Removing it (step 5) before steps 1–4 are done and tested would blank the CRM for
all 3 live staff logins and break every agent cron. Sequence matters.
