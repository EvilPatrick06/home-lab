"""Minimal sd_notify / systemd Type=notify watchdog helper — dependency-free.

No-op unless run under a systemd unit with Type=notify (NOTIFY_SOCKET set) and a
watchdog (WATCHDOG_USEC set). Lets a long-running bot signal readiness and prove
liveness so a process-alive-but-gateway-dead "zombie" gets restarted.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket

logger = logging.getLogger("bmo")


def _send(msg: str) -> None:
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return  # not running under Type=notify
    if addr.startswith("@"):  # abstract namespace socket
        addr = "\0" + addr[1:]
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
            sock.sendto(msg.encode("utf-8"), addr)
    except OSError as e:
        logger.debug("sd_notify send failed: %s", e)


def notify_ready() -> None:
    """Tell systemd startup is complete (READY=1)."""
    _send("READY=1")


def notify_watchdog() -> None:
    _send("WATCHDOG=1")


def watchdog_interval() -> float | None:
    """Configured WatchdogSec in seconds, or None if no watchdog is set."""
    usec = os.environ.get("WATCHDOG_USEC")
    if not usec:
        return None
    try:
        return int(usec) / 1_000_000.0
    except ValueError:
        return None


async def run_watchdog(is_healthy) -> None:
    """Ping WATCHDOG=1 at half the configured interval while is_healthy() is True.
    Returns immediately (no-op) when not under a watchdog unit."""
    interval = watchdog_interval()
    if interval is None:
        return
    ping_every = max(1.0, interval / 2.0)
    while True:
        await asyncio.sleep(ping_every)
        try:
            if is_healthy():
                notify_watchdog()
        except Exception:
            pass
