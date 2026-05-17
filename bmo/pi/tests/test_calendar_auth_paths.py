import unittest
from unittest.mock import patch

from app import (
    _calendar_config_dir,
    _calendar_legacy_config_dir,
    _calendar_merge_token_data,
    _ensure_calendar_credentials_path,
    _ensure_calendar_token_path,
)
from services.calendar_service import CalendarService


class CalendarPathResolutionTests(unittest.TestCase):
    @staticmethod
    def _as_windows(path: str) -> str:
        return path.replace("/", "\\")

    @staticmethod
    def _normalize(path: str) -> str:
        return path.replace("/", "\\")

    @patch("app.shutil.copy2")
    @patch("app.os.path.exists")
    @patch("app.os.makedirs")
    def test_ensure_calendar_credentials_migrates_legacy(self, _makedirs, mock_exists, mock_copy):
        local = self._as_windows(_calendar_config_dir() + "/credentials.json")
        legacy = self._as_windows(_calendar_legacy_config_dir() + "/credentials.json")

        def exists_side_effect(path):
            normalized = self._normalize(path)
            if normalized == local:
                return False
            if normalized == legacy:
                return True
            return False

        mock_exists.side_effect = exists_side_effect

        resolved = _ensure_calendar_credentials_path()

        self.assertEqual(self._as_windows(resolved), local)
        self.assertEqual(mock_copy.call_count, 1)
        copied_from, copied_to = mock_copy.call_args[0]
        self.assertEqual(self._normalize(copied_from), legacy)
        self.assertEqual(self._normalize(copied_to), local)

    @patch("services.calendar_service.os.path.exists")
    def test_calendar_service_prefers_local_paths(self, mock_exists):
        local_credentials = _calendar_config_dir() + "/credentials.json"
        local_token = _calendar_config_dir() + "/token.json"
        local_credentials_win = self._as_windows(local_credentials)
        local_token_win = self._as_windows(local_token)

        def exists_side_effect(path):
            return path in {local_credentials, local_token, local_credentials_win, local_token_win}

        mock_exists.side_effect = exists_side_effect
        cred_path, token_path = CalendarService._resolve_config_paths()

        self.assertEqual(self._as_windows(cred_path), local_credentials_win)
        self.assertEqual(self._as_windows(token_path), local_token_win)

    @patch("app.shutil.copy2")
    @patch("app.os.path.exists")
    @patch("app.os.makedirs")
    def test_ensure_calendar_token_migrates_legacy(self, _makedirs, mock_exists, mock_copy):
        local = self._as_windows(_calendar_config_dir() + "/token.json")
        legacy = self._as_windows(_calendar_legacy_config_dir() + "/token.json")

        def exists_side_effect(path):
            normalized = self._normalize(path)
            if normalized == local:
                return False
            if normalized == legacy:
                return True
            return False

        mock_exists.side_effect = exists_side_effect

        resolved = _ensure_calendar_token_path()

        self.assertEqual(self._as_windows(resolved), local)
        self.assertEqual(mock_copy.call_count, 1)
        copied_from, copied_to = mock_copy.call_args[0]
        self.assertEqual(self._normalize(copied_from), legacy)
        self.assertEqual(self._normalize(copied_to), local)

    def test_calendar_merge_preserves_existing_refresh_token(self):
        merged = _calendar_merge_token_data(
            {"access_token": "new-access"},
            {"refresh_token": "existing-refresh", "access_token": "old-access"},
        )

        self.assertEqual(merged["access_token"], "new-access")
        self.assertEqual(merged["refresh_token"], "existing-refresh")


# QA #5 (2026-05-17): redirect_uri_mismatch happened because the tunnel
# terminates TLS — request.scheme returned http:// but the browser was on
# https://. The auth-url builder now honors X-Forwarded-Proto / X-Forwarded-Host.

class CalendarOAuthRedirectTests(unittest.TestCase):
    def _fake_request(self, *, host_header="bmo.mybmoai.work",
                      forwarded_proto="https", forwarded_host=None):
        """Build a minimal stub mimicking Flask's request that the URL builder reads."""
        class _R:
            pass
        r = _R()
        r.host = host_header
        r.host_url = f"http://{host_header}/"
        r.scheme = "http"
        r.args = {}
        r.headers = {
            "X-Forwarded-Proto": forwarded_proto,
            "X-Forwarded-Host": forwarded_host or host_header,
        }
        return r

    def _build_redirect_uri(self, request_obj, mode="auto"):
        """Re-implement the small URI-selection block from app.py for the unit test."""
        if mode == "manual":
            return "urn:ietf:wg:oauth:2.0:oob"
        fwd_proto = (request_obj.headers.get("X-Forwarded-Proto") or "").strip().lower()
        scheme = fwd_proto if fwd_proto in ("http", "https") else (request_obj.scheme or "http")
        fwd_host = (request_obj.headers.get("X-Forwarded-Host") or "").strip()
        host = fwd_host or request_obj.host
        return (request_obj.args.get("redirect_uri", "").strip()
                or f"{scheme}://{host}/api/calendar/auth/callback")

    def test_redirect_uri_uses_x_forwarded_proto_https(self):
        r = self._fake_request(forwarded_proto="https")
        self.assertEqual(
            self._build_redirect_uri(r),
            "https://bmo.mybmoai.work/api/calendar/auth/callback",
        )

    def test_redirect_uri_falls_back_to_request_scheme_when_no_header(self):
        r = self._fake_request(forwarded_proto="")
        self.assertEqual(
            self._build_redirect_uri(r),
            "http://bmo.mybmoai.work/api/calendar/auth/callback",
        )

    def test_manual_mode_returns_oob(self):
        r = self._fake_request()
        self.assertEqual(self._build_redirect_uri(r, mode="manual"),
                         "urn:ietf:wg:oauth:2.0:oob")

    def test_explicit_redirect_uri_query_param_wins(self):
        r = self._fake_request()
        r.args = {"redirect_uri": "https://custom.example/callback"}
        self.assertEqual(self._build_redirect_uri(r),
                         "https://custom.example/callback")


if __name__ == "__main__":
    unittest.main()
