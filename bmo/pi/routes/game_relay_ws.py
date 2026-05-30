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
- transport `disconnect`
    server → `peer-left` {peer_id, was_host}    (to the room)
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
        }
        result = relay.join(code, sid, peer_ref)
        join_room(code, namespace=GAME_NS)
        # The joiner learns who is already present (+ the room host).
        emit(
            "peers",
            {"peers": result["existing_peers"], "host_peer_id": result["host_peer_id"]},
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

    @socketio_obj.on("disconnect", namespace=GAME_NS)
    def on_game_disconnect():
        sid = request.sid
        result = relay.leave(sid)
        if result and not result["room_empty"]:
            emit(
                "peer-left",
                {"peer_id": result["peer_id"], "was_host": result["was_host"]},
                room=result["code"],
                namespace=GAME_NS,
            )
