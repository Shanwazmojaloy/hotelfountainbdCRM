# Lumea - Multi-Tenant Vercel Setup
# Run once from PowerShell (Vercel CLI must be logged in: vercel login)
#
# What it does:
#   1. Adds ADMIN_SECRET + NEXT_PUBLIC_APEX_DOMAIN to Vercel (prod + preview)
#   2. Adds *.lumea.app wildcard domain to the Vercel project
#   3. Redeploys to production

$CRM_DIR = "C:\Users\ahmed\OneDrive\Desktop\New folder\claude\hotelfountainbd-vercel\Hotel Fountain BD CRM"

# Pre-generated secure secret - store this in 1Password or similar
$ADMIN_SECRET = "47e78a87b7dfd6e5d4aeb76845c4120d54d1ff09257b81e6a9b5c1be7b052668"
$APEX_DOMAIN  = "lumea.app"

Set-Location $CRM_DIR

Write-Host ""
Write-Host "=== Step 1: Adding ADMIN_SECRET ===" -ForegroundColor Cyan
echo $ADMIN_SECRET | vercel env add ADMIN_SECRET production
echo $ADMIN_SECRET | vercel env add ADMIN_SECRET preview

Write-Host ""
Write-Host "=== Step 2: Adding NEXT_PUBLIC_APEX_DOMAIN ===" -ForegroundColor Cyan
echo $APEX_DOMAIN | vercel env add NEXT_PUBLIC_APEX_DOMAIN production
echo $APEX_DOMAIN | vercel env add NEXT_PUBLIC_APEX_DOMAIN preview

Write-Host ""
Write-Host "=== Step 3: Adding wildcard domain ===" -ForegroundColor Cyan
vercel domains add "*.$APEX_DOMAIN"

Write-Host ""
Write-Host "=== Step 4: Deploying to production ===" -ForegroundColor Cyan
vercel --prod

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Admin panel: https://hotelfountainbd-crm.vercel.app/admin/onboard"
Write-Host ""
Write-Host "IMPORTANT - Save your ADMIN_SECRET:" -ForegroundColor Yellow
Write-Host "  $ADMIN_SECRET"
Write-Host ""
Write-Host "DNS: For each new tenant, add CNAME:"
Write-Host "  SLUG.$APEX_DOMAIN  ->  cname.vercel-dns.com"
