"""BMO structured logging shim — wraps stdlib `logging` with the BMO-specific
defaults so callers can do:

    from services.bmo_logging import get_logger
    log = get_logger("calendar")     # one per module / subsystem
    log.info("synced %d events", n)
    log.exception("Cache refresh failed")  # inside `except`, captures stack

Why a shim instead of direct stdlib use:
- `BMO_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR` env var controls verbosity
  globally without per-module config files.
- `BMO_LOG_FILE=/path/...` opt-in adds a rotating file handler (10 MB × 5)
  with WARNING+ only, leaving stdout / journald for INFO+.
- `BMO_LOG_FORMAT=json` opt-in produces structured records (one JSON object
  per line) for shipping to Loki / Vector / etc. Default is the human
  format `2026-04-25 13:14:15,000 [INFO] [calendar] synced 12 events`.
- `journalctl -u bmo -p err` works because each record's `LEVELNUM` is
  set explicitly via the StreamHandler.

The shim is idempotent — re-importing in tests or a re-entrant module load
returns the already-configured logger without duplicating handlers.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler


_LEVEL_DEFAULT = "INFO"
_LOG_FORMAT_HUMAN = "%(asctime)s [%(levelname)s] [%(name)s] %(message)s"


class _JsonFormatter(logging.Formatter):
    """Emit one JSON record per log line (opt-in via BMO_LOG_FORMAT=json)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "name": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _resolve_level(name: str | None) -> int:
    if not name:
        return logging.INFO
    val = getattr(logging, name.upper(), None)
    return val if isinstance(val, int) else logging.INFO


def _build_formatter() -> logging.Formatter:
    if (os.environ.get("BMO_LOG_FORMAT") or "").lower() == "json":
        return _JsonFormatter()
    return logging.Formatter(_LOG_FORMAT_HUMAN)


def get_logger(name: str) -> logging.Logger:
    """Return a configured stdlib logger. Idempotent — safe to call any number
    of times per name."""
    log = logging.getLogger(name)
    # Preserve the BMO-specific config across re-imports / tests.
    if getattr(log, "_bmo_configured", False):
        return log

    level_name = os.environ.get("BMO_LOG_LEVEL", _LEVEL_DEFAULT).upper()
    log.setLevel(_resolve_level(level_name))
    # Don't bubble up to root — root may have its own handler from another lib
    # (Flask/SocketIO sometimes attaches one), causing duplicate emission.
    log.propagate = False

    fmt = _build_formatter()

    # stdout — captured by systemd-journald; main observability surface.
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)

    # Optional rotating file (warnings and above only). systemd-journald
    # already handles rotation for stdout, so the file handler is mostly for
    # local tail-able backup.
    log_file = os.environ.get("BMO_LOG_FILE")
    if log_file:
        try:
            fh = RotatingFileHandler(
                log_file, maxBytes=10 * 1024 * 1024, backupCount=5,
            )
            fh.setFormatter(fmt)
            fh.setLevel(logging.WARNING)
            log.addHandler(fh)
        except OSError:
            # Don't fail at import time if the path isn't writable; just skip
            # the file handler and let stdout do the work.
            pass

    log._bmo_configured = True  # type: ignore[attr-defined]
    return log
