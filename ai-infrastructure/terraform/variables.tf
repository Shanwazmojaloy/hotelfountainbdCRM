variable "aws_region" {
  description = "AWS region for all churn resources."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix for resources."
  type        = string
  default     = "hotelfountain"
}

variable "alert_email" {
  description = "Email to receive High-risk churn alerts (SNS). Empty = no subscription."
  type        = string
  default     = ""
}

variable "tenant_id" {
  description = "Tenant UUID passed to the scheduled batch job."
  type        = string
  default     = "46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8" # Hotel Fountain
}

variable "job_visibility_timeout" {
  description = "SQS visibility timeout (s); must exceed worst-case job runtime."
  type        = number
  default     = 360
}

variable "schedule_expression" {
  description = "EventBridge Scheduler expression for the nightly batch."
  type        = string
  default     = "cron(0 19 * * ? *)" # 19:00 UTC daily
}

variable "worker_lambda_name" {
  description = "Name of the deployed worker Lambda to schedule. Empty = skip schedule."
  type        = string
  default     = ""
}
