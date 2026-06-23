"""PHASE-21 21C: per-NPC voice casting — determinism, spread, archetype grouping,
collision probing, persistence/atomicity, override, reset, cross-instance reload.

Backend is forced to kokoro so a real voice pool exists (the test env has no piper
model and no KOKORO_TTS_URL, so resolve_backend() would otherwise pick fish).
"""

import pytest

from services.voice import voice_casting
from services.voice.voice_casting import KOKORO_POOL, VoiceCasting

_GROUP_OF = {p["id"]: p["group"] for p in KOKORO_POOL}


@pytest.fixture(autouse=True)
def _kokoro(monkeypatch):
    monkeypatch.setattr(voice_casting, "resolve_backend", lambda: "kokoro")


@pytest.fixture
def store_path(tmp_path):
    return str(tmp_path / "voice_cast.json")


def test_determinism_across_instances(store_path):
    a = VoiceCasting(store_path)
    first = a.get_voice("camp1", "Volo")
    b = VoiceCasting(store_path)  # fresh instance reads the persisted file
    assert b.get_voice("camp1", "Volo").voice_id == first.voice_id


def test_distinct_names_spread(store_path):
    vc = VoiceCasting(store_path)
    ids = {vc.get_voice("camp1", name).voice_id for name in ("Volo", "Borin", "Sythra", "Mara")}
    assert len(ids) >= 3  # linear-probe avoids collisions across the pool


def test_archetype_group_respected(store_path):
    vc = VoiceCasting(store_path)
    entry = vc.get_voice("camp1", "Smaug", archetype="booming_dragon")
    assert _GROUP_OF[entry.voice_id] == "deep_male"


def test_collision_probing_does_not_raise(store_path):
    vc = VoiceCasting(store_path)
    # Cast more names than the deep_male subset to force the wrap/collision path.
    for i in range(len(KOKORO_POOL) + 3):
        entry = vc.get_voice("camp1", f"npc{i}", archetype="booming_dragon")
        assert entry.voice_id  # always resolves to some voice


def test_persistence_round_trip(store_path):
    VoiceCasting(store_path).get_voice("camp1", "Volo")
    reloaded = VoiceCasting(store_path).list_cast("camp1")
    assert len(reloaded) == 1 and reloaded[0]["speaker"] == "Volo"


def test_set_voice_overrides_auto_assign(store_path):
    vc = VoiceCasting(store_path)
    vc.get_voice("camp1", "Volo")
    updated = vc.set_voice("camp1", "Volo", voice_id="af_nicole", speed=1.2, pitch=3)
    assert updated.voice_id == "af_nicole" and updated.speed == 1.2 and updated.pitch == 3
    # the override is what get_voice now returns
    assert vc.get_voice("camp1", "Volo").voice_id == "af_nicole"


def test_set_voice_creates_unknown_speaker(store_path):
    vc = VoiceCasting(store_path)
    entry = vc.set_voice("camp1", "Newcomer", voice_id="am_adam")
    assert entry.voice_id == "am_adam"
    assert any(e["speaker"] == "Newcomer" for e in vc.list_cast("camp1"))


def test_reset_then_get_rerolls_deterministically(store_path):
    vc = VoiceCasting(store_path)
    original = vc.get_voice("camp1", "Volo").voice_id
    assert vc.reset_voice("camp1", "Volo") is True
    assert vc.reset_voice("camp1", "Volo") is False  # already gone
    assert vc.get_voice("camp1", "Volo").voice_id == original  # same deterministic pick


def test_mtime_reload_sees_other_instance_write(store_path):
    a = VoiceCasting(store_path)
    b = VoiceCasting(store_path)
    a.get_voice("camp1", "Volo")  # instance A writes
    # instance B re-reads on next access because the file mtime advanced
    assert any(e["speaker"] == "Volo" for e in b.list_cast("camp1"))
