# Real-Time Fraud Detection — AWS-Native System Architecture

**Author role:** Principal Cloud Solutions Architect, High-Frequency Financial Infrastructure
**Goal:** Score every card authorization for fraud **before** the charge is approved, at **millions of TPS**, with a **p99 end-to-end budget under 50 ms** and **zero message loss**.

---

## 0. Design Principles

1. **Inline, not after-the-fact.** The model verdict gates the auth response. This is a *synchronous decision in the payment path*, not a batch job. The streaming layer (Kinesis/MSK) is for feature aggregation and audit, **not** for the blocking decision.
2. **Latency budget is a contract.** Every hop gets an explicit ms allocation. If any hop blows its budget, a deterministic fallback fires so no payment hangs.
3. **Features are precomputed.** At decision time we only do O(1) reads from an in-memory store — never aggregations.
4. **Fail toward a business rule, never toward a stall.** A timeout produces a verdict (`REVIEW`/rules-only), it does not block the cardholder.

---

## 1. End-to-End Latency Budget (p99 target ≤ 50 ms)

| Hop | Component | Budget (ms) |
|-----|-----------|------------:|
| Auth gateway → Scoring API (TLS, in-VPC) | ALB / gRPC | 3 |
| Feature fetch | ElastiCache (Redis) / Aerospike `MGET` | 4 |
| Feature assembly + vectorization | Scoring service | 2 |
| Model inference | Triton + TensorRT (XGBoost/GNN) | 30 |
| Decision policy + response marshalling | Scoring service | 3 |
| Network return | — | 3 |
| **Reserve / jitter** | — | 5 |
| **Total** | | **≤ 50** |

The inference engine owns the largest slice (30 ms), so it gets a hard client-side deadline of **30 ms**; breaching it triggers the fallback in §6.

---

## 2. Core Ingestion & Data Streaming (zero message loss)

### 2.1 Two planes, deliberately separated

```
                         ┌──────────────────────────────────────────┐
   Card networks /       │           SYNCHRONOUS DECISION PLANE       │
   Auth gateways  ──────▶│  gRPC  →  Scoring Service  →  Triton       │──▶ APPROVE/DECLINE/REVIEW
        │                │              │  ▲                          │      (returned to issuer < 50ms)
        │                │              │  │ O(1) reads               │
        │                │           ElastiCache (Redis) / Aerospike  │
        │                └──────────────│──────────────────────────────┘
        │                               │ feature writes (async)
        ▼                               │
   ┌─────────────────────────────────────────────────────────────────┐
   │                   ASYNCHRONOUS STREAMING PLANE                    │
   │  Kinesis Data Streams  (or  Amazon MSK / Kafka)                   │
   │     ├─ Managed Flink (KDA): rolling-window feature aggregation    │──▶ writes features to Redis/Aerospike
   │     ├─ Firehose → S3 (Parquet): immutable audit + model training  │
   │     └─ Lambda/Flink: label join, drift metrics → CloudWatch       │
   └─────────────────────────────────────────────────────────────────┘
```

The **decision plane** never reads from the stream on the hot path — it only reads precomputed features from the in-memory store. The **streaming plane** is what keeps those features fresh.

### 2.2 Kinesis vs. MSK (Kafka) — the choice

| Dimension | Amazon Kinesis Data Streams | Amazon MSK (Apache Kafka) |
|-----------|-----------------------------|---------------------------|
| Throughput model | Shards: 1 MB/s or 1,000 rec/s **in** per shard; **On-Demand** auto-scales | Partitions; scale by broker count + partitions |
| Ops burden | Fully managed, minimal | You manage brokers/topics (MSK reduces it) |
| Ordering | Per-shard (partition key) | Per-partition (key) |
| Durability | Synchronous replication across 3 AZs | `acks=all` + `min.insync.replicas≥2`, RF=3 |
| Best when | You want AWS-managed, elastic, < ~1 wk retention | You need Kafka ecosystem, exactly-once, long retention, very high fan-out |

**Recommendation:** Start on **Kinesis On-Demand** for the feature/audit plane (lowest ops, elastic to millions of records/s via shard auto-scaling). Move to **MSK** if you need Kafka transactions (exactly-once), tiered storage for long retention, or Kafka-native tooling. At "millions of TPS" you will run **many shards/partitions**; partition by `card_id` (or `account_id`) so all of one card's events land on one shard and windowed aggregates stay ordered.

### 2.3 Zero message loss — the guarantees that actually matter

Producers (auth gateway side-channel):
- Kinesis: use **PutRecords** with ret/backoff on partial failures (inspect `FailedRecordCount` and retry only the failed entries); enable producer-side retries; use **KPL** with aggregation for throughput.
- MSK equivalent: `acks=all`, `enable.idempotence=true`, `retries=MAX`, `min.insync.replicas=2`, RF=3.

Consumers (Flink aggregators):
- **Checkpointing** (KDA Flink / Kafka offsets committed only after state is durably checkpointed) → at-least-once, upgraded to **exactly-once** with idempotent feature writes (see §3.4).
- **Enhanced fan-out** (Kinesis) for dedicated 2 MB/s per consumer with push delivery — avoids read contention as consumers multiply.

Durability of the decision itself: every verdict is written to **DynamoDB** (idempotent on `auth_id`) and mirrored to **Firehose→S3** for the immutable audit trail. If the issuer retries an auth, the DynamoDB conditional write makes the decision idempotent.

> **Key point:** "zero loss" on the decision path is achieved by making the *decision* idempotent and durably logged, and by never making the cardholder wait on the (async) stream. The stream's job is feature freshness + audit, and there it gets at-least-once + idempotent sinks = effectively-once.

---

## 3. In-Memory Feature Store (rolling user features)

### 3.1 Engine choice

| | Redis Enterprise / ElastiCache | Aerospike |
|---|------------------------------|-----------|
| Read latency | sub-ms (in-RAM) | sub-ms (RAM index, RAM or NVMe data) |
| Data size sweet spot | Hot working set in RAM | Very large datasets (TB) via **hybrid RAM+SSD** at low cost |
| Built-ins | `INCR`, `EXPIRE`, sorted sets, TTL windows, Lua, Functions | Strong consistency mode, native TTL, predictable p99 at scale |
| When to pick | Rich data structures, < a few hundred GB hot | Hundreds of millions of cards, multi-TB, want SSD economics |

**Recommendation:** **ElastiCache for Redis (cluster mode)** for the hot rolling features; consider **Aerospike** when the *active* keyspace exceeds economical RAM (e.g., 300M+ cards each with dozens of counters) and you want NVMe-backed storage at sub-ms p99.

### 3.2 What we store (rolling windows, precomputed)

Per `card_id` we maintain features such as:
- `txn_count_10m`, `txn_count_1h`, `txn_count_24h`
- `amount_sum_10m`, `amount_avg_30d`, `amount_zscore`
- `distinct_merchants_1h`, `distinct_country_1h`, `distinct_mcc_1h`
- `seconds_since_last_txn`, `last_lat`, `last_lon` (for impossible-travel / velocity)
- `decline_count_1h`, `cvv_fail_count_24h`
- graph features materialized from the GNN (e.g., `ring_risk_score` for the card's device/merchant cluster)

### 3.3 Two ways to keep windows rolling

1. **Stream-computed (authoritative):** Managed Flink consumes Kinesis/MSK, maintains sliding/tumbling windows in Flink state, and **writes the aggregates to Redis/Aerospike** with a TTL slightly longer than the window. This is exact and survives restarts via checkpoints.
2. **Write-time approximate (cheap, optional):** On each auth, the scoring service does a Redis pipeline of `INCR` + `EXPIRE` on a bucketed key (e.g., `c:{card}:cnt:{floor(now/60)}`) to get a near-real-time count without waiting for Flink. Use this only as a fast supplement; Flink remains the source of truth.

### 3.4 Idempotent feature writes (exactly-once effect)

Feature writers key updates on `(card_id, window_bucket)` and use **set-if/last-writer-wins by event time** or Redis Functions that ignore out-of-order/duplicate events. Combined with Flink checkpointing, replays after failure don't double-count.

---

## 4. AI Model Inference Layer

### 4.1 Engine: NVIDIA Triton Inference Server

- **Why Triton:** multi-framework (ONNX, TensorRT, FIL backend for **XGBoost**/LightGBM, PyTorch for **GNN/Transformer**), **dynamic batching**, **concurrent model instances**, model ensembles, and gRPC with hard timeouts. Runs on **EC2 G5/G6 (NVIDIA A10G/L4)** or **Inf2** (for compiled models) behind an internal NLB.
- **TensorRT optimization:** convert the deep models (GNN/Transformer) to TensorRT engines (FP16/INT8) for the 30 ms budget. XGBoost runs on Triton's **FIL backend** (GPU-accelerated forest inference) — typically single-digit ms.

### 4.2 Model ensemble (served as one Triton ensemble)

```
   feature vector
        │
        ▼
  ┌───────────────┐   fast path (≈2–5ms)
  │ XGBoost (FIL) │──────────────┐
  └───────────────┘              │
        │ (only if ambiguous)    ▼
        ▼                  ┌──────────────┐
  ┌───────────────┐        │  Decision     │──▶ risk_score ∈ [0,1]
  │ GNN / Txn-    │───────▶│  policy       │
  │ Transformer   │ deep   └──────────────┘
  │ (TensorRT)    │ path (≈20–30ms)
  └───────────────┘
```

- **Cascade for latency:** XGBoost scores everyone in a few ms. Only the **uncertain band** (e.g., 0.2 ≤ p ≤ 0.8) escalates to the heavier GNN/Transformer. Clear-cut cases skip the expensive model and return well under budget. This keeps p99 down while preserving deep-model accuracy where it matters.
- **GNN role:** captures fraud-ring / mule-network structure (shared devices, merchants, IPs). The graph is built offline + incrementally; the *materialized* node embedding/risk is cached in the feature store (§3.2) so the hot path reads it as a feature rather than running full graph propagation inline.

### 4.3 Dynamic batching

Triton's dynamic batcher coalesces concurrent requests within a **max_queue_delay** of ~1–2 ms to fill GPU batches without violating the budget. At millions of TPS this dramatically raises GPU utilization while keeping per-request latency bounded.

### 4.4 Scaling

- Horizontal: N Triton replicas behind internal **NLB**; autoscale on GPU utilization + queue depth (CloudWatch/Prometheus → ASG/Karpenter).
- Vertical: multiple **model instances per GPU** (Triton `instance_group`) to overlap compute and copy.
- Capacity planning: size replicas so that **per-replica p99 < 30 ms at target concurrency**, with headroom for AZ loss.

---

## 5. Scoring Service (the synchronous orchestrator)

Stateless gRPC service (Go or Python+asyncio/uvloop) that, per auth:
1. Reads features from Redis/Aerospike (`MGET`/batch, single round trip).
2. Assembles + normalizes the feature vector.
3. Calls Triton (gRPC) with a **30 ms deadline**.
4. Applies the decision policy (model score + hard business rules + velocity limits).
5. Writes verdict to DynamoDB (idempotent) and emits the event to the stream (async, fire-and-forget).
6. Returns `APPROVE | DECLINE | REVIEW` to the auth gateway.

Run it on **EKS/Fargate** or EC2, one hop from ElastiCache and Triton in the same AZ to minimize network time.

---

## 6. Fallback Mechanism (no payment ever stalls)

Triggered when the model call **times out** (≥30 ms), the GPU fleet is unhealthy, or features are missing/stale.

**Layered fallback (deterministic, fast, always returns a verdict):**

| Trigger | Fallback action | Rationale |
|---------|-----------------|-----------|
| Triton deadline exceeded | Use **last cached score** for this card (short-TTL Redis key) if fresh; else rules-only | Cached score is a good prior |
| No cached score | **Rules engine** verdict: hard limits (amount caps, velocity, geo/MCC blocklists, CVV/AVS) | Deterministic, sub-ms, no ML needed |
| Features unavailable | Conservative policy by **risk tier** (e.g., low-amount domestic → APPROVE; high-amount/cross-border → REVIEW/step-up) | Bounds loss without blocking |
| Whole scoring service degraded | **Issuer-side stand-in (STIP)** rules; mark txn for async re-scoring | Keeps approvals flowing |

Implementation details:
- The Triton client call is wrapped in `asyncio.wait_for(..., timeout=0.030)`. On `TimeoutError`, the service **does not raise to the caller** — it computes the fallback verdict and returns within budget.
- A **circuit breaker** on the Triton client opens after a rolling error/timeout threshold, so during an incident the service skips the model entirely (saving the 30 ms) and serves rules-only until health recovers.
- Every fallback verdict is tagged (`decision_source = model | cached | rules | stip`) and streamed for audit + later re-scoring, so risk teams can quantify exposure during the degraded window.

---

## 7. Observability, Security, Compliance

- **Latency SLOs:** per-hop histograms (p50/p95/p99/p999) in CloudWatch/Prometheus; alarm on p99 > 45 ms.
- **Model monitoring:** feature drift, score distribution shift, approval/decline rates, fallback rate. Sudden fallback-rate spike pages on-call.
- **Security:** PCI-DSS scope — tokenize PAN (never store raw PAN in the feature store; key on a surrogate `card_id`/token). TLS in-VPC, KMS encryption at rest (ElastiCache, DynamoDB, S3, Kinesis). Least-privilege IAM per service.
- **Replay/audit:** S3 (Parquet) is the immutable record for disputes, model retraining, and regulator review.

---

## 8. Component Summary (AWS-native)

| Layer | Service |
|-------|---------|
| Ingestion / streaming | **Amazon Kinesis Data Streams (On-Demand)** or **Amazon MSK** |
| Stream feature aggregation | **Amazon Managed Service for Apache Flink (KDA)** |
| Audit lake | **Kinesis Firehose → S3 (Parquet)** + Glue/Athena |
| In-memory feature store | **ElastiCache for Redis (cluster)** or **Aerospike** on EC2 |
| Inference | **NVIDIA Triton + TensorRT** on **EC2 G5/G6/Inf2** behind internal **NLB** |
| Scoring orchestrator | gRPC service on **EKS/Fargate** |
| Verdict store | **DynamoDB** (idempotent on `auth_id`) |
| Fallback rules | In-process rules engine + circuit breaker |
| Observability | CloudWatch / Prometheus / Grafana |

See **`fraud_ingestion_worker.py`** for a runnable blueprint of the ingestion worker, async Redis feature store, and the timeout-guarded model call + fallback.
