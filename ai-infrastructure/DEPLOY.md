# Deployment Runbook — Churn Predictor (Hotel Fountain CRM)

Step-by-step to take the churn pipeline from "runs on my laptop" to "running on a
schedule against the live Supabase CRM." Each step is independently verifiable —
do them in order and stop at any checkpoint that fails.

> Scope note: the **fraud detection** system (`fraud_*`, `triton_*`, `kinesis_*`)
> is an enterprise-scale blueprint for millions of TPS. It is **not** needed to
> operate a 24-room property — keep it as a reference/learning artifact. This
> runbook deploys the **churn predictor** only.

Legend: 🖥️ = run on your machine · ☁️ = AWS console/CLI · 🗄️ = Supabase · ✅ = checkpoint

---

## Phase 0 — Local proof (no cloud, ~5 min)

1. 🖥️ Open a terminal in `ai-infrastructure/`.
2. 🖥️ Confirm Python 3.10+: `python --version`.
3. 🖥️ Run the mock pipeline end to end:
   ```bash
   python batch_score.py
   ```
   ✅ You should see per-account `[crm] ... -> High/Medium/Low` lines and a final
   `[batch] {'scored': N, 'alerted': N, 'high': N}`. No errors = logic is sound.
4. 🖥️ Run the tests:
   ```bash
   pip install -r requirements-dev.txt
   pytest
   ```
   ✅ `22 passed`.

---

## Phase 1 — Real LLM scoring (~10 min)

Goal: replace the deterministic stub with Claude structured output.

1. 🖥️ Get an Anthropic API key from https://console.anthropic.com → API Keys.
2. 🖥️ Install the client and run with the key:
   ```bash
   pip install -r requirements-churn.txt
   export ANTHROPIC_API_KEY=sk-ant-...
   python churn_worker.py
   ```
   ✅ Output still prints a churn profile; if the key/model is reachable it used
   the real model (on any error it auto-falls back to the stub and prints why).
3. 🖥️ (Optional) Tune the model in `churn_worker.py::_real_anthropic_extract`
   (`model="claude-sonnet-4-6"`) and the risk lexicon weights to your wording.

---

## Phase 2 — Live database write (~10 min)

Goal: write churn profiles into the CRM's Postgres (tables already migrated).

1. 🗄️ Get the connection string: Supabase → project **Bridge Booking**
   (`mynwfkgksqqwlqowlscj`) → Settings → Database → Connection string (URI).
   Use the **session/transaction pooler** URI for serverless; direct for a worker.
2. 🖥️ Pick a real account to score. Quick way to grab one:
   ```sql
   -- in Supabase SQL editor
   select id from public.b2b_partners limit 1;   -- or corporate_leads / guests
   ```
3. 🖥️ Run a single live scoring + write:
   ```bash
   pip install "psycopg[binary]"
   export DATABASE_URL='postgresql://postgres:<pwd>@db.mynwfkgksqqwlqowlscj.supabase.co:5432/postgres'
   export DEMO_TENANT_ID=46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8
   export DEMO_ACCOUNT_ID=<the uuid from step 2>
   python churn_worker.py
   ```
   ✅ Log shows `[crm:postgres] account <uuid> -> ...`.
4. 🗄️ Verify the row landed:
   ```sql
   select * from public.account_churn_profile where account_id = '<uuid>';
   select * from public.high_risk_accounts;   -- if it scored High
   ```
   ✅ One row, correct status/score.

> Decide now: should `account_id` hard-reference one CRM table? If yes, tell me
> `b2b_partners` | `corporate_leads` | `guests` and I'll add the FK + cascade.

---

## Phase 3 — Real email ingestion (~20–30 min)

Goal: pull real threads instead of the stub, embed them, store in `email_chunks`.

Choose your provider:

### Gmail (IMAP — already implemented, no Google Cloud project needed)
`ingest._fetch_gmail` uses IMAP with an app password (matches your tenants
`gmail_user` / `gmail_app_password`). Stdlib only.
1. 🖥️ In the Gmail account, create a 16-char **App Password**
   (Google Account → Security → App passwords; requires 2FA on).
2. 🖥️ Run a real pull + embed:
   ```bash
   export EMAIL_PROVIDER=gmail GMAIL_USER=you@hotelfountainbd.com
   export GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
   export GMAIL_COUNTERPARTY=ops@partneragency.com   # the partner's email
   export BEDROCK_REGION=ap-south-1
   DEMO_ACCOUNT_ID=<partner uuid> DEMO_TENANT_ID=46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8 \
   python ingest.py
   ```

### Microsoft 365 / Outlook
1. ☁️ Entra ID → App registration → API permission **Mail.Read** (Graph).
2. 🖥️ Implement `ingest._fetch_graph` similarly.

Then:
3. 🖥️ Real embeddings via Bedrock:
   ```bash
   export BEDROCK_REGION=ap-south-1     # region where you enabled Titan v2
   export EMAIL_PROVIDER=gmail
   python ingest.py
   ```
   ✅ `[ingest] account=... : N chunks embedded (dim=1024) -> stored`.
4. 🗄️ Confirm vectors:
   ```sql
   select count(*) from public.email_chunks where account_id='<uuid>';
   ```

---

## Phase 4 — AWS resources via Terraform (~15 min)

Goal: create the SQS queue (+DLQ), SNS alert topic, EventBridge schedule, and the
IAM role the worker uses. All defined in `terraform/`.

1. 🖥️ Install Terraform ≥1.5 and the AWS CLI; run `aws configure` (or use SSO).
2. 🖥️ ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars   # fill in region, alert email
   terraform init
   terraform plan        # review what will be created
   terraform apply       # type yes
   ```
   ✅ Outputs print `sqs_queue_url`, `sns_topic_arn`, `schedule_name`.
3. ☁️ Confirm the SNS email subscription (AWS emails you a "Confirm subscription"
   link — click it) so High-risk alerts reach your inbox.
4. 🖥️ Put those outputs into your worker env (`.env` or the runtime's env vars):
   `SQS_QUEUE_URL`, `SNS_TOPIC_ARN`.

---

## Phase 5 — Secrets (~10 min)

Goal: stop using plaintext env vars for tokens.

1. ☁️ For each secret (Anthropic key, DB URL, Gmail/Graph token), create an AWS
   Secrets Manager secret:
   ```bash
   aws secretsmanager create-secret --name churn/anthropic_api_key --secret-string 'sk-ant-...'
   aws secretsmanager create-secret --name churn/database_url     --secret-string 'postgresql://...'
   ```
2. 🖥️ At worker startup, load them into env (small helper, ~10 lines of boto3) or
   reference them in the Lambda/ECS task definition. Grant the worker's IAM role
   `secretsmanager:GetSecretValue` on `churn/*` (the Terraform role has a stub for this).

---

## Phase 6 — Run the worker on a schedule (~20 min)

Pick ONE runtime:

### Option A — Lambda (simplest, spiky load)
1. ☁️ Package: `pip install -r requirements-churn.txt -t build/ && cp *.py build/ && (cd build && zip -r ../churn.zip .)`
2. ☁️ Create a Lambda (Python 3.12), handler `tasks.lambda_handler`, attach the
   Terraform IAM role, set env vars, set timeout 300s.
3. ☁️ The Terraform EventBridge schedule already targets it (or wire SQS → Lambda
   trigger for the reactive per-email path).
   ✅ Invoke once with a test event `{"account_id":"<uuid>","thread_id":"<id>","tenant_id":"46bbc3ff-..."}`.

### Option B — Celery on Fargate (heavy batch)
1. ☁️ Build & push the image: `docker build -f Dockerfile.churn -t <ecr>/churn:latest . && docker push ...`
2. ☁️ ECS Fargate service, command `celery -A tasks worker --loglevel=info`,
   `CELERY_BROKER_URL=sqs://`, the IAM role attached.
3. ☁️ EventBridge schedule → enqueue accounts due (a tiny "enqueuer" Lambda or a
   scheduled ECS task running `python batch_score.py`).

✅ Final check: let one scheduled run fire. Confirm:
- 🗄️ new/updated rows in `account_churn_profile`,
- 📧 an SNS email for any account that crossed into High,
- ☁️ no messages stuck in the DLQ.

---

## Phase 7 — Surface it in the CRM (~15 min)

1. 🗄️ The web tier reads `select * from public.high_risk_accounts;` (already
   tenant-scoped via RLS + SECURITY INVOKER — no extra filtering needed).
2. 🖥️ Add a "Churn Risk" widget/page to Lumea that lists those rows with the
   `reasons` and `recommended_action`. (I can build this React/Next component on
   request — it fits the Ivory Editorial style guide.)

---

## Rollback / safety
- DB is additive: to fully remove, `drop view high_risk_accounts; drop table
  account_churn_profile; drop table email_chunks;` (no existing tables touched).
- `terraform destroy` removes all AWS resources.
- Workers are idempotent (upserts keyed on `account_id` / `message_id+chunk_idx`),
  so re-runs never duplicate.

## What I still need from you to go further
- The `account_id` FK target (b2b_partners | corporate_leads | guests).
- Provider choice (Gmail vs Graph) so I can finish the real `fetch_*` body.
- A green light to build the Lumea "Churn Risk" CRM widget.
