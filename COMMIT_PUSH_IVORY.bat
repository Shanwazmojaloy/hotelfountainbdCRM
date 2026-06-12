@echo off
cd /d "F:\Hotel Fountain\Hotel Fountain Web & CRM"
set LOG=push_log.txt
> "%LOG%" echo ===== START =====
if exist ".git\index.lock" del /f /q ".git\index.lock"
echo --- commit sw.js (pathspec) --->> "%LOG%"
git commit -m "fix(sw): never return undefined from respondWith (fixes 'Failed to convert value to Response'); bump cache to lumea-v5" -- public/sw.js >> "%LOG%" 2>&1
echo --- push --->> "%LOG%"
git push >> "%LOG%" 2>&1
echo --- final log --->> "%LOG%"
git log --oneline -2 >> "%LOG%" 2>&1
echo ===== DONE =====>> "%LOG%"
exit
