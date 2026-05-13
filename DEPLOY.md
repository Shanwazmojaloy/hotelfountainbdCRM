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