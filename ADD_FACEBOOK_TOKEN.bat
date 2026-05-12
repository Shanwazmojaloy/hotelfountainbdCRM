@echo off
cd /d "%~dp0"
echo Adding FACEBOOK_PAGE_TOKEN to Vercel (all environments)...
echo.

echo EAANtCIB83mMBRQ1F0Nhw32uDPQ5tZBveHkUuYMmeP8g7FDOV2Va4yg8D0ZCUDzBY4YfuJRrSUy6TQGHTEjPNmaha9OImhzyGIHO0ZAt30rFD7C2ZCLbbme3KDbLq2tdbw8gePGp7QdtbWYYFefSlub67Fgfec8ZA9DMjqjqklDN18ZBX9BJ9AWU4RP9HHeY5y9hrfGqlwa6OLdVmPo2NgZD | vercel env add FACEBOOK_PAGE_TOKEN production --yes 2>nul
echo EAANtCIB83mMBRQ1F0Nhw32uDPQ5tZBveHkUuYMmeP8g7FDOV2Va4yg8D0ZCUDzBY4YfuJRrSUy6TQGHTEjPNmaha9OImhzyGIHO0ZAt30rFD7C2ZCLbbme3KDbLq2tdbw8gePGp7QdtbWYYFefSlub67Fgfec8ZA9DMjqjqklDN18ZBX9BJ9AWU4RP9HHeY5y9hrfGqlwa6OLdVmPo2NgZD | vercel env add FACEBOOK_PAGE_TOKEN preview --yes 2>nul
echo EAANtCIB83mMBRQ1F0Nhw32uDPQ5tZBveHkUuYMmeP8g7FDOV2Va4yg8D0ZCUDzBY4YfuJRrSUy6TQGHTEjPNmaha9OImhzyGIHO0ZAt30rFD7C2ZCLbbme3KDbLq2tdbw8gePGp7QdtbWYYFefSlub67Fgfec8ZA9DMjqjqklDN18ZBX9BJ9AWU4RP9HHeY5y9hrfGqlwa6OLdVmPo2NgZD | vercel env add FACEBOOK_PAGE_TOKEN development --yes 2>nul

echo 111521248040168 | vercel env add FACEBOOK_PAGE_ID production --yes 2>nul
echo 111521248040168 | vercel env add FACEBOOK_PAGE_ID preview --yes 2>nul
echo 111521248040168 | vercel env add FACEBOOK_PAGE_ID development --yes 2>nul

echo.
echo Done. Check Vercel Dashboard ^> Environment Variables to confirm.
echo.
echo Token: PAGE type, expires 2026-06-30 (60-day long-lived token)
echo Page:  Hotel Fountain (ID: 111521248040168)
echo.
echo NOTE: Renew before 2026-06-30 by re-running Graph API Explorer
echo and replacing the token in this file + Vercel env vars.
pause
