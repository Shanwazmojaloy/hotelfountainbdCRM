# Hotel Fountain CRM — Deploy to Vercel

## Vercel Project
- Name: `hotelfountainbd`
- ID: `prj_uN24s39VEayriFaMqgojy6nM2WJo`
- Live URL: https://hotelfountainbd.vercel.app
- GitHub: https://github.com/Shanwazmojaloy/hotelfountainbd

## Option A — Push to GitHub (triggers auto-deploy)

```bash
# Clone repo
git clone https://github.com/Shanwazmojaloy/hotelfountainbd.git
cd hotelfountainbd

# Replace with new files (extract zip contents here)
# Then:
git add -A
git commit -m "feat: Lumea Hotel Fountain CRM — live Supabase, all modules"
git push origin main
```

Vercel will auto-build and deploy. Watch at: https://vercel.com/shanwaz-ahmeds-projects/hotelfountainbd

---

## Option B — Vercel CLI (fastest, no git needed)

```bash
npm i -g vercel
cd hotel-fountain-crm-deploy/  # unzip first
vercel --prod --team team_l1SAECyZJ9giIw4o2SGxjpqd
```

---

## Files in this zip
```
package.json     — React 18 + Vite
vercel.json      — build: npm install && npm run build, SPA rewrites
index.html       — entry point
vite.config.js   — Vite + React plugin
src/App.jsx      — Full CRM (947 lines, live Supabase)
src/main.jsx     — React entry
```

## Staff Login Credentials
| Role          | Email                              | Password   |
|---------------|------------------------------------|------------|
| Owner/Founder | owner@hotelfountain.com            | owner2026  |
| Front Desk    | fo.hotelfountain799@gmail.com      | front2026  |
| Housekeeping  | hotelfountain.hk@gmail.com         | hk2026     |
| Manager       | manager@hotelfountain.com          | mgr2026    |
| Accountant    | accounts@hotelfountain.com         | acc2026    |

## Supabase
- Project: Hotel Fountain Main (mynwfkgksqqwlqowlscj)
- Region: us-east-1
- Tenant ID: 46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8
