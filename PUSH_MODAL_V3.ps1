# Run from: Hotel Fountain BD CRM/  (PowerShell)
# v3: Single-quoted strings throughout to stop PowerShell from interpolating $prefill etc.

$ErrorActionPreference = 'Stop'

Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

Write-Host '1/5 Restoring crm-src.jsx from HEAD...' -ForegroundColor Cyan
$head = & git show HEAD:public/crm-src.jsx
[System.IO.File]::WriteAllText("$PWD\public\crm-src.jsx", ($head -join "`n"))

$mountCount = (Select-String -Path public\crm-src.jsx -Pattern 'ReactDOM\.createRoot' -SimpleMatch).Count
if ($mountCount -ne 1) {
  Write-Host "ABORT: HEAD restore yielded $mountCount mounts (expected 1)" -ForegroundColor Red
  exit 1
}

Write-Host '2/5 Applying modal double-discount fix...' -ForegroundColor Cyan
$src = [System.IO.File]::ReadAllText("$PWD\public\crm-src.jsx")
$old = '  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-lockedDiscount-(+prefill._paid||0)):0'
$new = @'
  // lockedDue: prefill._total is already net of discount (caller sets it to computeBill.total
  // = max(0, canonical - discount)). NEVER subtract lockedDiscount again here — that would
  // double-apply the discount and silently mark partially-paid stays as Settled. The Discount
  // column in the footer below is informational only; the math anchor is _total.
  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-(+prefill._paid||0)):0
'@

if (-not $src.Contains($old)) {
  Write-Host 'ABORT: Old lockedDue line not found in crm-src.jsx' -ForegroundColor Red
  exit 1
}
$src = $src.Replace($old, $new)
[System.IO.File]::WriteAllText("$PWD\public\crm-src.jsx", $src)

$mountCount = (Select-String -Path public\crm-src.jsx -Pattern 'ReactDOM\.createRoot' -SimpleMatch).Count
$patchMark  = (Select-String -Path public\crm-src.jsx -Pattern 'math anchor is _total' -SimpleMatch).Count
if ($mountCount -ne 1 -or $patchMark -ne 1) {
  Write-Host "ABORT: post-patch verify failed. mount=$mountCount patch=$patchMark" -ForegroundColor Red
  exit 1
}

Write-Host '3/5 Rebuilding crm-bundle.js...' -ForegroundColor Cyan
& .\node_modules\.bin\babel.cmd public/crm-src.jsx --config-file ./babel.crm.json --out-file public/crm-bundle.js
if ($LASTEXITCODE -ne 0) { exit 1 }
& .\node_modules\.bin\terser.cmd public/crm-bundle.js --compress --mangle --output public/crm-bundle.js
if ($LASTEXITCODE -ne 0) { exit 1 }
& node scripts/bump-cache.js
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host '4/5 Committing...' -ForegroundColor Cyan
git add public/crm-src.jsx public/crm-bundle.js public/crm.html
git status --short
git commit -F COMMIT_MSG_MODAL.txt

Write-Host '5/5 Pushing...' -ForegroundColor Cyan
git push origin main

Remove-Item -Force COMMIT_MSG_MODAL.txt -ErrorAction SilentlyContinue
Write-Host 'Done. Watch Vercel for the new deploy.' -ForegroundColor Green
