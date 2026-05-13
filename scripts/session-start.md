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

## 2. Verify crm-bundle.js mount call

```bash
tail -3 public/crm-src.jsx
# Must end with: ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
```

## 3. Check pending tasks

Review `memory/pending_tasks.md` for any HIGH priority items carried from the last session.

## 4. Git index health

If git commands fail with "index file corrupt":
```powershell
# From Windows PowerShell:
GIT_INDEX_FILE=/tmp/x git read-tree HEAD && cp /tmp/x .git/index
```

## 5. Commit + push any pending bundle files

If `crm-src.jsx` or `crm-bundle.js` were edited in the last session but not pushed:
```powershell
cd "C:\Users\ahmed\OneDrive\Desktop\New folder\claude\hotelfountainbd-vercel\Hotel Fountain BD CRM"
git status
git add public/crm-src.jsx public/crm-bundle.js public/crm.html
git commit -m "fix: [describe change]"
git push origin main
```
