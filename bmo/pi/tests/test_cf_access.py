"""Tests for Cloudflare Access JWT trust (app._cf_access_authenticated).

A throwaway RSA keypair + a stub JWKS client exercise the REAL PyJWT verification
path (signature + audience + issuer + expiry + the email allowlist) fully offline,
so a regression that weakens any check fails CI. This guards a code-execution
surface (the IDE), so the negative cases matter most.
"""

from __future__ import annotations

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

import app as app_module
from app import app as flask_app

TEAM = "testteam.cloudflareaccess.com"
AUD = "test-aud-123"
ISS = f"https://{TEAM}"


@pytest.fixture
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def configured(monkeypatch, rsa_key):
    """Trust configured + the JWKS client stubbed to return our public key."""
    monkeypatch.setattr(app_module, "CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.setattr(app_module, "CF_ACCESS_AUD", AUD)
    monkeypatch.setattr(app_module, "CF_ACCESS_ALLOWED_EMAILS", frozenset())

    class _Stub:
        def get_signing_key_from_jwt(self, _token):
            class _K:
                key = rsa_key.public_key()

            return _K()

    monkeypatch.setattr(app_module, "_cf_jwks_client", _Stub())
    return rsa_key


def _token(key, **overrides):
    claims = {"aud": AUD, "iss": ISS, "email": "owner@example.com", "exp": 9999999999, **overrides}
    return jwt.encode(claims, key, algorithm="RS256")


def _ctx(token):
    headers = {"Cf-Access-Jwt-Assertion": token} if token else {}
    return flask_app.test_request_context("/bmo", headers=headers)


def test_valid_token_authenticates(configured):
    with _ctx(_token(configured)):
        assert app_module._cf_access_authenticated() is True


def test_no_token_fails(configured):
    with _ctx(None):
        assert app_module._cf_access_authenticated() is False


def test_wrong_audience_fails(configured):
    with _ctx(_token(configured, aud="someone-elses-app")):
        assert app_module._cf_access_authenticated() is False


def test_wrong_issuer_fails(configured):
    with _ctx(_token(configured, iss="https://evil.cloudflareaccess.com")):
        assert app_module._cf_access_authenticated() is False


def test_expired_token_fails(configured):
    with _ctx(_token(configured, exp=1)):
        assert app_module._cf_access_authenticated() is False


def test_wrong_signature_fails(configured):
    # Signed with a DIFFERENT key than the JWKS stub returns → bad signature.
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with _ctx(_token(other)):
        assert app_module._cf_access_authenticated() is False


def test_email_allowlist_enforced(monkeypatch, configured):
    monkeypatch.setattr(app_module, "CF_ACCESS_ALLOWED_EMAILS", frozenset({"owner@example.com"}))
    with _ctx(_token(configured, email="intruder@example.com")):
        assert app_module._cf_access_authenticated() is False
    with _ctx(_token(configured, email="owner@example.com")):
        assert app_module._cf_access_authenticated() is True


def test_trust_off_when_unconfigured(monkeypatch, rsa_key):
    monkeypatch.setattr(app_module, "CF_ACCESS_TEAM_DOMAIN", "")
    monkeypatch.setattr(app_module, "CF_ACCESS_AUD", "")
    with _ctx(_token(rsa_key)):
        assert app_module._cf_access_authenticated() is False


def test_gate_allows_cf_authenticated_admin_path(monkeypatch, configured):
    """End-to-end through the front-door gate: a valid Access JWT reaches /bmo
    even with BMO_API_KEY set and no Bearer."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    ctx = flask_app.test_request_context(
        "/bmo", environ_base={"REMOTE_ADDR": "203.0.113.7"}, headers={"Cf-Access-Jwt-Assertion": _token(configured)}
    )
    with ctx:
        assert app_module._bmo_optional_api_key() is None


def test_gate_still_blocks_admin_path_without_cf(monkeypatch, configured):
    """No Access JWT → the admin path is still 401 (the trust didn't open a hole)."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    ctx = flask_app.test_request_context("/bmo", environ_base={"REMOTE_ADDR": "203.0.113.7"})
    with ctx:
        resp = app_module._bmo_optional_api_key()
        assert resp is not None and resp[1] == 401
