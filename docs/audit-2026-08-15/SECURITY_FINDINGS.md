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
