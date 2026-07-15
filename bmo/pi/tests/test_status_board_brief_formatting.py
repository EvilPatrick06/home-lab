"""Briefs render cleanly on the Components-V2 board (no raw markup).

Regression guard for the "📋 Briefs section renders RAW markup" bug. Two root
causes, both proven here:

  1. ``<t:unix:R>`` dynamic-timestamp tokens do NOT render inside a
     Components-V2 TextDisplay (only in classic message content / embeds), so
     ``_line`` emitting ``· <t:{since}:R>`` showed the literal token. The fix
     computes a plain relative string (``_rel_ts``) instead.

  2. A brief whose detail carried an UNCLOSED inline-code backtick — the real
     ``📅 calendar unavailable`` item, whose reauth command was truncated
     mid-snippet by ``str(ex)[:120]`` leaving one lone backtick — opened a code
     span that swallowed every following brief line in the same TextDisplay,
     making their ``**bold**`` titles and ``<t:…>`` tokens show literally.
     ``_safe_v2`` balances the span so the bleed stops.
"""
import time
import types

from bots.social import status_board_cog as cog


def _brief(key, title, detail="", since=None):
    return {"category": "brief", "severity": "info", "title": title,
            "detail": detail, "since": since if since is not None else time.time(),
            "due": None, "url": None, "kind": "item", "key": key, "id": key,
            "source": "morning-brief"}


# The exact live-inbox detail that caused the bleed: reauth command truncated
# mid-snippet, leaving a single unclosed backtick.
_REAUTH = ("Google Calendar refresh failed (token revoked or expired). "
           "Re-authorize: `cd ~/home-lab/bmo/pi && ./venv/bin/python serv")


def test_rel_ts_is_plain_and_never_a_discord_token():
    assert "<t:" not in cog._rel_ts(time.time() - 13 * 3600)
    assert cog._rel_ts(time.time() - 13 * 3600) == "13h ago"
    assert cog._rel_ts(time.time() + 5 * 3600 + 90) == "in 5h"
    assert cog._rel_ts(time.time()) == "just now"
    assert cog._rel_ts("bogus") == ""      # bad input degrades, never raises


def test_safe_v2_strips_timestamp_tokens_and_balances_backticks():
    assert "<t:" not in cog._safe_v2("open <t:1784080803:R> now")
    # odd backtick count gets balanced (closed)
    assert cog._safe_v2(_REAUTH).count("`") % 2 == 0
    # an already-balanced snippet is left intact
    assert cog._safe_v2("run `foo` now").count("`") == 2


def test_brief_line_has_no_raw_markup():
    line = cog._line(_brief("cal:err", "📅 calendar unavailable", _REAUTH,
                            since=time.time() - 3600), detail_max=1500)
    assert "<t:" not in line                 # no raw timestamp token
    assert line.count("`") % 2 == 0          # no unclosed code span
    assert line.count("**") % 2 == 0         # bold markers balanced
    assert "1h ago" in line                  # relative age rendered as plain text


def test_briefs_section_renders_without_codeblock_bleed():
    """The calendar item's unclosed backtick must not bleed into the PR briefs
    that follow it in the SAME concatenated TextDisplay."""
    rows = [
        _brief("cal:err", "📅 calendar unavailable", _REAUTH, since=time.time() - 3600),
        _brief("pr:68", "🔀 Open PR #68 build(deps): bump the actions group",
               "awaiting review/merge", since=time.time() - 7200),
        _brief("pr:67", "🔀 Open PR #67 build(deps): bump npm-deps",
               "awaiting review/merge", since=time.time() - 7200),
    ]
    state = types.SimpleNamespace(collapse_info=False, muted={}, awaiting_page=0)
    view = cog.build_layout(rows, state)

    texts = []

    def rec(items):
        for it in items or []:
            texts.append(getattr(it, "content", "") or "")
            rec(getattr(it, "children", None))

    rec(getattr(view, "children", None))
    blob = "\n".join(texts)

    assert "<t:" not in blob                  # no raw timestamp tokens anywhere
    assert blob.count("`") % 2 == 0           # every code span is closed
    # both PR titles are present and their bold markers survive (not eaten by a
    # bleeding code span from the calendar item above them)
    assert "Open PR #68" in blob
    assert "Open PR #67" in blob
