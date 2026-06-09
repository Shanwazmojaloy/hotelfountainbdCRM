@echo off
cd /d C:\dev\hotelfountainbd
git add docs/MULTI_TENANT_CUTOVER.md > zz_commit2.txt 2>&1
git commit -m "docs: multi-tenant step 1 applied (tenant_users mapped); secret-aware step 2 (per-tenant creds)" >> zz_commit2.txt 2>&1
git push >> zz_commit2.txt 2>&1
echo DONE >> zz_commit2.txt
type zz_commit2.txt
