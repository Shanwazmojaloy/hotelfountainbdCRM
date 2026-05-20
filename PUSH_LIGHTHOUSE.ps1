#requires -Version 5.1
<#
  PUSH_LIGHTHOUSE.ps1
  Deploys the Lighthouse anchor cache architecture end-to-end.

  Order:
    1. git add only the 8 Lighthouse-related files
    2. git commit + push
    3. supabase db push      (applies 20260520 migration)
    4. supabase functions deploy lighthouse-summary --no-verify-jwt
    5. vercel --prod         (registers /api/ai/assist + new cron slot)
    6. curl the first-run seed and verify v_lighthouse_latest

  Prereqs:
    - Run from PowerShell in the project root
    - Supabase CLI logged in (supabase login)
    - Vercel CLI logged in (vercel login)
    - Function secrets already set via: supabase secrets set ANTHROPIC_API_KEY=...
#>

$ErrorActionPreference = 'Stop'

$Files = @(
  'supabase/migrations/20260520_lighthouse_summaries.sql',
  'supabase/functions/lighthouse-summary/index.ts',
  'app/api/ai/assist/route.ts',
  'app/api/agents/lighthouse-tick/route.ts',
  'vercel.json',
  'MEMORY_LOG.md',
  'DEPLOY.md',
  'PUSH_LIGHTHOUSE.ps1'
)

function Step {
  param([string]$label)
  Write-Host ""
  Write-Host "--- $label ---" -ForegroundColor Cyan
}

# 1. Stage
Step '1/6  git add (lighthouse files only)'
foreach ($f in $Files) {
  if (Test-Path $f) { git add -- $f } else { Write-Warning "missing: $f" }
}

# 2. Commit + push (multi-line message built with explicit newlines)
Step '2/6  git commit + push'
$nl = [Environment]::NewLine
$msg = "feat(lighthouse): two-layer Claude context - global anchor cache + /api/ai/assist" + $nl + $nl + `
       "- supabase/migrations/20260520_lighthouse_summaries.sql (table, RLS, view)" + $nl + `
       "- supabase/functions/lighthouse-summary (Haiku narrative + structured aggregator)" + $nl + `
       "- app/api/ai/assist (Sonnet 4.6 endpoint, reservation_id-scoped local context)" + $nl + `
       "- app/api/agents/lighthouse-tick (Vercel cron 19:00 UTC to Edge fn)" + $nl + `
       "- _isRealPayment uses POSITIVE match (mirrors crm-src.jsx)"
git commit -m $msg
git push origin main

# 3. Supabase migration
Step '3/6  supabase db push'
supabase db push

# 4. Edge function deploy
Step '4/6  supabase functions deploy lighthouse-summary'
supabase functions deploy lighthouse-summary --no-verify-jwt

# 5. Vercel prod deploy
Step '5/6  vercel --prod'
npx vercel --prod --yes

# 6. First-run seed + verify
Step '6/6  Seed today and verify v_lighthouse_latest'

$cronSecret = $null
if (Test-Path .env.local) {
  $line = Get-Content .env.local | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
  if ($line) { $cronSecret = ($line -split '=', 2)[1].Trim('"').Trim("'") }
}
if (-not $cronSecret) { throw 'CRON_SECRET not found in .env.local' }

$res = Invoke-WebRequest `
  -Uri 'https://fountainbd.com/api/agents/lighthouse-tick' `
  -Headers @{ Authorization = "Bearer $cronSecret" } `
  -UseBasicParsing
Write-Host 'Seed response:' -ForegroundColor Yellow
$res.Content

Write-Host ""
Write-Host "Verify in Supabase SQL editor:" -ForegroundColor Green
Write-Host "  SELECT tenant_id, snapshot_date, occupancy_pct, revenue_today_bdt, narrative_md"
Write-Host "  FROM v_lighthouse_latest;"
Write-Host ""
Write-Host "Lighthouse deploy complete." -ForegroundColor Green
