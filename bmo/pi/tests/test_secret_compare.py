"""Constant-time shared-secret comparisons (SECURITY-LOG 2026-07-02).

The Flask gates compared BMO_API_KEY / BMO_REGISTRY_API_KEY / BMO_IDE_TOKEN
with plain ==; they now route through hmac.compare_digest, matching the
constant-time fix already applied to the dnd-app sync receiver.
"""

import app as app_module


def _ctx(path, remote="203.0.113.7", headers=None, query_string=None):
    return app_module.app.test_request_context(
        path, environ_base={"REMOTE_ADDR": remote},
        headers=headers or {}, query_string=query_string,
    )


def test_secure_eq_accepts_equal():
    assert app_module._secure_eq("abc", "abc") is True


def test_secure_eq_rejects_unequal_and_none():
    assert app_module._secure_eq("abd", "abc") is False
    assert app_module._secure_eq("", "abc") is False
    assert app_module._secure_eq(None, "abc") is False


def test_bearer_gate_still_accepts_correct_key(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/chat", headers={"Authorization": "Bearer k"}):
        assert app_module._bmo_optional_api_key() is None


def test_bearer_gate_still_rejects_wrong_key(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/chat", headers={"Authorization": "Bearer wrong"}):
        resp = app_module._bmo_optional_api_key()
        assert resp is not None and resp[1] == 401


def test_sse_query_param_key_still_works(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/games/stream", query_string={"api_key": "k"}):
        assert app_module._bmo_optional_api_key() is None


def test_registry_second_key_constant_time_path(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_REGISTRY_API_KEY", "r")
    with _ctx("/api/games/announce", headers={"X-Registry-Key": "r"}):
        assert app_module._registry_authorized() is True
    with _ctx("/api/games/announce", headers={"X-Registry-Key": "bad"}):
        assert app_module._registry_authorized() is False
