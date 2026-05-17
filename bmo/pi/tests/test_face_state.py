"""Tests for the unified BMO face state machine (QA #28, 2026-05-17).

services/face_state.FaceState is the single source of truth for the
expression both the OLED and the web ambient face render. Previously the
two surfaces tracked state independently and could drift (OLED shows
"thinking" while web shows "idle").
"""

from services.face_state import FaceState, EXPRESSIONS


class _FakeSocket:
    def __init__(self):
        self.events = []
    def emit(self, event, data, **kwargs):
        self.events.append((event, data))


def test_default_expression_is_idle():
    fs = FaceState()
    assert fs.expression == "idle"


def test_set_known_expression_returns_normalized():
    fs = FaceState()
    assert fs.set("thinking") == "thinking"
    assert fs.expression == "thinking"


def test_set_emits_face_state_event():
    sock = _FakeSocket()
    fs = FaceState(socketio=sock)
    fs.set("happy", reason="user_chat")
    assert len(sock.events) == 1
    event_name, data = sock.events[0]
    assert event_name == "face_state"
    assert data["expression"] == "happy"
    assert data["reason"] == "user_chat"
    assert isinstance(data["ts"], float)


def test_unknown_expression_normalizes_to_idle():
    fs = FaceState()
    assert fs.set("not_a_real_face") == "idle"
    assert fs.expression == "idle"


def test_legacy_synonyms_map_to_canonical():
    """Older callers used 'yapping'/'sad'/'neutral' — map to the enum so
    the OLED + web don't fight over interpretation."""
    fs = FaceState()
    assert fs.set("yapping") == "speaking"
    assert fs.set("sad") == "concerned"
    assert fs.set("neutral") == "idle"
    assert fs.set("YAP") == "speaking"  # case-insensitive


def test_set_handles_none_and_non_string():
    fs = FaceState()
    assert fs.set(None) == "idle"
    assert fs.set(123) == "idle"
    assert fs.set("") == "idle"


def test_snapshot_returns_current_state():
    sock = _FakeSocket()
    fs = FaceState(socketio=sock)
    fs.set("listening")
    snap = fs.snapshot()
    assert snap["expression"] == "listening"
    assert isinstance(snap["ts"], float)


def test_expression_enum_contains_canonical_names():
    """If any of these get renamed or dropped, callers across the
    codebase (LED controller, OLED face, web canvas) need updating
    in lockstep — guard against silent drift."""
    for required in ("idle", "happy", "thinking", "speaking", "listening", "error"):
        assert required in EXPRESSIONS


def test_set_emits_for_every_call_not_only_on_change():
    """Re-emitting on identical state lets a late-joining client read the
    current expression via the next event without needing a separate
    snapshot endpoint."""
    sock = _FakeSocket()
    fs = FaceState(socketio=sock)
    fs.set("idle")
    fs.set("idle")
    fs.set("idle")
    assert len(sock.events) == 3
