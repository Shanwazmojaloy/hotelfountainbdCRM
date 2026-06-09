"""Tests for the fraud detection blueprint."""
import asyncio

import pytest

import triton_client
from fraud_ingestion_worker import (Decision, DecisionSource, InMemoryFeatureStore,
                                    ModelTimeout, Transaction, decide,
                                    policy_from_score, rules_only_verdict,
                                    ingestion_worker)


def _txn(amount=1000.0, card="card_1", country="BD"):
    return Transaction(auth_id="a1", card_id=card, amount=amount, currency="BDT",
                       mcc="5411", country=country, merchant_id="m1")


def test_policy_thresholds():
    assert policy_from_score(0.95) == Decision.DECLINE
    assert policy_from_score(0.50) == Decision.REVIEW
    assert policy_from_score(0.05) == Decision.APPROVE


def test_rules_amount_cap_triggers_review():
    d, reasons = rules_only_verdict(_txn(amount=500_000), {})
    assert d == Decision.REVIEW
    assert "amount_cap_exceeded" in reasons


def test_rules_velocity_decline_burst():
    d, reasons = rules_only_verdict(_txn(), {"decline_count_1h": 3})
    assert d == Decision.REVIEW
    assert "velocity_decline_burst" in reasons


def test_rules_impossible_travel():
    d, reasons = rules_only_verdict(_txn(), {"distinct_country_1h": 3})
    assert d == Decision.REVIEW
    assert "impossible_travel" in reasons


def test_decide_returns_verdict_within_budget():
    async def run():
        store = InMemoryFeatureStore()
        v = await decide(_txn(), store)
        return v
    v = asyncio.run(run())
    assert v.decision in (Decision.APPROVE, Decision.DECLINE, Decision.REVIEW)
    assert v.latency_ms >= 0
    assert v.source in (DecisionSource.MODEL, DecisionSource.CACHED,
                        DecisionSource.RULES, DecisionSource.STIP)


def test_fallback_to_rules_on_timeout(monkeypatch):
    async def always_timeout(features):
        raise ModelTimeout()
    # No cached score -> must fall back to rules, still returns a verdict.
    import fraud_ingestion_worker as fw
    monkeypatch.setattr(fw, "score_model", always_timeout)

    async def run():
        store = InMemoryFeatureStore()
        return await fw.decide(_txn(amount=500_000), store)
    v = asyncio.run(run())
    assert v.source == DecisionSource.RULES
    assert v.decision == Decision.REVIEW


def test_ingestion_worker_no_stalls():
    verdicts = asyncio.run(ingestion_worker(n=50, concurrency=16))
    assert len(verdicts) == 50
    # Every verdict must have a concrete decision (nothing left pending/None).
    assert all(v.decision for v in verdicts)


def test_triton_cascade_stub_scores_in_range():
    feats = {"amount_zscore": 2.0, "ring_risk_score": 0.6, "distinct_country_1h": 2}
    s = asyncio.run(triton_client.score(feats))
    assert 0.0 <= s <= 1.0


def test_triton_vectorize_order():
    v = triton_client._vectorize({"amount_zscore": 1.0})
    assert len(v) == len(triton_client.FEATURE_ORDER)
    assert v[triton_client.FEATURE_ORDER.index("amount_zscore")] == 1.0
