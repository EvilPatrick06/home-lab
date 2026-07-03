"""BMO Case Fan Controller — 7-step interpolated curve for FNK0100K (I2C 0x21).

Uses CPU thermal zone for temperature (more reliable than I2C temp sensor).
Sets PWM frequency to 100kHz on startup to eliminate audible whine.

Curve is ordered cool->hot with linear interpolation between rungs, EMA-smoothed
input temperature, and curve-evaluation hysteresis so the stay-up rule survives
future curve edits that duplicate a duty across rungs.

Fail-safe stance (BMO-SUGGESTIONS 2026-06-29 "fan fails hot + observable"):
this is the one service guarding thermal safety, so it fails HOT — on any I2C
error, and on a clean stop while the SoC is warm, it drives FULL duty (255)
rather than holding the last (possibly low) duty or zeroing it. It also emits a
systemd Type=notify watchdog ping each successful loop tick (via
`systemd.daemon` when available), so a wedged I2C loop is restarted by systemd
instead of silently stalling with the fan pinned low.
"""

import time

try:
    import smbus
    _SMBUS_AVAILABLE = True
except ImportError:
    # Off-Pi / no python3-smbus: keep the module importable (curve logic is
    # pure) for smoke tests; run() will refuse to spin without a real bus.
    smbus = None
    _SMBUS_AVAILABLE = False

# systemd watchdog notifications — optional. The unit runs Type=notify with
# WatchdogSec, so we must ping READY=1 once at startup and WATCHDOG=1 each tick;
# if the module is missing (dev host) these become no-ops and the unit should
# stay Type=simple there.
try:
    from systemd import daemon as _sd

    def _sd_notify(state: str) -> None:
        try:
            _sd.notify(state)
        except Exception:
            pass
except Exception:  # pragma: no cover - systemd absent off-Pi
    def _sd_notify(state: str) -> None:
        return None

ADDR = 0x21
REG_FAN_MODE = 0x04
REG_FAN_FREQ = 0x05
REG_FAN_DUTY = 0x06

PWM_FREQ = 100000  # 100 kHz — inaudible

# Fail-safe duty: on any uncertainty (I2C error, or clean stop while warm) drive
# the fan flat-out. The FNK0100K holds its last-set duty when commands stop, so
# holding a low duty during an error while the SoC heats is the dangerous case.
SAFE_DUTY = 255
# Below this SoC temp a clean stop may zero the fan (quiet); at/above it a clean
# stop leaves the fan at full duty so a shutdown/restart during load stays cool.
STOP_WARM_C = 60.0

# (cpu_temp_celsius, duty 0-255), ordered cool -> hot.
# Ramped earlier/harder after observed soft-temp throttling at ~84C with the
# old curve (full duty only at 80C). Reaches full duty by 75C and adds mid-band
# duty for more cooling headroom before the SoC soft limit. Trade-off: slightly
# more fan noise under moderate load. Hardware airflow/heatsink contact should
# still be checked (see BMO-ISSUES thermal entry).
FAN_CURVE = [
    (45, 0),
    (50, 60),
    (55, 100),
    (60, 140),
    (65, 180),
    (70, 215),
    (75, 255),
]

HYSTERESIS = 3          # degrees: stay at current duty until curve at (T + H) demands more
POLL_INTERVAL = 3       # seconds
EMA_ALPHA = 0.4         # smoothing factor for temperature
MIN_DUTY_DELTA = 4      # don't rewrite I2C for sub-4-step duty changes


def read_cpu_temp():
    with open('/sys/class/thermal/thermal_zone0/temp') as f:
        return int(f.read().strip()) / 1000.0


def _read_cpu_temp_safe():
    """read_cpu_temp() that never raises — returns None if the zone is unreadable.

    Used on the fail-hot paths where we must not let a temp-read error mask the
    need to drive the fan.
    """
    try:
        return read_cpu_temp()
    except Exception:
        return None


def duty_for_temp(temp):
    """Linear interpolation across FAN_CURVE rungs, clamped at both ends."""
    if temp <= FAN_CURVE[0][0]:
        return FAN_CURVE[0][1]
    if temp >= FAN_CURVE[-1][0]:
        return FAN_CURVE[-1][1]
    for (t_lo, d_lo), (t_hi, d_hi) in zip(FAN_CURVE, FAN_CURVE[1:]):
        if t_lo <= temp <= t_hi:
            frac = (temp - t_lo) / (t_hi - t_lo)
            return int(round(d_lo + frac * (d_hi - d_lo)))
    return FAN_CURVE[-1][1]  # unreachable


def set_pwm_frequency(bus, freq):
    freq_bytes = [
        (freq >> 24) & 0xFF,
        (freq >> 16) & 0xFF,
        (freq >> 8) & 0xFF,
        freq & 0xFF,
    ]
    bus.write_i2c_block_data(ADDR, REG_FAN_FREQ, freq_bytes)
    print(f"[fan] PWM frequency set to {freq} Hz", flush=True)


def _write_duty(bus, duty):
    """Write a duty (0-255) to both fan channels. Raises on I2C failure."""
    bus.write_i2c_block_data(ADDR, REG_FAN_DUTY, [duty, duty])


def _force_full_duty(bus, reason):
    """Best-effort drive the fan to SAFE_DUTY. Never raises.

    Called on the fail-hot paths (loop error, warm stop). Returns True if the
    write landed. On failure it is silent-but-logged; the caller then reopens
    the bus.
    """
    try:
        _write_duty(bus, SAFE_DUTY)
        print(f"[fan] FAIL-SAFE: forcing full duty {SAFE_DUTY}/255 ({reason})", flush=True)
        return True
    except Exception as e:
        print(f"[fan] FAIL-SAFE write failed ({reason}): {e}", flush=True)
        return False


def run():
    if not _SMBUS_AVAILABLE:
        raise RuntimeError("smbus not available — fan controller requires a Pi I2C bus")

    bus = smbus.SMBus(1)
    bus.write_byte_data(ADDR, REG_FAN_MODE, 1)
    time.sleep(0.05)
    set_pwm_frequency(bus, PWM_FREQ)
    time.sleep(0.1)

    current_duty = -1
    smoothed = read_cpu_temp()

    # Tell systemd we are up (Type=notify). No-op if systemd is absent.
    _sd_notify("READY=1")

    while True:
        try:
            temp = read_cpu_temp()
            smoothed = EMA_ALPHA * temp + (1 - EMA_ALPHA) * smoothed

            target_duty = duty_for_temp(smoothed)

            # Hysteresis: if the curve at (smoothed + H) doesn't demand more than current,
            # hold current duty instead of stepping down. Survives curve edits.
            if current_duty >= 0 and target_duty < current_duty:
                if duty_for_temp(smoothed + HYSTERESIS) <= current_duty:
                    target_duty = current_duty

            if current_duty < 0 or abs(target_duty - current_duty) >= MIN_DUTY_DELTA:
                _write_duty(bus, target_duty)
                print(f"[fan] {temp:.1f}C (smooth {smoothed:.1f}C) -> duty {target_duty}/255", flush=True)
                current_duty = target_duty

            # Watchdog: a successful tick means the I2C loop is alive. Ping so a
            # wedged loop (hung I2C transaction) misses the deadline and systemd
            # restarts us. No-op off-Pi.
            _sd_notify("WATCHDOG=1")

        except Exception as e:
            # FAIL HOT: before tearing the bus down, drive full duty so a loop
            # that starts erroring while duty was low can't leave the fan
            # pinned low as the SoC heats up.
            print(f"[fan] Error: {e}", flush=True)
            _force_full_duty(bus, "loop I2C error")
            try:
                bus.close()
            except Exception:
                pass
            time.sleep(2)
            try:
                bus = smbus.SMBus(1)
                # Re-assert full duty on the fresh bus in case the pre-close
                # write did not land.
                _force_full_duty(bus, "post-reopen re-assert")
                current_duty = SAFE_DUTY
            except Exception as e2:
                print(f"[fan] Bus reopen failed: {e2}", flush=True)

        time.sleep(POLL_INTERVAL)


def _shutdown(bus):
    """Clean-stop duty policy: fail HOT if the SoC is warm.

    On a stop/restart while the Pi is under load, leave the fan at full duty so
    the box stays cool through the restart window; only zero it when the SoC is
    comfortably cool.
    """
    temp = _read_cpu_temp_safe()
    if temp is None or temp >= STOP_WARM_C:
        why = "temp unreadable" if temp is None else f"{temp:.1f}C >= {STOP_WARM_C}C"
        print(f"[fan] Stop while warm ({why}) — leaving fan at full duty", flush=True)
        _write_duty(bus, SAFE_DUTY)
    else:
        print(f"[fan] Stop while cool ({temp:.1f}C) — fan off", flush=True)
        _write_duty(bus, 0)


if __name__ == "__main__":
    print("[fan] Starting fan controller (CPU thermal zone, 100kHz PWM, interpolated curve)", flush=True)
    try:
        run()
    except KeyboardInterrupt:
        print("[fan] Stopped", flush=True)
        bus = smbus.SMBus(1)
        bus.write_byte_data(ADDR, REG_FAN_MODE, 1)
        _shutdown(bus)
        bus.close()
