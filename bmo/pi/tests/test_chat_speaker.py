"""Tests for chat speaker enum + voice-attribution gating (QA #1, #2, 2026-05-17).

Background: the typed-chat UI used to default the `speaker` field to "gavin"
(a voice-profile name) for every typed message, which polluted per-profile
memory and analytics. The /api/chat and on_chat_message paths now run the
incoming speaker through `_normalize_chat_speaker`, which drops voice-prefixed
claims unless the request explicitly carries `source_voice=True` (set only by
the voice pipeline). This test file exercises that normalizer.
"""

from app import ALLOWED_CHAT_SPEAKERS, _is_voice_speaker, _normalize_chat_speaker


def test_text_and_system_in_allowed_enum():
    assert "text" in ALLOWED_CHAT_SPEAKERS
    assert "system" in ALLOWED_CHAT_SPEAKERS


def test_voice_prefix_recognized():
    assert _is_voice_speaker("voice:gavin")
    assert _is_voice_speaker("voice:alex")


def test_bare_or_missing_speaker_is_not_voice():
    assert not _is_voice_speaker("gavin")
    assert not _is_voice_speaker("text")
    assert not _is_voice_speaker("voice:")
    assert not _is_voice_speaker("")
    assert not _is_voice_speaker(None)


def test_normalize_drops_voice_claim_without_source_voice():
    """The headline QA #2 bug: typed input arriving with speaker:'voice:gavin'
    (or worse, raw 'gavin') must not be persisted as voice-attributed."""
    assert _normalize_chat_speaker("voice:gavin", source_voice=False) == "text"


def test_normalize_keeps_voice_claim_when_source_voice_true():
    assert _normalize_chat_speaker("voice:gavin", source_voice=True) == "voice:gavin"


def test_normalize_unknown_speaker_falls_back():
    assert _normalize_chat_speaker("hacker", source_voice=False) == "unknown"
    assert _normalize_chat_speaker(None, source_voice=False) == "unknown"
    assert _normalize_chat_speaker("", source_voice=False) == "unknown"


def test_normalize_preserves_allowed_enum_values():
    for s in ("text", "system", "discord", "kiosk"):
        assert _normalize_chat_speaker(s) == s


def test_normalize_lowercases_enum_match():
    assert _normalize_chat_speaker("TEXT") == "text"
    assert _normalize_chat_speaker("System") == "system"


def test_normalize_legacy_player_dm_back_compat():
    """D&D mode used `player` / `dm` / `gavin` — keep those working."""
    assert _normalize_chat_speaker("player") == "player"
    assert _normalize_chat_speaker("dm") == "dm"
    assert _normalize_chat_speaker("gavin") == "gavin"
