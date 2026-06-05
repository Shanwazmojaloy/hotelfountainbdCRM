# Run from: Hotel Fountain BD CRM/  (PowerShell)
# v2: Restores crm-src.jsx fully on Windows-side, applies modal fix via PowerShell
# text replacement, rebuilds bundle, commits, pushes. Bypasses sandbox/OneDrive race.

$ErrorActionPreference = "Stop"

Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

Write-Host "1/5 Restoring crm-src.jsx from HEAD (defeats OneDrive truncation)..." -ForegroundColor Cyan
git show HEAD:public/crm-src.jsx | Out-File -FilePath public/crm-src.jsx -Encoding utf8 -NoNewline

# Verify restore
$mountCount = (Select-String -Path public\crm-src.jsx -Pattern "ReactDOM\.createRoot" -SimpleMatch).Count
if ($mountCount -ne 1) {
  Write-Host "ABORT: HEAD restore didn't yield 1 ReactDOM.createRoot — got $mountCount" -ForegroundColor Red
  exit 1
}

Write-Host "2/5 Applying modal double-discount fix on line 3704..." -ForegroundColor Cyan
$src = Get-Content -Raw public\crm-src.jsx
$old = "  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-lockedDiscount-(+prefill._paid||0)):0"
$new = @"
  // lockedDue: prefill._total is already net of discount (caller sets it to computeBill.total
  // = max(0, canonical - discount)). NEVER subtract lockedDiscount again here — that would
  // double-apply the discount and silently mark partially-paid stays as Settled. The Discount
  // column in the footer below is informational only; the math anchor is _total.
  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-(+prefill._paid||0)):0
"@
if (-not ($src.Contains($old))) {
  Write-Host "ABORT: Could not find old lockedDue line in crm-src.jsx" -ForegroundColor Red
  exit 1
}
$src = $src.Replace($old, $new)
[System.IO.File]::WriteAllText("$PWD\public\crm-src.jsx", $src)

# Verify again — file should still have mount + new comment
$mountCount = (Select-String -Path public\crm-src.jsx -Pattern "ReactDOM\.createRoot" -SimpleMatch).Count
$newPatch = (Select-String -Path public\crm-src.jsx -Pattern "math anchor is _total" -SimpleMatch).Count
if ($mountCount -ne 1 -or $newPatch -ne 1) {
  Write-Host "ABORT: Post-patch verify failed. mount=$mountCount patch=$newPatch" -ForegroundColor Red
  exit 1
}

Write-Host "3/5 Rebuilding crm-bundle.js (babel + terser)..." -ForegroundColor Cyan
& .\node_modules\.bin\babel.cmd public/crm-src.jsx --config-file ./babel.crm.json --out-file public/crm-bundle.js
if ($LASTEXITCODE -ne 0) { Write-Host "Babel failed" -ForegroundColor Red; exit 1 }
& .\node_modules\.bin\terser.cmd public/crm-bundle.js --compress --mangle --output public/crm-bundle.js
if ($LASTEXITCODE -ne 0) { Write-Host "Terser failed" -ForegroundColor Red; exit 1 }
& node scripts/bump-cache.js
if ($LASTEXITCODE -ne 0) { Write-Host "Cache bump failed" -ForegroundColor Red; exit 1 }

Write-Host "4/5 Staging + committing..." -ForegroundColor Cyan
git add public/crm-src.jsx public/crm-bundle.js public/crm.html
git status --short
git commit -F COMMIT_MSG_MODAL.txt

Write-Host "5/5 Pushing to origin/main..." -ForegroundColor Cyan
git push origin main

Remove-Item -Force COMMIT_MSG_MODAL.txt -ErrorAction SilentlyContinue
Write-Host "Done. Vercel will auto-deploy. Watch /crm.html after the deploy goes READY." -ForegroundColor Green
