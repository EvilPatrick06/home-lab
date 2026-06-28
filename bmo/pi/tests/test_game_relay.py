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


# ── host re-election (co-DM aware) ──────────────────────────────────────


def test_normalize_peer_carries_co_dm_and_joined_seq(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-codm", _peer("codm", is_co_dm=True))
    codm = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "codm")
    assert codm["is_co_dm"] is True
    assert isinstance(codm["joined_seq"], int)
    host = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "host-peer")
    # Host joined first → strictly lower seq than the later co-DM.
    assert host["joined_seq"] < codm["joined_seq"]
    assert host["is_co_dm"] is False


def test_joined_seq_stable_across_rejoin(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1", is_co_dm=True))
    before = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "p1")["joined_seq"]
    # Same-sid re-join keeps the original seniority (a reconnecting co-DM stays oldest).
    relay.join("ABC123", "sid-p1", _peer("p1", is_co_dm=True, display_name="Renamed"))
    after = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "p1")["joined_seq"]
    assert after == before


def test_reelect_host_picks_oldest_co_dm(relay: GameRelay) -> None:
    _join_host(relay)  # seq 1
    relay.join("ABC123", "sid-codm-old", _peer("codm-old", is_co_dm=True))  # seq 2
    relay.join("ABC123", "sid-plain", _peer("plain"))  # seq 3
    relay.join("ABC123", "sid-codm-young", _peer("codm-young", is_co_dm=True))  # seq 4
    leave = relay.leave("sid-host")
    assert leave["was_host"] is True
    decision = relay.reelect_host("ABC123")
    assert decision == {"new_host_sid": "sid-codm-old", "new_host_peer_id": "codm-old"}
    assert relay.host_sid_for("ABC123") == "sid-codm-old"


def test_reelect_host_promotes_ref_to_host_role(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-codm", _peer("codm", is_co_dm=True))
    relay.leave("sid-host")
    relay.reelect_host("ABC123")
    codm = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "codm")
    assert codm["role"] == "host"


def test_reelect_host_returns_none_without_co_dm(relay: GameRelay) -> None:
    # A room of only plain players must NOT promote anyone (they hold no
    # authoritative snapshot) — caller falls back to teardown.
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    relay.join("ABC123", "sid-p2", _peer("p2"))
    relay.leave("sid-host")
    assert relay.reelect_host("ABC123") is None
    assert relay.host_sid_for("ABC123") is None


def test_reelect_host_noop_when_host_still_seated(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-codm", _peer("codm", is_co_dm=True))
    assert relay.reelect_host("ABC123") is None
    assert relay.host_sid_for("ABC123") == "sid-host"


def test_reelect_host_unknown_room_is_none(relay: GameRelay) -> None:
    assert relay.reelect_host("NOPE") is None


def test_promote_codm_host_only(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    assert relay.promote_codm("sid-host", "p1", True) is True
    p1 = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "p1")
    assert p1["is_co_dm"] is True
    # A non-host cannot mutate co-DM status.
    assert relay.promote_codm("sid-p1", "host-peer", True) is False
    # Revoke also works for the host.
    assert relay.promote_codm("sid-host", "p1", False) is True
    p1 = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "p1")
    assert p1["is_co_dm"] is False


def test_promote_codm_unknown_target_is_false(relay: GameRelay) -> None:
    _join_host(relay)
    assert relay.promote_codm("sid-host", "ghost", True) is False


def test_promote_then_reelect_inherits(relay: GameRelay) -> None:
    # A plain player promoted to co-DM at runtime becomes promotable on host drop.
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1"))
    relay.promote_codm("sid-host", "p1", True)
    relay.leave("sid-host")
    decision = relay.reelect_host("ABC123")
    assert decision is not None
    assert decision["new_host_peer_id"] == "p1"


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


def _join(client, code: str, peer_id: str, role: str = "player", is_co_dm: bool = False) -> None:
    client.emit(
        "join",
        {
            "code": code,
            "peer_id": peer_id,
            "client_id": f"c-{peer_id}",
            "role": role,
            "display_name": peer_id.title(),
            "is_co_dm": is_co_dm,
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


def test_ws_host_disconnect_migrates_to_codm(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    codm = sio.test_client(app, namespace=GAME_NS)
    _join(codm, "ROOM", "codm", is_co_dm=True)
    codm.get_received(GAME_NS)
    host.get_received(GAME_NS)  # drain peer-joined
    host.disconnect(namespace=GAME_NS)
    rcv = codm.get_received(GAME_NS)
    assert "host-migrated" in _names(rcv)
    migrated = _first(rcv, "host-migrated")
    assert migrated["new_host_peer_id"] == "codm"
    assert migrated["old_host_peer_id"] == "host"


def test_ws_host_disconnect_without_codm_emits_peer_left(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")
    player.get_received(GAME_NS)
    host.disconnect(namespace=GAME_NS)
    rcv = player.get_received(GAME_NS)
    assert "host-migrated" not in _names(rcv)
    left = _first(rcv, "peer-left")
    assert left["peer_id"] == "host"
    assert left["was_host"] is True


def test_ws_promote_codm_then_host_disconnect_migrates(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")  # joins as a plain player
    player.get_received(GAME_NS)
    host.get_received(GAME_NS)
    # Host elevates the player to co-DM at runtime.
    host.emit("promote-codm", {"peer_id": "p1", "is_co_dm": True}, namespace=GAME_NS)
    changed = _first(player.get_received(GAME_NS), "codm-changed")
    assert changed["peer_id"] == "p1"
    assert changed["is_co_dm"] is True
    # Host drops → the freshly-minted co-DM inherits authority.
    host.disconnect(namespace=GAME_NS)
    migrated = _first(player.get_received(GAME_NS), "host-migrated")
    assert migrated["new_host_peer_id"] == "p1"


def test_ws_dm_promote_codm_message_syncs_relay_then_migrates(ws_app) -> None:
    # The live app promotes co-DMs via a `dm:promote-codm` NetworkMessage relayed
    # by the host (not the explicit `promote-codm` event). The relay sniffs that
    # message so re-election still finds the promoted co-DM.
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)
    player = sio.test_client(app, namespace=GAME_NS)
    _join(player, "ROOM", "p1")
    player.get_received(GAME_NS)
    host.get_received(GAME_NS)
    host.emit(
        "relay",
        {"message": {"type": "dm:promote-codm", "payload": {"peerId": "p1", "isCoDM": True}}},
        namespace=GAME_NS,
    )
    player.get_received(GAME_NS)  # drain the relayed message
    host.disconnect(namespace=GAME_NS)
    migrated = _first(player.get_received(GAME_NS), "host-migrated")
    assert migrated["new_host_peer_id"] == "p1"


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


# ── Client-id reconciliation (Phase 54A / MP-EN-1) ─────────────────────


def test_reconnect_same_client_new_sid_replaces_not_duplicates(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("cloud-old", client_id="stable-1"))
    assert len(relay.peers_for("ABC123")) == 2
    # Reconnect: new sid + new ephemeral peer_id, SAME stable client_id.
    result = relay.join("ABC123", "sid-p1b", _peer("cloud-new", client_id="stable-1"))
    peers = relay.peers_for("ABC123")
    assert len(peers) == 2  # replaced in place, not accumulated
    pids = {p["peer_id"] for p in peers}
    assert "cloud-new" in pids and "cloud-old" not in pids
    assert result["superseded_peer_id"] == "cloud-old"


def test_reconnect_preserves_joined_seq(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("cloud-old", client_id="stable-1"))
    before = next(
        p for p in relay.peers_for("ABC123") if p["peer_id"] == "cloud-old"
    )["joined_seq"]
    relay.join("ABC123", "sid-p1b", _peer("cloud-new", client_id="stable-1"))
    after = next(
        p for p in relay.peers_for("ABC123") if p["peer_id"] == "cloud-new"
    )["joined_seq"]
    assert after == before


def test_reconnect_preserves_co_dm_flag(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("cloud-old", client_id="stable-1", is_co_dm=True))
    # Reconnect arrives without the co-DM flag (renderer re-mints not-co-DM).
    relay.join("ABC123", "sid-p1b", _peer("cloud-new", client_id="stable-1", is_co_dm=False))
    new = next(p for p in relay.peers_for("ABC123") if p["peer_id"] == "cloud-new")
    assert new["is_co_dm"] is True  # carried forward from the superseded entry


def test_host_reconnect_preserves_host_slot(relay: GameRelay) -> None:
    h = relay.join("ABC123", "sid-host", _peer("host-old", role="host", client_id="host-stable"))
    assert h["is_host"] is True
    # Host reconnects on a new sid + new peer_id; role may re-mint as default.
    r = relay.join("ABC123", "sid-host-b", _peer("host-new", role="player", client_id="host-stable"))
    assert r["is_host"] is True
    assert relay.host_sid_for("ABC123") == "sid-host-b"
    assert len(relay.peers_for("ABC123")) == 1
    new = relay.peers_for("ABC123")[0]
    assert new["role"] == "host" and new["peer_id"] == "host-new"


def test_new_client_id_still_increments(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("p1", client_id="stable-1"))
    # A genuinely different client_id is a new member, not a reconnect.
    result = relay.join("ABC123", "sid-p2", _peer("p2", client_id="stable-2"))
    assert result["superseded_peer_id"] is None
    assert len(relay.peers_for("ABC123")) == 3


def test_reconnect_stale_sid_unmapped_disconnect_noops(relay: GameRelay) -> None:
    _join_host(relay)
    relay.join("ABC123", "sid-p1", _peer("cloud-old", client_id="stable-1"))
    relay.join("ABC123", "sid-p1b", _peer("cloud-new", client_id="stable-1"))
    # The dead old socket's later disconnect must not emit a spurious leave.
    assert relay.leave("sid-p1") is None
    assert len(relay.peers_for("ABC123")) == 2


def _join_cid(client, code: str, peer_id: str, client_id: str, role: str = "player") -> None:
    client.emit(
        "join",
        {
            "code": code,
            "peer_id": peer_id,
            "client_id": client_id,
            "role": role,
            "display_name": peer_id.title(),
            "is_co_dm": False,
        },
        namespace=GAME_NS,
    )


def test_ws_reconnect_emits_superseding_peer_left_then_joined(ws_app) -> None:
    app, sio = ws_app
    host = sio.test_client(app, namespace=GAME_NS)
    _join(host, "ROOM", "host", role="host")
    host.get_received(GAME_NS)  # drain
    player = sio.test_client(app, namespace=GAME_NS)
    _join_cid(player, "ROOM", "cloud-old", "stable-1")
    host.get_received(GAME_NS)  # drain peer-joined(cloud-old)
    # Reconnect under a NEW peer_id, SAME client_id.
    player2 = sio.test_client(app, namespace=GAME_NS)
    _join_cid(player2, "ROOM", "cloud-new", "stable-1")
    host_rcv = host.get_received(GAME_NS)
    names = _names(host_rcv)
    assert "peer-left" in names and "peer-joined" in names
    assert _first(host_rcv, "peer-left")["peer_id"] == "cloud-old"
    assert _first(host_rcv, "peer-joined")["peer_id"] == "cloud-new"
