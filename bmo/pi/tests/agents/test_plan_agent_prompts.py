"""Prompt templates must .format() cleanly.

Unescaped literal braces in prose examples crash the plan agent's DESIGN
phase before the LLM is even called (BMO-ISSUES 2026-07-02: the 38e endpoint
examples raised KeyError: 'state' on 100% of design-phase requests since
2026-05-17, masked by the orchestrator's generic failure fallback).
"""

from agents.plan_agent import DESIGN_PROMPT, REDESIGN_PROMPT


def test_design_prompt_formats_cleanly():
    out = DESIGN_PROMPT.format(task="turn the LEDs purple", scratchpad_context="")
    # The prose examples must survive as literal braces after formatting.
    assert '{state:"breathing", color:"purple", brightness:40}' in out
    assert '{scene:"movie"}' in out
    assert "turn the LEDs purple" in out


def test_redesign_prompt_formats_cleanly():
    out = REDESIGN_PROMPT.format(current_plan="plan", feedback="feedback")
    assert "plan" in out and "feedback" in out
