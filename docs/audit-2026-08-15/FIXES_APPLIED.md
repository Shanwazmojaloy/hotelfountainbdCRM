# Critical fixes — applied 2026-08-15

Companion to `CODE_REVIEW.md`. Every DB claim was re-verified against production before a fix was written; see `DRIFT_REPORT.md` for what that verification changed.

---

## Status of the eight criticals

| # | Finding | Status | Where |
|---|---|---|---|
| C-1 | anon-granted RPCs + non-invoker `leads_pipeline` | ✅ **already fixed in prod**; repo reconciled, anon grants revoked | `20260815_audit_reconcile_repo_to_prod.sql` |
| C-2 | `transactions` FK `SET NULL` | ✅ **already CASCADE in prod**, 0 orphans; repo reconciled | same |
| C-3 | `/billing` re-attaches orphans by room + date | ✅ **fixed** — fallback deleted, orphans surfaced | `app/billing/page.jsx` |
| C-4 | `night_audit_log` policy without a grant | ✅ **fixed** — real bug, grant applied + error handling | migration + `close-day/route.ts` |
| C-5 | migration drift | ✅ **reconciled** (baseline still outstanding) | `DRIFT_REPORT.md` |
| C-6 | `ADMIN_SECRET` emailed in a URL; GET with side effects | ✅ **fixed** — single-use nonce + POST-to-activate | `deal-alert`, `payment-confirm`, migration |
| C-7 | `booking-webhook` fails open | ✅ **fixed** — fails closed, timing-safe compare | `supabase/functions/booking-webhook/index.ts` |
| C-8 | four writers into `reservations`, three availability models | ⛔ **not done** — multi-day architectural change, see ADR-P2 | — |

Two highs were fixed alongside, because they live inside the exact code being changed:

| # | Finding | Status |
|---|---|---|
| H-5 | zeroed `discount_amount` falls back to the stale legacy column | ✅ fixed in `src/lib/dues.js` |
| H-7 | `/billing` counts charges as collections | ✅ fixed via the canonical predicate |

---

## Database changes (applied to production)

Three migrations, all verified before and after.

**1 · `fix_night_audit_log_crm_tenant_grant_and_tenant_not_null`**
The only genuinely broken thing the audit found. `nal_tenant_update` existed as a policy; the table GRANT behind it did not, so every close-day drawer write failed `42501` silently.

*Pre-flight:* 62 rows, 0 NULL `tenant_id`, 1 tenant.
*Post-flight:* 62 rows writable as `crm_tenant`; `lumeademo` sees 0 Hotel Fountain rows.

**2 · `add_activation_tokens_single_use_nonce`**
New service-role-only table + `consume_activation_token()` / `peek_activation_token()`. Backs the C-6 rewrite.

**3 · `audit_reconcile_repo_to_prod`**
Idempotent; a no-op against prod, reproduces the hardening on a fresh database. Also adds `ALTER DEFAULT PRIVILEGES` so the snapshot-grant problem stops recurring, and ends with a conformance assertion that **raises** if any tenant-scoped table lacks RLS, a policy, or a `crm_tenant` grant.

*Verified after:* security advisor shows **no ERROR-level lints**. The remaining `0028`/`0029` WARNs are only the five host→tenant routing functions — intentional, and documented as must-not-fix. The 12 lead-pipeline RPCs have dropped off that list, which is the signal the revoke landed.

---

## Code changes

### `src/lib/dues.js` — canonical money predicates

`REAL_PAY` / `notBCF` had been copy-pasted into four files, and the 2026-08-08 correction reached three of them. Now exported once:

```js
export const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;
export const isRealPayment = (t) => { ... };   // positive match + [VOID-DUP] + BCF guards
export const discountOf   = (r) => (r?.discount_amount != null ? (+r.discount_amount || 0) : (+r?.discount || 0));
export const txDay        = (t) => (t?.fiscal_day || t?.created_at || '').slice(0, 10);
export const collectedBetween = (txs, from, to) => ...;
```

**On H-5 and blast radius.** `discountOf` uses NULL-semantics instead of falsy-`||`, matching the SQL side's `COALESCE(discount_amount, discount, 0)`. Production was checked before the change:

- **495** reservations have `discount_amount IS NULL` with a legacy `discount` (৳506,519 total) → these still fall through. **Unchanged.**
- **0** reservations are in the `discount_amount = 0` state that triggers the bug.

So the change is behaviour-preserving on all 1,732 existing rows and only prevents the bug going forward. The legacy column is **not** backfilled — 5 protected reverse rows depend on it.

Asserted before commit:

```
discountOf({discount_amount: null, discount: 3000}) === 3000   // the 495 rows, unchanged
discountOf({discount_amount: 0,    discount: 3000}) === 0      // H-5 fixed
dueOf({total: 20000, da: 0, d: 3000, paid: 17000})  === 3000   // was 0 — front desk could not collect
collectedBetween([...2026-08-07 rows...])           === 41500  // was 63000
```

### `app/billing/page.jsx` — C-3, H-7

Removed the room-number + date-overlap fallback entirely. Transactions attach by `reservation_id` or not at all; unattributable rows go into an `orphans` bucket rendered as a warning banner above the ledger, listing date, room, type and amount, and excluded from every figure.

The collections filter now uses `isRealPayment()`. The old exclusion-only filter reported **৳63,000** for 2026-08-07 against **৳41,500** actually collected, because five `Stay Extension (+1 night)` charges passed it. The payment-method split at the bottom of the page had the same defect and is fixed too.

### `app/api/crm/close-day/route.ts` — C-4, M-1

- The `night_audit_log` read no longer fails silently. It used to leave `closes` undefined, and `openBusinessDay(undefined)` falls back to **today** rather than last-closed + 1 — so a backlogged close silently targeted the wrong date. Now returns 503 and closes nothing.
- The drawer write's return value is checked. On failure the day still closes (the RPC already committed) but the response is **207** with an explicit warning, instead of a green `{ok:true}`.
- Absent drawer fields no longer mean zero. A re-close that doesn't resend `opening_token` / `payouts` used to overwrite the stored values with `0`, destroying the Closing Balance that the 20260625 migration exists to preserve.

### `app/api/agents/deal-alert/route.ts` + `payment-confirm/route.ts` — C-6

`ADMIN_SECRET` no longer appears in any URL or email. `deal-alert` mints a single-use 14-day nonce holding the payload server-side; the email carries only an opaque uuid.

`payment-confirm` is split:

- **GET** peeks the nonce and renders a confirmation screen. **No side effects** — prefetching it does nothing.
- **POST** consumes the nonce atomically (`UPDATE ... WHERE used_at IS NULL RETURNING`) and then activates. A double-submit or replay gets `NULL` and cannot activate twice.

The payload no longer travels in the URL, so it can't be edited in the address bar between the email and the click. `ADMIN_SECRET` survives only as a server-to-server `Authorization` header on the internal `/api/admin/onboard-tenant` call.

### `supabase/functions/booking-webhook/index.ts` — C-7

`if (secret) { verify }` → `if (!secret) return 503` plus a constant-time comparison. Previously an unset `WEBHOOK_SECRET` skipped verification entirely, leaving only platform `verify_jwt` — which accepts the anon key, and that key is hardcoded in this repo.

---

## Verification performed

| Check | Result |
|---|---|
| `esbuild` parse of every edited file | ✅ 6/6 |
| `dues.js` behaviour assertions (incl. the 2026-08-07 incident) | ✅ all pass |
| `timingSafeEqualStr` equality/length/empty cases | ✅ 6/6 |
| `crm_tenant` can read all 10 core tables | ✅ rooms 28, guests 1821, reservations 1731, transactions 1552, night_audit_log 62 |
| Cross-tenant isolation after policy recreation | ✅ `lumeademo` sees 0 Hotel Fountain rows |
| `crm_tenant` can write `night_audit_log` | ✅ 62 rows |
| Supabase security advisor | ✅ no ERROR lints; only the 5 intentional routing-function WARNs |
| NUL bytes / md5 parity on every committed file | ✅ |

**Not verified:** no build, no typecheck, no runtime test — the repo's `node_modules` is a pnpm store that does not resolve through the device bridge. Run `npm run typecheck && npm test` Windows-side before pushing.

> **RETRACTED 2026-08-15 — "and there is no CI" was false.** `.github/workflows/ci.yml`
> already ran guard + typecheck + test + lint + build on every push, and
> `.github/workflows/e2e.yml` held a Playwright suite behind `workflow_dispatch`. The
> claim came from judging the repo off an incompletely staged file set — the same
> mistake that produced H-25. Two guards have since been *added* to the existing
> workflow; it was never absent. Recommendations 5 below and the matching items in
> CODE_REVIEW.md and ARCHITECTURE.md inherit the same error.

---

## Next

1. `git add` + commit + push (commands in the session summary) — **nothing is deployed until you do**.
2. Set `WEBHOOK_SECRET` in Supabase Edge Function secrets. Until it is set, `booking-webhook` now returns **503** by design — that is the correct fail-closed state, but it does mean the endpoint is off until configured.
3. Rotate `ADMIN_SECRET`. Every copy previously emailed is still valid.
4. Remaining highs, in order: H-2 (`sync_paid_amount`), H-3/H-4 (`paid_amount` read-modify-write), H-6 (`checked_in_at`), H-16 (five indexes), H-1 (server-side capability gates).
5. ~~Add `.github/workflows/ci.yml`~~ — it already existed (see the retraction above). **Done instead:** two guards added to it, `check-edge-mail-invariants.mjs` and `check-edge-deploy-manifest.mjs`. Still genuinely missing: the ADR-P3 conformance query from the reconciliation migration as a CI step.

---

## Session 2 addendum — 2026-08-15, after the follow-up remediation pass

Everything in the "Next" list above except items 4 and 5 has now been done, plus
three findings that only surfaced by exercising the code against production.

### Completed

| Item | State |
|---|---|
| Commit + push the audit fixes | ✅ `3ccd51d`, `4b70246`, `a4310c2`, `70dbdc0`, `2893ce1` |
| `WEBHOOK_SECRET` set in Supabase Edge Function secrets | ✅ `booking-webhook` no longer 503s |
| `ADMIN_SECRET` rotated | ✅ old value invalid; it is no longer placed in any URL or email (see `deal-alert`) |
| H-8 — CEO auditor trusted an unvalidated LLM `score` | ✅ non-finite / out-of-range scores fall back to `runHeuristicAudit` |
| H-8/M-16 — `payment-send` could double-send | ✅ claims via the `claim_payment_send` RPC; zero rows claimed ⇒ `{ok:true, skipped:true}` and no send |
| M-14 — `follow-up-bot` regressed status to `pending` on send failure | ✅ writes `contacted` unconditionally; adds RFC 8058 `List-Unsubscribe` |
| H-12 — report mail went to a dead Brevo account | ✅ all six functions on the shared Resend mailer, deployed and verified by live invoke |
| Vercel Cron Jobs | ✅ re-enabled 2026-08-15 after the above; all 13 jobs live |

### Three things only a live invoke would have caught

**1. A successful deploy is not a successful send.** All five report functions
deployed cleanly on the new Resend mailer. Invoking `wf-morning-briefing` once
returned:

> The gmail.com domain is not verified. Please, add and verify your domain on
> https://resend.com/domains

`hotellfountainbd@gmail.com` had been the `from` address for every report. Had
the deploy been trusted, the H-12 fix would have replaced one silent failure
with another. Sender is now `CRM_FROM_EMAIL ?? reservations@fountainbd.com`.
All six re-invoked; `workflow_runs.summary->>'email_sent' = true` for each.

**2. Two functions still lied about the outcome.** `wf-competitor-monitor`
wrote `status = 'success'` unconditionally and `wf-backup-verify` keyed it on
"rows exist" — so the CRM Settings health dot could stay green while the report
reached nobody. Both now require `email.ok`. This is the same defect class as
H-12 itself, surviving inside the H-12 fix.

**3. The fix reopened the drift it was diagnosing.** The corrected sender was
deployed to Supabase before it was written back to the repo, so for roughly
twenty minutes prod and `main` disagreed again. Closed by `2893ce1`. The lesson
generalises: *deploy and commit are one operation, not two.*

### Deployed versions, verified sending

| Function | Version |
|---|---|
| `wf-morning-briefing` | 34 |
| `wf-evening-report` | 35 |
| `wf-period-reports` | 36 |
| `wf-backup-verify` | 34 |
| `wf-competitor-monitor` | 34 |

`supabase/functions/weekly-report/` is **not deployed to this project** —
confirmed against the live function list. It is dead code and still carries the
old gmail sender. Delete it or deploy it; leaving it is how the next audit
produces another false positive.

### Still open

Unchanged from the list above: H-2 (`sync_paid_amount`), H-3/H-4 (`paid_amount`
read-modify-write), H-6 (`checked_in_at`), H-16 (five indexes), H-1 (server-side
capability gates).

The "add CI" item is struck: CI existed all along and the audit was wrong to
say otherwise. What was genuinely missing — a mechanical check that a deployed
edge function matches the committed one — now exists as
`supabase/functions/DEPLOYED.json` plus `scripts/check-edge-deploy-manifest.mjs`,
wired into both the pre-commit hook and the existing workflow. It catches an
edit that was never redeployed. It cannot catch a deploy that was never
committed; nothing local can, which is why the manifest names the 23 deployed
functions that have no source in this repo at all.

---

## D-2 backfill · `ceo_pipeline.deal_value_bdt`

The D-2 fix corrected the expression going forward; it did not touch rows the
broken expression had already written. 10 of 238 `ceo_pipeline` rows still held
`0` or `1` instead of a taka amount.

All 10 were recomputed from the source lead's `notes`, using the same two-branch
parse the function now uses. Every one resolved to a real amount — none fell
through to NULL:

| guest | value written |
| --- | --- |
| MONOJIR TANIA | ৳17,500 |
| SANO FUMIYOSHI | ৳22,500 |
| ARULNAYAGAN YASOTHAR ×2 | ৳52,000 |
| V. DINESH KUMAR SIR ×2 | ৳18,000 |
| TOMAS GUSTAVO VEGA PACHECO ×2 | ৳130,500 |
| MD HAFIZUR RAHMAN ×2 | ৳27,000 |

Post-check: `238` rows total, `0` still in `(0,1)`, `0` NULL, min `17,500`,
max `6,380,000`. The `UPDATE` was guarded on `deal_value_bdt IN (0,1) AND
parsed IS NOT NULL`, so no row outside those 10 was touched — `rows_updated`
came back exactly `10`.

The `×2` rows are not a backfill artefact. They are duplicate leads for the same
guest, created by two cron jobs that both detect corporate spend on the same
schedule. See **D-9** in `DB_AGENT_FINDINGS.md`; the duplication itself is still
open and needs a decision on which job to drop.
