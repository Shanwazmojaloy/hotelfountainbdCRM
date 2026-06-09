@echo off
cd /d C:\dev\hotelfountainbd
echo ===== TYPECHECK ===== > zz_tc.txt
call npx tsc --noEmit >> zz_tc.txt 2>&1
echo EXIT=%ERRORLEVEL% >> zz_tc.txt
echo ===== DONE ===== >> zz_tc.txt
type zz_tc.txt
