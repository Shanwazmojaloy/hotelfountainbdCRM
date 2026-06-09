"""
triton_client.py
================
Async client wrapper for the fraud inference engine (NVIDIA Triton + TensorRT).

Drop-in for fraud_ingestion_worker.score_model(): same 30ms-deadline contract,
same ModelTimeout on breach, so the fallback ladder is unchanged. Real gRPC call
is gated by TRITON_URL (+ tritonclient); otherwise a deterministic stub runs.

Implements the cascade from 01_fraud_detection_architecture.md section 4.2:
    XGBoost (FIL backend, ~few ms)  ->  escalate only the ambiguous band
                                    ->  GNN/Transformer (TensorRT, ~20-30ms)
"""

from __future__ import annotations

import asyncio
import os
from typing import Dict, List

# Reuse the worker's contract so behavior stays identical.
from fraud_ingestion_worker import MODEL_DEADLINE_S, ModelTimeout, _dummy_infer

# Feature order the model expects (must match training).
FEATURE_ORDER: List[str] = [
    "txn_count_10m", "amount_zscore", "distinct_country_1h",
    "seconds_since_last_txn", "decline_count_1h", "ring_risk_score",
]
ESCALATE_BAND = (0.20, 0.80)   # XGBoost scores here escalate to the deep model


def _vectorize(features: Dict[str, float]) -> List[float]:
    return [float(features.get(k, 0.0)) for k in FEATURE_ORDER]


async def score(features: Dict[str, float]) -> float:
    """Cascade score with a hard deadline. Raises ModelTimeout on breach."""
    coro = _score_cascade(features)
    try:
        return await asyncio.wait_for(coro, timeout=MODEL_DEADLINE_S)
    except asyncio.TimeoutError as e:
        raise ModelTimeout() from e


async def _score_cascade(features: Dict[str, float]) -> float:
    fast = await _infer("fraud_xgb_fil", _vectorize(features))
    if ESCALATE_BAND[0] <= fast <= ESCALATE_BAND[1]:
        deep = await _infer("fraud_gnn_trt", _vectorize(features))
        return deep
    return fast


async def _infer(model_name: str, vector: List[float]) -> float:
    if os.getenv("TRITON_URL"):
        return await _triton_infer(model_name, vector)
    # Stub: reuse the worker's dummy inference for a realistic score+latency.
    return await _dummy_infer({k: v for k, v in zip(FEATURE_ORDER, vector)})


async def _triton_infer(model_name: str, vector: List[float]) -> float:  # pragma: no cover
    """Reference Triton gRPC call (run in a thread; client is sync).

        import tritonclient.grpc as tg, numpy as np
        client = tg.InferenceServerClient(url=os.environ['TRITON_URL'])
        inp = tg.InferInput('input__0', [1, len(vector)], 'FP32')
        inp.set_data_from_numpy(np.array([vector], dtype=np.float32))
        out = tg.InferRequestedOutput('score__0')
        res = client.infer(model_name, [inp], outputs=[out],
                           client_timeout=MODEL_DEADLINE_S)
        return float(res.as_numpy('score__0')[0])
    """
    import numpy as np  # type: ignore
    import tritonclient.grpc as tg  # type: ignore

    def _call() -> float:
        client = tg.InferenceServerClient(url=os.environ["TRITON_URL"])
        inp = tg.InferInput("input__0", [1, len(vector)], "FP32")
        inp.set_data_from_numpy(np.array([vector], dtype=np.float32))
        out = tg.InferRequestedOutput("score__0")
        res = client.infer(model_name, [inp], outputs=[out],
                           client_timeout=MODEL_DEADLINE_S)
        return float(res.as_numpy("score__0")[0])

    return await asyncio.to_thread(_call)


async def _demo() -> None:
    import random
    random.seed(3)
    feats = {"amount_zscore": 2.1, "ring_risk_score": 0.7,
             "distinct_country_1h": 2, "decline_count_1h": 1}
    timeouts = 0
    for _ in range(50):
        try:
            s = await score(feats)
        except ModelTimeout:
            timeouts += 1
            s = None
    print(f"triton_client cascade demo: scored 50, timeouts={timeouts} "
          f"(fallback handled by worker)")


if __name__ == "__main__":
    asyncio.run(_demo())
