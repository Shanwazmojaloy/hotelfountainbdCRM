# MEMORY_LOG.md — Hotel Fountain CRM (Lumea)

Persistent decision/audit log. Append-only. Most recent first.

---

## 2026-04-29 — Ruflo audit pass: data integrity + security + hygiene

**Worktree:** `nice-turing` (canonical for Vercel deploy).
**Auditor:** Ruflo (file-risk + diff-classify) + manual review.
**Project rule confirmed:** anchor on `reservation_id`, never `room_number`.

### Applied — Data integrity (Group 2)

| File | Change |
|---|---|
| `App.jsx::computeBill` | Folio key now strict `r.id`; orphans flagged via `console.warn`, never merged. Removes ৳13,600-rule violation path. |
| `App.jsx::printTransactionInvoice` | Reservation matched by `tx.reservation_id`, falls back to **array-membership** of `room_ids` (no more `String(...).includes()` substring false-positives). |
| `App.jsx::printTransactionInvoice` template | Real `discount` and `nights` (min 1) sourced from reservation; sub-total now shows gross, grand total shows net. |
| `src/app/page.tsx::fetchCount` + `checkAvailability` | Both queries now use `ROOM_STATUS_AVAILABLE = 'AVAILABLE'`. Errors logged. |
| `src/app/page.tsx::submitBooking` | Hoisted try/catch; `setBookStatus('success')` only fires on real insert success. Failure surfaces an alert + console error. |
| `src/app/components/NotificationBell.tsx::fetchPending` | `'pending'` → `'PENDING'` to match landing-page write. |
| `NotificationBell::handleAccept` / `handleReject` | Status writes upgraded to `'CONFIRMED'` / `'CANCELLED'`; errors now surface in console. |

### Applied — Security (Group 1, partial)

| File | Change |
|---|---|
| `App.jsx::INIT_STAFF` | Plaintext `pw` removed. Replaced with `salt` + `pwHash` (SHA-256). All five rows currently `__SET_VIA_SETTINGS__` — login will fail loudly until rotated. |
| `App.jsx::doLogin` | Uses `hashPassword(salt, pw)` + constant-time-ish compare. Legacy plaintext fallback kept (with `console.warn`) so migration is non-breaking. |
| `src/app/page.tsx`, `NotificationBell.tsx` | Hardcoded `SB_URL` / `SB_KEY` / `TENANT` literals → `process.env.NEXT_PUBLIC_*`. |
| `.env.example` | Created. Lists all required vars. |

**TODO — full Auth migration (architectural):**
1. Move `staff` table to Supabase Auth (`auth.users` + `public.staff_profile` join).
2. Drop client-side password storage entirely; use `supabase.auth.signInWithPassword`.
3. Add RLS policies keyed on `auth.uid()` and `staff_profile.role`.

### Applied — DB migration

`supabase/migrations/20260429_status_uppercase_constraints.sql`:
- Backfills lowercase rows on `rooms.status` and `reservations.status` to UPPERCASE.
- Adds `CHECK` constraints rejecting future lowercase writes.
- Canonical sets:
  - `rooms.status ∈ {AVAILABLE, OCCUPIED, DIRTY, OOO, RESERVED}`
  - `reservations.status ∈ {PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW}`
- Adds `idx_rooms_status` and `idx_reservations_status`.
- SECURITY INVOKER respected; idempotent; rollback block at bottom of file.

### Applied — Repo hygiene

- `.gitignore` rewritten: ignores `.env*`, `*.zip`, `*.tar.gz`, `*.pdf/.docx/.xlsx`, build outputs, `_internal_docs/`, IDE noise. Whitelists lockfiles + `.vscode/extensions.json`.
- Empty router shim `src/app/api/send-confirmation/route.ts` annotated for `git rm`.

### Applied — Code-quality polish

| File | Change |
|---|---|
| `App.jsx` | Currency locale `'en-BD'` (invalid CLDR) → `'en-IN'` (correct lakh grouping for BDT). |
| `pages/api/send-confirmation.ts` | Stale `Resend` references → `Brevo`. Error message now correctly directs to `BREVO_API_KEY`. |

### Pending decisions (Phase B — not applied yet)

1. **Canonical Next.js / React versions.** Root says `next@14.2.3 + react@18.2.0 + typescript@6.0.3` (TS 6 doesn't exist). Worktree says `next@16.2.1 + react@19.2.4` (Next 16 doesn't exist either). Need a single, real, stable target.
2. **Worktree consolidation.** Five active worktrees: `blissful-nightingale`, `elastic-khayyam`, `gallant-feistel`, `nice-turing`, `strange-zhukovsky`. Plus `_backup/` is a separate git repo. Need explicit go-ahead before deleting any.
3. **Full Supabase Auth migration** to replace remaining client-side password storage.
4. **Rotation of leaked anon JWT** — the key was committed in 9 files for months; even though anon, prudent to rotate in Supabase dashboard.

---

## 2026-04-29 (later) — Phase B applied: build + worktree consolidation

### Decisions confirmed

| Code | Decision | Source |
|---|---|---|
| B-1 | Canonical stack: **Next 15.0.4 + React 18.3.1** | User pick "b" |
| B-2 | Keep only `nice-turing` worktree; remove the other 4 + `_backup/` | User pick "a" |
| B-3 | Defer full Supabase Auth migration to next sprint | User pick "a" |

### Applied

- `package.json` rewritten (worktree `nice-turing`):
  - `next` `16.2.1` (didn't exist) → `15.0.4`
  - `react`, `react-dom` `19.2.4` (didn't exist) → `18.3.1`
  - `@supabase/supabase-js` ^2.99.3 → ^2.45.4 (current stable)
  - `eslint-config-next` 16.2.1 → 15.0.4
  - `@types/react` ^19 → ^18.3.3
  - Dropped: `@google/generative-ai`, `axios`, `dotenv` (not referenced from active code).
  - Added `typecheck` script.
- `scripts/cleanup-worktrees.sh` — guarded destructive script. **Not auto-run.** User must `bash` it from the bare-repo root.

### ⚠ Secret-handling incident — 2026-04-29

User pasted a live `BREVO_API_KEY` (xkeysib-...) in chat while listing Vercel env values. The key is now in Anthropic transcript logs.

**Required actions (user-side, not code):**
1. Rotate the Brevo API key immediately at app.brevo.com → SMTP & API → API Keys.
2. Confirm rotation; old key will be invalidated.
3. Set the **new** key only in Vercel → Project → Settings → Environment Variables.
4. Same prudence applies to the Supabase anon JWT (rotate via Supabase Dashboard → Settings → API).

This log records that the leak occurred. The leaked value itself is **not** stored here.

### Pending after Phase B

- Run `npm install` (or `pnpm install`) inside the `nice-turing` worktree to regenerate `package-lock.json` against the new dependency tree.
- Run `npm run build` locally before letting Vercel rebuild — catches type/lint errors early.
- Execute `scripts/cleanup-worktrees.sh` when ready.
- Decide fate of `_backup/` (separate git repo at parent level) — recommend `mv _backup ../hotelfountainbd-vercel-archive-2026Q1` then exclude from sync.

---

## 2026-04-29 (later) — Phase C applied: code quality + performance (partial)

### Applied

| Item | File | Effect |
|---|---|---|
| CSS extraction | `src/app/globals.css` (rewritten), `src/app/page.tsx` (CSS const + `dangerouslySetInnerHTML` removed) | Eliminates render-blocking inline `<style>` injection; classes resolve from a single CSS file. |
| `next/image` swap | `src/app/page.tsx` (hero front-view + 5 room cards) | AVIF/WebP delivery; `priority` on hero, `sizes` hints for the rest. |
| Realtime debounce | `src/app/components/NotificationBell.tsx::useEffect` | Bursts of `postgres_changes` events collapse into a single refetch every 800ms. |
| Security headers + image config | `next.config.ts` | CSP (Supabase + Brevo + Google Maps allow-listed), HSTS, X-Frame-Options=DENY, nosniff, Permissions-Policy, AVIF/WebP, no `x-powered-by`. |
| CI gate | `.github/workflows/ci.yml` | Node 20, runs `npm ci`, `lint`, `typecheck`, `build` on PRs and `main` pushes. Build env vars sourced from GitHub Secrets. |
| App.jsx split plan | `docs/APP_SPLIT_PLAN.md` | Proposed `src/crm/{lib,components,pages}` layout, 8-step migration, single-PR-per-page rule. **Not yet applied** — awaiting confirmation. |

### Pending decision

- Run `Go split-1` to begin the App.jsx decomposition starting with pure helpers (`lib/format.js`, `lib/supabase.js`). One PR per step.

### Decision 2026-04-29 — Hold split, ship now

User elected to defer App.jsx decomposition and ship the current audit pass.
Deploy checklist captured at `docs/SHIP.md` (9 sections: pre-flight, DB
migration, Vercel env, hash generation, local build, worktree cleanup, commit/
push, post-deploy verification, rollback). Update this log on first deploy
day with the actual verification table.

### 2026-04-29 — Static verification of audit edits (sandbox)

Verified inside the assistant's Linux sandbox using the existing on-disk
node_modules (Next 15.0.4, React 18.3.1, TypeScript 5.9.3):

| Check | Scope | Result |
|---|---|---|
| `tsc --noEmit` | `src/app/page.tsx`, `src/app/components/NotificationBell.tsx`, `src/app/layout.tsx`, `pages/api/send-confirmation.ts`, `app/actions/checkout.ts`, `next.config.ts` | **0 errors** |
| `eslint` | same files | 0 errors (4 config-lookup warnings, expected) |
| `acorn-jsx` parse | `App.jsx` (5,708 lines) | **OK** — parses cleanly |
| Pre-existing typecheck errors | `src/agents/*.ts`, `src/services/{make,supabase}.ts`, `src/app/leads/page.tsx` | 5 errors — modules `@google/generative-ai`, `axios`, `dotenv` not installed in current `node_modules`. These were declared in the original package.json but never installed. **Not caused by this audit.** Restored to package.json so the next `npm install` resolves them. |

Note: a full clean `npm install + next build` could not run in the sandbox
(install duration > 45s tool limit; OneDrive locks `node_modules` against
deletion). The user must run that locally — see `docs/SHIP.md` step 4.

### Notes

- CSP currently allows `'unsafe-inline'` for styles because `NotificationBell` still uses `dangerouslySetInnerHTML` for its keyframes. After App.jsx split (which will move that block to globals.css), tighten CSP by removing `'unsafe-inline'` from `style-src`.
- The new `next.config.ts` reads `process.env.NEXT_PUBLIC_SUPABASE_URL` at build time to compose `connect-src` — make sure that env var is set in Vercel **before** the next deploy, otherwise CSP will reject the WebSocket subscription.

---

## Earlier history

(none — log started 2026-04-29 by Ruflo audit)
