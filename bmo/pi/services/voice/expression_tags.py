"""Single source of truth for BMO's hardware-control expression-tag vocabulary.

BMO controls its face / LEDs / sound / TTS-emotion / music / NPC-voice by
emitting inline tags like ``[FACE:happy]``, ``[LED:rainbow]``, ``[EMOTION:sassy]``.
Historically the legal tag set was defined three unsynced ways: hand-listed in
~8 prompt-bearing modules, parsed by one regex in ``voice_personality``, and
(for faces) a separate OLED enum in ``hardware/oled_face.py`` — nothing kept the
three in sync, so faces/emotions could silently drift.

This module centralizes the **tag families** and the **closed FACE vocabulary**,
deriving the latter from ``oled_face.Expression`` so a face added to the hardware
enum is automatically advertised + accepted and a ``[FACE:x]`` the hardware does
not implement is detectable as drift. EMOTION/NPC closed sets remain owned by
``services.voice.voice_personality`` (``BMO_EMOTIONS`` / ``NPC_VOICES``);
LED / SOUND / MUSIC are intentionally open vocabularies.

It is a leaf module (imports only the hardware enum) so both the parser and the
agent prompts can depend on it without import cycles.
"""
from hardware.oled_face import Expression

# Tag families the parser recognizes, in advertised order.
TAG_FAMILIES: tuple[str, ...] = ("FACE", "LED", "SOUND", "EMOTION", "MUSIC", "NPC")

# Closed FACE vocabulary, derived from the hardware enum (single source of truth).
FACE_VALUES: frozenset[str] = frozenset(e.value for e in Expression)

# Families that have a closed, validatable value set (others are free-form).
CLOSED_FAMILIES: frozenset[str] = frozenset({"FACE", "EMOTION", "NPC"})


def family_pattern() -> str:
    """Regex alternation of tag families for the ``[TYPE:value]`` parser."""
    return "|".join(TAG_FAMILIES)


def tags_prompt() -> str:
    """Canonical prompt snippet advertising the tag families + valid FACE values.

    A single helper agents can import instead of hand-listing the vocabulary, so
    the model is always told exactly what the parser + hardware support.
    (Migrating the per-agent prose blocks onto this is an incremental follow-up.)
    """
    faces = ", ".join(sorted(FACE_VALUES))
    return (
        "Express yourself with inline tags (consumed before speech, never spoken): "
        "[FACE:x] [LED:x] [SOUND:x] [EMOTION:x] [MUSIC:x] [NPC:x]. "
        f"Valid FACE values: {faces}."
    )
