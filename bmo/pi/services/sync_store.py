"""services/sync_store.py — per-user, per-entity cloud-sync store (the hot hub).

Each signed-in user's data lives under ``data/sync/<discord_id>/<domain>/`` as
opaque blobs (the client serializes/gzips each entity; the server is
format-agnostic), with a SQLite manifest (``data/sync/manifest.db``) tracking
``(version, content_hash, mtime, size, deleted)`` per entity. Clients diff their
local manifest against ``get_manifest`` and push/pull only what changed.

Conflict policy is **last-writer-wins by monotonic version**: a push/delete is
accepted iff its ``version`` is strictly greater than the stored one; otherwise
it's rejected and the current winner is returned (the client pulls it).

Ownership is enforced by the caller (routes derive ``user_id`` from the verified
JWT — never from the request body). The entity id is stored verbatim in the DB
but base64url-encoded for the on-disk filename, so any client key (uuids,
``category/id``, ``file:path``) is path-safe with no traversal surface.

``data/sync/<uid>/`` is mirrored to Drive by services.sync_mirror.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
import time
from contextlib import closing

# Domain = a bounded, path-safe slug (the client's content type, e.g.
# "characters", "campaigns", "image-library"). Validated for path safety rather
# than pinned to a fixed list — the cross-platform client (Phase D) owns the
# canonical domain names; the server only guarantees they're safe namespaces.
_DOMAIN_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_MAX_ENTITY_ID_LEN = 512

_base_dir: str | None = None
_db_path: str | None = None
_initialized = False

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sync_objects (
    user_id      TEXT NOT NULL,
    domain       TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    content_hash TEXT,
    version      INTEGER NOT NULL,
    mtime        REAL NOT NULL,
    size         INTEGER NOT NULL DEFAULT 0,
    deleted      INTEGER NOT NULL DEFAULT 0,
    deleted_at   REAL,
    updated_at   REAL NOT NULL,
    PRIMARY KEY (user_id, domain, entity_id)
);
"""


def configure(base_dir: str | None = None, db_path: str | None = None) -> None:
    """Point the store at throwaway paths (tests). Resets the init guard."""
    global _base_dir, _db_path, _initialized
    _base_dir = base_dir
    _db_path = db_path
    _initialized = False


def _root() -> str:
    if _base_dir:
        return _base_dir
    return os.environ.get("BMO_SYNC_DIR") or os.path.expanduser("~/home-lab/bmo/pi/data/sync")


def _dbp() -> str:
    if _db_path:
        return _db_path
    return os.path.join(_root(), "manifest.db")


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_dbp()), exist_ok=True)
    conn = sqlite3.connect(_dbp())
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


# ── Validation + paths ────────────────────────────────────────────────


def valid_domain(domain: str) -> bool:
    return bool(domain) and bool(_DOMAIN_RE.match(domain))


def valid_entity_id(entity_id: str) -> bool:
    return bool(entity_id) and len(entity_id) <= _MAX_ENTITY_ID_LEN and "\x00" not in entity_id


def _blob_path(user_id: str, domain: str, entity_id: str) -> str:
    fname = base64.urlsafe_b64encode(entity_id.encode("utf-8")).decode("ascii").rstrip("=") + ".bin"
    return os.path.join(_root(), str(user_id), domain, fname)


def _meta_from_row(row: sqlite3.Row) -> dict:
    return {
        "domain": row["domain"],
        "id": row["entity_id"],
        "hash": row["content_hash"],
        "version": row["version"],
        "mtime": row["mtime"],
        "size": row["size"],
        "deleted": bool(row["deleted"]),
    }


# ── Reads ─────────────────────────────────────────────────────────────


def get_manifest(user_id: str) -> list[dict]:
    """Every object for the user, INCLUDING tombstones (clients need the
    deletions to mirror removals)."""
    _ensure()
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT * FROM sync_objects WHERE user_id=? ORDER BY domain, entity_id", (str(user_id),)
        ).fetchall()
    return [_meta_from_row(r) for r in rows]


def get_meta(user_id: str, domain: str, entity_id: str) -> dict | None:
    _ensure()
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT * FROM sync_objects WHERE user_id=? AND domain=? AND entity_id=?",
            (str(user_id), domain, entity_id),
        ).fetchone()
    return _meta_from_row(row) if row else None


def get_blob(user_id: str, domain: str, entity_id: str) -> bytes | None:
    meta = get_meta(user_id, domain, entity_id)
    if not meta or meta["deleted"]:
        return None
    path = _blob_path(user_id, domain, entity_id)
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


# ── Writes (last-writer-wins by version) ──────────────────────────────


def _upsert(conn: sqlite3.Connection, user_id, domain, entity_id, *, content_hash, version, mtime, size, deleted, deleted_at) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO sync_objects "
        "(user_id, domain, entity_id, content_hash, version, mtime, size, deleted, deleted_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (str(user_id), domain, entity_id, content_hash, int(version), float(mtime), int(size),
         1 if deleted else 0, deleted_at, time.time()),
    )
    conn.commit()


def put_object(
    user_id: str, domain: str, entity_id: str, version: int, mtime: float, content_hash: str | None, blob: bytes
) -> dict:
    """Store an entity blob. Accept iff ``version`` beats the stored one.
    Returns ``{accepted, winner, delta}`` (delta = byte change for quota)."""
    _ensure()
    existing = get_meta(user_id, domain, entity_id)
    if existing is not None and int(version) <= int(existing["version"]):
        return {"accepted": False, "winner": existing, "delta": 0}

    path = _blob_path(user_id, domain, entity_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(blob)
    old_size = existing["size"] if existing and not existing["deleted"] else 0
    new_size = len(blob)
    with closing(_connect()) as conn:
        _upsert(conn, user_id, domain, entity_id, content_hash=content_hash, version=version,
                mtime=mtime, size=new_size, deleted=False, deleted_at=None)
    winner = {"domain": domain, "id": entity_id, "hash": content_hash, "version": int(version),
              "mtime": float(mtime), "size": new_size, "deleted": False}
    return {"accepted": True, "winner": winner, "delta": new_size - old_size}


def delete_object(user_id: str, domain: str, entity_id: str, version: int) -> dict:
    """Tombstone an entity (so other devices delete their copy). Accept iff
    ``version`` beats the stored one. Returns ``{accepted, winner, delta}``."""
    _ensure()
    existing = get_meta(user_id, domain, entity_id)
    if existing is not None and int(version) <= int(existing["version"]):
        return {"accepted": False, "winner": existing, "delta": 0}

    old_size = existing["size"] if existing and not existing["deleted"] else 0
    path = _blob_path(user_id, domain, entity_id)
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
    now = time.time()
    with closing(_connect()) as conn:
        _upsert(conn, user_id, domain, entity_id, content_hash=None, version=version,
                mtime=now, size=0, deleted=True, deleted_at=now)
    winner = {"domain": domain, "id": entity_id, "hash": None, "version": int(version),
              "mtime": now, "size": 0, "deleted": True}
    return {"accepted": True, "winner": winner, "delta": -old_size}


def snapshot_manifest(user_id: str) -> str:
    """Write a ``manifest.json`` into the user's dir so a Drive mirror is
    self-describing for disaster recovery. Returns the path."""
    data = get_manifest(user_id)
    d = os.path.join(_root(), str(user_id))
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, "manifest.json")
    with open(path, "w") as f:
        json.dump({"objects": data}, f)
    return path
