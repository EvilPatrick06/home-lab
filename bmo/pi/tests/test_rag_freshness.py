"""Tests for the RAG index freshness guard (decision: keep tracked + guard).

Locks in the drift detection contract: a stamped index whose source is
unchanged reads "fresh"; changing the source without rebuilding reads "stale"
(and fails check_freshness); a legacy index with no sourceHash reads "legacy"
and does NOT fail the guard (so the historical committed snapshot never falsely
reddens CI). Also verifies save_index round-trips a sourceHash.
"""
import json

import pytest

import services.rag_freshness as rf


def _write_index(path, source_hash=None):
    data = {"version": 2, "createdAt": "2026-01-01T00:00:00", "chunks": []}
    if source_hash is not None:
        data["sourceHash"] = source_hash
    path.write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def rag_env(tmp_path, monkeypatch):
    rag_dir = tmp_path / "rag_data"
    src_dir = tmp_path / "5e-references"
    rag_dir.mkdir()
    src_dir.mkdir()
    (src_dir / "book.md").write_text("# PHB\nfireball deals 8d6 fire damage.\n", encoding="utf-8")
    monkeypatch.setattr(rf, "RAG_DIR", str(rag_dir))
    monkeypatch.setattr(rf, "REF_DIR", str(src_dir))
    monkeypatch.setitem(rf.INDEX_SOURCES, "chunk-index-dnd.json", ("dir", str(src_dir)))
    return rag_dir, src_dir


class TestSourceHash:
    def test_dir_hash_is_deterministic(self, rag_env):
        _, src_dir = rag_env
        h1 = rf.source_hash("dir", str(src_dir))
        h2 = rf.source_hash("dir", str(src_dir))
        assert h1 == h2 and len(h1) == 64

    def test_dir_hash_changes_when_source_changes(self, rag_env):
        _, src_dir = rag_env
        h1 = rf.source_hash("dir", str(src_dir))
        (src_dir / "book.md").write_text("# PHB\nfireball deals 10d6 now.\n", encoding="utf-8")
        assert rf.source_hash("dir", str(src_dir)) != h1


class TestCheckIndex:
    def test_fresh_when_hash_matches(self, rag_env):
        rag_dir, src_dir = rag_env
        h = rf.source_hash("dir", str(src_dir))
        _write_index(rag_dir / "chunk-index-dnd.json", source_hash=h)
        assert rf.check_index("chunk-index-dnd.json", rag_dir=str(rag_dir))["status"] == "fresh"

    def test_stale_when_source_drifts(self, rag_env):
        rag_dir, src_dir = rag_env
        h = rf.source_hash("dir", str(src_dir))
        _write_index(rag_dir / "chunk-index-dnd.json", source_hash=h)
        # Edit the source markdown without rebuilding the index.
        (src_dir / "book.md").write_text("# PHB\ncompletely different content\n", encoding="utf-8")
        res = rf.check_index("chunk-index-dnd.json", rag_dir=str(rag_dir))
        assert res["status"] == "stale"

    def test_legacy_when_no_source_hash(self, rag_env):
        rag_dir, _ = rag_env
        _write_index(rag_dir / "chunk-index-dnd.json", source_hash=None)
        assert rf.check_index("chunk-index-dnd.json", rag_dir=str(rag_dir))["status"] == "legacy"

    def test_missing_index(self, rag_env):
        rag_dir, _ = rag_env
        assert rf.check_index("chunk-index-dnd.json", rag_dir=str(rag_dir))["status"] == "missing"


class TestCheckFreshness:
    def test_legacy_indexes_do_not_fail_guard(self, rag_env):
        rag_dir, _ = rag_env
        _write_index(rag_dir / "chunk-index-dnd.json", source_hash=None)
        result = rf.check_freshness(rag_dir=str(rag_dir))
        assert result["ok"] is True
        assert result["stale"] == []

    def test_stale_index_fails_guard(self, rag_env):
        rag_dir, src_dir = rag_env
        h = rf.source_hash("dir", str(src_dir))
        _write_index(rag_dir / "chunk-index-dnd.json", source_hash=h)
        (src_dir / "book.md").write_text("drifted\n", encoding="utf-8")
        result = rf.check_freshness(rag_dir=str(rag_dir))
        assert result["ok"] is False
        assert "chunk-index-dnd.json" in result["stale"]


class TestSaveIndexStamp:
    def test_save_index_round_trips_source_hash(self, tmp_path):
        from services.game.rag.rag_search import save_index
        out = tmp_path / "idx.json"
        save_index([], str(out), source_hash="deadbeef")
        data = json.loads(out.read_text())
        assert data["sourceHash"] == "deadbeef"

    def test_save_index_without_hash_is_legacy_shaped(self, tmp_path):
        from services.game.rag.rag_search import save_index
        out = tmp_path / "idx.json"
        save_index([], str(out))
        assert "sourceHash" not in json.loads(out.read_text())
