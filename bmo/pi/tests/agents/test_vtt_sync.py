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

    monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", "http://vtt:5001")
    monkeypatch.setattr(vtt_sync.threading, "Thread", fake_thread)
    _post_to_vtt("/api/sync", {"type": "discord_roll", "payload": {}})

    _url, payload = captured["args"]
    assert payload.get("eventId")  # non-empty uuid stamped


def test_post_reuses_a_caller_supplied_event_id(monkeypatch):
    captured: dict = {}

    def fake_thread(target=None, args=(), daemon=None):
        captured["args"] = args
        return MagicMock()

    monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", "http://vtt:5001")
    monkeypatch.setattr(vtt_sync.threading, "Thread", fake_thread)
    _post_to_vtt("/api/sync", {"type": "discord_roll", "payload": {}, "eventId": "preset-id"})

    _url, payload = captured["args"]
    assert payload["eventId"] == "preset-id"


# ── PHASE-22 22A: config gating, bearer auth, payload contract, last_push ──


def test_post_is_noop_when_url_unset(monkeypatch):
    thread = MagicMock()
    monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", "")
    monkeypatch.setattr(vtt_sync.threading, "Thread", thread)
    assert _post_to_vtt("/api/sync", {"type": "discord_message", "payload": {}}) is False
    thread.assert_not_called()  # no doomed retry thread when unconfigured


def test_bearer_header_present_when_token_set(monkeypatch):
    post = MagicMock(return_value=_resp(200))
    monkeypatch.setattr(vtt_sync.requests, "post", post)
    monkeypatch.setattr(vtt_sync.time, "sleep", MagicMock())
    monkeypatch.setattr(vtt_sync, "VTT_SYNC_TOKEN", "s3cret")
    _send_with_retry("http://vtt/api/sync", {"eventId": "e1"})
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer s3cret"


def test_no_bearer_header_when_token_absent(monkeypatch):
    post = MagicMock(return_value=_resp(200))
    monkeypatch.setattr(vtt_sync.requests, "post", post)
    monkeypatch.setattr(vtt_sync.time, "sleep", MagicMock())
    monkeypatch.setattr(vtt_sync, "VTT_SYNC_TOKEN", "")
    _send_with_retry("http://vtt/api/sync", {"eventId": "e1"})
    assert post.call_args.kwargs["headers"] == {}


def test_last_push_updated_on_success_and_failure(monkeypatch):
    monkeypatch.setattr(vtt_sync.time, "sleep", MagicMock())
    monkeypatch.setattr(vtt_sync.requests, "post", MagicMock(return_value=_resp(200)))
    _send_with_retry("http://vtt/api/sync", {"eventId": "e1"})
    assert vtt_sync.last_push["ok"] is True and vtt_sync.last_push["status"] == 200
    monkeypatch.setattr(
        vtt_sync.requests, "post", MagicMock(side_effect=vtt_sync.requests.RequestException("nope"))
    )
    _send_with_retry("http://vtt/api/sync", {"eventId": "e2"})
    assert vtt_sync.last_push["ok"] is False


def _capture_payload(monkeypatch) -> dict:
    captured: dict = {}

    def fake_thread(target=None, args=(), daemon=None):
        captured["payload"] = args[1]
        return MagicMock()

    monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", "http://vtt:5001")
    monkeypatch.setattr(vtt_sync.threading, "Thread", fake_thread)
    return captured


def test_payload_keys_match_vtt_contract(monkeypatch):
    cap = _capture_payload(monkeypatch)
    vtt_sync.push_discord_message("alice", "hello", character_name="Aria")
    assert cap["payload"]["payload"] == {"text": "hello", "author": "alice", "characterName": "Aria"}

    cap = _capture_payload(monkeypatch)
    vtt_sync.push_discord_roll("bob", "1d20+5", 17, rolls=[12])
    p = cap["payload"]["payload"]
    assert p["formula"] == "1d20+5" and p["total"] == 17 and p["rollerName"] == "bob" and p["rolls"] == [12]

    cap = _capture_payload(monkeypatch)
    vtt_sync.push_player_join("carol")
    assert cap["payload"]["payload"]["playerName"] == "carol"

    cap = _capture_payload(monkeypatch)
    vtt_sync.push_player_leave("dave")
    assert cap["payload"]["payload"] == {"playerName": "dave"}


def test_validate_sync_config_shape(monkeypatch):
    monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", "http://vtt:5001")
    monkeypatch.setattr(vtt_sync, "VTT_SYNC_TOKEN", "k")
    cfg = vtt_sync.validate_sync_config()
    assert cfg == {"enabled": True, "url": "http://vtt:5001", "auth": True}
    monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", "")
    assert vtt_sync.validate_sync_config()["enabled"] is False
