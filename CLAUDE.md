# Claude Code Configuration - RuFlo V3

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- After any bash `cat >>` append to a .tsx/.ts file, immediately verify with `tail -5` and `tsc --noEmit` — appends frequently corrupt files silently
- **LEGACY SPA DELETED (2026-08-08, commit 95105a2).** `public/crm-src.jsx`, `crm-bundle.js`, `crm.html`, `crm-boot.js`, `crm-config.js` and `scripts/bump-cache.js` no longer exist. The Next.js `/crm` app (`app/crm/*` + `src/components/*`) is the ONLY CRM surface. `/crm.html` and the four legacy assets 308-redirect to `/crm` via `next.config.mjs` `redirects()`. The old crm.html-truncation, crm-src.jsx-rebuild and `build:crm` rules are RETIRED — do not reintroduce them, and do not "restore" those files.
- All git commits MUST originate from Windows PowerShell, NOT from the bash sandbox (`.git/*.lock` files are owned by Windows UID and cannot be removed from sandbox)
- `_isRealPayment` MUST use positive match: `/payment|settlement|advance|deposit|bkash|bank\s*transfer/i` — exclusion-only allows charges (Stay Extension, Room Service) to count as revenue
- Billing PAID column TODAY filter: use `_isPaymentTx` positive match — NOT a blanket exclusion of BCF. Stay Extension is a CHARGE not a payment.
- `unifiedGroups` in BillingPage: always match TX → reservation by `reservation_id` FIRST, room+name fallback second — prevents cross-guest misattribution when two reservations share a room number
- Record Payment auto-updates `reservation.paid_amount` server-side: the live `RecordPaymentModal` → `POST /api/crm/payment` inserts the TX and atomically bumps `paid_amount` via the `bump_paid_amount(LEAST(net, paid+a))` RPC (H3, 2026-06-18 — race-safe, no manual `UPDATE` needed). The old "manually `UPDATE reservations SET paid_amount`" step applied only to the legacy `crm-src.jsx` +PAY path, which is no longer served.
- `computeBill` rawTotal: `canonical>0 ? canonical : sub` — `total_amount` (canonical) ALREADY includes folio extras after an Add-Charge resync (`recalcResTotal`/`recalcResTotalServer` fold folios into `total_amount`), so do NOT add `+ extras` on top — that double-counts. The room-only portion is `canonical − extras` (see `src/lib/printDocs.js`). Live `computeBill` now lives in `app/billing/page.jsx` (the old `crm-src.jsx ~L3332` pointer died with the SPA on 2026-08-08).
- NEVER update `paid_amount` directly in reservations without also INSERTing a matching row in `transactions` (type='Room Payment (Cash)', fiscal_day=today, reservation_id). Skipping the TX row makes Billing & Invoices page blind to the payment.
- `ReservationDetail.save()` now auto-creates TX when `paid_amount` increases: `payIncrease = paidNum - prevPaid; if (payIncrease>0) dbPost('transactions',{type:'Advance Payment', amount:payIncrease,...})`. PERMANENT — do not remove.
- Billing `activeRes` seed uses `txFallbackName` for null-name reservations — looks up TX guest_name by `reservation_id` so billing rows never show `—` when reservation.guest_name is null.
- **PER-ROOM BOOKINGS — owner house rule (2026-06-14)**: a multi-room booking MUST be stored as ONE reservation PER ROOM, never one row holding `room_ids:[405,501,506]` under a single `status`. The single-status model caused the ABDULLAH BIN SAFAT incident — checking out room 405 flipped the whole reservation to CHECKED_OUT and released 501+506 too. `app/api/crm/reservation` `create` now FANS OUT one reservation per `room_ids[]` entry: per-room total = rate×nights, discount prorated to those totals (remainder on first room), paid pool fills each room's net (total−discount) in order (overpay on last). Invariant: children's total/discount/paid sum EXACTLY to the entered figures; single-room bookings are mathematically identical to the old single-insert path. NO schema migration. STILL single-row (fan out there too if reused): web-booking `confirm` action + `NewReservationModal` 401 anon-fallback (dead — anon write revoked). NEVER reintroduce a multi-room single reservation row.
- **REPORTS DAILY MOVEMENTS — DEDUPE BEFORE FILTER (2026-06-14)**: in `src/components/Reports.jsx` `Daily`, build the per-reservation deduped collection `_movesColl` FIRST (day-collection attributed to the FIRST movement row only — Check-In before Check-Out), THEN keep a movement row only if `dueOf(m)>0 || _movesColl[i]>0`, and slice `moves`+`moveColl` by the same `_keep` mask. NEVER filter on the raw `collectedFor(m)`: a same-open-day check-in+out guest's Check-Out row passes the raw check but renders blank (collection shown on its Check-In row) → "—/—/Settled" ghost rows the owner has repeatedly flagged. Same family as the BCF ghost-row rule. Verified 2026-06-14: drops 14 ghost rows (37→23) with all 17 Check-In collections preserved.
- **PAID-AMOUNT POLICY (owner-confirmed 2026-06-02)**: `reservations.paid_amount` IS the source of truth for due math (NOT the sum of transactions). This lets the Reservation Edit modal apply manual paid_amount overrides for offline-collected payments without inserting transactions. Trade-off: legacy edits can drift from the transaction ledger — but owner accepts this in exchange for fast manual reconciliation. DO NOT replace `+r.paid_amount||0` reads with canonical sums without explicit owner re-approval. See [[billing_canonical_anchor]] v3.6 for the history of this decision.
- **MODAL TOTAL MATCH LIST (2026-06-03)**: `ReservationDetail` modal's `totalAmt` MUST honor `res.total_amount` from the DB when the user has not modified dates or rooms. Old code did `computedTotal>0?computedTotal:(+res.total_amount||0)` which always preferred `ratesSum*nights` (e.g., ৳52,000) and silently discarded folio resyncs (Add Charge bumps to ৳58,880). Fix: compute `_isUserEditing` by comparing current `checkInDate`/`checkOut`/sorted `roomArr` against `res.check_in`/`res.check_out`/sorted `res.room_ids`. If user is NOT editing → use DB `total_amount` when > 0 (matches Reservations list `_resDue`). If user IS editing → recompute as `ratesSum*nights` so the live preview reflects the edit. Anti-pattern blacklisted: `computedTotal > 0 ? computedTotal : dbTotal` (always loses folios).
- **TWO-TABLE PAYMENT SYMMETRY**: `transactions` and `payment_transactions` are mirrors (same row IDs, same content, `notes` mirrors `type`). Writes should go to both; reads against either are equivalent; `_isRealPayment` matches both.
- **SMART FISCAL_DAY REMOVED (2026-06-02)**: `RecordPayModal._smartFiscalDay` now always returns `businessDate||todayStr()` regardless of reservation status. Payments collected today appear in today's BIZ DAY total even for checked-out stays. User can still back-date in the modal's DATE field if reconciling an offline payment. Old behavior (defaulting to check_out date for CHECKED_OUT) explicitly removed per owner instruction.
- **BILLING REPORT — A4 PORTRAIT SINGLE-PAGE (2026-06-03)**: Download Report uses `@page{size:A4 portrait;margin:5mm 7mm}`. Compressed to fit single A4 portrait on 2026-06-03 — body 8px, h1 14px, stat val 14px/700w, sec-hdr 10.5px/700w, table th 7.5px/700w, table td 8.5px, closing final 11.5px (৳ value 14px), pm pills 7px/600w. The "Collected" column was DROPPED from Collected Transactions (redundant after group-by-reservation fix made it == "Paid"); table is now 7 columns. Print stylesheet includes `text-rendering:geometricPrecision`, `font-feature-settings:'tnum' 1, 'lnum' 1`, darker `color:#15110D`. NEVER add back the "Collected" column or revert to landscape — past attempts caused multi-page sprawl. If a future overflow happens at 40+ guests, prefer dropping "Payment Method" column (consolidate into row tooltip).
- **DOWNLOAD REPORT NUMBERS MUST MATCH WEB BILLING & INVOICES (2026-06-02)**: PDF "Bill Total" column = `computeBill(r).total` (NET, post-discount) in BOTH the Collected Transactions and Pending Dues sections — NEVER raw `res.total_amount` (gross). PDF Collected Transactions "Paid" column = SUM of today's tx amounts grouped by reservation_id (mirrors web's filter=TODAY behavior) — NEVER lifetime `bill.paid`. Pending Dues "Paid" stays as lifetime `bill.paid` because the user wants to see partial historical payments against the outstanding balance. Bug source: previously `bill_total: bill ? ((+res.total_amount||0) || bill.sub) : 0` showed gross; web showed net via `computeBill.total`. (Originally fixed in `public/crm-src.jsx`; that file was deleted 2026-08-08 — the RULE still stands, enforce it in `app/billing/page.jsx` + `src/lib/printDocs.js`.)
- **PDF COLLECTED TRANSACTIONS — GROUP-BY-RESERVATION (2026-06-03)**: `enriched` must be built by grouping `realList` (today's txs) by `reservation_id` (or `guest_name|room_number` for orphans) and summing tx amounts into one PDF row per reservation. Without this, a reservation with multiple partial payments today (e.g. SADIA AHMED SUCHANA's ৳3,999 + ৳1) produces multiple rows — confusing for owners reading the report. Web BillingPage groups this way; PDF MUST match. Payment methods are aggregated as a unique-set comma-joined string (`Cash + bKash` when mixed). The previous per-tx `realList.map(tx => …)` pattern is anti-pattern and must not be reintroduced.
- **BOOKING CONFIRMATION PRINT — WHATSAPP QR + FULL-PAGE FLEX LAYOUT (2026-06-03)**: `printConfirmation()` uses `@page{size:A4 portrait;margin:8mm 10mm}` and a `@media print` block that makes `.page` a `display:flex;flex-direction:column;min-height:calc(297mm - 16mm)` container, with `.ftr{margin-top:auto}` pushing the WhatsApp-QR-bearing footer to the bottom of the A4 page so the layout fills the sheet elegantly instead of bunching at the top. Footer uses `align-items:center` so the left contact text vertically aligns with the right QR. Key sizes (print): body 12px, h1 21px, logo 54×54, doc-title 18px, .box padding 12×14, table th/td 9×11 (font 9/11.5), .totals 290px width with bal 14px/700w, .terms margin-top 22px/font 9.5px, .ftr font 9.5px/border-top .8px. QR is 68×68 in print (img fetched at 160×160 source for 300+ DPI sharpness). Print trigger is image-load-aware: counts all `<img>` `load`/`error` events and only calls `window.print()` once all images settle (+120ms buffer), with a 2.5s hard cap. NEVER revert to fixed `setTimeout(()=>print(), 350)` — QR sometimes hadn't fetched yet. NEVER remove the `min-height` + `margin-top:auto` pattern — it's what keeps the layout from collapsing to the top half of the page. Same QR pattern + full-page rule applied to `printInvoice` previously.
- After `git filter-repo`, run `git reflog expire --expire=now --all && git gc --prune=now` before pushing

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

## Build & Test

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Run `npx @claude-flow/cli@latest security scan` after security-related changes

## Facebook Integration (Automated Marketer Agent)

| Var | Value | Location |
|-----|-------|----------|
| `FACEBOOK_PAGE_TOKEN` | PAGE token (not USER token) | Vercel (all envs) + `.env.local` |
| `FACEBOOK_PAGE_ID` | `111521248040168` | Vercel (all envs) + `.env.local` |
| `INSTAGRAM_ACCESS_TOKEN` | PAGE-type token, scopes pages_show_list+instagram_basic+instagram_content_publish — **NEVER expires** (rotated 2026-07-05; debug_token confirms). Has NO pages_manage_posts/pages_read_engagement → NOT interchangeable with `FACEBOOK_PAGE_TOKEN` (and vice-versa: the FB page token has no IG scopes). Verified live: IG container create + media engagement read both work | Vercel (all envs) + `.env.local` |
| `INSTAGRAM_USER_ID` | `17841471779213123` (@hotel_fountainbd) — configured directly because system tokens cannot read the page→IG edge | Vercel (all envs) + `.env.local` |

- **Page:** Hotel Fountain (facebook.com/thehotelfountain, Shanwaz Ahmed account)
- **Token type:** PAGE — obtained via Graph API Explorer → User token → `/me/accounts` → copy Page Access Token → Extend to 60-day via token debugger
- **Expires:** NEVER (long-lived page token renewed 2026-07-04; debug_token confirms expires=never). Data-access window ends 2026-08-01 — engagement READS may need re-auth then; posting keeps working. Scopes: pages_manage_posts, pages_read_engagement, pages_show_list, business_management (no read_insights → engagement "reach" stays empty). Renewal procedure unchanged: Graph API Explorer on Shanwaz Ahmed account → update `ADD_FACEBOOK_TOKEN.bat` + Vercel env vars + `.env.local`. NEXT RE-ISSUE MUST ADD `instagram_basic` + `instagram_content_publish` scopes — IG business account @hotel_fountainbd (17841471779213123) linked 2026-07-04; the marketing-publisher IG branch stays dormant ("Instagram account not reachable") until the token carries those scopes
- **DO NOT use USER tokens** — `me/accounts` returns `data:[]` for personal profiles with no Business Page admin role. Always get a PAGE token from the Shanwaz Ahmed account (ID: 26709838978678716), not the "Hotel Fountain" personal profile (ID: 995130273017390)
- **App in dev mode** — `POST /me/accounts` (page creation via API) returns `(#100) Can only call this method on valid test users`. Cannot create pages via API; use Facebook UI.

## Git / Sandbox Invariants

- **NTFS index.lock**: `.git/*.lock` owned by Windows UID — cannot be deleted from Linux sandbox. All commits MUST originate from Windows PowerShell, not bash sandbox.
- **Staged deletions guard**: Before every `git commit`, run `git diff --cached --name-only` and verify no critical files (`.env.local`, `facebook_post.py`, `ADD_FACEBOOK_TOKEN.bat`, `ruflo.config.json`, batch scripts) are staged for deletion. Use `git restore --staged <file>` if caught.
- ~~crm.html truncation check~~ — **RETIRED 2026-08-08**: `public/crm.html` was deleted with the legacy SPA. The corresponding blocks in `scripts/guard-onedrive-truncation.sh` are inert (each is wrapped in `if [ -f "$F" ]`, so they self-skip). The F:-drive corruption risk itself is NOT retired — it still applies to every file you edit; verify with a host `Read` + NUL/UTF-8 check after any large edit.

## Lumea CRM — Active Key Architecture (updated 2026-07-02)

| Var | Format | Location |
|-----|--------|----------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` (NEW API key format) | Vercel (all envs) |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` (NEW API key format) | Vercel (all envs) |
| `BREVO_API_KEY` | `xkeysib-...` | Vercel (encrypted) |

- **Option B migration is DONE** — verified 2026-07-02: both production and preview Vercel envs carry `sb_publishable_*`/`sb_secret_*`. The 2026-05-12 "legacy HS256 re-enabled" note is OBSOLETE; do not expect `eyJ...` keys.
- **Consequence for custom JWTs**: PostgREST no longer verifies legacy-HS256 tokens (`PGRST301 No suitable key or wrong key type`). Minting per-tenant JWTs (`TENANT_JWT_MODE`, `src/lib/tenantJwt.ts`) requires an ACTIVE HS256 shared secret in Supabase Dashboard → Settings → JWT Keys plus `TENANT_JWT_FORCE=1`; otherwise tenantJwt fails safe to the service role. See docs/MULTI_TENANT_BLUEPRINT_REVIEW.md.
- Supabase project ref: `mynwfkgksqqwlqowlscj` (Bridge Booking)
- Vercel project: `prj_BvTsXnp2GWgXsp6smJOXAm5gLgdr` / team: `team_l1SAECyZJ9giIw4o2SGxjpqd`
- **ANTHROPIC_API_KEY** still needed in Vercel env vars — CEOAuditor agent will 500 without it.

## Vercel Build Script Rule (added 2026-05-12)

- **SUPERSEDED 2026-08-08.** `"build"` is now plain `"next build"` — the `build:crm` step (Babel + Terser + bump-cache over the legacy SPA) was removed with `crm-src.jsx`. `"build"` and `"vercel-build"` are therefore identical, and the original hazard (Vercel falling back to `"build"` → `build:crm` → missing `babel.crm.json`) no longer exists.
- `"vercel-build": "next build"` is still present and harmless; keeping it is fine, and removing it is now also safe. `babel.crm.json` and the `@babel/cli`/`terser` devDependencies are unused leftovers — safe to delete in a later cleanup.

## Next.js app/ vs src/app/ Precedence Rule (added 2026-05-12)

- When an `app/` directory exists at the repo root, Next.js App Router uses it **exclusively**.
- `src/app/` routes are **completely ignored** by the deployed app when `app/` exists at root.
- All API routes (agents, orchestrate, actions) MUST be duplicated into `app/api/` — the `src/app/api/` copies are invisible to production.
- Symptom of violation: route returns 404 or 500 even though the file exists in `src/app/api/`. Solution: copy the route file to the equivalent path under `app/api/`.
- Commit history: `ac01f7b` added `app/api/agents/outreach-bot/route.ts` for this reason.

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Agent tool for spawning agents, not just MCP
- ALWAYS spawn ALL agents in ONE message with full instructions via Agent tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Agent tool
- Never use CLI tools alone for execution — Agent tool agents do the actual work
- MUST call CLI tools AND Agent tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (var→const, add types) — Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- For Tier 1 simple transforms, use Edit tool directly — no LLM agent needed

## Swarm Configuration & Anti-Drift

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

## Swarm Execution Rules

- ALWAYS use `run_in_background: true` for all Agent tool calls
- ALWAYS put ALL Agent calls in ONE message for parallel execution
- After spawning, STOP — do NOT add more tool calls or check status
- Never poll agent status repeatedly — trust agents to return
- When agent results arrive, review ALL results before proceeding

## V3 CLI Commands

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization |
| `agent` | 8 | Agent lifecycle management |
| `swarm` | 6 | Multi-agent swarm coordination |
| `memory` | 11 | AgentDB memory with HNSW search |
| `task` | 6 | Task creation and lifecycle |
| `session` | 7 | Session state management |
| `hooks` | 17 | Self-learning hooks + 12 workers |
| `hive-mind` | 6 | Byzantine fault-tolerant consensus |

### Quick CLI Examples

```bash
npx @claude-flow/cli@latest init --wizard
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query "authentication patterns"
npx @claude-flow/cli@latest doctor --fix
```

## Available Agents (16 Roles + Custom)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`

### GitHub & Repository
`pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

Any string can be used as a custom agent type — these are the typed roles with specialized behavior.

## Memory & Vector Search

### MCP Tools (use via ToolSearch to discover)

| Tool | Description |
|------|-------------|
| `memory_store` | Store value with ONNX 384-dim vector embedding |
| `memory_search` | Semantic vector search by query |
| `memory_retrieve` | Get entry by key |
| `memory_list` | List entries in namespace |
| `memory_delete` | Delete entry |
| `memory_import_claude` | Import Claude Code memories into AgentDB (allProjects=true for all) |
| `memory_search_unified` | Search across ALL namespaces (Claude + AgentDB + patterns) |
| `memory_bridge_status` | Show bridge health, vectors, SONA, intelligence |

### CLI Commands

```bash
# Store with vector embedding
npx @claude-flow/cli@latest memory store --key "pattern-auth" --value "JWT with refresh" --namespace patterns

# Semantic search
npx @claude-flow/cli@latest memory search --query "authentication patterns"

# Import all Claude Code memories into AgentDB
node .claude/helpers/auto-memory-hook.mjs import-all
```

### Claude Code ↔ AgentDB Bridge

Claude Code auto-memory files (`~/.claude/projects/*/memory/*.md`) are automatically imported into AgentDB with ONNX vector embeddings on session start. Use `memory_search_unified` to search across both stores.

## Key MCP Tools (314 available — use ToolSearch to discover)

### Most Used Tools

| Category | Tools | What They Do |
|----------|-------|-------------|
| **Memory** | `memory_store`, `memory_search`, `memory_search_unified` | Store/search with ONNX vector embeddings |
| **Claude Bridge** | `memory_import_claude`, `memory_bridge_status` | Import Claude memories into AgentDB |
| **Swarm** | `swarm_init`, `swarm_status`, `swarm_health` | Multi-agent coordination |
| **Agents** | `agent_spawn`, `agent_list`, `agent_status` | Agent lifecycle |
| **Hive-Mind** | `hive-mind_init`, `hive-mind_spawn`, `hive-mind_consensus` | Byzantine/Raft consensus |
| **Hooks** | `hooks_route`, `hooks_session-start`, `hooks_post-task` | Task routing + learning |
| **Workers** | `hooks_worker-list`, `hooks_worker-dispatch` | 12 background workers |
| **Security** | `aidefence_scan`, `aidefence_is_safe` | Prompt injection detection |
| **Intelligence** | `hooks_intelligence`, `neural_status` | Pattern learning + SONA |

### Swarm Capabilities

- **Topologies**: hierarchical (anti-drift), mesh, ring, star, adaptive
- **Consensus**: Raft (leader-based), Byzantine (PBFT), Gossip (eventual)
- **Hive-Mind**: Queen-led coordination with spawn, broadcast, consensus voting, shared memory
- **12 Background Workers**: audit, optimize, testgaps, map, deepdive, document, refactor, benchmark, ultralearn, consolidate, predict, preload

### Memory Capabilities

- **ONNX Embeddings**: all-MiniLM-L6-v2, 384 dimensions — real neural vectors
- **DiskANN**: SSD-friendly vector search (8,000x faster insert than HNSW, perfect recall at 1K)
- **sql.js**: Cross-platform SQLite (WASM, no native compilation)
- **Claude Code Bridge**: Auto-imports MEMORY.md files into AgentDB on session start
- **Unified Search**: `memory_search_unified` searches Claude memories + AgentDB + patterns
- **SONA Learning**: Trajectory recording → pattern extraction → file persistence

### How to Discover Tools

Use ToolSearch to find specific tools:
```
ToolSearch("memory search")     → memory_store, memory_search, memory_search_unified
ToolSearch("swarm")             → swarm_init, swarm_status, swarm_health, swarm_shutdown
ToolSearch("hive consensus")    → hive-mind_consensus, hive-mind_status
ToolSearch("+aidefence")        → aidefence_scan, aidefence_is_safe, aidefence_has_pii
```

## Quick Setup

```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest doctor --fix
```

## Claude Code vs MCP Tools

- **Claude Code Agent tool** handles execution: agents, file ops, code generation, git
- **MCP tools** (via ToolSearch) handle coordination: swarm, memory, hooks, routing, hive-mind
- **CLI commands** (via Bash) are the same tools with terminal output
- Use `ToolSearch("keyword")` to discover available MCP tools

## Support

- Documentation: https://github.com/ruvnet/ruflo
- Issues: https://github.com/ruvnet/ruflo/issues

---

## Updated: 2026-05-04

### Ruflo MCP
- Always running via PM2 (lumea-ruflo). Check: `pm2 status`
- Recreate 5 agents at session start � ask Claude to do it

### DB Canonical Rules
- discount > discount_amount (dropped, synced via trigger)
- room_ids[] > room_id (dropped, synced via trigger)  
- check_in/check_out > check_in_time/check_out_time (dropped)
- Statuses always UPPERCASE (enforced at DB level)

### File Locations
- CRM: `app/crm/*` (routes) + `src/components/*` (UI). The old `public/crm.html` SPA was DELETED 2026-08-08 — see the LEGACY SPA DELETED rule at the top of this file.
- Ruflo wrapper: Hotel Fountain BD CRM/ruflo-mcp.js

### Active DB Objects
- View: reservation_billing_summary
- Function: compute_bill(uuid)
- Triggers: trg_sync_compat_columns, trg_checkout_settlement_check, trg_rooms_status_upper, trg_reservations_status_upper

### Additional DAA Agents (added 2026-05-04)
| `lumea-housekeeping` | Housekeeping & Room Turnover | systems |
| `lumea-reports` | Reports & Analytics | convergent |
| `lumea-alerts` | Alerts & Notifications | critical |
| `lumea-leads` | Leads & B2B Pipeline | divergent |
| `lumea-audit` | Security & Audit | critical |

### Full Agent Roster (10 total) � recreate all at session start
Say "start agents" to Claude � boots all 10 in ~20 seconds.

## RUFLO AGENT SWARM (10 Agents � recreate each session with "start agents")
| ID | Domain | Pattern |
|---|---|---|
| `lumea-billing` | Billing & Folio | critical |
| `lumea-rooms` | Room Matrix | systems |
| `lumea-reservations` | Reservations | adaptive |
| `lumea-db` | Database & RLS | convergent |
| `lumea-guests` | Guest Ledger | divergent |
| `lumea-housekeeping` | Room Turnover | systems |
| `lumea-reports` | Analytics & Closing | convergent |
| `lumea-alerts` | Overdue & Notifications | critical |
| `lumea-leads` | B2B Pipeline | divergent |
| `lumea-audit` | Security Monitoring | critical |

---

## RUFLO AGENT SWARM (10 Agents � recreate each session with "start agents")

| ID | Domain | Pattern | DB Objects |
|---|---|---|---|
| `lumea-billing` | Billing & Folio | critical | compute_bill(), reservation_billing_summary |
| `lumea-rooms` | Room Matrix | systems | status triggers, CHECK constraints |
| `lumea-reservations` | Reservations | adaptive | compat columns, sync trigger |
| `lumea-db` | Database & RLS | convergent | RLS policies, indexes |
| `lumea-guests` | Guest Ledger | divergent | unique email index, ledger backfill |
| `lumea-housekeeping` | Room Turnover | systems | auto-DIRTY/AVAILABLE triggers, dashboard view |
| `lumea-reports` | Analytics | convergent | daily_revenue_summary, occupancy_stats, monthly_revenue_summary |
| `lumea-alerts` | Overdue & Notifications | critical | overdue_payment_alerts view, log_overdue_alerts() |
| `lumea-leads` | B2B Pipeline | divergent | leads_pipeline, b2b_partner_summary views |
| `lumea-audit` | Security Monitoring | critical | rls_audit, open_access_audit views |

## ACTIVE DB VIEWS (all SECURITY INVOKER)
- reservation_billing_summary � billing source of truth
- overdue_payment_alerts � live unpaid checkout tracker
- daily_revenue_summary � per-day revenue breakdown
- occupancy_stats � room occupancy by date
- monthly_revenue_summary � monthly P&L rollup
- housekeeping_dashboard � pending room tasks
- leads_pipeline � lead health tracker
- b2b_partner_summary � agency performance
- rls_audit � RLS policy coverage
- open_access_audit � open qual:true policy detector

## ACTIVE DB FUNCTIONS & TRIGGERS
- compute_bill(uuid) � canonical billing calc
- log_overdue_alerts() � snapshot overdue to notifications_log
- trg_sync_compat_columns � maps old frontend cols to canonical
- trg_checkout_settlement_check � warns on partial checkout
- trg_rooms_status_upper � enforces UPPERCASE room status
- trg_reservations_status_upper � enforces UPPERCASE reservation status
- trg_auto_housekeeping � creates DIRTY + task on checkout
- trg_room_available_on_clean � sets AVAILABLE when task completed

---

## REVENUE CALCULATION RULES (2026-05-07)

### Ghost-BCF Filter — MANDATORY for all revenue aggregations

Any code that iterates `transactions` to compute revenue MUST apply this filter before the loop:

```js
const activeTx = todayTxs.filter(t => {
  if (t.type === 'Balance Carried Forward') {
    const res = reservations?.find(r =>
      (r.room_ids||[]).some(id => String(id) === String(t.room_number)) ||
      String(r.room_number) === String(t.room_number))
    if (res?.status === 'CHECKED_OUT') {
      const due = Math.max(0, (+res.total_amount||0) - (+res.discount_amount||+res.discount||0) - (+res.paid_amount||0))
      if (due <= 0) return false
    }
    return true
  }
  return true
})
```

**Why:** BCF transactions for CHECKED_OUT rooms with zero balance are "ghost" entries — they appear in today's ledger but represent settled-and-closed folios. Including them double-counts settled amounts (caused ৳4,000 phantom in the ৳13,600 incident pattern).

**Affects:** Dashboard `todayRev`, BillingPage `todayRevenue` (already uses `activeLedgerTx`), any future analytics aggregations.

### Build Pipeline — RETIRED 2026-08-08
- The `crm-src.jsx` → Babel → Terser → `crm-bundle.js` pipeline is gone with the legacy SPA. `npm run build` is plain `next build`.
- **Still true, applies to ALL files:** for very large files on the F: mount, prefer Python string replacement over the Edit tool (truncation risk at the Windows mount boundary), and verify after with a NUL/UTF-8/EOF check.
- **Commit:** PowerShell only — sandbox bash creates unremovable `.git/*.lock` files.
