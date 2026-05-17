"""Unit tests for services.game_registry (Phase 29f).

Covers register/dedup/heartbeat-TTL/GC/SSE-subscribe paths. The clock is
injected so GC behavior is deterministic without sleeping.
"""

from __future__ import annotations

import threading
import time

import pytest

from services.game_registry import (
    DEFAULT_TTL_SECONDS,
    GameRegistry,
    Subscription,
)


# ── Fixtures ───────────────────────────────────────────────────────────


class _FakeClock:
    """Monotonic-clock stand-in we can tick manually."""

    def __init__(self) -> None:
        self._t = 1_000.0

    def __call__(self) -> float:
        return self._t

    def advance(self, delta: float) -> None:
        self._t += delta


@pytest.fixture
def clock() -> _FakeClock:
    return _FakeClock()


@pytest.fixture
def registry(clock: _FakeClock) -> GameRegistry:
    r = GameRegistry(ttl_seconds=60.0, clock=clock, autostart_gc=False)
    yield r
    r.stop_gc()


def _sample_entry(invite_code: str = "ABC123", **overrides: object) -> dict:
    base = {
        "invite_code": invite_code,
        "name": "Test Game",
        "host_display_name": "Patrick",
        "host_client_id": "client-uuid-1",
        "max_players": 8,
        "max_spectators": 5,
        "peer_id": "peer-1",
        "game_system": "dnd5e",
        "is_private": False,
    }
    base.update(overrides)
    return base


# ── register / dedup ──────────────────────────────────────────────────


def test_register_inserts_entry(registry: GameRegistry) -> None:
    result = registry.register(_sample_entry())
    assert result["invite_code"] == "ABC123"
    assert result["last_heartbeat"] > 0
    assert len(registry) == 1


def test_register_dedups_on_invite_code(registry: GameRegistry) -> None:
    registry.register(_sample_entry(name="First"))
    registry.register(_sample_entry(name="Second"))
    assert len(registry) == 1
    listing = registry.list()
    assert listing[0]["name"] == "Second"


def test_register_rejects_missing_required_field(registry: GameRegistry) -> None:
    bad = _sample_entry()
    del bad["host_display_name"]
    with pytest.raises(ValueError, match="host_display_name"):
        registry.register(bad)


# ── heartbeat / TTL / GC ──────────────────────────────────────────────


def test_heartbeat_refreshes_last_heartbeat(
    registry: GameRegistry, clock: _FakeClock
) -> None:
    registry.register(_sample_entry())
    original = registry.list()[0]["created_at"]
    clock.advance(20)
    assert registry.heartbeat("ABC123") is True
    # heartbeat itself doesn't leak `last_heartbeat`, but it should
    # protect the entry from a subsequent reap.
    reaped = registry.reap_stale()
    assert reaped == 0
    assert len(registry) == 1
    assert registry.list()[0]["created_at"] == original


def test_heartbeat_unknown_code_returns_false(registry: GameRegistry) -> None:
    assert registry.heartbeat("ZZZZZZ") is False


def test_reap_stale_drops_entries_past_ttl(
    registry: GameRegistry, clock: _FakeClock
) -> None:
    registry.register(_sample_entry())
    clock.advance(DEFAULT_TTL_SECONDS + 5)
    reaped = registry.reap_stale()
    assert reaped == 1
    assert len(registry) == 0


def test_reap_stale_keeps_fresh_entries(
    registry: GameRegistry, clock: _FakeClock
) -> None:
    registry.register(_sample_entry("AAA111"))
    clock.advance(30)
    registry.register(_sample_entry("BBB222"))
    clock.advance(40)  # AAA: 70s old, BBB: 40s old
    reaped = registry.reap_stale()
    assert reaped == 1
    codes = {e["invite_code"] for e in registry.list()}
    assert codes == {"BBB222"}


def test_gc_thread_can_be_started_and_stopped() -> None:
    r = GameRegistry(ttl_seconds=0.05, gc_tick_seconds=0.02, autostart_gc=False)
    r.start_gc()
    r.register(_sample_entry())
    time.sleep(0.2)
    r.stop_gc()
    assert len(r) == 0


# ── update / deregister ───────────────────────────────────────────────


def test_update_merges_patch(registry: GameRegistry) -> None:
    registry.register(_sample_entry())
    updated = registry.update("ABC123", {"current_players": 4, "current_spectators": 2})
    assert updated is not None
    assert updated["current_players"] == 4
    assert updated["current_spectators"] == 2


def test_update_ignores_invite_code_rename(registry: GameRegistry) -> None:
    registry.register(_sample_entry())
    registry.update("ABC123", {"invite_code": "XYZ"})
    # Still keyed on the original code.
    assert registry.get("ABC123") is not None
    assert registry.get("XYZ") is None


def test_update_unknown_code_returns_none(registry: GameRegistry) -> None:
    assert registry.update("ZZZZZZ", {"current_players": 1}) is None


def test_deregister_removes_entry(registry: GameRegistry) -> None:
    registry.register(_sample_entry())
    assert registry.deregister("ABC123") is True
    assert registry.deregister("ABC123") is False
    assert len(registry) == 0


# ── ban filtering ─────────────────────────────────────────────────────


def test_ban_flag_per_subscriber(registry: GameRegistry) -> None:
    entry = _sample_entry()
    entry["banned_client_ids"] = {"bad-client"}
    registry.register(entry)
    listing_neutral = registry.list(filter_client_id="other-client")
    listing_banned = registry.list(filter_client_id="bad-client")
    assert listing_neutral[0]["banned_from_this_game"] is False
    assert listing_banned[0]["banned_from_this_game"] is True


def test_ban_client_mutates_existing(registry: GameRegistry) -> None:
    registry.register(_sample_entry())
    assert registry.ban_client("ABC123", "naughty") is True
    listing = registry.list(filter_client_id="naughty")
    assert listing[0]["banned_from_this_game"] is True


# ── SSE subscriptions ────────────────────────────────────────────────


def _drain_until(sub: Subscription, predicate, *, limit: int = 20):
    """Pull events from the subscription, skipping heartbeats, until
    `predicate(event)` is truthy or we hit `limit` events."""
    collected = []
    for event in sub.iter_events(heartbeat_seconds=0.05):
        if event["event"] == "heartbeat":
            continue
        collected.append(event)
        if predicate(event) or len(collected) >= limit:
            return collected
    return collected


def test_subscribe_emits_initial_snapshot(registry: GameRegistry) -> None:
    registry.register(_sample_entry())
    sub = registry.subscribe(filter_client_id="me")
    try:
        # First event is the full snapshot.
        first = next(sub.iter_events(heartbeat_seconds=0.05))
        assert first["event"] == "games:full"
        assert len(first["data"]["games"]) == 1
        assert first["data"]["games"][0]["invite_code"] == "ABC123"
    finally:
        sub.close()


def test_subscribe_streams_register_event(registry: GameRegistry) -> None:
    sub = registry.subscribe()
    try:
        # Consume the initial empty snapshot.
        first = next(sub.iter_events(heartbeat_seconds=0.05))
        assert first["event"] == "games:full"
        assert first["data"]["games"] == []
        # Now register from another "thread".
        def _publish():
            registry.register(_sample_entry())
        t = threading.Thread(target=_publish)
        t.start()
        events = _drain_until(sub, lambda e: e["event"] == "games:added")
        t.join(timeout=1.0)
        added = [e for e in events if e["event"] == "games:added"]
        assert added, f"no games:added event; saw: {events}"
        assert added[-1]["data"]["invite_code"] == "ABC123"
    finally:
        sub.close()


def test_subscribe_streams_update_and_remove(registry: GameRegistry) -> None:
    registry.register(_sample_entry())
    sub = registry.subscribe()
    try:
        # Drain initial snapshot.
        next(sub.iter_events(heartbeat_seconds=0.05))
        registry.update("ABC123", {"current_players": 3})
        registry.deregister("ABC123")
        events = _drain_until(sub, lambda e: e["event"] == "games:removed")
        kinds = [e["event"] for e in events]
        assert "games:updated" in kinds
        assert "games:removed" in kinds
        last = events[-1]
        assert last["event"] == "games:removed"
        assert last["data"]["invite_code"] == "ABC123"
    finally:
        sub.close()


def test_subscribe_heartbeat_keeps_stream_alive(registry: GameRegistry) -> None:
    sub = registry.subscribe()
    try:
        # Drain the snapshot.
        next(sub.iter_events(heartbeat_seconds=0.05))
        # No mutations — the next event should be a heartbeat.
        evt = next(sub.iter_events(heartbeat_seconds=0.05))
        assert evt["event"] == "heartbeat"
    finally:
        sub.close()


def test_unsubscribe_removes_subscriber(registry: GameRegistry) -> None:
    sub = registry.subscribe()
    assert len(registry._subscribers) == 1  # noqa: SLF001
    sub.close()
    assert len(registry._subscribers) == 0  # noqa: SLF001


def test_per_subscriber_ban_serialization(registry: GameRegistry) -> None:
    entry = _sample_entry()
    entry["banned_client_ids"] = {"bad"}
    registry.register(entry)
    sub_bad = registry.subscribe(filter_client_id="bad")
    sub_neutral = registry.subscribe(filter_client_id="other")
    try:
        snap_bad = next(sub_bad.iter_events(heartbeat_seconds=0.05))
        snap_neutral = next(sub_neutral.iter_events(heartbeat_seconds=0.05))
        assert snap_bad["data"]["games"][0]["banned_from_this_game"] is True
        assert snap_neutral["data"]["games"][0]["banned_from_this_game"] is False
    finally:
        sub_bad.close()
        sub_neutral.close()
