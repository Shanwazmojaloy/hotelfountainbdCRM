# Deletes the 26 one-off dev/deploy scaffolding Edge Functions from Supabase.
# These are all verify_jwt:false (publicly callable) and unused by the app.
# Usage:  .\scripts\delete-scaffolding-functions.ps1
# Requires Node (for npx). No global supabase install needed.

$ref = "mynwfkgksqqwlqowlscj"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "Get a token at https://supabase.com/dashboard/account/tokens" -ForegroundColor Cyan
  $env:SUPABASE_ACCESS_TOKEN = Read-Host "Paste your Supabase access token"
}

$fns = @(
  "push-to-github","github-push-all","github-push-file","push-appjsx",
  "push-crm-to-github","push-crm-file","fix-vercel","fix-all","fix-postcss",
  "fix-vercel-project","fix-vercel-framework","fix-vercel-static","run-fix-now",
  "trigger-fix","fb-config-fix","fb-add-login","vercel-static-deploy",
  "vercel-html-deploy","deploy-crm","store-html-chunks","store-c1","sc0",
  "upload-to-storage","test-workflows","netlify-push","netlify-deploy"
)

$ok = 0; $fail = 0
foreach ($f in $fns) {
  Write-Host "Deleting $f ..." -ForegroundColor Yellow
  npx -y supabase@latest functions delete $f --project-ref $ref
  if ($LASTEXITCODE -eq 0) { $ok++ } else { $fail++; Write-Host "  -> failed ($f)" -ForegroundColor Red }
}

Write-Host ""
Write-Host "Done. Deleted: $ok  Failed: $fail" -ForegroundColor Green
