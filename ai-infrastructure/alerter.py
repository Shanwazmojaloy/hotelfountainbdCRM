"""
alerter.py
==========
High-risk churn alerting. Emits to SNS (-> Slack/email + CRM task) when an
account crosses into High risk or jumps a tier. Console fallback when SNS
isn't configured, so it always runs.

Real path gated by SNS_TOPIC_ARN (+ boto3). Idempotency: we only alert on a
tier *increase*, so re-scoring an already-High account stays quiet.
"""

from __future__ import annotations

import json
import os
from typing import Optional

_TIER_RANK = {"Low": 0, "Medium": 1, "High": 2}


def tier_increased(prev_status: Optional[str], new_status: str) -> bool:
    return _TIER_RANK.get(new_status, 0) > _TIER_RANK.get(prev_status or "Low", 0)


def should_alert(prev_status: Optional[str], new_status: str) -> bool:
    """Alert when newly High, or on any upward tier move."""
    if new_status == "High" and prev_status != "High":
        return True
    return tier_increased(prev_status, new_status)


def build_message(profile: dict) -> dict:
    reasons = profile.get("reasons", [])
    top = "; ".join(f"{r['factor']}({r['severity']})" for r in reasons[:3]) or "n/a"
    return {
        "account_id": profile["account_id"],
        "tenant_id": profile.get("tenant_id"),
        "risk_status": profile["risk_status"],
        "churn_score": profile["churn_score"],
        "sentiment_slope": profile.get("sentiment_slope"),
        "top_factors": top,
        "recommended_action": profile.get("recommended_action", ""),
    }


def send_alert(profile: dict, prev_status: Optional[str] = None) -> bool:
    """Returns True if an alert was actually emitted."""
    if not should_alert(prev_status, profile["risk_status"]):
        return False

    msg = build_message(profile)
    topic = os.getenv("SNS_TOPIC_ARN")
    if topic:
        try:
            _sns_publish(topic, msg)
            print(f"[alert:sns] published High-risk alert for {msg['account_id']}")
            return True
        except Exception as e:  # pragma: no cover
            print(f"[alert] SNS publish failed ({e}); console fallback")

    print(f"[alert:console] {msg['risk_status']} risk | account={msg['account_id']} "
          f"score={msg['churn_score']} | {msg['top_factors']} "
          f"| action: {msg['recommended_action']}")
    return True


def _sns_publish(topic_arn: str, msg: dict) -> None:  # pragma: no cover
    import boto3  # type: ignore

    sns = boto3.client("sns")
    sns.publish(
        TopicArn=topic_arn,
        Subject=f"[Churn] {msg['risk_status']} risk: account {msg['account_id']}",
        Message=json.dumps(msg, indent=2),
        MessageAttributes={
            "risk_status": {"DataType": "String", "StringValue": msg["risk_status"]},
            "tenant_id": {"DataType": "String",
                          "StringValue": str(msg.get("tenant_id") or "")},
        },
    )


if __name__ == "__main__":
    demo = {
        "account_id": "acct_042", "tenant_id": None, "risk_status": "High",
        "churn_score": 0.82, "sentiment_slope": -0.41,
        "reasons": [{"factor": "contract_signal", "severity": "high", "evidence": "x"},
                    {"factor": "pricing_complaint", "severity": "medium", "evidence": "y"}],
        "recommended_action": "Exec-sponsor save play; QBR within 7 days",
    }
    print("newly High from Medium  ->", send_alert(demo, prev_status="Medium"))
    print("still High (no re-alert) ->", send_alert(demo, prev_status="High"))
