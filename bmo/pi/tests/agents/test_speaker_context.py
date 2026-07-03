"""Regression tests for speaker context threading through the agent layer.

BMO identifies who is speaking every voice turn; this locks in that the
identified speaker is now threaded into the agent context and consumed by the
learning agent so memory becomes per-speaker, with a default-user fallback that
preserves today's single-user behavior.

Covers:
  - BaseAgent.speaker_bucket() fallback semantics (unknown/blank -> DEFAULT_USER).
  - Orchestrator.handle() passes {"speaker": ...} into run_agent's context.
  - LearningAgent stamps saved facts with the speaker and filters recall so
    speaker A's memory does not surface for speaker B, while the default bucket
    still sees everything.
"""
import sys
from unittest.mock import MagicMock

import pytest


# ── BaseAgent.speaker_bucket ─────────────────────────────────────────

class TestSpeakerBucket:
    def test_named_speaker_is_its_own_bucket(self):
        from agents.base_agent import BaseAgent
        assert BaseAgent.speaker_bucket({"speaker": "patrick"}) == "patrick"

    def test_unknown_speaker_falls_back_to_default(self):
        from agents.base_agent import BaseAgent, DEFAULT_USER
        assert BaseAgent.speaker_bucket({"speaker": "unknown"}) == DEFAULT_USER
        assert BaseAgent.speaker_bucket({"speaker": ""}) == DEFAULT_USER
        assert BaseAgent.speaker_bucket({}) == DEFAULT_USER
        assert BaseAgent.speaker_bucket(None) == DEFAULT_USER


# ── Orchestrator threads speaker into context ────────────────────────

class TestOrchestratorThreadsSpeaker:
    def test_handle_passes_speaker_into_run_agent_context(self, monkeypatch):
        # Stub the heavy deps orchestrator imports lazily.
        sys.modules.setdefault("agents.router", MagicMock())
        from agents import orchestrator as orch_mod

        # Build a bare orchestrator without running __init__ (avoids agent wiring).
        orch = orch_mod.AgentOrchestrator.__new__(orch_mod.AgentOrchestrator)
        orch.mode = orch_mod.OrchestratorMode.NORMAL
        orch.agents = {"conversation": MagicMock()}
        orch.services = {}
        orch.router = MagicMock()
        orch.router.route = MagicMock(return_value="conversation")
        orch._emit = MagicMock()
        orch._get_display_name = MagicMock(return_value="Conversation")
        orch._result_to_dict = MagicMock(return_value={"text": "ok"})

        captured = {}

        def _fake_run_agent(agent_name, message, history=None, context=None):
            captured["context"] = context
            return MagicMock()

        orch.run_agent = _fake_run_agent

        # strip_prefix is a staticmethod on the real router; stub it.
        monkeypatch.setattr(orch_mod.AgentRouter, "strip_prefix",
                            staticmethod(lambda m: m), raising=False)

        orch.handle("remember I like tea", "patrick", [], {})
        assert captured["context"] == {"speaker": "patrick"}


# ── LearningAgent per-speaker isolation ──────────────────────────────

@pytest.fixture
def learning_agent(tmp_path, monkeypatch):
    import agents.learning_agent as la
    mem = tmp_path / "memory.json"
    monkeypatch.setattr(la, "MEMORY_FILE", str(mem))
    monkeypatch.setattr(la, "MEMORY_DIR", str(tmp_path))
    from agents.base_agent import AgentConfig

    cfg = AgentConfig(name="learning", display_name="Learning", system_prompt="x")
    agent = la.LearningAgent(cfg, scratchpad=MagicMock(), services={},
                             socketio=None, orchestrator=None)
    agent.llm_call = MagicMock(return_value="Got it, I'll remember that.")
    return agent


class TestLearningPerSpeaker:
    def test_saved_fact_is_stamped_with_speaker(self, learning_agent):
        learning_agent.run("remember I like green tea", [], {"speaker": "patrick"})
        facts = learning_agent._memory["facts"]
        assert facts and facts[-1]["speaker"] == "patrick"

    def test_speaker_b_does_not_see_speaker_a_memory(self, learning_agent):
        learning_agent.run("remember my secret is 42", [], {"speaker": "alice"})
        # Format memory as seen by a *different* speaker.
        seen_by_bob = learning_agent._format_memory("bob")
        assert "secret is 42" not in seen_by_bob
        # But alice sees her own fact.
        seen_by_alice = learning_agent._format_memory("alice")
        assert "secret is 42" in seen_by_alice

    def test_default_bucket_sees_all_facts(self, learning_agent):
        learning_agent.run("remember I like tea", [], {"speaker": "alice"})
        from agents.base_agent import DEFAULT_USER
        seen_default = learning_agent._format_memory(DEFAULT_USER)
        assert "like tea" in seen_default

    def test_shared_default_fact_visible_to_named_speaker(self, learning_agent):
        # A fact saved with no speaker (single-user path) is DEFAULT_USER and
        # remains visible to every named speaker.
        learning_agent.run("remember the wifi password thing", [], None)
        seen_by_named = learning_agent._format_memory("carol")
        assert "wifi password thing" in seen_by_named
