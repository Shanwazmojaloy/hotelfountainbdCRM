"""
tasks.py
========
Celery task wiring + AWS Lambda handler for the churn pipeline.

The Celery chain mirrors 02_churn_predictor_architecture.md section 2.1:
    ingest_emails -> score_account -> (alert handled inside score)

Celery is optional: if it isn't installed we expose plain callables with the
same names so the module imports and the logic is testable everywhere.

Start a worker (prod):
    celery -A tasks worker --loglevel=info
Broker/result backend via env:
    CELERY_BROKER_URL (e.g. sqs:// or redis://), CELERY_RESULT_BACKEND
"""

from __future__ import annotations

import os
from typing import Optional

import alerter
from churn_worker import build_crm, process_thread
from ingest import build_chunk_store, fetch_thread, ingest_thread

try:
    from celery import Celery  # type: ignore
    _HAS_CELERY = True
except Exception:  # pragma: no cover
    _HAS_CELERY = False


if _HAS_CELERY:
    app = Celery(
        "churn",
        broker=os.getenv("CELERY_BROKER_URL", "memory://"),
        backend=os.getenv("CELERY_RESULT_BACKEND", "cache+memory://"),
    )
    task = app.task
else:  # no-op decorator so the callables still work
    app = None

    def task(*dargs, **dkwargs):
        def wrap(fn):
            return fn
        return wrap if (not dargs or not callable(dargs[0])) else dargs[0]


@task(name="churn.ingest_emails")
def ingest_emails(account_id: str, thread_id: str,
                  tenant_id: Optional[str] = None) -> dict:
    n = ingest_thread(account_id, thread_id, tenant_id, store=build_chunk_store())
    return {"account_id": account_id, "thread_id": thread_id,
            "tenant_id": tenant_id, "chunks": n}


@task(name="churn.score_account")
def score_account(ctx: dict) -> dict:
    crm = build_crm()
    before = None
    get = getattr(crm, "get", None)
    if get and get(ctx["account_id"]):
        before = get(ctx["account_id"]).get("risk_status")
    thread = fetch_thread(ctx["account_id"], ctx["thread_id"], ctx.get("tenant_id"))
    profile = process_thread(thread, crm)
    alerter.send_alert(profile, prev_status=before)
    return profile


def score_pipeline(account_id: str, thread_id: str,
                   tenant_id: Optional[str] = None):
    """Build the ingest->score chain (Celery signature when available)."""
    if _HAS_CELERY:
        return (ingest_emails.s(account_id, thread_id, tenant_id)
                | score_account.s())
    # Synchronous fallback
    return score_account(ingest_emails(account_id, thread_id, tenant_id))


# ---------------------------------------------------------------------------
# AWS Lambda handler (reactive per-email path: EventBridge/SQS -> Lambda).
# ---------------------------------------------------------------------------
def lambda_handler(event, context=None):  # pragma: no cover
    """Two invocation modes:
      * batch  — {"mode": "batch", "tenant_id": "<uuid>"} re-scores every account
                 due (the nightly EventBridge schedule sends this).
      * record — SQS records, or {account_id, thread_id, tenant_id}, scores those
                 (the reactive per-email path).
    """
    import json

    if isinstance(event, dict) and event.get("mode") == "batch":
        from batch_score import run_batch
        return run_batch(event.get("tenant_id"))

    results = []
    for record in event.get("Records", [event]):
        body = record.get("body", record)
        if isinstance(body, str):
            body = json.loads(body)
        ctx = ingest_emails(body["account_id"], body["thread_id"],
                            body.get("tenant_id"))
        results.append(score_account(ctx))
    return {"processed": len(results)}


if __name__ == "__main__":
    out = score_pipeline("acct_042", "thr_1001", os.getenv("DEMO_TENANT_ID"))
    # In sync fallback `out` is the profile; with Celery it's a signature.
    print("pipeline result:", getattr(out, "risk_status", out))
