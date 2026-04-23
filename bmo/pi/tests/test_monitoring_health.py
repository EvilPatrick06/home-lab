import json
import unittest
from unittest.mock import MagicMock, patch

from services.monitoring import HealthChecker, Severity


class MonitoringHealthTests(unittest.TestCase):
    def setUp(self):
        self.checker = HealthChecker(socketio=None)
        self.checker._service_status = {}

    def test_overall_critical_when_required_service_down(self):
        self.checker._service_status = {
            "google_calendar": {"status": "down", "message": "missing token"},
            "rclone": {"status": "up", "message": "ok"},
        }

        status = self.checker.get_status()

        self.assertEqual(status["overall"], "critical")
        self.assertIn("google_calendar", status["down_required_services"])

    def test_overall_warning_when_only_noncritical_service_down(self):
        self.checker._service_status = {
            "rclone": {"status": "down", "message": "No remotes configured"},
            "google_maps_api": {"status": "up", "message": "OK"},
        }

        status = self.checker.get_status()

        self.assertEqual(status["overall"], "warning")
        self.assertIn("rclone", status["down_noncritical_services"])
        self.assertEqual(status["down_required_services"], [])

    def test_info_status_does_not_trigger_warning_or_critical(self):
        self.checker._service_status = {
            "net_eth0": {"status": "info", "message": "DOWN (no cable; expected if Wi-Fi is primary)"},
            "google_maps_api": {"status": "up", "message": "OK"},
        }

        status = self.checker.get_status()

        self.assertEqual(status["overall"], "healthy")
        self.assertIn("net_eth0", status["info_services"])

    @patch("subprocess.run")
    def test_network_marks_eth0_down_as_info(self, mock_run):
        wlan_up = json.dumps(
            [
                {
                    "ifname": "wlan0",
                    "operstate": "UP",
                    "addr_info": [{"family": "inet", "local": "10.0.0.5"}],
                }
            ]
        )
        eth_down = json.dumps(
            [
                {
                    "ifname": "eth0",
                    "operstate": "DOWN",
                    "addr_info": [],
                }
            ]
        )
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout=wlan_up),
            MagicMock(returncode=0, stdout=eth_down),
        ]

        self.checker._emit_alert = MagicMock()
        self.checker._check_network()

        self.assertEqual(self.checker._service_status["net_eth0"]["status"], "info")
        self.assertIn("expected if Wi-Fi is primary", self.checker._service_status["net_eth0"]["message"])
        self.checker._emit_alert.assert_not_called()

    @patch("monitoring.os.path.exists", return_value=False)
    def test_calendar_missing_credentials_is_critical_down(self, _mock_exists):
        self.checker._emit_alert = MagicMock()

        self.checker._check_calendar_token()

        status = self.checker._service_status["google_calendar"]
        self.assertEqual(status["status"], "down")
        self.assertIn("credentials.json missing", status["message"])
        self.checker._emit_alert.assert_called_with(
            Severity.CRITICAL,
            "google_calendar",
            "📅 Google Calendar credentials.json missing — cannot authorize calendar",
        )

    @patch("subprocess.run")
    def test_disabled_fan_service_is_info_not_down(self, mock_run):
        self.checker._MONITORED_SERVICES = ["bmo-fan"]
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="inactive\n"),  # is-active bmo-fan
            MagicMock(returncode=0, stdout="disabled\n"),  # is-enabled bmo-fan
            MagicMock(returncode=0, stdout="ActiveEnterTimestamp=\n"),  # show timestamp
        ]

        self.checker._emit_alert = MagicMock()
        self.checker._check_systemd_services()

        fan = self.checker._service_status["svc_bmo_fan"]
        self.assertEqual(fan["status"], "info")
        self.assertIn("disabled by configuration", fan["message"])

    @patch("monitoring.os.stat")
    @patch("monitoring.os.path.exists")
    def test_calendar_missing_refresh_token_is_critical_down(self, mock_exists, mock_stat):
        now = 1700000000
        mock_stat.return_value = MagicMock(st_mtime=now - 3600)

        token_path = "C:\\token.json"
        credentials_path = "C:\\credentials.json"

        def exists_side_effect(path):
            if path in {credentials_path, token_path}:
                return True
            return False

        mock_exists.side_effect = exists_side_effect

        with patch("monitoring.CALENDAR_CREDENTIALS_PATH", credentials_path), \
             patch("monitoring.CALENDAR_TOKEN_PATH", token_path), \
             patch("monitoring.LEGACY_CALENDAR_CREDENTIALS_PATH", "C:\\legacy-credentials.json"), \
             patch("monitoring.LEGACY_CALENDAR_TOKEN_PATH", "C:\\legacy-token.json"), \
             patch("monitoring.time.time", return_value=now), \
             patch("builtins.open", unittest.mock.mock_open(read_data='{"token":"abc","expiry":"2999-01-01T00:00:00+00:00"}')):
            self.checker._emit_alert = MagicMock()
            self.checker._check_calendar_token()

        status = self.checker._service_status["google_calendar"]
        self.assertEqual(status["status"], "down")
        self.assertIn("refresh token missing", status["message"].lower())
        self.checker._emit_alert.assert_called_with(
            Severity.CRITICAL,
            "google_calendar",
            "📅 Calendar token missing refresh token — re-authorization required",
        )

    @patch("monitoring._send_discord_webhook", return_value=True)
    def test_discord_state_change_only_dedup(self, mock_webhook):
        self.checker._service_status["google_calendar"] = {"status": "down"}
        self.checker._discord_last_fingerprint = {}

        self.checker._send_discord_if_allowed(
            Severity.CRITICAL, "google_calendar", "📅 token missing — authorize calendar"
        )
        self.checker._send_discord_if_allowed(
            Severity.CRITICAL, "google_calendar", "📅 token missing — authorize calendar"
        )

        self.assertEqual(mock_webhook.call_count, 1)

    @patch("subprocess.run")
    def test_get_status_includes_enriched_fields(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        now = 1700000000
        self.checker._service_status = {
            "google_calendar": {
                "status": "down",
                "last_check": now,
                "message": "token.json missing",
                "response_time": None,
                "source_check": "calendar_auth",
                "recommended_action": "Open Calendar tab and run Authorize Calendar.",
                "failure_count": 3,
                "last_error": "token.json missing",
                "last_change": now - 60,
            }
        }

        status = self.checker.get_status()
        svc = status["services"]["google_calendar"]

        self.assertEqual(svc["source_check"], "calendar_auth")
        self.assertEqual(svc["failure_count"], 3)
        self.assertIn("Authorize Calendar", svc["recommended_action"])
        self.assertIn("label", svc)

    @patch("monitoring.subprocess.run")
    def test_pihole_api_seats_exceeded_is_degraded_not_down(self, mock_run):
        # DNS check succeeds, no exception path
        mock_run.return_value = MagicMock(returncode=0, stdout="1.1.1.1\n", stderr="")
        mock_post = MagicMock(return_value=MagicMock(
            status_code=401,
            json=MagicMock(return_value={"error": {"message": "API seats exceeded"}}),
        ))
        self.checker._session = MagicMock()
        self.checker._session.post = mock_post
        self.checker._session.get = MagicMock(return_value=MagicMock(status_code=401, json=MagicMock(return_value={})))
        self.checker._emit_alert = MagicMock()

        self.checker._check_pihole()

        self.assertEqual(self.checker._service_status["pihole"]["status"], "degraded")
        self.assertIn("seats exceeded", self.checker._service_status["pihole"]["message"].lower())

    def test_ports_check_uses_reachability_fallback_for_5000(self):
        with patch("subprocess.run", return_value=MagicMock(returncode=0, stdout="", stderr="")):
            self.checker._emit_alert = MagicMock()
            with patch.object(self.checker, "_is_local_port_reachable", return_value=True):
                self.checker._check_ports()

        ports_status = self.checker._service_status.get("ports", {})
        self.assertEqual(ports_status.get("status"), "degraded")
        self.assertNotIn("BMO Flask (:5000)", ports_status.get("message", ""))


if __name__ == "__main__":
    unittest.main()
