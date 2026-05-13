# Lumea CRM — Operator Deploy Runbook

> Last updated: 2026-05-14  
> Environment: Next.js 15 on Vercel Hobby · Supabase PostgreSQL · Windows dev machine

---

## 1. Prerequisites

| Tool | Check command | Required version |
|---|---|---|
| Node.js | `node -v` | ≥ 18 |
| npm | `npm -v` | ≥ 9 |
| Git | `git --version` | any |
| Vercel CLI | `npx vercel --version` | ≥ 32 |

Working directory (PowerShell):
```powershell
cd "C:\Users\ahmed\OneDrive\Desktop\New folder\claude\hotelfountainbd-vercel\Hotel Fountain BD CRM"
```

---

## 2. CRM Bundle Rebuild (crm-src.jsx → crm-bundle.js)

Run this **any time `public/crm-src.jsx` is edited**:

```powershell
npm run build:crm
```

What it does:
1. Babel transpiles `crm-src.jsx` → `crm-bundle.js`
2. Terser minifies `crm-bundle.js` in-place
3. `scripts/bump-cache.js` stamps `?v=YYYYMMDDHHMMSS` in `crm.html`

**Verify after build:**
```powershell
# Must end with ReactDOM.createRoot(...)
Get-Content public/crm-src.jsx -Tail 3
# Check bundle size (~279KB)
(Get-Item public/crm-bundle.js).Length / 1KB
```

If the tail is missing the `ReactDOM.createRoot(...)` mount call, the CRM will show a blank screen. Restore from git immediately:
```powershell
git checkout HEAD -- public/crm-src.jsx
```

---

## 3. Git Commit & Push (Windows PowerShell)

### Standard commit
```powershell
git add -A
git status          # review staged files
git commit -m "fix: describe the change"
git push origin main
```

### Common files to stage after a CRM bundle rebuild:
```powershell
git add public/crm-src.jsx public/crm-bundle.js public/crm.html
```

### After adding a new API route or env var:
```powershell
git add app/api/agents/<route-name>/route.ts vercel.json
```

### Corrupt git index (recurring issue — workaround):
```powershell
# From PowerShell — run if git add/commit fails with "index file corrupt"
$env:GIT_INDEX_FILE = "$env:TEMP\git-index-tmp"
git read-tree HEAD
Copy-Item $env:TEMP\git-index-tmp .git\index
Remove-Item Env:\GIT_INDEX_FILE
```

---

## 4. Vercel Deploy

### Auto-deploy (recommended)
Push to `main` → Vercel automatically builds and deploys within ~60 seconds.

### Manual deploy (if auto-deploy is stuck or you need immediate push):
```powershell
npx vercel --prod
```

### Check deploy status:
```powershell
npx vercel ls
```
Or visit: https://vercel.com/ahmedshanwaz5/hotel-fountain-crm

### Build logs:
Vercel Dashboard → Deployments → click latest → Build Logs

---

## 5. Vercel Environment Variables

Location: Vercel Dashboard → Project → Settings → Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All (Production) | Production Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Preview only | Staging branch URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All (Production) | Supabase anon key (prod) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview only | Staging branch anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Server-side Supabase admin key |
| `CRON_SECRET` | All | Bearer token for all cron routes |
| `BREVO_API_KEY` | All | Transactional email (Brevo SMTP) |
| `ANTHROPIC_API_KEY` | All | CEOAuditor AI agent |
| `GMAIL_USER` | All | IMAP poll inbox (reply-intake) |
| `GMAIL_APP_PASSWORD` | All | Gmail app-specific password |
| `FACEBOOK_PAGE_TOKEN` | All | Facebook page posting (**expires 2026-06-30**) |
| `FACEBOOK_PAGE_ID` | All | Facebook page ID |

**Staging Supabase (Preview scope):**
- `NEXT_PUBLIC_SUPABASE_URL` = `https://szaffsybjomkvtecupks.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon key (see `memory/agent_infrastructure.md`)

---

## 6. Supabase Migrations

### Apply a migration via Claude (MCP):
```
mcp__752c5d26-6bdf-4c9a-b4f2-62ff2e6bb963__apply_migration
  project_id: mynwfkgksqqwlqowlscj
  name: 20260514_describe_change
  query: <SQL here>
```

### Apply manually via Supabase SQL Editor:
1. Go to https://supabase.com/dashboard/project/mynwfkgksqqwlqowlscj/sql
2. Paste the SQL from `supabase/migrations/<filename>.sql`
3. Run
4. Add ✅ done note to `memory/pending_tasks.md`

### Migration filename convention:
```
YYYYMMDD_short_description.sql
```

### Check applied migrations (Claude):
```
mcp__752c5d26-6bdf-4c9a-b4f2-62ff2e6bb963__list_migrations
  project_id: mynwfkgksqqwlqowlscj
```

---

## 7. Cron Jobs (Vercel)

Defined in `vercel.json`. All schedules are UTC; BDT = UTC+6.

| Path | Schedule (UTC) | BDT | Purpose |
|---|---|---|---|
| `/api/agents/outreach-bot` | `0 3 * * *` | 9:00 AM daily | Corporate lead emails |
| `/api/agents/daily-ops` | `0 2 * * *` | 8:00 AM daily | Revenue reconciliation + Facebook post |
| `/api/agents/weekly-retention` | `0 3 * * 1` | 9:00 AM Monday | Guest retention outreach |
| `/api/agents/reply-intake-poll` | `0 1 * * *` | 7:00 AM daily | Gmail IMAP reply check |
| `/api/agents/fb-token-check` | `0 2 1 * *` | 8:00 AM 1st of month | Facebook token expiry alert |

**Hobby plan limit:** 2 cron jobs, daily-or-lower frequency. Current = 5 crons. If Vercel rejects on next deploy, upgrade to Pro ($20/month) for unlimited crons.

**Test a cron manually (PowerShell):**
```powershell
$secret = (vercel env pull --yes 2>$null; Get-Content .env.local | Select-String CRON_SECRET).ToString().Split("=")[1]
Invoke-WebRequest -Uri "https://fountainbd.com/api/agents/daily-ops" -Headers @{ Authorization = "Bearer $secret" }
```

---

## 8. Post-Deploy Checklist

After every production deploy, verify:

- [ ] `https://fountainbd.com` loads (landing page)
- [ ] `https://fountainbd.com/crm.html` loads CRM without blank screen
- [ ] Browser DevTools Network: `crm-bundle.js` returns 200 (not stale 304)
- [ ] CRM Dashboard → TODAY'S REVENUE matches Billing → BIZ DAY total
- [ ] Vercel Runtime Logs: no 400/500 errors in last 10 minutes
- [ ] Supabase → Table Editor → transactions → INSERT a test row, then DELETE it

---

## 9. Rollback

### Rollback a bad Vercel deploy:
1. Vercel Dashboard → Deployments
2. Find the last known-good deployment
3. Click ⋯ → **Promote to Production**

### Rollback a bad migration:
Supabase has no auto-rollback. Write a reverse migration:
```sql
-- Example: undo an added column
ALTER TABLE transactions DROP COLUMN IF EXISTS bad_column;
```

### Rollback crm-bundle.js:
```powershell
git checkout <last-good-commit> -- public/crm-bundle.js public/crm.html
git commit -m "revert: restore crm-bundle.js to <commit>"
git push origin main
```

---

## 10. Key Project Refs

| Resource | Value |
|---|---|
| Supabase project ref | `mynwfkgksqqwlqowlscj` |
| Supabase staging branch ref | `szaffsybjomkvtecupks` |
| Vercel project name | `hotel-fountain-crm` |
| Vercel account | `ahmedshanwaz5` |
| Production URL | `https://fountainbd.com` |
| CRM URL | `https://fountainbd.com/crm.html` |
| Tenant UUID | `46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8` |
| Alert email | `ahmedshanwaz5@gmail.com` |
| Facebook token expiry | **2026-06-30** — renew via Graph API Explorer |

---

## 11. Staff Login Credentials

| Role | Email | Password |
|---|---|---|
| Owner/Founder | owner@hotelfountain.com | owner2026 |
| Front Desk | fo.hotelfountain799@gmail.com | front2026 |
| Housekeeping | hotelfountain.hk@gmail.com | hk2026 |
| Manager | manager@hotelfountain.com | mgr2026 |
| Accountant | accounts@hotelfountain.com | acc2026 |
