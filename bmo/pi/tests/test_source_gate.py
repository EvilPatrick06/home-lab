"""Transport source-address gate tests (SECURITY-LOG 2026-06-29, resolved 2026-07-02).

The wildcard bind used to expose :5000 to the raw physical LAN over plain
HTTP (cleartext BMO_API_KEY on that leg). The gate rejects any connection
whose SOCKET peer address is neither loopback nor the tailnet, judged by
REMOTE_ADDR only — forwarded headers must not matter in either direction.
"""

import pytest

import source_gate
from source_gate import (
    DEFAULT_ALLOWED_CIDRS,
    SourceGate,
    allowed_source_networks,
    install_source_gate,
    is_allowed_source,
)

NETS = source_gate._parse_networks(DEFAULT_ALLOWED_CIDRS)


@pytest.mark.parametrize(
    "addr,allowed",
    [
        ("127.0.0.1", True),          # loopback — cloudflared / kiosk / canary
        ("127.8.4.2", True),          # anywhere in 127/8
        ("::1", True),                # IPv6 loopback
        ("100.85.66.54", True),       # the Pi's tailscale address
        ("100.64.0.1", True),         # tailscale CGNAT range
        ("fd7a:115c:a1e0::be01:42a8", True),  # tailscale ULA IPv6
        ("::ffff:127.0.0.1", True),   # IPv4-mapped loopback
        ("192.168.1.50", False),      # physical LAN — the leg being closed
        ("10.10.20.99", False),       # IoT/guest VLAN
        ("172.17.0.2", False),        # docker bridge (nothing legit calls :5000 from it)
        ("::ffff:192.168.1.9", False),  # IPv4-mapped LAN must not slip through
        ("8.8.8.8", False),           # public internet
        ("101.0.0.1", False),         # just OUTSIDE 100.64/10
        ("", True),                   # no peer address (test harness) — allowed
        ("garbage", False),           # unparseable — rejected
    ],
)
def test_is_allowed_source(addr, allowed):
    assert is_allowed_source(addr, NETS) is allowed


def test_extra_cidrs_env_extends_and_ignores_invalid(monkeypatch):
    monkeypatch.setenv("BMO_EXTRA_SOURCE_CIDRS", "192.168.1.0/24, not-a-cidr")
    nets = allowed_source_networks()
    assert is_allowed_source("192.168.1.7", nets) is True
    assert is_allowed_source("192.168.2.7", nets) is False


def _run_wsgi(gate, remote_addr, headers=None):
    environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/x", "REMOTE_ADDR": remote_addr}
    if headers:
        for k, v in headers.items():
            environ["HTTP_" + k.upper().replace("-", "_")] = v
    captured = {}

    def start_response(status, response_headers):
        captured["status"] = status

    body = b"".join(gate(environ, start_response))
    return captured["status"], body


def _inner_app(environ, start_response):
    start_response("200 OK", [("Content-Type", "text/plain")])
    return [b"inner"]


def test_gate_rejects_lan_peer_and_passes_loopback():
    gate = SourceGate(_inner_app, NETS)
    status, body = _run_wsgi(gate, "192.168.1.99")
    assert status.startswith("403")
    assert b"disabled" in body
    status, body = _run_wsgi(gate, "127.0.0.1")
    assert status.startswith("200")
    assert body == b"inner"


def test_gate_judges_by_socket_peer_not_forwarded_headers():
    gate = SourceGate(_inner_app, NETS)
    # Tunnel traffic: loopback peer + X-Forwarded-For of the edge client — must pass.
    status, _ = _run_wsgi(gate, "127.0.0.1", headers={"X-Forwarded-For": "203.0.113.7"})
    assert status.startswith("200")
    # LAN client spoofing a loopback XFF — still judged by its real peer address.
    status, _ = _run_wsgi(gate, "192.168.1.99", headers={"X-Forwarded-For": "127.0.0.1"})
    assert status.startswith("403")


class _FakeApp:
    def __init__(self):
        self.wsgi_app = _inner_app


def test_install_source_gate_wraps_by_default(monkeypatch):
    monkeypatch.delenv("BMO_SOURCE_GATE", raising=False)
    fake = _FakeApp()
    assert install_source_gate(fake) is True
    assert isinstance(fake.wsgi_app, SourceGate)


def test_install_source_gate_off_escape_hatch(monkeypatch):
    monkeypatch.setenv("BMO_SOURCE_GATE", "off")
    fake = _FakeApp()
    assert install_source_gate(fake) is False
    assert fake.wsgi_app is _inner_app


# ── Through the real app (WSGI stack incl. flask-socketio middleware) ────────


def test_app_gate_blocks_lan_peer_end_to_end():
    from app import app as flask_app

    client = flask_app.test_client()
    resp = client.get("/health", environ_overrides={"REMOTE_ADDR": "192.168.1.99"})
    assert resp.status_code == 403
    assert b"disabled" in resp.data


def test_app_gate_passes_loopback_and_tailnet_end_to_end():
    from app import app as flask_app

    client = flask_app.test_client()
    # Loopback (kiosk / cloudflared / deploy health probe) must not be blocked
    # by the gate — /health answers.
    resp = client.get("/health")
    assert resp.status_code != 403
    # A tailnet peer passes the transport gate (the front-door auth layer may
    # still 401 it — that is not the gate's 403).
    resp = client.get("/health", environ_overrides={"REMOTE_ADDR": "100.64.31.7"})
    assert resp.status_code != 403
    # Tunnel-style request: loopback peer with forwarding headers set must pass
    # the TRANSPORT gate (the auth layer treats it as non-local, by design).
    resp = client.get("/health", environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
                      headers={"X-Forwarded-For": "203.0.113.7"})
    assert resp.status_code != 403
