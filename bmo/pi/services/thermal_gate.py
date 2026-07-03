"""Thermal admission gate for local-LLM (Ollama) fallback inference.

BMO-ISSUES [2026-06-29] thermal entry: local-LLM fallback pegs all four
cores and pushes the SoC to ~85C / active hardware throttle (``THROTTLED
NOW``, flags 0xe0006) even with the fan curve saturated (full duty at 75C
since the 2026-06-22 retune). Software cannot add airflow, but it CAN stop
adding heat at the worst moment. This gate, applied by ``agent._local_chat``
immediately before a CPU-bound inference burst:

1. **Cooldown wait** — if the SoC is already at/above the monitoring
   CRITICAL threshold (80C, ``services/monitoring.py``), wait briefly
   (bounded) for the saturated fan to pull the temperature back below a
   resume threshold before starting inference, instead of piling a
   4-core burst onto an already-throttling SoC.
2. **Hot-clamp** — if the SoC is still hot when the bounded wait expires,
   clamp the generation budget (``num_predict``) so the burst is short
   rather than sustained. The request is answered either way — worst case
   the reply starts a few seconds later and is briefer.

The gate never refuses a request and is a strict no-op when the thermal
zone cannot be read (dev boxes, CI, containers) or the SoC is cool.

Env overrides (all optional):
    BMO_THERMAL_GATE_C          engage threshold, C        (default 80.0)
    BMO_THERMAL_RESUME_C        resume-below threshold, C  (default 76.0)
    BMO_THERMAL_MAX_WAIT_S      max cooldown wait, s       (default 20)
    BMO_THERMAL_POLL_S          cooldown poll interval, s  (default 2)
    BMO_THERMAL_HOT_NUM_PREDICT clamped num_predict        (default 256)
    BMO_THERMAL_ZONE            thermal zone sysfs path
    BMO_THERMAL_GATE_DISABLE=1  disable the gate entirely
"""

import os
import time

from services.bmo_logging import get_logger

log = get_logger("thermal_gate")

THERMAL_ZONE = os.environ.get(
    "BMO_THERMAL_ZONE", "/sys/class/thermal/thermal_zone0/temp")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "") or default)
    except (TypeError, ValueError):
        return default


GATE_C = _env_float("BMO_THERMAL_GATE_C", 80.0)
RESUME_C = _env_float("BMO_THERMAL_RESUME_C", 76.0)
MAX_WAIT_S = _env_float("BMO_THERMAL_MAX_WAIT_S", 20.0)
POLL_S = _env_float("BMO_THERMAL_POLL_S", 2.0)
HOT_NUM_PREDICT = int(_env_float("BMO_THERMAL_HOT_NUM_PREDICT", 256))


def read_soc_temp() -> float | None:
    """Best-effort SoC temperature in Celsius; None when unreadable."""
    try:
        with open(THERMAL_ZONE) as f:
            return int(f.read().strip()) / 1000.0
    except (OSError, ValueError):
        return None


def gate_local_llm_options(options: dict | None) -> dict | None:
    """Admission-gate a local Ollama call; returns the options to use.

    Cool SoC / unreadable zone / disabled -> returns ``options`` unchanged.
    Hot SoC -> waits (bounded) for cooldown; if still hot afterwards,
    returns a copy of ``options`` with ``num_predict`` clamped.
    """
    if os.environ.get("BMO_THERMAL_GATE_DISABLE") == "1":
        return options

    temp = read_soc_temp()
    if temp is None or temp < GATE_C:
        return options

    log.warning("SoC %.1fC >= %.0fC before local inference — waiting up to "
                "%.0fs for cooldown", temp, GATE_C, MAX_WAIT_S)
    deadline = time.monotonic() + MAX_WAIT_S
    while time.monotonic() < deadline:
        time.sleep(POLL_S)
        temp = read_soc_temp()
        if temp is None or temp < RESUME_C:
            cooled = "unknown" if temp is None else f"{temp:.1f}C"
            log.info("cooled to %s — proceeding with normal options", cooled)
            return options

    clamped = dict(options or {})
    base_predict = clamped.get("num_predict")
    clamped["num_predict"] = (HOT_NUM_PREDICT if base_predict is None
                              else min(base_predict, HOT_NUM_PREDICT))
    log.warning("still %.1fC after %.0fs — clamping num_predict to %d for a "
                "short burst", temp, MAX_WAIT_S, clamped["num_predict"])
    return clamped
