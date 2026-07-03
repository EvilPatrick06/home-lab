"""Wake-word event feedback store — makes false-accept/reject rates measurable.

Before this, near-threshold wake scores went only to the app log and were never
joined to the outcome of the turn that followed, so false-accept / false-reject
rates were unknowable and WAKE_OWW_THRESHOLD / PORCUPINE_SENSITIVITY were tuned
blind. This module persists one small record per wake — (ts, engine, score,
outcome) — as append-only JSONL under DATA_DIR, bounded by line count, and
computes rolling stats (false-accept rate, wakes/day) for the health surface.

Outcomes (the ground truth for a false accept):
  - "command"   — the wake led to a real transcribed command that got a response.
  - "empty"     — no speech / empty STT after the wake (probable false accept).
  - "no_intent" — speech transcribed but the router found no actionable intent.
  - "interrupted" — the user cancelled / said "never mind".

A wake whose outcome is "empty" or "no_intent" counts toward the false-accept
rate. Everything is best-effort: a write failure never breaks the voice path.
"""
from __future__ import annotations

import json
import os
import threading
import time

from services.paths import DATA_DIR as _DATA_DIR

WAKE_EVENTS_FILE = os.path.join(str(_DATA_DIR), "wake_events.jsonl")

# Keep the JSONL bounded so it can't grow without limit on the Pi.
MAX_EVENTS = int(os.environ.get("BMO_WAKE_EVENTS_MAX", "5000"))

# Outcomes that indicate the wake fired but no real command followed.
FALSE_ACCEPT_OUTCOMES = frozenset({"empty", "no_intent"})
VALID_OUTCOMES = frozenset({"command", "empty", "no_intent", "interrupted"})

_lock = threading.Lock()


def record_wake(engine: str, score: float | None, outcome: str,
                *, ts: float | None = None, path: str | None = None) -> None:
    """Append one wake-event record. Best-effort — never raises to the caller."""
    if outcome not in VALID_OUTCOMES:
        outcome = "no_intent"
    rec = {
        "ts": ts if ts is not None else time.time(),
        "engine": engine,
        "score": round(float(score), 4) if score is not None else None,
        "outcome": outcome,
    }
    fpath = path or WAKE_EVENTS_FILE
    try:
        with _lock:
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
            _trim(fpath)
    except Exception:
        # Feedback logging must never break wake handling.
        pass


def _trim(fpath: str) -> None:
    """Cap the JSONL at MAX_EVENTS lines, keeping the most recent."""
    try:
        with open(fpath, encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) <= MAX_EVENTS:
            return
        keep = lines[-MAX_EVENTS:]
        tmp = fpath + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(keep)
        os.replace(tmp, fpath)
    except Exception:
        pass


def _read(path: str | None = None) -> list[dict]:
    fpath = path or WAKE_EVENTS_FILE
    out = []
    try:
        with open(fpath, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except (ValueError, json.JSONDecodeError):
                    continue
    except FileNotFoundError:
        return []
    except Exception:
        return []
    return out


def stats(window_hours: float = 24.0, *, path: str | None = None,
          now: float | None = None) -> dict:
    """Rolling wake-word feedback stats over the last ``window_hours``.

    Returns total wakes, false-accept count + rate, and wakes-per-day, plus a
    per-outcome breakdown — the numbers a threshold-tuning surface needs.
    """
    now = now if now is not None else time.time()
    cutoff = now - window_hours * 3600.0
    events = [e for e in _read(path) if isinstance(e.get("ts"), (int, float)) and e["ts"] >= cutoff]

    total = len(events)
    by_outcome: dict[str, int] = {}
    scores = []
    false_accepts = 0
    for e in events:
        outcome = e.get("outcome", "no_intent")
        by_outcome[outcome] = by_outcome.get(outcome, 0) + 1
        if outcome in FALSE_ACCEPT_OUTCOMES:
            false_accepts += 1
        if isinstance(e.get("score"), (int, float)):
            scores.append(e["score"])

    fa_rate = (false_accepts / total) if total else 0.0
    per_day = (total / window_hours * 24.0) if window_hours else 0.0
    return {
        "window_hours": window_hours,
        "total_wakes": total,
        "false_accepts": false_accepts,
        "false_accept_rate": round(fa_rate, 4),
        "wakes_per_day": round(per_day, 2),
        "by_outcome": by_outcome,
        "avg_score": round(sum(scores) / len(scores), 4) if scores else None,
    }
