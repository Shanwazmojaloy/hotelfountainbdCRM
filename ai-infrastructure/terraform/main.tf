###############################################################################
# Churn predictor — AWS resources (SQS + DLQ, SNS alerts, EventBridge schedule,
# worker IAM role). Minimal, additive, and safe to `terraform destroy`.
#
#   terraform init && terraform apply
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "me" {}

locals {
  name = "${var.project}-churn"
  tags = {
    Project   = var.project
    Component = "churn-predictor"
    ManagedBy = "terraform"
  }
}

# --- Job queue + dead-letter queue --------------------------------------------
resource "aws_sqs_queue" "dlq" {
  name                      = "${local.name}-dlq"
  message_retention_seconds = 1209600 # 14 days
  tags                      = local.tags
}

resource "aws_sqs_queue" "jobs" {
  name                       = "${local.name}-jobs"
  visibility_timeout_seconds = var.job_visibility_timeout # > worst-case job time
  message_retention_seconds  = 345600                     # 4 days
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
  tags = local.tags
}

# --- High-risk alert topic + email subscription -------------------------------
resource "aws_sns_topic" "alerts" {
  name = "${local.name}-high-risk"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# --- Worker IAM role ----------------------------------------------------------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com", "ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${local.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "worker" {
  # Consume jobs, send to DLQ
  statement {
    actions = [
      "sqs:ReceiveMessage", "sqs:DeleteMessage",
      "sqs:GetQueueAttributes", "sqs:SendMessage",
    ]
    resources = [aws_sqs_queue.jobs.arn, aws_sqs_queue.dlq.arn]
  }
  # Publish alerts
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
  # Read secrets (Anthropic key, DB URL, provider tokens)
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.me.account_id}:secret:churn/*"]
  }
  # Invoke Bedrock embeddings
  statement {
    actions   = ["bedrock:InvokeModel"]
    resources = ["arn:aws:bedrock:${var.aws_region}::foundation-model/amazon.titan-embed-text-v2:0"]
  }
  # Basic logging
  statement {
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.me.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "${local.name}-worker"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

# --- EventBridge schedule (nightly batch re-scoring) --------------------------
# Targets a Lambda named var.worker_lambda_name if you deploy one (Option A).
# If you run Celery on Fargate instead, point this at an "enqueuer" Lambda.
resource "aws_scheduler_schedule" "nightly" {
  count      = var.worker_lambda_name == "" ? 0 : 1
  name       = "${local.name}-nightly"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression # default: 19:00 UTC daily
  schedule_expression_timezone = "UTC"

  target {
    arn      = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.me.account_id}:function:${var.worker_lambda_name}"
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ mode = "batch", tenant_id = var.tenant_id })
  }
}

resource "aws_iam_role" "scheduler" {
  count = var.worker_lambda_name == "" ? 0 : 1
  name  = "${local.name}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "scheduler" {
  count = var.worker_lambda_name == "" ? 0 : 1
  name  = "${local.name}-scheduler"
  role  = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.me.account_id}:function:${var.worker_lambda_name}"
    }]
  })
}
