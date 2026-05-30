"""Unit tests for services.game_relay (Phase 32a).

Covers join (host election + existing-peer return), leave (host flag + room GC),
route (broadcast / point-to-point / exclude target sets), and authorize (the
transport-level role gate: host-only state pushes + non-host dm:* must be
directed at the host). Pure logic — no SocketIO/Flask.
"""

from __future__ import annotations

import importlib
import sys

import pytest

# test_app_endpoints.py replaces `flask_socketio` with a MagicMock in sys.modules
# at collection time (so importing `app` needs no real gevent/socketio install),
# and `app.py` imports `routes.game_relay_ws` under that mock. For these
# end-to-end SocketIO tests we need the REAL package, so restore it + reload the
# glue so `SocketIO` and the glue's `emit`/`join_room` re-bind to real impls.
sys.modules.pop("flask_socketio", None)
importlib.import_module("flask_socketio")
import routes.game_relay_ws as _game_relay_ws  # noqa: E402

importlib.reload(_game_relay_ws)

from flask import Flask  # noqa: E402
from flask_socketio import SocketIO  # noqa: E402

from routes.game_relay_ws import GAME_NS, register_game_relay  # noqa: E402
from services.game_relay import (  # noqa: E402
    GameRelay,
    get_relay,
    reset_relay_for_tests,
)


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture
def relay() -> GameRelay:
    return GameRelay()


def _peer(peer_id: str, role: str = "player", **overrides: object) -> dict:
    base = {
        "peer_id": peer_id,
        "client_id": f"client-{peer_id}",
        "role": role,
        "display_name": peer_id.title(),
    }
    base.update(overrides)
    return base


def _join_host(relay: GameRelay, code: str = "ABC123", sid: str = "sid-host") -> dict:
    return relay.join(code, sid, _peer("host-peer", role="host"))


# ── join ───────────────────────────────────────────────────────────────


def test_join_creates_room_and_elects_host(relay: GameRelay) -> None:
    result = _join_host(relay)
    assert result["is_host"] is True
    assert result["host_peer_id"] == "host-peer"
    assert result["existing_peers"] == []
    assert relay.room_count() == 1
    assert relay.host_sid_for("ABC123") == "sid-host"


def test_join_second_peer_is_not_host_and_sees_existing(relay: GameRelay) -> None:
    _join_host(relay)
    result = relay.join("ABC123", "sid-p1", _peer("p1-peer"))
    assert result["is_host"] is False
    assert result["host_peer_id"] == "host-peer"
    existing_ids = {p["peer_id"] for p in result["existing_peers"]}
    assert existing_ids == {"host-peer"}
    assert result["joiner"]["peer_id"] == "p1-peer"
    assert len(relay) == 2


def test_peer_id_for_sid(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1-peer"))
    assert relay.peer_id_for("sid-host") == "host-peer"
    assert relay.peer_id_for("sid-p1") == "p1-peer"
    assert relay.peer_id_for("ghost") is None


def test_join_player_before_host_does_not_claim_host(relay: GameRelay) -> None:
    # A player-role peer joining first must NOT become the room host.
    result = relay.join("ROOM", "sid-p1", _peer("p1", role="player"))
    assert result["is_host"] is False
    assert relay.host_sid_for("ROOM") is None
    # The host arriving later claims the slot.
    host = relay.join("ROOM", "sid-host", _peer("host", role="host"))
    assert host["is_host"] is True
    assert relay.host_sid_for("ROOM") == "sid-host"


def test_rejoin_same_sid_replaces_peer_ref(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-host", _peer("host-peer", role="host", display_name="Renamed"))
    peers = relay.peers_for("ABC123")
    assert len(peers) == 1
    assert peers[0]["display_name"] == "Renamed"
    assert relay.host_sid_for("ABC123") == "sid-host"


# ── leave ──────────────────────────────────────────────────────────────


def test_leave_unknown_sid_returns_none(relay: GameRelay) -> None:
    assert relay.leave("nobody") is None


def test_leave_player_keeps_room(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    result = relay.leave("sid-p1")
    assert result is not None
    assert result["code"] == "ABC123"
    assert result["peer_id"] == "p1"
    assert result["was_host"] is False
    assert result["room_empty"] is False
    assert "sid-host" in result["remaining_sids"]
    assert relay.room_count() == 1


def test_leave_host_clears_host_sid(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    result = relay.leave("sid-host")
    assert result["was_host"] is True
    assert relay.host_sid_for("ABC123") is None


def test_leave_last_peer_drops_room(relay: GameRelay) -> None:
    _join_host(relay)
    result = relay.leave("sid-host")
    assert result["room_empty"] is True
    assert relay.room_count() == 0
    assert relay.room_of("sid-host") is None


# ── route ──────────────────────────────────────────────────────────────


def test_route_broadcast_excludes_sender(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    relay.join("ABC123", "sid-p2", _peer("p2"))
    targets = relay.route("sid-host")
    assert set(targets) == {"sid-p1", "sid-p2"}


def test_route_point_to_point(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    relay.join("ABC123", "sid-p2", _peer("p2"))
    targets = relay.route("sid-host", target_peer_id="p2")
    assert targets == ["sid-p2"]


def test_route_point_to_point_unknown_target_is_empty(relay: GameRelay) -> None:
    _join_host(relay)
    assert relay.route("sid-host", target_peer_id="ghost") == []


def test_route_exclude(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    relay.join("ABC123", "sid-p2", _peer("p2"))
    targets = relay.route("sid-host", exclude_peer_id="p1")
    assert set(targets) == {"sid-p2"}


def test_route_unknown_sender_is_empty(relay: GameRelay) -> None:
    assert relay.route("nobody") == []


# ── authorize ──────────────────────────────────────────────────────────


def test_authorize_unknown_sid_denied(relay: GameRelay) -> None:
    assert relay.authorize("nobody", {"type": "chat:message"}) is False


def test_authorize_player_intent_allowed(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    assert relay.authorize("sid-p1", {"type": "chat:message"}) is True
    assert relay.authorize("sid-p1", {"type": "sync:resync-request"}) is True


def test_authorize_host_only_state_push(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    # Host may push authoritative state…
    assert relay.authorize("sid-host", {"type": "sync:delta"}) is True
    assert relay.authorize("sid-host", {"type": "game:state-update"}) is True
    # …a player may NOT (spoof guard).
    assert relay.authorize("sid-p1", {"type": "sync:delta"}) is False
    assert relay.authorize("sid-p1", {"type": "game:state-update"}) is False


def test_authorize_dm_intent_host_broadcast_ok(relay: GameRelay) -> None:
    _join_host(relay)
    assert relay.authorize("sid-host", {"type": "dm:fog-reveal"}) is True


def test_authorize_nonhost_dm_must_target_host(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    # A non-host DM-client directing a dm:* intent AT the host is allowed…
    assert (
        relay.authorize("sid-p1", {"type": "dm:fog-reveal"}, target_peer_id="host-peer")
        is True
    )
    # …but broadcasting dm:* at other players is rejected.
    assert relay.authorize("sid-p1", {"type": "dm:fog-reveal"}) is False
    assert (
        relay.authorize("sid-p1", {"type": "dm:fog-reveal"}, target_peer_id="p1")
        is False
    )


# ── singleton ──────────────────────────────────────────────────────────


def test_singleton_is_stable_and_resettable() -> None:
    reset_relay_for_tests()
    a = get_relay()
    b = get_relay()
    assert a is b
    reset_relay_for_tests()
    c = get_relay()
    assert c is not a


# ── SocketIO glue (32b) ────────────────────────────────────────────────
# End-to-end over a real flask-socketio test client (threading async_mode, the
# same mode conftest uses). The routing/auth logic is already proven in the pure
# tests above; these assert the glue translates events ↔ relay calls correctly.


@pytest.fixture
def ws_app():
    """Fresh Flask + SocketIO with the /game relay registered, and a clean
    relay singleton (the glue uses the module singleton, so reset per test)."""
    reset_relay_for_tests()
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret"
    sio = SocketIO(app, async_mode="threading")
    register_game_relay(sio)
    yield app, sio
    reset_relay_for_tests()


def _names(received: list) -> list[str]:
    return [m["name"] for m in received]


def _first(received: list, name: str) -> dict:
    # flask-socketio's test client records `args` as a bare value for cross-sid
    # `to=` emits but a one-element list for contextual (to-self) emits — accept both.
    args = next(m for m in received if m["name"] == name)["args"]
    return args[0] if isinstance(args, list) else args


def _join(client, code: str, peer_id: str, role: str = "player") -> None:
    client.emit(
        "join",
        {
            "code": code,
            "peer_id": peer_id,
            "client_id": f"c-{peer_id}",
            "role": role,
            "display_name": peer_id.title(),
        },
        namespace=GAME_NS,
    )


def test_ws_join_returns_peers(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    assert host.is_connected(GAME_NS)
    _join(host, "ROOM", "host", role="host")
    peers = _first(host.get_received(GAME_NS), "peers")
    assert peers["peers"] == []
    assert peers["host_peer_id"] == "host"


def test_ws_second_join_announces_and_lists(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)  # drain
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")
    # Host hears about the joiner.
    host_rcv = host.get_received(GAME_NS)
    assert "peer-joined" in _names(host_rcv)
    assert _first(host_rcv, "peer-joined")["peer_id"] == "p1"
    # Player sees the host already present.
    peers = _first(player.get_received(GAME_NS), "peers")
    assert {p["peer_id"] for p in peers["peers"]} == {"host"}


def test_ws_player_state_push_rejected(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")
    player.get_received(GAME_NS)
    player.emit("relay", {"message": {"type": "sync:delta", "payload": {}}}, namespace=GAME_NS)
    assert "relay-rejected" in _names(player.get_received(GAME_NS))


def test_ws_host_relay_reaches_player_with_from_peer(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")
    player.get_received(GAME_NS)
    host.emit(
        "relay",
        {"message": {"type": "sync:delta", "payload": {"x": 1}}},
        namespace=GAME_NS,
    )
    msg = _first(player.get_received(GAME_NS), "message")
    assert msg["from_peer_id"] == "host"
    assert msg["message"]["type"] == "sync:delta"


def test_ws_point_to_point_relay(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    p1 = sio.test_client(app, namespace=GAME_NS)
    _join(p1, "ROOM", "p1")
    p1.get_received(GAME_NS)
    p2 = sio.test_client(app, namespace=GAME_NS)
    _join(p2, "ROOM", "p2")
    p2.get_received(GAME_NS)
    host.get_received(GAME_NS)  # drain the two peer-joined
    host.emit(
        "relay",
        {"message": {"type": "chat:message", "payload": {}}, "target_peer_id": "p1"},
        namespace=GAME_NS,
    )
    assert "message" in _names(p1.get_received(GAME_NS))
    assert "message" not in _names(p2.get_received(GAME_NS))


def test_ws_disconnect_emits_peer_left(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")
    host.get_received(GAME_NS)
    player.disconnect(namespace=GAME_NS)
    left = _first(host.get_received(GAME_NS), "peer-left")
    assert left["peer_id"] == "p1"
    assert left["was_host"] is False


def test_ws_connect_requires_api_key_when_set() -> None:
    reset_relay_for_tests()
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "test-secret"
    sio = SocketIO(app, async_mode="threading")
    register_game_relay(sio, api_key="secret")
    bad = sio.test_client(app, namespace=GAME_NS)
    assert not bad.is_connected(GAME_NS)
    good = sio.test_client(app, namespace=GAME_NS, auth={"api_key": "secret"})
    assert good.is_connected(GAME_NS)
    reset_relay_for_tests()
