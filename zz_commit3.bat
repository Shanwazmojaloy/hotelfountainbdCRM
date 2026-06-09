@echo off
cd /d C:\dev\hotelfountainbd
git add app/api/agents/_tenants.ts app/api/agents/daily-ops/route.ts app/api/agents/weekly-retention/route.ts docs/MULTI_TENANT_CUTOVER.md > zz_commit3.txt 2>&1
git commit -m "feat(multitenant): per-tenant loop for ops agents (daily-ops, weekly-retention) + corrected cutover classification" >> zz_commit3.txt 2>&1
git push >> zz_commit3.txt 2>&1
echo DONE >> zz_commit3.txt
type zz_commit3.txt
