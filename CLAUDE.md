# Claude Code Configuration - RuFlo V3

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm â€” wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- After any bash `cat >>` append to a .tsx/.ts file, immediately verify with `tail -5` and `tsc --noEmit` â€” appends frequently corrupt files silently
- After any Edit to `public/crm.html`, grep for `ReactDOM.createRoot` AND `</html>` before `git add` â€” truncation regression check
- All git commits MUST originate from Windows PowerShell, NOT from the bash sandbox (`.git/*.lock` files are owned by Windows UID and cannot be removed from sandbox)
- After `git filter-repo`, run `git reflog expire --expire=now --all && git gc --prune=now` before pushing

## File Organization

- NEVER save to root folder â€” use the directories below
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

- **Page:** Hotel Fountain (facebook.com/thehotelfountain, Shanwaz Ahmed account)
- **Token type:** PAGE â€” obtained via Graph API Explorer â†’ User token â†’ `/me/accounts` â†’ copy Page Access Token â†’ Extend to 60-day via token debugger
- **Expires:** 2026-06-30 â€” renew by running Graph API Explorer on Shanwaz Ahmed account, re-extending, updating `ADD_FACEBOOK_TOKEN.bat` + Vercel env vars
- **DO NOT use USER tokens** â€” `me/accounts` returns `data:[]` for personal profiles with no Business Page admin role. Always get a PAGE token from the Shanwaz Ahmed account (ID: 26709838978678716), not the "Hotel Fountain" personal profile (ID: 995130273017390)
- **App in dev mode** â€” `POST /me/accounts` (page creation via API) returns `(#100) Can only call this method on valid test users`. Cannot create pages via API; use Facebook UI.

## Git / Sandbox Invariants

- **NTFS index.lock**: `.git/*.lock` owned by Windows UID â€” cannot be deleted from Linux sandbox. All commits MUST originate from Windows PowerShell, not bash sandbox.
- **Staged deletions guard**: Before every `git commit`, run `git diff --cached --name-only` and verify no critical files (`.env.local`, `facebook_post.py`, `ADD_FACEBOOK_TOKEN.bat`, `ruflo.config.json`, batch scripts) are staged for deletion. Use `git restore --staged <file>` if caught.
- **crm.html truncation check**: After any Edit to `public/crm.html`, grep for `ReactDOM.createRoot` AND `</html>` before `git add`. Missing either = truncation regression.

## Lumea CRM â€” Active Key Architecture (updated 2026-05-01)

| Var | Format | Location |
|-----|--------|----------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | Vercel (sensitive) |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` | Vercel (encrypted) |
| `BREVO_API_KEY` | `xkeysib-...` | Vercel (encrypted) |

- Legacy HS256 JWT anon/service_role keys: **DISABLED + REVOKED** (2026-05-01). Do NOT re-enable.
- `createClient(url, key)` works identically with both old JWT and new `sb_*` formats â€” no code change needed when rotating.
- Supabase project ref: `mynwfkgksqqwlqowlscj` (Bridge Booking)
- Vercel project: `prj_BvTsXnp2GWgXsp6smJOXAm5gLgdr` / team: `team_l1SAECyZJ9giIw4o2SGxjpqd`

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Agent tool for spawning agents, not just MCP
- ALWAYS spawn ALL agents in ONE message with full instructions via Agent tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Agent tool
- Never use CLI tools alone for execution â€” Agent tool agents do the actual work
- MUST call CLI tools AND Agent tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (varâ†’const, add types) â€” Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- For Tier 1 simple transforms, use Edit tool directly â€” no LLM agent needed

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
- After spawning, STOP â€” do NOT add more tool calls or check status
- Never poll agent status repeatedly â€” trust agents to return
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

Any string can be used as a custom agent type â€” these are the typed roles with specialized behavior.

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

### Claude Code â†” AgentDB Bridge

Claude Code auto-memory files (`~/.claude/projects/*/memory/*.md`) are automatically imported into AgentDB with ONNX vector embeddings on session start. Use `memory_search_unified` to search across both stores.

## Key MCP Tools (314 available â€” use ToolSearch to discover)

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

- **ONNX Embeddings**: all-MiniLM-L6-v2, 384 dimensions â€” real neural vectors
- **DiskANN**: SSD-friendly vector search (8,000x faster insert than HNSW, perfect recall at 1K)
- **sql.js**: Cross-platform SQLite (WASM, no native compilation)
- **Claude Code Bridge**: Auto-imports MEMORY.md files into AgentDB on session start
- **Unified Search**: `memory_search_unified` searches Claude memories + AgentDB + patterns
- **SONA Learning**: Trajectory recording â†’ pattern extraction â†’ file persistence

### How to Discover Tools

Use ToolSearch to find specific tools:
```
ToolSearch("memory search")     â†’ memory_store, memory_search, memory_search_unified
ToolSearch("swarm")             â†’ swarm_init, swarm_status, swarm_health, swarm_shutdown
ToolSearch("hive consensus")    â†’ hive-mind_consensus, hive-mind_status
ToolSearch("+aidefence")        â†’ aidefence_scan, aidefence_is_safe, aidefence_has_pii
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
- Recreate 5 agents at session start — ask Claude to do it

### DB Canonical Rules
- discount > discount_amount (dropped, synced via trigger)
- room_ids[] > room_id (dropped, synced via trigger)  
- check_in/check_out > check_in_time/check_out_time (dropped)
- Statuses always UPPERCASE (enforced at DB level)

### File Locations
- CRM: Hotel Fountain BD CRM/public/crm.html
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

### Full Agent Roster (10 total) — recreate all at session start
Say "start agents" to Claude — boots all 10 in ~20 seconds.

## RUFLO AGENT SWARM (10 Agents — recreate each session with "start agents")
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

## RUFLO AGENT SWARM (10 Agents — recreate each session with "start agents")

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
- reservation_billing_summary — billing source of truth
- overdue_payment_alerts — live unpaid checkout tracker
- daily_revenue_summary — per-day revenue breakdown
- occupancy_stats — room occupancy by date
- monthly_revenue_summary — monthly P&L rollup
- housekeeping_dashboard — pending room tasks
- leads_pipeline — lead health tracker
- b2b_partner_summary — agency performance
- rls_audit — RLS policy coverage
- open_access_audit — open qual:true policy detector

## ACTIVE DB FUNCTIONS & TRIGGERS
- compute_bill(uuid) — canonical billing calc
- log_overdue_alerts() — snapshot overdue to notifications_log
- trg_sync_compat_columns — maps old frontend cols to canonical
- trg_checkout_settlement_check — warns on partial checkout
- trg_rooms_status_upper — enforces UPPERCASE room status
- trg_reservations_status_upper — enforces UPPERCASE reservation status
- trg_auto_housekeeping — creates DIRTY + task on checkout
- trg_room_available_on_clean — sets AVAILABLE when task completed
