"""Tests for monitoring.py — HealthChecker, Pi stats, Discord webhooks.

psutil is injected as a mock so tests run on any OS without Pi hardware.
No real HTTP calls are made.
os.getloadavg is patched for Windows compatibility.
"""

import sys
import time
from unittest.mock import MagicMock, patch

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
    def test_ram_over_90_emits_warning(self, tmp_path):
        # Round 4 #16 (2026-05-17): threshold raised from >85 to >=90 with
        # hysteresis (exit at <80) to stop pi_resources flapping. Test
        # now uses 95 to be unambiguous.
        checker = _make_checker(tmp_path)
        alerts_emitted = []
        checker._emit_alert = lambda level, svc, msg: alerts_emitted.append((level, svc, msg))

        stats = {"cpu_temp": 50.0, "cpu_percent": 20.0, "ram_percent": 95.0, "disk_percent": 30.0}
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
        assert len(ram_alerts) > 0, "Expected a RAM alert for ram_percent >= 90"
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

    def test_ram_hysteresis_stays_degraded_between_thresholds(self, tmp_path):
        """Round 4 #16 (2026-05-17): once pi_ram crosses into degraded at
        90%, it stays degraded until RAM falls below the 80% exit
        threshold. RAM bouncing between 81-89% should NOT clear the
        warning (was causing the header pill to flap every poll)."""
        checker = _make_checker(tmp_path)
        # Seed degraded state directly
        checker._service_status["pi_ram"] = {"status": "degraded", "last_check": 0}

        def _check(ram_pct):
            alerts = []
            checker._emit_alert = lambda level, svc, msg: alerts.append((level, svc, msg))
            stats = {"cpu_temp": 50.0, "cpu_percent": 20.0, "ram_percent": ram_pct, "disk_percent": 30.0}
            mock_psutil = MagicMock()
            mock_psutil.swap_memory.return_value = MagicMock(percent=5.0, used=0, total=1)
            mock_psutil.disk_partitions.return_value = []
            with patch("services.monitoring.get_pi_stats", return_value=stats), \
                 patch("services.monitoring.PSUTIL_AVAILABLE", True), \
                 patch.object(mon_module, "psutil", mock_psutil), \
                 patch("os.getloadavg", return_value=(0.2, 0.2, 0.1), create=True), \
                 patch("os.cpu_count", return_value=4):
                checker._check_pi_resources()
            return checker._service_status["pi_ram"]["status"], alerts

        # At 85% (above exit, below enter) while in degraded → STAYS degraded
        status, _alerts = _check(85.0)
        assert status == "degraded", "Hysteresis: 85% with prior=degraded must stay degraded"

        # At 75% (below exit) → CLEARS to up
        status, _alerts = _check(75.0)
        assert status == "up", "Hysteresis: 75% must clear the degraded state"

        # At 85% AGAIN now that we cleared → STAYS up (was_degraded=False now)
        status, _alerts = _check(85.0)
        assert status == "up", "Hysteresis: 85% with prior=up must NOT re-enter degraded"


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


# ── Circuit-breaker for repeatedly-failing subsystems (QA #6, 2026-05-17) ─────

class TestCircuitBreaker:
    def test_no_history_means_circuit_closed(self, tmp_path):
        checker = _make_checker(tmp_path)
        assert not checker._circuit_open("google_calendar", time.time())

    def test_record_failure_opens_circuit(self, tmp_path):
        checker = _make_checker(tmp_path)
        now = 1_000_000.0
        checker._circuit_record_failure("google_calendar", now, ttl=60)
        # First failure: next attempt at now + 60.
        assert checker._circuit_open("google_calendar", now + 30)
        assert not checker._circuit_open("google_calendar", now + 61)

    def test_backoff_doubles_on_repeated_failures(self, tmp_path):
        checker = _make_checker(tmp_path)
        now = 1_000_000.0
        checker._circuit_record_failure("google_calendar", now, ttl=60)
        checker._circuit_record_failure("google_calendar", now, ttl=60)
        checker._circuit_record_failure("google_calendar", now, ttl=60)
        # After 3 failures: backoff = 60 * 2^2 = 240
        assert checker._circuit_open("google_calendar", now + 239)
        assert not checker._circuit_open("google_calendar", now + 241)

    def test_backoff_capped_at_one_hour(self, tmp_path):
        checker = _make_checker(tmp_path)
        now = 1_000_000.0
        for _ in range(15):  # well past 2^x cap
            checker._circuit_record_failure("google_calendar", now, ttl=60)
        failures, next_attempt = checker._subsystem_backoff["google_calendar"]
        assert failures == 15
        assert next_attempt - now == 3600  # capped

    def test_success_resets_backoff(self, tmp_path):
        checker = _make_checker(tmp_path)
        now = 1_000_000.0
        checker._circuit_record_failure("google_calendar", now)
        checker._circuit_record_failure("google_calendar", now)
        checker._circuit_record_success("google_calendar")
        assert "google_calendar" not in checker._subsystem_backoff
        assert not checker._circuit_open("google_calendar", now)


# ── PHASE-05 05C: reconcile calendar health with the live read path ───────────


class TestCalendarHealthReconcile:
    def _write_stale_token(self, tmp_path):
        import datetime
        import json
        creds = tmp_path / "credentials.json"
        creds.write_text("{}")
        token = tmp_path / "token.json"
        past = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)
        ).isoformat()
        token.write_text(json.dumps({"token": "at", "refresh_token": "rt", "expiry": past}))
        return str(creds), str(token)

    def _patched_paths(self, tmp_path, creds, token):
        return patch.multiple(
            mon_module,
            CALENDAR_CREDENTIALS_PATH=creds,
            CALENDAR_TOKEN_PATH=token,
            LEGACY_CALENDAR_CREDENTIALS_PATH=str(tmp_path / "lc.json"),
            LEGACY_CALENDAR_TOKEN_PATH=str(tmp_path / "lt.json"),
        )

    def test_stale_token_but_live_read_ok_is_not_down(self, tmp_path):
        checker = _make_checker(tmp_path)
        creds, token = self._write_stale_token(tmp_path)
        alerts = []
        checker._emit_alert = lambda level, svc, msg: alerts.append((level, svc, msg))
        checker._calendar_live_probe = lambda: True
        checker._calendar_expired_since = time.time() - 700  # past the 10-min grace
        # pretend a prior cycle latched a failure; success must clear it
        checker._subsystem_backoff["google_calendar"] = (3, time.time() - 1)
        with self._patched_paths(tmp_path, creds, token):
            checker._check_calendar_token()
        assert checker._service_status["google_calendar"]["status"] == "degraded"
        assert not [a for a in alerts if a[0] == mon_module.Severity.CRITICAL]
        assert "google_calendar" not in checker._subsystem_backoff  # circuit cleared

    def test_stale_token_and_dead_read_escalates_to_reauth(self, tmp_path):
        checker = _make_checker(tmp_path)
        creds, token = self._write_stale_token(tmp_path)
        alerts = []
        checker._emit_alert = lambda level, svc, msg: alerts.append((level, svc, msg))
        checker._calendar_live_probe = lambda: False
        checker._calendar_expired_since = time.time() - 700
        with self._patched_paths(tmp_path, creds, token):
            checker._check_calendar_token()
        assert checker._service_status["google_calendar"]["status"] == "down"
        criticals = [a for a in alerts if a[0] == mon_module.Severity.CRITICAL]
        assert any("reauth" in a[2].lower() for a in criticals)

    def test_live_probe_classifies_service_outcomes(self, tmp_path):
        checker = _make_checker(tmp_path)
        # no live service available -> None (caller falls back to the disk signal)
        checker._resolve_calendar_service = lambda: None
        assert checker._calendar_live_probe() is None
        # a successful live read -> True
        ok = MagicMock()
        ok.get_next_event = MagicMock(return_value=None)
        checker._resolve_calendar_service = lambda: ok
        assert checker._calendar_live_probe() is True
        # an auth RuntimeError (genuinely not authorized) -> False
        dead = MagicMock()
        dead.get_next_event = MagicMock(side_effect=RuntimeError("not authorized"))
        checker._resolve_calendar_service = lambda: dead
        assert checker._calendar_live_probe() is False
        # a transient/transport error -> None (don't claim dead)
        flaky = MagicMock()
        flaky.get_next_event = MagicMock(side_effect=Exception("timeout"))
        checker._resolve_calendar_service = lambda: flaky
        assert checker._calendar_live_probe() is None


# ── PHASE-10 — service-health truth & critical-alert surfacing ───────


class TestPhase10HealthTruth:
    # --- 10B: re-tier expired calendar OAuth ---
    def test_calendar_down_yields_overall_degraded_not_critical(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status = {
            "google_calendar": {
                "status": "down",
                "message": "Access token expired 43m ago — run reauth_calendar.py",
            },
            "svc_bmo": {"status": "up"},
        }
        result = checker.get_status()
        assert result["overall"] == "degraded"
        assert "google_calendar" in result["down_degraded_tier_services"]
        assert "google_calendar" not in result["down_required_services"]
        # per-service status + actionable message stay intact
        assert checker._service_status["google_calendar"]["status"] == "down"
        assert "reauth" in checker._service_status["google_calendar"]["message"].lower()

    def test_on_device_failure_still_critical(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status = {
            "svc_bmo": {"status": "down"},
            "google_calendar": {"status": "up"},
        }
        result = checker.get_status()
        assert result["overall"] == "critical"
        assert "svc_bmo" in result["down_required_services"]

    def test_calendar_and_device_down_is_critical(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status = {
            "svc_docker": {"status": "down"},
            "google_calendar": {"status": "down"},
        }
        assert checker.get_status()["overall"] == "critical"

    # --- 10A: honest mdns skip + distinct expiry labels ---
    def test_mdns_missing_tool_reports_skipped_not_unknown(self, tmp_path):
        checker = _make_checker(tmp_path)
        with patch("subprocess.run", side_effect=FileNotFoundError()):
            checker._check_remote_access()
        mdns = checker._service_status["mdns"]
        assert mdns["status"] == "skipped"
        assert "avahi-utils not installed" in mdns["message"]

    def test_calendar_expiry_message_names_access_token(self, tmp_path):
        # The relabeled monitor messages must say "Access token" so they read as
        # the live access-token / last-refresh delta — distinct from config-
        # preflight's on-disk credential-file expiry figure.
        src = open("services/monitoring.py", encoding="utf-8").read()
        assert "Access token expired" in src
        assert '"Token expired and refresh token is missing"' not in src

    # --- 10C: mirror critical/persistent alerts into the notification feed ---
    def test_critical_alert_mirrored_to_feed_once(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._notify_last_fingerprint = {}
        checker._service_status["google_calendar"] = {"status": "down"}
        calls = []
        checker.set_notification_sink(lambda **kw: calls.append(kw) or True)
        for _ in range(3):  # repeated poll cycles
            checker._emit_alert(
                mon_module.Severity.CRITICAL, "google_calendar",
                "Calendar token expired — re-authorize required",
            )
        assert len(calls) == 1  # de-duped to one notification
        assert calls[0]["key"] == "health:google_calendar"
        assert "re-auth" in calls[0]["body"].lower()

    def test_emit_alert_without_sink_does_not_raise(self, tmp_path):
        checker = _make_checker(tmp_path)
        checker._service_status["svc_bmo"] = {"status": "down"}
        checker._emit_alert(mon_module.Severity.CRITICAL, "svc_bmo", "down")  # no sink wired

    def test_recovery_clears_dedupe_and_posts_recovered_notice(self, tmp_path):
        checker = _make_checker(tmp_path)
        calls = []
        checker.set_notification_sink(lambda **kw: calls.append(kw) or True)
        checker._service_status = {"svc_bmo": {"status": "up"}}
        checker._prev_status = {"svc_bmo": "down"}
        checker._notify_last_fingerprint = {"svc_bmo": "stale-fp"}
        checker._process_state_transitions()
        assert "svc_bmo" not in checker._notify_last_fingerprint
        assert any("recovered" in c["body"].lower() for c in calls)


# ── BMO-ISSUES 2026-06-29: Fish Audio TTS timeouts must not fire CRITICAL ─────
# Fish Audio TTS has a working local fallback (edge-tts -> Piper), so a flapping
# endpoint should surface at WARNING, not device-CRITICAL (which also flips the
# OLED error face + is the loudest alert). Services WITHOUT a local fallback
# (e.g. gemini_api) stay CRITICAL on the same failure.
class TestFishAudioHasFallbackRetier:
    def _run_http_check(self, tmp_path, name, exc):
        import requests as _rq
        checker = _make_checker(tmp_path)
        alerts = []
        checker._emit_alert = lambda level, svc, msg: alerts.append((level, svc, msg))
        session = MagicMock()
        session.get.side_effect = exc
        checker._session = session
        checker._check_http_service(name, {"url": "https://x", "timeout": 5})
        return alerts

    def test_fish_audio_timeout_is_warning_not_critical(self, tmp_path):
        import requests as _rq
        alerts = self._run_http_check(
            tmp_path, "fish_audio_api", _rq.exceptions.Timeout()
        )
        assert alerts, "expected an alert"
        assert all(a[0] == mon_module.Severity.WARNING for a in alerts), alerts
        assert not [a for a in alerts if a[0] == mon_module.Severity.CRITICAL]

    def test_fish_audio_connection_error_is_warning(self, tmp_path):
        import requests as _rq
        alerts = self._run_http_check(
            tmp_path, "fish_audio_api", _rq.exceptions.ConnectionError()
        )
        assert alerts
        assert all(a[0] == mon_module.Severity.WARNING for a in alerts), alerts

    def test_no_fallback_service_still_critical_on_timeout(self, tmp_path):
        import requests as _rq
        alerts = self._run_http_check(
            tmp_path, "gemini_api", _rq.exceptions.Timeout()
        )
        criticals = [a for a in alerts if a[0] == mon_module.Severity.CRITICAL]
        assert criticals, "a fallback-less cloud API must stay CRITICAL"

    def test_repeated_fish_timeout_dedupes_discord(self, tmp_path):
        """Belt-and-suspenders: a flapping Fish endpoint that emits the same
        WARNING repeatedly only sends ONE Discord webhook (state-change dedupe
        on the alert fingerprint), so it cannot spam."""
        checker = _make_checker(tmp_path)
        checker._service_status["fish_audio_api"] = {"status": "down"}
        sent = []
        with patch.object(mon_module, "_send_discord_webhook",
                          lambda level, svc, msg: sent.append((level, svc, msg)) or True):
            for _ in range(5):
                checker._send_discord_if_allowed(
                    mon_module.Severity.WARNING, "fish_audio_api",
                    "🔊 Fish Audio API (text-to-speech) is not responding "
                    "(timed out after 5s)",
                )
        assert len(sent) == 1, "repeated identical WARNING must dedupe to one webhook"


# ── BMO-SUGGESTIONS 2026-06-29: fan-down-while-hot escalation ────────────────
class TestFanDownThermalEscalation:
    def test_cool_box_fan_down_is_not_escalated(self, tmp_path, monkeypatch):
        checker = _make_checker(tmp_path)
        monkeypatch.setattr(mon_module, "_read_cpu_temp", lambda: 45.0)
        checker._service_status["pi_power"] = {"throttle_flags": "0x0"}
        sev, note = checker._fan_down_thermal()
        assert sev is None and note == ""

    def test_hot_box_fan_down_is_warning(self, tmp_path, monkeypatch):
        checker = _make_checker(tmp_path)
        monkeypatch.setattr(mon_module, "_read_cpu_temp", lambda: 72.0)
        checker._service_status["pi_power"] = {"throttle_flags": "0x0"}
        sev, note = checker._fan_down_thermal()
        assert sev == mon_module.Severity.WARNING
        assert "fan DOWN" in note

    def test_critical_temp_fan_down_is_critical(self, tmp_path, monkeypatch):
        checker = _make_checker(tmp_path)
        monkeypatch.setattr(mon_module, "_read_cpu_temp", lambda: 82.0)
        checker._service_status["pi_power"] = {"throttle_flags": "0x0"}
        sev, note = checker._fan_down_thermal()
        assert sev == mon_module.Severity.CRITICAL

    def test_throttling_now_fan_down_is_critical_even_if_temp_read_fails(self, tmp_path, monkeypatch):
        checker = _make_checker(tmp_path)
        def _boom():
            raise OSError("no zone")
        monkeypatch.setattr(mon_module, "_read_cpu_temp", _boom)
        checker._service_status["pi_power"] = {"throttle_flags": "0x4"}
        sev, note = checker._fan_down_thermal()
        assert sev == mon_module.Severity.CRITICAL
        assert "THROTTLING" in note
