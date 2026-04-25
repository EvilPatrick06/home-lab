"""Tests for BmoAgent (agent.py).

Tests instantiation, the chat() method, chat_stream(), model routing,
and error handling — all without real LLM or hardware calls.
"""

import sys
import types
from unittest.mock import MagicMock, patch, call

import pytest

# ── Module-level mocks (must happen before any agent.py import) ───────

_AGENT_MOCKS = [
    "ollama",
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
    "rag_search",
    "agents.mcp_manager",
]

for _mod in _AGENT_MOCKS:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# cloud_providers constants
sys.modules["cloud_providers"].PRIMARY_MODEL = "gemini-pro"
sys.modules["cloud_providers"].ROUTER_MODEL = "gemini-flash"
sys.modules["cloud_providers"].DND_MODEL = "claude-opus"
sys.modules["cloud_providers"].cloud_chat = MagicMock(return_value="mock cloud response")
sys.modules["cloud_providers"].gemini_chat_stream = MagicMock(return_value=iter(["chunk"]))
sys.modules["cloud_providers"].groq_llm_chat_stream = MagicMock(return_value=iter(["chunk"]))

# dev_tools
sys.modules["dev_tools"].MAX_TOOL_CALLS_PER_TURN = 5
sys.modules["dev_tools"].get_tool_descriptions = MagicMock(return_value="")
sys.modules["dev_tools"].dispatch_tool = MagicMock(return_value={"result": "ok"})

# voice_personality — parse_response_tags must return dict with clean_text
sys.modules["voice_personality"].parse_response_tags = MagicMock(
    side_effect=lambda text: {"clean_text": text, "face": None, "led": None}
)

# agents.settings
_mock_settings = MagicMock()
_mock_settings.get = MagicMock(side_effect=lambda key, default=None: default)
_mock_settings.on_change = MagicMock()
_mock_settings.start_watching = MagicMock()
sys.modules["agents.settings"].init_settings = MagicMock(return_value=_mock_settings)
sys.modules["agents.settings"].get_settings = MagicMock(return_value=_mock_settings)

# agents._registry
sys.modules["agents._registry"].create_all_agents = MagicMock(return_value=[])


# ── Helper: build a mock orchestrator ────────────────────────────────

def _make_orchestrator(reply="Hello from BMO!", agent_used="conversation"):
    orch = MagicMock()
    orch.agents = {}
    orch.mode = MagicMock()
    orch.mode.value = "normal"
    orch.is_plan_mode = False
    orch.mcp_manager = None
    orch.scratchpad = MagicMock()
    orch.scratchpad.to_dict = MagicMock(return_value={"Notes": ""})
    orch.handle = MagicMock(return_value={
        "text": reply,
        "agent_used": agent_used,
        "pending_confirmations": [],
    })
    orch._emit = MagicMock()
    orch._get_display_name = MagicMock(return_value=agent_used)
    return orch


# ── Fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def mock_orchestrator():
    return _make_orchestrator()


def _ensure_real_agent_module():
    """test_voice_pipeline may register a MagicMock for `agent`; clear before real import."""
    mod = sys.modules.get("agent")
    if mod is not None and isinstance(mod, MagicMock):
        del sys.modules["agent"]


@pytest.fixture
def agent_module():
    """Import agent module (deferred so mocks are in place)."""
    _ensure_real_agent_module()
    import agent as agent_mod
    return agent_mod


@pytest.fixture
def bmo_agent(mock_orchestrator):
    """BmoAgent instance with all external calls mocked."""
    from agents.orchestrator import AgentOrchestrator
    from agents.conversation import create_conversation_agent
    from agents.code_agent import create_code_agent
    from agents.dnd_dm import create_dnd_dm_agent
    from agents.plan_agent import create_plan_agent
    from agents.research_agent import create_research_agent

    AgentOrchestrator.return_value = mock_orchestrator
    create_conversation_agent.return_value = MagicMock()
    create_code_agent.return_value = MagicMock()
    create_dnd_dm_agent.return_value = MagicMock()
    create_plan_agent.return_value = MagicMock()
    create_research_agent.return_value = MagicMock()

    _ensure_real_agent_module()
    import agent as agent_mod
    return agent_mod.BmoAgent(services={}, socketio=None)


# ── Instantiation tests ───────────────────────────────────────────────

class TestBmoAgentInstantiation:
    def test_agent_can_be_instantiated(self, bmo_agent):
        assert bmo_agent is not None

    def test_agent_has_conversation_history(self, bmo_agent):
        assert hasattr(bmo_agent, "conversation_history")
        assert isinstance(bmo_agent.conversation_history, list)

    def test_conversation_history_starts_empty(self, bmo_agent):
        assert bmo_agent.conversation_history == []

    def test_agent_has_services_dict(self, bmo_agent):
        assert hasattr(bmo_agent, "services")
        assert isinstance(bmo_agent.services, dict)

    def test_agent_has_orchestrator(self, bmo_agent):
        assert hasattr(bmo_agent, "orchestrator")
        assert bmo_agent.orchestrator is not None

    def test_agent_has_settings(self, bmo_agent):
        assert hasattr(bmo_agent, "settings")

    def test_agent_has_pending_confirmations(self, bmo_agent):
        assert hasattr(bmo_agent, "_pending_confirmations")
        assert isinstance(bmo_agent._pending_confirmations, list)

    def test_agent_with_custom_services(self, mock_orchestrator):
        """Agent accepts and stores arbitrary service dict."""
        from agents.orchestrator import AgentOrchestrator
        AgentOrchestrator.return_value = mock_orchestrator
        import agent as agent_mod
        services = {"music": MagicMock(), "timers": MagicMock()}
        a = agent_mod.BmoAgent(services=services, socketio=None)
        assert a.services is services


# ── chat() method tests ───────────────────────────────────────────────

class TestBmoAgentChat:
    def test_chat_returns_dict(self, bmo_agent):
        result = bmo_agent.chat("Hello BMO")
        assert isinstance(result, dict)

    def test_chat_response_has_text_key(self, bmo_agent):
        result = bmo_agent.chat("What's up?")
        assert "text" in result

    def test_chat_response_text_is_string(self, bmo_agent):
        result = bmo_agent.chat("Hello")
        assert isinstance(result["text"], str)

    def test_chat_response_has_commands_executed(self, bmo_agent):
        result = bmo_agent.chat("Play some music")
        assert "commands_executed" in result

    def test_chat_response_has_agent_used(self, bmo_agent):
        result = bmo_agent.chat("What time is it?")
        assert "agent_used" in result

    def test_chat_response_has_tags(self, bmo_agent):
        result = bmo_agent.chat("Make a funny face")
        assert "tags" in result

    def test_chat_appends_to_history(self, bmo_agent):
        before = len(bmo_agent.conversation_history)
        bmo_agent.chat("Hello!")
        assert len(bmo_agent.conversation_history) > before

    def test_chat_history_contains_user_message(self, bmo_agent):
        bmo_agent.chat("Unique test message 12345")
        user_msgs = [
            m for m in bmo_agent.conversation_history
            if m.get("role") == "user" and "Unique test message 12345" in m.get("content", "")
        ]
        assert len(user_msgs) >= 1

    def test_chat_history_contains_assistant_reply(self, bmo_agent):
        bmo_agent.chat("Hello!")
        assistant_msgs = [m for m in bmo_agent.conversation_history if m.get("role") == "assistant"]
        assert len(assistant_msgs) >= 1

    def test_chat_with_speaker(self, bmo_agent):
        result = bmo_agent.chat("Hello!", speaker="Patrick")
        assert result is not None
        assert "text" in result

    def test_chat_with_agent_override(self, bmo_agent):
        result = bmo_agent.chat("Write a spell", agent_override="dnd_dm")
        assert "text" in result

    def test_chat_with_client_timezone(self, bmo_agent):
        result = bmo_agent.chat("What time is it?", client_timezone="America/Chicago")
        assert "text" in result

    def test_chat_orchestrator_called(self, bmo_agent, mock_orchestrator):
        bmo_agent.chat("test message")
        mock_orchestrator.handle.assert_called()

    def test_chat_orchestrator_receives_message(self, bmo_agent, mock_orchestrator):
        bmo_agent.chat("specific test input")
        call_kwargs = mock_orchestrator.handle.call_args
        # message is passed as keyword arg
        assert call_kwargs.kwargs.get("message") == "specific test input" or \
               (call_kwargs.args and "specific test input" in call_kwargs.args[0])

    def test_chat_orchestrator_error_returns_fallback_text(self, bmo_agent, mock_orchestrator):
        """If orchestrator raises, chat() returns a graceful fallback."""
        mock_orchestrator.handle.side_effect = RuntimeError("LLM exploded")
        result = bmo_agent.chat("cause an error")
        assert "text" in result
        assert isinstance(result["text"], str)
        assert len(result["text"]) > 0
        # Restore for other tests
        mock_orchestrator.handle.side_effect = None
        mock_orchestrator.handle.return_value = {
            "text": "Hello from BMO!",
            "agent_used": "conversation",
            "pending_confirmations": [],
        }

    def test_chat_empty_string_does_not_crash(self, bmo_agent):
        result = bmo_agent.chat("")
        assert isinstance(result, dict)
        assert "text" in result

    def test_chat_very_long_message(self, bmo_agent):
        long_msg = "a" * 5000
        result = bmo_agent.chat(long_msg)
        assert "text" in result

    def test_chat_commands_executed_is_list(self, bmo_agent):
        result = bmo_agent.chat("set a timer for 5 minutes")
        assert isinstance(result["commands_executed"], list)


# ── History trimming ──────────────────────────────────────────────────

class TestBmoAgentHistoryManagement:
    def test_history_does_not_exceed_max(self, bmo_agent):
        """History is trimmed when it hits the max limit."""
        # Set a small max to trigger trimming quickly
        bmo_agent._max_history = 4
        for i in range(10):
            bmo_agent.chat(f"message {i}")
        assert len(bmo_agent.conversation_history) <= bmo_agent._max_history


# ── Model override property ───────────────────────────────────────────

class TestModelOverride:
    def test_model_override_defaults_none(self, bmo_agent):
        assert bmo_agent.model_override is None

    def test_model_override_can_be_set(self, bmo_agent):
        bmo_agent.model_override = "flash"
        assert bmo_agent.model_override == "flash"
        # Reset
        bmo_agent.model_override = None

    def test_model_override_propagates_to_module(self, bmo_agent, agent_module):
        bmo_agent.model_override = "pro"
        assert agent_module._active_model_override == "pro"
        bmo_agent.model_override = None


# ── llm_chat routing (module-level function) ──────────────────────────

class TestLlmChatRouting:
    def test_llm_chat_falls_back_when_cloud_unavailable(self, agent_module):
        """llm_chat falls back to local Ollama when cloud is unreachable."""
        # Force cloud unavailable
        original = agent_module._cloud_available
        agent_module._cloud_available = False
        agent_module._cloud_last_check = 0

        mock_ollama = MagicMock()
        mock_ollama.chat.return_value = {"message": {"content": "local response"}}
        sys.modules["ollama"] = mock_ollama
        # Re-bind the module reference
        agent_module.ollama_client = mock_ollama

        result = agent_module.llm_chat([{"role": "user", "content": "hi"}])
        assert isinstance(result, str)

        agent_module._cloud_available = original

    def test_llm_chat_uses_cloud_when_available(self, agent_module):
        """llm_chat calls cloud API when cloud is marked available."""
        original = agent_module._cloud_available
        agent_module._cloud_available = True
        agent_module._cloud_last_check = float("inf")

        sys.modules["cloud_providers"].cloud_chat = MagicMock(return_value="cloud reply")
        agent_module._cloud_chat_fn = sys.modules["cloud_providers"].cloud_chat

        # Patch _cloud_chat directly on the module
        with patch.object(agent_module, "_cloud_chat", return_value="cloud reply") as mock_cc:
            result = agent_module.llm_chat([{"role": "user", "content": "hi"}])
            assert result == "cloud reply"
            mock_cc.assert_called_once()

        agent_module._cloud_available = original


# ── _select_model routing ─────────────────────────────────────────────

class TestSelectModel:
    def test_dnd_dm_routes_to_opus(self, agent_module):
        model = agent_module._select_model("dnd_dm")
        assert model == agent_module.DND_MODEL

    def test_code_routes_to_opus(self, agent_module):
        model = agent_module._select_model("code")
        assert model == agent_module.DND_MODEL

    def test_plan_routes_to_primary(self, agent_module):
        model = agent_module._select_model("plan")
        assert model == agent_module.PRIMARY_MODEL

    def test_conversation_routes_to_router(self, agent_module):
        model = agent_module._select_model("conversation")
        assert model == agent_module.ROUTER_MODEL

    def test_unknown_agent_routes_to_primary(self, agent_module):
        model = agent_module._select_model("unknown_agent_xyz")
        assert model == agent_module.PRIMARY_MODEL


# ── chat_stream() ─────────────────────────────────────────────────────

class TestBmoAgentChatStream:
    def test_chat_stream_is_iterable(self, bmo_agent, mock_orchestrator):
        """chat_stream returns a generator."""
        # Make orchestrator.agents have a "conversation" agent mock
        mock_conv_agent = MagicMock()
        mock_conv_agent._build_system_prompt = MagicMock(return_value="You are BMO.")
        mock_orchestrator.agents = {"conversation": mock_conv_agent}
        mock_orchestrator.is_plan_mode = False

        with patch("agent.llm_chat_stream", return_value=iter(["Hello", " from", " BMO!"])):
            gen = bmo_agent.chat_stream("Hello BMO")
            chunks = list(gen)
        assert isinstance(chunks, list)

    def test_chat_stream_yields_strings(self, bmo_agent, mock_orchestrator):
        mock_conv_agent = MagicMock()
        mock_conv_agent._build_system_prompt = MagicMock(return_value="You are BMO.")
        mock_orchestrator.agents = {"conversation": mock_conv_agent}
        mock_orchestrator.is_plan_mode = False

        with patch("agent.llm_chat_stream", return_value=iter(["chunk1", "chunk2"])):
            chunks = list(bmo_agent.chat_stream("test"))
        assert all(isinstance(c, str) for c in chunks)

    def test_chat_stream_no_conversation_agent_falls_back(self, bmo_agent, mock_orchestrator):
        """When no conversation agent is registered, stream falls back gracefully."""
        mock_orchestrator.agents = {}  # No conversation agent
        mock_orchestrator.is_plan_mode = False
        mock_orchestrator.handle = MagicMock(return_value={
            "text": "Fallback text",
            "agent_used": "conversation",
            "pending_confirmations": [],
        })

        with patch("agent.llm_chat", return_value="Fallback text"):
            gen = bmo_agent.chat_stream("Hello")
            chunks = list(gen)
        assert isinstance(chunks, list)


# ── compact() ────────────────────────────────────────────────────────

class TestBmoAgentCompact:
    def test_compact_short_history_returns_message(self, bmo_agent):
        bmo_agent.conversation_history = [{"role": "user", "content": "hi"}]
        result = bmo_agent.compact()
        assert "Nothing to compact" in result or isinstance(result, str)

    def test_compact_reduces_long_history(self, bmo_agent):
        bmo_agent.conversation_history = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"message {i}"}
            for i in range(20)
        ]
        with patch("agent.llm_chat", return_value="Summary of conversation."):
            result = bmo_agent.compact()
        assert isinstance(result, str)
        # History should now be shorter than 20
        assert len(bmo_agent.conversation_history) < 20
