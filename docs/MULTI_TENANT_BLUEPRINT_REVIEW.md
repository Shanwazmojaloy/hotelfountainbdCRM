# Multi-Tenant Blueprint Review & Gap Analysis — 2026-07-02

Companion to `MULTI_TENANT_CUTOVER.md` (the authoritative cutover runbook,
2026-06-06). This doc maps the external "Multi-Tenant Multi-Agent Master Stack"
research blueprint onto Lumea's actual codebase, records what the 2026-07-02
audit found beyond the runbook, and vets the blueprint's citations.

**Verdict on the blueprint:** good architectural instincts, unreliable
citations. Use it as a reading list, not a spec. Lumea already implements the
parts that matter at its scale; the heavy infrastructure (Kafka, gVisor pools,
OTel collectors) is explicitly out of scope until the conditions in Phase D.

---

## 1. Blueprint → Lumea mapping

| Blueprint concept | Lumea status |
|---|---|
| Pooled multi-tenancy w/ `tenant_id` + Postgres RLS | ✅ Built. `tenant_isolation` policy on 18 tables; `current_tenant_id()` GUC/membership/ownership resolver (see runbook "Done" section) |
| Tenant context from request → session | ✅ Built. `middleware.ts` subdomain → `x-tenant-slug`; CRM session cookie carries `tenant_id`; API routes filter `.eq('tenant_id', TENANT)` |
| Per-tenant credential store (the "zero-trust credential proxy", scaled down) | ✅ Built as `tenants` table secret columns (brevo/gmail/fb/anthropic/cron), service-role-only, never returned to clients. ⚠️ plaintext — see G4 |
| Tenant onboarding API | ✅ Built. `POST /api/admin/onboard-tenant` (ADMIN_SECRET, timing-safe compare, audit-logged) |
| Token-aware per-tenant budget/rate limiting | ❌ Gap — see G5 |
| Infrastructure-enforced isolation (not just app filters) | ⚠️ Partial — CRM API routes use the service role, which **bypasses RLS**; isolation currently depends on every query remembering `.eq('tenant_id', …)`. See G8 |
| Kafka event orchestration, gVisor warm sandbox pools, OTel collector routing, FGA (SpiceDB) on RAG | ⛔ Deliberately skipped — wrong scale. Revisit conditions in Phase D |

## 2. New gaps found in the 2026-07-02 audit (not in the runbook)

- **G1 — Unknown subdomain silently becomes Hotel Fountain.**
  `src/lib/tenant.ts` `getTenantFromHeaders()` falls back to the
  `hotelfountainbd` slug and then to `buildEnvFallback()`. Fine single-tenant;
  at tenant #2, `randomhotel.lumea.app` must render a 404/"no such property"
  page, never Hotel Fountain's config. Gate the fallback on
  `slug === DEFAULT_SLUG`.
- **G2 — Perimeter gate is hardcoded to one hotel.** `middleware.ts`
  `OFFICE_IPS = ['103.113.153.228']` and `REMOTE_ROLES` are global constants.
  At tenant #2 these become per-tenant columns (`office_ips text[]`,
  `remote_roles text[]`) on `tenants`, read via the same 60s cache.
- **G3 — `OR tenant_id IS NULL` in the RLS policies is a standing leak
  pattern.** Any future row inserted with NULL `tenant_id` is visible to every
  tenant. Backfill is done; after the runbook's step 5 (fallback removal),
  also: `ALTER TABLE … VALIDATE CONSTRAINT`, `SET NOT NULL`, and drop the
  `IS NULL` arm from all 18 policies.
- **G4 — Tenant secrets are plaintext rows fetched with `select('*')` and
  held in a module-level cache.** Acceptable now (service-role only), but
  before onboarding a paying tenant: move secret columns to Supabase Vault
  (or pgsodium TCE), and split `getTenantBySlug` into identity (cacheable)
  vs secrets (fetch-on-use) so hotel identity lookups stop dragging every
  tenant's API keys into memory.
- **G5 — No per-tenant AI spend caps.** `tenants.anthropic_api_key` exists
  but AI routes have no TPM/spend ceiling — one tenant's runaway agent loop
  spends unboundedly. Minimal fix, no gateway needed: a `tenant_ai_usage`
  table (tenant_id, day, tokens_in, tokens_out, est_cost) updated after each
  Anthropic call + a budget check before it (429 with reset time when over
  tier). This is the only blueprint "gateway layer" feature worth building
  in-app; adopt Bifrost/an LLM gateway only if provider count grows past ~2.
- **G6 — Tenant cache invalidation is per-serverless-instance.**
  `invalidateTenantCache()` only clears the lambda that ran it; other
  instances stay stale up to the 60s TTL. Bounded and acceptable — document,
  don't fix. (If per-tenant *deactivation* must be instant, drop TTL to 10s
  for the `is_active` check only.)
- **G7 — Legacy dead path: `app/actions/checkout.ts`.** Anon-key server
  action, writes lowercase `'Dirty'` (violates the UPPERCASE status
  constraint), no tenant scoping. Anon writes were revoked 2026-06-18, so it
  can only fail at runtime. Verify nothing imports it, then delete.
- **G8 — Centralize the tenant filter.** Every CRM route hand-writes
  `.eq('tenant_id', TENANT)` on a service-role client. One forgotten filter =
  cross-tenant leak with no RLS backstop. Two options, in preference order:
  1. Thin wrapper: `tenantScoped(supabase, TENANT).from('rooms')…` that
     auto-appends the filter (pure app-level, zero DB risk, do anytime).
  2. Real backstop: switch CRM reads to a non-bypassing role and
     `set_config('app.current_tenant_id', …)` per request (runbook step 3) —
     only worth the migration risk at tenant #2.

## 3. Phased adoption plan

**Phase A — now, single-tenant, zero prod risk** *(implemented 2026-07-02 in this
worktree — see "Phase A implementation notes" below)*
1. G7: delete dead `checkout.ts` action. ⏳ verified zero importers; file
   deletion pending (shell unavailable during the session).
2. G8 option 1: ✅ `src/lib/tenantDb.ts` wrapper added; 10 CRM routes migrated
   (task, room, settings, guest, data, folio, check, payment, close-day, staff,
   financial-metrics, reservation). login/activate/send-otp intentionally NOT
   migrated — they resolve tenant from env by necessity (no session exists yet);
   host-based tenant resolution for them is Phase B.
3. G5: ✅ `supabase/migrations/20260702_tenant_ai_usage.sql` (NOT applied to
   prod — fail-open code works without it) + `src/lib/aiBudget.ts` + wired into
   ceo-auditor (budget exhausted → existing heuristic fallback). Remaining AI
   routes to wire the same way: `council/deliberate`, `ai/assist`,
   `agents/churn-score`.
4. G1: ✅ `getTenantFromHeaders` now env-falls-back ONLY for the home slug;
   unknown subdomains throw `TenantNotFoundError`.

**Phase A implementation notes (2026-07-02)**
- Latent cross-tenant bugs found & fixed during the wrapper migration — all
  harmless single-tenant, live bugs at tenant #2:
  - `room/route.ts` — room status update by bare `id`, no tenant filter; route
    also used the static env tenant instead of the session's.
  - `check/route.ts` — reservation lookup + update by bare `id`.
  - `payment/route.ts` — reservation fetched by client-supplied
    `reservation_id` with no tenant filter (money route).
  - `folio/route.ts` — folio delete by bare `id`; static env tenant.
  - `reservation/route.ts` — `update` action's reservation select/update by
    bare `id`; double-booking clash check and room-rate lookups matched
    `room_number` across ALL tenants (two hotels sharing "405" would block each
    other and cross-read rates).
  - `session/route.ts` — the sliding-session refresh re-signed the cookie
    WITHOUT `tenant_id`, silently rebinding every session to the env fallback
    tenant after its first refresh. Fixed to preserve it.
- `staff/route.ts` next-id query stays GLOBAL on the raw client on purpose:
  `staff.id` is an integer PK shared across tenants.
- Verification: `npx tsc --noEmit` + `npm run build` must pass before commit
  (was pending on shell availability when this note was written).

**Phase B — at tenant #2 signup (with runbook steps 2–4)**
5. G2: per-tenant perimeter config columns.
6. G4: secrets → Vault; split identity/secret fetches.
7. Runbook step 3 / G8 option 2: per-request `set_config` tenant context so
   RLS becomes the real backstop.
8. Smoke-test on a 2-tenant Vercel preview (per runbook warning — Supabase
   dev branches can't exercise `tenant_users`/auth).

**Phase C — post-cutover hardening (after runbook step 5)**
9. G3: validate FKs, `SET NOT NULL`, drop `IS NULL` policy arms.
10. Per-tenant observability: `tenant_id` already flows through `logEvent()`;
    add it to any future tracing before adopting an OTel stack.

**Phase D — explicitly deferred (revisit conditions)**
- Kafka/event bus: only if agent workloads outgrow Vercel cron + route loops
  (`_tenants.ts#activeOpsTenants()` pattern) — i.e., >10 active tenants with
  concurrent long-running agents.
- gVisor/WASM sandboxes: only if tenants ever execute *generated* code.
  Current agents call known APIs — no sandbox needed.
- SpiceDB/OpenFGA: only if RAG over per-tenant documents with sub-tenant
  permissions ships.
- LLM gateway (Bifrost etc.): only at >2 model providers or when G5's
  in-app budgeting proves insufficient.

## 4. Vetted reading list from the blueprint

Confidence-tagged; ⏳ items still need online verification (search tooling was
unavailable during this review — do not depend on them until checked).

| Item | Status |
|---|---|
| PostgreSQL RLS pooled-tenancy pattern (`current_setting` GUC) | ✅ Established practice; Lumea already uses it |
| gVisor, Bubblewrap, Wasmtime/WASI (sandbox runtimes) | ✅ Real, mature projects |
| SpiceDB (authzed), OpenFGA (FGA engines) | ✅ Real, CNCF/production-grade |
| Wren AI semantic layer + its multi-tenancy docs | ✅ Real project; verify the specific RLS-tenancy doc page before citing |
| Bifrost — maximhq LLM gateway (Go) | ✅ Real (github.com/maximhq/bifrost); the "11µs @ 5k RPS" figure is vendor-reported — treat as marketing until independently benchmarked |
| Confluent "event-driven multi-agent systems" patterns | ✅ Real blog series; sound patterns, Kafka-vendor framing |
| dloss/awesome-agent-sandboxes | ⏳ Plausible curated list; verify before linking |
| "LastSaaS" (Go SaaS starter, "14MB Alpine", HMAC webhooks) | ❌ Could not corroborate; comparison-table stats look confabulated |
| "FIVUCSAS", "Autonomous Founder Identity Engine" | ❌ Almost certainly confabulated; ignore |
| "Kimi K2.6 executing 300-agent parallel operations" | ❌ Unverifiable claim; ignore |
| Framework credential-scoping gap (LangGraph/CrewAI/AutoGen bind creds at process scope) | ✅ Accurate observation; Lumea's per-tenant `tenants` secret columns + service-role-only reads are the scaled-down mitigation |
