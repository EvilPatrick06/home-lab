"""Prompt templates must .format() cleanly.

Unescaped literal braces in prose examples crash the plan agent's DESIGN
phase before the LLM is even called (BMO-ISSUES 2026-07-02: the 38e endpoint
examples raised KeyError: 'state' on 100% of design-phase requests since
2026-05-17, masked by the orchestrator's generic failure fallback).
"""

import importlib.util
import os
import sys
from unittest.mock import MagicMock

# test_app_endpoints / test_canary_mode stub sys.modules["agents.plan_agent"] with a
# MagicMock (guarded by `if _mod not in sys.modules`) and never restore it, so a plain
# `from agents.plan_agent import ...` here is collection-order dependent and can make
# DESIGN_PROMPT a MagicMock. Load plan_agent.py directly by path under a standalone
# name so these format() assertions are deterministic. DESIGN_PROMPT / REDESIGN_PROMPT
# are plain string literals; the module only imports agents.base_agent, which we seed
# with a throwaway stub (restored afterward) so the load never touches global state.
def _load_plan_agent_prompts():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "agents", "plan_agent.py")
    spec = importlib.util.spec_from_file_location("_plan_agent_prompts_real", path)
    mod = importlib.util.module_from_spec(spec)
    added = [n for n in ("agents", "agents.base_agent") if n not in sys.modules]
    for n in added:
        sys.modules[n] = MagicMock()
    try:
        spec.loader.exec_module(mod)
    finally:
        for n in added:
            sys.modules.pop(n, None)
    return mod.DESIGN_PROMPT, mod.REDESIGN_PROMPT


DESIGN_PROMPT, REDESIGN_PROMPT = _load_plan_agent_prompts()


def test_design_prompt_formats_cleanly():
    out = DESIGN_PROMPT.format(task="turn the LEDs purple", scratchpad_context="")
    # The prose examples must survive as literal braces after formatting.
    assert '{state:"breathing", color:"purple", brightness:40}' in out
    assert '{scene:"movie"}' in out
    assert "turn the LEDs purple" in out


def test_redesign_prompt_formats_cleanly():
    out = REDESIGN_PROMPT.format(current_plan="plan", feedback="feedback")
    assert "plan" in out and "feedback" in out
