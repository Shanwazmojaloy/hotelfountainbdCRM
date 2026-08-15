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
