"""
batch_score.py
==============
Orchestrates a churn-scoring pass over many accounts. This is the body of the
EventBridge-scheduled job: pull accounts due for re-scoring, ingest + score each,
write the profile, and fire alerts on tier increases.

Standalone (mock accounts, stub LLM, in-memory stores):
    python batch_score.py

Real run (Supabase + alerts):
    DATABASE_URL=... SNS_TOPIC_ARN=... DEMO_TENANT_ID=<uuid> python batch_score.py
"""

from __future__ import annotations

import os
from typing import List, Optional, Tuple

import alerter
from churn_worker import build_crm, process_thread
from ingest import build_chunk_store, fetch_thread, ingest_thread


def accounts_due(tenant_id: Optional[str], limit: int = 100) -> List[Tuple[str, str]]:
    """Return [(account_id, thread_id)] due for re-scoring.

    Real impl: query accounts with new inbound mail since last_scored_at, e.g.
        select account_id, latest_thread_id from <crm_accounts>
        where tenant_id=%s and (last_scored_at is null
              or last_inbound_at > last_scored_at) limit %s
    """
    dsn = os.getenv("DATABASE_URL")
    if dsn and tenant_id:
        try:
            return _accounts_due_pg(dsn, tenant_id, limit)
        except Exception as e:  # pragma: no cover
            print(f"[batch] account query failed ({e}); using mock list")
    # Mock backlog
    return [("acct_042", "thr_1001"), ("acct_088", "thr_2002")]


def _accounts_due_pg(dsn: str, tenant_id: str, limit: int):  # pragma: no cover
    import psycopg  # type: ignore
    q = """
        select distinct account_id, thread_id
        from public.email_chunks
        where tenant_id = %s
        order by account_id
        limit %s
    """
    with psycopg.connect(dsn) as conn:
        return [(r[0], r[1]) for r in conn.execute(q, (tenant_id, limit)).fetchall()]


def prev_status(crm, account_id: str) -> Optional[str]:
    get = getattr(crm, "get", None)
    if get:
        prof = get(account_id)
        if prof:
            return prof.get("risk_status")
    return None


def run_batch(tenant_id: Optional[str] = None) -> dict:
    crm = build_crm()
    chunk_store = build_chunk_store()
    due = accounts_due(tenant_id)
    summary = {"scored": 0, "alerted": 0, "high": 0}

    for account_id, thread_id in due:
        # 1. Ingest fresh mail into the vector store (chunks + embeddings).
        ingest_thread(account_id, thread_id, tenant_id, store=chunk_store)
        # 2. Score the thread (LLM structured extraction + trend).
        thread = fetch_thread(account_id, thread_id, tenant_id)
        before = prev_status(crm, account_id)
        profile = process_thread(thread, crm)
        # 3. Alert on tier increase.
        if alerter.send_alert(profile, prev_status=before):
            summary["alerted"] += 1
        summary["scored"] += 1
        summary["high"] += int(profile["risk_status"] == "High")

    print(f"\n[batch] {summary}")
    return summary


if __name__ == "__main__":
    run_batch(os.getenv("DEMO_TENANT_ID"))
