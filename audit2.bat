@echo off
cd /d C:\dev\hotelfountainbd
echo ===== RUNNING TESTS ===== > audit2.txt
call npm test >> audit2.txt 2>&1
echo. >> audit2.txt
echo ===== COMMIT + PUSH ===== >> audit2.txt
git add crm.logic.test.ts >> audit2.txt 2>&1
git commit -m "Fix corrupted crm.logic.test.ts (trailing NUL bytes broke typecheck/CI)" >> audit2.txt 2>&1
git push >> audit2.txt 2>&1
echo ===== DONE ===== >> audit2.txt
type audit2.txt
pause
