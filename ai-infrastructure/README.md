# AI Infrastructure Blueprints

Two AWS-native AI-infrastructure systems — architecture docs plus runnable Python
blueprints. Every `.py` runs on the Python **standard library alone** (mock paths)
and lights up real Redis / Triton / Kinesis / Bedrock / Postgres / SNS when the
matching env vars + deps are present.

## Layout

| System | Architecture | Modules |
|--------|-------------|---------|
| Real-time fraud detection (millions TPS, <50ms) | `01_fraud_detection_architecture.md` | `fraud_ingestion_worker.py`, `triton_client.py`, `kinesis_consumer.py` |
| Email sentiment & churn predictor (async CRM) | `02_churn_predictor_architecture.md` | `churn_worker.py`, `ingest.py`, `batch_score.py`, `tasks.py`, `alerter.py` |

Deps: `requirements-fraud.txt`, `requirements-churn.txt`, `requirements-dev.txt`.
Tests: `tests/` (`pytest`). Containers: `Dockerfile.*`, `docker-compose.yml`.

## Quick start (no dependencies)

```bash
# Fraud
python fraud_ingestion_worker.py   # 300 mock auths -> p50/p95/p99 (<50ms budget)
python triton_client.py            # XGBoost->GNN cascade w/ 30ms deadline
python kinesis_consumer.py         # async feature-aggregation plane

# Churn
python churn_worker.py             # score a mock thread -> churn profile
python ingest.py                   # fetch -> chunk -> embed(1024) -> store
python batch_score.py              # ingest+score many accounts + alerts
python tasks.py                    # Celery/Lambda pipeline (sync fallback)
python alerter.py                  # SNS high-risk alert (console fallback)
```

## Tests

```bash
pip install -r requirements-dev.txt
pytest                              # 22 tests (fraud + churn)
# If temp cleanup recurses on a synced FS:
pytest -p no:cacheprovider --basetemp=/tmp/ptbase
```

## Wiring the real paths (env-gated, no code edits)

| Capability | Set | Module |
|-----------|-----|--------|
| Real feature store | `REDIS_URL` | `fraud_ingestion_worker.py` |
| Real inference | `TRITON_URL` (+ tritonclient, numpy) | `triton_client.py` |
| Real txn stream | `KINESIS_STREAM`, `AWS_REGION` (+ boto3) | `kinesis_consumer.py` |
| Real LLM | `ANTHROPIC_API_KEY` (+ anthropic) | `churn_worker.py` |
| Real embeddings | `BEDROCK_REGION` (+ boto3) | `ingest.py` |
| Real email fetch | `EMAIL_PROVIDER=gmail\|graph` | `ingest.py` |
| Real CRM write | `DATABASE_URL` (+ psycopg) | `churn_worker.py`, `ingest.py` |
| Real alerts | `SNS_TOPIC_ARN` (+ boto3) | `alerter.py` |
| Celery broker | `CELERY_BROKER_URL` | `tasks.py` |

Example live churn write to Supabase:
```bash
pip install -r requirements-churn.txt
DATABASE_URL=postgresql://postgres:<pwd>@db.mynwfkgksqqwlqowlscj.supabase.co:5432/postgres \
DEMO_TENANT_ID=46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8 \
DEMO_ACCOUNT_ID=<account uuid> \
python batch_score.py
```

## Database (live: Supabase project `mynwfkgksqqwlqowlscj` — "Bridge Booking")

Applied migrations (additive; no existing tables changed):
- `churn_predictor_pgvector_tables` — `vector` ext, `email_chunks` (HNSW cosine,
  1024-dim), `account_churn_profile`. Both RLS-enabled, tenant-scoped via
  `current_tenant_id()`.
- `churn_high_risk_accounts_view` — `public.high_risk_accounts`, a
  **SECURITY INVOKER** view (caller's RLS applies) listing only High-risk
  accounts, most-worsening first. Read it from the CRM web tier:
  `select * from public.high_risk_accounts;`

Background workers write with the **service role** (bypasses RLS); the web tier
reads tenant-scoped.

## Pipeline shape (churn)

```
EventBridge cron ─▶ SQS ─▶ Celery/Lambda
                              │
   tasks.ingest_emails  ──▶ ingest.py  (fetch→chunk→embed→email_chunks)
   tasks.score_account  ──▶ churn_worker.process_thread (LLM structured + trend)
                              ──▶ account_churn_profile (upsert)
                              ──▶ alerter.send_alert (SNS on tier increase)
```

## Notes
- `.env` is gitignored; store provider tokens in AWS Secrets Manager in prod.
- `account_id` is FK'd to `b2b_partners(id)` ON DELETE CASCADE (migration
  `churn_account_id_fk_b2b_partners`) — churn tracks contracted partners.
- Large files in this repo can be tail-truncated by OneDrive sync; if you edit
  `*_worker.py` and a run prints nothing, re-copy the full file.
