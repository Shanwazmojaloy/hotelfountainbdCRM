# Lumea CRM — System Design Assessment

**Date:** 2026-08-15
**Repo:** `F:\Hotel Fountain\Hotel Fountain Web CRM`
**Method:** `/engineering:system-design` — requirements, component boundaries, data model, scale, failure modes, trade-offs.

---

## 1. Requirements, as the system actually reveals them

### Functional

| Domain | Capability | Where it lives |
|---|---|---|
| Front desk | Reservations CRUD, check-in/out, room matrix, housekeeping | `app/api/crm/{reservation,check,room}`, `src/components/{Reservations,Rooms,Housekeeping}.jsx` |
| Billing | Folios, charges, payments, discounts, invoices, guest ledger | `src/hooks/billing/**`, `app/api/crm/{payment,folio}` |
| Night audit | Fiscal-day close, drawer reconciliation, carried-over dues | `execute_nightly_audit`, `src/workflows/close-day-chain.ts` |
| F&B | POS orders, charge-to-room, register shifts, comps/discounts | `fn_pos_create_order`, `src/components/Restaurant.jsx` (51KB) |
| Distribution | Channel manager (Channex) inbound + availability push | `src/lib/channel/**` |
| Marketing site | SEO pages (EN + BN), booking widget, Meta CAPI attribution | `app/(site)/**`, `src/lib/capi.ts` |
| Automation | Lead gen, outreach, reply intake, owner reports | `app/api/agents/**`, `supabase/functions/wf-*` |
| Platform | Tenant onboarding, audit log, AI budget, feature flags | `app/api/admin/**`, `src/lib/{aiBudget,featureFlags}.ts` |

### Non-functional — inferred from the code and its history

| Requirement | Evidence | Met? |
|---|---|---|
| Currency BDT (৳), Bangladesh VAT | `restaurant_menu_items.vat`, `money.ts` | ✅ |
| Business day anchored to Asia/Dhaka (UTC+6) | `businessDay.ts` uses `Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dhaka'})` throughout | ⚠️ app layer yes; `execute_nightly_audit` uses UTC |
| Front-desk latency tolerable on modest hardware | 8s `AbortSignal.timeout` → 504; July slowness incident | ⚠️ no tenant-leading indexes on the hot tables |
| Multi-tenant isolation | `crm_tenant` + RLS, `tenantScoped()` | ⚠️ holes via `anon` grants and non-invoker view |
| Financial auditability | `audit_logs`, `night_audit_log`, `changeNotify` | ⚠️ delete path orphans the trail; alert mail is dead |
| Scale | 24 rooms, ~1.8k guests, single property live, platform aspires to N | ✅ for one, ⚠️ for N |

### Constraints

- **Team of one.** Every operational burden compounds; anything requiring manual repetition will eventually be skipped (and has been — see the grant history).
- **Vercel Hobby-class CPU.** Cron cadence was already reduced for CPU relief before the schedules were removed entirely.
- **`iad1` region, Dhaka users.** ~250ms RTT baseline. This is why serial round-trips hurt disproportionately and why N+1 patterns are a latency problem, not just a throughput one.
- **Two hard rules from incident history:** no blanket bot challenges (broke staff twice); `/crm` stays a static shell.

---

## 2. Component boundaries

### Where the boundaries are clean

| Boundary | Contract | Assessment |
|---|---|---|
| `tenantScoped()` | Every read gets `.eq('tenant_id')`; every write gets `tenant_id` stamped after spreading caller values | ✅ The single best abstraction in the codebase. Correct by construction and hard to misuse. |
| `CMAdapter` interface | `resolveWebhook`, `verifyWebhook`, `pushAvailability` per provider | ✅ Right shape for adding a second channel manager. Fail-closed verification documented as part of the contract. |
| `fn_pos_create_order` | Header + items + folio in one RPC, totals recomputed server-side | ✅ Textbook. The client's figures are discarded. |
| `requireSession` / `sessionCookieHeader` | HMAC-signed cookie, timing-safe verify, throws on missing secret | ✅ |

### Where the boundaries leak

| Leak | Symptom |
|---|---|
| **`reservations` has four writers** | Three availability models, no shared truth → overbooking is a design property, not a bug |
| **Authorisation split across client and server** | 7 capabilities from `permissions.js` are enforced **only** in React; the routes authenticate and stop |
| **Two day-close implementations** | `Reports.jsx` → `/api/crm/close-day` → `execute_nightly_audit` (correct) vs `NightAuditPanel.tsx` (no payment-type filter, raw anon POST) |
| **Two billing screens** | `src/components/Billing.jsx` uses the positive `REAL_PAY` match; `app/billing/page.jsx` uses the blacklisted exclusion-only filter and re-attaches orphans |
| **Money predicates duplicated four times** | `REAL_PAY`/`notBCF` copy-pasted into `Reports.jsx`, `Dashboard.jsx`, `Billing.jsx`, `app/billing/page.jsx` — one was fixed on 2026-08-08, one was not |
| **Mail sending duplicated** | `src/lib/mailer.ts` (Resend) exists and works; 7 call sites still hand-roll `fetch('https://api.brevo.com/...')` against a dead account and log `success` |

**Pattern.** Every leak is the same shape: *a second implementation of something that already had a correct one.* The fix is consistently "delete the duplicate and import the canonical one," not "write something new."

---

## 3. Data model

### Core entities

```
tenants ──┬──▶ staff            (session_v, otp_hash, role)
          ├──▶ rooms            ⚠ no UNIQUE (tenant_id, room_number)
          ├──▶ guests           ⚠ no index on tenant_id
          └──▶ reservations ─┬─▶ transactions   ⚠ FK = ON DELETE SET NULL
                             ├─▶ folios          ✅ CASCADE
                             └─▶ restaurant_orders ✅ CASCADE + CHECK room⇒res
                                       └─▶ restaurant_order_items ✅ CASCADE

night_audit_log   (tenant_id, audit_date) UNIQUE  ⚠ tenant_id nullable, no grant
inventory_ledger  (stay_date, total_units, booked_units)  ← only the OTA path maintains this
audit_logs        ✅ correctly indexed and locked down
corporate_leads ──▶ outreach_log   ⚠ outreach_log has no tenant_isolation policy
```

### Model-level observations

| # | Observation | Consequence |
|---|---|---|
| 1 | `reservations` is the aggregate root and everything hangs off it correctly — **except `transactions`**, the one relationship where money lives | The single weakest FK is the one that matters most |
| 2 | `rooms.room_number` is used as a natural key by five routes but has no unique constraint | Two rooms `405` → `rateOf()` picks either → wrong nightly rate; status flips hit both rows |
| 3 | `discount` and `discount_amount` coexist; only the latter is ever written | JS `\|\|` falsy-fallback vs SQL `COALESCE` NULL-semantics disagree → the front desk cannot collect a revoked discount |
| 4 | `fiscal_day` is `text` with no format CHECK, compared as a string in the audit RPC | One malformed write silently drops that money from the daily close |
| 5 | `inventory_ledger` is maintained by exactly one of four booking writers | It is the OTA push's only availability source — see §5 |
| 6 | Two tables have no `tenant_id` at all (`reservation_requests`, `notifications`) and accept anon writes | Multi-tenancy breaks the day tenant #2 onboards |
| 7 | No genuine float money columns anywhere | ✅ Good. Issues are `integer` vs `numeric(14,2)` precision drift, not float error |

### Indexing vs access patterns

| Hot query | Route | Index today | Needed |
|---|---|---|---|
| `transactions` by `(tenant_id, fiscal_day)` sorted `created_at DESC` | `data:127` | `(reservation_id)` only | `(tenant_id, fiscal_day, created_at DESC)` |
| `reservations` by `(tenant_id, status)` sorted `created_at DESC` | `data:130` | `(status)` — not tenant-leading | `(tenant_id, status, created_at DESC)` |
| `reservations` overlap `check_in < X AND check_out > Y` | `reservation:289` | none | `(tenant_id, check_in, check_out) WHERE status IN (…)` |
| `guests` name/phone ILIKE, **per keystroke** | `data:138` | `(phone)` only | `(tenant_id, name)` + `gin_trgm_ops` |

All four sit behind an 8s timeout that returns **504**, so index absence surfaces as a front-desk outage, not as slowness. The tenant-leading pattern was applied to every table added after ~June and never backfilled onto the four originals.

---

## 4. API design

### Surface

| Prefix | Auth | DB role | Count |
|---|---|---|---|
| `/api/crm/*` | signed session cookie + `session_v` | `crm_tenant` (RLS on) | 20 |
| `/api/agents/*` | `CRON_SECRET` bearer | `service_role` (RLS off) | 23 |
| `/api/admin/*` | `ADMIN_SECRET` bearer | `service_role` | 2 |
| `/api/{book,vitals,client-error,invoice/[id]}` | none | `service_role` | 4 |
| `/api/council/*`, `/api/ai/assist` | POST: session · **GET: none** | `service_role` | 2 |

### Design observations

**The resource gateway is the right pattern.** `/api/crm/data` funnels reads through one handler with a resource whitelist, per-resource sortable columns, a `MAX_LIMIT` ceiling, `?cols=` trimming and sanitised search. It is the best-designed route in the codebase — and the sanitisation it does is precisely what the injection findings elsewhere are missing.

**But it authenticates without authorising.** One session check, no capability check, and every resource behind it. `housekeeping` can read the full guest table and the full ledger. The role matrix exists (`permissions.js`) and is applied only in React.

**Idempotency is inconsistent across the four money-writing endpoints:**

| Endpoint | Client key | Server honours it? | Result |
|---|---|---|---|
| `/api/crm/payment` | `useRef` (stable) | ✅ 23505 → success | ⚠️ but returns blind without reconciling `paid_amount` |
| `/api/crm/restaurant` | `uuid()` **per attempt** | ✅ | ❌ key differs on retry → duplicate charge |
| `/api/crm/reservation` create | sent | ❌ **never read** | ❌ retry duplicates booking + advance payment |
| `/api/crm/folio` create | none | n/a | ❌ retry double-charges |

One correct implementation exists (`RecordPaymentModal` + `payment/route.ts`). It should be the template for all four.

**Error contracts are uneven.** `/api/crm/data` returns a structured retryable 504; `/api/council/deliberate` returns `detail: String(e)` with the raw PostgREST error (view name, columns, hint); several agent routes return `{ok:true}` regardless of what happened.

---

## 5. Scale and reliability

### Load reality

| Metric | Today | Where it breaks |
|---|---|---|
| Rooms | 24 | — |
| Guests | ~1.8k | Autocomplete: no `(tenant_id, name)` index, no debounce, one request per keystroke |
| Transactions | growing unbounded | `?resource=transactions` has **no date bound** — `/billing` and `Reports` pull the whole table |
| Concurrent staff | ~3-5 | Payment races (H-2, H-4) need only two people |
| Tenants | 1 live | Isolation holes are latent at 1, live at 2 |

### The scale problems that are real at today's size

1. **`?resource=transactions` with no date filter.** Two screens fetch every transaction ever written, then filter in JavaScript. This grows monotonically and is already the largest payload the CRM ships.
2. **`Reports.Daily` is 521 lines recomputing the full movements + dues pipeline on every render** — including every keystroke in the cash-drawer inputs during night audit, when staff are typing under time pressure. The file's own comment names the pathology; the `useMemo` fix was applied to two helpers and not to the block that matters.
3. **N+1 loops on user-facing paths.** Multi-room reservation create is 3N sequential writes with no transaction. Room-status updates loop where one `.in()` would do. At ~250ms Dhaka RTT these are perceptible.
4. **`weekly-retention` is quadratically doomed.** ~1,800 guests × 3 serial round-trips = 5,401 trips against `maxDuration = 60`. It times out roughly a third of the way through, having already stamped `last_contacted` on everyone it processed — so those guests are excluded for 30 days with no draft anywhere. `churn-score` in the same directory has the correct pattern (bounded worker pool + `DEADLINE_MS`); it was simply never applied here.

### Failure-mode analysis

| Failure | Detected? | Degrades to | Recovery |
|---|---|---|---|
| Missing `crm_tenant` grant | ❌ **silent** — return value discarded | wrong closing balances, calendar-date fallback | manual discovery weeks later |
| `bump_paid_amount` fails after tx insert | ⚠️ 500 shown, then masked by the retry | `paid_amount` under-applied → guest billed twice | none automatic |
| Reservation deleted with payments | ❌ silent | ৳ orphaned, then mis-attached to the next guest | none |
| OTA multi-room partial failure | ❌ reports success | rooms 2-3 never created, revision acked | none — both recovery paths closed |
| Brevo send fails | ❌ `logRun('success')` unconditionally | owner alerts never arrive, dashboard green | none |
| Channex `api_base` unset | ❌ staging 200 → queue marked done | OTAs oversell, drain reports clean | none |
| Scheduled job stops running | ❌ no dead-man's-switch | silence | none |
| DB query > 8s | ✅ 504 with retryable body | front desk sees an error | user retries |
| POS duplicate submit | ✅ `uq_rest_orders_idem` | replay returns the existing order | automatic |
| Two payments concurrently | ✅ `bump_paid_amount` row lock | serialised | automatic |

**The pattern is unmistakable.** Everything the **database** guards fails loudly and recovers. Everything guarded only by **application convention** fails silently and never recovers.

That is the central design lesson from this audit: **push invariants down into Postgres.** Constraints, RPCs and policies are the parts of this system that work.

### Reliability gaps worth naming

- **No CI.** No `.github/` anywhere. `typecheck`, `test` and `lint` never run automatically; `vercel-build` runs `next build` only.
- **No meaningful test coverage.** The sole suite (`crm.logic.test.ts`, 423 lines) was copied from a legacy HTML file deleted on 2026-08-08 and imports **nothing** from `src/`. Its `_resDue` reproduces the discount bug (H-5) and asserts it as correct. The suite is currently worse than no suite.
- **No E2E.** `playwright.config.ts` exists; `@playwright/test` is not in `package.json` and `tests/e2e/` is absent.
- **11k LOC outside type checking.** `allowJs: true` without `checkJs` means all 23 `.jsx` components — every money modal — are untyped while `npm run typecheck` passes green.
- **DR is untested and currently impossible from the repo.** Two migrations reference objects that do not exist; the core tables' RLS is not in version control at all.

---

## 6. Trade-off analysis

| Decision | Bought | Paid | Verdict |
|---|---|---|---|
| Static `/crm` shell | CDN-fast TTFB, survived the July incident | client-side correctness burden that was never paid; weaker CSP on the staff app | **Keep.** Pay the client-side debt: sequence guards, server counterparts for money/inventory guards. |
| `crm_tenant` + RLS | real isolation; app bugs can't leak | high ops burden with a *silent* failure mode | **Keep.** Automate it (ADR-P3) — this is the same bug recurring. |
| Shared schema multi-tenancy | one migration for all tenants | isolation only as good as the weakest policy | **Keep** for single-digit tenants. Close the holes before tenant #2. |
| `SECURITY DEFINER` RPCs for money | atomicity, server-authoritative math | 12 of them are anon-granted with mutable `search_path` | **Keep the pattern, fix the grants.** The RPCs are the best code here. |
| Vercel serverless | zero ops, preview deploys | `maxDuration` caps; long jobs truncate mid-loop with partial writes | **Keep.** Add deadline checks and batching (copy `churn-score`). |
| Agent fleet in-repo | one deploy, shared libs | 23 routes + 7 edge functions with no scheduler and live auth surface | **Decide** (ADR-P4). Current state is the worst option. |
| Client-side capability checks | fast UI, no round-trip | 7 capabilities enforced nowhere on the server | **Insufficient.** Client checks are UX; the server must be authoritative. |

---

## 7. What I would revisit, and when

| Trigger | Revisit |
|---|---|
| **Before onboarding tenant #2** | All `anon` grants; the two `tenant_id`-less tables; the hardcoded UUID in `notifications_log.tenant_read`; the POS `authenticated` grants; the C-5 baseline migration |
| **Before OTA volume rises** | ADR-P2 — unify booking behind `fn_guard_and_book`. Overbooking is currently prevented by low volume, not by design. |
| **Before restoring crons** | H-11 (edge-function auth + tenant filters), H-12 (dead mailer + green-light logging), H-8 (LLM output validation), and a dead-man's-switch |
| **When `transactions` passes ~100k rows** | Date-bound the transactions endpoint; add the four indexes; consider partitioning by `fiscal_day` |
| **When staff exceeds ~10 concurrent** | Optimistic locking on `reservations` (H-4); a real rate limiter on the public endpoints |
| **When adding a second channel manager** | The `CMAdapter` interface is ready — but only after ADR-P2 gives it one availability truth to write to |

---

## 8. Highest-leverage changes

Ranked by risk reduced per hour of work.

| # | Change | Effort | Risk removed |
|---|---|---|---|
| 1 | Revoke `anon` grants; `security_invoker` on `leads_pipeline` | 1 migration | Cross-tenant disclosure of the entire B2B pipeline |
| 2 | FK → `CASCADE`; delete the `/billing` orphan fallback | 1 migration + 30 min | The ৳13,600 class, structurally |
| 3 | `GRANT` + policy on `night_audit_log`; check the return value | 1 migration + 5 lines | Silently wrong closing balances |
| 4 | Four indexes, `CONCURRENTLY` | 15 min | Front-desk 504s under growth |
| 5 | Lift `REAL_PAY`/`dueOf` into `src/lib/dues.js`, import everywhere | 1 hour | Four screens drifting apart on the same number |
| 6 | Add CI: `typecheck` + `test` + the grant-conformance query | 2 hours | Every silent regression class above |
| 7 | Server-side capability gates on `/api/crm/data`, `close-day`, `payment`, `folio` | 3 hours | Privilege escalation by any authenticated staff member |
| 8 | Unify booking behind `fn_guard_and_book` (ADR-P2) | 2-3 days | Overbooking, inconsistent idempotency |

Items 1-5 are roughly one focused day and remove every critical finding except C-5 and C-6.

---

*Companion documents: `CODE_REVIEW.md` (findings with line references), `ARCHITECTURE.md` (ADRs and decision history).*
