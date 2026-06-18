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

### ✅ Step 1 — DONE (applied to prod 2026-06-06, migration `multitenant_cutover_step1_map_hotelfountain_users`)
The 3 Hotel Fountain auth users are now mapped into `tenant_users` so they
resolve by **real membership**, not the fallback:

| user_id | email | role |
|---|---|---|
| c953d9cd… | ahmedshanwaz5@gmail.com | owner (is_owner=true) |
| cfe519e0… | fo.hotelfountain799@gmail.com | receptionist |
| 0dbe2eff… | hotelfountain.hk@gmail.com | housekeeping |

Verified: each user + an unmapped user + anon **all still resolve to `46bbc3ff…`**
(membership for the 3, fallback for the rest) → zero behavior change. Roles match
the CRM's own vocabulary in `crm-src.jsx` (`ROLES`: owner/manager/receptionist/
housekeeping); note the app reads role from its **staff table**, NOT from
`tenant_users.role`, so these values are for tenant-resolution + future use only.
Reversible: `delete from public.tenant_users where tenant_id='46bbc3ff…';`

## ⛔ Remaining cutover (do when onboarding hotel #2, with that tenant's real creds to test against)

These touch live, message-sending systems — **do NOT run blind on prod**, and
they provide **zero benefit until a second active tenant exists**.

> A Supabase **dev branch is the wrong tool for most of this**: branches start
> schema-only (no prod data, no `auth.users`), so they can't exercise a
> `tenant_users` mapping or the agent message-senders. Test step 2 via a **Vercel
> preview deployment** off a git branch, pointed at a 2-tenant dataset.

### 2. Agent routes — ✅ DONE (2026-06-06), but the split matters
**Critical classification (the earlier "de-hardcode all 10" was wrong).** The 10
`app/api/agents/*` routes are TWO different things:

- **Lumea B2B SALES funnel (8) — the SELLER's pipeline. Stay single-tenant.**
  `payment-send`, `payment-confirm`, `deal-alert`, `reply-intake`,
  `reply-intake-poll`, `reply-digest`, `ceo-auditor`, `follow-up-bot`. These act on
  `corporate_leads` / `outreach_log`, email Shan or prospects from Shan's own
  Brevo/bKash/Gmail, and `payment-confirm` is literally what *creates* tenant #2.
  Looping these per customer-hotel would make every customer blast Shan's sales
  emails — **do NOT loop them.** Their `const TENANT = '46bbc3ff'` (a log tag for
  the seller's home tenant) is correct as-is.

- **Per-hotel OPERATIONS (2) — loop per active tenant.** `daily-ops` (revenue
  manager + automated FB marketer) and `weekly-retention` (guest retention drafts).
  These were refactored: a shared `app/api/agents/_tenants.ts#activeOpsTenants()`
  returns all `is_active` tenants; each route loops and reads the tenant's own
  settings with **env fallback** (`t.facebook_page_token ?? process.env.FACEBOOK_PAGE_TOKEN`,
  `t.hotel_whatsapp ?? …`, `t.hotel_name ?? …`, `t.hotel_room_count ?? …`).
  Safety net: if the `tenants` fetch fails/empties, it returns a single synthetic
  tenant with null columns → byte-identical to pre-multitenant behavior. With the
  one live tenant (null secret columns) it runs exactly as before; `daily-ops` also
  now **skips** the FB post if a tenant has no FB creds instead of erroring.
  Typecheck clean (Windows `tsc --noEmit` EXIT=0). Merged to main.

When onboarding hotel #2: populate that tenant's `tenants` row secret columns
(`facebook_page_token`, `facebook_page_id`, `hotel_whatsapp`, `hotel_name`,
`hotel_city`, `hotel_room_count`). No code change needed — the two ops routes pick
it up automatically. Still smoke-test on a 2-tenant Vercel preview first.

### 3. Establish per-session tenant context in the web tier (optional)
The web CRM relies on `current_tenant_id()` resolving via membership (step 1).
If you instead want explicit per-request scoping, call
`select set_config('app.current_tenant_id', '<tenant>', true)` after auth, or set
a custom JWT claim and read it in `current_tenant_id()`.

### 4. Onboarding flow → wire the UI
`/api/admin/onboard-tenant` already creates a tenant + cron_secret + subdomain.
Add a signup screen that calls it, seeds rooms (`db/01_setup_and_rooms.sql` with
the new `tenant_id`), and inserts the first `tenant_users` row (owner).

### 5. ⛔ BLOCKED on the public booking site — remove the fallback LAST
Dropping the `'46bbc3ff…'::uuid` default from `current_tenant_id()` makes an
unresolved session resolve to **NULL** (deny-all) instead of Hotel Fountain.

**Hard evidence it breaks prod today (verified 2026-06-06):** the public booking
site `fountainbd.com` reads rooms/availability as the **anon** role. `rooms` RLS =
`((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))`. Hotel Fountain's 28
rooms have `tenant_id = 46bbc3ff` (not null), so anon sees them **only** because
the fallback resolves `current_tenant_id() = 46bbc3ff`. Remove the fallback →
anon → NULL → `46bbc3ff = NULL` is not true, `tenant_id IS NULL` is false →
**0 rooms visible → the availability widget and booking funnel go dark.** (Staff
logins survive — they resolve via `tenant_users` membership, step 1 — and agent
crons survive — they use the service role, which bypasses RLS. The casualty is the
anonymous public booking path specifically.)

Prerequisite before step 5 is even possible: give the **anon/public** path an
explicit tenant context that doesn't depend on the fallback — e.g. resolve tenant
by request host (`fountainbd.com` / `<slug>.fountainbd.com` → tenant) and
`set_config('app.current_tenant_id', …)` for the public read, or a per-domain
anon policy. That's multi-domain hosting work that only becomes meaningful at
tenant #2. **While single-tenant, removing the fallback has zero security benefit
(one tenant's data) and guaranteed breakage — so it stays.**

## Why staged
`current_tenant_id()`'s fallback is the only thing keeping the anonymous public
booking site working. Removing it (step 5) before the public path is domain-routed
would dark the `fountainbd.com` availability/booking funnel for all visitors.
Sequence matters: it is correctly the LAST step, gated on real multi-domain setup.
