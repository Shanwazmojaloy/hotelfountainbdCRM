"""
kinesis_consumer.py
===================
Streaming consumer for the fraud feature/audit plane (01_..._architecture.md 2).

NOTE: this is the ASYNC plane (feature aggregation + audit), not the synchronous
decision path. It reads the transaction stream and refreshes rolling features in
the in-memory store. The blocking auth decision lives in fraud_ingestion_worker.

Real consumer gated by KINESIS_STREAM (+ boto3). Otherwise a mock generator runs
so the aggregation logic is exercised end-to-end.

    python kinesis_consumer.py            # mock stream -> feature counters
    KINESIS_STREAM=tx AWS_REGION=ap-south-1 python kinesis_consumer.py
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
import uuid
from typing import AsyncIterator, Dict, List

from fraud_ingestion_worker import Transaction, build_feature_store


# ---------------------------------------------------------------------------
# Source: real Kinesis (enhanced fan-out skeleton) or a mock generator.
# ---------------------------------------------------------------------------
async def stream_records(n: int = 500) -> AsyncIterator[Transaction]:
    if os.getenv("KINESIS_STREAM"):
        async for txn in _kinesis_records():
            yield txn
        return
    async for txn in _mock_records(n):
        yield txn


async def _mock_records(n: int) -> AsyncIterator[Transaction]:
    countries = ["BD", "US", "GB", "AE", "SG"]
    mccs = ["5411", "5812", "6011", "4829", "7995"]
    for _ in range(n):
        yield Transaction(
            auth_id=str(uuid.uuid4()),
            card_id=f"card_{random.randint(1, 40)}",
            amount=round(random.uniform(50, 250_000), 2),
            currency="BDT",
            mcc=random.choice(mccs),
            country=random.choice(countries),
            merchant_id=f"m_{random.randint(1, 200)}",
        )
        await asyncio.sleep(0)


async def _kinesis_records() -> AsyncIterator[Transaction]:  # pragma: no cover
    """Reference: SubscribeToShard (enhanced fan-out) gives pushed records.

    Sketch (boto3 is sync; run blocking calls in a thread or use aiobotocore):
        kinesis = boto3.client('kinesis', region_name=os.environ['AWS_REGION'])
        shards = kinesis.list_shards(StreamName=os.environ['KINESIS_STREAM'])['Shards']
        # register a consumer (RegisterStreamConsumer) for 2MB/s dedicated throughput,
        # then SubscribeToShard per shard and decode each Record['Data'] (JSON) into
        # a Transaction. Checkpoint sequence numbers durably (DynamoDB) for replay.
    """
    raise NotImplementedError("wire Kinesis SubscribeToShard + checkpointing here")


# ---------------------------------------------------------------------------
# Aggregator: maintain rolling features in the in-memory store.
# Authoritative windows would be computed by Managed Flink; this write-time
# counter is the cheap supplement described in section 3.3 (2).
# ---------------------------------------------------------------------------
async def run_consumer(n: int = 500, concurrency: int = 128) -> Dict[str, int]:
    store = await build_feature_store()
    sem = asyncio.Semaphore(concurrency)
    seen: Dict[str, int] = {}

    async def handle(txn: Transaction):
        async with sem:
            await store.bump_realtime_counters(txn)
            seen[txn.card_id] = seen.get(txn.card_id, 0) + 1

    tasks = [asyncio.create_task(handle(t)) async for t in stream_records(n)]
    await asyncio.gather(*tasks)
    hottest = max(seen.items(), key=lambda kv: kv[1]) if seen else ("none", 0)
    print(f"[consumer] processed {sum(seen.values())} records across "
          f"{len(seen)} cards; hottest={hottest[0]} ({hottest[1]} txns)")
    return seen


if __name__ == "__main__":
    random.seed(11)
    asyncio.run(run_consumer())
