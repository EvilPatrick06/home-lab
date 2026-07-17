"""CSWSH origin-check logic for the privileged WS handshake (SECURITY-LOG 2026-07-15).

An ambient CF-Access cookie must not authorize a socket from a foreign browser
origin. _origin_is_allowed is the pure decision function.
"""

from routes.realtime_ws import _origin_is_allowed


def test_same_site_origin_allowed():
    assert _origin_is_allowed("https://bmo.example.com", "bmo.example.com", set()) is True


def test_cross_site_origin_rejected():
    assert _origin_is_allowed("https://evil.example.net", "bmo.example.com", set()) is False


def test_absent_origin_allowed_native_client():
    assert _origin_is_allowed("", "bmo.example.com", set()) is True


def test_localhost_kiosk_same_site():
    assert _origin_is_allowed("http://localhost:5000", "localhost:5000", set()) is True


def test_explicit_allowlist_origin():
    assert _origin_is_allowed("https://kiosk.local", "bmo.example.com", {"https://kiosk.local"}) is True


def test_explicit_allowlist_bare_host():
    assert _origin_is_allowed("https://kiosk.local", "bmo.example.com", {"kiosk.local"}) is True
