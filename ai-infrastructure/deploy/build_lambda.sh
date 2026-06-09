#!/usr/bin/env bash
# =============================================================================
# Build + deploy the churn worker as an AWS Lambda (handler: tasks.lambda_handler)
# Idempotent: creates the function on first run, updates it thereafter.
#
# Prereqs: aws CLI configured, terraform applied (for the IAM role), Docker OR a
# Linux x86_64 host for building manylinux wheels.
#
# Usage:
#   ./deploy/build_lambda.sh
# Env (override as needed):
#   FUNCTION_NAME   default: hotelfountain-churn-worker
#   REGION          default: ap-south-1
#   ROLE_ARN        default: read from `terraform output -raw worker_role_arn`
#   RUNTIME         default: python3.12
#   MEMORY_MB       default: 512
#   TIMEOUT_S       default: 300
# Secrets/env the function needs at runtime (set via --environment below):
#   ANTHROPIC_API_KEY, DATABASE_URL, BEDROCK_REGION, SNS_TOPIC_ARN,
#   EMAIL_PROVIDER, GMAIL_USER, GMAIL_APP_PASSWORD
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # ai-infrastructure/
cd "$HERE"

FUNCTION_NAME="${FUNCTION_NAME:-hotelfountain-churn-worker}"
REGION="${REGION:-ap-south-1}"
RUNTIME="${RUNTIME:-python3.12}"
MEMORY_MB="${MEMORY_MB:-512}"
TIMEOUT_S="${TIMEOUT_S:-300}"
HANDLER="tasks.lambda_handler"
BUILD="$HERE/.lambda_build"
ZIP="$HERE/churn_lambda.zip"

if [ -z "${ROLE_ARN:-}" ]; then
  if [ -d "$HERE/terraform" ]; then
    ROLE_ARN="$(terraform -chdir="$HERE/terraform" output -raw worker_role_arn)"
  fi
fi
[ -n "${ROLE_ARN:-}" ] || { echo "ERROR: set ROLE_ARN (or run terraform apply first)"; exit 1; }

echo "==> Packaging into $BUILD"
rm -rf "$BUILD" "$ZIP"
mkdir -p "$BUILD"

# manylinux wheels so native deps (psycopg) work on the Lambda runtime
python3 -m pip install -r requirements-churn.txt -t "$BUILD" \
  --platform manylinux2014_x86_64 --implementation cp \
  --python-version 312 --only-binary=:all: --upgrade

# app code (modules the handler imports)
cp churn_worker.py ingest.py tasks.py batch_score.py alerter.py "$BUILD/"

echo "==> Zipping"
( cd "$BUILD" && zip -qr "$ZIP" . )
echo "    $(du -h "$ZIP" | cut -f1) -> $ZIP"

ENV_VARS="Variables={ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-},DATABASE_URL=${DATABASE_URL:-},BEDROCK_REGION=${BEDROCK_REGION:-$REGION},SNS_TOPIC_ARN=${SNS_TOPIC_ARN:-},EMAIL_PROVIDER=${EMAIL_PROVIDER:-stub},GMAIL_USER=${GMAIL_USER:-},GMAIL_APP_PASSWORD=${GMAIL_APP_PASSWORD:-}}"

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Updating existing function code + config"
  aws lambda update-function-code --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" --handler "$HANDLER" --role "$ROLE_ARN" \
    --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
    --environment "$ENV_VARS" --region "$REGION" >/dev/null
else
  echo "==> Creating function $FUNCTION_NAME"
  aws lambda create-function --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" --handler "$HANDLER" --role "$ROLE_ARN" \
    --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
    --environment "$ENV_VARS" \
    --zip-file "fileb://$ZIP" --region "$REGION" >/dev/null
fi

echo "==> Done. Test it:"
echo "   aws lambda invoke --function-name $FUNCTION_NAME --region $REGION \\"
echo "     --payload '{\"mode\":\"batch\",\"tenant_id\":\"46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8\"}' /dev/stdout"
echo "   (single account: --payload '{\"account_id\":\"<uuid>\",\"thread_id\":\"<id>\",\"tenant_id\":\"<uuid>\"}')"
