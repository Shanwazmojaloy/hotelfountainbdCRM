# Re-copies the marketing files from fountainbd-web into the live repo using a
# host-native copy (robocopy) — avoids the OneDrive/sandbox mount that truncated
# the earlier copy. Run from anywhere:  powershell -ExecutionPolicy Bypass -File FIX_MIGRATION_COPY.ps1

$ErrorActionPreference = "Stop"
$src = "F:\Hotel Fountain\Hotel Fountain Web CRM\archive\onedrive-workspace\fountainbd-web"
$dst = "F:\Hotel Fountain\Hotel Fountain Web CRM"

Write-Host "Copying marketing components -> src/components/site ..." -ForegroundColor Cyan
robocopy "$src\src\components" "$dst\src\components\site" *.tsx /NFL /NDL /NJH /NJS | Out-Null

Write-Host "Copying lib (rooms/site/reserve) ..." -ForegroundColor Cyan
robocopy "$src\src\lib" "$dst\src\lib" rooms.ts site.ts reserve.ts /NFL /NDL /NJH /NJS | Out-Null

Write-Host "Copying room images ..." -ForegroundColor Cyan
robocopy "$src\public\images" "$dst\public\images" /NFL /NDL /NJH /NJS | Out-Null
robocopy "$src\public\logo" "$dst\public\logo" /NFL /NDL /NJH /NJS | Out-Null

Write-Host "Copying pages into the (site) route group ..." -ForegroundColor Cyan
robocopy "$src\src\app"          "$dst\app\(site)"          page.tsx template.tsx /NFL /NDL /NJH /NJS | Out-Null
robocopy "$src\src\app\rooms"    "$dst\app\(site)\rooms"    page.tsx /NFL /NDL /NJH /NJS | Out-Null
robocopy "$src\src\app\services" "$dst\app\(site)\services" page.tsx /NFL /NDL /NJH /NJS | Out-Null
robocopy "$src\src\app\contact"  "$dst\app\(site)\contact"  page.tsx /NFL /NDL /NJH /NJS | Out-Null

Write-Host "Fixing page imports (@/components -> @/components/site) ..." -ForegroundColor Cyan
Get-ChildItem "$dst\app\(site)" -Recurse -Filter page.tsx | ForEach-Object {
    $c = Get-Content $_.FullName -Raw
    $c = $c -replace '@/components/', '@/components/site/'
    Set-Content -NoNewline $_.FullName $c
}

Write-Host ""
Write-Host "DONE. Now restart the dev server (Ctrl+C in the next-server tab, then: npm run dev)." -ForegroundColor Green
