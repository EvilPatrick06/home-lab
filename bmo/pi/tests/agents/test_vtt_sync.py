"""Tests for the Pi→VTT sync push: eventId stamping + bounded retry.

Delivery is idempotent — `_post_to_vtt` stamps a stable `eventId` and the VTT
dedups on it, so `_send_with_retry` can safely re-POST on a transient failure
without double-applying the event. No real HTTP (requests.post is mocked) and
no real backoff (time.sleep is mocked).
"""

from unittest.mock import MagicMock

from agents import vtt_sync
from agents.vtt_sync import _post_to_vtt, _send_with_retry


def _resp(status: int) -> MagicMock:
    r = MagicMock()
    r.status_code = status
    return r


def test_send_succeeds_on_first_attempt(monkeypatch):
    post = MagicMock(return_value=_resp(200))
    sleep = MagicMock()
    monkeypatch.setattr(vtt_sync.requests, "post", post)
    monkeypatch.setattr(vtt_sync.time, "sleep", sleep)

    assert _send_with_retry("http://vtt/api/sync", {"eventId": "e1"}) is True
    assert post.call_count == 1
    sleep.assert_not_called()


def test_send_recovers_after_transient_failures(monkeypatch):
    post = MagicMock(side_effect=[_resp(503), _resp(503), _resp(200)])
    monkeypatch.setattr(vtt_sync.requests, "post", post)
    monkeypatch.setattr(vtt_sync.time, "sleep", MagicMock())

    assert _send_with_retry("http://vtt/api/sync", {"eventId": "e1"}) is True
    assert post.call_count == 3


def test_send_gives_up_after_all_attempts(monkeypatch):
    post = MagicMock(side_effect=vtt_sync.requests.RequestException("connection refused"))
    monkeypatch.setattr(vtt_sync.requests, "post", post)
    monkeypatch.setattr(vtt_sync.time, "sleep", MagicMock())

    assert _send_with_retry("http://vtt/api/sync", {"eventId": "e1"}) is False
    # initial attempt + one per RETRY_DELAYS
    assert post.call_count == len(vtt_sync.RETRY_DELAYS) + 1


def test_post_stamps_a_stable_event_id(monkeypatch):
    captured: dict = {}

    def fake_thread(target=None, args=(), daemon=None):
        captured["args"] = args
        return MagicMock()

    monkeypatch.setattr(vtt_sync.threading, "Thread", fake_thread)
    _post_to_vtt("/api/sync", {"type": "discord_roll", "payload": {}})

    _url, payload = captured["args"]
    assert payload.get("eventId")  # non-empty uuid stamped


def test_post_reuses_a_caller_supplied_event_id(monkeypatch):
    captured: dict = {}

    def fake_thread(target=None, args=(), daemon=None):
        captured["args"] = args
        return MagicMock()

    monkeypatch.setattr(vtt_sync.threading, "Thread", fake_thread)
    _post_to_vtt("/api/sync", {"type": "discord_roll", "payload": {}, "eventId": "preset-id"})

    _url, payload = captured["args"]
    assert payload["eventId"] == "preset-id"
