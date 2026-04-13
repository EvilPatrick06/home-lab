"""Tests for BMO CalendarService.

All Google API calls are mocked. No real network or filesystem I/O.
"""

import datetime
import json
import os
import sys
from unittest.mock import MagicMock, patch, mock_open, call

import pytest

# ── Google API stubs (must be in place before CalendarService import) ──

_mock_google_auth = MagicMock()
_mock_google_oauth2 = MagicMock()
_mock_google_oauth2_credentials = MagicMock()
_mock_googleapiclient = MagicMock()
_mock_googleapiclient_discovery = MagicMock()
_mock_googleapiclient_errors = MagicMock()

sys.modules.setdefault("google", _mock_google_auth)
sys.modules.setdefault("google.auth", _mock_google_auth)
sys.modules.setdefault("google.auth.transport", _mock_google_auth)
sys.modules.setdefault("google.auth.transport.requests", _mock_google_auth)
sys.modules.setdefault("google.oauth2", _mock_google_oauth2)
sys.modules.setdefault("google.oauth2.credentials", _mock_google_oauth2_credentials)
sys.modules.setdefault("googleapiclient", _mock_googleapiclient)
sys.modules.setdefault("googleapiclient.discovery", _mock_googleapiclient_discovery)
sys.modules.setdefault("googleapiclient.errors", _mock_googleapiclient_errors)

# Expose HttpError on the errors stub
_mock_googleapiclient_errors.HttpError = type("HttpError", (Exception,), {})

import importlib
import sys as _sys

# Ensure the pi directory is on sys.path so we can import the service
_PI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_DIR not in _sys.path:
    _sys.path.insert(0, _PI_DIR)

from calendar_service import CalendarService  # noqa: E402


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_raw_event(
    id="evt-1",
    summary="Test Event",
    description="Desc",
    location="Home",
    start_dt: str | None = None,
    end_dt: str | None = None,
    all_day: bool = False,
) -> dict:
    """Build a raw Google Calendar API event dict."""
    if all_day:
        return {
            "id": id,
            "summary": summary,
            "description": description,
            "location": location,
            "start": {"date": "2025-06-01"},
            "end": {"date": "2025-06-02"},
        }
    start_dt = start_dt or "2025-06-01T09:00:00-06:00"
    end_dt = end_dt or "2025-06-01T10:00:00-06:00"
    return {
        "id": id,
        "summary": summary,
        "description": description,
        "location": location,
        "start": {"dateTime": start_dt, "timeZone": "America/Denver"},
        "end": {"dateTime": end_dt, "timeZone": "America/Denver"},
    }


def _build_service_mock(events_list: list[dict] | None = None) -> MagicMock:
    """Return a mock Google API service pre-loaded with event data."""
    service = MagicMock()
    raw_events = events_list or []
    (
        service.events.return_value.list.return_value.execute.return_value
    ) = {"items": raw_events}
    return service


@pytest.fixture
def svc(tmp_path):
    """CalendarService with a pre-injected mock Google service."""
    cs = CalendarService()
    cs._service = _build_service_mock()
    return cs


# ── Auth / Token Loading ──────────────────────────────────────────────────────

class TestLoadTokenData:
    def test_returns_none_when_file_missing(self, tmp_path):
        result = CalendarService._load_token_data(str(tmp_path / "missing.json"))
        assert result is None

    def test_returns_dict_when_valid(self, tmp_path):
        token_file = tmp_path / "token.json"
        token_file.write_text(json.dumps({"access_token": "abc", "refresh_token": "xyz"}))
        result = CalendarService._load_token_data(str(token_file))
        assert result == {"access_token": "abc", "refresh_token": "xyz"}

    def test_returns_none_for_invalid_json(self, tmp_path):
        bad_file = tmp_path / "token.json"
        bad_file.write_text("{not valid json}")
        result = CalendarService._load_token_data(str(bad_file))
        assert result is None

    def test_returns_none_for_non_dict_json(self, tmp_path):
        array_file = tmp_path / "token.json"
        array_file.write_text("[1, 2, 3]")
        result = CalendarService._load_token_data(str(array_file))
        assert result is None


class TestWriteTokenJson:
    def test_writes_atomically(self, tmp_path):
        target = tmp_path / "config" / "token.json"
        with patch("calendar_service.TOKEN_PATH", str(target)):
            CalendarService._write_token_json('{"access_token":"new"}')
        assert target.exists()
        assert json.loads(target.read_text()) == {"access_token": "new"}


class TestGetService:
    def test_returns_cached_service(self):
        cs = CalendarService()
        mock_svc = MagicMock()
        cs._service = mock_svc
        assert cs._get_service() is mock_svc

    def test_raises_when_credentials_missing(self, tmp_path):
        cs = CalendarService()
        # Both credential paths point to non-existent files
        with patch("calendar_service.CREDENTIALS_PATH", str(tmp_path / "creds.json")), \
             patch("calendar_service.LEGACY_CREDENTIALS_PATH", str(tmp_path / "legacy_creds.json")):
            with pytest.raises(RuntimeError, match="credentials.json missing"):
                cs._get_service()

    def test_raises_when_no_token_and_credentials_exist(self, tmp_path):
        creds_file = tmp_path / "credentials.json"
        creds_file.write_text(json.dumps({"installed": {}}))
        cs = CalendarService()
        with patch("calendar_service.CREDENTIALS_PATH", str(creds_file)), \
             patch("calendar_service.TOKEN_PATH", str(tmp_path / "token.json")), \
             patch("calendar_service.LEGACY_CREDENTIALS_PATH", str(tmp_path / "lc.json")), \
             patch("calendar_service.LEGACY_TOKEN_PATH", str(tmp_path / "lt.json")):
            with pytest.raises(RuntimeError, match="No valid token.json"):
                cs._get_service()

    def test_raises_when_token_missing_refresh_token(self, tmp_path):
        creds_file = tmp_path / "credentials.json"
        creds_file.write_text(json.dumps({"installed": {}}))
        token_file = tmp_path / "token.json"
        token_file.write_text(json.dumps({"access_token": "abc"}))  # no refresh_token

        mock_creds = MagicMock()
        mock_creds.valid = False
        mock_creds.expired = False
        mock_creds.refresh_token = None

        cs = CalendarService()
        with patch("calendar_service.CREDENTIALS_PATH", str(creds_file)), \
             patch("calendar_service.TOKEN_PATH", str(token_file)), \
             patch("calendar_service.LEGACY_CREDENTIALS_PATH", str(tmp_path / "lc.json")), \
             patch("calendar_service.LEGACY_TOKEN_PATH", str(tmp_path / "lt.json")), \
             patch("google.oauth2.credentials.Credentials.from_authorized_user_file", return_value=mock_creds):
            with pytest.raises(RuntimeError, match="missing refresh_token"):
                cs._get_service()

    def test_refresh_token_used_when_expired(self, tmp_path):
        creds_file = tmp_path / "credentials.json"
        creds_file.write_text(json.dumps({"installed": {}}))
        token_file = tmp_path / "token.json"
        token_file.write_text(json.dumps({"access_token": "old", "refresh_token": "rt"}))

        mock_creds = MagicMock()
        mock_creds.valid = False
        mock_creds.expired = True
        mock_creds.refresh_token = "rt"
        mock_creds.to_json.return_value = '{"access_token":"new","refresh_token":"rt"}'

        mock_service = MagicMock()

        cs = CalendarService()
        with patch("calendar_service.CREDENTIALS_PATH", str(creds_file)), \
             patch("calendar_service.TOKEN_PATH", str(token_file)), \
             patch("calendar_service.LEGACY_CREDENTIALS_PATH", str(tmp_path / "lc.json")), \
             patch("calendar_service.LEGACY_TOKEN_PATH", str(tmp_path / "lt.json")), \
             patch("google.oauth2.credentials.Credentials.from_authorized_user_file", return_value=mock_creds), \
             patch("googleapiclient.discovery.build", return_value=mock_service) as mock_build:
            result = cs._get_service()

        mock_creds.refresh.assert_called_once()
        assert result is mock_service


# ── get_upcoming_events ───────────────────────────────────────────────────────

class TestGetUpcomingEvents:
    def test_returns_list_of_dicts(self, svc):
        raw = [_make_raw_event("1", "Meeting"), _make_raw_event("2", "Lunch")]
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": raw}
        events = svc.get_upcoming_events()
        assert isinstance(events, list)
        assert len(events) == 2

    def test_event_dict_has_required_keys(self, svc):
        svc._service.events.return_value.list.return_value.execute.return_value = {
            "items": [_make_raw_event()]
        }
        events = svc.get_upcoming_events()
        e = events[0]
        for key in ("id", "summary", "description", "location", "start", "end", "start_iso", "end_iso", "all_day"):
            assert key in e, f"Missing key: {key}"

    def test_returns_empty_list_when_no_events(self, svc):
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": []}
        events = svc.get_upcoming_events()
        assert events == []

    def test_api_error_propagates(self, svc):
        svc._service.events.return_value.list.return_value.execute.side_effect = Exception("API down")
        with pytest.raises(Exception, match="API down"):
            svc.get_upcoming_events()

    def test_days_ahead_and_max_results_forwarded(self, svc):
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": []}
        svc.get_upcoming_events(days_ahead=3, max_results=5)
        call_kwargs = svc._service.events.return_value.list.call_args.kwargs
        assert call_kwargs["maxResults"] == 5


# ── create_event ─────────────────────────────────────────────────────────────

class TestCreateEvent:
    def _setup_create(self, svc, raw_event: dict):
        svc._service.events.return_value.insert.return_value.execute.return_value = raw_event
        # get_upcoming_events called by _refresh_cache — return empty list
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": []}

    def test_creates_event_and_returns_dict(self, svc):
        raw = _make_raw_event("new-1", "Team Standup")
        self._setup_create(svc, raw)
        start = datetime.datetime(2025, 6, 1, 9, 0, tzinfo=datetime.timezone.utc)
        end = datetime.datetime(2025, 6, 1, 10, 0, tzinfo=datetime.timezone.utc)
        result = svc.create_event("Team Standup", start, end)
        assert result["id"] == "new-1"
        assert result["summary"] == "Team Standup"

    def test_create_event_calls_insert(self, svc):
        raw = _make_raw_event("e2", "Birthday")
        self._setup_create(svc, raw)
        start = datetime.datetime(2025, 7, 4, 18, 0, tzinfo=datetime.timezone.utc)
        end = datetime.datetime(2025, 7, 4, 20, 0, tzinfo=datetime.timezone.utc)
        svc.create_event("Birthday", start, end, description="Party", location="Home")
        svc._service.events.return_value.insert.assert_called_once()
        body = svc._service.events.return_value.insert.call_args.kwargs["body"]
        assert body["summary"] == "Birthday"
        assert body["description"] == "Party"
        assert body["location"] == "Home"

    def test_create_event_sets_timezone_america_denver(self, svc):
        raw = _make_raw_event()
        self._setup_create(svc, raw)
        start = datetime.datetime(2025, 6, 1, 9, 0, tzinfo=datetime.timezone.utc)
        end = datetime.datetime(2025, 6, 1, 10, 0, tzinfo=datetime.timezone.utc)
        svc.create_event("Test", start, end)
        body = svc._service.events.return_value.insert.call_args.kwargs["body"]
        assert body["start"]["timeZone"] == "America/Denver"
        assert body["end"]["timeZone"] == "America/Denver"


# ── update_event ─────────────────────────────────────────────────────────────

class TestUpdateEvent:
    def test_update_summary_and_description(self, svc):
        existing = _make_raw_event("upd-1", "Old Title")
        updated = _make_raw_event("upd-1", "New Title", description="New desc")
        svc._service.events.return_value.get.return_value.execute.return_value = existing
        svc._service.events.return_value.update.return_value.execute.return_value = updated
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": []}
        result = svc.update_event("upd-1", summary="New Title", description="New desc")
        assert result["summary"] == "New Title"

    def test_update_event_calls_get_then_update(self, svc):
        raw = _make_raw_event("upd-2")
        svc._service.events.return_value.get.return_value.execute.return_value = raw
        svc._service.events.return_value.update.return_value.execute.return_value = raw
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": []}
        svc.update_event("upd-2", location="Office")
        svc._service.events.return_value.get.assert_called_once_with(calendarId="primary", eventId="upd-2")
        svc._service.events.return_value.update.assert_called_once()


# ── delete_event ─────────────────────────────────────────────────────────────

class TestDeleteEvent:
    def test_delete_valid_id_calls_api(self, svc):
        svc._service.events.return_value.delete.return_value.execute.return_value = None
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": []}
        svc.delete_event("del-1")
        svc._service.events.return_value.delete.assert_called_once_with(
            calendarId="primary", eventId="del-1"
        )

    def test_delete_api_error_propagates(self, svc):
        HttpError = sys.modules["googleapiclient.errors"].HttpError
        svc._service.events.return_value.delete.return_value.execute.side_effect = Exception("404")
        with pytest.raises(Exception, match="404"):
            svc.delete_event("nonexistent-id")


# ── _format_event ─────────────────────────────────────────────────────────────

class TestFormatEvent:
    def test_datetime_event(self, svc):
        raw = _make_raw_event(
            id="fmt-1",
            summary="Meeting",
            start_dt="2025-06-01T09:00:00-06:00",
            end_dt="2025-06-01T10:00:00-06:00",
        )
        result = svc._format_event(raw)
        assert result["id"] == "fmt-1"
        assert result["summary"] == "Meeting"
        assert result["all_day"] is False
        assert result["start_iso"] == "2025-06-01T09:00:00-06:00"

    def test_all_day_event(self, svc):
        raw = _make_raw_event(all_day=True)
        result = svc._format_event(raw)
        assert result["all_day"] is True
        assert result["start_iso"] == "2025-06-01"

    def test_missing_title_defaults_to_no_title(self, svc):
        raw = {"id": "x", "start": {"dateTime": "2025-06-01T09:00:00Z"}, "end": {"dateTime": "2025-06-01T10:00:00Z"}}
        result = svc._format_event(raw)
        assert result["summary"] == "(No title)"

    def test_timezone_info_preserved_in_start_iso(self, svc):
        raw = _make_raw_event(start_dt="2025-06-01T15:00:00+00:00", end_dt="2025-06-01T16:00:00+00:00")
        result = svc._format_event(raw)
        assert "+00:00" in result["start_iso"] or "Z" in result["start_iso"] or result["start_iso"].endswith("00:00")


# ── _format_time ─────────────────────────────────────────────────────────────

class TestFormatTime:
    def test_valid_iso_string(self):
        result = CalendarService._format_time("2025-06-01T09:30:00-06:00")
        assert "Sun Jun 01" in result or "09:30" in result

    def test_empty_string_returns_empty(self):
        assert CalendarService._format_time("") == ""

    def test_invalid_string_returned_as_is(self):
        assert CalendarService._format_time("not-a-date") == "not-a-date"


# ── Cache & Polling ───────────────────────────────────────────────────────────

class TestCache:
    def test_get_cached_events_empty_initially(self):
        cs = CalendarService()
        cs._service = _build_service_mock()
        assert cs.get_cached_events() == []

    def test_refresh_cache_populates_cache(self, svc):
        raw = [_make_raw_event("c1", "Cached Event")]
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": raw}
        svc._refresh_cache()
        cached = svc.get_cached_events()
        assert len(cached) == 1
        assert cached[0]["id"] == "c1"

    def test_refresh_cache_swallows_api_errors(self, svc):
        svc._service.events.return_value.list.return_value.execute.side_effect = Exception("503")
        # Should not raise
        svc._refresh_cache()
        assert svc.get_cached_events() == []

    def test_get_cached_events_returns_copy(self, svc):
        raw = [_make_raw_event("copy-1")]
        svc._service.events.return_value.list.return_value.execute.return_value = {"items": raw}
        svc._refresh_cache()
        copy1 = svc.get_cached_events()
        copy1.append({"fake": True})
        copy2 = svc.get_cached_events()
        assert len(copy2) == 1


# ── Reminders ────────────────────────────────────────────────────────────────

class TestReminders:
    def _make_imminent_event(self, minutes_from_now: float = 5) -> dict:
        """Build a formatted event starting N minutes in the future."""
        future = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(minutes=minutes_from_now)
        return {
            "id": "remind-1",
            "summary": "Imminent Meeting",
            "description": "",
            "location": "",
            "start": future.strftime("%a %b %d, %I:%M %p"),
            "end": "",
            "start_iso": future.isoformat(),
            "end_iso": "",
            "all_day": False,
        }

    def test_reminder_emitted_for_imminent_event(self):
        mock_sio = MagicMock()
        cs = CalendarService(socketio=mock_sio)
        cs._service = _build_service_mock()
        with cs._cache_lock:
            cs._cache = [self._make_imminent_event(5)]
        cs._check_reminders()
        mock_sio.emit.assert_called_once()
        args = mock_sio.emit.call_args
        assert args[0][0] == "calendar_reminder"

    def test_no_reminder_for_past_event(self):
        mock_sio = MagicMock()
        cs = CalendarService(socketio=mock_sio)
        cs._service = _build_service_mock()
        past = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(minutes=10)
        with cs._cache_lock:
            cs._cache = [{
                "id": "past-1", "summary": "Old", "description": "", "location": "",
                "start": "", "end": "", "start_iso": past.isoformat(), "end_iso": "",
                "all_day": False,
            }]
        cs._check_reminders()
        mock_sio.emit.assert_not_called()

    def test_alert_dedup_prevents_double_alert(self):
        mock_alert = MagicMock()
        cs = CalendarService(alert_service=mock_alert)
        cs._service = _build_service_mock()
        event = self._make_imminent_event(5)
        with cs._cache_lock:
            cs._cache = [event]
        cs._check_reminders()
        cs._check_reminders()
        # Alert should only be sent once per event id
        assert mock_alert.send_alert.call_count == 1
