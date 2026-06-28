"""services/accounts.py — SQLite store for dnd-app cloud accounts + sessions.

Two tables in ``data/accounts.db`` (raw ``sqlite3``, WAL, matching the
``campaign_memory`` / social-bot pattern — no ORM):

- ``users``    — one row per Discord identity (the OAuth ``sub``), plus the
  per-user sync quota/usage counters used by the Phase-C sync store.
- ``sessions`` — one row per minted bearer token (``jti``) so logout can revoke a
  single device; ``users.token_version`` revokes all of a user's tokens at once.

The DB path is resolved lazily (first query), NOT at import, so ``import app`` in
the test suite / canary boot never writes a real DB. Tests call
``configure(tmp_path)`` to point at a throwaway file.
"""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import closing

DEFAULT_QUOTA_BYTES = int(os.environ.get("BMO_ACCOUNT_QUOTA_BYTES", str(2 * 1024 * 1024 * 1024)))  # 2 GiB

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    discord_id    TEXT PRIMARY KEY,
    username      TEXT,
    global_name   TEXT,
    avatar        TEXT,
    email         TEXT,
    created_at    REAL NOT NULL,
    last_seen     REAL NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 1,
    quota_bytes   INTEGER NOT NULL DEFAULT 2147483648,
    used_bytes    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    jti          TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    issued_at    REAL NOT NULL,
    expires_at   REAL NOT NULL,
    revoked      INTEGER NOT NULL DEFAULT 0,
    device_label TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""

# Lazily-resolved DB path + one-time init guard.
_db_path: str | None = None
_initialized = False


def configure(path: str) -> None:
    """Point the store at ``path`` (tests use a tmp file). Resets the init guard
    so the schema is (re)created on the new path."""
    global _db_path, _initialized
    _db_path = path
    _initialized = False


def _path() -> str:
    if _db_path:
        return _db_path
    return os.environ.get("BMO_ACCOUNTS_DB") or os.path.expanduser(
        "~/home-lab/bmo/pi/data/accounts.db"
    )


def _connect() -> sqlite3.Connection:
    p = _path()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    conn = sqlite3.connect(p)
    try:
        os.chmod(p, 0o600)  # PII/session data — never world-readable (0644)
    except OSError:
        pass
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _ensure() -> None:
    global _initialized
    if _initialized:
        return
    with closing(_connect()) as conn:
        conn.executescript(_SCHEMA)
        conn.commit()
    _initialized = True


# ── Users ─────────────────────────────────────────────────────────────


def upsert_user(profile: dict) -> dict:
    """Insert or refresh a user from a Discord ``/users/@me`` profile. Preserves
    ``created_at`` / ``token_version`` / quota on update. Returns the stored row."""
    _ensure()
    did = str(profile["discord_id"])
    now = time.time()
    with closing(_connect()) as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE discord_id=?", (did,)).fetchone()
        if exists:
            conn.execute(
                "UPDATE users SET username=?, global_name=?, avatar=?, email=?, last_seen=? "
                "WHERE discord_id=?",
                (
                    profile.get("username"),
                    profile.get("global_name"),
                    profile.get("avatar"),
                    profile.get("email"),
                    now,
                    did,
                ),
            )
        else:
            conn.execute(
                "INSERT INTO users (discord_id, username, global_name, avatar, email, "
                "created_at, last_seen, token_version, quota_bytes, used_bytes) "
                "VALUES (?,?,?,?,?,?,?,1,?,0)",
                (
                    did,
                    profile.get("username"),
                    profile.get("global_name"),
                    profile.get("avatar"),
                    profile.get("email"),
                    now,
                    now,
                    DEFAULT_QUOTA_BYTES,
                ),
            )
        conn.commit()
    return get_user(did)  # type: ignore[return-value]


def get_user(discord_id: str) -> dict | None:
    _ensure()
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE discord_id=?", (str(discord_id),)
        ).fetchone()
    return dict(row) if row else None


def bump_token_version(discord_id: str) -> None:
    """Revoke ALL of a user's tokens (logout-everywhere) by invalidating ``tv``."""
    _ensure()
    with closing(_connect()) as conn:
        conn.execute(
            "UPDATE users SET token_version = token_version + 1 WHERE discord_id=?",
            (str(discord_id),),
        )
        conn.commit()


def add_used_bytes(discord_id: str, delta: int) -> None:
    """Adjust the per-user sync usage counter (Phase-C quota accounting)."""
    _ensure()
    with closing(_connect()) as conn:
        conn.execute(
            "UPDATE users SET used_bytes = MAX(0, used_bytes + ?) WHERE discord_id=?",
            (int(delta), str(discord_id)),
        )
        conn.commit()


# ── Sessions ──────────────────────────────────────────────────────────


def create_session(
    *, jti: str, user_id: str, issued_at: float, expires_at: float, device_label: str | None = None
) -> None:
    _ensure()
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (jti, user_id, issued_at, expires_at, revoked, device_label) "
            "VALUES (?,?,?,?,0,?)",
            (jti, str(user_id), float(issued_at), float(expires_at), device_label),
        )
        conn.commit()


def revoke_session(jti: str) -> None:
    _ensure()
    with closing(_connect()) as conn:
        conn.execute("UPDATE sessions SET revoked=1 WHERE jti=?", (jti,))
        conn.commit()


def session_active(jti: str | None) -> bool:
    """True iff the session exists, is not revoked, and has not expired."""
    if not jti:
        return False
    _ensure()
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT revoked, expires_at FROM sessions WHERE jti=?", (jti,)
        ).fetchone()
    if not row:
        return False
    if int(row["revoked"]):
        return False
    return float(row["expires_at"]) >= time.time()
