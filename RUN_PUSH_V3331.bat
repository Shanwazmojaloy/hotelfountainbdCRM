@echo off
title Lumea push v3.33.1
cd /d C:\dev\hotelfountainbd
echo ============================================
echo  BUILD
echo ============================================
call npm run build
if errorlevel 1 (
  echo.
  echo ********** BUILD FAILED - NOTHING COMMITTED **********
  pause
  exit /b 1
)
echo ============================================
echo  COMMIT + PUSH
echo ============================================
git add -A
git commit -m "v3.33.1 - fix JSX comment placement in RoomFolioModal (build break)"
git push
echo.
echo ********** DONE - check output above **********
pause
