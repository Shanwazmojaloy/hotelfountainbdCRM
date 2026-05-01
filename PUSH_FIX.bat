@echo off
cd /d "%~dp0"
echo Pushing commit 7ba5c11 to GitHub (triggers Vercel redeploy)...
echo.
git push origin main
echo.
echo Done. Vercel deploys in ~60s then hard-refresh: Ctrl+Shift+R
pause
