"""Regression tests for the fan controller fail-safe behavior
(BMO-SUGGESTIONS 2026-06-29: fan fails HOT + observable).

The controller guards import smbus so the module is importable off-Pi (smbus is
absent in CI); the curve + duty logic is pure and the fail-safe paths take a
fake bus, so all of this is testable without hardware.
"""

from unittest.mock import MagicMock

from hardware import fan_control as fc


class TestDutyCurve:
    def test_cool_is_zero_duty(self):
        assert fc.duty_for_temp(30) == 0
        assert fc.duty_for_temp(45) == 0

    def test_full_duty_by_75c(self):
        assert fc.duty_for_temp(75) == 255
        assert fc.duty_for_temp(90) == 255

    def test_monotonic_non_decreasing(self):
        prev = -1
        for t in range(30, 95):
            d = fc.duty_for_temp(t)
            assert d >= prev, f"curve dipped at {t}C"
            prev = d


class TestFailHot:
    def test_force_full_duty_commands_255(self):
        bus = MagicMock()
        assert fc._force_full_duty(bus, "test") is True
        bus.write_i2c_block_data.assert_called_once_with(
            fc.ADDR, fc.REG_FAN_DUTY, [fc.SAFE_DUTY, fc.SAFE_DUTY]
        )
        assert fc.SAFE_DUTY == 255

    def test_force_full_duty_never_raises_on_i2c_error(self):
        bus = MagicMock()
        bus.write_i2c_block_data.side_effect = OSError("I2C bus error")
        assert fc._force_full_duty(bus, "test") is False

    def test_shutdown_while_warm_leaves_full_duty(self, monkeypatch):
        monkeypatch.setattr(fc, "read_cpu_temp", lambda: fc.STOP_WARM_C + 5)
        bus = MagicMock()
        fc._shutdown(bus)
        bus.write_i2c_block_data.assert_called_once_with(
            fc.ADDR, fc.REG_FAN_DUTY, [fc.SAFE_DUTY, fc.SAFE_DUTY]
        )

    def test_shutdown_while_cool_turns_fan_off(self, monkeypatch):
        monkeypatch.setattr(fc, "read_cpu_temp", lambda: fc.STOP_WARM_C - 20)
        bus = MagicMock()
        fc._shutdown(bus)
        bus.write_i2c_block_data.assert_called_once_with(fc.ADDR, fc.REG_FAN_DUTY, [0, 0])

    def test_shutdown_with_unreadable_temp_fails_hot(self, monkeypatch):
        def _boom():
            raise OSError("thermal zone gone")
        monkeypatch.setattr(fc, "read_cpu_temp", _boom)
        bus = MagicMock()
        fc._shutdown(bus)
        bus.write_i2c_block_data.assert_called_once_with(
            fc.ADDR, fc.REG_FAN_DUTY, [fc.SAFE_DUTY, fc.SAFE_DUTY]
        )
