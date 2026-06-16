"""PHASE-15 15D — curl secret hygiene.

Proves no API key (or key-bearing URL) ever lands on the os.system command line: every
secret-bearing option is written to a 0600 ``-K`` config file, and HTTP >= 400 (curl exit
22) raises ``RuntimeError`` instead of returning an error body as payload.
"""

import importlib
import os
import re
import shlex
import sys

import pytest


@pytest.fixture()
def cp():
    """Yield the REAL services.cloud_providers.

    test_claude_tools.py installs a MagicMock at sys.modules["services.cloud_providers"]
    (module-level setdefault); collected first, it shadows a plain top-level import here.
    Pop it, import the real module fresh, restore the prior entry on teardown.
    """
    saved = sys.modules.pop("services.cloud_providers", None)
    try:
        yield importlib.import_module("services.cloud_providers")
    finally:
        if saved is not None:
            sys.modules["services.cloud_providers"] = saved
        else:
            sys.modules.pop("services.cloud_providers", None)


def _make_fake(capture, *, exit_status=0, output_bytes=None):
    """Fake os.system: snapshot the cmd + the -K config, optionally write the output file."""

    def fake(cmd):
        capture["cmd"] = cmd
        toks = shlex.split(cmd)
        cfg_path = toks[toks.index("-K") + 1]
        capture["cfg_path"] = cfg_path
        content = open(cfg_path, encoding="utf-8").read()
        capture["config"] = content
        if output_bytes is not None and exit_status == 0:
            mo = re.search(r'output = "(.*)"', content)
            if mo:
                out_path = mo.group(1).replace('\\"', '"').replace("\\\\", "\\")
                with open(out_path, "wb") as f:
                    f.write(output_bytes)
        return exit_status

    return fake


def test_fish_audio_key_never_on_cmdline(monkeypatch, cp):
    monkeypatch.setattr(cp, "FISH_AUDIO_API_KEY", "sk-SECRET-123")
    capture = {}
    monkeypatch.setattr(cp.os, "system", _make_fake(capture, output_bytes=b"FAKE-AUDIO"))

    out = cp.fish_audio_tts("hello")
    assert out == b"FAKE-AUDIO"
    assert "curl -K " in capture["cmd"]
    assert "sk-SECRET-123" not in capture["cmd"]
    assert "Authorization" not in capture["cmd"]
    # The secret lives only in the config file, alongside `fail` + the url.
    assert "Bearer sk-SECRET-123" in capture["config"]
    assert "\nfail\n" in "\n" + capture["config"]
    assert "api.fish.audio" in capture["config"]


def test_fish_audio_http_error_raises(monkeypatch, cp):
    monkeypatch.setattr(cp, "FISH_AUDIO_API_KEY", "sk-SECRET-123")
    capture = {}
    # 22 << 8 = the os.system wait status for curl exit 22 (HTTP >= 400 under --fail).
    monkeypatch.setattr(cp.os, "system", _make_fake(capture, exit_status=22 << 8))
    with pytest.raises(RuntimeError, match="exit 22"):
        cp.fish_audio_tts("hello")


def test_gemini_stream_key_not_on_cmdline(monkeypatch, cp):
    monkeypatch.setattr(cp, "GEMINI_API_KEY", "gem-SECRET")
    capture = {}
    # Return nonzero so the generator raises right after the curl is invoked — enough to
    # prove the secret-exposure property without full SSE parsing.
    monkeypatch.setattr(cp.os, "system", _make_fake(capture, exit_status=22 << 8))
    with pytest.raises(RuntimeError):
        list(cp.gemini_chat_stream([{"role": "user", "content": "hi"}]))
    assert "gem-SECRET" not in capture["cmd"]
    assert "gem-SECRET" in capture["config"]  # key-bearing URL lives in the config file


def test_groq_stt_key_not_on_cmdline(monkeypatch, cp):
    monkeypatch.setattr(cp, "GROQ_API_KEY", "groq-SECRET")
    capture = {}
    monkeypatch.setattr(
        cp.os, "system", _make_fake(capture, output_bytes=b'{"text":"hi","language":"en","duration":1}')
    )
    result = cp.groq_stt(b"RIFFfake-wav-bytes")
    assert result["text"] == "hi"
    assert "groq-SECRET" not in capture["cmd"]
    assert "Bearer groq-SECRET" in capture["config"]
    assert "form =" in capture["config"]


def test_config_file_removed_after_call(monkeypatch, cp):
    monkeypatch.setattr(cp, "FISH_AUDIO_API_KEY", "sk-x")
    capture = {}
    monkeypatch.setattr(cp.os, "system", _make_fake(capture, output_bytes=b"x"))
    cp.fish_audio_tts("hi")
    assert not os.path.exists(capture["cfg_path"])  # helper removes it in finally


def test_cfg_quote_escapes(cp):
    assert cp._curl_cfg_quote('he said "hi"') == '"he said \\"hi\\""'
    assert cp._curl_cfg_quote("a\\b") == '"a\\\\b"'
