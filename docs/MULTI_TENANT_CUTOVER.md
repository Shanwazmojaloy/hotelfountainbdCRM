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

### 2. De-hardcode the agent cron routes (10 files in `app/api/agents/*`) — ⚠ SECRET-AWARE
The routes already read `process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff…'`, but
the bigger problem is **they also pull GLOBAL secrets from env** (Hotel Fountain's
Facebook page, WhatsApp number, Brevo key, Anthropic key). A per-tenant loop that
only swaps the `tenant_id` filter would make **tenant #2's guests get messaged
from Hotel Fountain's accounts.** Each route must load the *acting tenant's own*
secrets from the `tenants` row. Required env→column mapping:

| Global env var (today) | Per-tenant column (`tenants`) | Notes |
|---|---|---|
| `FACEBOOK_PAGE_ID` | `facebook_page_id` | marketer |
| `FACEBOOK_PAGE_TOKEN` | `facebook_page_token` | marketer |
| `HOTEL_WHATSAPP` | `hotel_whatsapp` | marketer/follow-up |
| `HOTEL_NAME` / `HOTEL_CITY` / `HOTEL_ROOM_COUNT` | `hotel_name` / `hotel_city` / `hotel_room_count` | |
| `BREVO_API_KEY` | `brevo_api_key` | email senders |
| `ANTHROPIC_API_KEY` | `anthropic_api_key` | ceo-auditor / reply-intake |
| Gmail user/pass | `gmail_user` / `gmail_app_password` | reply-intake-poll |
| `CRON_SECRET` | **stays global** | platform cron caller auth |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | **stay global** | service role spans tenants |

Centralize with one helper, then change each route's body to loop and read
`t.<secret>` instead of `process.env.<X>`:

```ts
// app/api/agents/_tenants.ts
export async function activeTenants(base: string, svc: HeadersInit) {
  const cols = 'id,hotel_name,hotel_city,hotel_room_count,hotel_whatsapp,'
    + 'facebook_page_id,facebook_page_token,brevo_api_key,anthropic_api_key,'
    + 'gmail_user,gmail_app_password';
  const r = await fetch(`${base}/tenants?select=${cols}&is_active=eq.true`, { headers: svc });
  if (!r.ok) throw new Error(`tenants: ${await r.text()}`);
  return r.json() as Promise<Array<Record<string, any>>>;
}
```
```ts
for (const t of await activeTenants(BASE, headers())) {
  const TENANT = t.id;
  const fbToken = t.facebook_page_token, waNumber = (t.hotel_whatsapp||'').replace(/\D/g,'');
  // ... existing body, but every process.env.<secret> → t.<column> ...
}
```
With 1 tenant this is behaviorally identical (Hotel Fountain's row carries the
same values currently in env). With N tenants each hotel is serviced from its own
accounts. **Test each of the 10 agents against a 2-tenant Vercel preview before
merging — a bug here spams real customers or cross-posts to the wrong brand.**
The 10 files: `daily-ops`, `weekly-retention`, `payment-send`, `payment-confirm`,
`reply-intake`, `reply-intake-poll`, `reply-digest`, `follow-up-bot`,
`deal-alert`, `ceo-auditor`.

Prereq: populate Hotel Fountain's `tenants` row secret columns (currently the live
values live only in Vercel env) before flipping any route to read from the table.

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
