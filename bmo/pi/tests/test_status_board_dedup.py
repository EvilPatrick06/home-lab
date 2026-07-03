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



# ── regression: cross-source id collision must not produce duplicate custom_ids ─
# Several producers post a brief with the SAME item id "overview"
# (evening-winddown, morning-brief, weekly-digest). Encoding only the id in the
# ✓ Done button custom_id produced three identical "board:done:overview" ids,
# which Discord rejects with 400 "Component custom id cannot be duplicated" —
# blanking/crash-looping the whole board. The button custom_id must be scoped by
# source so every rendered component is unique, and mark_done(source=...) must
# clear exactly the clicked row.
import types as _types

from bots.social import status_board_cog as _cog
from services import status_board as _sb


def _brief_row(source, iid="overview", title="brief"):
    import time as _t
    return {"category": "brief", "severity": "info", "title": title, "detail": "",
            "since": _t.time(), "due": None, "url": None, "kind": "item",
            "key": iid, "id": iid, "source": source}


def _all_custom_ids(view):
    out = []
    walk = getattr(view, "walk_children", None)
    if callable(walk):
        for c in walk():
            cid = getattr(c, "custom_id", None)
            if cid:
                out.append(cid)
        return out

    def rec(items):
        for it in items or []:
            cid = getattr(it, "custom_id", None)
            if cid:
                out.append(cid)
            rec(getattr(it, "children", None))

    rec(getattr(view, "children", None))
    return out


def test_same_id_across_sources_yields_unique_done_custom_ids():
    rows = [_brief_row("evening-winddown", title="🌙 tomorrow"),
            _brief_row("morning-brief", title="☀️ morning"),
            _brief_row("weekly-digest", title="📈 week")]
    state = _types.SimpleNamespace(collapse_info=False, muted={}, awaiting_page=0)
    view = _cog.build_layout_safe(rows, state)
    cids = _all_custom_ids(view)
    done = [c for c in cids if c.startswith("board:done:")]
    assert len(done) == 3, f"expected 3 Done buttons, got {done}"
    assert len(set(cids)) == len(cids), f"duplicate custom_id(s) rendered: {cids}"


def test_done_button_source_scoped_custom_id_and_routing():
    b = _cog.DoneButton("overview", "morning-brief")
    assert b.custom_id == "board:done:morning-brief~overview"
    inbox = {"morning-brief": {"overview": _sb.Item(id="overview", source="morning-brief",
                                                     category="brief", title="m")},
             "weekly-digest": {"overview": _sb.Item(id="overview", source="weekly-digest",
                                                    category="brief", title="w")}}
    # source-scoped mark_done clears ONLY the clicked source's copy.
    assert _sb.mark_done(inbox, "overview", "morning-brief") is True
    assert "overview" not in inbox["morning-brief"]
    assert "overview" in inbox["weekly-digest"]


def test_mark_done_legacy_idonly_falls_back_to_global_sweep():
    inbox = {"weekly-digest": {"overview": _sb.Item(id="overview", source="weekly-digest",
                                                    category="brief", title="w")}}
    # a legacy (source-less) click still clears the item.
    assert _sb.mark_done(inbox, "overview", None) is True
    assert "overview" not in inbox["weekly-digest"]


def test_dedupe_guard_neutralises_leftover_duplicate_custom_ids():
    # belt-and-braces: even if two buttons somehow share a custom_id, the guard
    # disables the repeat so the payload stays valid (no 400).
    view = _cog.discord.ui.LayoutView(timeout=None)
    row = _cog.discord.ui.ActionRow(
        _cog.discord.ui.Button(label="a", custom_id="board:x"),
        _cog.discord.ui.Button(label="b", custom_id="board:x"))
    view.add_item(row)
    fixed = _cog._dedupe_custom_ids(view)
    assert fixed == 1
    cids = _all_custom_ids(view)
    assert len(set(cids)) == len(cids), cids
