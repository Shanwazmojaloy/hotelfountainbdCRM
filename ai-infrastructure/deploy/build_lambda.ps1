# =============================================================================
# build_lambda.ps1  —  Build + deploy the churn worker as an AWS Lambda (Windows)
# Handler: tasks.lambda_handler. Idempotent: creates, then updates.
#
# Prereqs (check first):
#   aws --version          (AWS CLI v2)         https://aws.amazon.com/cli/
#   terraform -version     (>= 1.5, optional)   https://developer.hashicorp.com/terraform/install
#   python --version       (3.11+)
#
# Run from the ai-infrastructure folder:
#   cd "C:\Users\ahmed\OneDrive\Desktop\New folder\claude\hotelfountainbd-vercel\ai-infrastructure"
#   $env:ROLE_ARN          = "arn:aws:iam::<acct>:role/hotelfountain-churn-worker"
#   $env:ANTHROPIC_API_KEY = "sk-ant-..."
#   $env:DATABASE_URL      = "postgresql://postgres:<pwd>@db.mynwfkgksqqwlqowlscj.supabase.co:5432/postgres"
#   $env:SNS_TOPIC_ARN     = "arn:aws:sns:ap-south-1:<acct>:hotelfountain-churn-high-risk"
#   .\deploy\build_lambda.ps1
# =============================================================================
param(
  [string]$FunctionName = "hotelfountain-churn-worker",
  [string]$Region       = "ap-south-1",
  [string]$Runtime      = "python3.12",
  [int]   $MemoryMb     = 512,
  [int]   $TimeoutS     = 300
)
$ErrorActionPreference = "Stop"
$Handler = "tasks.lambda_handler"

# Resolve repo root (parent of this script's /deploy folder)
$Root  = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Build = Join-Path $Root ".lambda_build"
$Zip   = Join-Path $Root "churn_lambda.zip"

# Role ARN: prefer env, else read terraform output
$RoleArn = $env:ROLE_ARN
if (-not $RoleArn -and (Test-Path "$Root\terraform")) {
  $RoleArn = (terraform -chdir="$Root\terraform" output -raw worker_role_arn)
}
if (-not $RoleArn) { throw "Set `$env:ROLE_ARN (or run terraform apply first)." }

Write-Host "==> Packaging into $Build"
if (Test-Path $Build) { Remove-Item -Recurse -Force $Build }
if (Test-Path $Zip)   { Remove-Item -Force $Zip }
New-Item -ItemType Directory -Path $Build | Out-Null

# manylinux wheels so native deps (psycopg) run on the Lambda runtime
python -m pip install -r requirements-churn.txt -t $Build `
  --platform manylinux2014_x86_64 --implementation cp `
  --python-version 312 --only-binary=:all: --upgrade

# app code the handler imports
Copy-Item churn_worker.py,ingest.py,tasks.py,batch_score.py,alerter.py $Build

Write-Host "==> Zipping"
Compress-Archive -Path (Join-Path $Build '*') -DestinationPath $Zip -Force
Write-Host ("    {0:N1} MB -> {1}" -f ((Get-Item $Zip).Length/1MB), $Zip)

# Build the environment map for the function
$envPairs = @{
  ANTHROPIC_API_KEY  = $env:ANTHROPIC_API_KEY
  DATABASE_URL       = $env:DATABASE_URL
  BEDROCK_REGION     = ($env:BEDROCK_REGION, $Region -ne $null)[0]
  SNS_TOPIC_ARN      = $env:SNS_TOPIC_ARN
  EMAIL_PROVIDER     = ($env:EMAIL_PROVIDER, "stub" -ne $null)[0]
  GMAIL_USER         = $env:GMAIL_USER
  GMAIL_APP_PASSWORD = $env:GMAIL_APP_PASSWORD
}
$kv = ($envPairs.GetEnumerator() | Where-Object { $_.Value } | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ","
$EnvArg = "Variables={$kv}"

$exists = $true
try { aws lambda get-function --function-name $FunctionName --region $Region | Out-Null } catch { $exists = $false }

if ($exists) {
  Write-Host "==> Updating function code + config"
  aws lambda update-function-code --function-name $FunctionName --zip-file "fileb://$Zip" --region $Region | Out-Null
  aws lambda wait function-updated --function-name $FunctionName --region $Region
  aws lambda update-function-configuration --function-name $FunctionName `
    --runtime $Runtime --handler $Handler --role $RoleArn `
    --timeout $TimeoutS --memory-size $MemoryMb --environment $EnvArg --region $Region | Out-Null
} else {
  Write-Host "==> Creating function $FunctionName"
  aws lambda create-function --function-name $FunctionName `
    --runtime $Runtime --handler $Handler --role $RoleArn `
    --timeout $TimeoutS --memory-size $MemoryMb --environment $EnvArg `
    --zip-file "fileb://$Zip" --region $Region | Out-Null
}

Write-Host "==> Done. Test it (nightly batch):"
Write-Host "   aws lambda invoke --function-name $FunctionName --region $Region --payload '{\"mode\":\"batch\",\"tenant_id\":\"46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8\"}' out.json; type out.json"
