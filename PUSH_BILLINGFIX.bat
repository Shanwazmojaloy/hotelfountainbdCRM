@echo off
REM ── Lumea billing fix: derive total = rooms + billable folios ───────────────
cd /d "F:\Hotel Fountain\Hotel Fountain Web CRM"
echo Clearing any stale git lock...
del /f /q ".git\index.lock" 2>nul

echo Pre-push guard: crm-src.jsx must have exactly ONE ReactDOM.createRoot...
for /f %%C in ('findstr /R /C:"ReactDOM.createRoot" public\crm-src.jsx ^| find /c /v ""') do set RC=%%C
if not "%RC%"=="1" (
  echo ABORT: ReactDOM.createRoot count = %RC% (expected 1). File may be truncated. Not pushing.
  pause
  exit /b 1
)
echo Guard passed.

echo Staging billing-fix files only...
git add public/crm-src.jsx public/crm-bundle.js public/crm.html MEMORY_LOG.md

git commit -m "fix(billing): derive reservation total from rooms + billable folios; kill incremental ghost-bleed" -m "- recalcResTotal(): total_amount = rooms*nights + sum(billable folios), never incremental" -m "- Add Charge no longer does curTotal+amount (caused SALAM ALASSAF 15,000 vs correct 11,500)" -m "- folio delete + reservation save now resync canonical; modal edit no longer drops folios" -m "- computeBill excludes accounting markers (receivable/payment/...) so modal/tabs/invoice match"

git push origin main
echo.
echo Done. Check Vercel for the deploy, then hard-refresh the CRM.
pause
