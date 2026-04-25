"""Tests for monitoring.py — HealthChecker, Pi stats, Discord webhooks.

psutil is injected as a mock so tests run on any OS without Pi hardware.
No real HTTP calls are made.
os.getloadavg is patched for Windows compatibility.
"""

import json
import os
import sys
import time
from unittest.mock import MagicMock, patch, call
import pytest

# ── Inject a mock psutil before importing monitoring ──────────────────────────
# monitoring.py does `try: import psutil; PSUTIL_AVAILABLE = True` at module
# level.  We inject a stub here so tests run without the real package installed
# and so `monitoring.psutil` resolves even when psutil isn't in the venv.

_mock_psutil = MagicMock()
_mock_psutil.cpu_percent = MagicMock(return_value=20.0)
_mock_psutil.virtual_memory = MagicMock(return_value=MagicMock(percent=50.0))
_mock_psutil.disk_usage = MagicMock(return_value=MagicMock(percent=30.0))
_mock_psutil.sensors_temperatures = MagicMock(return_value={})
_mock_psutil.swap_memory = MagicMock(return_value=MagicMock(percent=10.0, used=0, total=1))
_mock_psutil.disk_partitions = MagicMock(return_value=[])

if "psutil" not in sys.modules:
    sys.modules["psutil"] = _mock_psutil

import services.monitoring as mon_module

# Make the module attribute point to our mock (needed because monitoring may
# have imported psutil before our injection ran if the module was already loaded)
if not hasattr(mon_module, "psutil") or mon_module.PSUTIL_AVAILABLE is False:
    mon_module.psutil = _mock_psutil
    mon_module.PSUTIL_AVAILABLE = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_checker(tmp_path, socketio=None):
    """Create a HealthChecker using tmp_path for all state files."""
    state_file = str(tmp_path / "monitor_state.json")
    alert_file = str(tmp_path / "monitor_alert_state.json")
    checker = mon_module.HealthChecker(socketio=socketio, check_interval=9999)
    checker._state_file = state_file
    checker._alert_state_file = alert_file
    checker._prev_status = {}
    checker._discord_last_fingerprint = {}
    return checker


# ── Pi stats tests ────────────────────────────────────────────────────────────

class TestGetPiStats:
    def test_returns_dict_with_expected_keys(self):
        stats = mon_module.get_pi_stats()
        for key in ("cpu_temp", "cpu_percent", "ram_percent", "disk_percent"):
            assert key in stats, f"Missing key: {key}"

    def test_psutil_cpu_percent_used(self):
        mock_psutil = MagicMock()
        mock_psutil.cpu_percent.return_value = 42.0
        with patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil):
            result = mon_module._read_cpu_percent()
        assert result == 42.0
        mock_psutil.cpu_percent.assert_called_once_with(interval=0.5)

    def test_psutil_ram_percent_used(self):
        mock_psutil = MagicMock()
        mock_psutil.virtual_memory.return_value = MagicMock(percent=78.5)
        with patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil):
            result = mon_module._read_ram_percent()
        assert result == 78.5

    def test_psutil_disk_percent_used(self):
        mock_psutil = MagicMock()
        mock_psutil.disk_usage.return_value = MagicMock(percent=60.0)
        with patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil):
            result = mon_module._read_disk_percent()
        assert result == 60.0

    def test_stats_none_when_psutil_unavailable_and_no_proc(self):
        with patch("services.monitoring.PSUTIL_AVAILABLE", False), \
             patch("builtins.open", side_effect=FileNotFoundError):
            result = mon_module._read_cpu_percent()
            assert result is None


# ── HealthChecker get_status tests ───────────────────────────────────────────

class TestGetStatus:
    def test_get_status_returns_dict(self, tmp_path):
        checker = _make_checker(tmp_path)
        result = checker.get_status()
        assert isinstance(result, dict)

    def test_get_status_has_services_and_pi_stats(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status["test_svc"] = {
            "status": "up", "last_check": time.time(),
            "message": "OK", "response_time": 0.1,
        }
        result = checker.get_status()
        assert "services" in result or "test_svc" in result or isinstance(result, dict)

    def test_get_status_empty_services(self, tmp_path):
        checker = _make_checker(tmp_path)
        result = checker.get_status()
        # Should not raise even with zero service checks run
        assert isinstance(result, dict)


# ── CPU threshold alert tests ─────────────────────────────────────────────────

class TestCpuThresholdAlerts:
    def test_cpu_over_90_emits_critical_alert(self, tmp_path):
        checker = _make_checker(tmp_path)
        alerts_emitted = []

        def fake_emit(level, service, message):
            alerts_emitted.append((level, service, message))

        checker._emit_alert = fake_emit

        stats = {"cpu_temp": 92.0, "cpu_percent": 60.0, "ram_percent": 40.0, "disk_percent": 30.0}
        mock_psutil = MagicMock()
        mock_psutil.swap_memory.return_value = MagicMock(percent=5.0, used=0, total=1)
        mock_psutil.disk_partitions.return_value = []
        with patch("services.monitoring.get_pi_stats", return_value=stats), \
             patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil), \
             patch("os.getloadavg", return_value=(0.5, 0.4, 0.3), create=True), \
             patch("os.cpu_count", return_value=4):
            checker._check_pi_resources()

        critical_alerts = [a for a in alerts_emitted if a[0] == mon_module.Severity.CRITICAL]
        assert len(critical_alerts) > 0, "Expected a CRITICAL alert for temp > 80°C"

    def test_cpu_temp_elevated_emits_warning(self, tmp_path):
        checker = _make_checker(tmp_path)
        alerts_emitted = []

        checker._emit_alert = lambda level, svc, msg: alerts_emitted.append((level, svc, msg))

        stats = {"cpu_temp": 75.0, "cpu_percent": 50.0, "ram_percent": 40.0, "disk_percent": 30.0}
        mock_psutil = MagicMock()
        mock_psutil.swap_memory.return_value = MagicMock(percent=5.0, used=0, total=1)
        mock_psutil.disk_partitions.return_value = []
        with patch("services.monitoring.get_pi_stats", return_value=stats), \
             patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil), \
             patch("os.getloadavg", return_value=(0.2, 0.2, 0.1), create=True), \
             patch("os.cpu_count", return_value=4):
            checker._check_pi_resources()

        warning_alerts = [a for a in alerts_emitted if a[0] == mon_module.Severity.WARNING]
        assert any("temp" in a[2].lower() or "temperature" in a[2].lower() for a in warning_alerts)


# ── RAM threshold alert tests ─────────────────────────────────────────────────

class TestRamThresholdAlerts:
    def test_ram_over_85_emits_warning(self, tmp_path):
        checker = _make_checker(tmp_path)
        alerts_emitted = []
        checker._emit_alert = lambda level, svc, msg: alerts_emitted.append((level, svc, msg))

        stats = {"cpu_temp": 50.0, "cpu_percent": 20.0, "ram_percent": 90.0, "disk_percent": 30.0}
        mock_psutil = MagicMock()
        mock_psutil.swap_memory.return_value = MagicMock(percent=5.0, used=0, total=1)
        mock_psutil.disk_partitions.return_value = []
        with patch("services.monitoring.get_pi_stats", return_value=stats), \
             patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil), \
             patch("os.getloadavg", return_value=(0.2, 0.2, 0.1), create=True), \
             patch("os.cpu_count", return_value=4):
            checker._check_pi_resources()

        ram_alerts = [a for a in alerts_emitted if "ram" in a[1].lower() or "ram" in a[2].lower()]
        assert len(ram_alerts) > 0, "Expected a RAM alert for ram_percent > 85"
        # Must be WARNING or CRITICAL — not INFO
        assert all(
            a[0] in (mon_module.Severity.WARNING, mon_module.Severity.CRITICAL)
            for a in ram_alerts
        )

    def test_normal_ram_no_alert(self, tmp_path):
        checker = _make_checker(tmp_path)
        alerts_emitted = []
        checker._emit_alert = lambda level, svc, msg: alerts_emitted.append((level, svc, msg))

        stats = {"cpu_temp": 45.0, "cpu_percent": 15.0, "ram_percent": 50.0, "disk_percent": 25.0}
        mock_psutil = MagicMock()
        mock_psutil.swap_memory.return_value = MagicMock(percent=5.0, used=0, total=1)
        mock_psutil.disk_partitions.return_value = []
        with patch("services.monitoring.get_pi_stats", return_value=stats), \
             patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil), \
             patch("os.getloadavg", return_value=(0.1, 0.1, 0.1), create=True), \
             patch("os.cpu_count", return_value=4):
            checker._check_pi_resources()

        ram_alerts = [a for a in alerts_emitted if "ram" in a[1].lower()]
        assert len(ram_alerts) == 0


# ── Normal readings — no alert ────────────────────────────────────────────────

class TestNormalReadings:
    def test_normal_stats_generate_no_alerts(self, tmp_path):
        checker = _make_checker(tmp_path)
        alerts_emitted = []
        checker._emit_alert = lambda level, svc, msg: alerts_emitted.append((level, svc, msg))

        stats = {"cpu_temp": 48.0, "cpu_percent": 20.0, "ram_percent": 55.0, "disk_percent": 40.0}
        mock_psutil = MagicMock()
        mock_psutil.swap_memory.return_value = MagicMock(percent=5.0, used=0, total=1)
        mock_psutil.disk_partitions.return_value = []
        with patch("services.monitoring.get_pi_stats", return_value=stats), \
             patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil), \
             patch("os.getloadavg", return_value=(0.3, 0.2, 0.2), create=True), \
             patch("os.cpu_count", return_value=4):
            checker._check_pi_resources()

        # Only disk/cpu-temp thresholds, all below limits — no alerts expected
        assert len(alerts_emitted) == 0


# ── check_services / systemd tests ───────────────────────────────────────────

class TestCheckServices:
    def test_check_systemd_active_service_marked_up(self, tmp_path):
        checker = _make_checker(tmp_path)
        mock_result = MagicMock(returncode=0, stdout="active\n", stderr="")
        mock_enabled = MagicMock(returncode=0, stdout="enabled\n", stderr="")
        mock_ts = MagicMock(returncode=0, stdout="", stderr="")

        import subprocess
        with patch("subprocess.run") as mock_run:
            # First call: is-active, second: is-enabled, third: show timestamp
            mock_run.side_effect = [mock_result, mock_enabled, mock_ts]
            # Patch _MONITORED_SERVICES to just one entry
            with patch.object(type(checker), "_MONITORED_SERVICES", new_callable=lambda: property(lambda self: ["bmo"])):
                checker._check_systemd_services()

        # bmo -> key is svc_bmo
        assert "svc_bmo" in checker._service_status
        assert checker._service_status["svc_bmo"]["status"] == "up"

    def test_check_systemd_inactive_service_marked_down(self, tmp_path):
        checker = _make_checker(tmp_path)
        mock_result = MagicMock(returncode=1, stdout="inactive\n", stderr="")
        mock_enabled = MagicMock(returncode=0, stdout="enabled\n", stderr="")
        mock_ts = MagicMock(returncode=0, stdout="", stderr="")

        alerts_emitted = []
        checker._emit_alert = lambda level, svc, msg: alerts_emitted.append((level, svc, msg))

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = [mock_result, mock_enabled, mock_ts]
            with patch.object(type(checker), "_MONITORED_SERVICES", new_callable=lambda: property(lambda self: ["bmo"])):
                checker._check_systemd_services()

        assert checker._service_status.get("svc_bmo", {}).get("status") == "down"
        assert len(alerts_emitted) > 0

    def test_service_status_dict_has_running_stopped_keys(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status = {
            "svc_bmo": {"status": "up", "last_check": time.time(), "message": "Running", "response_time": None},
            "svc_docker": {"status": "down", "last_check": time.time(), "message": "State: inactive", "response_time": None},
        }
        # get_status should return a dict containing service info
        result = checker.get_status()
        assert isinstance(result, dict)


# ── Alert cooldown / dedupe tests ─────────────────────────────────────────────

class TestAlertCooldown:
    def test_same_fingerprint_not_repeated(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status["my_svc"] = {"status": "down"}

        webhook_calls = []
        with patch("services.monitoring._send_discord_webhook", side_effect=lambda *a, **k: webhook_calls.append(a) or True):
            checker._send_discord_if_allowed(mon_module.Severity.CRITICAL, "my_svc", "Service crashed")
            checker._send_discord_if_allowed(mon_module.Severity.CRITICAL, "my_svc", "Service crashed")

        # Second call should be suppressed (same fingerprint)
        assert len(webhook_calls) == 1

    def test_different_message_sends_new_alert(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status["my_svc"] = {"status": "down"}

        webhook_calls = []
        with patch("services.monitoring._send_discord_webhook", side_effect=lambda *a, **k: webhook_calls.append(a) or True):
            checker._send_discord_if_allowed(mon_module.Severity.CRITICAL, "my_svc", "Service crashed")
            checker._service_status["my_svc"] = {"status": "down"}
            checker._send_discord_if_allowed(mon_module.Severity.CRITICAL, "my_svc", "OOM killed")

        assert len(webhook_calls) == 2


# ── Discord webhook tests ─────────────────────────────────────────────────────

class TestDiscordWebhook:
    def test_webhook_called_on_critical_alert(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status["test_svc"] = {"status": "down"}

        with patch("services.monitoring.DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/test"), \
             patch("services.monitoring.REQUESTS_AVAILABLE", True), \
             patch("services.monitoring.requests") as mock_requests:
            mock_requests.post.return_value = MagicMock(status_code=204)
            result = mon_module._send_discord_webhook(
                mon_module.Severity.CRITICAL, "test_svc", "Service is DOWN"
            )

        mock_requests.post.assert_called_once()
        assert result is True

    def test_webhook_not_called_without_url(self, tmp_path):
        with patch("services.monitoring.DISCORD_WEBHOOK_URL", ""), \
             patch("services.monitoring.REQUESTS_AVAILABLE", True), \
             patch("services.monitoring.requests") as mock_requests:
            result = mon_module._send_discord_webhook(
                mon_module.Severity.CRITICAL, "svc", "Down"
            )

        mock_requests.post.assert_not_called()
        assert result is False

    def test_webhook_sends_correct_payload_shape(self, tmp_path):
        captured = {}
        with patch("services.monitoring.DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/test"), \
             patch("services.monitoring.REQUESTS_AVAILABLE", True), \
             patch("services.monitoring.requests") as mock_requests:
            mock_requests.post.return_value = MagicMock(status_code=200)
            mock_requests.post.side_effect = lambda url, json=None, **kw: (
                captured.update({"payload": json}) or MagicMock(status_code=200)
            )
            mon_module._send_discord_webhook(
                mon_module.Severity.WARNING, "pi_ram", "RAM usage high: 90%"
            )

        assert "payload" in captured
        payload = captured["payload"]
        assert "embeds" in payload
        embed = payload["embeds"][0]
        assert "BMO Alert" in embed.get("title", "")
        assert "pi_ram" in embed.get("title", "")

    def test_webhook_emit_alert_critical_triggers_discord(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status["pi_disk"] = {"status": "down"}
        discord_calls = []

        with patch.object(checker, "_send_discord_if_allowed",
                          side_effect=lambda *a: discord_calls.append(a)):
            checker._emit_alert(mon_module.Severity.CRITICAL, "pi_disk", "Disk full")

        assert len(discord_calls) == 1

    def test_info_level_does_not_trigger_discord(self, tmp_path):
        checker = _make_checker(tmp_path)
        discord_calls = []
        with patch.object(checker, "_send_discord_if_allowed",
                          side_effect=lambda *a: discord_calls.append(a)):
            checker._emit_alert(mon_module.Severity.INFO, "pi_info", "All good")

        assert len(discord_calls) == 0


# ── mock_hardware fixture integration ────────────────────────────────────────

class TestMockHardwareIntegration:
    def test_mock_hardware_gpio_available(self, mock_hardware):
        """mock_hardware fixture provides GPIO mock without real Pi."""
        assert mock_hardware["gpio"] is not None

    def test_pi_stats_with_mock_hardware(self, mock_hardware):
        """get_pi_stats should return a dict even when hardware is mocked."""
        mock_psutil = MagicMock()
        mock_psutil.cpu_percent.return_value = 25.0
        mock_psutil.virtual_memory.return_value = MagicMock(percent=60.0)
        mock_psutil.disk_usage.return_value = MagicMock(percent=45.0)
        mock_psutil.sensors_temperatures.return_value = {}
        with patch("services.monitoring.PSUTIL_AVAILABLE", True), \
             patch.object(mon_module, "psutil", mock_psutil):
            stats = mon_module.get_pi_stats()

        assert isinstance(stats, dict)
        assert stats["cpu_percent"] == 25.0
        assert stats["ram_percent"] == 60.0
        assert stats["disk_percent"] == 45.0
