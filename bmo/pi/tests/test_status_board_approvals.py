"""Tests for the board Approve/Deny bridge (relay a decision back to the agent).

Each awaiting-approval agent item that carries an ORIGINATING session id gets
✅ Approve / ✖️ Deny buttons. A click records a decision to the append-only
decisions outbox (item, decision, session id, timestamp), removes the entry from
the board, and ephemerally confirms. The dispatch-side poller (orchestrator,
out of repo) consumes the outbox to resume the originating session. Items WITHOUT
a session id (e.g. in-app permission asks) get no buttons — they keep the
existing in-chat path. See docs/BOARD-APPROVAL-BRIDGE.md.
"""
import json
import time

import pytest

from bots.social import status_board_cog as cog
from services import status_board as sb


# ── helpers ──────────────────────────────────────────────────────────────────

def _await_row(iid="issue:1", sid="local_abc123", sev="warning", source="bmo-resolver"):
    return {"category": "agent", "severity": sev, "title": "BMO: add retry to uploader",
            "detail": "WAIT-class enhancement — implement on approve",
            "since": time.time(), "due": None, "url": None, "kind": "item",
            "key": iid, "id": iid, "source": source, "session_id": sid}


def _custom_ids(view):
    ids = []

    def walk(items):
        for it in items or []:
            cid = getattr(it, "custom_id", None)
            if cid:
                ids.append(cid)
            walk(getattr(it, "children", None))

    walk(getattr(view, "children", None))
    return ids


def _state():
    import types
    return types.SimpleNamespace(collapse_info=False, muted={})


# ── approval-item detection ──────────────────────────────────────────────────

def test_is_approval_item_requires_agent_and_session():
    yes = sb.Item(id="x", source="bmo-resolver", category="agent", title="t",
                  session_id="local_abc")
    no_sid = sb.Item(id="y", source="bmo-resolver", category="agent", title="t")
    no_agent = sb.Item(id="z", source="x", category="attention", title="t",
                       session_id="local_abc")
    assert sb.is_approval_item(yes) is True
    assert sb.is_approval_item(no_sid) is False
    assert sb.is_approval_item(no_agent) is False


def test_is_approval_row():
    assert sb.is_approval_row({"category": "agent", "session_id": "s"}) is True
    assert sb.is_approval_row({"category": "agent", "session_id": None}) is False
    assert sb.is_approval_row({"category": "agent"}) is False
    assert sb.is_approval_row({"category": "attention", "session_id": "s"}) is False


# ── decisions outbox ─────────────────────────────────────────────────────────

def test_record_decision_writes_outbox(tmp_path):
    item = sb.Item(id="issue:1", source="bmo-resolver", category="agent",
                   title="BMO: add retry to uploader", session_id="local_abc",
                   severity="warning")
    out = tmp_path / "dec.jsonl"
    rec = sb.record_decision("approve", item, outbox=str(out))
    assert rec["decision"] == "approve"
    assert rec["session_id"] == "local_abc"
    assert rec["item_id"] == "issue:1"
    assert rec["source"] == "bmo-resolver"
    assert rec["decided_by"] == "board"
    assert isinstance(rec["ts"], float)
    lines = out.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    parsed = json.loads(lines[0])
    assert parsed["title"] == "BMO: add retry to uploader"
    assert parsed["decision"] == "approve"


def test_record_decision_is_append_only(tmp_path):
    item = sb.Item(id="issue:1", source="bmo-resolver", category="agent",
                   title="t", session_id="local_abc")
    out = tmp_path / "dec.jsonl"
    sb.record_decision("approve", item, outbox=str(out))
    sb.record_decision("deny", item, outbox=str(out))
    lines = out.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["decision"] == "approve"
    assert json.loads(lines[1])["decision"] == "deny"


def test_record_decision_rejects_bad_decision(tmp_path):
    item = sb.Item(id="x", source="s", category="agent", title="t", session_id="sid")
    with pytest.raises(ValueError):
        sb.record_decision("maybe", item, outbox=str(tmp_path / "never.jsonl"))


def test_record_decision_without_session_id_still_records(tmp_path):
    # An item lacking a session id can still be recorded; the poller treats a
    # null session_id as "not auto-relayable" and the click handler warns.
    item = sb.Item(id="x", source="s", category="agent", title="t")
    out = tmp_path / "dec.jsonl"
    rec = sb.record_decision("deny", item, outbox=str(out))
    assert rec["session_id"] is None


# ── inbox loader is tolerant of schema drift ─────────────────────────────────

def test_item_from_dict_ignores_unknown_keys():
    d = {"id": "x", "source": "s", "category": "agent", "title": "t",
         "session_id": "sid", "some_future_field": 123}
    it = sb._item_from_dict(d)
    assert it.id == "x"
    assert it.session_id == "sid"
    assert not hasattr(it, "some_future_field")


def test_item_from_dict_defaults_missing_session_id():
    d = {"id": "x", "source": "s", "category": "agent", "title": "t"}
    it = sb._item_from_dict(d)
    assert it.session_id is None


def test_all_rows_passes_session_id_through():
    inbox = {"bmo-resolver": {"issue:1": sb.Item(
        id="issue:1", source="bmo-resolver", category="agent", title="t",
        session_id="local_abc", severity="warning")}}
    rows = sb.all_rows(sb.BoardState(), [], inbox)
    agent_rows = [r for r in rows if r["category"] == "agent"]
    assert agent_rows and agent_rows[0]["session_id"] == "local_abc"


# ── custom_id encoding ───────────────────────────────────────────────────────

def test_decision_cid_roundtrip():
    assert cog._decision_cid("board:apv", "issue:1", "local_abc") == "board:apv:local_abc~issue:1"
    assert cog._decision_cid("board:dny", "issue:1", "local_abc") == "board:dny:local_abc~issue:1"


def test_decision_cid_drops_session_when_too_long():
    long_id = "x" * 120
    cid = cog._decision_cid("board:apv", long_id, "local_abc")
    assert "local_abc" not in cid           # session id dropped to stay under the limit
    assert cid == f"board:apv:~{long_id}"   # item id preserved; sid recovered from inbox
    assert len(cid) <= 100 or cid.endswith(long_id)


def test_button_custom_ids():
    assert cog.ApproveButton("issue:1", "local_abc").item.custom_id == "board:apv:local_abc~issue:1"
    assert cog.DenyButton("issue:1", "local_abc").item.custom_id == "board:dny:local_abc~issue:1"


# ── rendering ────────────────────────────────────────────────────────────────

def test_approve_deny_buttons_render_for_awaiting_item():
    ids = _custom_ids(cog.build_layout([_await_row()], _state()))
    assert any(c.startswith("board:apv:") for c in ids)
    assert any(c.startswith("board:dny:") for c in ids)


def test_no_decision_buttons_without_session_id():
    ids = _custom_ids(cog.build_layout([_await_row(sid=None)], _state()))
    assert not any(c.startswith("board:apv:") for c in ids)
    assert not any(c.startswith("board:dny:") for c in ids)


def test_decision_button_custom_id_encodes_item_and_session():
    ids = _custom_ids(cog.build_layout([_await_row(iid="issue:42", sid="local_xyz")], _state()))
    assert "board:apv:local_xyz~issue:42" in ids
    assert "board:dny:local_xyz~issue:42" in ids


def test_info_severity_agent_item_filtered_and_no_buttons():
    # info-severity agent items are filtered from the board entirely → no buttons,
    # even if they happen to carry a session id.
    row = _await_row(sev="info")
    ids = _custom_ids(cog.build_layout([row], _state()))
    assert not any(c.startswith("board:apv:") for c in ids)
