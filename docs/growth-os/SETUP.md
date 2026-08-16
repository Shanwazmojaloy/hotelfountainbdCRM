# Hotel Growth OS — what is done, and what only you can do

Built 2026-08-16. Everything below marked ✅ is live already. Everything marked ⬜ needs a credential or a click you have and I do not.

---

## ✅ Done — the sales database

**Project:** `nqeaehcrcpakgoaawxyk` (the existing "Architecture" Supabase project, `ap-northeast-1`) — deliberately **not** the hotel project `mynwfkgksqqwlqowlscj`. Guest PII and our commercial pipeline never share a connection string.

| Migration | Contents |
|---|---|
| `growth_os_01_core_tables` | `prospects`, `prospect_contacts`, `activities`, `deals`, `sequences`, `sequence_steps`, `sequence_enrollments`, `email_events` + indexes |
| `growth_os_02_triggers_views_rls` | status/last-contact triggers, reply auto-stop, deal→prospect sync, 3 reporting views, RLS lockdown |

**Security posture:** RLS is on with **zero policies** and `anon`/`authenticated` have **no grants at all** on any table. That is deliberate — per your own audit note, a `tenant_isolation` policy evaluates TRUE for `anon` on this stack, so the missing GRANT is the defence, not the policy. Only `service_role` (server-side) can read or write.

**Seeded:** 216 researched prospects.

| | Count |
|---|---|
| Total prospects | 216 |
| With a phone or WhatsApp number | 209 |
| With a published email | 59 |
| With a website | 106 |
| Cities | 9 |

Dhaka 58 · Cox's Bazar 58 · Sylhet 27 · Chittagong 18 · Bandarban 16 · Rangamati 16 · Srimangal 15 · Moulvibazar 5 · Sunamganj 3.

A call plan is already assigned: **20 prospects per working day (Sun–Thu), highest ICP score first, starting Monday 17 August**, running to 31 August. Owner and manager names are blank on almost every row — those are not scrapeable in Bangladesh and come from your first call.

---

## ✅ Done — the CRM module

Committed to `main` as **`694d4d9`** in `F:\Hotel Fountain\Hotel Fountain Web CRM`.

| File | Purpose |
|---|---|
| `src/lib/growthDb.ts` | server-only client for the sales project + shared status vocabulary |
| `app/api/growth/route.ts` | owner/admin-gated read/write API, `session_v` re-checked |
| `src/components/Growth.jsx` | KPI header, follow-up queue, pipeline board, prospect drawer |
| `app/crm/growth/page.tsx` | the route |
| `Header.jsx` / `BottomNav.jsx` | Growth tab, RBAC-filtered like every other tab |

Verified: TypeScript strict typecheck passes (run in a clean container against the same tsconfig — the repo's own pnpm tree cannot resolve `next`/`react` types through the device bridge, and ESLint cannot run there at all, so neither was runnable in place).

**Performance contract, written into the file header:** no timers, no polling, no COUNT-on-mount. Fluid Active CPU is the binding constraint on this Vercel project and ungated client polls are what burned it before. Every fetch is a user action or an explicit Refresh.

---

## ⬜ You must do — 1. Two environment variables

Without these the Growth tab returns a clean `503` and nothing else in the CRM is affected. It will not break anything by being missing.

1. Supabase → project `nqeaehcrcpakgoaawxyk` → Settings → API → copy the **`service_role`** secret.
2. Vercel → the CRM project → Settings → Environment Variables → add to **Production, Preview and Development**:

```
GROWTH_SUPABASE_URL         = https://nqeaehcrcpakgoaawxyk.supabase.co
GROWTH_SUPABASE_SERVICE_KEY = <the service_role secret>
```

> Vercel's env-var search box matches a **prefix, not a substring** — search `GROWTH`, not `SUPABASE`, or you will think you did not add them.

3. Redeploy.

## ⬜ You must do — 2. Push the commit

`git push` cannot run from this session (the device VM has no network). From Windows, in the repo:

```powershell
git push origin main
```

Read `git log --oneline -3` first — other sessions commit into this repo concurrently.

## ⬜ You must do — 3. Verify `go.fountainbd.com` in Resend

Full record set, warm-up schedule and the live audit of your current DNS are in **`dns-and-warmup.md`**. Short version: your DNS is on Cloudflare, your root SPF already carries three includes (adding a fourth risks the 10-lookup hard fail), and `go.fountainbd.com` already resolves via a wildcard — check the existing records before adding.

**Do not send a single sequence email until SPF, DKIM and DMARC all show PASS in a Gmail "Show original".**

## ⬜ You must do — 4. Import the three n8n workflows

Files in `n8n/`. Import in order. Each needs credentials you create once:

| Credential name in the JSON | Type | What to put in it |
|---|---|---|
| `Growth OS Postgres` | Postgres | Supabase → project → Settings → Database → **Connection string (Session pooler)**. Host `aws-…ap-northeast-1.pooler.supabase.com`, port 5432, db `postgres`, SSL on. |
| Resend API | Resend | Your Resend API key |
| `Growth OS webhook secret` | Header Auth | A random string you invent. Set the **same** value as a header on the Resend webhook. |

Then in Resend → Webhooks → add endpoint `https://<your-n8n>/webhook/growth-email-events`, subscribe to `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, and add the auth header.

**Start `01-enroll-prospects` with `dailyCap = 5`,** not 20. The warm-up table in `dns-and-warmup.md` is the schedule.

---

## What the three workflows do

```
01-enroll     daily 09:00 Dhaka (Sun-Thu)
                → picks top-scored prospects that have an email and are not enrolled
                → creates an active enrollment due now

02-send       10:00 and 13:00 Dhaka (Sun-Thu)
                → one query resolves enrollment + prospect + next step template
                → renders merge fields (drops any row that would show a placeholder)
                → sends plain text via Resend, one at a time
                → logs the activity, records the message id, advances the enrollment
                → a failed send PAUSES that enrollment instead of retrying forever

03-webhook    Resend events
                → delivered / opened / clicked recorded against the prospect
                → bounced / complained STOPS the sequence and sets do_not_contact
```

A reply never needs a workflow: logging an inbound touch in `/crm/growth` fires a database trigger that flips the prospect to `replied` and stops every active enrollment.

---

## The honest limitations

- **216 prospects, not 300.** Bangladeshi hotels do not publish owner names or room counts, and inventing them would have been worse than leaving them blank. 209 have a reachable number; that is the number that matters for week one, because your first channel is the phone, not email.
- **59 usable email addresses.** The cold email machine will run out of fuel in about three weeks at 20/day. Enriching emails from your calls is what refills it — that is a real task, not an afterthought.
- **One phone number was ambiguous** (a directory listed the same number for Hill Palace Resort in Bandarban and Hotel Sea Alif in Cox's Bazar). It is blanked on the Bandarban row with a note rather than guessed.
- **Landline-only Dhaka rows** came from a business directory and may predate Bangladesh's landline renumbering. Treat `+8802…` numbers as lower confidence than mobiles.
- **ESLint was not runnable** against the repo through the device bridge. The component mirrors `Referrals.jsx` closely and typechecks clean, but the first Vercel build is the real lint gate.
- **`vw_weekly_kpis` counts activities, not outcomes.** It will happily tell you that you made 50 calls. It cannot tell you whether they were any good.

---

## Where to start on Monday

Open `/crm/growth`. The **Today** tab has 20 hotels waiting, highest fit first. Call them. Log each one with a single tap.

Do not touch the email sequence for the first week. The phone will teach you what the emails should say.
