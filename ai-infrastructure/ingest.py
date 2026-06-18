"""
ingest.py
=========
Email ingestion + chunking + embedding pipeline for the churn predictor.

Flow (mirrors 02_churn_predictor_architecture.md sections 2-3):
    fetch thread (Gmail/Graph)  ->  chunk by message + token window
                                ->  embed each chunk (Bedrock Titan v2)
                                ->  per-chunk sentiment
                                ->  upsert into public.email_chunks (pgvector)

Everything runs on the stdlib with deterministic stubs. Real providers light up
when the relevant env/deps are present:
    * EMAIL_PROVIDER=gmail|graph   (+ OAuth token in Secrets Manager) -> real fetch
    * BEDROCK_REGION set           (+ boto3)                          -> real embed
    * DATABASE_URL set             (+ psycopg)                        -> real upsert

Run standalone (stub fetch + stub embed + mock store):
    python ingest.py

Run a real upsert into Supabase:
    pip install "psycopg[binary]" boto3
    DATABASE_URL=postgresql://...:5432/postgres BEDROCK_REGION=ap-south-1 \
    DEMO_ACCOUNT_ID=<uuid> DEMO_TENANT_ID=<uuid> python ingest.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

from churn_worker import EmailMessage, EmailThread, message_sentiment

EMBED_DIM = 1024          # Bedrock Titan Text Embeddings v2
CHUNK_CHARS = 1600        # ~400 tokens
CHUNK_OVERLAP = 200


# ---------------------------------------------------------------------------
# 1. Fetch — provider adapters (stubbed; real ones gated by env).
# ---------------------------------------------------------------------------
def fetch_thread(account_id: str, thread_id: str,
                 tenant_id: Optional[str] = None) -> EmailThread:
    provider = os.getenv("EMAIL_PROVIDER", "stub").lower()
    if provider == "gmail":
        return _fetch_gmail(account_id, thread_id, tenant_id)
    if provider == "graph":
        return _fetch_graph(account_id, thread_id, tenant_id)
    return _stub_thread(account_id, thread_id, tenant_id)


def _fetch_gmail(account_id, thread_id, tenant_id) -> EmailThread:  # pragma: no cover
    """Fetch a real Gmail conversation via IMAP using an app password.

    Hotel Fountain stores gmail_user / gmail_app_password per tenant, so we use
    IMAP (stdlib imaplib) rather than the OAuth Gmail API. Required env:
        GMAIL_USER            mailbox address
        GMAIL_APP_PASSWORD    16-char Google app password (NOT the account pwd)
        GMAIL_COUNTERPARTY    partner email to pull the thread with
                              (falls back to thread_id if you pass an email there)
    Optional GMAIL_WINDOW_DAYS (default 120). Returns inbound+outbound messages
    in the window, time-ordered, as an EmailThread.
    """
    import email as _email
    import imaplib
    from email.utils import parsedate_to_datetime

    user = os.environ["GMAIL_USER"]
    pwd = os.environ["GMAIL_APP_PASSWORD"]
    counterparty = os.getenv("GMAIL_COUNTERPARTY") or thread_id
    window = int(os.getenv("GMAIL_WINDOW_DAYS", "120"))
    since = (datetime.now(timezone.utc) - timedelta(days=window)).strftime("%d-%b-%Y")

    mailbox = imaplib.IMAP4_SSL("imap.gmail.com")
    mailbox.login(user, pwd)
    mailbox.select('"[Gmail]/All Mail"')

    msgs: List[EmailMessage] = []
    searches = (("inbound", f'(FROM "{counterparty}" SINCE {since})'),
                ("outbound", f'(TO "{counterparty}" SINCE {since})'))
    try:
        for direction, criteria in searches:
            typ, data = mailbox.search(None, criteria)
            if typ != "OK" or not data or not data[0]:
                continue
            for num in data[0].split():
                typ, raw = mailbox.fetch(num, "(RFC822)")
                if typ != "OK" or not raw or not raw[0]:
                    continue
                m = _email.message_from_bytes(raw[0][1])
                try:
                    sent = parsedate_to_datetime(m.get("Date"))
                except Exception:
                    sent = datetime.now(timezone.utc)
                if sent is None:
                    sent = datetime.now(timezone.utc)
                if sent.tzinfo is None:
                    sent = sent.replace(tzinfo=timezone.utc)
                msgs.append(EmailMessage(
                    message_id=m.get("Message-ID", num.decode()),
                    direction=direction, sent_at=sent,
                    body=_imap_plain_body(m),
                ))
    finally:
        try:
            mailbox.logout()
        except Exception:
            pass

    msgs.sort(key=lambda x: x.sent_at)
    return EmailThread(account_id=account_id, thread_id=thread_id,
                       tenant_id=tenant_id, messages=msgs)


def _imap_plain_body(m) -> str:  # pragma: no cover
    """Extract the text/plain body from an email.message.Message."""
    if m.is_multipart():
        for part in m.walk():
            disp = str(part.get("Content-Disposition"))
            if part.get_content_type() == "text/plain" and "attachment" not in disp:
                try:
                    return (part.get_payload(decode=True) or b"").decode(
                        part.get_content_charset() or "utf-8", "replace")
                except Exception:
                    continue
        return ""
    try:
        return (m.get_payload(decode=True) or b"").decode(
            m.get_content_charset() or "utf-8", "replace")
    except Exception:
        return m.get_payload() or ""



def _fetch_graph(account_id, thread_id, tenant_id) -> EmailThread:  # pragma: no cover
    """Reference: Microsoft Graph /me/messages?$filter=conversationId eq '...'."""
    raise NotImplementedError("wire Microsoft Graph client + OAuth token here")


def _stub_thread(account_id, thread_id, tenant_id) -> EmailThread:
    now = datetime.now(timezone.utc)
    return EmailThread(
        account_id=account_id, thread_id=thread_id, tenant_id=tenant_id,
        messages=[
            EmailMessage("m1", "inbound", now - timedelta(days=45),
                         "Onboarding went great, the team is happy with the rollout."),
            EmailMessage("m2", "outbound", now - timedelta(days=20),
                         "Glad to hear it! Let us know if you need anything."),
            EmailMessage("m3", "inbound", now - timedelta(days=5),
                         "The reporting bug is still unresolved and the renewal pricing "
                         "is hard to justify. We're evaluating a competitor."),
        ],
    )


# ---------------------------------------------------------------------------
# 2. Chunk — by message, then sliding char window with overlap.
# ---------------------------------------------------------------------------
@dataclass
class Chunk:
    account_id: str
    tenant_id: Optional[str]
    thread_id: str
    message_id: str
    chunk_idx: int
    sent_at: datetime
    direction: str
    content: str
    embedding: Optional[List[float]] = None
    sentiment: Optional[float] = None


def chunk_thread(thread: EmailThread) -> List[Chunk]:
    chunks: List[Chunk] = []
    for msg in thread.messages:
        body = msg.body.strip()
        windows = _sliding_windows(body, CHUNK_CHARS, CHUNK_OVERLAP) or [body]
        for i, w in enumerate(windows):
            chunks.append(Chunk(
                account_id=thread.account_id, tenant_id=thread.tenant_id,
                thread_id=thread.thread_id, message_id=msg.message_id,
                chunk_idx=i, sent_at=msg.sent_at, direction=msg.direction,
                content=w, sentiment=round(message_sentiment(w), 4),
            ))
    return chunks


def _sliding_windows(text: str, size: int, overlap: int) -> List[str]:
    if len(text) <= size:
        return [text]
    out, start = [], 0
    step = max(1, size - overlap)
    while start < len(text):
        out.append(text[start:start + size])
        start += step
    return out


# ---------------------------------------------------------------------------
# 3. Embed — Bedrock Titan v2 when available, else deterministic hash embed.
# ---------------------------------------------------------------------------
def embed_texts(texts: List[str]) -> List[List[float]]:
    if os.getenv("BEDROCK_REGION"):
        try:
            return _bedrock_embed(texts)
        except Exception as e:  # pragma: no cover
            print(f"[embed] Bedrock unavailable ({e}); using deterministic stub")
    return [_stub_embed(t) for t in texts]


def _bedrock_embed(texts: List[str]) -> List[List[float]]:  # pragma: no cover
    import boto3  # type: ignore

    rt = boto3.client("bedrock-runtime", region_name=os.environ["BEDROCK_REGION"])
    out: List[List[float]] = []
    for t in texts:
        resp = rt.invoke_model(
            modelId="amazon.titan-embed-text-v2:0",
            body=json.dumps({"inputText": t, "dimensions": EMBED_DIM,
                             "normalize": True}),
        )
        out.append(json.loads(resp["body"].read())["embedding"])
    return out


def _stub_embed(text: str) -> List[float]:
    """Deterministic pseudo-embedding (unit-norm) from a hash seed — repeatable."""
    seed = hashlib.sha256(text.encode()).digest()
    vals: List[float] = []
    i = 0
    while len(vals) < EMBED_DIM:
        block = hashlib.sha256(seed + struct.pack("I", i)).digest()
        for j in range(0, len(block), 4):
            if len(vals) >= EMBED_DIM:
                break
            n = struct.unpack("I", block[j:j + 4])[0]
            vals.append((n / 2**32) * 2 - 1)   # [-1, 1]
        i += 1
    norm = sum(v * v for v in vals) ** 0.5 or 1.0
    return [v / norm for v in vals]


# ---------------------------------------------------------------------------
# 4. Store — upsert chunks into public.email_chunks (idempotent on message+idx).
# ---------------------------------------------------------------------------
class MockChunkStore:
    def __init__(self) -> None:
        self.rows: List[Chunk] = []

    def upsert_chunks(self, chunks: List[Chunk]) -> int:
        self.rows.extend(chunks)
        return len(chunks)


class PgChunkStore:
    """Upsert into public.email_chunks. embedding written as pgvector literal."""

    SQL = """
        insert into public.email_chunks
            (tenant_id, account_id, thread_id, message_id, chunk_idx,
             sent_at, direction, content, embedding, sentiment)
        values
            (%(tenant_id)s, %(account_id)s, %(thread_id)s, %(message_id)s, %(chunk_idx)s,
             %(sent_at)s, %(direction)s, %(content)s, %(embedding)s::vector, %(sentiment)s)
        on conflict (message_id, chunk_idx) do update set
            content   = excluded.content,
            embedding = excluded.embedding,
            sentiment = excluded.sentiment;
    """

    def __init__(self, dsn: str) -> None:
        import psycopg  # type: ignore
        self._psycopg = psycopg
        self._dsn = dsn

    @staticmethod
    def _vec(v: List[float]) -> str:
        return "[" + ",".join(f"{x:.6f}" for x in v) + "]"

    def upsert_chunks(self, chunks: List[Chunk]) -> int:
        if not chunks:
            return 0
        rows = [{
            "tenant_id": c.tenant_id, "account_id": c.account_id,
            "thread_id": c.thread_id, "message_id": c.message_id,
            "chunk_idx": c.chunk_idx, "sent_at": c.sent_at, "direction": c.direction,
            "content": c.content, "embedding": self._vec(c.embedding or []),
            "sentiment": c.sentiment,
        } for c in chunks]
        with self._psycopg.connect(self._dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.executemany(self.SQL, rows)
        return len(rows)


def build_chunk_store():
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        try:
            print("[store] using PgChunkStore (email_chunks)")
            return PgChunkStore(dsn)
        except Exception as e:
            print(f"[store] Postgres unavailable ({e}); using mock chunk store")
    return MockChunkStore()


# ---------------------------------------------------------------------------
# Pipeline entrypoint
# ---------------------------------------------------------------------------
def ingest_thread(account_id: str, thread_id: str,
                  tenant_id: Optional[str] = None, store=None) -> int:
    store = store or build_chunk_store()
    thread = fetch_thread(account_id, thread_id, tenant_id)
    chunks = chunk_thread(thread)
    embeddings = embed_texts([c.content for c in chunks])
    for c, e in zip(chunks, embeddings):
        c.embedding = e
    n = store.upsert_chunks(chunks)
    print(f"[ingest] account={account_id} thread={thread_id}: "
          f"{n} chunks embedded (dim={EMBED_DIM}) -> stored")
    return n


def main() -> None:
    acct = os.getenv("DEMO_ACCOUNT_ID", "acct_042")
    tenant = os.getenv("DEMO_TENANT_ID")
    ingest_thread(acct, "thr_1001", tenant)


if __name__ == "__main__":
    main()
