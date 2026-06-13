@echo off
REM ── Install Vercel Web Analytics: clean lockfile regen + verify + push ──────
REM Supersedes vercel[bot] PR #42 with a clean, non-pruned package-lock.json.
cd /d "F:\Hotel Fountain\Hotel Fountain Web CRM"

echo Clearing any stale git lock...
del /f /q ".git\index.lock" 2>nul

echo.
echo === STEP 1/5: Clean npm install (regenerate lock, NO --legacy-peer-deps) ===
call npm install
if errorlevel 1 (
  echo.
  echo ABORT: npm install failed - likely the same ERESOLVE peer conflict the bot hit.
  echo Nothing committed or pushed. To diagnose the real conflict, run:
  echo     npm install --verbose
  echo and share the conflicting peer. Do NOT merge bot PR #42 either way.
  pause
  exit /b 1
)

echo.
echo === STEP 2/5: Lockfile guard - must contain @vercel/analytics AND @babel/core ===
findstr /C:"node_modules/@vercel/analytics" package-lock.json >nul
if errorlevel 1 ( echo ABORT: @vercel/analytics missing from package-lock.json. & pause & exit /b 1 )
findstr /C:"node_modules/@babel/core" package-lock.json >nul
if errorlevel 1 ( echo ABORT: @babel/core missing - build:crm babel step would break. & pause & exit /b 1 )
echo Guard passed.

echo.
echo === STEP 3/5: crm-src.jsx integrity guard (exactly one ReactDOM.createRoot) ===
for /f %%C in ('findstr /R /C:"ReactDOM.createRoot" public\crm-src.jsx ^| find /c /v ""') do set RC=%%C
if not "%RC%"=="1" ( echo ABORT: ReactDOM.createRoot count = %RC% expected 1 - file may be truncated. & pause & exit /b 1 )
echo Guard passed.

echo.
echo === STEP 4/5: Verify (typecheck, lint, test) ===
call npm run typecheck
if errorlevel 1 ( echo ABORT: typecheck failed. & pause & exit /b 1 )
call npm run lint
if errorlevel 1 ( echo ABORT: lint failed. & pause & exit /b 1 )
call npm test
if errorlevel 1 ( echo ABORT: tests failed. & pause & exit /b 1 )
echo All checks green.

echo.
echo === STEP 5/5: Commit + push (3 files only, surgical pathspec) ===
git commit -m "feat(analytics): add Vercel Web Analytics to root layout" -m "- import + <Analytics /> in app/layout.tsx after <SpeedInsights />" -m "- clean lockfile regen (no --legacy-peer-deps); restores @babel/* peers the bot PR pruned" -m "- supersedes vercel[bot] PR #42 (close that unmerged)" -- app/layout.tsx package.json package-lock.json
if errorlevel 1 ( echo ABORT: git commit failed. & pause & exit /b 1 )
git push origin main

echo.
echo Done. Now CLOSE bot PR #42 unmerged on GitHub, and watch Vercel for the new deploy.
echo Web Analytics starts counting ~30s after the deploy is live and you browse the site.
pause
