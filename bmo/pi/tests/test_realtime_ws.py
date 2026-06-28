"""PHASE-16 16H — routes/realtime_ws.py SocketIO handlers, real round-trip.

Unlike test_app_endpoints' WS smoke tests (which register handlers on a MagicMock
SocketIO and only verify emits don't raise), this builds a REAL SocketIO over the
imported app, calls register_realtime() on it, and asserts a chat_message →
chat_response round-trip actually fires through the extracted handlers.
"""

import sys
from unittest.mock import MagicMock

import pytest

from services import chat_history
from tests.test_app_endpoints import bmo_app  # noqa: F401 (module-scope app import w/ mocks)


@pytest.fixture()
def realtime_client(bmo_app, monkeypatch, tmp_path):
    """A real SocketIO test client with realtime_ws handlers registered on it."""
    import app as bmo_module
    from routes import realtime_ws

    # Isolate persistence + neutralize hardware/timezone side effects.
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    monkeypatch.setattr(bmo_module, "_sync_expression", lambda *a, **k: None)
    monkeypatch.setattr(bmo_module, "timers", None)
    monkeypatch.setattr(bmo_module, "voice", None)

    mock_agent = MagicMock()
    mock_agent.model_override = None
    mock_agent.chat = MagicMock(return_value={
        "text": "BMO says hi!",
        "commands_executed": [],
        "tags": {},
        "agent_used": "conversation",
        "speaker": "test",
    })
    monkeypatch.setattr(bmo_module, "agent", mock_agent)

    # Real SocketIO so the test client actually routes events to our handlers.
    _saved = sys.modules.get("flask_socketio")
    sys.modules.pop("flask_socketio", None)
    try:
        from flask_socketio import SocketIO as RealSocketIO
        test_sio = RealSocketIO(bmo_module.app, async_mode="threading")
        realtime_ws.register_realtime(test_sio)
        client = test_sio.test_client(bmo_module.app)
        yield client, mock_agent
        if client.is_connected():
            client.disconnect()
    finally:
        if _saved is not None:
            sys.modules["flask_socketio"] = _saved


def test_chat_message_round_trip_emits_chat_response(realtime_client):
    client, mock_agent = realtime_client
    client.get_received()  # drain connect-time emits
    client.emit("chat_message", {"message": "Hello BMO", "speaker": "test"})
    received = client.get_received()
    responses = [e for e in received if e["name"] == "chat_response"]
    assert responses, f"no chat_response among {[e['name'] for e in received]}"
    assert responses[0]["args"][0]["text"] == "BMO says hi!"
    mock_agent.chat.assert_called_once()


def test_chat_message_persists_user_turn(realtime_client, tmp_path):
    client, _ = realtime_client
    client.emit("chat_message", {"message": "remember me", "speaker": "text"})
    client.get_received()
    saved = chat_history.load_recent_chat()
    assert any(m["role"] == "user" and m["text"] == "remember me" for m in saved)


def test_plan_approve_routes_yes_without_user_turn(realtime_client):
    client, mock_agent = realtime_client
    client.get_received()
    client.emit("plan_approve", {})
    client.get_received()
    # plan_approve feeds the agent "yes" but must NOT persist a user chat turn.
    mock_agent.chat.assert_called_once()
    args, kwargs = mock_agent.chat.call_args
    assert args[0] == "yes"
    assert kwargs.get("speaker") == "system"
    saved = chat_history.load_recent_chat()
    assert not any(m.get("role") == "user" for m in saved)


# --- PHASE-04 04A: WS auth gate accepts the Cloudflare Access identity ---


def _ws_authorized(auth):
    from routes import realtime_ws
    return realtime_ws._bmo_websocket_authorized(auth)


def test_ws_gate_unset_key_allows(bmo_app, monkeypatch):
    """No BMO_API_KEY set -> open gate (LAN/dev), regardless of credentials."""
    import app as bmo_module
    monkeypatch.setattr(bmo_module, "BMO_API_KEY", "")
    with bmo_module.app.test_request_context("/socket.io/"):
        assert _ws_authorized({}) is True


def test_ws_gate_grants_verified_cf_access(bmo_app, monkeypatch):
    """A Cloudflare-Access-authenticated browser (no Bearer/auth) is accepted,
    mirroring the REST front door (app.py:382)."""
    import app as bmo_module
    monkeypatch.setattr(bmo_module, "BMO_API_KEY", "supersecret")
    monkeypatch.setattr(bmo_module, "_bmo_client_is_trusted_localhost", lambda: False)
    monkeypatch.setattr(bmo_module, "_cf_access_authenticated", lambda: True)
    with bmo_module.app.test_request_context("/socket.io/"):
        assert _ws_authorized({}) is True


def test_ws_gate_rejects_unauthenticated_non_local(bmo_app, monkeypatch):
    """No localhost, no Bearer, no auth dict, CF Access invalid -> rejected."""
    import app as bmo_module
    monkeypatch.setattr(bmo_module, "BMO_API_KEY", "supersecret")
    monkeypatch.setattr(bmo_module, "_bmo_client_is_trusted_localhost", lambda: False)
    monkeypatch.setattr(bmo_module, "_cf_access_authenticated", lambda: False)
    with bmo_module.app.test_request_context("/socket.io/"):
        assert _ws_authorized({}) is False


def test_ws_gate_bearer_header_still_accepted(bmo_app, monkeypatch):
    """Regression: the HTTP Bearer path is unchanged."""
    import app as bmo_module
    monkeypatch.setattr(bmo_module, "BMO_API_KEY", "supersecret")
    monkeypatch.setattr(bmo_module, "_bmo_client_is_trusted_localhost", lambda: False)
    monkeypatch.setattr(bmo_module, "_cf_access_authenticated", lambda: False)
    with bmo_module.app.test_request_context(
        "/socket.io/", headers={"Authorization": "Bearer supersecret"}
    ):
        assert _ws_authorized({}) is True


def test_ws_gate_socketio_auth_key_still_accepted(bmo_app, monkeypatch):
    """Regression: the socket.io auth.bmo_api_key path is unchanged."""
    import app as bmo_module
    monkeypatch.setattr(bmo_module, "BMO_API_KEY", "supersecret")
    monkeypatch.setattr(bmo_module, "_bmo_client_is_trusted_localhost", lambda: False)
    monkeypatch.setattr(bmo_module, "_cf_access_authenticated", lambda: False)
    with bmo_module.app.test_request_context("/socket.io/"):
        assert _ws_authorized({"bmo_api_key": "supersecret"}) is True
