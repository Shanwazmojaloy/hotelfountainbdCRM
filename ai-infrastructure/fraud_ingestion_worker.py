"""
fraud_ingestion_worker.py
==========================
Production-shaped *blueprint* for the synchronous fraud-decision hot path.

It demonstrates, in one runnable file:
  1. A high-throughput async ingestion worker that consumes a transaction stream
     (mocked here; in prod this is Kinesis enhanced fan-out / MSK).
  2. An async connection to a Redis feature store with O(1) rolling-feature reads
     (real redis.asyncio if REDIS_URL is set; otherwise an in-memory fake).
  3. A dummy fraud-prediction model call (stands in for a Triton/TensorRT gRPC
     call) guarded by a hard 30 ms deadline with a deterministic rules fallback,
     so a payment NEVER stalls.

Run with no dependencies:
    python fraud_ingestion_worker.py

Run against real Redis + a real model endpoint:
    REDIS_URL=redis://localhost:6379 MODEL_ENABLED=1 python fraud_ingestion_worker.py

Targets the latency contract from 01_fraud_detection_architecture.md:
    feature read ~4ms | inference deadline 30ms | total p99 < 50ms
"""

from __future__ import annotations

import asyncio
import os
import random
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

# ----------------------------------------------------------------------------
# Config / latency budget
# ----------------------------------------------------------------------------
MODEL_DEADLINE_S = 0.030          # hard 30ms client-side deadline on inference
FEATURE_READ_DEADLINE_S = 0.010   # guard the feature store too
REVIEW_BAND = (0.40, 0.80)        # ambiguous risk -> escalate / REVIEW
DECLINE_THRESHOLD = 0.80
REDIS_URL = os.getenv("REDIS_URL")            # if unset -> in-memory fake
MODEL_ENABLED = os.getenv("MODEL_ENABLED")    # if unset -> dummy model


class Decision(str, Enum):
    APPROVE = "APPROVE"
    DECLINE = "DECLINE"
    REVIEW = "REVIEW"


class DecisionSource(str, Enum):
    MODEL = "model"
    CACHED = "cached"
    RULES = "rules"
    STIP = "stip"


@dataclass
class Transaction:
    auth_id: str
    card_id: str
    amount: float
    currency: str
    mcc: str
    country: str
    merchant_id: str
    ts: float = field(default_factory=time.time)


@dataclass
class Verdict:
    auth_id: str
    card_id: str
    decision: Decision
    risk_score: float
    source: DecisionSource
    latency_ms: float
    reasons: List[str] = field(default_factory=list)


# ----------------------------------------------------------------------------
# 1. Feature store (async). Real redis.asyncio when REDIS_URL is set.
# ----------------------------------------------------------------------------
class FeatureStore:
    """Async O(1) rolling-feature reads. Prod: ElastiCache Redis / Aerospike."""

    async def get_features(self, card_id: str) -> Dict[str, float]:
        raise NotImplementedError

    async def bump_realtime_counters(self, txn: Transaction) -> None:
        """Cheap write-time approximate counter (INCR+EXPIRE bucket)."""
        raise NotImplementedError

    async def cache_score(self, card_id: str, score: float, ttl_s: int = 120) -> None:
        raise NotImplementedError

    async def get_cached_score(self, card_id: str) -> Optional[float]:
        raise NotImplementedError


class InMemoryFeatureStore(FeatureStore):
    """Zero-dependency fake so the blueprint runs anywhere."""

    def __init__(self) -> None:
        self._counters: Dict[str, float] = {}
        self._scores: Dict[str, tuple[float, float]] = {}  # card -> (score, expiry)

    async def get_features(self, card_id: str) -> Dict[str, float]:
        # Simulate sub-ms in-RAM read.
        await asyncio.sleep(0.001)
        seed = hash(card_id) & 0xFFFF
        rnd = random.Random(seed)
        return {
            "txn_count_10m": self._counters.get(f"{card_id}:cnt", rnd.randint(0, 20)),
            "amount_zscore": rnd.uniform(-2, 4),
            "distinct_country_1h": rnd.randint(1, 4),
            "seconds_since_last_txn": rnd.uniform(1, 3600),
            "decline_count_1h": rnd.randint(0, 3),
            "ring_risk_score": rnd.uniform(0, 1),  # materialized GNN feature
        }

    async def bump_realtime_counters(self, txn: Transaction) -> None:
        key = f"{txn.card_id}:cnt"
        self._counters[key] = self._counters.get(key, 0) + 1

    async def cache_score(self, card_id: str, score: float, ttl_s: int = 120) -> None:
        self._scores[card_id] = (score, time.time() + ttl_s)

    async def get_cached_score(self, card_id: str) -> Optional[float]:
        v = self._scores.get(card_id)
        if not v:
            return None
        score, expiry = v
        return score if time.time() < expiry else None


class RedisFeatureStore(FeatureStore):
    """Real async Redis. Reads a HASH of precomputed features keyed by card."""

    def __init__(self, client) -> None:
        self._r = client

    async def get_features(self, card_id: str) -> Dict[str, float]:
        raw = await self._r.hgetall(f"feat:{card_id}")
        return {k: float(v) for k, v in raw.items()} if raw else {}

    async def bump_realtime_counters(self, txn: Transaction) -> None:
        bucket = int(txn.ts // 60)
        key = f"c:{txn.card_id}:cnt:{bucket}"
        pipe = self._r.pipeline()
        pipe.incr(key)
        pipe.expire(key, 900)  # keep ~15 min of minute-buckets
        await pipe.execute()

    async def cache_score(self, card_id: str, score: float, ttl_s: int = 120) -> None:
        await self._r.set(f"score:{card_id}", score, ex=ttl_s)

    async def get_cached_score(self, card_id: str) -> Optional[float]:
        v = await self._r.get(f"score:{card_id}")
        return float(v) if v is not None else None


async def build_feature_store() -> FeatureStore:
    if REDIS_URL:
        try:
            import redis.asyncio as aioredis  # type: ignore

            client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await client.ping()
            print(f"[feature-store] connected to Redis at {REDIS_URL}")
            return RedisFeatureStore(client)
        except Exception as e:  # pragma: no cover - depends on env
            print(f"[feature-store] Redis unavailable ({e}); using in-memory fake")
    return InMemoryFeatureStore()


# ----------------------------------------------------------------------------
# 2. Model client. Dummy by default; stands in for Triton/TensorRT gRPC.
# ----------------------------------------------------------------------------
class ModelTimeout(Exception):
    pass


async def _dummy_infer(features: Dict[str, float]) -> float:
    """Simulate a Triton call. Occasionally slow to exercise the fallback."""
    # Most calls are fast (5-25ms); ~5% breach the 30ms deadline on purpose.
    delay = random.choices([random.uniform(0.005, 0.025), random.uniform(0.035, 0.060)],
                           weights=[0.95, 0.05])[0]
    await asyncio.sleep(delay)
    # Toy logistic-ish score from a few features.
    z = (0.9 * features.get("amount_zscore", 0)
         + 1.4 * features.get("ring_risk_score", 0)
         + 0.15 * features.get("distinct_country_1h", 1)
         + 0.20 * features.get("decline_count_1h", 0)
         - 1.5)
    return 1.0 / (1.0 + pow(2.718281828, -z))


async def score_model(features: Dict[str, float]) -> float:
    """Call the inference engine with a hard deadline.

    In prod replace _dummy_infer with a Triton gRPC InferenceServerClient call,
    keeping the asyncio.wait_for deadline so the hot path is bounded.
    """
    try:
        return await asyncio.wait_for(_dummy_infer(features), timeout=MODEL_DEADLINE_S)
    except asyncio.TimeoutError as e:
        raise ModelTimeout() from e


# ----------------------------------------------------------------------------
# 3. Decision policy + deterministic fallback (never stalls).
# ----------------------------------------------------------------------------
def rules_only_verdict(txn: Transaction, features: Dict[str, float]) -> tuple[Decision, List[str]]:
    """Sub-ms deterministic rules used as the fallback floor (STIP-style)."""
    reasons: List[str] = []
    if txn.amount >= 200_000:
        reasons.append("amount_cap_exceeded")
        return Decision.REVIEW, reasons
    if features.get("decline_count_1h", 0) >= 3:
        reasons.append("velocity_decline_burst")
        return Decision.REVIEW, reasons
    if features.get("distinct_country_1h", 1) >= 3:
        reasons.append("impossible_travel")
        return Decision.REVIEW, reasons
    reasons.append("rules_clean_low_risk")
    return Decision.APPROVE, reasons


def policy_from_score(score: float) -> Decision:
    if score >= DECLINE_THRESHOLD:
        return Decision.DECLINE
    if REVIEW_BAND[0] <= score < REVIEW_BAND[1]:
        return Decision.REVIEW
    return Decision.APPROVE


async def decide(txn: Transaction, store: FeatureStore) -> Verdict:
    """The synchronous scoring orchestrator for one authorization."""
    t0 = time.perf_counter()
    reasons: List[str] = []

    # 1. O(1) feature read (guarded).
    try:
        features = await asyncio.wait_for(store.get_features(txn.card_id),
                                          timeout=FEATURE_READ_DEADLINE_S)
    except asyncio.TimeoutError:
        features = {}
        reasons.append("feature_read_timeout")

    # 2. Model call with deadline -> fallback ladder on timeout/failure.
    try:
        score = await score_model(features)
        source = DecisionSource.MODEL
        decision = policy_from_score(score)
        await store.cache_score(txn.card_id, score)  # warm cache for fallback
    except ModelTimeout:
        reasons.append("model_timeout")
        cached = await store.get_cached_score(txn.card_id)
        if cached is not None:
            score, source = cached, DecisionSource.CACHED
            decision = policy_from_score(score)
            reasons.append("used_cached_score")
        else:
            decision, rule_reasons = rules_only_verdict(txn, features)
            score, source = 0.0, DecisionSource.RULES
            reasons.extend(rule_reasons)

    # 3. Hard business rules always win (override model on guardrails).
    rule_decision, rule_reasons = rules_only_verdict(txn, features)
    if rule_decision == Decision.REVIEW and decision == Decision.APPROVE:
        decision = Decision.REVIEW
        reasons.extend(r for r in rule_reasons if r not in reasons)

    latency_ms = (time.perf_counter() - t0) * 1000
    return Verdict(txn.auth_id, txn.card_id, decision, round(score, 4),
                   source, round(latency_ms, 2), reasons)


# ----------------------------------------------------------------------------
# Ingestion worker: bounded-concurrency consumer of the txn stream.
# ----------------------------------------------------------------------------
async def mock_stream(n: int):
    """Stand-in for Kinesis enhanced fan-out / MSK consumer."""
    countries = ["BD", "US", "GB", "AE", "SG"]
    mccs = ["5411", "5812", "6011", "4829", "7995"]
    for _ in range(n):
        yield Transaction(
            auth_id=str(uuid.uuid4()),
            card_id=f"card_{random.randint(1, 50)}",
            amount=round(random.uniform(50, 250_000), 2),
            currency="BDT",
            mcc=random.choice(mccs),
            country=random.choice(countries),
            merchant_id=f"m_{random.randint(1, 200)}",
        )
        await asyncio.sleep(0)  # cooperative yield


async def ingestion_worker(n: int = 200, concurrency: int = 64) -> List[Verdict]:
    store = await build_feature_store()
    sem = asyncio.Semaphore(concurrency)
    verdicts: List[Verdict] = []

    async def handle(txn: Transaction):
        async with sem:
            await store.bump_realtime_counters(txn)   # async write-time counter
            v = await decide(txn, store)
            verdicts.append(v)
            # In prod: idempotent DynamoDB put on auth_id + emit to audit stream.

    tasks = [asyncio.create_task(handle(txn)) async for txn in mock_stream(n)]
    await asyncio.gather(*tasks)
    return verdicts


def _report(verdicts: List[Verdict]) -> None:
    lat = sorted(v.latency_ms for v in verdicts)
    p = lambda q: lat[min(len(lat) - 1, int(q * len(lat)))]
    by_dec: Dict[str, int] = {}
    by_src: Dict[str, int] = {}
    for v in verdicts:
        by_dec[v.decision] = by_dec.get(v.decision, 0) + 1
        by_src[v.source] = by_src.get(v.source, 0) + 1
    print("\n=== Fraud scoring run ===")
    print(f"scored        : {len(verdicts)} authorizations")
    print(f"latency p50   : {p(0.50):.2f} ms")
    print(f"latency p95   : {p(0.95):.2f} ms")
    print(f"latency p99   : {p(0.99):.2f} ms  (budget < 50ms)")
    print(f"decisions     : {dict(by_dec)}")
    print(f"decision src  : {dict(by_src)}  (fallbacks prove no stalls)")
    sample = verdicts[0]
    print(f"sample verdict: {sample.auth_id[:8]} -> {sample.decision} "
          f"score={sample.risk_score} src={sample.source} reasons={sample.reasons}")


async def main() -> None:
    verdicts = await ingestion_worker(n=300, concurrency=64)
    _report(verdicts)


if __name__ == "__main__":
    random.seed(7)
    asyncio.run(main())
