# Phase 37 — BMO Pi 5 fan-tuning + thermal-history alerting

**Domain:** BMO (Pi 5 8 GB + Freenove FNK0100K case + GPIO active cooler)
**Status:** plan only — no source files edited yet
**Created:** 2026-05-29
**Depends on:** none
**Blocks:** none

> BMO-side phase, kept in `dnd-app/docs/phases/` because that's where the active execution backlog lives. Per INSTRUCTIONS.md rule 5, Pi-side phases run `pytest bmo/pi/tests/` instead of the dnd-app 4-gate. There are no dnd-app source edits in this phase, so the dnd-app 4-gate is a no-op.

## Context

Pi 5 throttles at 80 °C (soft) / 85 °C (hard). BMO runs two cooling loops in parallel:

1. **Kernel-driven active cooler** on the official GPIO_FAN header — speeds set by 4 `dtparam=fan_tempN_speed=…` ladder rungs in `/boot/firmware/config.txt`, written by `setup-bmo.sh`.
2. **Userspace I2C fans** on the FNK0100K case (controller `0x21`, fan duty registers shared between two channels) — driven by `fan_control.py` as `bmo-fan.service`.

Problems being fixed in one shot:

- **Top dtparam step caps at 250/255**, leaving headroom right at the throttle line. Bump to 255 so the active cooler runs flat-out when the SoC is about to throttle.
- **`fan_control.py` curve is a 6-step descending table with no interpolation and weak hysteresis.** Idle ramps audibly because the steps are too coarse, and the `if duty == current_duty` hysteresis check breaks if a future curve has two rungs at the same duty. Replace with an ascending curve + linear interpolation + EMA-smoothed temperature + `duty_for_temp(smoothed_temp + HYSTERESIS)` stay-up rule.
- **`health_check.sh` only flags >80 °C** (already-throttling) and never reads `vcgencmd get_throttled`, so sticky under-voltage / past-throttle bits never page anyone. Add a 75 °C warn rung and a throttle-flag check.
- **`SYSTEMD.md` and `README.md`** describe the old single-loop behavior. Update both to reflect the two-stage cooling architecture.

## Files touched

| # | File | Change kind |
|---|---|---|
| 1 | `bmo/setup-bmo.sh` | one-line dtparam edit (line ~73) |
| 2 | `bmo/pi/hardware/fan_control.py` | full-file rewrite |
| 3 | `bmo/pi/scripts/health_check.sh` | warn/critical split + throttle-flag block |
| 4 | `bmo/docs/SYSTEMD.md` | one row + one note |
| 5 | `bmo/README.md` | "Thermal management" subsection |

## Sub-phase summary

- **37a** — dtparam ceiling: 250 → 255 in `setup-bmo.sh`
- **37b** — `fan_control.py` full rewrite (ascending curve + interpolation + EMA + fixed hysteresis)
- **37c** — `health_check.sh` warn/critical split + `vcgencmd get_throttled` block
- **37d** — `SYSTEMD.md` updates (bmo-fan row description + dependencies note)
- **37e** — `README.md` "Thermal management" subsection
- **37f** — Deploy on Pi (SSH, pull, re-run `setup-bmo.sh`, daemon-reload, restart `bmo-fan`, reboot, sanity-check) — **user runs this from the Pi**

---

## Sub-phase 37a — dtparam ceiling 250 → 255

**File:** `bmo/setup-bmo.sh` (line ~73)

```diff
-dtparam=fan_temp3=80000,fan_temp3_hyst=5000,fan_temp3_speed=250
+dtparam=fan_temp3=80000,fan_temp3_hyst=5000,fan_temp3_speed=255
```

**Why:** the official active cooler's PWM range is 0–255 (`/sys/devices/platform/cooling_fan/hwmon/hwmon*/pwm1`). 250 leaves ~2 % headroom unused at the point where the SoC is one degree from throttling. No downside — fan is already at near-max RPM.

**Acceptance:**
- `grep '^dtparam=fan_temp3=' bmo/setup-bmo.sh` returns the new line.
- Activates only after the Pi reboots (config.txt is read at boot).

---

## Sub-phase 37b — `fan_control.py` full rewrite

**File:** `bmo/pi/hardware/fan_control.py` — replace ENTIRE file with the listing below.

Curve table (cool → hot):

| CPU °C | duty 0–255 |
|---|---|
| 50 | 0 |
| 55 | 40 |
| 60 | 70 |
| 65 | 110 |
| 70 | 160 |
| 75 | 210 |
| 80 | 255 |

Properties:
- **`FAN_CURVE` ordered cool → hot** (opposite of current). `duty_for_temp(temp)` linearly interpolates between adjacent rungs, clamps below 50 °C to 0, clamps above 80 °C to 255.
- **EMA smoothing:** `smoothed = EMA_ALPHA * temp + (1 - EMA_ALPHA) * smoothed`, `EMA_ALPHA = 0.4`. Reduces audible up/down oscillation from quick load spikes.
- **Hysteresis via curve evaluation:** stay at current duty if `duty_for_temp(smoothed + HYSTERESIS) <= current_duty`. Replaces the fragile `if duty == current_duty` check. `HYSTERESIS = 3`.
- **`MIN_DUTY_DELTA = 4`** — don't rewrite the I2C duty register for sub-4-step duty changes. Cuts I2C chatter when the curve is hovering between rungs.
- **`POLL_INTERVAL = 3`**, **`PWM_FREQ = 100_000`** (unchanged — inaudible PWM frequency).
- Both fan channels share the duty: `bus.write_i2c_block_data(ADDR, REG_FAN_DUTY, [target_duty, target_duty])`.
- Exception path: close + reopen `smbus.SMBus(1)` (current behavior preserved).
- SIGINT cleanup: set mode=1, duty=[0,0], close (current behavior preserved).

```python
"""BMO Case Fan Controller — 7-step interpolated curve for FNK0100K (I2C 0x21).

Uses CPU thermal zone for temperature (more reliable than I2C temp sensor).
Sets PWM frequency to 100kHz on startup to eliminate audible whine.

Curve is ordered cool->hot with linear interpolation between rungs, EMA-smoothed
input temperature, and curve-evaluation hysteresis so the stay-up rule survives
future curve edits that duplicate a duty across rungs.
"""

import smbus
import time

ADDR = 0x21
REG_FAN_MODE = 0x04
REG_FAN_FREQ = 0x05
REG_FAN_DUTY = 0x06

PWM_FREQ = 100000  # 100 kHz — inaudible

# (cpu_temp_celsius, duty 0-255), ordered cool -> hot.
FAN_CURVE = [
    (50, 0),
    (55, 40),
    (60, 70),
    (65, 110),
    (70, 160),
    (75, 210),
    (80, 255),
]

HYSTERESIS = 3          # degrees: stay at current duty until curve at (T + H) demands more
POLL_INTERVAL = 3       # seconds
EMA_ALPHA = 0.4         # smoothing factor for temperature
MIN_DUTY_DELTA = 4      # don't rewrite I2C for sub-4-step duty changes


def read_cpu_temp():
    with open('/sys/class/thermal/thermal_zone0/temp') as f:
        return int(f.read().strip()) / 1000.0


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


def run():
    bus = smbus.SMBus(1)
    bus.write_byte_data(ADDR, REG_FAN_MODE, 1)
    time.sleep(0.05)
    set_pwm_frequency(bus, PWM_FREQ)
    time.sleep(0.1)

    current_duty = -1
    smoothed = read_cpu_temp()

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
                bus.write_i2c_block_data(ADDR, REG_FAN_DUTY, [target_duty, target_duty])
                print(f"[fan] {temp:.1f}C (smooth {smoothed:.1f}C) -> duty {target_duty}/255", flush=True)
                current_duty = target_duty

        except Exception as e:
            print(f"[fan] Error: {e}", flush=True)
            try:
                bus.close()
            except Exception:
                pass
            time.sleep(2)
            bus = smbus.SMBus(1)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    print("[fan] Starting fan controller (CPU thermal zone, 100kHz PWM, interpolated curve)", flush=True)
    try:
        run()
    except KeyboardInterrupt:
        print("[fan] Stopped", flush=True)
        bus = smbus.SMBus(1)
        bus.write_byte_data(ADDR, REG_FAN_MODE, 1)
        bus.write_i2c_block_data(ADDR, REG_FAN_DUTY, [0, 0])
        bus.close()
```

**Acceptance:**
- File parses on the Pi (`python3 -c 'import ast; ast.parse(open("bmo/pi/hardware/fan_control.py").read())'`).
- `bmo-fan` restarts cleanly and the first log line shows the new banner ("interpolated curve").
- Bench test by holding the SoC at 65 °C with `stress-ng --cpu 4` and confirm `journalctl -u bmo-fan` shows duty around 110.

---

## Sub-phase 37c — `health_check.sh` warn/critical + throttle history

**File:** `bmo/pi/scripts/health_check.sh`

**Change 1 — split the temp check (around line 43):**

```diff
-    if [ "$TEMP_C" -gt 80 ]; then
-        MSG+="CPU temp critical: ${TEMP_C}C. "
-        STATUS=1
-    fi
+    if [ "$TEMP_C" -gt 80 ]; then
+        MSG+="CPU temp critical: ${TEMP_C}C (throttling). "
+        STATUS=1
+    elif [ "$TEMP_C" -gt 75 ]; then
+        MSG+="CPU temp warning: ${TEMP_C}C. "
+        STATUS=1
+    fi
```

**Change 2 — add a `vcgencmd get_throttled` block immediately after the temp check:**

```bash
# Check Pi throttle / under-voltage history (Pi 5 sticky bits)
if command -v vcgencmd >/dev/null 2>&1; then
    TH=$(vcgencmd get_throttled | sed 's/throttled=//')
    if [ "$TH" != "0x0" ]; then
        MSG+="Throttle/voltage flags: ${TH}. "
        STATUS=1
    fi
fi
```

**Why:** sticky bits in `vcgencmd get_throttled` record every under-voltage and throttle event since boot. Without reading them, a power-supply sag at 03:00 is invisible at 09:00 unless someone catches it in the live temp poll.

**Acceptance:**
- `bash -n bmo/pi/scripts/health_check.sh` passes.
- Run the script manually on the Pi; current temp + throttle flags are reported cleanly when above 75 °C.

---

## Sub-phase 37d — `SYSTEMD.md` updates

**File:** `bmo/docs/SYSTEMD.md`

**Change 1 — services-overview row (line 10):**

```diff
-| `bmo-fan.service` | generated by `bmo/setup-bmo.sh` | `/usr/bin/python3 /home/patrick/home-lab/bmo/pi/hardware/fan_control.py` |
+| `bmo-fan.service` | generated by `bmo/setup-bmo.sh` | `/usr/bin/python3 /home/patrick/home-lab/bmo/pi/hardware/fan_control.py` — FNK0100K case-fan I2C controller, 7-rung interpolated curve |
```

**Change 2 — append a paragraph immediately after the dependency tree block (line 35):**

```
**Two-stage cooling.** The Pi runs two thermal loops in parallel. The kernel
drives the official GPIO active cooler from the `dtparam=fan_tempN_*` ladder
in `/boot/firmware/config.txt` (4 rungs, 60/67/75/80 °C). `bmo-fan.service`
drives the FNK0100K I2C case fans via `fan_control.py` using a 7-rung curve
from 50 → 80 °C with linear interpolation and EMA-smoothed input temperature.
The two loops are independent — neither knows about the other; both target
the same SoC thermal zone.
```

**Acceptance:**
- `grep -n 'Two-stage cooling' bmo/docs/SYSTEMD.md` returns one hit.
- The bmo-fan row in the services table cites the FNK0100K controller.

---

## Sub-phase 37e — `README.md` "Thermal management" subsection

**File:** `bmo/README.md`

Add a new subsection between the existing Hardware table and the "Quick start (Pi owner)" section. Keep it tight — README, not docs.

```markdown
## Thermal management

The Pi 5 throttles at 80 °C (soft) and 85 °C (hard). BMO uses two independent
cooling loops:

- **Official GPIO active cooler** — kernel-driven via `dtparam=fan_tempN_*` in
  `/boot/firmware/config.txt`. Four rungs at 60 / 67 / 75 / 80 °C, written by
  `setup-bmo.sh`. Top rung is at PWM 255 (full-speed) at 80 °C.
- **FNK0100K case fans** — userspace via `bmo-fan.service` →
  `pi/hardware/fan_control.py`. 7-rung curve (50 → 80 °C) with linear
  interpolation between rungs and EMA-smoothed input temperature so idle
  doesn't oscillate. PWM frequency 100 kHz (inaudible).

`pi/scripts/health_check.sh` raises a warning at > 75 °C and a critical alert
at > 80 °C, and reads `vcgencmd get_throttled` so sticky under-voltage /
past-throttle bits are surfaced even after the Pi cools off.
```

**Acceptance:**
- `grep -n '## Thermal management' bmo/README.md` returns one hit.
- The subsection lands BEFORE "Quick start (Pi owner)".

---

## Sub-phase 37f — Pi-side deploy

**Runs on the Pi (SSH from the laptop).** All five edits land on master before this step — git is the transport.

```bash
# 1. Pull the new files
cd ~/home-lab && git pull

# 2. Re-run the idempotent bootstrap to rewrite /boot/firmware/config.txt with the new fan_temp3_speed=255
bash bmo/setup-bmo.sh

# 3. Pick up the new fan_control.py (bmo-fan.service file itself is unchanged, but the script behind ExecStart was replaced)
sudo systemctl daemon-reload && sudo systemctl restart bmo-fan
systemctl status bmo-fan --no-pager
journalctl -u bmo-fan -n 30 --no-pager

# 4. config.txt change only takes effect at boot
sudo reboot
```

After reboot, sanity-check both cooling loops:

```bash
vcgencmd measure_temp                                              # current SoC temp
vcgencmd get_throttled                                             # should be 0x0 if no throttle/voltage history this boot
sudo i2cget -y 1 0x21 0xf9                                         # FNK0100 fan0 duty readback
sudo i2cget -y 1 0x21 0xfa                                         # FNK0100 fan1 duty readback
cat /sys/devices/platform/cooling_fan/hwmon/hwmon*/pwm1            # official cooler duty (0-255)
```

Expected at idle (~45–55 °C):
- `pwm1` reports a low value from the first dtparam rung (or 0 below 60 °C).
- `i2cget 0xf9` / `0xfa` report ~0–40 (interpolated curve has 0 at 50 °C, 40 at 55 °C).
- `get_throttled` is `0x0`.

To stress-test:

```bash
sudo apt-get install -y stress-ng
stress-ng --cpu 4 --timeout 90s
# in another shell:
watch -n 1 'vcgencmd measure_temp; sudo i2cget -y 1 0x21 0xf9; cat /sys/devices/platform/cooling_fan/hwmon/hwmon*/pwm1'
```

Expect SoC to climb past 70 °C with case-fan duty climbing through ~160 → ~210 (the 70 → 75 °C interpolation range) and the active cooler stepping up through its dtparam rungs.

---

## Constraints & edge cases

- **Idempotency.** `bmo/setup-bmo.sh` overwrites `/boot/firmware/config.txt` from a here-doc — running it again on every deploy is intentional. Custom edits outside the BMO-managed block survive; anything inside is replaced. Check before deploying.
- **Two-fan duty register.** FNK0100K fan duty register `0x06` takes two bytes — one per fan. Always write both to keep them in sync; never write a single byte (some firmwares interpret that as "leave channel 2 untouched", others as "set channel 2 to 0").
- **PWM ceiling on the active cooler.** The official cooler reports 255 as max PWM; some kernel builds clamp at 255 even if you write higher. 255 is correct, not "almost the max."
- **EMA cold-start.** First sample after service start initializes `smoothed = read_cpu_temp()` — no zero-bias spike.
- **HYSTERESIS interaction with MIN_DUTY_DELTA.** A small temp drift can put `target_duty` just under `current_duty` with the curve at `smoothed + HYSTERESIS` still demanding the current rung — that path correctly holds, then MIN_DUTY_DELTA suppresses the I2C write entirely. Both rules are additive: hysteresis decides "should I step down at all?", MIN_DUTY_DELTA decides "is this delta worth writing?"
- **No new tests.** `bmo/pi/tests/` mocks `smbus` and the thermal zone for the existing pytest suite. The curve math (`duty_for_temp`) is a pure function and would be testable, but per the originating user directive the focus is shipping the curve, not building a test pyramid for it. If a future phase wants coverage, add `tests/test_fan_curve.py` asserting boundary cases (49 °C → 0, 50 °C → 0, 55 °C → 40, 57.5 °C → 55, 80 °C → 255, 100 °C → 255).

## Completed

- nothing yet — plan only.

## After 37e ships (before 37f)

The user runs 37f from the Pi. The agent's job is to relay the deploy block above and wait for confirmation. After confirmation:

- delete `~/.claude/projects/C--Users-evilp/memory/project_bmo_pending_fan_changes.md`
- remove the matching line from `~/.claude/projects/C--Users-evilp/memory/MEMORY.md`
- long-term hardware context stays in `project_bmo_pi_hardware.md`
