@echo off
cd /d "%~dp0"
echo === Clearing stale git locks ===
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo === Staging perf + PWA files ===
git add app/layout.tsx app/page.tsx public/crm.html ^
 public/front-view.webp public/fountain-deluxe.webp public/premium-deluxe.webp ^
 public/superior-deluxe.webp public/twin-deluxe.webp public/royal-suite.webp public/logo.webp ^
 public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-maskable-512.png ^
 public/manifest.webmanifest public/sw.js

echo === Pre-push guard: ReactDOM.createRoot must equal 1 ===
for /f %%C in ('findstr /R /C:"ReactDOM.createRoot" public\crm-src.jsx ^| find /c /v ""') do set RC=%%C
if not "%RC%"=="1" ( echo ABORT: createRoot guard failed ^(count=%RC%^) & pause & exit /b 1 )

git commit -m "perf: optimize landing images to WebP (4.5MB->92KB hero) + non-blocking fonts; feat: full-parity PWA (manifest, service worker, install prompt, icons)"
git push origin main
echo === Done. Vercel will auto-build. ===
pause
