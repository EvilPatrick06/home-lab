"""Freshness guard for the committed RAG chunk-index JSONs (decision: Option B).

DECISION (sugg-rag-json-tracked): the ~5.4 MB of machine-generated RAG indexes
under ``data/rag_data/*.json`` are **intentionally kept tracked in git** rather
than gitignored-and-rebuilt-on-deploy. Rationale: the 8 GB Pi loads RAG at boot
with no build step, and rebuilding ``chunk-index-dnd.json`` means re-chunking the
3.6 MB ``data/5e-references/`` corpus on the Pi during deploy — extra deploy time
and an embedding/parse dependency on a memory-constrained box that already
OOM-wedges under load. Committing the prebuilt index avoids that. The cost of
committing (Option A's concern) is *silent drift*: the index carries a frozen
snapshot with no check that it still matches its source. This module is the
guard that closes that gap — it makes drift *visible* (a CI/preflight check and
a health field) instead of silent, which is exactly what Option B asks for.

How it works: ``save_index`` now stamps a ``sourceHash`` (a stable hash of the
generating source files) into each index. ``check_freshness`` recomputes the
source hash today and compares. A mismatch = the source markdown changed but the
index was never rebuilt (run ``services/build_rag_indexes.py``). Legacy indexes
written before this stamp existed report ``"legacy"`` (unknown, not stale) so the
guard never falsely reddens on the historical snapshot — it only fires once an
index has been (re)built with a recorded source hash and then drifts.
"""
from __future__ import annotations

import hashlib
import json
import os

from services.paths import DATA_DIR as _DATA_DIR

RAG_DIR = os.path.join(str(_DATA_DIR), "rag_data")
REF_DIR = os.path.join(str(_DATA_DIR), "5e-references")

# Which source directory feeds which index. Only the DND index is sourced from
# tracked on-disk files (the 5e-references corpus); the anime/games/movies/music
# indexes are generated from inline KB strings in build_rag_indexes.py, so their
# "source" is the generator script itself.
_GENERATOR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "services", "build_rag_indexes.py")

INDEX_SOURCES = {
    "chunk-index-dnd.json": ("dir", REF_DIR),
    "chunk-index-anime.json": ("file", _GENERATOR),
    "chunk-index-games.json": ("file", _GENERATOR),
    "chunk-index-movies.json": ("file", _GENERATOR),
    "chunk-index-music.json": ("file", _GENERATOR),
}


def _hash_file(path: str, h) -> None:
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)


def source_hash(kind: str, path: str) -> str:
    """Stable content hash of an index's source (a markdown dir or a file).

    For a directory: hash the relative path + bytes of every ``.md``/``.txt``
    file in sorted order, so the digest is order-independent and reflects both
    content and structure. For a file: hash its bytes.
    """
    h = hashlib.sha256()
    if kind == "file":
        _hash_file(path, h)
        return h.hexdigest()
    # kind == "dir"
    files = []
    for root, _dirs, names in os.walk(path):
        for name in names:
            if name.lower().endswith((".md", ".txt")):
                files.append(os.path.join(root, name))
    for fp in sorted(files):
        rel = os.path.relpath(fp, path).replace(os.sep, "/")
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        _hash_file(fp, h)
    return h.hexdigest()


def compute_source_hash_for_index(index_filename: str) -> str | None:
    """Compute today's source hash for a named index, or None if unknown/missing."""
    spec = INDEX_SOURCES.get(index_filename)
    if not spec:
        return None
    kind, path = spec
    if not os.path.exists(path):
        return None
    try:
        return source_hash(kind, path)
    except OSError:
        return None


def _stored_source_hash(index_path: str) -> str | None:
    try:
        with open(index_path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data.get("sourceHash")
    except (OSError, ValueError):
        pass
    return None


def check_index(index_filename: str, *, rag_dir: str | None = None) -> dict:
    """Return a freshness status for one index.

    status: "fresh"   — stored hash matches the recomputed source hash.
            "stale"    — hashes differ; the source changed, rebuild the index.
            "legacy"   — index has no recorded sourceHash (pre-guard snapshot).
            "missing"  — index file not found.
            "unknown"  — source not resolvable (e.g. source dir absent).
    """
    rdir = rag_dir or RAG_DIR
    index_path = os.path.join(rdir, index_filename)
    if not os.path.exists(index_path):
        return {"index": index_filename, "status": "missing"}
    stored = _stored_source_hash(index_path)
    current = compute_source_hash_for_index(index_filename)
    if current is None:
        return {"index": index_filename, "status": "unknown"}
    if stored is None:
        return {"index": index_filename, "status": "legacy", "current": current}
    if stored == current:
        return {"index": index_filename, "status": "fresh"}
    return {"index": index_filename, "status": "stale", "stored": stored, "current": current}


def check_freshness(*, rag_dir: str | None = None) -> dict:
    """Check every known index. Returns {ok, stale: [...], results: [...]}.

    ``ok`` is False only when at least one index is affirmatively **stale**
    (a recorded hash that no longer matches). "legacy"/"unknown"/"missing" do
    not fail — they are reported but do not falsely redden the guard.
    """
    results = [check_index(name, rag_dir=rag_dir) for name in INDEX_SOURCES]
    stale = [r["index"] for r in results if r["status"] == "stale"]
    return {"ok": not stale, "stale": stale, "results": results}
