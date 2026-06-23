"""Process-lifetime monotonic counters for BMO (e.g. provider fallbacks).

Deliberately tiny and dependency-free: a thread-safe dict of counters that the
Prometheus `/metrics` endpoint reads. Incrementing must NEVER raise into a hot
path (voice / LLM), so `incr` swallows everything — same discipline as
voice_metrics.record_stage. Counters reset on process restart (Prometheus
handles counter resets natively). See BMO-SUGGESTIONS 2026-06-23 (Prometheus
metrics export).
"""
from __future__ import annotations

import threading
from collections import defaultdict

_LOCK = threading.Lock()
_counters: dict[str, float] = defaultdict(float)


def incr(name: str, amount: float = 1.0) -> None:
    """Increment a counter. Never raises."""
    try:
        with _LOCK:
            _counters[name] += amount
    except Exception:
        pass


def get_all() -> dict[str, float]:
    with _LOCK:
        return dict(_counters)


def reset() -> None:
    with _LOCK:
        _counters.clear()
