"""Tests for the churn predictor blueprint."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

import alerter
import ingest
from churn_worker import (EmailMessage, EmailThread, MockCRM, PostgresCRM,
                          llm_extract_risk, process_thread, sentiment_slope,
                          validate_assessment)


def _thread(bodies, tenant=None, account="acct_1"):
    now = datetime.now(timezone.utc)
    msgs = [EmailMessage(f"m{i}", "inbound", now - timedelta(days=30 * (len(bodies) - i)), b)
            for i, b in enumerate(bodies)]
    return EmailThread(account_id=account, thread_id="t1", messages=msgs, tenant_id=tenant)


def test_sentiment_slope_negative_for_worsening():
    t = _thread(["thanks this is great, we love it",
                 "a bug appeared, getting frustrated",
                 "too expensive, may cancel and move to a competitor"])
    assert sentiment_slope(t) < 0


def test_sentiment_slope_zero_single_message():
    t = _thread(["just one message"])
    assert sentiment_slope(t) == 0.0


def test_high_risk_on_churn_signals():
    t = _thread(["thanks, all good",
                 "the renewal quote is too expensive and we may not renew",
                 "we're evaluating a competitor"])
    profile = process_thread(t, MockCRM())
    assert profile["risk_status"] == "High"
    assert 0.0 <= profile["churn_score"] <= 1.0
    factors = {r["factor"] for r in profile["reasons"]}
    assert {"contract_signal", "competitor_mention"} & factors


def test_low_risk_on_happy_thread():
    t = _thread(["thanks so much, the team loves the product",
                 "great support, really appreciate it"])
    profile = process_thread(t, MockCRM())
    assert profile["risk_status"] == "Low"


def test_validate_assessment_rejects_bad_score():
    with pytest.raises(Exception):
        validate_assessment({"risk_status": "High", "churn_score": 1.5, "reasons": []})


def test_llm_extract_returns_valid_assessment():
    a = llm_extract_risk("the renewal pricing is too expensive, evaluating a competitor")
    assert a.risk_status in ("Low", "Medium", "High")
    assert 0.0 <= a.churn_score <= 1.0


def test_postgres_crm_requires_tenant():
    crm = PostgresCRM.__new__(PostgresCRM)   # skip __init__ (no psycopg/db needed)
    with pytest.raises(ValueError):
        crm.upsert_churn_profile("acct_1", {"tenant_id": None, "risk_status": "High",
                                            "churn_score": 0.9, "sentiment_slope": -0.1,
                                            "reasons": []})


# ---- ingestion ----
def test_chunking_and_embedding_dim():
    t = _thread(["hello world " * 5, "another message here"])
    chunks = ingest.chunk_thread(t)
    assert len(chunks) >= 2
    embs = ingest.embed_texts([c.content for c in chunks])
    assert all(len(e) == ingest.EMBED_DIM for e in embs)


def test_stub_embed_is_unit_norm_and_deterministic():
    a = ingest._stub_embed("same text")
    b = ingest._stub_embed("same text")
    assert a == b
    norm = sum(x * x for x in a) ** 0.5
    assert abs(norm - 1.0) < 1e-6


def test_ingest_thread_to_mock_store():
    store = ingest.MockChunkStore()
    n = ingest.ingest_thread("acct_1", "t1", None, store=store)
    assert n == len(store.rows) > 0
    assert all(c.embedding is not None for c in store.rows)


# ---- alerting ----
def test_alert_fires_on_tier_increase():
    prof = {"account_id": "a", "risk_status": "High", "churn_score": 0.9,
            "sentiment_slope": -0.3, "reasons": [], "recommended_action": "x"}
    assert alerter.send_alert(prof, prev_status="Medium") is True


def test_no_realert_when_already_high():
    prof = {"account_id": "a", "risk_status": "High", "churn_score": 0.9,
            "sentiment_slope": -0.3, "reasons": [], "recommended_action": "x"}
    assert alerter.send_alert(prof, prev_status="High") is False


def test_pgchunkstore_vec_format():
    assert ingest.PgChunkStore._vec([0.5, -0.25]) == "[0.500000,-0.250000]"
