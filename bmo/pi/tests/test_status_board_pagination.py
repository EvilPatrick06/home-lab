"""Tests for the paginated awaiting-approval rows + the never-crash board render.

Discord's Components-V2 layout has a hard 40-component limit; per-item
Approve/Deny/Other buttons made a large awaiting-approval backlog overflow it
and crash-loop the reconciler. The fixes under test:

  - build_layout_safe / _add_section NEVER raise — any exception (corrupt rows,
    component-budget overflow) degrades to a tiny always-valid view or a
    skipped section instead of a crash loop;
  - awaiting-approval rows paginate (BOARD_AWAITING_PER_PAGE, default 5) with
    ◀ Prev / Next ▶ nav buttons, the current page persisted in BoardState;
  - the TOTAL component count stays strictly under 40 on EVERY page, while
    later sections (Today/Info) keep their minimum footprint;
  - every awaiting item is reachable via some page, and a button click on ANY
    page still routes to the right item_id + session_id.
"""
import json
import os
import time
import types

from bots.social import status_board_cog as cog
from services import status_board as sb


# ── helpers ──────────────────────────────────────────────────────────────────

def _await_row(i, sid=None, sev="warning"):
    iid = f"issue:{i}"
    return {"category": "agent", "severity": sev, "title": f"resolver: item {i}",
            "detail": "WAIT-class item — implement on approve",
            "since": time.time(), "due": None, "url": None, "kind": "item",
            "key": iid, "id": iid, "source": "bmo-resolver",
            "session_id": sid if sid is not None else f"local_s{i}"}


def _info_row(key="note"):
    return {"category": "info", "severity": "info", "title": "FYI note",
            "detail": "informational", "since": time.time(), "due": None,
            "url": None, "kind": "item", "key": key, "id": key, "source": "cal"}


def _incident_row(key="svc_bmo"):
    return {"category": "incident", "severity": "critical", "title": "🏠 BMO service",
            "detail": "down", "since": time.time(), "due": None, "url": None,
            "kind": "incident", "key": key, "id": None, "source": None}


def _state(page=0):
    return types.SimpleNamespace(collapse_info=False, muted={}, awaiting_page=page)


def _walk(view):
    out = []

    def rec(items):
        for it in items or []:
            out.append(it)
            rec(getattr(it, "children", None))

    rec(getattr(view, "children", None))
    return out


def _count(view):
    return len(_walk(view))


def _custom_ids(view):
    return [it.custom_id for it in _walk(view) if getattr(it, "custom_id", None)]


def _approve_targets(view):
    """(item_id, session_id) pairs decoded from the Approve buttons on a view."""
    out = []
    for cid in _custom_ids(view):
        if cid.startswith("board:apv:"):
            sid, iid = cid[len("board:apv:"):].split("~", 1)
            out.append((iid, sid))
    return out


def _texts(view):
    return [getattr(it, "content", "") or "" for it in _walk(view)]


# ── (a) fail-safe: the builder never raises ──────────────────────────────────

def test_build_layout_safe_never_raises_on_pathological_state():
    pathological = [
        (None, None),                                   # no rows, no state
        ("not-a-list", object()),                       # wrong types entirely
        ([{}], _state()),                               # row missing every key
        ([{"category": "agent"}], _state()),            # missing severity/title
        ([{"category": "agent", "severity": "bogus",    # unknown severity
           "title": None, "session_id": "s", "id": None}], _state()),
        ([_await_row(1)], types.SimpleNamespace()),     # state missing attrs
        ([{"category": 42, "severity": ["x"], "title": {}}], _state()),
    ]
    for rows, state in pathological:
        view = cog.build_layout_safe(rows, state)       # must NOT raise
        assert isinstance(view, cog.discord.ui.LayoutView)


def test_build_layout_safe_degraded_view_is_tiny_and_valid():
    view = cog.build_layout_safe("garbage", None)
    assert _count(view) >= 1
    assert _count(view) < 40
    assert any("rendering error" in t for t in _texts(view))


def test_build_layout_safe_passes_through_good_state():
    view = cog.build_layout_safe([_await_row(1)], _state())
    assert any("BMO Status Board" in t for t in _texts(view))
    assert any(c.startswith("board:apv:") for c in _custom_ids(view))


def test_add_section_swallows_value_error():
    class _FullView:
        def add_item(self, item):
            raise ValueError("maximum number of children exceeded")

    assert cog._add_section(_FullView(), object()) is False


def test_add_section_adds_when_it_fits():
    view = cog.discord.ui.LayoutView(timeout=None)
    assert cog._add_section(view, cog.discord.ui.TextDisplay("hi")) is True
    assert _count(view) == 1


def test_build_current_view_never_raises_even_if_state_derivation_blows_up(monkeypatch):
    board = cog.StatusBoardCog.__new__(cog.StatusBoardCog)  # no bot needed
    board._cached_extra = []
    board._mc_down = False

    def _boom(*a, **k):
        raise RuntimeError("corrupt monitor state")

    monkeypatch.setattr(cog.sb, "_read_json", _boom)
    monkeypatch.setattr(cog.os.path, "exists", lambda p: True)
    view = board.build_current_view()                   # must NOT raise
    assert isinstance(view, cog.discord.ui.LayoutView)
    assert _count(view) >= 1


# ── (b) pagination: component budget on every page ───────────────────────────

def test_under_40_components_on_every_page_with_200_awaiting_items():
    rows = [_await_row(i) for i in range(200)]
    for page in range(0, 60):                           # past the last page too
        view = cog.build_layout(rows, _state(page))
        assert _count(view) < 40, f"page {page} rendered {_count(view)} components"


def test_under_40_components_with_200_awaiting_plus_other_sections():
    rows = ([_incident_row(f"svc_{i}") for i in range(5)]
            + [_await_row(i) for i in range(200)]
            + [_info_row(f"note{i}") for i in range(5)])
    for page in range(0, 45):
        view = cog.build_layout(rows, _state(page))
        assert _count(view) < 40, f"page {page} rendered {_count(view)} components"


def test_later_sections_keep_minimum_footprint_on_every_page():
    rows = ([_incident_row()] + [_await_row(i) for i in range(200)] + [_info_row()])
    for page in (0, 1, 20, 39):
        texts = _texts(cog.build_layout(rows, _state(page)))
        assert any("🚨 Incidents" in t for t in texts), f"page {page} lost Incidents"
        assert any("💡 Info" in t for t in texts), f"page {page} lost Info"


def test_env_default_page_size_is_five():
    assert sb.AWAITING_PER_PAGE == int(os.environ.get("BOARD_AWAITING_PER_PAGE", "5"))


def test_page_size_respects_awaiting_per_page(monkeypatch):
    monkeypatch.setattr(sb, "AWAITING_PER_PAGE", 3)
    rows = [_await_row(i) for i in range(10)]
    view = cog.build_layout(rows, _state(0))
    assert len(_approve_targets(view)) == 3


def test_single_page_has_no_nav_buttons():
    view = cog.build_layout([_await_row(1), _await_row(2)], _state(0))
    assert not any(c.startswith("board:apage:") for c in _custom_ids(view))
    assert len(_approve_targets(view)) == 2


def _btn_disabled(b):
    d = getattr(b, "disabled", None)
    if d is None:
        d = getattr(getattr(b, "item", None), "disabled", None)
    return d


def _nav_buttons(view):
    return {str(getattr(b, "custom_id", "")): b for b in _walk(view)
            if str(getattr(b, "custom_id", "")).startswith("board:apage:")}


def test_multi_page_has_nav_buttons_with_edge_disabling():
    rows = [_await_row(i) for i in range(12)]           # 3 pages at 5/page
    nav = _nav_buttons(cog.build_layout(rows, _state(0)))
    assert set(nav) == {"board:apage:prev", "board:apage:next"}
    assert _btn_disabled(nav["board:apage:prev"]) is True
    assert _btn_disabled(nav["board:apage:next"]) is False
    nav = _nav_buttons(cog.build_layout(rows, _state(2)))
    assert _btn_disabled(nav["board:apage:prev"]) is False
    assert _btn_disabled(nav["board:apage:next"]) is True


def test_out_of_range_page_clamps_to_last_page():
    rows = [_await_row(i) for i in range(12)]           # pages 0..2 at 5/page
    state = _state(99)
    view = cog.build_layout(rows, state)
    assert {iid for iid, _ in _approve_targets(view)} == {"issue:10", "issue:11"}
    assert state.awaiting_page == 2                     # clamped page written back


def test_clamp_page_and_page_slice_pure_helpers():
    assert sb.clamp_page(0, 0, 5) == 0
    assert sb.clamp_page(7, 12, 5) == 2
    assert sb.clamp_page(-3, 12, 5) == 0
    assert sb.clamp_page("garbage", 12, 5) == 0
    assert sb.clamp_page(None, 12, 5) == 0
    assert sb.page_slice(list(range(12)), 2, 5) == [10, 11]
    assert sb.page_slice(list(range(12)), 0, 0) == list(range(12))


# ── (b) pagination: full reachability ────────────────────────────────────────

def test_every_awaiting_item_reachable_via_some_page():
    n = 200
    rows = [_await_row(i) for i in range(n)]
    seen = set()
    for page in range(0, n):                            # generous upper bound
        view = cog.build_layout(rows, _state(page))
        targets = _approve_targets(view)
        assert targets, f"page {page} rendered no approve buttons"
        before = len(seen)
        seen.update(iid for iid, _ in targets)
        if len(seen) == n:
            break
        if len(seen) == before and page > 0:
            break                                       # clamped: no new items past the end
    assert seen == {f"issue:{i}" for i in range(n)}


def test_page_state_round_trips_through_board_state(tmp_path, monkeypatch):
    monkeypatch.setattr(sb, "BOARD_STATE", str(tmp_path / "state.json"))
    st = sb.BoardState()
    st.awaiting_page = 7
    st.save()
    assert sb.BoardState.load().awaiting_page == 7


# ── (b)+(c) routing: a click on a page-2 item hits the right item/session ────

class _FakeResponse:
    def __init__(self):
        self.deferred = False

    async def defer(self):
        self.deferred = True

    async def edit_message(self, **kwargs):
        pass

    async def send_message(self, *a, **k):
        pass


class _FakeFollowup:
    def __init__(self):
        self.sent = []

    async def send(self, content="", **k):
        self.sent.append(content)


class _FakeClient:
    def get_cog(self, name):
        return None


class _FakeInteraction:
    def __init__(self):
        self.response = _FakeResponse()
        self.followup = _FakeFollowup()
        self.client = _FakeClient()


def test_page_two_buttons_encode_correct_item_and_session():
    rows = [_await_row(i) for i in range(12)]           # page 1 = items 5..9
    view = cog.build_layout(rows, _state(1))
    assert dict(_approve_targets(view)) == {f"issue:{i}": f"local_s{i}" for i in range(5, 10)}


async def test_click_on_page_two_item_routes_to_correct_item(tmp_path, monkeypatch):
    inbox_path = tmp_path / "board_inbox.json"
    out_path = tmp_path / "board_decisions_outbox.jsonl"
    monkeypatch.setattr(sb, "BOARD_INBOX", str(inbox_path))
    monkeypatch.setattr(sb, "BOARD_DECISIONS", str(out_path))
    now = time.time()
    seed = {"bmo-resolver": [
        {"id": f"issue:{i}", "source": "bmo-resolver", "category": "agent",
         "title": f"resolver: item {i}", "session_id": f"local_s{i}",
         "severity": "warning", "detail": "", "url": None, "due": None,
         "created": now, "seen": now} for i in range(12)]}
    inbox_path.write_text(json.dumps(seed), encoding="utf-8")

    # Render page 2 (index 1) and simulate clicking its Approve button exactly
    # as Discord would rebuild it — from the custom_id the view encoded.
    rows = [_await_row(i) for i in range(12)]
    view = cog.build_layout(rows, _state(1))
    iid, sid = sorted(_approve_targets(view))[2]        # a mid-page item
    btn = cog.ApproveButton(iid, sid)
    await btn.callback(_FakeInteraction())

    rec = json.loads(out_path.read_text(encoding="utf-8").strip())
    assert rec["decision"] == "approve"
    assert rec["item_id"] == iid
    assert rec["session_id"] == sid
    assert rec["session_id"] == f"local_s{iid.split(':')[1]}"
    remaining = json.loads(inbox_path.read_text(encoding="utf-8"))
    assert iid not in [i["id"] for items in remaining.values() for i in items]


async def test_nav_button_advances_and_persists_page():
    saves = []
    state = types.SimpleNamespace(collapse_info=False, muted={}, awaiting_page=0,
                                  save=lambda: saves.append(True))
    fake_cog = types.SimpleNamespace(
        state=state,
        build_current_view=lambda: cog.build_layout(
            [_await_row(i) for i in range(12)], state))

    class _Client:
        def get_cog(self, name):
            return fake_cog

    inter = _FakeInteraction()
    inter.client = _Client()
    await cog.AwaitingPageButton("next").callback(inter)
    assert state.awaiting_page == 1
    assert saves                                        # page persisted
    view = cog.build_layout([_await_row(i) for i in range(12)], state)
    assert {iid for iid, _ in _approve_targets(view)} == {f"issue:{i}" for i in range(5, 10)}

    await cog.AwaitingPageButton("prev").callback(inter)
    assert state.awaiting_page == 0
    inter2 = _FakeInteraction()
    inter2.client = _Client()
    await cog.AwaitingPageButton("prev").callback(inter2)
    assert state.awaiting_page == 0                     # floor at page 0
