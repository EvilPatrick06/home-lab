"""Tests for the canary boot path + configurable bind port (sub-phase 42A).

`BMO_CANARY=1` boots a validation-only path: every service module is imported
(catching the dominant deploy-break class — syntax/import errors), all routes
register, and `/health` answers, but NO hardware/audio/alarms/pollers are touched
and every service global ends up `None`. `BMO_PORT` lets the entrypoint bind any
port (default 5000).

All cloud APIs, LLM calls, and hardware are mocked (via conftest + the mocks set
up here) so these run on any machine without Pi hardware.
"""

import importlib
import sys
from unittest.mock import MagicMock

import pytest

# ── Module mocks needed before importing app (mirrors test_app_endpoints) ──
# init_services() does `from X import Y` for every service even in canary, so
# every one of these modules must be importable (mocked) for the import-check
# branches to succeed off-Pi.

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
    "agents.dev.code_agent",
    "agents.dnd.dnd_dm",
    "agents.dev.plan_agent",
    "agents.dev.research_agent",
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

# cloud_providers constants referenced at module import time
sys.modules["cloud_providers"].PRIMARY_MODEL = "gemini-pro"
sys.modules["cloud_providers"].ROUTER_MODEL = "gemini-flash"
sys.modules["cloud_providers"].DND_MODEL = "claude-opus"

# dev_tools constants
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
sys.modules["agents.orchestrator"].AgentOrchestrator = MagicMock(return_value=_mock_orchestrator)
sys.modules["agents.scratchpad"].SharedScratchpad = MagicMock()
sys.modules["agents.conversation"].create_conversation_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.dev.code_agent"].create_code_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.dnd.dnd_dm"].create_dnd_dm_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.dev.plan_agent"].create_plan_agent = MagicMock(return_value=MagicMock())
sys.modules["agents.dev.research_agent"].create_research_agent = MagicMock(return_value=MagicMock())
sys.modules["agents._registry"].create_all_agents = MagicMock(return_value=[])

# voice_pipeline — needs _strip_markdown class method
_mock_vp_class = MagicMock()
_mock_vp_class._strip_markdown = MagicMock(side_effect=lambda t: t)
sys.modules["voice_pipeline"].VoicePipeline = _mock_vp_class


def _import_app_fresh():
    """Import `app` fresh, with a mock SocketIO so socketio.on() decorators work."""
    mock_sio = MagicMock()
    mock_sio.on = MagicMock(return_value=lambda f: f)  # decorator passthrough
    sys.modules["flask_socketio"].SocketIO = MagicMock(return_value=mock_sio)
    sys.modules["flask_socketio"].emit = MagicMock()
    sys.modules["gevent"].monkey.patch_all = MagicMock()

    sys.modules.pop("app", None)
    return importlib.import_module("app")


@pytest.fixture
def fresh_app_env(monkeypatch):
    """Pop `app` from sys.modules before AND after each test so a fresh import
    picks up the per-test BMO_CANARY / BMO_PORT env, and we don't poison other
    suites that import `app` at module scope."""
    sys.modules.pop("app", None)
    yield monkeypatch
    sys.modules.pop("app", None)


# ── Canary skips hardware/services ─────────────────────────────────────

class TestCanarySkipsHardware:
    def test_canary_skips_hardware(self, fresh_app_env):
        monkeypatch = fresh_app_env
        monkeypatch.setenv("BMO_CANARY", "1")

        app_module = _import_app_fresh()
        assert app_module.BMO_CANARY is True

        # A real LedController would start a hardware thread on instantiation.
        # In canary the import is checked but the class is never called.
        mock_led_module = sys.modules["led_controller"]
        mock_led_module.LedController.reset_mock()

        app_module.init_services()

        # Every service global must be None — nothing was instantiated.
        for name in (
            "voice", "camera", "led_controller", "oled_face",
            "music", "timers", "smart_home", "calendar",
            "weather", "audio_service", "location_service", "agent",
        ):
            assert getattr(app_module, name) is None, f"{name} should be None in canary"

        # The thread-starting hardware mock was never instantiated/called.
        mock_led_module.LedController.assert_not_called()

    def test_canary_does_not_shell_out(self, fresh_app_env, monkeypatch):
        """The wpctl mic-gain subprocess must not run in canary."""
        monkeypatch = fresh_app_env
        monkeypatch.setenv("BMO_CANARY", "1")
        app_module = _import_app_fresh()

        called = {"run": False}
        orig_run = app_module.subprocess.run

        def _spy_run(*a, **k):
            called["run"] = True
            return orig_run(*a, **k)

        monkeypatch.setattr(app_module.subprocess, "run", _spy_run)
        app_module.init_services()
        assert called["run"] is False, "canary must not shell out (wpctl/etc.)"


# ── BMO_PORT env ───────────────────────────────────────────────────────

class TestBmoPortEnv:
    def test_bmo_port_env_set(self, fresh_app_env):
        monkeypatch = fresh_app_env
        monkeypatch.setenv("BMO_PORT", "5002")
        app_module = _import_app_fresh()
        assert app_module.BMO_PORT == 5002

    def test_bmo_port_default(self, fresh_app_env):
        monkeypatch = fresh_app_env
        monkeypatch.delenv("BMO_PORT", raising=False)
        app_module = _import_app_fresh()
        assert app_module.BMO_PORT == 5000


# ── /health under canary ───────────────────────────────────────────────

class TestCanaryHealthRoute:
    def test_canary_health_route(self, fresh_app_env):
        monkeypatch = fresh_app_env
        monkeypatch.setenv("BMO_CANARY", "1")
        app_module = _import_app_fresh()

        flask_app = app_module.app
        flask_app.config["TESTING"] = True
        flask_app.config["SECRET_KEY"] = "pytest-test-secret"
        client = flask_app.test_client()

        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.get_json()
        # The unversioned probe contract is the verbatim status/api_version keys;
        # PHASE-08 08A additively surfaces running-code identity (commit/asset_build/
        # started_at/uptime_s), so assert the contract keys rather than exact equality.
        assert body["status"] == "ok"
        assert body["api_version"] == "v1"
        for k in ("commit", "asset_build", "started_at", "uptime_s"):
            assert k in body
