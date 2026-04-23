"""BMO Case Fan Controller — 4-step curve for Freenove GPIO Board (I2C 0x21).

Uses CPU thermal zone for temperature (more reliable than I2C temp sensor).
Sets PWM frequency to 100kHz on startup to eliminate audible whine.
"""

import smbus
import time

ADDR = 0x21
REG_FAN_MODE = 0x04
REG_FAN_FREQ = 0x05
REG_FAN_DUTY = 0x06
REG_FAN_POWER_SWITCH = 0x0a

PWM_FREQ = 100000  # 100kHz — inaudible, eliminates fan whine

# Fan curve: (cpu_temp_celsius, duty 0-255)
FAN_CURVE = [
    (70, 230),  # high
    (63, 160),  # medium
    (55, 100),  # low
    (45, 50),   # gentle
]
HYSTERESIS = 5  # degrees below threshold before stepping down
POLL_INTERVAL = 5  # seconds


def read_cpu_temp():
    """Read CPU temperature from sysfs thermal zone (millidegrees -> degrees)."""
    with open('/sys/class/thermal/thermal_zone0/temp') as f:
        return int(f.read().strip()) / 1000.0


def set_pwm_frequency(bus, freq):
    """Set PWM frequency as 4-byte big-endian integer."""
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

    # Set manual mode
    bus.write_byte_data(ADDR, REG_FAN_MODE, 1)
    time.sleep(0.05)

    # Set PWM frequency above audible range
    set_pwm_frequency(bus, PWM_FREQ)
    time.sleep(0.1)

    current_duty = -1

    while True:
        try:
            temp = read_cpu_temp()

            # Find the right duty for current temp
            target_duty = 0  # off below all thresholds
            for threshold, duty in FAN_CURVE:
                if temp >= threshold:
                    target_duty = duty
                    break

            # Hysteresis: only step down if temp is below threshold minus hysteresis
            if target_duty < current_duty:
                for threshold, duty in FAN_CURVE:
                    if duty == current_duty:
                        if temp >= threshold - HYSTERESIS:
                            target_duty = current_duty
                        break

            if target_duty != current_duty:
                bus.write_i2c_block_data(ADDR, REG_FAN_DUTY, [target_duty, target_duty])
                if target_duty == 0:
                    bus.write_byte_data(ADDR, REG_FAN_POWER_SWITCH, 0)
                else:
                    bus.write_byte_data(ADDR, REG_FAN_POWER_SWITCH, 1)
                print(f"[fan] {temp:.1f}°C → duty {target_duty}/255", flush=True)
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
    print("[fan] Starting fan controller (CPU thermal zone, 100kHz PWM)", flush=True)
    try:
        run()
    except KeyboardInterrupt:
        print("[fan] Stopped", flush=True)
        bus = smbus.SMBus(1)
        bus.write_byte_data(ADDR, REG_FAN_MODE, 1)
        bus.write_i2c_block_data(ADDR, REG_FAN_DUTY, [0, 0])
        bus.write_byte_data(ADDR, REG_FAN_POWER_SWITCH, 0)
        bus.close()
