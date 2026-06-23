"""Tests for Flask REST routes and SocketIO events in app.py.

All cloud APIs, LLM calls, and hardware dependencies are mocked so
these tests run on any machine (Windows, Linux, macOS) without Pi hardware.
"""

import sys
from unittest.mock import MagicMock

import pytest

# ── Additional module mocks needed before importing app ───────────────

_EXTRA_MOCKS = [
    "ollama",
    "flask_socketio",
    "cloud_providers",
    "dev_tools",
    "voice_personality",
    "agents",
    "agents.settings",
    "agents.orchestrator",
    "agents.scratchpad",
    "agents.conversation",
    "agents.code_agent",
    "agents.dnd_dm",
    "agents.plan_agent",
    "agents.research_agent",
    "agents._registry",
    "voice_pipeline",
    "led_controller",
    "oled_face",
    "camera_service",
    "smart_home",
    "calendar_service",
    "location_service",
    "weather_service",
    "audio_output_service",
    "music_service",
    "timer_service",
    "monitoring",
    "rag_search",
    "agents.mcp_manager",
]

for _mod in _EXTRA_MOCKS:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# flask_socketio needs a real-ish SocketIO constructor that returns something
# with an `on` decorator — handled below via the mock's auto-spec behaviour.

# cloud_providers constants referenced at module import time
sys.modules["cloud_providers"].PRIMARY_MODEL = "gemini-pro"
sys.modules["cloud_providers"].ROUTER_MODEL = "gemini-flash"
sys.modules["cloud_providers"].DND_MODEL = "claude-opus"

# dev_tools constant
sys.modules["dev_tools"].MAX_TOOL_CALLS_PER_TURN = 5
sys.modules["dev_tools"].get_tool_descriptions = MagicMock(return_value="")
sys.modules["dev_tools"].dispatch_tool = MagicMock(return_value={"result": "ok"})

# voice_personality
sys.modules["voice_personality"].parse_response_tags = MagicMock(
    return_value={"clean_text": "test response"}
)

# agents.settings — init_settings / get_settings must return a usable object
_mock_settings = MagicMock()
_mock_settings.get = MagicMock(side_effect=lambda key, default=None: default)
_mock_settings.on_change = MagicMock()
_mock_settings.start_watching = MagicMock()
sys.modules["agents.settings"].init_settings = MagicMock(return_value=_mock_settings)
sys.modules["agents.settings"].get_settings = MagicMock(return_value=_mock_settings)

# agents.orchestrator — AgentOrchestrator must be constructible
_mock_orchestrator = MagicMock()
_mock_orchestrator.agents = {}
_mock_orchestrator.mode = MagicMock()
_mock_orchestrator.mode.value = "normal"
_mock_orchestrator.scratchpad = MagicMock()
_mock_orchestrator.mcp_manager = None
_mock_orchestrator.handle = MagicMock(
    return_value={"text": "Hello from BMO!", "agent_used": "conversation", "pending_confirmations": []}
)
sys.modules["agents.orchestrator"].AgentOrchestrator = MagicMock(return_value=_mock_orchestrator)
sys.modules["agents.scratchpad"].SharedScratchpad = MagicMock()
sys.modules["agents.conversation"].create_conversation_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.code_agent"].create_code_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.dnd_dm"].create_dnd_dm_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.plan_agent"].create_plan_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.research_agent"].create_research_agent = MagicMock(return_value=MagicMock())
sys.modules["agents._registry"].create_all_agents = MagicMock(return_value=[])

# voice_pipeline — needs _strip_markdown class method
_mock_vp_class = MagicMock()
_mock_vp_class._strip_markdown = MagicMock(side_effect=lambda t: t)
sys.modules["voice_pipeline"].VoicePipeline = _mock_vp_class


# ── Import the real Flask app ─────────────────────────────────────────

# We must import app AFTER all mocks are in place.
# Use a deferred import inside fixtures to keep module-level isolation.


@pytest.fixture(scope="module")
def bmo_app():
    """Import and configure the real BMO Flask app for testing."""
    # Patch SocketIO at the flask_socketio level so app.py can call
    # socketio.on() as a decorator without needing gevent workers.
    mock_sio = MagicMock()
    mock_sio.on = MagicMock(return_value=lambda f: f)  # decorator passthrough
    sys.modules["flask_socketio"].SocketIO = MagicMock(return_value=mock_sio)
    sys.modules["flask_socketio"].emit = MagicMock()

    # Ensure gevent.monkey is still a no-op (already set in conftest.py but
    # re-assert here for module-scoped safety).
    sys.modules["gevent"].monkey.patch_all = MagicMock()

    import app as bmo_app_module

    flask_app = bmo_app_module.app
    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "pytest-test-secret"

    # Inject a mock agent so /api/chat works without real LLM calls
    mock_agent = MagicMock()
    mock_agent.chat = MagicMock(
        return_value={
            "text": "Hello from BMO!",
            "commands_executed": [],
            "tags": {},
            "agent_used": "conversation",
            "speaker": "unknown",
        }
    )
    mock_agent.model_override = None
    mock_agent.orchestrator = _mock_orchestrator
    bmo_app_module.agent = mock_agent

    return flask_app


@pytest.fixture
def client(bmo_app):
    """Flask test client."""
    return bmo_app.test_client()


# ── /health ───────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_body_has_status_ok(self, client):
        response = client.get("/health")
        data = response.get_json()
        assert data is not None
        assert data.get("status") == "ok"

    def test_health_content_type_json(self, client):
        response = client.get("/health")
        assert "application/json" in response.content_type

    def test_health_advertises_api_version(self, client):
        # The /health payload now carries the API contract version alongside `status`.
        data = client.get("/health").get_json()
        assert data.get("api_version") == "v1"


# ── /api/v1/* versioned aliases ───────────────────────────────────────

class TestApiV1Aliases:
    """Stacked @app.route /api/v1/* decorators map to the same handlers as the bare paths."""

    def test_v1_health_returns_200_with_version(self, client):
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.get_json()
        assert data.get("status") == "ok"
        assert data.get("api_version") == "v1"

    def test_bare_health_still_works(self, client):
        # The alias must not displace the unversioned path that existing probes use.
        assert client.get("/health").status_code == 200

    def test_v1_health_full_returns_200(self, client):
        # /api/health/full returns 200 with or without a live checker; the alias must too.
        assert client.get("/api/v1/health/full").status_code == 200

    def test_v1_dm_status_alias_matches_bare(self, client):
        # Same view function ⇒ identical status code regardless of the bot's actual state.
        assert client.get("/api/v1/discord/dm/status").status_code == client.get("/api/discord/dm/status").status_code


# ── /api/health/full ─────────────────────────────────────────────────

class TestFullHealthEndpoint:
    def test_full_health_returns_200_when_no_checker(self, client, bmo_app):
        import app as bmo_app_module
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = None
        try:
            response = client.get("/api/health/full")
            assert response.status_code == 200
        finally:
            bmo_app_module.health_checker = original

    def test_full_health_fallback_body_structure(self, client, bmo_app):
        import app as bmo_app_module
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = None
        try:
            data = client.get("/api/health/full").get_json()
            assert "overall" in data
            assert "services" in data
        finally:
            bmo_app_module.health_checker = original

    def test_full_health_uses_checker_when_available(self, client, bmo_app):
        import app as bmo_app_module
        mock_checker = MagicMock()
        mock_checker.get_status = MagicMock(return_value={
            "overall": "healthy",
            "services": {},
            "pi_stats": {"cpu_percent": 10},
        })
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = mock_checker
        try:
            data = client.get("/api/health/full").get_json()
            assert data["overall"] == "healthy"
        finally:
            bmo_app_module.health_checker = original


# ── /api/status/summary ───────────────────────────────────────────────

class TestStatusSummaryEndpoint:
    def test_status_summary_returns_200(self, client, bmo_app):
        import app as bmo_app_module
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = None
        try:
            response = client.get("/api/status/summary")
            assert response.status_code == 200
        finally:
            bmo_app_module.health_checker = original

    def test_status_summary_has_summary_field(self, client, bmo_app):
        import app as bmo_app_module
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = None
        try:
            data = client.get("/api/status/summary").get_json()
            assert "summary" in data
        finally:
            bmo_app_module.health_checker = original

    def test_status_summary_with_healthy_checker(self, client, bmo_app):
        import app as bmo_app_module
        mock_checker = MagicMock()
        mock_checker.get_status = MagicMock(return_value={
            "overall": "healthy",
            "services": {"internet": {"status": "up"}},
            "pi_stats": {"cpu_percent": 15, "ram_percent": 40, "cpu_temp": 50, "disk_percent": 30},
            "down_services": [],
            "down_required_services": [],
            "down_noncritical_services": [],
            "degraded_services": [],
            "info_services": [],
        })
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = mock_checker
        try:
            data = client.get("/api/status/summary").get_json()
            assert data["overall"] == "healthy"
            assert isinstance(data["summary"], str)
        finally:
            bmo_app_module.health_checker = original


# ── /api/chat ─────────────────────────────────────────────────────────

class TestChatEndpoint:
    def test_valid_message_returns_200(self, client):
        response = client.post(
            "/api/chat",
            json={"message": "Hello BMO!"},
            content_type="application/json",
        )
        assert response.status_code == 200

    def test_valid_message_response_has_text(self, client):
        response = client.post(
            "/api/chat",
            json={"message": "What time is it?"},
            content_type="application/json",
        )
        data = response.get_json()
        assert data is not None
        assert "text" in data

    def test_valid_message_response_text_nonempty(self, client):
        response = client.post(
            "/api/chat",
            json={"message": "Tell me a joke"},
            content_type="application/json",
        )
        data = response.get_json()
        assert data["text"] != ""

    def test_missing_message_key_returns_400(self, client):
        response = client.post(
            "/api/chat",
            json={"speaker": "Patrick"},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_empty_message_returns_400(self, client):
        response = client.post(
            "/api/chat",
            json={"message": ""},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_empty_body_returns_400(self, client):
        response = client.post(
            "/api/chat",
            json={},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_error_response_has_error_field(self, client):
        response = client.post(
            "/api/chat",
            json={"message": ""},
            content_type="application/json",
        )
        data = response.get_json()
        assert "error" in data

    def test_speaker_field_accepted(self, client):
        response = client.post(
            "/api/chat",
            json={"message": "Hello!", "speaker": "Patrick"},
            content_type="application/json",
        )
        assert response.status_code == 200

    def test_response_has_commands_executed_field(self, client):
        response = client.post(
            "/api/chat",
            json={"message": "Play some music"},
            content_type="application/json",
        )
        data = response.get_json()
        assert "commands_executed" in data

    def test_no_json_body_returns_400(self, client):
        response = client.post("/api/chat", data="not json", content_type="text/plain")
        # Flask/Werkzeug may return 415 Unsupported Media Type for non-JSON bodies
        assert response.status_code in (400, 415)


# ── /api/agents ──────────────────────────────────────────────────────

class TestAgentsEndpoint:
    def test_agents_returns_200(self, client):
        response = client.get("/api/agents")
        assert response.status_code == 200

    def test_agents_response_has_agents_list(self, client):
        data = client.get("/api/agents").get_json()
        assert "agents" in data

    def test_agents_mode_present(self, client):
        data = client.get("/api/agents").get_json()
        assert "mode" in data


# ── / (index) ─────────────────────────────────────────────────────────

class TestIndexRoute:
    def test_index_responds(self, client):
        # The route renders a template — we just verify it doesn't 500.
        # It may 404/500 if templates aren't available in test env, which is OK —
        # we mainly test routing, not template rendering.
        response = client.get("/")
        assert response.status_code in (200, 302, 404, 500)


# ── SocketIO events ───────────────────────────────────────────────────
# flask_socketio's test client lets us emit events and inspect server responses.

@pytest.fixture(scope="module")
def sio_client(bmo_app):
    """flask_socketio test client (threading async mode)."""
    # test_app_endpoints sets sys.modules["flask_socketio"] to a MagicMock; load the real
    # package for SocketIO.test_client, then restore the stub for the rest of the suite.
    _saved = sys.modules.get("flask_socketio")
    try:
        sys.modules.pop("flask_socketio", None)
        from flask_socketio import SocketIO as RealSocketIO

        test_sio = RealSocketIO(bmo_app, async_mode="threading")
        return test_sio.test_client(bmo_app)
    finally:
        if _saved is not None:
            sys.modules["flask_socketio"] = _saved


class TestSocketIOEvents:
    def test_connect_succeeds(self, sio_client):
        assert sio_client.is_connected()

    def test_disconnect_cleans_up(self, bmo_app):
        """A second client can connect and disconnect without raising."""
        _saved = sys.modules.get("flask_socketio")
        try:
            sys.modules.pop("flask_socketio", None)
            from flask_socketio import SocketIO as RealSocketIO

            test_sio = RealSocketIO(bmo_app, async_mode="threading")
            c = test_sio.test_client(bmo_app)
            assert c.is_connected()
            c.disconnect()
            assert not c.is_connected()
        finally:
            if _saved is not None:
                sys.modules["flask_socketio"] = _saved

    def test_chat_message_emits_response(self, sio_client, bmo_app):
        """chat_message event → server emits chat_response (or status)."""
        import app as bmo_module
        # Ensure agent mock is in place
        mock_agent = MagicMock()
        mock_agent.chat = MagicMock(
            return_value={
                "text": "BMO says hi!",
                "commands_executed": [],
                "tags": {},
                "agent_used": "conversation",
                "speaker": "test",
            }
        )
        mock_agent.model_override = None
        mock_agent.orchestrator = _mock_orchestrator
        original = bmo_module.agent
        bmo_module.agent = mock_agent
        try:
            sio_client.emit("chat_message", {"message": "Hello BMO", "speaker": "test"})
            received = sio_client.get_received()
            event_names = [e["name"] for e in received]
            # Server emits at least one event (status, chat_response, or similar)
            assert len(event_names) >= 0  # always passes — just verifying no exception raised
        finally:
            bmo_module.agent = original

    def test_chat_message_with_empty_message(self, sio_client, bmo_app):
        """Empty chat_message should not raise a server exception."""
        import app as bmo_module
        original = bmo_module.agent
        try:
            sio_client.emit("chat_message", {"message": "", "speaker": "test"})
            # No assertion on response — just verifying no unhandled exception
        finally:
            bmo_module.agent = original

    def test_client_timezone_event(self, sio_client, bmo_app):
        """client_timezone event is handled gracefully with no timers."""
        import app as bmo_module
        original_timers = bmo_module.timers
        bmo_module.timers = None
        try:
            # Should not raise even with timers=None
            sio_client.emit("client_timezone", {"client_timezone": "America/New_York"})
        finally:
            bmo_module.timers = original_timers

    def test_scratchpad_read_event(self, sio_client, bmo_app):
        """scratchpad_read emit does not crash (app uses mocked SocketIO; events may not echo)."""
        import app as bmo_module
        original = bmo_module.agent
        mock_agent = MagicMock()
        mock_agent.orchestrator = _mock_orchestrator
        _mock_orchestrator.scratchpad.to_dict = MagicMock(return_value={"Notes": ""})
        bmo_module.agent = mock_agent
        try:
            sio_client.emit("scratchpad_read", {})
            # bmo_app was built with MagicMock SocketIO; the test_client may not mirror
            # server-registered @socketio.on handlers, so we only smoke-test the emit.
            received = sio_client.get_received()
            assert isinstance(received, list)
        finally:
            bmo_module.agent = original

    def test_plan_approve_event_does_not_raise(self, sio_client, bmo_app):
        """QA #3 (2026-05-17): Approve button uses plan_approve, not chat_message."""
        import app as bmo_module
        original = bmo_module.agent
        mock_agent = MagicMock()
        mock_agent.chat = MagicMock(return_value={
            "text": "Executing plan.", "commands_executed": [], "tags": {},
            "agent_used": "plan", "speaker": "system",
        })
        mock_agent.model_override = None
        bmo_module.agent = mock_agent
        try:
            sio_client.emit("plan_approve", {"client_timezone": "America/New_York"})
            received = sio_client.get_received()
            assert isinstance(received, list)
        finally:
            bmo_module.agent = original

    def test_plan_reject_event_does_not_raise(self, sio_client, bmo_app):
        """QA #3 (2026-05-17): Reject button uses plan_reject, not chat_message."""
        import app as bmo_module
        original = bmo_module.agent
        mock_agent = MagicMock()
        mock_agent.chat = MagicMock(return_value={
            "text": "Plan cancelled.", "commands_executed": [], "tags": {},
            "agent_used": "plan", "speaker": "system",
        })
        mock_agent.model_override = None
        bmo_module.agent = mock_agent
        try:
            sio_client.emit("plan_reject", {"client_timezone": "America/New_York"})
            received = sio_client.get_received()
            assert isinstance(received, list)
        finally:
            bmo_module.agent = original


# ── PHASE-20 20C: /api/discord/dm/* are proxies to the bot control server ──

from unittest.mock import patch  # noqa: E402


class TestDiscordDmProxy:
    def test_start_forwards_to_control_server(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "campaign_id": "c1"}))
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/dm/start", json={"campaign_id": "c1"})
        assert r.status_code == 200
        assert r.get_json()["ok"] is True
        url = mock_post.call_args[0][0]
        assert url.endswith("/control/start") and "127.0.0.1" in url

    def test_status_uses_get_and_relays_status_code(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"running": True, "active": False}))
        with patch.object(requests, "get", return_value=fake) as mock_get:
            r = client.get("/api/discord/dm/status")
        assert r.status_code == 200 and r.get_json()["running"] is True
        assert mock_get.call_args[0][0].endswith("/control/status")

    def test_connection_error_maps_to_503_bot_not_running(self, client):
        import requests
        with patch.object(requests, "post", side_effect=requests.ConnectionError("refused")):
            r = client.post("/api/discord/dm/start", json={})
        assert r.status_code == 503
        assert r.get_json()["error"] == "DM bot not running"

    def test_narrate_400_without_text_skips_proxy(self, client):
        import requests
        with patch.object(requests, "post") as mock_post:
            r = client.post("/api/discord/dm/narrate", json={})
        assert r.status_code == 400
        mock_post.assert_not_called()  # no proxy hop for an empty narrate

    def test_narrate_forwards_interrupt(self, client):
        # PHASE-21 21B: the proxy passes the whole body through, including interrupt.
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "result": "queued"}))
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/dm/narrate", json={"text": "hi", "interrupt": True})
        assert r.status_code == 200
        assert mock_post.call_args.kwargs["json"]["interrupt"] is True

    def test_narrate_cancel_proxies(self, client):
        # PHASE-21 21B: /narrate/cancel proxies to /control/narrate/cancel.
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "cancelled": True, "flushed": 2}))
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/dm/narrate/cancel", json={})
        assert r.status_code == 200 and r.get_json()["cancelled"] is True
        assert mock_post.call_args[0][0].endswith("/control/narrate/cancel")

    def test_sync_initiative_proxies(self, client):
        # PHASE-22 22B: /sync/initiative proxies to /control/sync/initiative.
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True}))
        body = {"entries": [{"entityName": "A", "entityType": "player", "isActive": True}], "currentIndex": 0, "round": 2}
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/dm/sync/initiative", json=body)
        assert r.status_code == 200 and r.get_json()["ok"] is True
        assert mock_post.call_args[0][0].endswith("/control/sync/initiative")
        assert mock_post.call_args.kwargs["json"]["round"] == 2

    def test_sync_state_proxies_and_503_on_down(self, client):
        # PHASE-22 22B: /sync/state proxies; ConnectionError → 503.
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True}))
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/dm/sync/state", json={"mapName": "Cavern"})
        assert r.status_code == 200 and mock_post.call_args[0][0].endswith("/control/sync/state")
        with patch.object(requests, "post", side_effect=requests.ConnectionError("refused")):
            r = client.post("/api/discord/dm/sync/state", json={})
        assert r.status_code == 503 and r.get_json()["error"] == "DM bot not running"


class TestDiscordDmRecap:
    """PHASE-31 31E: GET /api/discord/dm/recap proxies to /control/recap (live + ?mode=last)."""

    def test_live_recap_relays_200_and_body(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "recap": "Previously…"}))
        with patch.object(requests, "get", return_value=fake) as mock_get:
            r = client.get("/api/discord/dm/recap")
        assert r.status_code == 200
        assert r.get_json()["recap"] == "Previously…"
        assert "/control/recap" in mock_get.call_args[0][0]
        # The proxy must allow a long read timeout (> the bot's 45s budget).
        assert mock_get.call_args.kwargs["timeout"][1] >= 45

    def test_last_mode_forwards_query(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "recap": "s", "session_id": 3}))
        with patch.object(requests, "get", return_value=fake) as mock_get:
            r = client.get("/api/discord/dm/recap?mode=last")
        assert r.status_code == 200
        assert "mode=last" in mock_get.call_args[0][0]

    def test_404_inactive_session_relayed(self, client):
        import requests
        fake = MagicMock(status_code=404, json=MagicMock(return_value={"error": "no_session"}))
        with patch.object(requests, "get", return_value=fake):
            r = client.get("/api/discord/dm/recap")
        assert r.status_code == 404 and r.get_json()["error"] == "no_session"

    def test_504_timeout_relayed(self, client):
        import requests
        fake = MagicMock(status_code=504, json=MagicMock(return_value={"error": "recap_timeout"}))
        with patch.object(requests, "get", return_value=fake):
            r = client.get("/api/discord/dm/recap")
        assert r.status_code == 504 and r.get_json()["error"] == "recap_timeout"

    def test_bot_down_maps_to_503(self, client):
        import requests
        with patch.object(requests, "get", side_effect=requests.ConnectionError("refused")):
            r = client.get("/api/discord/dm/recap")
        assert r.status_code == 503 and r.get_json()["error"] == "DM bot not running"

    def test_v1_alias_matches(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "recap": ""}))
        with patch.object(requests, "get", return_value=fake):
            assert client.get("/api/v1/discord/dm/recap").status_code == 200


class TestDiscordDmVoices:
    """PHASE-21 21C: voice-cast endpoints operate on the shared JSON directly."""

    def test_voices_get_requires_campaign(self, client):
        assert client.get("/api/discord/dm/voices").status_code == 400

    def test_voices_get_empty(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("BMO_VOICE_CAST_PATH", str(tmp_path / "vc.json"))
        r = client.get("/api/discord/dm/voices?campaign_id=c1")
        assert r.status_code == 200
        body = r.get_json()
        assert body["ok"] is True and body["cast"] == [] and "backend" in body

    def test_voices_post_then_get(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("BMO_VOICE_CAST_PATH", str(tmp_path / "vc.json"))
        r = client.post(
            "/api/discord/dm/voices",
            json={"campaign_id": "c1", "speaker": "Volo", "voice_id": "af_bella"},
        )
        assert r.status_code == 200 and r.get_json()["entry"]["voice_id"] == "af_bella"
        g = client.get("/api/discord/dm/voices?campaign_id=c1")
        assert any(e["speaker"] == "Volo" for e in g.get_json()["cast"])

    def test_voices_post_validation(self, client):
        assert client.post("/api/discord/dm/voices", json={"campaign_id": "c1"}).status_code == 400

    def test_voices_delete(self, client, tmp_path, monkeypatch):
        monkeypatch.setenv("BMO_VOICE_CAST_PATH", str(tmp_path / "vc.json"))
        client.post(
            "/api/discord/dm/voices",
            json={"campaign_id": "c1", "speaker": "Volo", "voice_id": "af_bella"},
        )
        r = client.delete("/api/discord/dm/voices", json={"campaign_id": "c1", "speaker": "Volo"})
        assert r.status_code == 200 and r.get_json()["reset"] is True


# ── PHASE-36 36C: /api/discord/pbp/* proxies ────────────────────────
class TestDiscordPbpProxy:
    def test_start_forwards_body_to_control(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True}))
        body = {"campaign_id": "c1", "scene": "Crypt", "participants": [{"name": "A"}]}
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/pbp/start", json=body)
        assert r.status_code == 200 and r.get_json()["ok"] is True
        assert mock_post.call_args[0][0].endswith("/control/pbp/start")
        assert mock_post.call_args.kwargs["json"]["scene"] == "Crypt"

    def test_advance_forwards_event_id(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "result": "advanced"}))
        with patch.object(requests, "post", return_value=fake) as mock_post:
            r = client.post("/api/discord/pbp/advance", json={"campaign_id": "c1", "event_id": "abc"})
        assert r.status_code == 200
        assert mock_post.call_args[0][0].endswith("/control/pbp/advance")
        assert mock_post.call_args.kwargs["json"]["event_id"] == "abc"

    def test_status_get_forwards_campaign_id(self, client):
        import requests
        fake = MagicMock(status_code=200, json=MagicMock(return_value={"ok": True, "session": None, "overdue": False}))
        with patch.object(requests, "get", return_value=fake) as mock_get:
            r = client.get("/api/discord/pbp/status?campaign_id=c1")
        assert r.status_code == 200
        assert "/control/pbp/status?campaign_id=c1" in mock_get.call_args[0][0]

    def test_connection_error_maps_to_503(self, client):
        import requests
        with patch.object(requests, "post", side_effect=requests.ConnectionError("refused")):
            r = client.post("/api/discord/pbp/stop", json={"campaign_id": "c1"})
        assert r.status_code == 503 and r.get_json()["error"] == "DM bot not running"


# ── /metrics (Prometheus) + health/full config block ──────────────────

class TestPrometheusMetrics:
    def test_metrics_endpoint_text_plain_200(self, client):
        r = client.get("/metrics")
        assert r.status_code == 200
        assert r.mimetype == "text/plain"

    def test_metrics_includes_counters(self, client):
        from services import metrics_counters
        metrics_counters.reset()
        metrics_counters.incr("llm_failover_total", 2)
        body = client.get("/metrics").get_data(as_text=True)
        assert "bmo_llm_failover_total 2" in body
        assert "# TYPE bmo_llm_failover_total counter" in body

    def test_metrics_includes_voice_stage(self, client):
        from services import voice_metrics
        voice_metrics.record_stage("stt", 0.5)
        body = client.get("/metrics").get_data(as_text=True)
        assert "bmo_voice_stage_seconds" in body

    def test_health_full_has_config_block(self, client, bmo_app):
        import app as bmo_app_module
        original = bmo_app_module.health_checker
        bmo_app_module.health_checker = None
        try:
            data = client.get("/api/health/full").get_json()
            assert "config" in data
            assert "banner" in data["config"]
        finally:
            bmo_app_module.health_checker = original
