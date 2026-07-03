"""PHASE-36 36A — tests for the persistent play-by-post turn-queue store."""

import json

import pytest

from services.game.pbp_store import MAX_HISTORY, PbpError, PbpStore


def _participants(n=3):
    return [{"name": f"P{i}", "character": f"Char{i}"} for i in range(n)]


def _store(tmp_path):
    return PbpStore(path=str(tmp_path / "pbp.json"))


def test_start_validates_and_clamps(tmp_path):
    s = _store(tmp_path)
    with pytest.raises(PbpError):
        s.start_session("c1", "Scene", [])  # empty participants
    with pytest.raises(PbpError):
        s.start_session("c1", "Scene", [{"name": "A"}, {"name": "a"}])  # case-insensitive dup
    with pytest.raises(PbpError):
        s.start_session("c1", "Scene", [{"name": "X"} for _ in range(13)])  # over max
    sess = s.start_session("c1", "Crypt", _participants(3), reminder_hours=9999, auto_skip=True)
    assert sess["active"] and sess["round"] == 1 and sess["turn_index"] == 0
    assert sess["reminder_hours"] == 168.0  # clamped to max
    with pytest.raises(PbpError) as ei:
        s.start_session("c1", "Again", _participants(2))  # already active
    assert ei.value.code == "already_active"


def test_advance_wraps_and_bumps_round(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene", _participants(2))
    sess, res = s.advance("c1", "e1")
    assert res == "advanced" and sess["turn_index"] == 1 and sess["round"] == 1
    sess, res = s.advance("c1", "e2")
    assert res == "advanced" and sess["turn_index"] == 0 and sess["round"] == 2  # wrapped


def test_duplicate_event_id_is_noop(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene", _participants(3))
    s.advance("c1", "e1")
    sess, res = s.advance("c1", "e1")  # same event id
    assert res == "duplicate" and sess["turn_index"] == 1  # unchanged


def test_stale_turn_index_is_dropped(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene", _participants(3))
    s.advance("c1", "e1")  # now at index 1
    sess, res = s.advance("c1", "e2", expected_turn_index=0)  # caller thought it was still 0
    assert res == "stale_turn" and sess["turn_index"] == 1  # unchanged


def test_claim_matrix(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene", _participants(3))
    s.claim("c1", "p1", "111", "Alice")  # case-insensitive name
    assert s.get("c1")["participants"][1]["discord_user_id"] == "111"
    s.claim("c1", "Char2", "222", "Bob")  # by character
    assert s.get("c1")["participants"][2]["discord_user_id"] == "222"
    s.claim("c1", "p1", "111", "Alice")  # same-user re-claim is a no-op success
    with pytest.raises(PbpError) as ei:
        s.claim("c1", "p1", "999", "Mallory")  # different user
    assert ei.value.code == "already_claimed"
    with pytest.raises(PbpError) as ei2:
        s.claim("c1", "ghost", "333", "Nobody")
    assert ei2.value.code == "unknown_participant"


def test_set_scene_resets_and_preserves_claims(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene A", _participants(3))
    s.advance("c1", "e1")
    s.claim("c1", "P0", "111", "Alice")
    sess = s.set_scene("c1", "Scene B")
    assert sess["scene"] == "Scene B" and sess["turn_index"] == 0 and sess["round"] == 1
    assert sess["participants"][0]["discord_user_id"] == "111"  # claim preserved
    # New participant order preserves the matching claim by name.
    sess2 = s.set_scene("c1", "Scene C", [{"name": "P0"}, {"name": "Newbie"}])
    assert sess2["participants"][0]["discord_user_id"] == "111"


def test_persistence_round_trip(tmp_path):
    path = tmp_path / "pbp.json"
    s1 = PbpStore(path=str(path))
    s1.start_session("c1", "Scene", _participants(2))
    s1.advance("c1", "e1")
    s2 = PbpStore(path=str(path))  # fresh instance reads from disk
    assert s2.get("c1")["turn_index"] == 1


def test_corrupt_file_starts_empty(tmp_path):
    path = tmp_path / "pbp.json"
    path.write_text("{not valid json", encoding="utf-8")
    s = PbpStore(path=str(path))  # must not raise
    assert s.all_active() == {}


def test_stop_is_idempotent(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene", _participants(2))
    s.stop_session("c1")
    sess = s.stop_session("c1")  # stopping an inactive session is fine
    assert sess["active"] is False


def test_history_bounded(tmp_path):
    s = _store(tmp_path)
    s.start_session("c1", "Scene", _participants(2))
    for i in range(MAX_HISTORY + 20):
        s.advance("c1", f"e{i}")
    assert len(s.get("c1")["history"]) <= MAX_HISTORY


def test_disk_shape_is_json_object(tmp_path):
    path = tmp_path / "pbp.json"
    s = PbpStore(path=str(path))
    s.start_session("c1", "Scene", _participants(2))
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(on_disk, dict) and "c1" in on_disk
