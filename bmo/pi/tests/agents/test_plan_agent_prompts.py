"""Prompt templates must .format() cleanly.

Unescaped literal braces in prose examples crash the plan agent's DESIGN
phase before the LLM is even called (BMO-ISSUES 2026-07-02: the 38e endpoint
examples raised KeyError: 'state' on 100% of design-phase requests since
2026-05-17, masked by the orchestrator's generic failure fallback).

These tests must exercise the REAL prompt strings. Sibling test files
(test_base_agent.py, test_app_endpoints.py, test_canary_mode.py) install
`sys.modules["agents"] = MagicMock()` (and `agents.plan_agent` too) at
import time and never remove them, so a plain `from agents.plan_agent import
DESIGN_PROMPT` picks up a MagicMock whenever this file runs after one of them
in the same pytest process — `.format()` then returns a MagicMock and the
regression check is silently vacuous. We snapshot/drop/restore every `agents*`
sys.modules entry around a fresh real import (same idiom as test_registry.py)
so the constants under test are the genuine strings from agents/plan_agent.py.
"""

import importlib
import sys

import pytest


@pytest.fixture()
def plan_agent():
    """Yield the REAL agents.plan_agent module (bypassing sibling MagicMocks)."""
    snapshot = {k: v for k, v in sys.modules.items()
                if k == "agents" or k.startswith("agents.")}
    for k in list(snapshot):
        del sys.modules[k]
    try:
        yield importlib.import_module("agents.plan_agent")
    finally:
        for k in [k for k in list(sys.modules)
                  if k == "agents" or k.startswith("agents.")]:
            del sys.modules[k]
        sys.modules.update(snapshot)


def test_design_prompt_formats_cleanly(plan_agent):
    design_prompt = plan_agent.DESIGN_PROMPT
    assert isinstance(design_prompt, str)  # guard: not a MagicMock
    out = design_prompt.format(task="turn the LEDs purple", scratchpad_context="")
    # The prose examples must survive as literal braces after formatting.
    assert '{state:"breathing", color:"purple", brightness:40}' in out
    assert '{scene:"movie"}' in out
    assert "turn the LEDs purple" in out


def test_redesign_prompt_formats_cleanly(plan_agent):
    redesign_prompt = plan_agent.REDESIGN_PROMPT
    assert isinstance(redesign_prompt, str)  # guard: not a MagicMock
    out = redesign_prompt.format(current_plan="plan", feedback="feedback")
    assert "plan" in out and "feedback" in out
