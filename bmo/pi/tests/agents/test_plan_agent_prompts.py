"""Prompt templates must .format() cleanly.

Unescaped literal braces in prose examples crash the plan agent's DESIGN
phase before the LLM is even called (BMO-ISSUES 2026-07-02: the 38e endpoint
examples raised KeyError: 'state' on 100% of design-phase requests since
2026-05-17, masked by the orchestrator's generic failure fallback).

These tests must exercise the REAL prompt strings. Sibling test files
(test_base_agent.py, test_app_endpoints.py, test_canary_mode.py) install
`sys.modules["agents"] = MagicMock()` (and `agents.dev.plan_agent` too) at
import time and never remove them, so a plain `from agents.dev.plan_agent import
DESIGN_PROMPT` picks up a MagicMock whenever this file runs after one of them
in the same pytest process — `.format()` then returns a MagicMock and the
regression check is silently vacuous. We snapshot/drop/restore every `agents*`
sys.modules entry around a fresh real import (same idiom as test_registry.py)
so the constants under test are the genuine strings from agents/plan_agent.py.
"""

import importlib
import string
import sys
from unittest.mock import MagicMock

import pytest


@pytest.fixture()
def plan_agent():
    """Yield the REAL agents.dev.plan_agent module (bypassing sibling MagicMocks)."""
    snapshot = {k: v for k, v in sys.modules.items()
                if k == "agents" or k.startswith("agents.")}
    for k in list(snapshot):
        del sys.modules[k]
    try:
        yield importlib.import_module("agents.dev.plan_agent")
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


def test_explore_prompt_formats_cleanly(plan_agent):
    explore_prompt = plan_agent.EXPLORE_PROMPT
    assert isinstance(explore_prompt, str)  # guard: not a MagicMock
    out = explore_prompt.format(task="find the LED routes", tool_list="- read_file")
    # The tool_call example must survive as literal single-brace JSON.
    assert '{"tool": "tool_name", "args": {"param1": "value1"}}' in out
    assert "find the LED routes" in out


def test_every_prompt_constant_formats_cleanly(plan_agent):
    """Generic guard: every module-level *_PROMPT string in plan_agent must
    .format() cleanly with exactly its declared placeholders, so a future
    template (or edit) with an unescaped literal brace fails CI here."""
    constants = {name: val for name, val in vars(plan_agent).items()
                 if name.endswith("_PROMPT") and isinstance(val, str)}
    assert len(constants) >= 3, "expected EXPLORE/DESIGN/REDESIGN at minimum"
    for name, tpl in constants.items():
        fields = {f for _, f, _, _ in string.Formatter().parse(tpl) if f}
        try:
            tpl.format(**{f: "x" for f in fields})
        except (KeyError, IndexError, ValueError) as e:
            pytest.fail(f"{name} does not render cleanly ({e!r}) — unescaped literal brace?")


def test_design_smoke_no_keyerror(plan_agent):
    """_design() end-to-end with a mocked LLM + scratchpad: the KeyError path is
    dead and the rendered prompt reaches the LLM with the examples intact."""
    scratchpad = MagicMock()
    scratchpad.read = MagicMock(return_value="")
    agent = plan_agent.create_plan_agent(scratchpad, services={})
    agent.llm_call = MagicMock(return_value="## Plan: Add a header comment")

    result = agent.run("add a header comment", [], {"phase": "design"})

    assert result.text == "## Plan: Add a header comment"
    assert result.scratchpad_writes == ["Plan"]
    scratchpad.write.assert_called_once_with("Plan", "## Plan: Add a header comment")
    sys_msg = agent.llm_call.call_args[0][0][0]
    assert sys_msg["role"] == "system"
    assert '{state:"breathing", color:"purple", brightness:40}' in sys_msg["content"]
    assert "add a header comment" in sys_msg["content"]
