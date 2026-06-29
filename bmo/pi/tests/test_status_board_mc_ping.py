"""Tests for the 'ping the owner' button on the 🎮 Minecraft-server-down board item.

A friend can click it to alert the owner (via notify.sh) that the CobbleVerse MC
server needs a restart. Covers: button only renders when the MC item is present,
the cooldown/debounce decision, and that notify.sh is invoked with the stable
`<sev> <subject> <body>` signature.
"""
import time
import types

from bots.social import status_board_cog as cog
from services import status_board as sb


def _mc_row():
    now = time.time()
    return {"category": "info", "severity": "warning", "title": "🎮 Minecraft server down",
            "detail": "laptop is online but the MC port (25565) is not responding",
            "since": now, "due": None, "url": None, "kind": "item",
            "key": "mc", "id": "mc", "source": "mc"}


def _other_info_row():
    return {"category": "info", "severity": "info", "title": "🗓️ Some FYI",
            "detail": "not minecraft", "since": time.time(), "due": None, "url": None,
            "kind": "item", "key": "fyi", "id": "fyi", "source": "fyi"}


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
    return types.SimpleNamespace(collapse_info=False, muted={})


# ── rendering ────────────────────────────────────────────────────────────────

def test_ping_button_renders_when_mc_down():
    view = cog.build_layout([_mc_row()], _state())
    assert "board:pingmc" in _custom_ids(view)


def test_no_ping_button_without_mc_item():
    view = cog.build_layout([_other_info_row()], _state())
    assert "board:pingmc" not in _custom_ids(view)


def test_no_info_section_no_ping_button():
    # incident-only board → no info section at all → no ping button.
    row = {"category": "incident", "severity": "critical", "title": "X", "detail": "",
           "since": time.time(), "due": None, "url": None, "key": "x", "id": "x", "source": "x"}
    view = cog.build_layout([row], _state())
    assert "board:pingmc" not in _custom_ids(view)


def test_ping_button_identity():
    btn = cog.PingOwnerButton()
    assert btn.item.custom_id == "board:pingmc"


# ── cooldown/debounce decision ───────────────────────────────────────────────

def test_decision_up_when_not_down():
    assert cog._mc_ping_decision(now=100.0, ping_until=0.0, mc_down=False) == "up"


def test_decision_ping_when_down_and_cold():
    assert cog._mc_ping_decision(now=100.0, ping_until=0.0, mc_down=True) == "ping"


def test_decision_cooldown_blocks_repeat():
    now = 100.0
    assert cog._mc_ping_decision(now=now, ping_until=now + 60, mc_down=True) == "cooldown"


def test_decision_ping_again_after_cooldown_expires():
    now = 1000.0
    assert cog._mc_ping_decision(now=now, ping_until=now - 1, mc_down=True) == "ping"


# ── notify.sh invocation ─────────────────────────────────────────────────────

def test_send_owner_mc_ping_invokes_notify(monkeypatch, tmp_path):
    fake = tmp_path / "notify.sh"
    fake.write_text("#!/usr/bin/env bash\nexit 0\n")
    monkeypatch.setattr(cog, "NOTIFY_SH", str(fake))
    calls = {}

    def fake_run(argv, **kw):
        calls["argv"] = argv
        calls["env"] = kw.get("env")
        return types.SimpleNamespace(returncode=0)

    monkeypatch.setattr(cog.subprocess, "run", fake_run)
    assert cog._send_owner_mc_ping() is True
    assert calls["argv"][0] == str(fake)
    assert calls["argv"][1] == "warn"
    assert calls["argv"][2] == "Minecraft server down"
    # routed to the actionable 'Needs you' section, not a non-actionable FYI.
    assert calls["env"]["NOTIFY_BOARD_CATEGORY"] == "attention"


def test_send_owner_mc_ping_false_when_notifier_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(cog, "NOTIFY_SH", str(tmp_path / "does-not-exist.sh"))
    called = {"n": 0}

    def fake_run(*a, **k):
        called["n"] += 1

    monkeypatch.setattr(cog.subprocess, "run", fake_run)
    assert cog._send_owner_mc_ping() is False
    assert called["n"] == 0  # never shells out when the notifier is absent


# sanity: the MC info row uses a severity the renderer knows about.
def test_mc_row_severity_known():
    assert "warning" in sb.SEV_DOT
