# SHIP.md — Hotel Fountain CRM (Lumea)

Deploy checklist for the 2026-04-29 Ruflo audit pass. Work top → bottom.
Each step is independently rollback-safe unless marked ⚠ DESTRUCTIVE.

---

## 0. Pre-flight (5 min)

| ✓ | Step | Command / Where |
|---|---|---|
| ☐ | Rotate Brevo API key | app.brevo.com → SMTP & API → API Keys → revoke old, create new |
| ☐ | Rotate Supabase anon JWT | Supabase Dashboard → Settings → API → "Reset" anon key |
| ☐ | Confirm both old keys are dead (try a curl against each — should 401) | `curl -H "apikey: OLD_KEY" $URL/rest/v1/rooms?select=id` |

---

## 1. Database migration (5 min)

| ✓ | Step | Where |
|---|---|---|
| ☐ | Open Supabase SQL Editor | Supabase Dashboard → SQL Editor → New Query |
| ☐ | Paste contents of `supabase/migrations/20260429_status_uppercase_constraints.sql` | — |
| ☐ | Run | Expected: `BEGIN`, 5 statements, `COMMIT`. Zero errors. |
| ☐ | Verify | `SELECT DISTINCT status FROM reservations; SELECT DISTINCT status FROM rooms;` — every value UPPERCASE |
| ☐ | Confirm CHECK rejects lowercase | `INSERT INTO reservations(status) VALUES ('pending');` should error `violates check constraint` |

---

## 2. Vercel environment variables (3 min)

Vercel → Project → Settings → Environment Variables. Add for **Production + Preview + Development**:

| Key | Value source | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key (the **rotated** one from step 0) | yes |
| `NEXT_PUBLIC_TENANT_ID` | `46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8` | yes |
| `BREVO_API_KEY` | Brevo (the **rotated** one from step 0) | **no** — server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (only if edge functions need it) | **no** — server-only |

⚠ Do not paste these values in chat, Slack, or commit messages.

---

## 3. Generate staff password hashes (5 min)

Login is broken until each `INIT_STAFF` row has a real `pwHash`. For each staff row:

1. Open the deployed site in Chrome → DevTools → Console.
2. Paste (substituting the row's `salt` and the new password):
   ```js
   const SALT = 'hf-owner-2026';
   const PW   = 'replace-with-new-password';
   const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SALT}:${PW}`));
   [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
   ```
3. Copy the 64-char hex output, paste into `App.jsx` at the matching `pwHash:` field.
4. Repeat for all 5 rows.
5. Commit. Never commit a plaintext password.

(Long-term: this whole flow goes away when full Supabase Auth lands — see MEMORY_LOG.)

---

## 4. Local build verification (10 min)

```bash
cd "Hotel Fountain BD CRM/.claude/worktrees/nice-turing"

# Clean install against the rewritten package.json
rm -rf node_modules package-lock.json .next

# Mirror Vercel env locally
cp .env.example .env.local
# Edit .env.local with the rotated values from step 0/2

npm install                  # expect zero peer-dep warnings on Next 15 + React 18.3
npm run lint                 # expect zero errors
npm run typecheck            # expect zero errors
npm run build                # expect "Compiled successfully" + route summary

npm run start                # smoke test at http://localhost:3000
```

Smoke checks before pushing:

| ✓ | Path | Expected |
|---|---|---|
| ☐ | `/` | Hero loads, front-view image visible, room cards visible (next/image renders WebP/AVIF) |
| ☐ | `/` → "Check Availability" | Returns rooms or fallback list — no console errors |
| ☐ | `/` → "Book This Room" → submit invalid email | Alert appears (no fake success) |
| ☐ | `/crm.html` | CRM loads, login form rejects empty/wrong credentials |
| ☐ | `/crm.html` login with hashed creds from step 3 | Logs in, role-appropriate pages visible |
| ☐ | DevTools Network tab | `connect-src` requests succeed; no CSP violations in console |

---

## 5. Worktree consolidation (⚠ DESTRUCTIVE — only when builds pass)

Removes 4 stale worktrees. Git branches survive — you can recreate any worktree later.

```bash
cd "Hotel Fountain BD CRM"             # bare-repo root
bash .claude/worktrees/nice-turing/scripts/cleanup-worktrees.sh
```

Type `YES` at the prompt. Then decide on `_backup/`:

```bash
# Optional: archive the legacy backup folder out of this project
cd ..
mv _backup ../hotelfountainbd-vercel-archive-2026Q1
```

---

## 6. Commit + push (3 min)

```bash
cd "Hotel Fountain BD CRM/.claude/worktrees/nice-turing"

git add -A
git status                   # verify only intended files staged

git commit -m "chore(audit): Ruflo pass — data integrity, security, deps, hygiene, perf

- enforce reservation_id anchor in computeBill + printTransactionInvoice
- canonical UPPERCASE status; CHECK constraints in supabase migration
- env-var Supabase client; .env.example added
- INIT_STAFF salted SHA-256 hashes; legacy plaintext fallback
- Next 15.0.4 + React 18.3.1; drop dotenv/axios/@google/generative-ai
- next/image, CSS extraction, realtime debounce
- CSP + HSTS + X-Frame headers; CI workflow
- MEMORY_LOG + APP_SPLIT_PLAN docs"

git push origin HEAD
```

Vercel auto-deploys. Watch the build at vercel.com → Project → Deployments.

---

## 7. Post-deploy verification (5 min)

| ✓ | Check | How |
|---|---|---|
| ☐ | Vercel build green | Vercel Deployments → latest = "Ready" |
| ☐ | CSP not too tight | DevTools Console on prod URL — no "Refused to connect" / "Refused to load" errors |
| ☐ | Supabase realtime OK | NotificationBell renders; create a test PENDING reservation, bell badge updates within 1s |
| ☐ | Brevo email OK | Accept the test reservation; guest email arrives within ~30s |
| ☐ | Image optimization | DevTools Network → `/_next/image?url=...&q=75` requests, response is `image/webp` or `image/avif` |
| ☐ | RLS still enforced | Open DevTools and run `await supabase.from('staff').select('*')` from an unauthenticated session → expect empty array, not an error leak |

Delete the test reservation and clean up after verification.

---

## 8. Rollback plan

| Failure | Action |
|---|---|
| Vercel build fails on dep install | Revert `package.json` from `git`; investigate offline |
| CSP blocks legitimate request | Vercel → Redeploy previous green deploy; loosen `connect-src` in `next.config.ts` |
| CHECK constraint blocks legacy write | Run `ALTER TABLE … DROP CONSTRAINT …_uppercase_chk;` (rollback block at bottom of migration file) |
| Login broken for everyone | Set one row's `pwHash` back to `__SET_VIA_SETTINGS__` and add temporary `pw: '...'` field; legacy fallback in `doLogin` will accept it. **Do not commit the plaintext.** |
| Email sending fails | Confirm `BREVO_API_KEY` set in Vercel for the right environment; check `/api/send-confirmation` response in Vercel function logs |

---

## 9. Update MEMORY_LOG once shipped

Append a new section dated the deploy day, recording:

- Vercel deployment URL
- The 7-step verification table with actual ✓/✗
- Any deviations from this checklist (CSP loosened, dep pinned, etc.)
- Confirmation that old anon JWT and old Brevo key are dead

That keeps the next session aligned with reality.
