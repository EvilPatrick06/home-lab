"""Transport-layer source-address gate (SECURITY-LOG 2026-06-29, resolved 2026-07-02).

BMO binds a single wildcard listener so one gevent server can serve every
legitimate ingress path — but the legitimate paths are only:

  * loopback    — cloudflared (the TLS-terminated tunnel), the kiosk, the
                  deploy canary / health probes, local scripts;
  * the tailnet — WireGuard-encrypted Tailscale clients
                  (100.64.0.0/10 CGNAT IPv4, fd7a:115c:a1e0::/48 ULA IPv6).

The raw physical-LAN leg (home Wi-Fi / IoT / guest devices) is plain HTTP: any
client authenticating there puts the shared front-door ``BMO_API_KEY`` on the
wire in cleartext, and the gated admin surface should not be reachable from
arbitrary LAN positions at all. This WSGI wrapper therefore REJECTS (403) any
connection whose **socket peer address** is outside the allowed ranges — the
app-level equivalent of binding loopback+tailscale0 only. (A single gevent
listener cannot multi-bind two interfaces, and a host-firewall rule would need
root from the deploy path; this gate ships and deploys with the app.)

The check uses the socket peer address (``REMOTE_ADDR``), NEVER forwarded
headers: tunnel traffic arrives FROM loopback carrying ``X-Forwarded-For`` and
must pass, while a LAN client spoofing forwarding headers is still judged by
its real peer address. It wraps ``app.wsgi_app`` AFTER flask-socketio installs
its middleware, so it fronts both the Flask routes and the socket.io
transport.

Escape hatches (env, read at install time):

* ``BMO_SOURCE_GATE=off``                 — disable entirely (restores the old
  open-LAN listener; not recommended).
* ``BMO_EXTRA_SOURCE_CIDRS=192.168.1.0/24,...`` — additionally allow specific
  source ranges (e.g. a trusted LAN subnet, until a TLS-fronted LAN path
  exists).

dnd-app note: LAN clients that mDNS-discovered the Pi probe ``/health`` before
adopting a base URL; when the LAN-direct probe stops answering they fall back
to the https tunnel automatically, so this narrows transport without breaking
discovery UX.
"""

from __future__ import annotations

import ipaddress
import logging
import os
from typing import Callable, Iterable

log = logging.getLogger("bmo")

# Loopback + Tailscale. The physical-LAN RFC1918 ranges are deliberately NOT
# here — that cleartext leg is exactly what this gate closes.
DEFAULT_ALLOWED_CIDRS = (
    "127.0.0.0/8",          # loopback: cloudflared, kiosk, canary, health probes
    "::1/128",              # IPv6 loopback
    "100.64.0.0/10",        # Tailscale CGNAT IPv4
    "fd7a:115c:a1e0::/48",  # Tailscale ULA IPv6
)

_REJECT_BODY = (
    b'{"error": "direct LAN access to BMO is disabled; connect via the '
    b'Cloudflare tunnel or the tailnet (see source_gate.py)"}'
)


def _parse_networks(cidrs: Iterable[str]) -> list:
    nets = []
    for raw in cidrs:
        c = (raw or "").strip()
        if not c:
            continue
        try:
            nets.append(ipaddress.ip_network(c, strict=False))
        except ValueError:
            log.warning("[source-gate] ignoring invalid CIDR %r", c)
    return nets


def allowed_source_networks() -> list:
    """Default allowed ranges plus any BMO_EXTRA_SOURCE_CIDRS additions."""
    extra = (os.environ.get("BMO_EXTRA_SOURCE_CIDRS") or "").split(",")
    return _parse_networks(list(DEFAULT_ALLOWED_CIDRS) + extra)


def is_allowed_source(addr: str, networks: list) -> bool:
    """True when the SOCKET peer address falls inside an allowed range.

    An empty/missing address is allowed (non-TCP transports, WSGI test
    harnesses); an unparseable one is rejected. IPv4-mapped IPv6 addresses
    (``::ffff:192.168.1.9``) are judged as their embedded IPv4 address.
    """
    if not addr:
        return True
    try:
        ip = ipaddress.ip_address(addr.strip())
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return any(ip in net for net in networks)


class SourceGate:
    """WSGI middleware rejecting connections from non-loopback/non-tailnet peers."""

    def __init__(self, wsgi_app: Callable, networks: list | None = None) -> None:
        self._app = wsgi_app
        self._networks = networks if networks is not None else allowed_source_networks()

    def __call__(self, environ, start_response):
        addr = environ.get("REMOTE_ADDR", "")
        if is_allowed_source(addr, self._networks):
            return self._app(environ, start_response)
        log.warning("[source-gate] rejected %s %s from disallowed source %s",
                    environ.get("REQUEST_METHOD", "?"), environ.get("PATH_INFO", "?"), addr)
        start_response(
            "403 Forbidden",
            [("Content-Type", "application/json"),
             ("Content-Length", str(len(_REJECT_BODY)))],
        )
        return [_REJECT_BODY]


def install_source_gate(flask_app) -> bool:
    """Wrap ``flask_app.wsgi_app`` in the gate. Returns True when installed.

    Call AFTER flask-socketio has wrapped ``wsgi_app`` so socket.io traffic is
    gated too. ``BMO_SOURCE_GATE=off`` skips installation (old open-LAN
    behavior) with a loud log line so the wide-open listener is visible.
    """
    if (os.environ.get("BMO_SOURCE_GATE") or "").strip().lower() in ("off", "0", "false", "disabled"):
        log.warning(
            "[source-gate] BMO_SOURCE_GATE=off — :%s stays reachable from the raw "
            "physical LAN (cleartext BMO_API_KEY risk; see SECURITY docs)",
            os.environ.get("BMO_PORT", "5000"),
        )
        return False
    flask_app.wsgi_app = SourceGate(flask_app.wsgi_app)
    log.info("[source-gate] transport gate active: loopback + tailnet%s",
             " + extra CIDRs" if (os.environ.get("BMO_EXTRA_SOURCE_CIDRS") or "").strip() else "")
    return True
