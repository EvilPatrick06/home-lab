"""PHASE-16 16B — services/chat_history.py persistence behavior."""

import json
import types

from services import chat_history


def test_rolling_buffer_caps_at_max(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    monkeypatch.setattr(chat_history, "MAX_RECENT", 5)
    for i in range(8):
        chat_history.save_recent_message({"role": "user", "text": str(i)})
    saved = json.loads((tmp_path / "recent.json").read_text())
    assert len(saved) == 5
    assert [m["text"] for m in saved] == ["3", "4", "5", "6", "7"]  # last 5


def test_pending_stub_then_finalize_replaces_and_strips_incomplete(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    chat_history.set_agent_resolver(lambda: None)  # no DnD log
    chat_history.save_pending_assistant_stub("pid-1")
    assert chat_history.finalize_pending_assistant("pid-1", {"role": "assistant", "text": "done"}) is True
    saved = json.loads((tmp_path / "recent.json").read_text())
    assert len(saved) == 1
    assert saved[0]["text"] == "done"
    assert "incomplete" not in saved[0]
    assert saved[0]["pending_id"] == "pid-1"


def test_finalize_miss_returns_false(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    assert chat_history.finalize_pending_assistant("nope", {"role": "assistant", "text": "x"}) is False


def test_save_chat_message_no_agent_writes_only_recent(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    monkeypatch.setattr(chat_history, "DND_LOG_DIR", str(tmp_path / "dnd"))
    chat_history.set_agent_resolver(lambda: None)
    chat_history.save_chat_message({"role": "user", "text": "hi"})
    assert (tmp_path / "recent.json").exists()
    assert not (tmp_path / "dnd").exists()  # no DnD log without an in-DM agent


def test_save_chat_message_with_dm_agent_also_writes_dnd_log(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    monkeypatch.setattr(chat_history, "DND_LOG_DIR", str(tmp_path / "dnd"))
    chat_history.set_agent_resolver(lambda: types.SimpleNamespace(_dnd_context="some context"))
    chat_history.save_chat_message({"role": "user", "text": "hi"})
    assert (tmp_path / "dnd").exists()
    files = list((tmp_path / "dnd").glob("session_*.json"))
    assert len(files) == 1


# ── PHASE-01 01E — test isolation: persistence can never hit the live store ──

def test_autouse_fixture_redirects_recent_chat_off_live_path():
    # the autouse _isolate_chat_history fixture must have repointed the constant
    assert not chat_history.RECENT_CHAT_FILE.endswith(
        "/home-lab/bmo/pi/data/recent_chat.json"
    )


def test_save_writes_tmp_not_live(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    chat_history.set_agent_resolver(lambda: None)
    chat_history.save_chat_message({"role": "user", "text": "hello"})
    assert (tmp_path / "recent.json").exists()
    saved = json.loads((tmp_path / "recent.json").read_text())
    assert saved[-1]["text"] == "hello"


def test_guard_refuses_real_path_write_under_pytest(monkeypatch):
    # simulate a test that forgot to redirect: point at the real live path and
    # confirm the defense-in-depth guard refuses to write it under pytest.
    import os as _os
    monkeypatch.setattr(
        chat_history, "RECENT_CHAT_FILE",
        _os.path.expanduser("~/home-lab/bmo/pi/data/recent_chat.json"),
    )
    before = (
        _os.path.exists(chat_history.RECENT_CHAT_FILE)
        and _os.path.getmtime(chat_history.RECENT_CHAT_FILE)
    )
    chat_history.save_recent_message({"role": "user", "text": "SHOULD NOT PERSIST"})
    after = (
        _os.path.exists(chat_history.RECENT_CHAT_FILE)
        and _os.path.getmtime(chat_history.RECENT_CHAT_FILE)
    )
    assert before == after  # untouched (guard returned early)
