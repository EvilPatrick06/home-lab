"""Unified BMO face state machine (QA #28, 2026-05-17).

Single source of truth for the BMO expression the OLED + web ambient face
both render. Previously _sync_expression emitted an `expression` event but
the frontend also tracked a separate `_faceState` (from socket `status`
events), which let the two surfaces drift out of sync (e.g. OLED shows
"thinking" while web shows "idle").

This module:
- defines the canonical expression enum (EXPRESSIONS).
- exposes `set_expression(name)` which emits a single `face_state` event
  carrying both the expression AND the LED-color hint, so future clients
  can render from one payload.
- keeps `_sync_expression` (in app.py) calling into here as the single
  authority — OLED + LED + web all derive from the same call.

The web renderer (`bmo.js`) listens for `face_state` and uses
`data.expression` directly; the legacy `expression` event is also still
emitted for back-compat with older clients.
"""

from __future__ import annotations

import threading
import time

EXPRESSIONS = frozenset({
    "idle",
    "happy",
    "surprised",
    "sleepy",
    "concerned",
    "excited",
    "thinking",
    "speaking",
    "listening",
    "error",
    "looking_around",
})


class FaceState:
    """In-memory face-state holder. Singleton constructed by app.py at init."""

    def __init__(self, socketio=None):
        self._socketio = socketio
        self._lock = threading.Lock()
        self._expression: str = "idle"
        self._updated_at: float = time.time()

    @property
    def expression(self) -> str:
        return self._expression

    @property
    def updated_at(self) -> float:
        return self._updated_at

    def normalize(self, name) -> str:
        """Coerce arbitrary input to a known expression, defaulting to idle."""
        if not isinstance(name, str):
            return "idle"
        name = name.strip().lower()
        if name in EXPRESSIONS:
            return name
        # Common synonyms emitted by older code paths.
        synonyms = {
            "yap": "speaking",
            "yapping": "speaking",
            "talk": "speaking",
            "talking": "speaking",
            "happy_face": "happy",
            "sad": "concerned",
            "worried": "concerned",
            "neutral": "idle",
            "default": "idle",
        }
        return synonyms.get(name, "idle")

    def set(self, expression, *, reason: str = "") -> str:
        """Set expression, emit a face_state event. Returns the normalized name."""
        norm = self.normalize(expression)
        with self._lock:
            changed = norm != self._expression
            self._expression = norm
            self._updated_at = time.time()
        if self._socketio:
            try:
                self._socketio.emit("face_state", {
                    "expression": norm,
                    "ts": self._updated_at,
                    "reason": reason or None,
                })
            except Exception:
                pass
        return norm

    def snapshot(self) -> dict:
        with self._lock:
            return {"expression": self._expression, "ts": self._updated_at}


# Module-level singleton; app.py creates the real one at init.
FACE: FaceState | None = None


def init_face_state(socketio=None) -> FaceState:
    global FACE
    FACE = FaceState(socketio=socketio)
    return FACE
