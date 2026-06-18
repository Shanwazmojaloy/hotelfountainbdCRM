output "sqs_queue_url" {
  description = "Set as SQS_QUEUE_URL for the worker."
  value       = aws_sqs_queue.jobs.url
}

output "sqs_dlq_url" {
  value = aws_sqs_queue.dlq.url
}

output "sns_topic_arn" {
  description = "Set as SNS_TOPIC_ARN for alerter.py."
  value       = aws_sns_topic.alerts.arn
}

output "worker_role_arn" {
  description = "Attach to the Lambda/Fargate task running the worker."
  value       = aws_iam_role.worker.arn
}

output "schedule_name" {
  value       = try(aws_scheduler_schedule.nightly[0].name, "(not created — set worker_lambda_name)")
  description = "EventBridge schedule (only when worker_lambda_name is set)."
}
