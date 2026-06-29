"""Regression tests for the 🤖 Agents dual-key dedup fix.

A single agent must collapse to ONE board entry whether its status arrives via
the generic notify.sh router (source "agent", producer name in the "Name: msg"
title prefix) or via a slug-keyed direct post (source = the agent slug).
"""
import time

from services import status_board as sb

TITLE = "APP QA Tester: permission needed (v2.6.3)"
DETAIL = "Desktop release v2.6.3 has no QA report yet. OK to take over?"


def _item(iid, source, title, sev="warning", seen=0.0):
    return sb.Item(id=iid, source=source, category="agent", title=title,
                   detail=DETAIL, severity=sev, created=1000.0, seen=seen)


def test_agent_identity_collapses_both_paths():
    via_router = sb.agent_identity("agent", TITLE)
    via_slug = sb.agent_identity("app-qa-tester", TITLE)
    assert via_router[0] == via_slug[0] == "app-qa-tester"      # same canonical key
    assert via_router[1] == "APP QA Tester"                      # plain-English label
    assert via_router[2] == "permission needed (v2.6.3)"        # prefix stripped
    assert via_slug == via_router


def test_agent_identity_no_colon_uses_full_title():
    key, label, msg = sb.agent_identity("agent", "ci-failure-triage")
    assert key == "ci-failure-triage"
    assert label == "ci-failure-triage"
    assert msg == ""


def test_group_agent_rows_merges_dual_keyed_status():
    rows = [
        {"category": "agent", "severity": "warning", "source": "agent", "title": TITLE},
        {"category": "agent", "severity": "warning", "source": "app-qa-tester", "title": TITLE},
    ]
    groups = sb.group_agent_rows(rows)
    assert len(groups) == 1
    g = groups[0]
    assert g["key"] == "app-qa-tester"
    assert g["label"] == "APP QA Tester"
    assert g["message"] == "permission needed (v2.6.3)"


def test_group_agent_rows_keeps_distinct_producers():
    rows = [
        {"category": "agent", "severity": "warning", "source": "agent", "title": TITLE},
        {"category": "agent", "severity": "info", "source": "agent",
         "title": "dnd-phase-executer: PHASE-57 implemented"},
    ]
    assert len(sb.group_agent_rows(rows)) == 2


def test_dedupe_agents_clears_cross_source_duplicate():
    inbox = {
        "agent": {"agent:app-qa-tester-permission-needed-v2-6-3":
                  _item("agent:app-qa-tester-permission-needed-v2-6-3", "agent", TITLE, seen=100.0)},
        "app-qa-tester": {"app-qa-tester:permission":
                          _item("app-qa-tester:permission", "app-qa-tester", TITLE, seen=200.0)},
    }
    removed = sb.dedupe_agents(inbox)
    assert removed == 1
    remaining = [it for src in inbox.values() for it in src.values()]
    assert len(remaining) == 1
    # keeps the most-recently-seen copy (the slug source, seen=200)
    assert remaining[0].source == "app-qa-tester"


def test_dedupe_agents_keeps_distinct_messages():
    inbox = {
        "agent": {
            "a": _item("a", "agent", "APP QA Tester: permission needed (v2.6.3)", seen=10.0),
            "b": _item("b", "agent", "APP QA Tester: QA pass failed (v2.6.3)", seen=20.0),
        }
    }
    assert sb.dedupe_agents(inbox) == 0
    assert len(inbox["agent"]) == 2


def test_counts_and_embed_collapse():
    rows = [
        {"category": "agent", "severity": "warning", "source": "agent", "title": TITLE,
         "detail": DETAIL, "since": time.time(), "due": None, "url": None},
        {"category": "agent", "severity": "warning", "source": "app-qa-tester", "title": TITLE,
         "detail": DETAIL, "since": time.time(), "due": None, "url": None},
    ]
    assert sb.agent_keys(rows) == {"app-qa-tester"}
    assert sb.render_topic(rows).count("🤖") == 1
    assert "🤖 1" in sb.render_topic(rows)
    embed = sb.render_embed(rows)
    agent_field = next(f for f in embed["fields"] if "🤖" in f["name"])
    assert agent_field["name"].endswith("· 1")
    assert agent_field["value"].count("APP QA Tester") == 1
