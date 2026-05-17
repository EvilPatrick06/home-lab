"""BMO Game Registry — In-memory directory of active dnd-app multiplayer games.

The dnd-app VTT (Electron client) announces a hosted game here so other
players on the LAN/internet can discover it without having to type an
invite code. A heartbeat keeps the entry alive; a background GC tick
sweeps stale entries; SSE subscribers receive live add/update/remove
events.

Storage is intentionally in-memory only — game listings are ephemeral
and rebuilt on Pi reboot when hosts heartbeat again.

Phase 29f.
"""

from __future__ import annotations

import queue
import threading
import time
from typing import Any, Iterable


# Heartbeat must arrive at least this often or the entry is GC'd.
DEFAULT_TTL_SECONDS = 60.0

# How often the GC thread checks for stale entries.
DEFAULT_GC_TICK_SECONDS = 30.0

# How often SSE subscribers receive a keep-alive comment.
SSE_HEARTBEAT_SECONDS = 15.0


class GameRegistry:
    """Thread-safe in-memory directory of active multiplayer games.

    Indexed by `invite_code` (canonical key). Each entry exposes the
    fields the client needs to render a GameCard plus a `banned_client_ids`
    set used to flag games a particular client is banned from.

    Mutation methods (`register`, `heartbeat`, `update`, `deregister`)
    are safe to call from any thread; SSE subscriber queues receive the
    resulting event so the wire stream stays in sync.
    """

    def __init__(
        self,
        ttl_seconds: float = DEFAULT_TTL_SECONDS,
        gc_tick_seconds: float = DEFAULT_GC_TICK_SECONDS,
        clock: Any = time.monotonic,
        autostart_gc: bool = True,
    ) -> None:
        self._ttl = ttl_seconds
        self._gc_tick = gc_tick_seconds
        self._clock = clock

        self._lock = threading.RLock()
        self._games: dict[str, dict[str, Any]] = {}
        # SSE subscribers: each is a (queue, filter_client_id) pair so we
        # can serialize `banned_from_this_game` per-subscriber without
        # mutating attributes on the queue object (gevent's queue has
        # __slots__ and rejects setattr).
        self._subscribers: list[tuple[queue.Queue, str | None]] = []

        self._gc_stop = threading.Event()
        self._gc_thread: threading.Thread | None = None
        if autostart_gc:
            self.start_gc()

    # ── Mutations ──────────────────────────────────────────────────────

    def register(self, entry: dict[str, Any]) -> dict[str, Any]:
        """Insert or replace an entry keyed on `invite_code`.

        Required fields: invite_code, name, host_display_name,
        host_client_id, max_players, max_spectators, peer_id, game_system.
        Optional: current_players, current_spectators, is_private,
        banned_client_ids (iterable). Emits a games:added or
        games:updated event depending on whether the code is new.
        """
        invite_code = self._require(entry, "invite_code")
        normalized = self._normalize(entry)
        with self._lock:
            is_new = invite_code not in self._games
            self._games[invite_code] = normalized
            self._publish("games:added" if is_new else "games:updated", normalized)
        return normalized

    def heartbeat(self, invite_code: str) -> bool:
        """Refresh `last_heartbeat`. Returns False if the entry is gone."""
        with self._lock:
            entry = self._games.get(invite_code)
            if not entry:
                return False
            entry["last_heartbeat"] = self._clock()
            # No SSE emit — heartbeats are not interesting state changes.
            return True

    def update(self, invite_code: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        """Merge `patch` into an existing entry. Returns the updated entry
        or None if the code is unknown."""
        if not patch:
            return None
        with self._lock:
            entry = self._games.get(invite_code)
            if not entry:
                return None
            for key, value in patch.items():
                if key == "invite_code":
                    # Never let a PATCH renominate the canonical key.
                    continue
                if key == "banned_client_ids":
                    entry[key] = set(value or ())
                else:
                    entry[key] = value
            entry["last_heartbeat"] = self._clock()
            self._publish("games:updated", entry)
            return entry

    def deregister(self, invite_code: str) -> bool:
        """Remove an entry. Returns True if it existed."""
        with self._lock:
            entry = self._games.pop(invite_code, None)
            if not entry:
                return False
            self._publish("games:removed", {"invite_code": invite_code})
            return True

    def ban_client(self, invite_code: str, client_id: str) -> bool:
        """Mark `client_id` as banned from a specific game."""
        with self._lock:
            entry = self._games.get(invite_code)
            if not entry:
                return False
            entry["banned_client_ids"].add(client_id)
            self._publish("games:updated", entry)
            return True

    # ── Reads ──────────────────────────────────────────────────────────

    def list(self, filter_client_id: str | None = None) -> list[dict[str, Any]]:
        """Return a list of serializable entries, each annotated with
        `banned_from_this_game` relative to `filter_client_id` (if given)."""
        with self._lock:
            return [self._serialize(e, filter_client_id) for e in self._games.values()]

    def get(self, invite_code: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._games.get(invite_code)
            return None if entry is None else self._serialize(entry, None)

    def __len__(self) -> int:
        with self._lock:
            return len(self._games)

    # ── SSE subscriptions ─────────────────────────────────────────────

    def subscribe(self, filter_client_id: str | None = None) -> "Subscription":
        """Create a new SSE subscription. The first event delivered is a
        full snapshot (`games:full`) so the client doesn't have to bridge
        the initial state separately."""
        q: queue.Queue = queue.Queue(maxsize=256)
        snapshot = {"games": self.list(filter_client_id=filter_client_id)}
        q.put_nowait({"event": "games:full", "data": snapshot})
        entry = (q, filter_client_id)
        with self._lock:
            self._subscribers.append(entry)
        return Subscription(self, q, entry)

    def _unsubscribe(self, entry: tuple[queue.Queue, str | None]) -> None:
        with self._lock:
            try:
                self._subscribers.remove(entry)
            except ValueError:
                pass

    # ── GC lifecycle ──────────────────────────────────────────────────

    def start_gc(self) -> None:
        if self._gc_thread is not None:
            return
        self._gc_stop.clear()
        self._gc_thread = threading.Thread(
            target=self._gc_loop, name="game-registry-gc", daemon=True
        )
        self._gc_thread.start()

    def stop_gc(self) -> None:
        self._gc_stop.set()
        if self._gc_thread is not None:
            self._gc_thread.join(timeout=2.0)
            self._gc_thread = None

    def reap_stale(self, now: float | None = None) -> int:
        """Drop entries whose `last_heartbeat` is older than `ttl`.
        Returns the number of entries reaped. Public so tests can fire
        a GC pass without sleeping."""
        if now is None:
            now = self._clock()
        cutoff = now - self._ttl
        reaped = 0
        with self._lock:
            stale = [code for code, e in self._games.items() if e["last_heartbeat"] < cutoff]
            for code in stale:
                self._games.pop(code, None)
                self._publish("games:removed", {"invite_code": code})
                reaped += 1
        return reaped

    def _gc_loop(self) -> None:
        while not self._gc_stop.wait(self._gc_tick):
            try:
                self.reap_stale()
            except Exception:
                # Background thread — swallow + keep looping.
                pass

    # ── Internals ──────────────────────────────────────────────────────

    def _publish(self, event: str, payload: dict[str, Any]) -> None:
        """Fan out an event to all SSE subscribers. Caller holds the lock.

        Each subscriber gets a serialized copy filtered for its own
        client_id (so `banned_from_this_game` is correct per-subscriber).
        """
        for q, filter_client_id in list(self._subscribers):
            try:
                if event in ("games:added", "games:updated"):
                    data = self._serialize(payload, filter_client_id)
                else:
                    data = dict(payload)
                q.put_nowait({"event": event, "data": data})
            except queue.Full:
                # Slow subscriber — drop the event for that subscriber
                # rather than blocking the publisher. The next poll/SSE
                # snapshot will resync them.
                continue

    def _normalize(self, entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "invite_code": self._require(entry, "invite_code"),
            "name": self._require(entry, "name"),
            "host_display_name": self._require(entry, "host_display_name"),
            "host_client_id": self._require(entry, "host_client_id"),
            "current_players": int(entry.get("current_players", 1)),
            "max_players": int(self._require(entry, "max_players")),
            "current_spectators": int(entry.get("current_spectators", 0)),
            "max_spectators": int(self._require(entry, "max_spectators")),
            "game_system": entry.get("game_system", "dnd5e"),
            "is_private": bool(entry.get("is_private", False)),
            "peer_id": self._require(entry, "peer_id"),
            "created_at": float(entry.get("created_at", self._clock())),
            "last_heartbeat": self._clock(),
            "banned_client_ids": set(entry.get("banned_client_ids") or ()),
        }

    @staticmethod
    def _require(entry: dict[str, Any], key: str) -> Any:
        if key not in entry or entry[key] in (None, ""):
            raise ValueError(f"game_registry: missing required field '{key}'")
        return entry[key]

    @staticmethod
    def _serialize(entry: dict[str, Any], client_id: str | None) -> dict[str, Any]:
        banned: Iterable[str] = entry.get("banned_client_ids") or ()
        return {
            "invite_code": entry["invite_code"],
            "name": entry["name"],
            "host_display_name": entry["host_display_name"],
            "host_client_id": entry["host_client_id"],
            "current_players": entry["current_players"],
            "max_players": entry["max_players"],
            "current_spectators": entry["current_spectators"],
            "max_spectators": entry["max_spectators"],
            "game_system": entry["game_system"],
            "is_private": entry["is_private"],
            "peer_id": entry["peer_id"],
            "created_at": entry["created_at"],
            "banned_from_this_game": bool(client_id) and client_id in banned,
        }


class Subscription:
    """Handle returned by `GameRegistry.subscribe`. Consumers iterate via
    `iter_events(timeout=...)` which yields one event dict at a time and
    periodically emits keep-alive comments."""

    def __init__(
        self,
        registry: GameRegistry,
        q: queue.Queue,
        entry: tuple[queue.Queue, str | None],
    ) -> None:
        self._registry = registry
        self._queue = q
        self._entry = entry
        self._closed = False

    def iter_events(self, heartbeat_seconds: float = SSE_HEARTBEAT_SECONDS):
        """Generator yielding events as dicts. Emits `{'event': 'heartbeat'}`
        whenever no real event arrived within `heartbeat_seconds` so the
        SSE response stays warm through NATs / proxies."""
        while not self._closed:
            try:
                event = self._queue.get(timeout=heartbeat_seconds)
            except queue.Empty:
                yield {"event": "heartbeat", "data": None}
                continue
            yield event

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._registry._unsubscribe(self._entry)


# ── Module-level singleton ────────────────────────────────────────────
# Mirrors the other Pi services (one process-wide instance). Lazy-built
# so unit tests can construct their own `GameRegistry(autostart_gc=False)`
# without spinning the global thread.

_singleton: GameRegistry | None = None
_singleton_lock = threading.Lock()


def get_registry() -> GameRegistry:
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = GameRegistry()
    return _singleton


def reset_registry_for_tests() -> None:
    """Test-only — drop the module singleton so the next call rebuilds it."""
    global _singleton
    with _singleton_lock:
        if _singleton is not None:
            _singleton.stop_gc()
        _singleton = None
