# Email Sentiment & Churn Predictor — AWS-Native System Architecture

**Author role:** AI Engineer & Senior Data Platform Architect
**Goal:** Inside an existing B2B Enterprise CRM, **asynchronously** ingest historical customer email threads, detect **sentiment shifts** over time, and emit a per-account **Churn Probability Score** with structured, explainable risk reasons — so sales/CS can intervene **before** a cancellation.

**Hard requirement:** none of this runs on the CRM's request path. The web tier stays fast; all analysis happens in background workers.

---

## 0. Design Principles

1. **Async by construction.** Email sync, embedding, and LLM scoring are jobs, not API calls. The CRM web server only *reads* a precomputed `churn_risk` field.
2. **Explainable, structured output.** The LLM must return typed JSON (`risk_status`, `score`, `reasons[]`), validated by a schema — never free text. Unstructured prose can't drive alerts or dashboards.
3. **Trend over snapshot.** Churn signal is the *trajectory* of sentiment, not a single email. We store time-stamped sentiment per thread and compute the slope.
4. **Retrieval-grounded.** Risk factors are extracted from the actual email evidence (RAG), so every score is traceable to quotes.
5. **Idempotent + incremental.** Re-running a sync must not double-process; only new/changed threads are embedded and scored.

---

## 1. High-Level Architecture

```
 ┌──────────────┐     OAuth      ┌─────────────────────────────────────────────┐
 │  CRM Web App │                │            ASYNC ANALYSIS PLANE              │
 │ (Next.js/    │                │                                             │
 │  Node/PG)    │   reads only   │  EventBridge (cron) ──▶ SQS ──▶ Workers      │
 │  churn_risk  │◀───────────────┤                         (Celery / Lambda)    │
 └──────┬───────┘                │     │                                        │
        │ writes job triggers    │     ├─ 1. Email Sync  (Gmail/Outlook API)    │
        ▼                        │     ├─ 2. Chunk + Embed (Bedrock Titan)      │
   ┌─────────┐                   │     ├─ 3. Vector upsert (pgvector / Pinecone)│
   │ Postgres│◀──────────────────┤     ├─ 4. Sentiment + Risk extraction (LLM) │
   │  (RDS)  │  churn profile     │     └─ 5. Aggregate trend -> Churn Score    │
   └─────────┘                   │                                             │
                                 └─────────────────────────────────────────────┘
```

Two event sources start a job:
- **Scheduled backfill / refresh:** EventBridge cron (e.g., nightly) enqueues accounts due for re-scoring.
- **Reactive:** a webhook/poll detecting a new inbound email enqueues that thread immediately.

---

## 2. Data Connections & Ingestion Pipeline

### 2.1 Background worker architecture (does NOT touch the CRM web tier)

Two viable AWS-native patterns — pick by team/scale:

| Pattern | Stack | Best when |
|---------|-------|-----------|
| **Queue + workers** | **Amazon SQS** + **Celery** workers on ECS/Fargate (broker = SQS or ElastiCache Redis) | Long-running jobs, large batch backfills, fine-grained concurrency control, heavy LLM fan-out |
| **Serverless** | **EventBridge → SQS → AWS Lambda** | Spiky/low-volume, want zero idle cost, per-thread jobs under 15 min |

**Recommendation:** **EventBridge (schedule) → SQS (buffer + retry + DLQ) → Celery workers on Fargate.** SQS gives you visibility timeouts, exponential backoff, and a **dead-letter queue** for poison threads. Celery gives you task chaining (sync → embed → score → aggregate) and concurrency knobs. Lambda is the right call for the lightweight per-new-email reactive path.

Pipeline as a Celery chain per account:
```
sync_emails.s(account_id)
  | chunk_and_embed.s()
  | extract_risk.s()
  | aggregate_churn.s()    # writes churn profile back to Postgres
```

### 2.2 Email provider connections (secure)

- **Gmail:** Gmail API, OAuth 2.0, scope `gmail.readonly`; use **history API** (`historyId`) for incremental deltas instead of full re-pulls. For org-wide access use a Google Workspace **service account with domain-wide delegation**.
- **Outlook/Microsoft 365:** **Microsoft Graph API**, OAuth 2.0, scope `Mail.Read`; subscribe to **change notifications (webhooks)** for near-real-time deltas, or delta query for polling.
- **Token storage:** refresh tokens in **AWS Secrets Manager** (KMS-encrypted), never in Postgres or app config. Rotate on schedule.
- **Rate/backoff:** respect provider quotas; SQS + worker concurrency caps keep you under limits; retries with jitter on 429.
- **PII boundary:** strip/redact signatures, legal footers; tag threads by `account_id` (tenant-scoped). Encrypt raw email at rest (S3 + KMS) if retained.

### 2.3 Incremental & idempotent

- Track per-account `last_history_id` / `delta_link`. Only fetch new messages.
- Dedup on `message_id`. Embedding + scoring jobs are keyed on `(account_id, thread_id, message_hash)` so replays are no-ops.

---

## 3. Vector Database Layout (chunk · embed · store)

### 3.1 Engine choice

| | **pgvector** (on RDS/Aurora Postgres) | **Pinecone** |
|---|--------------------------------------|--------------|
| Co-location | Same DB as CRM data — join churn vectors to accounts directly | Separate managed service |
| Ops | One database to run | Fully managed ANN, scales huge |
| Scale ceiling | Excellent to ~10s of millions of vectors with HNSW | Billions, very high QPS |
| Cost | Cheapest if you already run Postgres | Pay per pod/serverless |

**Recommendation:** Start with **pgvector** — the CRM already runs Postgres, so risk vectors live next to `accounts`/`contacts` and you avoid a second datastore. Graduate to **Pinecone** only if vector count/QPS outgrows Postgres.

### 3.2 Schema (pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE email_chunks (
    id            bigserial PRIMARY KEY,
    account_id    uuid NOT NULL,
    thread_id     text NOT NULL,
    message_id    text NOT NULL,
    chunk_idx     int  NOT NULL,
    sent_at       timestamptz NOT NULL,
    direction     text NOT NULL,          -- inbound | outbound
    content       text NOT NULL,
    embedding     vector(1024) NOT NULL,  -- Bedrock Titan Text v2 = 1024 dims
    sentiment     real,                   -- per-chunk, -1..1, filled by analyzer
    UNIQUE (message_id, chunk_idx)
);

CREATE INDEX ON email_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON email_chunks (account_id, sent_at);

-- Output of the churn engine, read by the CRM web tier:
CREATE TABLE account_churn_profile (
    account_id     uuid PRIMARY KEY,
    risk_status    text NOT NULL,          -- Low | Medium | High
    churn_score    real NOT NULL,          -- 0..1
    sentiment_slope real,                  -- trend over window (negative = worsening)
    reasons        jsonb NOT NULL,         -- [{factor, severity, evidence}]
    last_scored_at timestamptz NOT NULL
);
```

### 3.3 Chunking & embedding

- Chunk threads by message, then by ~500-token windows with small overlap; keep `direction` and `sent_at` so trend + RAG retrieval stay time-aware.
- Embeddings via **Amazon Bedrock Titan Text Embeddings v2** (or `text-embedding-3-small`). Store the vector + a per-chunk sentiment.
- Retrieval at scoring time: pull the most recent + most negative chunks per account (hybrid: recency + cosine similarity to risk-prototype queries like "pricing complaint", "competitor", "cancel") to ground the LLM.

---

## 4. Sentiment & Churn Engine (LLM orchestration)

### 4.1 Orchestration layer

Use **LangChain** (or an **AI Gateway** like Bedrock + a thin router) to structure the flow:

```
 retrieved chunks ──▶  Prompt (risk-factor extraction)
                        │  model: Bedrock Claude / GPT-4-class
                        ▼
                  Structured output (JSON schema enforced)
                        │  validate w/ Pydantic / instructor / zod
                        ▼
                  Per-thread risk record  ──▶  trend aggregation
```

The gateway gives you: model fallback (primary → cheaper backup on error/timeout), centralized auth, cost/latency logging, and prompt/version control.

### 4.2 Risk factors extracted

The LLM extracts explicit, enumerable signals from the evidence:
- `competitor_mention` (named alternatives, "evaluating X")
- `unresolved_bug` / repeated support escalations
- `pricing_complaint` / budget pushback / discount demands
- `sentiment_shift` (tone worsening across the thread)
- `champion_disengagement` (slower replies, CC drop-off, "no longer my area")
- `contract_signal` ("not renewing", "winding down", "end of term")

### 4.3 Structured JSON output (the contract)

```json
{
  "account_id": "uuid",
  "risk_status": "High",
  "churn_score": 0.82,
  "sentiment_slope": -0.41,
  "reasons": [
    {"factor": "competitor_mention", "severity": "high",
     "evidence": "We're piloting <Competitor> next quarter."},
    {"factor": "pricing_complaint", "severity": "medium",
     "evidence": "The renewal quote is hard to justify to finance."}
  ],
  "recommended_action": "Exec-sponsor save play; schedule QBR within 7 days"
}
```

`risk_status` is bucketed from `churn_score` (e.g., <0.34 Low, 0.34–0.66 Medium, >0.66 High), but the LLM can override with a reason (e.g., explicit non-renewal forces High).

### 4.4 Trend = the actual churn signal

Per account, compute **sentiment_slope** = linear-regression slope of per-message sentiment over the trailing window (e.g., 90 days). The final `churn_score` blends:
- model-extracted risk severity (weighted by factor),
- the sentiment slope (negative trend amplifies),
- behavioral features (reply latency, thread volume decay).

A worsening slope on a previously-happy account is the highest-value alert — it catches silent churn before the customer says "cancel".

### 4.5 Alerting

When `risk_status` crosses to **High** (or jumps a tier), the aggregator emits an **SNS** event → Slack/email to the account owner + creates a CRM task. Sales sees the score and the *reasons* in-CRM (read from `account_churn_profile`).

---

## 5. Observability, Cost, Compliance

- **Cost control:** cascade models (cheap classifier first; escalate only ambiguous threads to the expensive LLM); cache embeddings; only re-score on new evidence. Track $/account/month.
- **Quality:** sample LLM outputs for human review; track precision/recall of High-risk flags against actual churn (closed-loop label join).
- **Privacy/compliance:** least-privilege OAuth scopes (read-only); per-tenant data isolation (RLS in Postgres on `account_id`); encryption at rest (KMS) and in transit; honor data-retention + deletion (GDPR right-to-erasure cascades to `email_chunks`). Secrets in Secrets Manager.
- **Idempotency/reliability:** SQS DLQ for poison threads; visibility timeout > worst-case job time; retries with backoff.

---

## 6. Component Summary (AWS-native)

| Layer | Service |
|-------|---------|
| Schedule / events | **Amazon EventBridge** (cron + reactive rules) |
| Job queue + retry/DLQ | **Amazon SQS** |
| Workers | **Celery on ECS/Fargate** (heavy) + **AWS Lambda** (reactive per-email) |
| Email ingestion | **Gmail API** / **Microsoft Graph API**, OAuth 2.0 |
| Secrets | **AWS Secrets Manager** (+ KMS) |
| Embeddings | **Amazon Bedrock Titan Text Embeddings v2** |
| Vector store | **pgvector on RDS/Aurora Postgres** (→ Pinecone at scale) |
| LLM orchestration | **LangChain / AI Gateway** over **Bedrock (Claude)** + structured outputs |
| Output store (read by CRM) | **Postgres `account_churn_profile`** |
| Alerting | **Amazon SNS** → Slack/email + CRM task |

See **`churn_worker.py`** for a runnable blueprint of a background worker that takes a mock email thread, calls an LLM via structured outputs, parses risk indicators, and updates a mock CRM record.
