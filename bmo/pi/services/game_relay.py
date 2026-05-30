"""BMO Game Relay — Socket.IO star-topology relay for dnd-app multiplayer.

Phase 32. An opt-in alternative to the WebRTC mesh: instead of every player
connecting peer-to-peer, the always-on Pi runs this relay. The DM/host client
and every player client each open ONE Socket.IO connection to the Pi (the
`/game` namespace) and join a room keyed by the invite code. The Pi relays
`NetworkMessage`s between them — `broadcast` → everyone-but-sender in the room,
`send(peer_id)` → one peer, `broadcast_excluding(peer_id)` → everyone-but-two —
and tracks peer join/leave.

The Pi is a **relay, not the game-rules authority**: the DM client still runs
the TS `GameAuthority` + shard broadcaster (the game store lives in the renderer
and has no Python equivalent). What the relay DOES enforce is the transport-level
boundary the P2P host enforced — only the host socket may push authoritative
state (`sync:delta` / `game:state-update`), and `dm:*` intents from a non-host
must be directed point-to-point at the host (not broadcast at other players).

This module is pure routing logic with NO Flask/SocketIO import, so it is fully
unit-testable in isolation (mirrors `game_registry.py`'s style). The thin
SocketIO glue that calls `emit()` lives in `app.py`.
"""

from __future__ import annotations

import threading
from typing import Any

# Message types only the host socket is allowed to push to other peers. A
# non-host emitting one of these is a spoof attempt (injecting fake authoritative
# state) and is rejected by `authorize`.
HOST_ONLY_TYPES: frozenset[str] = frozenset({"sync:delta", "game:state-update"})


class Room:
    """One game session, keyed externally by invite code.

    `peers` maps a Socket.IO session id (`sid`) → a peer-ref dict
    (`{peer_id, client_id, role, display_name}`). `host_sid` is the sid of the
    peer running the game authority (the first `host`-role peer to join).
    """

    __slots__ = ("peers", "host_sid")

    def __init__(self) -> None:
        self.peers: dict[str, dict[str, Any]] = {}
        self.host_sid: str | None = None


class GameRelay:
    """Thread-safe in-memory router for Socket.IO game rooms.

    All methods are pure with respect to the network: they mutate the room/sid
    tables and return routing *decisions* (recipient sid lists, join results),
    but never emit. The SocketIO glue layer does the emitting. Safe to call from
    any greenlet/thread.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._rooms: dict[str, Room] = {}
        # Reverse index: sid → invite_code, so `leave`/`route` can resolve a
        # socket to its room in O(1) without scanning every room.
        self._sid_room: dict[str, str] = {}

    # ── Membership ─────────────────────────────────────────────────────

    def join(self, code: str, sid: str, peer_ref: dict[str, Any]) -> dict[str, Any]:
        """Add `sid` to room `code`. Creates the room if absent; the first
        `host`-role peer becomes the room's `host_sid`. A re-join with the same
        sid replaces its peer-ref (and is treated as the host iff host-role and
        no host is set).

        Returns `{existing_peers, host_peer_id, is_host}` — `existing_peers` is
        the peer-ref list ALREADY in the room (excluding the joiner), so the glue
        can ship it to the new client; `is_host` says whether this join claimed
        the host slot.
        """
        ref = self._normalize_peer(peer_ref)
        with self._lock:
            room = self._rooms.get(code)
            if room is None:
                room = Room()
                self._rooms[code] = room
            existing = [dict(p) for s, p in room.peers.items() if s != sid]
            room.peers[sid] = ref
            self._sid_room[sid] = code
            is_host = False
            if room.host_sid is None and ref.get("role") == "host":
                room.host_sid = sid
                is_host = True
            elif room.host_sid == sid:
                is_host = True
            host_peer_id = self._host_peer_id(room)
            return {
                "existing_peers": existing,
                "host_peer_id": host_peer_id,
                "is_host": is_host,
                # The joiner's normalized ref, so the glue can announce it to
                # the rest of the room without re-deriving the shape.
                "joiner": dict(ref),
            }

    def leave(self, sid: str) -> dict[str, Any] | None:
        """Remove `sid` from its room. Returns
        `{code, peer_id, was_host, room_empty, remaining_sids}` or None if the
        sid was not in any room. Drops the room when it becomes empty."""
        with self._lock:
            code = self._sid_room.pop(sid, None)
            if code is None:
                return None
            room = self._rooms.get(code)
            if room is None:
                return None
            ref = room.peers.pop(sid, None)
            was_host = room.host_sid == sid
            if was_host:
                room.host_sid = None
            room_empty = len(room.peers) == 0
            if room_empty:
                self._rooms.pop(code, None)
            return {
                "code": code,
                "peer_id": (ref or {}).get("peer_id"),
                "was_host": was_host,
                "room_empty": room_empty,
                "remaining_sids": list(room.peers.keys()),
            }

    # ── Routing ────────────────────────────────────────────────────────

    def route(
        self,
        from_sid: str,
        target_peer_id: str | None = None,
        exclude_peer_id: str | None = None,
    ) -> list[str]:
        """Resolve the recipient sids for a relayed message from `from_sid`:

        - `target_peer_id` set → the single sid for that peer (point-to-point).
        - `exclude_peer_id` set → every room sid except the sender + excluded.
        - neither → every room sid except the sender (broadcast).

        Returns an empty list for an unknown sid or an unresolvable target.
        """
        with self._lock:
            code = self._sid_room.get(from_sid)
            if code is None:
                return []
            room = self._rooms.get(code)
            if room is None:
                return []
            if target_peer_id is not None:
                # Point-to-point: deliver to the named peer (the caller chose it
                # explicitly), whoever that is.
                sid = self._sid_for_peer(room, target_peer_id)
                return [sid] if sid is not None else []
            exclude_sid = (
                self._sid_for_peer(room, exclude_peer_id) if exclude_peer_id else None
            )
            return [
                s for s in room.peers if s != from_sid and s != exclude_sid
            ]

    def authorize(
        self,
        from_sid: str,
        message: dict[str, Any],
        target_peer_id: str | None = None,
    ) -> bool:
        """Transport-level gate. Returns False if `from_sid` is not allowed to
        relay `message`:

        - unknown sid → deny.
        - `sync:delta` / `game:state-update` → host sid only (authoritative push).
        - `dm:*` → the host may push freely; a non-host may only DIRECT it at the
          host (point-to-point `target_peer_id == host.peer_id`), never broadcast
          it at other players.
        - anything else → allow.
        """
        with self._lock:
            code = self._sid_room.get(from_sid)
            if code is None:
                return False
            room = self._rooms.get(code)
            if room is None:
                return False
            mtype = str((message or {}).get("type", ""))
            is_host = room.host_sid == from_sid
            if mtype in HOST_ONLY_TYPES:
                return is_host
            if mtype.startswith("dm:"):
                if is_host:
                    return True
                host_peer = self._host_peer_id(room)
                return target_peer_id is not None and target_peer_id == host_peer
            return True

    # ── Reads ──────────────────────────────────────────────────────────

    def room_of(self, sid: str) -> str | None:
        with self._lock:
            return self._sid_room.get(sid)

    def peer_id_for(self, sid: str) -> str | None:
        """The peer_id of the connection `sid`, or None if unknown. The glue
        uses this to stamp the relayed envelope's `from_peer_id` (the shard
        broadcaster leaves `senderId` empty, so the recipient learns who sent
        a delta only from this out-of-band field)."""
        with self._lock:
            code = self._sid_room.get(sid)
            if code is None:
                return None
            room = self._rooms.get(code)
            if room is None:
                return None
            ref = room.peers.get(sid)
            return ref.get("peer_id") if ref else None

    def peers_for(self, code: str) -> list[dict[str, Any]]:
        with self._lock:
            room = self._rooms.get(code)
            return [dict(p) for p in room.peers.values()] if room else []

    def host_sid_for(self, code: str) -> str | None:
        with self._lock:
            room = self._rooms.get(code)
            return room.host_sid if room else None

    def room_count(self) -> int:
        with self._lock:
            return len(self._rooms)

    def __len__(self) -> int:
        """Total connected peers across all rooms."""
        with self._lock:
            return sum(len(r.peers) for r in self._rooms.values())

    # ── Internals ──────────────────────────────────────────────────────

    @staticmethod
    def _sid_for_peer(room: Room, peer_id: str) -> str | None:
        for sid, ref in room.peers.items():
            if ref.get("peer_id") == peer_id:
                return sid
        return None

    @staticmethod
    def _host_peer_id(room: Room) -> str | None:
        if room.host_sid is None:
            return None
        ref = room.peers.get(room.host_sid)
        return ref.get("peer_id") if ref else None

    @staticmethod
    def _normalize_peer(peer_ref: dict[str, Any]) -> dict[str, Any]:
        return {
            "peer_id": str(peer_ref.get("peer_id") or ""),
            "client_id": str(peer_ref.get("client_id") or ""),
            "role": str(peer_ref.get("role") or "player"),
            "display_name": str(peer_ref.get("display_name") or ""),
        }


# ── Module-level singleton ────────────────────────────────────────────
# Mirrors the other Pi services (one process-wide instance). Lazy-built so unit
# tests can construct their own `GameRelay()` without touching the global.

_singleton: GameRelay | None = None
_singleton_lock = threading.Lock()


def get_relay() -> GameRelay:
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = GameRelay()
    return _singleton


def reset_relay_for_tests() -> None:
    """Test-only — drop the module singleton so the next call rebuilds it."""
    global _singleton
    with _singleton_lock:
        _singleton = None
