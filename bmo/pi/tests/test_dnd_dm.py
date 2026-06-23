"""Unit tests for the /api/dnd/dm message builder (routes/chat_api.py)."""

from __future__ import annotations

from routes.chat_api import _build_dm_messages


def test_system_then_user():
    msgs = _build_dm_messages("SYS", "hello", [])
    assert msgs[0] == {"role": "system", "content": "SYS"}
    assert msgs[-1] == {"role": "user", "content": "hello"}


def test_history_roles_filtered_and_bounded():
    history = [
        {"role": "user", "content": "u1"},
        {"role": "assistant", "content": "a1"},
        {"role": "system", "content": "ignore-me"},
        {"role": "tool", "content": "ignore-me-too"},
        {"not": "a turn"},
    ]
    msgs = _build_dm_messages("S", "now", history)
    roles = [m["role"] for m in msgs]
    assert roles == ["system", "user", "assistant", "user"]
    assert "ignore-me" not in [m["content"] for m in msgs]


def test_no_system_when_empty():
    msgs = _build_dm_messages("", "hi", None)
    assert msgs == [{"role": "user", "content": "hi"}]


def test_truncation_caps_lengths():
    from routes.chat_api import _DM_MAX_SYSTEM_LEN, _DM_MAX_TURN_LEN

    big = "x" * (_DM_MAX_SYSTEM_LEN + 500)
    bigturn = "y" * (_DM_MAX_TURN_LEN + 500)
    msgs = _build_dm_messages(big, "go", [{"role": "user", "content": bigturn}])
    assert len(msgs[0]["content"]) == _DM_MAX_SYSTEM_LEN
    assert len(msgs[1]["content"]) == _DM_MAX_TURN_LEN
