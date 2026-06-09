@echo off
cd /d C:\dev\hotelfountainbd
git add docs/MULTI_TENANT_CUTOVER.md > zz_commit.txt 2>&1
git commit -m "docs: multi-tenant cutover runbook + applied tenant-resolution foundation" >> zz_commit.txt 2>&1
git push >> zz_commit.txt 2>&1
echo DONE >> zz_commit.txt
type zz_commit.txt
