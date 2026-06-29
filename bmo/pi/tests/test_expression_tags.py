"""Guard the expression-tag registry: prompt/parser/hardware stay in sync."""
from hardware.oled_face import Expression
from services.voice import expression_tags as et
from services.voice import voice_personality as vp


def test_face_values_derived_from_hardware_enum():
    # The closed FACE vocabulary IS the OLED enum — they cannot drift.
    assert et.FACE_VALUES == frozenset(e.value for e in Expression)


def test_parser_families_match_registry():
    # The parser's [TYPE:value] family alternation is sourced from the registry.
    assert vp._TAG_PATTERN.pattern.count("FACE") == 1
    for fam in et.TAG_FAMILIES:
        assert fam in vp._TAG_PATTERN.pattern


def test_tags_prompt_advertises_every_family_and_faces():
    snippet = et.tags_prompt()
    for fam in et.TAG_FAMILIES:
        assert f"[{fam}:" in snippet
    # advertised FACE values are exactly the hardware-implemented set
    for face in et.FACE_VALUES:
        assert face in snippet


def test_known_tag_values_not_flagged():
    assert vp._is_unknown_tag_value("FACE", "happy") is False
    assert vp._is_unknown_tag_value("EMOTION", next(iter(vp.BMO_EMOTIONS))) is False
    assert vp._is_unknown_tag_value("NPC", next(iter(vp.NPC_VOICES))) is False
    # open families never flagged
    assert vp._is_unknown_tag_value("LED", "anything") is False


def test_unknown_face_flagged_but_still_parsed():
    assert vp._is_unknown_tag_value("FACE", "not_a_real_face") is True
    r = vp.parse_response_tags("[FACE:not_a_real_face] hello")
    assert r["face"] == "not_a_real_face"   # behaviour unchanged: still captured
    assert r["clean_text"] == "hello"


def test_parse_response_tags_behaviour_unchanged():
    r = vp.parse_response_tags("[FACE:happy] hi [LED:blue] [EMOTION:excited]")
    assert r["face"] == "happy"
    assert r["led"] == "blue"
    assert r["emotion"] == "excited"
    assert r["clean_text"] == "hi"
