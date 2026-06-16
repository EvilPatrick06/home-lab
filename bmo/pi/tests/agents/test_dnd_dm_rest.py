"""PHASE-15 15B/15C — DM rest resolution persistence + no inert tools grant.

Imports the REAL ``agents.dnd_dm`` (sibling files mock the ``agents`` package and ``agent``
core at import time). The fixture snapshots/pops the conflicting sys.modules entries, stubs
the heavy ``agent`` core + ``agents.vtt_sync`` (dnd_dm imports names from both), imports
dnd_dm fresh against a tmp gamestate path, then restores the snapshot.
"""

import importlib
import json
import sys
import types
from unittest.mock import MagicMock

import pytest

_AGENT_IMPORT_NAMES = (
    "COMMAND_INSTRUCTION",
    "DND_DATA_DIR",
    "GAMESTATE_DIR",
    "GAMESTATE_FILE",
    "MAP_ENVIRONMENTS",
    "OLLAMA_PLAN_OPTIONS",
    "_build_dm_data_context",
    "_calculate_encounter_difficulty",
    "_discover_maps",
    "_load_character_file",
    "_load_monster_stat_block",
    "_summarize_character",
)


@pytest.fixture()
def dnd_dm(tmp_path):
    snap = {
        k: v for k, v in sys.modules.items() if k == "agents" or k.startswith("agents.") or k == "agent"
    }
    for k in list(snap):
        del sys.modules[k]

    gamestate_file = tmp_path / "gamestate.json"
    agent_stub = types.ModuleType("agent")
    for name in _AGENT_IMPORT_NAMES:
        setattr(agent_stub, name, MagicMock())
    agent_stub.GAMESTATE_DIR = str(tmp_path)
    agent_stub.GAMESTATE_FILE = str(gamestate_file)
    sys.modules["agent"] = agent_stub

    vtt_stub = types.ModuleType("agents.vtt_sync")
    vtt_stub.push_discord_message = MagicMock()
    sys.modules["agents.vtt_sync"] = vtt_stub

    try:
        module = importlib.import_module("agents.dnd_dm")
        module._GAMESTATE_FILE_FOR_TEST = gamestate_file  # convenience handle for assertions
        yield module
    finally:
        for k in [k for k in list(sys.modules) if k == "agents" or k.startswith("agents.") or k == "agent"]:
            del sys.modules[k]
        sys.modules.update(snap)


def _make_agent(dnd_dm):
    return dnd_dm.create_dnd_dm_agent(MagicMock(), MagicMock(), None)


def _seed(agent_obj):
    agent_obj._gamestate = {
        "date": "2026-06-10",
        "characters": {
            "Yorick": {
                "hp": 3,
                "hp_max": 27,
                "hit_dice_max": 4,
                "hit_dice_remaining": 1,
                "spell_slots": {"1": 0},
                "conditions": ["poisoned"],
            }
        },
    }


def test_long_rest_mutates_and_saves(dnd_dm):
    agent_obj = _make_agent(dnd_dm)
    _seed(agent_obj)
    text = agent_obj._resolve_long_rest("Yorick")

    char = agent_obj._gamestate["characters"]["Yorick"]
    assert char["hp"] == 27
    assert char["conditions"] == []
    assert "spell_slots" not in char
    assert char["hit_dice_remaining"] == 3  # recover max(1, 4//2)=2 → 1+2
    assert "Applied to the saved game state" in text

    saved = json.loads(dnd_dm._GAMESTATE_FILE_FOR_TEST.read_text())
    assert saved["characters"]["Yorick"]["hp"] == 27
    assert saved["characters"]["Yorick"]["hit_dice_remaining"] == 3
    assert "spell_slots" not in saved["characters"]["Yorick"]


def test_long_rest_case_insensitive_name(dnd_dm):
    agent_obj = _make_agent(dnd_dm)
    _seed(agent_obj)
    agent_obj._resolve_long_rest("yorick")  # lowercase directive
    assert agent_obj._gamestate["characters"]["Yorick"]["hp"] == 27


def test_long_rest_unknown_character_is_read_only(dnd_dm):
    agent_obj = _make_agent(dnd_dm)
    _seed(agent_obj)
    text = agent_obj._resolve_long_rest("Nobody")
    assert "Nobody" not in agent_obj._gamestate["characters"]  # no phantom record
    assert not dnd_dm._GAMESTATE_FILE_FOR_TEST.exists()  # nothing written
    assert "```gamestate```" in text


def test_short_rest_is_read_only_but_instructs_persistence(dnd_dm):
    agent_obj = _make_agent(dnd_dm)
    _seed(agent_obj)
    before = json.dumps(agent_obj._gamestate, sort_keys=True)
    text = agent_obj._resolve_short_rest("Yorick")
    assert json.dumps(agent_obj._gamestate, sort_keys=True) == before  # unchanged
    assert not dnd_dm._GAMESTATE_FILE_FOR_TEST.exists()  # no write
    assert "```gamestate```" in text
    assert "hit_dice_remaining" in text


def test_dm_agent_declares_no_tools(dnd_dm):
    # PHASE-15 15C — run() has no tool loop (plain llm_call), so the config must not
    # advertise tools the agent can never execute.
    agent_obj = _make_agent(dnd_dm)
    assert agent_obj.config.tools == []
