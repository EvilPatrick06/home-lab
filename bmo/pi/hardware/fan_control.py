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
