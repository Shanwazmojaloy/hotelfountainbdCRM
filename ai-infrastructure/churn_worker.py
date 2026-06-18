"""
churn_worker.py
===============
Production-shaped *blueprint* for the async churn-scoring background worker.

It demonstrates, in one runnable file:
  1. A background worker task (the body of a Celery task / Lambda handler) that
     takes a raw email thread, sends it to an LLM via STRUCTURED OUTPUTS,
     parses the typed risk indicators, computes a sentiment trend, and updates
     a CRM database record with a new churn-risk profile.
  2. Pydantic schema enforcement so the LLM can only return valid, typed JSON.
  3. A deterministic local "LLM" stub so the file runs with no API key; if
     ANTHROPIC_API_KEY is set you can wire the real call.
  4. A real PostgresCRM sink (Supabase pgvector schema) gated by DATABASE_URL,
     falling back to an in-memory MockCRM when unset.

Run with no dependencies (stub LLM + in-memory CRM):
    python churn_worker.py

Run with real validation / model:
    pip install pydantic anthropic
    ANTHROPIC_API_KEY=... python churn_worker.py

Run against real Postgres (Supabase) — writes account_churn_profile:
    pip install "psycopg[binary]"
    DATABASE_URL=postgresql://...:5432/postgres \
    DEMO_ACCOUNT_ID=<uuid> DEMO_TENANT_ID=<uuid> python churn_worker.py

Mirrors 02_churn_predictor_architecture.md:
    chunk -> (embed) -> extract risk (structured) -> aggregate trend -> write profile
"""

from __future__ import annotations

import json
import os
import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Optional Pydantic: enforce the LLM's JSON contract when available.
# ---------------------------------------------------------------------------
try:
    from pydantic import BaseModel, Field, ValidationError  # type: ignore
    _HAS_PYDANTIC = True
except Exception:  # pragma: no cover
    _HAS_PYDANTIC = False


class RiskStatus(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


# ---------------------------------------------------------------------------
# The structured-output contract (what the LLM MUST return).
# ---------------------------------------------------------------------------
if _HAS_PYDANTIC:

    class RiskReason(BaseModel):
        factor: str = Field(..., description="enumerated risk factor key")
        severity: str = Field(..., description="low | medium | high")
        evidence: str = Field(..., description="verbatim quote from the email")

    class ChurnAssessment(BaseModel):
        risk_status: RiskStatus
        churn_score: float = Field(..., ge=0.0, le=1.0)
        reasons: List[RiskReason] = Field(default_factory=list)
        recommended_action: str = ""

    def validate_assessment(raw: dict) -> "ChurnAssessment":
        return ChurnAssessment(**raw)

else:  # minimal fallback so the blueprint still runs without pydantic

    @dataclass
    class RiskReason:  # type: ignore
        factor: str
        severity: str
        evidence: str

    @dataclass
    class ChurnAssessment:  # type: ignore
        risk_status: str
        churn_score: float
        reasons: List[RiskReason] = field(default_factory=list)
        recommended_action: str = ""

    def validate_assessment(raw: dict) -> "ChurnAssessment":
        assert 0.0 <= raw["churn_score"] <= 1.0, "churn_score out of range"
        assert raw["risk_status"] in ("Low", "Medium", "High"), "bad risk_status"
        reasons = [RiskReason(**r) for r in raw.get("reasons", [])]
        return ChurnAssessment(raw["risk_status"], raw["churn_score"],
                               reasons, raw.get("recommended_action", ""))


# ---------------------------------------------------------------------------
# Input types
# ---------------------------------------------------------------------------
@dataclass
class EmailMessage:
    message_id: str
    direction: str          # inbound | outbound
    sent_at: datetime
    body: str


@dataclass
class EmailThread:
    account_id: str
    thread_id: str
    messages: List[EmailMessage]
    tenant_id: Optional[str] = None   # required when writing to PostgresCRM


# ---------------------------------------------------------------------------
# CRM datastores
# ---------------------------------------------------------------------------
class MockCRM:
    """In-memory stand-in used when DATABASE_URL is unset."""

    def __init__(self) -> None:
        self.profiles: Dict[str, dict] = {}

    def upsert_churn_profile(self, account_id: str, profile: dict) -> None:
        self.profiles[account_id] = profile
        print(f"[crm] account {account_id} -> {profile['risk_status']} "
              f"(score={profile['churn_score']}, slope={profile['sentiment_slope']})")

    def get(self, account_id: str) -> Optional[dict]:
        return self.profiles.get(account_id)


class PostgresCRM:
    """Real CRM sink: idempotent upsert into public.account_churn_profile.

    Targets the pgvector schema in 02_churn_predictor_architecture.md (3.2).
    Writes run as the service role (background worker), which bypasses RLS;
    the CRM web tier reads the same rows tenant-scoped via current_tenant_id().
    Requires DATABASE_URL (e.g. the Supabase connection string) and psycopg.
    """

    UPSERT = """
        insert into public.account_churn_profile
            (account_id, tenant_id, risk_status, churn_score,
             sentiment_slope, reasons, recommended_action, last_scored_at)
        values
            (%(account_id)s, %(tenant_id)s, %(risk_status)s, %(churn_score)s,
             %(sentiment_slope)s, %(reasons)s::jsonb, %(recommended_action)s, now())
        on conflict (account_id) do update set
            tenant_id          = excluded.tenant_id,
            risk_status        = excluded.risk_status,
            churn_score        = excluded.churn_score,
            sentiment_slope    = excluded.sentiment_slope,
            reasons            = excluded.reasons,
            recommended_action = excluded.recommended_action,
            last_scored_at     = excluded.last_scored_at;
    """

    def __init__(self, dsn: str) -> None:
        import psycopg  # type: ignore

        self._psycopg = psycopg
        self._dsn = dsn

    def upsert_churn_profile(self, account_id: str, profile: dict) -> None:
        if not profile.get("tenant_id"):
            raise ValueError("PostgresCRM requires a tenant_id on the thread/profile")
        params = {
            "account_id": account_id,
            "tenant_id": profile["tenant_id"],
            "risk_status": profile["risk_status"],
            "churn_score": profile["churn_score"],
            "sentiment_slope": profile["sentiment_slope"],
            "reasons": json.dumps(profile["reasons"]),
            "recommended_action": profile.get("recommended_action", ""),
        }
        with self._psycopg.connect(self._dsn, autocommit=True) as conn:
            conn.execute(self.UPSERT, params)
        print(f"[crm:postgres] account {account_id} -> {profile['risk_status']} "
              f"(score={profile['churn_score']}, slope={profile['sentiment_slope']})")


def build_crm():
    """Use Postgres when DATABASE_URL is set; otherwise the in-memory mock."""
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        try:
            crm = PostgresCRM(dsn)
            print("[crm] using PostgresCRM (account_churn_profile)")
            return crm
        except Exception as e:  # missing psycopg or bad dsn -> safe fallback
            print(f"[crm] Postgres unavailable ({e}); using in-memory mock")
    return MockCRM()


# ---------------------------------------------------------------------------
# LLM call with structured output.
#   - Real path: Anthropic tool-use / OpenAI JSON mode (wire in if key present).
#   - Stub path: deterministic keyword extraction so the file always runs.
# ---------------------------------------------------------------------------
RISK_LEXICON = {
    "competitor_mention": [r"competitor", r"alternativ", r"piloting", r"evaluat", r"switch"],
    "pricing_complaint": [r"too expensive", r"pricing", r"renewal quote", r"budget", r"discount", r"cost"],
    "unresolved_bug": [r"still broken", r"bug", r"not working", r"outage", r"ticket", r"unresolved"],
    "champion_disengagement": [r"no longer", r"left the company", r"different team", r"not my area"],
    "contract_signal": [r"not renew", r"cancel", r"winding down", r"end of term", r"terminate"],
}
SEVERITY_WEIGHT = {"low": 0.2, "medium": 0.5, "high": 0.85}


def _stub_llm_extract(thread_text: str) -> dict:
    """Deterministic stand-in for the LLM structured-output call."""
    reasons = []
    lowered = thread_text.lower()
    for factor, patterns in RISK_LEXICON.items():
        for pat in patterns:
            m = re.search(pat, lowered)
            if m:
                # grab a short evidence window around the match
                start = max(0, m.start() - 30)
                end = min(len(thread_text), m.end() + 40)
                evidence = thread_text[start:end].strip().replace("\n", " ")
                sev = "high" if factor in ("contract_signal", "competitor_mention") else "medium"
                reasons.append({"factor": factor, "severity": sev, "evidence": evidence})
                break
    score = min(1.0, sum(SEVERITY_WEIGHT[r["severity"]] for r in reasons) / 2.0)
    status = "High" if score > 0.66 else "Medium" if score >= 0.34 else "Low"
    action = ("Exec-sponsor save play; QBR within 7 days" if status == "High"
              else "CSM check-in; address open items" if status == "Medium"
              else "Healthy; standard cadence")
    return {"risk_status": status, "churn_score": round(score, 3),
            "reasons": reasons, "recommended_action": action}


def llm_extract_risk(thread_text: str) -> ChurnAssessment:
    """Call the model with a strict JSON contract, then validate.

    To use a real model, replace the stub block with an Anthropic tool-use call
    (input_schema = ChurnAssessment.model_json_schema()) or OpenAI JSON mode,
    keeping validate_assessment() so malformed output is rejected/retried.
    """
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            raw = _real_anthropic_extract(thread_text)
        except Exception as e:  # fall back to stub on any error
            print(f"[llm] real call failed ({e}); using stub")
            raw = _stub_llm_extract(thread_text)
    else:
        raw = _stub_llm_extract(thread_text)

    try:
        return validate_assessment(raw)
    except Exception as e:
        # In prod: one bounded retry with a "fix your JSON" reprompt, then DLQ.
        raise ValueError(f"LLM output failed schema validation: {e}") from e


def _real_anthropic_extract(thread_text: str) -> dict:  # pragma: no cover
    """Reference wiring for the real structured-output call."""
    import anthropic  # type: ignore

    client = anthropic.Anthropic()
    schema = {
        "type": "object",
        "properties": {
            "risk_status": {"type": "string", "enum": ["Low", "Medium", "High"]},
            "churn_score": {"type": "number", "minimum": 0, "maximum": 1},
            "reasons": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "factor": {"type": "string"},
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "evidence": {"type": "string"},
                    },
                    "required": ["factor", "severity", "evidence"],
                },
            },
            "recommended_action": {"type": "string"},
        },
        "required": ["risk_status", "churn_score", "reasons"],
    }
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        tools=[{"name": "report_churn", "description": "Return churn assessment",
                "input_schema": schema}],
        tool_choice={"type": "tool", "name": "report_churn"},
        messages=[{"role": "user", "content":
                   "Extract churn risk factors from this email thread. "
                   "Quote evidence verbatim.\n\n" + thread_text}],
    )
    for block in msg.content:
        if block.type == "tool_use":
            return block.input
    raise RuntimeError("model returned no structured tool_use block")


# ---------------------------------------------------------------------------
# Sentiment trend (the actual churn signal = trajectory, not snapshot).
# ---------------------------------------------------------------------------
NEG_WORDS = ("frustrat", "disappoint", "unhappy", "cancel", "broken", "expensive",
             "delay", "escalat", "competitor", "not renew", "concern")
POS_WORDS = ("thanks", "great", "love", "happy", "excellent", "appreciate", "renew")


def message_sentiment(text: str) -> float:
    t = text.lower()
    pos = sum(t.count(w) for w in POS_WORDS)
    neg = sum(t.count(w) for w in NEG_WORDS)
    if pos + neg == 0:
        return 0.0
    return (pos - neg) / (pos + neg)


def sentiment_slope(thread: EmailThread) -> float:
    """Linear-regression slope of per-message sentiment over time (per day)."""
    msgs = sorted(thread.messages, key=lambda m: m.sent_at)
    if len(msgs) < 2:
        return 0.0
    t0 = msgs[0].sent_at
    xs = [(m.sent_at - t0).total_seconds() / 86400.0 for m in msgs]  # days
    ys = [message_sentiment(m.body) for m in msgs]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom


# ---------------------------------------------------------------------------
# The worker: takes a thread, scores it, writes the CRM profile.
#   (This function body is what Celery task / Lambda handler wraps.)
# ---------------------------------------------------------------------------
def process_thread(thread: EmailThread, crm) -> dict:
    thread_text = "\n\n".join(
        f"[{m.direction} {m.sent_at.date()}] {m.body}" for m in thread.messages
    )

    # 1. LLM structured extraction (typed, validated).
    assessment = llm_extract_risk(thread_text)

    # 2. Trend signal.
    slope = round(sentiment_slope(thread), 3)

    # 3. Blend model severity with the worsening-trend amplifier.
    base = assessment.churn_score
    blended = base + (max(0.0, -slope) * 0.4)      # negative slope raises risk
    blended = round(min(1.0, blended), 3)
    status = ("High" if blended > 0.66 else "Medium" if blended >= 0.34 else "Low")

    reasons_out = [
        {"factor": r.factor, "severity": r.severity, "evidence": r.evidence}
        for r in assessment.reasons
    ]

    profile = {
        "account_id": thread.account_id,
        "tenant_id": thread.tenant_id,
        "risk_status": status,
        "churn_score": blended,
        "sentiment_slope": slope,
        "reasons": reasons_out,
        "recommended_action": getattr(assessment, "recommended_action", ""),
        "last_scored_at": datetime.now(timezone.utc).isoformat(),
    }

    # 4. Idempotent write back to the CRM (read by the web tier; never blocks it).
    crm.upsert_churn_profile(thread.account_id, profile)

    # 5. Alert if High (prod: SNS -> Slack/email + CRM task).
    if status == "High":
        print(f"[alert] ACCOUNT {thread.account_id} flagged HIGH churn risk -> notify owner")

    return profile


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------
def _demo_thread() -> EmailThread:
    now = datetime.now(timezone.utc)
    # Use real UUIDs when targeting Postgres (account_id/tenant_id are uuid columns).
    # Defaults are mock-friendly; override via env for a live write.
    return EmailThread(
        account_id=os.getenv("DEMO_ACCOUNT_ID", "acct_042"),
        tenant_id=os.getenv("DEMO_TENANT_ID"),
        thread_id="thr_1001",
        messages=[
            EmailMessage("m1", "inbound", now - timedelta(days=60),
                         "Thanks for the onboarding, the team loves the product so far!"),
            EmailMessage("m2", "inbound", now - timedelta(days=30),
                         "We hit a bug in reporting again; the ticket is still unresolved "
                         "and it's getting frustrating."),
            EmailMessage("m3", "inbound", now - timedelta(days=7),
                         "Honestly the renewal quote is too expensive to justify. "
                         "We're also evaluating a competitor next quarter and may not renew."),
        ],
    )


def main() -> None:
    crm = build_crm()   # PostgresCRM when DATABASE_URL set, else MockCRM
    profile = process_thread(_demo_thread(), crm)
    print("\n=== Churn profile written to CRM ===")
    print(json.dumps(profile, indent=2))


if __name__ == "__main__":
    main()
