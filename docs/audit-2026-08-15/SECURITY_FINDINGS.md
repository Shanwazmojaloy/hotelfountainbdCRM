# Security findings — 2026-08-15

Found while pulling the 23 deployed edge functions that had no source in this
repo. None of these were visible from the repo, because the code was not in it.

---

## S-1 · Live Vercel API token in a publicly invokable function — CRITICAL

**`supabase/functions/vercel-deploy/index.ts`**, `verify_jwt: false`, deployed v34.

A Vercel API token sat in plaintext as a module constant and was used against
`api.vercel.com/v10/projects` and `/v13/deployments` with
`teamId=team_l1SAECyZJ9giIw4o2SGxjpqd`. The function takes no arguments and
performs no authentication of its own.

Anyone who could reach the function URL could create projects and push
production deployments under the team.

**Action required, in order**

1. Revoke the token at <https://vercel.com/account/tokens>.
2. Decide whether the function should exist at all — see S-4.
3. If keeping it: create a scoped replacement token, set `VERCEL_TOKEN` in
   Supabase → Edge Functions → Secrets, and redeploy. The committed source
   already reads from the env var and returns 503 when it is unset.

## S-2 · Live Netlify personal access token — HIGH

**`supabase/functions/import-guests/index.ts`**, `verify_jwt: false`, deployed v37.

A Netlify PAT in plaintext, used to POST deploys to site
`f8849319-3de0-445e-a087-0d0512947553`. Same exposure shape as S-1: no auth on
the endpoint, credential in the source.

**Action:** revoke at <https://app.netlify.com/user/applications#personal-access-tokens>,
then either delete the function (S-4) or set `NETLIFY_TOKEN` and redeploy.

## S-3 · VAPID private key hardcoded as a fallback — MEDIUM

**`supabase/functions/send-push/index.ts`**, `verify_jwt: false`, deployed v9.

`VAPID_PRIVATE_KEY` had the private key as a literal `??` fallback, so it applied
whenever the env var was unset — which is the normal case. Possession of a VAPID
private key allows forging web-push notifications to every subscriber in
`push_subscriptions`.

**Action:** generate a new VAPID keypair (`npx web-push generate-vapid-keys`),
set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as Supabase secrets, redeploy, and
update the public key wherever the browser subscribes. Existing subscriptions
must be re-created against the new public key.

> The committed source no longer contains any of these three values. It reads
> them from the environment and fails closed with a 503. Until each is rotated
> and redeployed, `supabase/functions/DEPLOYED.json` marks the file
> `repo_differs_from_deployed` with the reason.

## S-4 · Two of the three are dead scaffolding

`scripts/delete-scaffolding-functions.ps1` already deleted 26 one-off dev/deploy
helpers, described there as "all verify_jwt:false (publicly callable) and unused
by the app". `vercel-deploy` and `import-guests` are the same class and were
simply missed by the list.

`vercel-deploy` deploys a placeholder `index.html` to a project named
`hotel-fountain-v4`. `import-guests` posts HTML to Netlify as
`Content-Type: application/zip`, which cannot have worked.

Deleting both removes the exposure instead of managing it, and is almost
certainly what was intended in the first place. Add them to that script's `$fns`
list and run it.

---

## S-5 · outreach-bot has been failing to email leads since at least July — HIGH

**`supabase/functions/outreach-bot/index.ts:19`**

```
const SENDER_EMAIL = Deno.env.get("HOTEL_SENDER_EMAIL") || "hotellfountainbd@gmail.com";
```

`HOTEL_SENDER_EMAIL` is unset, so the fallback applies, and gmail.com is not a
verified Resend domain. This is the H-12 root cause again — in the sales
pipeline rather than the reports, and it is still happening.

Evidence, from `corporate_leads.notes`:

| Date | Leads failed with "The gmail.com domain is not verified" |
|---|---|
| 2026-07-21 | 4 |
| 2026-08-07 | 4 |
| 2026-08-08 | 4 |
| 2026-08-11 | 3 |

45 `[SEND-FAIL …]` rows in total, 15 of them this specific cause.

To the bot's credit it handles the failure honestly — it logs to `outreach_log`
only on a confirmed send, leaves the lead `pending` for retry, and records the
error. That is why this was recoverable at all: no phantom "contacted" rows were
written. It is the failure mode the report functions should have had.

**This one needs a decision, not a patch.** Setting `HOTEL_SENDER_EMAIL` to
`reservations@fountainbd.com` (or redeploying with that fallback) will
immediately start sending outreach email to real corporate leads on the next
3:00 AM UTC run. That is a business action, so it has been left alone and
recorded in `KNOWN_VIOLATIONS` in `scripts/check-edge-mail-invariants.mjs`
instead.

---

## Not findings

Two things the credential scan flagged that are harmless, recorded so nobody
re-investigates them:

- `app/api/crm/financial-metrics/route.ts` — the RPC name `get_secure_…`
  contains the literal `re_`, which matches the Resend key pattern.
- `app/admin/onboard/page.tsx:41` — `'xkeysib-...'` is a UI placeholder in an
  onboarding form, not a key.

---

## Correction — 2026-08-15, after checking the provider dashboards

Three of the five findings above were stated with more confidence than the
evidence supported. Corrected here rather than quietly edited.

### S-1 and S-2 · "live" was an assumption, not a finding

I described the Vercel and Netlify tokens as **live**. I had not checked. What I
actually observed was a plaintext credential in deployed source; I inferred the
rest.

Checked directly on 2026-08-15:

| Provider | Page | Result |
|---|---|---|
| Vercel | Account → Tokens, filter **All** | One token: *"Vercel Dashboard from Chrome on Windows (current)"* — the browser session. No API token. |
| Netlify | User settings → Applications → Personal access tokens | **No tokens exist.** |

So both were almost certainly revoked already. The exposure was real — plaintext
secrets in a `verify_jwt:false` function is a genuine defect regardless — but the
*severity* I assigned assumed a working credential, and that assumption was
wrong. S-1 was called CRITICAL on that basis. It should have read: "plaintext
credential in deployed source, validity unverified."

Caveat in the other direction: absence from those pages is strong evidence, not
proof. A token issued under a different account would not appear. Neither
function exists any more, so this is now moot either way.

**Both functions were deleted from Supabase on 2026-08-15**, which is what S-4
recommended. Their source stays in `supabase/functions/` as the record.

### S-3 · The VAPID keypair still needs rotating, and the secret names are wrong

Unchanged in substance: a VAPID private key does not get "revoked" — it stays
valid until the keypair is replaced and subscriptions are re-created.

Two secrets were added to the project on 2026-08-15 named `VAPID` and
`VAPID PUBLIC`. Neither is read by anything. `send-push` reads exactly
`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and `VAPID PUBLIC` contains a space,
which is not a valid environment variable name. Redeploying `send-push` against
those two would 503 on the `VAPID_READY` guard.

### S-5 · now confirmed at the source, not inferred

`HOTEL_SENDER_EMAIL` does not appear in the project's Edge Function secrets. The
gmail fallback in `outreach-bot` is therefore the value in use — previously
deduced from the `[SEND-FAIL …]` rows, now confirmed directly.

### Two things noticed on the secrets page

`BREVO_API_KEY` is still present. Nothing reads it since the H-12 migration; it
is the credential for the account that spent six weeks rejecting sends. Safe to
delete.

`VITE_SUPABASE_SERVICE_ROLE_KEY` holds a service-role key under a `VITE_` prefix.
As a Supabase Edge Function secret it is not exposed to a browser — but in any
Vite build, `VITE_`-prefixed variables are inlined into client bundles by design.
The name is a trap for whoever copies it next. Rename it.

### Correction 2 — the deal-alert impact claim was unsupported

Commit `43ef449` says *"the owner was not getting alerts"*, and I repeated that
in conversation. I did not check before saying it. Checked afterwards:

| Evidence | Result |
|---|---|
| `notifications_log` rows for `workflow = 'deal-alert'` | **0, ever** |
| `outreach_log` rows with `is_deal_ready` | **0** |
| `outreach_log` rows with `audited_at` set | **1**, on 2026-05-20 |
| `notifications_log` rows for `payment-send` | **1**, on 2026-05-20 |

The trigger chain is `reply-intake-poll` (Vercel cron, 01:00 UTC) →
`ceo-auditor` → `deal-alert` → `payment-send`. `ceo-auditor` is on no cron of
its own; it only runs when an inbound reply arrives. `outreach_log` holds 5
inbound rows, the most recent dated 2026-05-21.

So the chain has fired exactly once, in May — **before** the Brevo account
started failing around 2026-06-28. No deal-ready alert was generated during the
outage, therefore none was lost. The transport was genuinely dead and the fix
was still required, because the next real deal-ready lead would have hit it. But
the harm I described did not occur.

That is the fourth claim this session stated more confidently than the evidence
supported, after "the tokens are live", "the H-12 fix is complete", and "there is
no CI". The pattern is consistent: reasoning from code to consequence without
checking whether the consequence actually happened.

### A larger question this raised

The B2B pipeline is asymmetric. Outreach sends daily — 292 outbound rows, the
most recent 2026-08-14. The response half has produced 5 inbound rows in total,
none since 2026-05-21, and one audit in the same period.

That is either accurate (nobody is replying) or a capture failure in
`reply-intake` / `reply-intake-poll`. Nothing here distinguishes the two, and the
difference matters: one is a sales problem, the other is a bug quietly discarding
replies to ~292 outreach emails. Worth establishing which, by sending a reply to
one of the outreach addresses and seeing whether a row appears.

---

## S-ADV · Supabase advisor sweep (2026-08-15, post-fix)

Ran the security and performance advisors after this session's DDL (the
`referral_queue` unique index, the `(phone, source)` NOT-EXISTS rewrites, the
function rewrites). **None of this session's changes raised a new advisor.** The
notices below were all pre-existing; recorded here so they are not mistaken for
regressions and so the one that matters gets a decision.

### S-1 · CONFIRMED — unauthenticated read and delete on the guest ledger

The first pass of this section called the `anon` grants "worth a decision" on the
strength of the grant table alone. That was too soft, and it was not verified.
Re-tested end to end against this project's own REST API. It is exploitable.

**Method.** Four requests from `pg_net`, same endpoint each time, varying only the
headers. The key used is `sb_publishable_v2XOo…`, the project's *active
publishable key* — the one shipped in the browser bundle and readable by anyone
who loads the site. (The legacy `anon` JWT is disabled — see S-2 — so the first
attempt returned 401 and had to be redone with the live key. Worth stating,
because "the old key is dead" is exactly the kind of thing that makes an
unverified claim look wrong for the wrong reason.)

| # | Headers | Result |
| --- | --- | --- |
| A | `apikey` only | `200 []` — **zero rows** |
| B | `apikey` + `x-tenant-host: hotelfountainbd.com` | `200` — real `leads` rows, names and phone numbers |
| C | `apikey` + `x-forwarded-host: hotelfountainbd.com` | `200` — real `guest_ledger` rows |
| D | `DELETE /guest_ledger?id=eq.<nil uuid>` + `x-tenant-host` | **`204 No Content` — the delete was authorised** |

Probe D used a filter matching zero rows (verified `0` beforehand, and
`guest_ledger` still holds 917 rows after), so nothing was destroyed. The `204`
is the finding: PostgREST accepted the DELETE. A filter matching real rows would
have removed them.

**Why.** Three things compose:

1. `authenticator` carries `pgrst.db_pre_request=public.lumea_pre_request`, so
   that function runs on *every* PostgREST request including anonymous ones.
2. `lumea_pre_request` reads `x-tenant-host` — or `x-forwarded-host` — from the
   request, resolves it via `resolve_tenant_by_host`, and does
   `set_config('app.current_tenant_id', …)`.
3. `current_tenant_id()` returns that GUC **first**, ahead of the JWT claim and
   the `tenant_users` lookup. The 50 `tenant_isolation` policies are
   `FOR ALL TO public USING (tenant_id = current_tenant_id())` — no requirement
   that the caller is signed in at all.

So the tenant identity is caller-supplied, and nothing else is checked. Request A
proves the default is fail-closed; the header is what opens it.

**This is the app's actual design, not a stray grant.** `src/lib/supabase/client.ts`
sets `x-tenant-host: window.location.host` as a global header on the browser
client, and `usePostCharge` / `usePostPayment` / `useBillingInvoice` /
`useGuestLedger` write to `guest_ledger` and `billing_invoices` straight from the
browser. The CRM authenticates staff with its own `staff` + `session_v` + OTP
scheme, **not** Supabase Auth — so `auth.uid()` is NULL and those hooks genuinely
run as `anon`. The grants are load-bearing.

**Therefore: not fixed, and deliberately not fixed here.** Revoking `anon` DML on
`guest_ledger` / `billing_invoices` would break billing in the live CRM within
minutes. Adding `auth.uid() IS NOT NULL` to the policies would do the same. This
needs a decision between real options:

| Option | Closes it | Breaks |
| --- | --- | --- |
| Move the four billing hooks behind the existing session-authenticated `app/api/crm/*` routes (service_role server-side) | Yes — fully | A refactor of 4 hooks; no user-visible change |
| Adopt Supabase Auth for staff so `auth.uid()` is real, then require it in the policies | Yes | Replaces the custom `staff`/`session_v` login |
| Reorder `current_tenant_id()` to prefer JWT / `tenant_users` and use the header only as fallback | Partially — helps signed-in users, anon path still open | Nothing, but it is not a fix on its own |
| Revoke `anon` DML only | Yes for writes | Billing UI, immediately |

Recommended: the first. It is the smallest change that actually closes it, and it
matches how the rest of the app already works.

### S-1 · FIXED 2026-08-15

Took the recommended option.

**Server route.** `app/api/crm/billing/route.ts` — same shape as
`/api/crm/referrals`: signed session cookie, `session_v` re-check against the DB,
role gate, then service-role queries through `tenantScoped` so every statement
carries the tenant filter structurally. `GET ?view=ledger|invoice|invoice_detail|payments`
and `POST {action: ensure_invoice|charge|payment|void|expand|issue_invoice}` — a
fixed allowlist of actions, no table name ever taken from the client.

Three things the browser no longer decides:

| | before | now |
| --- | --- | --- |
| `tenant_id` | `x-tenant-host`, caller-supplied | the staff session |
| `posted_by` / `processed_by` / `voided_by` / `issued_by` | a `userId` argument from the client | the staff session |
| which reservation | any id the caller names | asserted in-tenant before any RPC runs |

That last one mattered more than expected: `post_extra_charge`,
`void_ledger_entry` and `expand_nightly_charges` all take bare ids and do no
tenant check of their own. Voiding is additionally gated to supervisor roles and
up — something the browser could never enforce for itself.

**Hooks.** All seven now go through `src/hooks/billing/api.ts`
(`credentials: 'same-origin'` is what carries the session cookie). Signatures are
unchanged so no caller had to move; the now-unused `userId` / `issuedBy` /
`tenantId` parameters are renamed with a leading underscore and documented as
ignored.

One deliberate behaviour change: `useGuestLedger` and `useCheckoutBalance` used
Supabase **Realtime** on `guest_ledger` / `billing_invoices`. Realtime enforces
RLS through the browser's publishable key — precisely the access being withdrawn
— so those channels would have gone *quiet without erroring* and the folio would
have looked stale rather than broken. Replaced with a 15s `refetchInterval` plus
refetch-on-focus: less elegant, but it fails visibly.

**Grants revoked**, `supabase/migrations/20260815_revoke_anon_billing_grants_s1.sql`.
`REVOKE ALL … FROM anon, authenticated` on `guest_ledger`, `billing_invoices`,
`invoice_line_items`, `payment_transactions`. `service_role` and `crm_tenant`
keep theirs, so both server paths are untouched.

**Verified by re-running the probes that had succeeded:**

| | before | after |
| --- | --- | --- |
| `GET /guest_ledger` + `x-forwarded-host` | `200` + rows | `401` `42501 permission denied for table guest_ledger` |
| `DELETE /guest_ledger` + `x-tenant-host` | `204 No Content` | `401` `42501 permission denied` |

`guest_ledger` row count unchanged at 917 throughout.

**What is NOT verified:** the CRM billing UI itself. There is no way to exercise
it from here. Two things say the risk is low — `BillingCard.jsx` imports only
`useCheckout`, so none of the seven refactored hooks is wired into a component;
and no `guest_ledger` row since 2026-06-01 has `posted_by` set (every one carries
`metadata.dual_write_from: "folios"`, i.e. the trigger, not a hook). Treat that as
evidence, not proof, and click through the folio screen after deploying.

Also note the local `tsc -p tsconfig.json` is **not** a usable gate on this
machine: a clean tree already reports 2,965 errors from an incomplete
`node_modules` install. Every changed file was parse-checked individually; CI's
Typecheck step is the real gate.

### S-1b · FIXED 2026-08-15 — `leads` and `corporate_leads`

The first write-up of this assumed `src/services/supabase.ts` was browser code
serving a public lead-capture form, and concluded the `anon` INSERT was
"defensible". Checking the callers showed otherwise: its **only** importers are
`app/api/orchestrate/route.ts` and `app/api/hardware-check/route.ts` — both
server routes. There is no public form. The module was simply reaching
tenant-isolated tables as the browser role for no reason.

Switched it to the service role via `tenantClient` / `tenantScoped`, behind a
`typeof window !== 'undefined'` guard so it can never be pulled into a client
bundle, then revoked the grants
(`supabase/migrations/20260815_revoke_anon_leads_grants_s1b.sql`).

| | before | after |
| --- | --- | --- |
| `GET /leads?select=id,name,phone` + `x-tenant-host` | `200` + real names and phone numbers | `401` `42501 permission denied for table leads` |

`leads` row count unchanged at 2,229.

Two things fell out of this that are worth keeping:

**`insertLead()` was almost certainly already broken.** The `tenant_isolation`
policy on `leads` has a **NULL `with_check`**, so Postgres applies the `USING`
expression to INSERTs too: `tenant_id = current_tenant_id()`. A server-side call
sends no `x-tenant-host`, so `current_tenant_id()` was NULL and the check could
never pass. Routing the write through `tenantScoped` — which stamps `tenant_id`
after spreading the caller's values — repairs that path as a side effect. It also
prevents the opposite failure: `service_role` bypasses RLS, so without the stamp
this change would have started writing leads with a NULL `tenant_id`, which is
the orphan-row class D-1 was about.

**Two tables that look alarming in the grant table are actually fail-closed.**
`tenants` and `authorized_devices` both still grant `anon` full DML, which reads
badly for a tenant registry and a device-authorisation table. Neither is
reachable: `tenants` has explicit `false` policies for INSERT/UPDATE/DELETE and a
SELECT policy requiring `uid() IS NOT NULL` (nobody signs in to Supabase Auth
here), and `authorized_devices` has a single policy scoped `TO service_role`. The
grants are noise worth cleaning, not holes. Recorded so the next reader does not
raise them as findings — as this audit nearly did.

### Still open after S-1 / S-1b

21 components import the browser client (`@/lib/supabase/client`) and still run as
`anon` with the header-derived tenant. What they can actually reach is now small:
`rooms` (SELECT) and `folios` (SELECT). `guests`, `reservations`, `transactions`,
`payment_transactions` and `staff` already had no anon DML before this audit
started. Closing the remaining two means the same treatment — move the reads
behind `/api/crm/*` — but they are inventory and folio *reads*, not financial
writes, so the urgency is different. Recorded, not fixed.

### Why S-1 mattered even though the CRM is IP-gated

Worth recording, because at first glance the two facts look contradictory.

`middleware.ts` puts an **office-IP perimeter** in front of `/crm` and
`/api/crm/*` — per-tenant `office_ips` / `remote_roles`, with only
`/api/crm/login` and `/api/crm/session` exempt so the handshake works off-site.
An unauthenticated request from outside the hotel network gets
`403 {"error":"Access restricted to the hotel network."}`. That was confirmed live
against `fountainbd.com` while checking this deploy.

That perimeter is real, and the new `/api/crm/billing` route inherits it. But it
never protected the path S-1 exploited, because **the browser was not talking to
the app** — it was talking to `mynwfkgksqqwlqowlscj.supabase.co` directly. A
different origin, no Next.js middleware in front of it, reachable from anywhere.
The IP gate guarded the front door while the billing hooks were going through a
side door on a different building.

Moving billing to `/api/crm/billing` is therefore not just an authentication fix.
It puts financial reads and writes behind the IP perimeter *and* the session
check, where the rest of the CRM already lived.
