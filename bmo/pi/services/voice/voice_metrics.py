"""Thread-safe per-stage latency collector for the voice pipeline.

Each stage records its duration into a bounded ring; /api/metrics/voice exposes
count/avg/p50/p95/max per stage. Recording is a cheap locked append and must
never raise into the voice path. (BMO-SUGGESTIONS 2026-06-22.)
"""
from __future__ import annotations

import threading
from collections import defaultdict, deque

_LOCK = threading.Lock()
_MAX = 200  # samples kept per stage
_samples: dict[str, deque] = defaultdict(lambda: deque(maxlen=_MAX))


def record_stage(stage: str, seconds: float) -> None:
    """Record one stage duration. Never raises (metrics must not break voice)."""
    try:
        with _LOCK:
            _samples[stage].append(float(seconds))
    except Exception:
        pass


def _pct(vals_sorted, p):
    if not vals_sorted:
        return 0.0
    k = int(round((p / 100.0) * (len(vals_sorted) - 1)))
    k = max(0, min(len(vals_sorted) - 1, k))
    return vals_sorted[k]


def get_metrics() -> dict:
    """Aggregate snapshot per stage."""
    with _LOCK:
        snap = {k: list(v) for k, v in _samples.items()}
    out = {}
    for stage, vals in snap.items():
        if not vals:
            continue
        s = sorted(vals)
        out[stage] = {
            "count": len(s),
            "avg_s": round(sum(s) / len(s), 3),
            "p50_s": round(_pct(s, 50), 3),
            "p95_s": round(_pct(s, 95), 3),
            "max_s": round(max(s), 3),
        }
    return out


def reset() -> None:
    with _LOCK:
        _samples.clear()
