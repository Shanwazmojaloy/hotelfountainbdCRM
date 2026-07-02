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
   financial-metrics, reservation). login/activate/send-otp: ✅ host-based
   tenant resolution (pulled forward from Phase B, 2026-07-02) — pre-session
   routes resolve tenant from the request host via `getTenantFromHeaders()`
   (subdomain → tenants row; env fallback for the home slug; unknown subdomain
   → 404 'Unknown property'). Identical behavior single-tenant; per-subdomain
   login works automatically at tenant #2.
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

**Phase B — implemented 2026-07-02 (ahead of tenant #2; all inert single-tenant)**
5. G2: ✅ `tenants.office_ips` / `tenants.remote_roles` columns (migration
   `20260702_phase_b_perimeter_vault.sql`, applied to prod); `middleware.ts`
   reads them per-slug, 60s-cached, FAIL-OPEN to the deployment defaults on any
   fetch error. NULL columns (current state) = exactly the old behavior.
6. G4: ✅ secrets → Supabase Vault. RPCs `tenant_secret_set(tenant,key,val)` /
   `tenant_secrets_get(tenant)` (SECURITY DEFINER, revoked from anon/authed,
   roundtrip-tested on prod). `/api/admin/onboard-tenant` now writes provided
   secrets to Vault and leaves the columns NULL; `getTenantBySlug/ById` overlay
   Vault values into NULL columns at read time — a plaintext column value always
   wins, so nothing changes for Hotel Fountain (all secret columns NULL,
   env-var fallbacks downstream) until Vault entries exist.
7. Runbook step 3 / G8 option 2: ⚙️ DB plumbing shipped — `current_tenant_id()`
   now also honors a JWT `app_tenant_id` claim (inserted after the GUC branch).
   The client-side switch (mint per-tenant JWTs, move CRM reads off the
   RLS-bypassing service role) is DELIBERATELY DEFERRED to the 2-tenant Vercel
   preview — the runbook's own testing requirement; do not flip it blind on prod.
8. Runbook step 4: ✅ onboarding completes end-to-end — `onboard-tenant` accepts
   `rooms[]` (seeds the matrix, status AVAILABLE) and `owner{name,email}`
   (creates the unactivated owner staff row; global next-id rule). The owner
   then activates via send-otp/activate ON THEIR OWN SUBDOMAIN — works because
   auth routes are host-resolved (d03b591).
9. ⚠️ DISCOVERY (2026-07-02): runbook step 5 is ALREADY DONE in prod — the live
   `current_tenant_id()` has NO legacy `46bbc3ff` fallback (verified via
   `pg_get_functiondef`). `MULTI_TENANT_CUTOVER.md`'s step-5 section is stale;
   the public booking site evidently no longer depends on the fallback.
10. Still required at tenant #2: smoke-test the full flow on a 2-tenant Vercel
    preview (Supabase dev branches can't exercise `tenant_users`/auth), and
    populate that tenant's Vault secrets + FB/WhatsApp columns for the two
    per-hotel ops agents.

**2-tenant smoke test — run 2026-07-02 against PROD with a synthetic tenant**

A demo tenant unblocked the "needs tenant #2" tests. `lumeademo`
(id `156da579-073b-4a6e-bd64-e5a26c402d98`, "Lumea Demo Hotel") lives in prod
with rooms D101–D103, one DEMO GUEST reservation, and an activated owner staff
row (`demo-owner@lumea.invalid`, staff id 15). It is fully RLS-isolated; leave
it for future regression tests.

DB-layer results (simulated PostgREST contexts, live policies):
- anon + JWT claim `app_tenant_id=lumeademo` → sees EXACTLY D101–D103 ✅
- anon + claim `app_tenant_id=hotelfountainbd` → 28 HF rooms, 0 demo leaks ✅
- anon + GUC `app.current_tenant_id` → identical scoping ✅ (both
  `current_tenant_id()` branches verified under real RLS)
- bare anon, no tenant context → 0 rooms ✅ — also explains why runbook step 5's
  fallback removal didn't break the booking site: the public site no longer
  reads rooms via anon PostgREST at all. The `OR tenant_id IS NULL` policy arm
  currently exposes nothing (no NULL-tenant rows).
- anon on `reservations` → `permission denied` at the GRANT layer ✅ (C3
  posture: PII tables are grant-revoked AND RLS'd).

HTTP-layer results (live prod, run after resolving an initial misread):
`NEXT_PUBLIC_APEX_DOMAIN` IS set — to `lumea.fountainbd.com` — so the tenant
scheme is `<slug>.lumea.fountainbd.com` (matches the `*.lumea.fountainbd.com`
wildcard alias). The first probe used the wrong host pattern
(`lumeademo.fountainbd.com`); on the correct host everything passes:
- `lumeademo.lumea.fountainbd.com` → `x-tenant-slug: lumeademo` ✅
- login there with bogus creds → 401 Incorrect email or password ✅ (tenant
  resolved, staff searched in the DEMO tenant)
- login on `ghosthotel.lumea.fountainbd.com` → **404 Unknown property** ✅
  (G1 gate live — unknown subdomains no longer impersonate Hotel Fountain)
- real demo-owner login → session carries the demo `tenant_id`; `/api/crm/data
  ?resource=reservations` under that session → exactly 1 row (DEMO GUEST),
  ZERO of Hotel Fountain's 1,400 reservations ✅ — end-to-end isolation through
  middleware → host-resolved login → session binding → tenantScoped() wrapper.
Cross-tenant WRITE probes were deliberately not run against live hotel data;
write scoping is proven structurally (wrapper stamps/filters) + by the DB
tests. The reserved-subdomain guard shipped with this round is still correct
under this scheme (protects `www.lumea.fountainbd.com` etc.).

**Service-role→JWT switch — BOTH halves built and validated (2026-07-02);
enablement is one env flag away, rehearse on preview first.**
- DB half LIVE: `crm_tenant` role (migration `20260702_crm_tenant_role.sql`,
  applied to prod) — NOLOGIN, granted to `authenticator`, CRUD on the 32
  tenant-isolated tables, sequences, `current_tenant_id()` + `bump_paid_amount`.
  Deliberately NOT granted: `tenants`, `tenant_ai_usage`, vault RPCs. Validated
  on prod under `SET ROLE crm_tenant` + claims: reads scoped to claim ✅,
  own-tenant write 1 row ✅ (reverted), cross-tenant write 0 rows ✅. The role is
  inert — only a JWT signed with the project secret can activate it.
- Client half SHIPPED FLAG-OFF: `src/lib/tenantJwt.ts` mints 10-min HS256 JWTs
  `{role:'crm_tenant', app_tenant_id}` from `SUPABASE_JWT_SECRET`;
  `tenantDb.ts#tenantClient(tenantId)` returns that client when
  `TENANT_JWT_MODE=on`, else the service-role client (byte-identical default).
  Pilot route wired: `/api/crm/data` (read-only, lowest risk).
- REHEARSAL RIG BUILT & VALIDATED IN FALLBACK MODE (2026-07-02): branch
  `jwt-rehearsal` deploys to
  `hotelfountainbd-crm-git-jwt-rehearsal-shanwaz-ahmeds-projects.vercel.app`
  with BRANCH-SCOPED preview env (other previews untouched):
  `TENANT_JWT_MODE=on` + `NEXT_PUBLIC_TENANT_SLUG=lumeademo` (previews on this
  branch default to the DEMO tenant — cannot touch real hotel data). Validated:
  demo-owner login 200 on the preview (Vercel deployment protection bypassed
  via a `_vercel_share` link), pilot `/api/crm/data` returned exactly the 1
  demo row, and runtime logs show `[tenantDb] TENANT_JWT_MODE=on but
  SUPABASE_JWT_SECRET or anon key missing — using service role` — i.e. the JWT
  branch executes and degrades gracefully.
- REHEARSAL RUN 2 (2026-07-02, with SUPABASE_JWT_SECRET provisioned): minted
  HS256 tokens were REJECTED by PostgREST — `PGRST301 No suitable key or wrong
  key type` (captured via new error logging on the pilot route). ROOT CAUSE:
  the project has fully migrated to the NEW Supabase API-key system (verified:
  both prod and preview Vercel envs carry `sb_secret_*`/`sb_publishable_*`;
  CLAUDE.md's "legacy HS256 re-enabled" note was stale) — PostgREST's JWT
  keyset no longer accepts legacy-HS256 tokens, so NO pasted legacy secret can
  work. `tenantJwt.ts` now FAILS SAFE: on a new-key project with nothing to
  verify the secret against, it logs loudly and falls back to the service role
  (no 401s) unless `TENANT_JWT_FORCE=1`.
- ✅ REHEARSAL RUN 3 — GREEN (2026-07-03, fully automated via the Supabase
  Management API + Vercel API; no dashboard needed): a FRESH self-generated
  HS256 shared secret was imported as a **standby** signing key
  (`ad52818c-7a73-4a48-9109-a3620a9c8503` — verification-trusted, never signs
  auth tokens, zero impact on existing sessions; the revoked legacy key stays
  revoked). With it as branch-scoped `SUPABASE_JWT_SECRET` + `TENANT_JWT_FORCE=1`:
  demo login 200 → `/api/crm/data` 200 (exactly the 1 demo row) → **write probe
  200** (housekeeping task INSERT under crm_tenant through RLS WITH CHECK).
  Runtime logs show minting active, zero PGRST301. ALL 10 session-gated CRM
  data routes now use `tenantClient(TENANT)` (staff keeps a dedicated service
  client solely for the global next-id query); prod regression (flag off,
  service-role path) re-verified green.
- ✅ PROD FLIPPED (2026-07-03, commit daa5fe6): `execute_nightly_audit` +
  `get_secure_financial_metrics` granted to crm_tenant; close-day +
  financial-metrics migrated (ALL 12 session-gated CRM data routes now on
  `tenantClient()`); `SUPABASE_JWT_SECRET` + `TENANT_JWT_FORCE=1` +
  `TENANT_JWT_MODE=on` set on Production. VERIFIED LIVE: demo login/read/write
  all 200 RLS-scoped on prod; financial-metrics 403 = the RPC's internal
  permission gate firing correctly under crm_tenant; real Hotel Fountain
  browser traffic flowing 200s with minting active and ZERO PGRST301.
  **The Hotel Fountain CRM production API now runs WITHOUT RLS bypass** — the
  service role remains only for: login/activate/send-otp/session (pre-session),
  staff global next-id, tenant registry/secrets reads, middleware perimeter
  lookup, AI budget writes, agents/cron routes, and the /api/crm/data
  SB_SERVICE_KEY presence guard. ROLLBACK: delete `TENANT_JWT_MODE` from
  Production env + redeploy (instant service-role fallback, no code change).
- ORIGINAL (superseded) ENABLEMENT NOTES:
  1. Supabase Dashboard → Project Settings → **JWT Keys**: check whether an
     HS256 "shared secret" key can be made ACTIVE (legacy secret re-activated,
     or a shared-secret signing key created/rotated in). NOTE: changing JWT
     signing keys affects Supabase-Auth-issued user tokens — staff auth here is
     custom (lumea_sess cookie), so exposure is limited to anything using
     Supabase Auth sessions (e.g. tenant_users owner-mapping paths).
  2. Set that secret as `SUPABASE_JWT_SECRET` + `TENANT_JWT_FORCE=1` on the
     `jwt-rehearsal` preview branch env; push to the branch; re-run the pilot
     (login demo owner → /api/crm/data must return the 1 demo row; runtime logs
     must show NO PGRST301 and no fallback warning).
  3. Green → migrate remaining routes' client creation to `tenantClient(TENANT)`
     (mechanical), grant night-audit/financial RPCs to `crm_tenant` as routes
     move, then consider `TENANT_JWT_MODE=on` in production. Never enable in
     prod before the preview run is green.
  If the dashboard offers no HS256 option: custom minting against asymmetric
  keys is impossible (Supabase holds those private keys) — keep the proven
  service-role + tenantScoped() model and revisit when Supabase ships
  first-class custom-claims minting.

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
