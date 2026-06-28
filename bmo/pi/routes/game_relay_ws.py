"""routes/game_relay_ws.py — Socket.IO /game-namespace glue for the cloud relay.

Phase 32b. A thin transport layer over `services.game_relay.GameRelay`:
connect / join / relay / kick / disconnect handlers that translate Socket.IO
events into GameRelay routing decisions and `emit()` the results to the right
sockets. NO game logic lives here — all routing/authorization is in
`game_relay.py` (pure + unit-tested); this module only wires it to flask-socketio.

How it wires up (mirrors `routes/ide.register_ide`):
- `app.py` calls `register_game_relay(socketio, api_key=BMO_API_KEY)` once after
  the SocketIO object exists.
- That attaches the four `@socketio.on(..., namespace='/game')` handlers, which
  close over the live `socketio` + the process-wide `GameRelay` singleton.

Wire protocol (all on the `/game` namespace):
- client → `join`  {code, peer_id, client_id, role, display_name}
    server → `peers` {peers, host_peer_id}   (to the joiner)
    server → `peer-joined` {peer_id, ...}     (to everyone else in the room)
- client → `relay` {message, target_peer_id?, exclude_peer_id?}
    server → `message` {from_peer_id, message}  (to each resolved recipient)
    server → `relay-rejected` {type}            (back to sender, if unauthorized)
- client → `kick`  {peer_id}                  (host only)
    server → `kicked` {}                         (to the target; then disconnected)
- client → `promote-codm` {peer_id, is_co_dm}  (host only)
    server → `codm-changed` {peer_id, is_co_dm}  (to the room)
- transport `disconnect`
    server → `host-migrated` {old_host_peer_id, new_host_peer_id}  (host dropped,
        a co-DM was re-elected server-side — the elected client becomes authority)
    server → `peer-left` {peer_id, was_host}     (any other departure, or a host
        drop with no co-DM to inherit → legacy teardown)
"""

from __future__ import annotations

from typing import Any

from flask import request
from flask_socketio import emit, join_room

from services.bmo_logging import get_logger
from services.game_relay import get_relay

log = get_logger("game_relay_ws")

GAME_NS = "/game"


def register_game_relay(socketio_obj, *, api_key: str = "") -> None:
    """Attach the `/game`-namespace SocketIO handlers to `socketio_obj`.

    `api_key` mirrors `app.BMO_API_KEY`: when non-empty a connecting client must
    present it in the connect auth dict (`{'api_key': ...}`); when empty the
    relay is open (BMO's fail-open posture — the Pi is LAN-trusted by default).
    """
    relay = get_relay()

    @socketio_obj.on("connect", namespace=GAME_NS)
    def on_game_connect(auth: Any = None):  # noqa: ANN401 — SocketIO contract
        if api_key:
            presented = auth.get("api_key") if isinstance(auth, dict) else None
            if presented != api_key:
                log.warning("[game-relay] rejected connect: bad/missing api_key")
                return False  # reject the connection
        return None  # accept

    @socketio_obj.on("join", namespace=GAME_NS)
    def on_game_join(data: Any = None):
        data = data or {}
        code = str(data.get("code") or "").strip()
        if not code:
            emit("join-rejected", {"reason": "missing code"})
            return
        sid = request.sid
        peer_ref = {
            "peer_id": data.get("peer_id"),
            "client_id": data.get("client_id"),
            "role": data.get("role"),
            "display_name": data.get("display_name"),
            "is_co_dm": data.get("is_co_dm"),
        }
        result = relay.join(code, sid, peer_ref)
        join_room(code, namespace=GAME_NS)
        # The joiner learns who is already present (+ the room host).
        emit(
            "peers",
            {"peers": result["existing_peers"], "host_peer_id": result["host_peer_id"]},
        )
        # If this join reconciled a reconnect to an existing client-id under a
        # NEW peer_id, announce the superseded peer_id as left FIRST so the rest
        # of the room drops the stale roster entry before learning the new one
        # (belt-and-suspenders alongside the client-side client-id dedupe).
        superseded = result.get("superseded_peer_id")
        if superseded:
            emit(
                "peer-left",
                {"peer_id": superseded, "was_host": False},
                room=code,
                skip_sid=sid,
                namespace=GAME_NS,
            )
        # Everyone else learns about the joiner.
        emit(
            "peer-joined",
            result["joiner"],
            room=code,
            skip_sid=sid,
            namespace=GAME_NS,
        )

    @socketio_obj.on("relay", namespace=GAME_NS)
    def on_game_relay(data: Any = None):
        data = data or {}
        message = data.get("message")
        if not isinstance(message, dict):
            return
        target = data.get("target_peer_id")
        exclude = data.get("exclude_peer_id")
        sid = request.sid
        if not relay.authorize(sid, message, target_peer_id=target):
            log.warning("[game-relay] rejected relay type=%s", message.get("type"))
            emit("relay-rejected", {"type": message.get("type")})
            return
        from_peer_id = relay.peer_id_for(sid)
        # Keep the relay's co-DM view in sync with the host's app-level promotions
        # so host re-election can find a promotable co-DM without any extra client
        # wiring. `dm:promote-codm` / `dm:demote-codm` are host-authored (authorize
        # gates them above) and carry `{peerId, isCoDM}`.
        mtype = message.get("type")
        if mtype in ("dm:promote-codm", "dm:demote-codm"):
            payload = message.get("payload") or {}
            target_pid = payload.get("peerId")
            if target_pid:
                relay.promote_codm(
                    sid, str(target_pid), bool(payload.get("isCoDM", mtype == "dm:promote-codm"))
                )
        for to_sid in relay.route(sid, target_peer_id=target, exclude_peer_id=exclude):
            emit(
                "message",
                {"from_peer_id": from_peer_id, "message": message},
                to=to_sid,
                namespace=GAME_NS,
            )

    @socketio_obj.on("kick", namespace=GAME_NS)
    def on_game_kick(data: Any = None):
        sid = request.sid
        code = relay.room_of(sid)
        # Only the room host may kick.
        if not code or relay.host_sid_for(code) != sid:
            return
        peer_id = (data or {}).get("peer_id")
        if not peer_id:
            return
        for to_sid in relay.route(sid, target_peer_id=peer_id):
            emit("kicked", {}, to=to_sid, namespace=GAME_NS)
            try:
                socketio_obj.server.disconnect(to_sid, namespace=GAME_NS)
            except Exception:  # pragma: no cover — defensive
                pass

    @socketio_obj.on("promote-codm", namespace=GAME_NS)
    def on_game_promote_codm(data: Any = None):
        # Host-only: grant/revoke a peer's co-DM status (decides who is promotable
        # when the host drops). Mirrors the `kick` host gate via `promote_codm`.
        sid = request.sid
        data = data or {}
        peer_id = data.get("peer_id")
        if not peer_id:
            return
        is_co_dm = bool(data.get("is_co_dm", True))
        if relay.promote_codm(sid, peer_id, is_co_dm):
            emit(
                "codm-changed",
                {"peer_id": peer_id, "is_co_dm": is_co_dm},
                room=relay.room_of(sid),
                namespace=GAME_NS,
            )

    @socketio_obj.on("disconnect", namespace=GAME_NS)
    def on_game_disconnect():
        sid = request.sid
        result = relay.leave(sid)
        if not result or result["room_empty"]:
            return
        code = result["code"]
        # Host dropped + a co-DM is available → re-elect server-side under the
        # relay lock and tell the room. The elected client becomes the authority
        # the instant the relay moved `host_sid` (closes the re-claim race). With
        # no co-DM to inherit, fall back to the legacy peer-left teardown.
        if result["was_host"]:
            decision = relay.reelect_host(code)
            if decision is not None:
                emit(
                    "host-migrated",
                    {
                        "old_host_peer_id": result["peer_id"],
                        "new_host_peer_id": decision["new_host_peer_id"],
                    },
                    room=code,
                    namespace=GAME_NS,
                )
                return
        emit(
            "peer-left",
            {"peer_id": result["peer_id"], "was_host": result["was_host"]},
            room=code,
            namespace=GAME_NS,
        )
