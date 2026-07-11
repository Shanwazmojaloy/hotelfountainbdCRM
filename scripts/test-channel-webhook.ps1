# [Hotel-CRM] Channel Manager Phase 2 - live webhook smoke test
# Signs a harmless booking_modified payload (queued only, creates NO
# reservation) with CHANNEL_WEBHOOK_SECRET from .env.local and POSTs it
# to the deployed webhook. Expected: {"ok":true,"queued":true,...}
#
# Usage:  powershell -File scripts\test-channel-webhook.ps1
#         powershell -File scripts\test-channel-webhook.ps1 -BaseUrl "https://<preview>.vercel.app"

param(
  [string]$BaseUrl = "https://fountainbd.com"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

# read secret from .env.local
$line = Select-String -Path (Join-Path $repo ".env.local") -Pattern "^CHANNEL_WEBHOOK_SECRET=" | Select-Object -First 1
if (-not $line) { Write-Error "CHANNEL_WEBHOOK_SECRET not found in .env.local"; exit 1 }
$secret = $line.Line.Split("=", 2)[1].Trim()

$body = @{
  event_type = "booking_modified"
  event_id   = "SMOKE-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
  booking_id = "SMOKE-BOOKING-000"
  category   = "Royal Suite"
  check_in   = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
  check_out  = (Get-Date).AddDays(32).ToString("yyyy-MM-dd")
  guest_name = "Smoke Test"
} | ConvertTo-Json -Compress

# HMAC-SHA256 hex of the exact raw body
$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
$sig  = ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)) | ForEach-Object { $_.ToString("x2") }) -join ""

$url = "$BaseUrl/api/channel/webhook/mock"
Write-Host "POST $url"
try {
  $res = Invoke-RestMethod -Method Post -Uri $url -Body $body -ContentType "application/json" -Headers @{ "x-channel-signature" = $sig }
  Write-Host "RESPONSE:" ($res | ConvertTo-Json -Compress)
  Write-Host "PASS - webhook live. Clean the queued smoke row with:"
  Write-Host "  DELETE FROM sync_queue WHERE external_event_id LIKE 'SMOKE-%';"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "HTTP $code"
  switch ($code) {
    404 { Write-Host "Route not deployed yet - wait for the auto-PR pipeline / next Vercel deploy." }
    401 { Write-Host "Signature rejected - CHANNEL_WEBHOOK_SECRET in Vercel differs from .env.local (or is unset)." }
    403 { Write-Host "No active channel account - run: UPDATE channel_accounts SET status='active' WHERE provider='mock';" }
    default { Write-Host $_.Exception.Message }
  }
}
