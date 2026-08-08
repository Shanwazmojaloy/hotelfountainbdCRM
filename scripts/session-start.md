# Session Start Checklist — Lumea CRM

Run these checks at the start of every Claude session working on this project.

## 1. Check ruflo agent health

```
Use mcp__ruflo__agent_list to list all agents.
Expected: 9 active agents.
```

If count < 9, spawn missing agents from `ruflo.config.json`. Expected agents:
- `booking-concierge` (sales, realtime)
- `lead-qualifier` (sales, realtime)
- `faq-specialist` (support, realtime)
- `revenue-manager` (audit, daily cron)
- `automated-marketer` (marketing, daily cron)
- `guest-retention` (marketing, weekly cron)
- `architect` (dev_maintenance, manual)
- `security` (dev_maintenance, pre-commit)
- `coder` (dev_maintenance, manual)

## 2. Verify the working tree is sane

The legacy `crm-src.jsx` / `crm-bundle.js` bundle check that lived here was RETIRED
2026-08-08 — the SPA was deleted and the Next.js `/crm` app is the only CRM surface.
There is no build artifact to hand-verify any more. Instead:

```powershell
git status --short          # nothing unexpected staged/deleted
npm run typecheck           # tsc --noEmit
```

The F:-mount corruption risk is NOT retired — it applies to every file you edit.
After any large edit, verify with a host `Read` plus a NUL/UTF-8/EOF check
(`scripts/guard-onedrive-truncation.sh` runs this on commit).

## 3. Check pending tasks

Review `memory/pending_tasks.md` for any HIGH priority items carried from the last session.

## 4. Git index health

If git commands fail with "index file corrupt":
```powershell
# From Windows PowerShell:
GIT_INDEX_FILE=/tmp/x git read-tree HEAD && cp /tmp/x .git/index
```

## 5. Commit + push anything left from the last session

All commits MUST run from Windows PowerShell — the sandbox cannot remove
Windows-owned `.git/*.lock` files. Canonical repo path (the old OneDrive path is
dead):

```powershell
cd "F:\Hotel Fountain\Hotel Fountain Web CRM"
git status --short
# Stage EXPLICIT paths, never `git add -A` — unrelated work-in-progress and
# generated artifacts live in this tree.
git add <paths>
git commit -m "fix: [describe change]"
git push origin main
```

Before committing, confirm no critical file is staged for deletion:
`git diff --cached --name-only` (guard: `.env.local`, `facebook_post.py`,
`ADD_FACEBOOK_TOKEN.bat`, `ruflo.config.json`, batch scripts).
