# Run from: Hotel Fountain BD CRM/  (PowerShell)
# Fixes RecordPayModal double-discount bug — modal due now matches list.

Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

# Pre-commit guard (OneDrive truncation defense from MEMORY_LOG)
$createRootCount = (Select-String -Path public\crm-src.jsx -Pattern "ReactDOM\.createRoot" -SimpleMatch).Count
if ($createRootCount -ne 1) {
  Write-Host "ABORT: ReactDOM.createRoot count = $createRootCount (expected 1). crm-src.jsx tail may be truncated." -ForegroundColor Red
  exit 1
}

git add public/crm-src.jsx public/crm-bundle.js public/crm.html
git status --short

git commit -F COMMIT_MSG_MODAL.txt
git push origin main

Remove-Item -Force COMMIT_MSG_MODAL.txt
