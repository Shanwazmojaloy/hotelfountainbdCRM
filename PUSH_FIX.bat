@echo off
echo === Hotel Fountain CRM — Push JWT Fix ===
cd /d "%~dp0"
echo.
echo Removing git lock if present...
del /f ".git\index.lock" 2>nul
del /f ".git\objects\maintenance.lock" 2>nul
echo.
echo Staging files...
git add public/crm.html crm.logic.test.ts package.json
echo.
echo Committing...
git commit -m "fix: replace all legacy JWTs with sb_publishable_ key — restores all data loading"
echo.
echo Pushing to GitHub (triggers Vercel redeploy)...
git push origin main
echo.
echo ✅ Done! Vercel will redeploy in ~60 seconds.
echo    Then hard-refresh your CRM: Ctrl+Shift+R
pause
