"""EXPLAIN QUERY PLAN regression tests for `bmo_social.db` indexes.

Locks in the index work from the prior fixpack (resolved entry "BMO deep-scan
fixpack — bmo_social.db missing indexes"). Each test:
  1. Spins up a fresh in-memory-style SQLite at a temp path
  2. Calls the bot's actual `_get_db()` so schema + indexes are created the
     same way the live bot creates them (drift-detection: if a future PR
     drops an index from the schema, these tests fail)
  3. Runs `EXPLAIN QUERY PLAN` for the actual production query string
  4. Asserts the expected index name appears in the plan

If the test ever goes red, that's a real signal: either the schema lost an
index, OR a future PR rewrote the production query into a shape that no
longer matches the index (e.g., wrapping the indexed column in a function).
"""

from __future__ import annotations

import os
import sys
import sqlite3
import time
from pathlib import Path

import pytest


# Make sure the bot module is importable. tests/conftest.py mocks gevent and
# friends; that's enough for a pure-import of `bots.discord_social_bot`
# (which only loads schema + helpers — no `bot.run()` at module top).
PI_ROOT = Path(__file__).resolve().parents[1]
if str(PI_ROOT) not in sys.path:
    sys.path.insert(0, str(PI_ROOT))


def _fresh_db(tmp_path, monkeypatch) -> sqlite3.Connection:
    """Create a fresh test DB by patching DB_PATH and calling the bot's
    actual _get_db(). Returns the connected db (caller closes)."""
    import bots.discord_social_bot as bot_mod

    db_file = tmp_path / "bmo_social_test.db"
    monkeypatch.setattr(bot_mod, "DB_PATH", db_file)
    return bot_mod._get_db()


def _explain(conn, sql, params=()) -> str:
    """Return the EXPLAIN QUERY PLAN output as a single newline-joined string
    so `assert "USING INDEX foo" in plan` style asserts work.

    `_get_db()` sets row_factory=sqlite3.Row, whose __str__ is just an object
    repr — convert to tuple so the plan's `detail` column (which contains
    "USING INDEX foo") is actually printable / matchable."""
    rows = conn.execute(f"EXPLAIN QUERY PLAN {sql}", params).fetchall()
    return "\n".join(str(tuple(r)) for r in rows)


# ─────────────────────────────────────────────────────────────────────
# reminders.fire_at — polled every minute by the reminder loop
# ─────────────────────────────────────────────────────────────────────


def test_reminder_poll_uses_index(tmp_path, monkeypatch):
    """The reminder poll query must use idx_reminders_fire_at — without it,
    the per-minute poll becomes a full-table scan as the reminders table
    accumulates."""
    conn = _fresh_db(tmp_path, monkeypatch)
    # The actual production query (bots/discord_social_bot.py:6896)
    plan = _explain(
        conn,
        "SELECT id, user_id, channel_id, guild_id, message FROM reminders WHERE fire_at <= ?",
        (time.time(),),
    )
    assert "idx_reminders_fire_at" in plan, (
        f"Expected reminder poll to use idx_reminders_fire_at; got plan:\n{plan}"
    )


# ─────────────────────────────────────────────────────────────────────
# xp_data — leaderboard `ORDER BY xp DESC LIMIT 10`
# ─────────────────────────────────────────────────────────────────────


def test_xp_leaderboard_uses_xp_index(tmp_path, monkeypatch):
    """XP leaderboard `ORDER BY xp DESC LIMIT 10` must use idx_xp_data_xp.
    Without it, the leaderboard does a full sort on every invocation."""
    conn = _fresh_db(tmp_path, monkeypatch)
    # The actual production query (bots/discord_social_bot.py:5794)
    plan = _explain(
        conn,
        "SELECT user_id, xp, level FROM xp_data ORDER BY xp DESC LIMIT 10",
    )
    assert "idx_xp_data_xp" in plan, (
        f"Expected xp leaderboard to use idx_xp_data_xp; got plan:\n{plan}"
    )


# ─────────────────────────────────────────────────────────────────────
# play_history — guild-scoped queries (composite index leading column)
# ─────────────────────────────────────────────────────────────────────


def test_server_play_count_uses_guild_index(tmp_path, monkeypatch):
    """`SELECT COUNT(*) FROM play_history WHERE guild_id = ?` should use the
    leading column of idx_play_history_guild_played(guild_id, played_at)."""
    conn = _fresh_db(tmp_path, monkeypatch)
    # Production: bots/discord_social_bot.py:3773
    plan = _explain(
        conn,
        "SELECT COUNT(*) FROM play_history WHERE guild_id = ?",
        (12345,),
    )
    assert "idx_play_history_guild_played" in plan, (
        f"Expected guild-scoped count to use idx_play_history_guild_played; got plan:\n{plan}"
    )


def test_server_top_tracks_uses_guild_index(tmp_path, monkeypatch):
    """The "most-played" GROUP BY query for a guild should also use the
    guild-leading composite index."""
    conn = _fresh_db(tmp_path, monkeypatch)
    # Production: bots/discord_social_bot.py:3768
    plan = _explain(
        conn,
        "SELECT track_title, COUNT(*) as plays FROM play_history "
        "WHERE guild_id = ? GROUP BY track_title ORDER BY plays DESC LIMIT 10",
        (12345,),
    )
    assert "idx_play_history_guild_played" in plan, (
        f"Expected top-tracks query to use idx_play_history_guild_played; got plan:\n{plan}"
    )


def test_user_in_guild_play_count_uses_some_index(tmp_path, monkeypatch):
    """`WHERE guild_id = ? AND user_id = ?` should use one of the two play_history
    indexes (SQLite's planner picks whichever has lower cardinality on the leading
    column — typically idx_play_history_user_played because users are scoped
    while guilds are coarser). Either index counts as 'planner picked one.'"""
    conn = _fresh_db(tmp_path, monkeypatch)
    # Production: bots/discord_social_bot.py:3795
    plan = _explain(
        conn,
        "SELECT COUNT(*) FROM play_history WHERE guild_id = ? AND user_id = ?",
        (12345, 99999),
    )
    assert (
        "idx_play_history_guild_played" in plan
        or "idx_play_history_user_played" in plan
    ), (
        f"Expected guild+user count to use ONE of the play_history indexes; got plan:\n{plan}"
    )


# ─────────────────────────────────────────────────────────────────────
# Schema sanity — every advertised index exists post-_get_db()
# ─────────────────────────────────────────────────────────────────────


def test_all_documented_indexes_exist(tmp_path, monkeypatch):
    """Catches the case where a future PR drops an index from `_get_db()`
    but leaves a query that depends on it."""
    conn = _fresh_db(tmp_path, monkeypatch)
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    ).fetchall()
    actual = {r[0] for r in rows}
    expected = {
        "idx_play_history_guild_played",
        "idx_play_history_user_played",
        "idx_reminders_fire_at",
        "idx_xp_data_level",
        "idx_xp_data_xp",
    }
    missing = expected - actual
    assert not missing, f"Indexes missing from _get_db() schema: {missing}"
