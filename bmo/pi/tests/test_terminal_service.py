"""PHASE-13 13B/13C — TerminalManager threads cwd + paint nudge to start_pty."""
import importlib
import sys
from unittest.mock import MagicMock

# Force the REAL module even if another test stubbed dev.terminal_service.
sys.modules.pop("dev.terminal_service", None)
terminal_service = importlib.import_module("dev.terminal_service")
TerminalManager = terminal_service.TerminalManager
TerminalSession = terminal_service.TerminalSession


def test_open_terminal_threads_cwd_and_paint(monkeypatch):
    """13B/13C: open_terminal forwards cwd + paint_prompt to start_pty."""
    captured = {}

    def fake_start_pty(self, output_callback, cwd=None, paint_prompt=True):
        captured["cwd"] = cwd
        captured["paint_prompt"] = paint_prompt
        self.alive = True  # never fork a real shell in the test

    monkeypatch.setattr(TerminalSession, "start_pty", fake_start_pty)
    mgr = TerminalManager()
    mgr.open_terminal("sid-1", "term-1", 80, 24, MagicMock(),
                      cwd="/home/patrick/home-lab")
    assert captured["cwd"] == "/home/patrick/home-lab"
    assert captured["paint_prompt"] is True


def test_open_terminal_defaults_cwd_none(monkeypatch):
    """Default (no cwd) preserves the prior behavior (inherited cwd)."""
    captured = {}

    def fake_start_pty(self, output_callback, cwd=None, paint_prompt=True):
        captured["cwd"] = cwd
        self.alive = True

    monkeypatch.setattr(TerminalSession, "start_pty", fake_start_pty)
    mgr = TerminalManager()
    mgr.open_terminal("sid", "t", 80, 24, MagicMock())
    assert captured["cwd"] is None
