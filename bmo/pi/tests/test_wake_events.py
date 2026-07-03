"""Regression tests for the wake-word feedback store (wake_events.py).

Locks in: append-only JSONL record shape, the false-accept classification
(empty / no_intent count as false accepts; command / interrupted do not),
the rolling-window stats math (false-accept rate, wakes/day), the line-count
bound, and that a write failure is swallowed (never breaks the voice path).
"""
import json

import pytest

import services.wake_events as we


@pytest.fixture
def store(tmp_path, monkeypatch):
    f = tmp_path / "wake_events.jsonl"
    monkeypatch.setattr(we, "WAKE_EVENTS_FILE", str(f))
    return f


class TestRecord:
    def test_record_writes_jsonl_line(self, store):
        we.record_wake("openwakeword", 0.12, "command", ts=1000.0)
        lines = store.read_text().strip().splitlines()
        assert len(lines) == 1
        rec = json.loads(lines[0])
        assert rec == {"ts": 1000.0, "engine": "openwakeword", "score": 0.12, "outcome": "command"}

    def test_none_score_is_preserved(self, store):
        we.record_wake("porcupine", None, "empty", ts=1.0)
        rec = json.loads(store.read_text().strip())
        assert rec["score"] is None

    def test_invalid_outcome_normalized(self, store):
        we.record_wake("oww", 0.1, "garbage", ts=1.0)
        rec = json.loads(store.read_text().strip())
        assert rec["outcome"] == "no_intent"

    def test_bound_trims_to_max(self, store, monkeypatch):
        monkeypatch.setattr(we, "MAX_EVENTS", 10)
        for i in range(25):
            we.record_wake("oww", 0.1, "command", ts=float(i))
        lines = store.read_text().strip().splitlines()
        assert len(lines) == 10
        # Most recent kept.
        assert json.loads(lines[-1])["ts"] == 24.0
        assert json.loads(lines[0])["ts"] == 15.0

    def test_write_failure_is_swallowed(self, monkeypatch):
        monkeypatch.setattr(we, "WAKE_EVENTS_FILE", "/proc/cannot-create-here/wake.jsonl")
        # Must not raise.
        we.record_wake("oww", 0.1, "command")


class TestStats:
    def test_empty_store_stats(self, store):
        s = we.stats(now=1000.0)
        assert s["total_wakes"] == 0
        assert s["false_accept_rate"] == 0.0

    def test_false_accept_rate(self, store):
        now = 100000.0
        # 2 real commands, 1 empty, 1 no_intent -> 2/4 false accepts.
        we.record_wake("oww", 0.2, "command", ts=now - 10)
        we.record_wake("oww", 0.2, "command", ts=now - 20)
        we.record_wake("oww", 0.06, "empty", ts=now - 30)
        we.record_wake("oww", 0.06, "no_intent", ts=now - 40)
        s = we.stats(window_hours=24.0, now=now)
        assert s["total_wakes"] == 4
        assert s["false_accepts"] == 2
        assert s["false_accept_rate"] == 0.5
        assert s["by_outcome"]["command"] == 2

    def test_window_excludes_old_events(self, store):
        now = 100000.0
        we.record_wake("oww", 0.2, "command", ts=now - 3600)          # 1h ago (in)
        we.record_wake("oww", 0.2, "command", ts=now - 48 * 3600)     # 48h ago (out)
        s = we.stats(window_hours=24.0, now=now)
        assert s["total_wakes"] == 1

    def test_wakes_per_day_extrapolates_window(self, store):
        now = 100000.0
        # 3 wakes in a 12h window -> 6 per day.
        for i in range(3):
            we.record_wake("oww", 0.2, "command", ts=now - (i + 1) * 3600)
        s = we.stats(window_hours=12.0, now=now)
        assert s["wakes_per_day"] == 6.0
