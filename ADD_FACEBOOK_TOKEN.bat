@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  Hotel Fountain — Add FACEBOOK_PAGE_TOKEN to Vercel
echo ============================================================
echo.
echo You need two values from Facebook Developers:
echo   1. Page Access Token  (long-lived)
echo   2. Page ID            (numeric, e.g. 123456789012345)
echo.
echo Get them at: https://developers.facebook.com/tools/explorer
echo Required permissions: pages_manage_posts, pages_read_engagement
echo.

set /p PAGE_TOKEN="Paste your FACEBOOK_PAGE_TOKEN: "
set /p PAGE_ID="Paste your FACEBOOK_PAGE_ID (numeric): "

if "!PAGE_TOKEN!"=="" (
    echo ERROR: Token cannot be empty.
    pause & exit /b 1
)
if "!PAGE_ID!"=="" (
    echo ERROR: Page ID cannot be empty.
    pause & exit /b 1
)

echo.
echo Adding to Vercel (production + preview + development)...
echo.

:: Add to all environments
echo !PAGE_TOKEN! | vercel env add FACEBOOK_PAGE_TOKEN production  --token "" 2>nul
echo !PAGE_TOKEN! | vercel env add FACEBOOK_PAGE_TOKEN preview     --token "" 2>nul
echo !PAGE_TOKEN! | vercel env add FACEBOOK_PAGE_TOKEN development --token "" 2>nul
echo !PAGE_ID!    | vercel env add FACEBOOK_PAGE_ID    production  --token "" 2>nul
echo !PAGE_ID!    | vercel env add FACEBOOK_PAGE_ID    preview     --token "" 2>nul
echo !PAGE_ID!    | vercel env add FACEBOOK_PAGE_ID    development --token "" 2>nul

:: Write to .env.local for local dev
echo. >> .env.local
echo # Facebook Graph API >> .env.local
echo FACEBOOK_PAGE_TOKEN=!PAGE_TOKEN! >> .env.local
echo FACEBOOK_PAGE_ID=!PAGE_ID! >> .env.local

echo.
echo Validating token against Graph API...
set FACEBOOK_PAGE_TOKEN=!PAGE_TOKEN!
set FACEBOOK_PAGE_ID=!PAGE_ID!
python scripts/facebook_post.py --message "test" --validate

echo.
echo Committing .env.example update...
git add .env.example scripts/facebook_post.py ruflo.config.json crm.logic.test.ts package.json public/crm.html
git commit -m "feat: add FACEBOOK_PAGE_TOKEN, facebook_post.py, ruflo agent config, marketing_opt_out migration"
git push origin main

echo.
echo ============================================================
echo  Done! Vercel will redeploy with FACEBOOK_PAGE_TOKEN set.
echo  Test a post: python scripts/facebook_post.py --dry-run --message "Test"
echo ============================================================
pause
