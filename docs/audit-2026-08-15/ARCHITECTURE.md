# Lumea CRM — Architecture Evaluation

**Date:** 2026-08-15
**Repo:** `F:\Hotel Fountain\Hotel Fountain Web CRM`
**Method:** `/engineering:architecture` — retrospective ADRs for the decisions already in force, plus proposed ADRs for the gaps the code review exposed.

---

## System at a glance

```
                          ┌──────────────────────────────────────────┐
   guests / OTAs ────────▶│  fountainbd.com  (Next.js 15, Vercel iad1)│
                          │                                          │
                          │  app/(site)/**      marketing + booking   │
                          │  app/crm/**         STATIC shell ─┐       │
                          │  app/admin/**       strict CSP    │       │
                          │  middleware.ts   host→tenant slug, │      │
                          │                  perimeter, CSP    │      │
                          └───────┬──────────────────┬─────────┼──────┘
                                  │                  │         │
                     ┌────────────▼──────┐   ┌───────▼──────┐  │ client-side
                     │ /api/crm/*        │   │ /api/agents/*│  │ React SPA
                     │ role: crm_tenant  │   │ role: service│  │ (23 .jsx)
                     │ RLS ENFORCED      │   │ RLS BYPASSED │  │
                     └────────┬──────────┘   └──────┬───────┘  │
                              │                     │          │
                              ▼                     ▼          │
                   ┌──────────────────────────────────────┐    │
                   │        Supabase Postgres              │◀───┘ anon key
                   │  reservations ◀─ transactions          │      (PostgREST,
                   │       ▲            folios              │       direct)
                   │       └── restaurant_orders            │
                   │  night_audit_log · audit_logs · tenants│
                   │  RPCs: execute_nightly_audit,          │
                   │        fn_pos_create_order,            │
                   │        fn_guard_and_book, bump_paid_amt│
                   └──────────┬───────────────────┬─────────┘
                              │                   │
                   ┌──────────▼────────┐  ┌───────▼─────────────┐
                   │ 7 Edge Functions  │  │ Channex (channel    │
                   │ wf-* (Deno)       │  │ manager) ⇄ OTAs     │
                   │ NO SCHEDULER      │  │ inventory_ledger    │
                   └───────────────────┘  └─────────────────────┘

  External: Resend + Brevo (mail) · Meta CAPI · Facebook Graph · Google Sheets · Anthropic
```

**Shape:** a single Next.js deployment serving three audiences (public marketing, staff CRM, platform admin) against one Postgres, with two privilege tiers at the DB boundary and three independent write paths into `reservations`.

---

## Standing decisions, evaluated

### ADR-001 · Reservation-centric financial model

**Status:** Accepted — and correct. **Partially violated in implementation.**

**Context.** The business lost ৳13,600 to folio/reservation linkage. The rule: financial rows anchor to a `reservation_id` UUID, never `room_number` alone; balances derive by reducing raw transactions; orphans are flagged, never merged.

**Assessment.**

| Dimension | Verdict |
|---|---|
| Model correctness | ✅ Right choice. A room is a resource; a reservation is the contract. Rate changes, room swaps and multi-room bookings all resolve cleanly. |
| Enforcement at the DB | ⚠️ **Partial.** `restaurant_orders` has a real CHECK (`room_needs_res`). `transactions.reservation_id` is nullable with `ON DELETE SET NULL` — the invariant is documented in a comment and contradicted by the constraint. |
| Enforcement in code | ⚠️ `app/billing/page.jsx` actively re-attaches orphans by room + date, doing exactly what the rule forbids. `src/components/Billing.jsx` does not. Two screens, two truths. |
| Orphan detection | ⚠️ Exists (`shadowAudit`) but only inspects the single day being closed. A row orphaned after its day closed is never re-examined. |

**Consequences.**
- *Easier:* Room swaps, multi-room bookings, negotiated totals, POS charge routing — all correct by construction.
- *Harder:* The invariant lives in prose. Nothing fails loudly when it is broken; symptoms surface as money that doesn't reconcile weeks later.
- *Revisit:* The rule needs teeth in the schema. See ADR-007.

---

### ADR-002 · `crm_tenant` role + RLS instead of service_role for the CRM API

**Status:** Accepted — the right call, undermined by grant management.

**Context.** The CRM API connects as a dedicated Postgres role subject to RLS, rather than the service_role key. Defence in depth: an app bug cannot read another tenant's rows because the database refuses.

**Options as they stood.**

| Option | Complexity | Blast radius of an app bug | Ops burden |
|---|---|---|---|
| **A. service_role everywhere** | Low | Total — one missing `.eq()` leaks everything | None |
| **B. `crm_tenant` + RLS** *(chosen)* | Medium | Contained — DB refuses | **High** — every new table needs GRANT + policy |
| C. Per-tenant Postgres schema | High | Contained by construction | High — migrations × N tenants |

**Assessment.** B is right for a platform onboarding third-party hotels. But the ops burden was underestimated and is now the dominant failure mode:

| Evidence | |
|---|---|
| 2026-07-04 | Missing `crm_tenant` grant → night-shift payments leaked into the next business day. Worked around in `payment` and `reservation` only. |
| Today | `night_audit_log`: no grant, SELECT-only policy → close-day drawer writes silently fail. Same root cause, never fixed. |
| Today | `outreach_log`, `notifications_log`: granted to `crm_tenant`, but their only policies target `service_role`/`authenticated` → guaranteed empty reads. |
| Today | `GRANT ON ALL SEQUENCES` is a one-time snapshot. No `ALTER DEFAULT PRIVILEGES` anywhere. Every future serial table repeats 2026-07-04. |
| Today | `leads_pipeline` view without `security_invoker` → the whole model bypassed for that view. |

The decision is sound; the **process around it is not**. A model whose failure mode is a *silent* no-op needs automation and loud failures.

**Consequences.**
- *Easier:* Genuine multi-tenant isolation. A forgotten `.eq('tenant_id')` cannot leak.
- *Harder:* Every table addition is a two-part change. Half of it can be forgotten, and the app degrades quietly rather than erroring.
- *Revisit:* Now. See ADR-006.

---

### ADR-003 · `/crm` as a static shell

**Status:** Accepted — keep. Trade-offs are understood and documented.

**Context.** The July slowness incident traced to serial DB round-trips, `sin1` region latency, PHP bot floods and oversized payloads. `/crm` was made a static prerendered shell (`ee5aad3`) that hydrates and fetches client-side.

**Assessment.**

| Dimension | |
|---|---|
| Performance | ✅ Correct. TTFB is CDN-bound; the shell paints before any DB work. |
| Security | ⚠️ Cost: `/crm` is excluded from `STRICT_PREFIXES`, so it runs `script-src 'self' 'unsafe-inline'`. The staff CRM has no script-injection barrier. Accepted and documented at `app/crm/layout.tsx:9-14`. |
| Data freshness | ⚠️ Cost: everything becomes a client fetch, which is where H-22 (Dashboard race), H-23 (autocomplete race) and H-21 (client-only double-booking guard) come from. |

**The real lesson.** A static shell moves correctness burden to the client. That burden was never paid: not one of the five `fetchDashboard()` call sites has a sequence guard, and the double-booking check exists only in React. The architecture is fine; the client-side discipline it requires is missing.

**Do not revisit the shell.** Do add: a sequence-guard convention for every polled fetch, and server-side counterparts for every client-side guard that protects money or inventory.

---

### ADR-004 · Three independent write paths into `reservations`

**Status:** ⚠️ **Accidental, not decided. Should be superseded.**

This was never chosen; it accreted.

| Writer | Availability model | Writes `inventory_ledger`? | Writes `rooms.status`? | Auth |
|---|---|---|---|---|
| `/api/crm/reservation` (staff) | client-side overlap check only | ❌ | ✅ | session cookie |
| `src/lib/channel/inbound.ts` (OTA) | `fn_guard_and_book` + ledger | ✅ | ❌ | HMAC, timing-safe |
| `supabase/functions/booking-webhook` | `rooms.status='AVAILABLE'`, **no date predicate** | ❌ | ✅ | fails open if secret unset |
| `/api/book` (website) | none | ❌ | ❌ | none (public) |

Four writers. Three availability models. No shared truth.

**Consequence — this is a real overbooking generator.** `drain.ts` computes OTA availability purely from `inventory_ledger`, so anything written by the edge function or the staff route is invisible to the OTA push. Channex is told the room is free; the OTA resells it. In the other direction, `fn_guard_and_book` decrements the ledger but never flips `rooms.status`, so the edge function's `AVAILABLE` scan hands the same room out again.

The design *detects* the divergence via a nightly reconcile email rather than preventing it.

**Recommendation: supersede.** One booking RPC — `fn_guard_and_book` — as the single writer. Every caller (staff route, OTA inbound, website, edge function) goes through it. It owns the ledger decrement, the room-status flip and the overlap check atomically. This is the single highest-leverage architectural change available.

---

### ADR-005 · The scheduled automation fleet

**Status:** ⚠️ **Effectively decommissioned.** The repo's record of it is stale.

`vercel.json` is 201 bytes and contains **no `crons` key at all**:

```json
{ "version": 2, "framework": "nextjs", "outputDirectory": ".next",
  "regions": ["iad1"], "rewrites": [{ "source": "/landing", "destination": "/index.html" }] }
```

This is materially different from "paused". The schedules were **deleted**. The only surviving record of each agent's cadence is a header comment inside its own route file — reconstructing the array means trusting 23 comments.

Compounding it: `src/lib/workflow-trigger.ts`'s `triggerEdgeFunction()` has **zero callers**, so the seven `wf-*` edge functions have no caller in this repo either.

**Current state.**

| Layer | Scheduled? | Reachable? |
|---|---|---|
| 16 Next.js agent routes | ❌ no cron | ✅ via `CRON_SECRET` (all but two fail closed) |
| 7 Supabase edge functions | ❌ no caller | ⚠️ **publicly, with the anon key — no auth at all** |
| Event-driven chain (reply-intake → ceo-auditor → deal-alert → payment-send) | n/a | ✅ live now |

So the *scheduled* work is dark while the *event-driven* work — the part that emails prospects the hotel's bank details — is fully live. That is close to the inverse of the safe configuration.

**Recommendation.** Decide explicitly, and record it:
- **If the fleet is retired:** delete the routes and edge functions. Dead code with live auth surface is the worst of both.
- **If it is coming back:** restore `crons` from a reviewed source (not comments), fix H-11 (edge-function auth + tenant filters) and H-12 (dead mailer) *before* unpausing, and add a dead-man's-switch that alerts on missing `workflow_runs` rows.

---

### ADR-006 · Multi-tenancy by shared schema + `tenant_id`

**Status:** Accepted. Sound choice, incompletely realised.

| Option | Isolation | Migration cost | Ops at 5-20 tenants |
|---|---|---|---|
| **A. Shared schema + `tenant_id` + RLS** *(chosen)* | Policy-dependent | One migration, all tenants | Low |
| B. Schema-per-tenant | Strong by construction | N migrations | Medium |
| C. Database-per-tenant | Strongest | N migrations + N connections | High |

A is right for a 24-room boutique platform expecting single-digit tenants. But the realisation has three structural gaps:

1. **The repo cannot rebuild the database.** `20260515` targets `bgqs_raw.*`, a staging schema that `db/05_cleanup.sql` drops. `20260702_phase_b` references `tenant_users` and `tenants.owner_id`, neither of which exists anywhere. The four core money tables therefore have **no RLS enablement in the repo at all** — production works only because policies were applied out-of-band via MCP.
2. **Two tables have no `tenant_id` at all** — `reservation_requests` and `notifications`, both accepting anon writes via `WITH CHECK (true)`. The moment a second hotel is onboarded, their landing-page bookings and notification bells share one global pool.
3. **A hardcoded tenant UUID appears in a policy qualifier** (`notifications_log.tenant_read`) and in four POS column defaults. Every `authenticated` user of the project can read Hotel Fountain's outbound sales correspondence.

**Consequences.**
- *Easier:* One migration serves all tenants; one deployment; cross-tenant analytics are trivial.
- *Harder:* Isolation is only as good as the weakest policy — and the weakest policies are the ones nobody re-reads. The onboarding flow (`/api/admin/onboard-tenant`) creates tenants faster than the isolation model is being verified.
- *Revisit:* Before onboarding tenant #2. See the action items below.

---

### ADR-007 · Dual privilege tiers (`crm_tenant` vs `service_role`)

**Status:** Accepted. The boundary is right; the leak is the anon key.

The intended model is clean:

| Tier | Used by | RLS |
|---|---|---|
| `crm_tenant` | `/api/crm/*` — everything a staff session drives | enforced |
| `service_role` | `/api/agents/*`, edge functions, cron | bypassed |
| `anon` | public reads only | enforced |

The leak is that `anon` has been granted more than public reads:

| Grant | Consequence |
|---|---|
| `GRANT SELECT ON leads_pipeline TO anon` (no `security_invoker`) | every tenant's B2B pipeline, unauthenticated |
| `GRANT EXECUTE` on 12 `SECURITY DEFINER` RPCs `TO anon` | cross-tenant lead mutation and log injection |
| `WITH CHECK (true)` on `notifications`, `reservation_requests` | unauthenticated writes into an operator-trusted surface |
| DML on four POS tables `TO authenticated` | contradicts the file's own security header |
| anon key hardcoded in `src/lib/workflow-trigger.ts:31` | it is not merely public, it is *findable* |

**Rule to adopt:** `anon` gets `SELECT` on explicitly public content and nothing else — no RPC `EXECUTE`, no `WITH CHECK (true)`, no view that isn't `security_invoker`. Add a CI check that greps migrations for `TO anon` and requires a justification comment.

---

## Proposed ADRs

### ADR-P1 · Make the reservation-centric invariant a database constraint

**Status:** Proposed
**Supersedes the prose form of ADR-001.**

**Decision.** Move the invariant from comments into DDL.

```sql
-- 1. no more orphans by construction
ALTER TABLE public.transactions DROP CONSTRAINT transactions_reservation_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_reservation_id_fkey
  FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;

-- 2. after reconciling existing NULLs, forbid new ones
ALTER TABLE public.transactions ALTER COLUMN reservation_id SET NOT NULL;

-- 3. a standing orphan view the UI can render, not a once-a-day job
CREATE OR REPLACE VIEW public.v_orphan_transactions WITH (security_invoker = true) AS
SELECT * FROM public.transactions WHERE reservation_id IS NULL;
```

| Trade-off | |
|---|---|
| Gain | The ৳13,600 class becomes structurally impossible, not merely discouraged. |
| Cost | Hard deletes stop being possible for reservations with money. That is arguably the correct outcome — prefer `status = 'CANCELLED'`. |
| Risk | Step 2 fails loudly if orphans exist. Run the reconciliation query first; treat any rows it returns as a finance incident. |

---

### ADR-P2 · One booking RPC as the single writer of availability

**Status:** Proposed
**Supersedes ADR-004.**

**Decision.** `fn_guard_and_book` becomes the only path that creates a reservation. It owns, atomically: overlap check → `inventory_ledger` decrement → `reservations` insert → `rooms.status` flip.

```
staff route ─┐
OTA inbound ─┼─▶ fn_guard_and_book(tenant, room_type, dates, guest, source, idem_key)
website     ─┤        ├─ SELECT … FOR UPDATE on inventory_ledger
edge fn     ─┘        ├─ overlap check
                      ├─ INSERT reservations
                      ├─ UPDATE rooms.status
                      └─ RETURN reservation_id  (idempotent on idem_key)
```

| Dimension | Today | After |
|---|---|---|
| Availability sources of truth | 3 | 1 |
| Overbooking prevention | detect-after-the-fact email | prevented in-transaction |
| Idempotency | 4 different approaches, 2 broken | one `idem_key`, one unique index |
| Double-booking guard | client-side React only | DB row lock |

**Consequences.** *Easier:* overbooking becomes structurally hard; retry semantics become uniform; the nightly reconcile becomes an assertion rather than a repair. *Harder:* one RPC becomes a hot path needing careful lock scoping; `booking-webhook` needs a rewrite or retirement. *Revisit:* if a second channel manager is added — the adapter interface already anticipates this.

---

### ADR-P3 · Grant and policy management as an automated invariant

**Status:** Proposed
**Addresses the dominant failure mode of ADR-002.**

**Decision.** Three mechanisms, in ascending order of value:

1. **Default privileges** — stop the snapshot problem at the source.
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO crm_tenant;
```
2. **A conformance test** in CI that fails when any table with a `tenant_id` column lacks RLS, lacks a `tenant_isolation` policy, or lacks a `crm_tenant` grant:
```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id'
WHERE n.nspname='public' AND c.relkind='r'
  AND (NOT c.relrowsecurity
    OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=c.relname AND p.policyname='tenant_isolation')
    OR NOT has_table_privilege('crm_tenant', c.oid, 'SELECT'));
```
3. **Loud failure.** Stop discarding `error` on `db.from(...).update(...)` in money paths. A missing grant should page, not shrug.

**Consequence.** The 2026-07-04 incident and the current `night_audit_log` breakage are the *same bug two months apart*. This ADR is what stops the third occurrence.

---

### ADR-P4 · Restore or retire the automation fleet — explicitly

**Status:** Proposed, decision required
**Supersedes the undocumented state in ADR-005.**

The fleet cannot stay in its current state: scheduled work dark, event-driven work live and unguarded, edge functions publicly invokable with the anon key, and the cadence recorded only in code comments.

| Option | Effort | Risk if chosen |
|---|---|---|
| **A. Retire** — delete the 16 routes + 7 edge functions | Low | Lose lead-gen automation and owner reports. Reversible from git. |
| **B. Restore as-is** — re-add `crons` | Low | **Unacceptable.** Un-pauses the dead-mailer green-light problem (H-12), the prompt-injection chain (H-8), and the cross-tenant edge-function reads (H-11). |
| **C. Restore behind gates** *(recommended)* | Medium | Fix H-8, H-11, H-12 first; add `WF_SECRET` to every edge function; add a dead-man's-switch on `workflow_runs`; restore `crons` from a reviewed manifest, not comments. |

Whichever is chosen, **write the cron manifest into a reviewed file** rather than leaving it distributed across 23 route-header comments.

---

## Architectural risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Orphaned money after a reservation delete | **Happening now** | ৳-scale, silent | ADR-P1 |
| Overbooking via divergent availability writers | Medium (rises with OTA volume) | Guest at a full hotel | ADR-P2 |
| Cross-tenant read via anon-granted view/RPCs | **Live now** | Full B2B pipeline of every tenant | C-1, ADR-007 rule |
| Silent DB write failure from a missing grant | **Happening now** | Wrong closing balances | ADR-P3 |
| Cannot rebuild the DB from the repo | Certain on any DR event | Extended outage | C-5 baseline migration |
| Automation re-enabled without fixing the mailer | Medium | Green dashboards, zero mail | ADR-P4 option C |
| Client-side-only guards on a static shell | **Live now** | Double-booking, wrong guest attached | Server counterparts for every money/inventory guard |

---

## Action items

1. [ ] **ADR-P1** — reconcile orphan transactions, flip the FK to `CASCADE`, add `v_orphan_transactions`.
2. [ ] **C-1 / ADR-007** — revoke all `anon` RPC grants; `security_invoker` on `leads_pipeline`; adopt the "anon = public SELECT only" rule with a CI grep.
3. [ ] **ADR-P3** — `ALTER DEFAULT PRIVILEGES`; add the conformance query to CI; fix `night_audit_log`, `outreach_log`, `notifications_log`.
4. [ ] **C-5** — generate `00000000000000_baseline.sql` from `pg_dump --schema-only`; retarget `20260515`; add the missing `tenant_users` / `tenants.owner_id`.
5. [ ] **ADR-P4** — choose retire vs restore-behind-gates; record the cron manifest in a reviewed file.
6. [ ] **ADR-P2** — design the unified `fn_guard_and_book` signature; migrate callers one at a time, starting with `booking-webhook`.
7. [~] ~~Add `.github/workflows/ci.yml`~~ — **retracted: already present** and running `typecheck` + `test` + `lint` + build. Two edge guards added to it 2026-08-15. Outstanding: the ADR-P3 conformance query as a CI step.
8. [ ] Update `MEMORY_LOG.md` / project docs with ADR-005's real state (crons **deleted**, not paused) and the `@eslint/eslintrc` fix.

---

*Companion documents: `CODE_REVIEW.md` (findings with line references), `SYSTEM_DESIGN.md` (data flow, scale, failure modes).*
