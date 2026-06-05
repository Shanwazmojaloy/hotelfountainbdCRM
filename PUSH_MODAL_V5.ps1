# Run from: Hotel Fountain BD CRM/  (PowerShell)
# v5: Fixes the Select-String false-alarm. The earlier "ABORT" wasn't real —
# Select-String -SimpleMatch with pattern "ReactDOM\.createRoot" was looking for
# a literal backslash-dot. Removing the escape (or dropping -SimpleMatch) fixes it.

$ErrorActionPreference = 'Stop'

Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

function Test-Mount {
  param([string]$Stage)
  # Use regex (no -SimpleMatch) so \. correctly matches a literal dot
  $count = (Select-String -Path public\crm-src.jsx -Pattern 'ReactDOM\.createRoot').Count
  $size = (Get-Item public\crm-src.jsx).Length
  Write-Host ("  [$Stage] mount = $count, size = $size bytes")
  if ($count -ne 1) {
    Write-Host "ABORT at $Stage : mount count = $count (expected 1)" -ForegroundColor Red
    exit 1
  }
}

Write-Host '1/6 Hard-reset crm-src.jsx to HEAD via git checkout...' -ForegroundColor Cyan
git checkout HEAD -- public/crm-src.jsx
Start-Sleep -Milliseconds 800
Test-Mount 'after checkout'

Write-Host '2/6 Reading file content...' -ForegroundColor Cyan
$src = [System.IO.File]::ReadAllText("$PWD\public\crm-src.jsx")
Write-Host "  Read $($src.Length) chars"

$old = '  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-lockedDiscount-(+prefill._paid||0)):0'
if (-not $src.Contains($old)) {
  Write-Host 'ABORT: old lockedDue line not found' -ForegroundColor Red
  exit 1
}
Write-Host '  Old line found.'

Write-Host '3/6 Applying patch in memory...' -ForegroundColor Cyan
$new = @'
  // lockedDue: prefill._total is already net of discount (caller sets it to computeBill.total
  // = max(0, canonical - discount)). NEVER subtract lockedDiscount again here — that would
  // double-apply the discount and silently mark partially-paid stays as Settled. The Discount
  // column in the footer below is informational only; the math anchor is _total.
  const lockedDue   = fromRow?Math.max(0,(+prefill._total||0)-(+prefill._paid||0)):0
'@
$patched = $src.Replace($old, $new)
if ($patched.Length -le $src.Length) {
  Write-Host "ABORT: patched length $($patched.Length) not larger than $($src.Length)" -ForegroundColor Red
  exit 1
}

Write-Host '4/6 Writing patched file...' -ForegroundColor Cyan
[System.IO.File]::WriteAllText("$PWD\public\crm-src.jsx", $patched)
Start-Sleep -Milliseconds 1500
Test-Mount 'after patch write'
$patchMark = (Select-String -Path public\crm-src.jsx -Pattern 'math anchor is _total').Count
if ($patchMark -ne 1) {
  Write-Host "ABORT: patch marker missing (count = $patchMark)" -ForegroundColor Red
  exit 1
}
Write-Host '  Patch confirmed in Windows-side file.'

Write-Host '5/6 Rebuilding bundle...' -ForegroundColor Cyan
& .\node_modules\.bin\babel.cmd public/crm-src.jsx --config-file ./babel.crm.json --out-file public/crm-bundle.js
if ($LASTEXITCODE -ne 0) { exit 1 }
& .\node_modules\.bin\terser.cmd public/crm-bundle.js --compress --mangle --output public/crm-bundle.js
if ($LASTEXITCODE -ne 0) { exit 1 }
& node scripts/bump-cache.js
if ($LASTEXITCODE -ne 0) { exit 1 }

Test-Mount 'pre-commit'

Write-Host '6/6 Commit + push...' -ForegroundColor Cyan
git add public/crm-src.jsx public/crm-bundle.js public/crm.html
git status --short
git commit -F COMMIT_MSG_MODAL.txt
git push origin main

Remove-Item -Force COMMIT_MSG_MODAL.txt -ErrorAction SilentlyContinue
Write-Host 'Done. Vercel will auto-deploy.' -ForegroundColor Green
