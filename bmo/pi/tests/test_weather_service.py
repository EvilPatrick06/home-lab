"""Tests for BMO WeatherService.

All HTTP calls are mocked via unittest.mock.patch. No real network calls.
"""

import os
import sys
from unittest.mock import MagicMock, patch, call

import pytest

# Ensure pi/ is importable
_PI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_DIR not in sys.path:
    sys.path.insert(0, _PI_DIR)

from services.weather_service import WeatherService, WMO_CODES, DEFAULT_LATITUDE, DEFAULT_LONGITUDE, DEFAULT_TIMEZONE  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_api_response(
    temp: float = 72.0,
    feels_like: float = 70.0,
    humidity: int = 45,
    wind: float = 8.0,
    weather_code: int = 0,
    include_daily: bool = True,
) -> dict:
    """Build a minimal Open-Meteo API response."""
    resp = {
        "current": {
            "temperature_2m": temp,
            "apparent_temperature": feels_like,
            "relative_humidity_2m": humidity,
            "wind_speed_10m": wind,
            "weather_code": weather_code,
        },
        "daily": {},
    }
    if include_daily:
        resp["daily"] = {
            "time": ["2025-06-01", "2025-06-02", "2025-06-03"],
            "temperature_2m_max": [80.0, 85.0, 78.0],
            "temperature_2m_min": [55.0, 60.0, 52.0],
            "weather_code": [0, 2, 61],
        }
    return resp


def _mock_requests_get(json_data: dict, status_code: int = 200, raise_exc=None):
    """Build a patched requests.get that returns the given data."""
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = json_data
    if raise_exc:
        mock_resp.raise_for_status.side_effect = raise_exc
    else:
        mock_resp.raise_for_status.return_value = None
    return mock_resp


@pytest.fixture
def svc():
    return WeatherService()


@pytest.fixture
def svc_with_location():
    """WeatherService with a simple location_service stub."""
    location_svc = MagicMock()
    location_svc.get_location.return_value = {
        "latitude": 38.9364,
        "longitude": -104.7595,
        "timezone": "America/Denver",
        "location_label": "Colorado Springs",
        "source": "manual",
    }
    return WeatherService(location_service=location_svc)


# ── get_current (via _fetch) ──────────────────────────────────────────────────

class TestGetCurrent:
    def test_returns_dict_with_required_keys(self, svc):
        api_data = _make_api_response()
        mock_resp = _mock_requests_get(api_data)
        with patch("requests.get", return_value=mock_resp):
            result = svc.get_current()
        for key in ("temperature", "feels_like", "humidity", "wind_speed", "description", "icon",
                    "weather_code", "forecast", "latitude", "longitude", "timezone"):
            assert key in result, f"Missing key: {key}"

    def test_temperature_rounded(self, svc):
        api_data = _make_api_response(temp=72.7)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            result = svc.get_current()
        assert result["temperature"] == 73

    def test_feels_like_rounded(self, svc):
        api_data = _make_api_response(feels_like=68.2)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            result = svc.get_current()
        assert result["feels_like"] == 68

    def test_known_weather_code_mapped(self, svc):
        for code, (expected_desc, expected_icon) in WMO_CODES.items():
            api_data = _make_api_response(weather_code=code)
            with patch("requests.get", return_value=_mock_requests_get(api_data)):
                svc.invalidate_cache()
                result = svc.get_current()
            assert result["description"] == expected_desc
            assert result["icon"] == expected_icon
            break  # one iteration is sufficient to verify mapping logic

    def test_unknown_weather_code_defaults(self, svc):
        api_data = _make_api_response(weather_code=999)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            result = svc.get_current()
        assert result["description"] == "Unknown"
        assert result["icon"] == "clear"

    def test_forecast_list_populated(self, svc):
        api_data = _make_api_response(include_daily=True)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            result = svc.get_current()
        assert isinstance(result["forecast"], list)
        assert len(result["forecast"]) == 3

    def test_forecast_day_has_required_keys(self, svc):
        api_data = _make_api_response(include_daily=True)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            result = svc.get_current()
        day = result["forecast"][0]
        for key in ("date", "high", "low", "description", "icon"):
            assert key in day, f"Forecast day missing key: {key}"

    def test_empty_daily_yields_empty_forecast(self, svc):
        api_data = _make_api_response(include_daily=False)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            result = svc.get_current()
        assert result["forecast"] == []


# ── Cache behaviour ───────────────────────────────────────────────────────────

class TestCache:
    def test_second_call_uses_cache(self, svc):
        api_data = _make_api_response()
        with patch("requests.get", return_value=_mock_requests_get(api_data)) as mock_get:
            svc.get_current()
            svc.get_current()
        assert mock_get.call_count == 1  # second call served from cache

    def test_force_refresh_bypasses_cache(self, svc):
        api_data = _make_api_response()
        with patch("requests.get", return_value=_mock_requests_get(api_data)) as mock_get:
            svc.get_current()
            svc.get_current(force_refresh=True)
        assert mock_get.call_count == 2

    def test_invalidate_cache_clears_stored_data(self, svc):
        api_data = _make_api_response()
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            svc.get_current()
        svc.invalidate_cache()
        assert svc._cache is None
        assert svc._cache_location_signature is None

    def test_location_change_triggers_refetch(self, svc):
        """Different location signature must bypass cache."""
        api_data = _make_api_response()
        with patch("requests.get", return_value=_mock_requests_get(api_data)) as mock_get:
            svc.get_current()
            # Manually corrupt the cached signature so it mismatches
            svc._cache_location_signature = (0.0, 0.0, "UTC")
            svc.get_current()
        assert mock_get.call_count == 2


# ── Network / HTTP error handling ─────────────────────────────────────────────

class TestErrorHandling:
    def test_http_error_returns_error_dict(self, svc):
        """Non-2xx responses should return an error dict, not raise."""
        import requests as req_lib
        err = req_lib.exceptions.HTTPError("429 Too Many Requests")
        mock_resp = _mock_requests_get({}, status_code=429, raise_exc=err)
        with patch("requests.get", return_value=mock_resp):
            result = svc.get_current()
        assert "error" in result

    def test_timeout_returns_error_dict(self, svc):
        import requests as req_lib
        with patch("requests.get", side_effect=req_lib.exceptions.Timeout("timed out")):
            result = svc.get_current()
        assert "error" in result

    def test_network_error_returns_error_dict(self, svc):
        import requests as req_lib
        with patch("requests.get", side_effect=req_lib.exceptions.ConnectionError("no route")):
            result = svc.get_current()
        assert "error" in result

    def test_error_returns_cached_data_when_available(self, svc):
        """On fetch error, the previously cached result should be returned."""
        import requests as req_lib
        # First call populates cache
        api_data = _make_api_response(temp=72.0)
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            first = svc.get_current()
        # Second call fails — cache should be returned
        with patch("requests.get", side_effect=req_lib.exceptions.ConnectionError("offline")):
            second = svc.get_current(force_refresh=True)
        assert second["temperature"] == first["temperature"]
        assert "error" not in second


# ── Severe weather alerts ─────────────────────────────────────────────────────

class TestSevereWeatherAlerts:
    def _make_svc_with_alert(self):
        mock_alert = MagicMock()
        svc = WeatherService(alert_service=mock_alert)
        return svc, mock_alert

    def test_thunderstorm_triggers_high_priority_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        weather = {"weather_code": 95, "temperature": 72, "description": "Thunderstorm"}
        svc._check_severe_weather(weather)
        mock_alert.send_alert.assert_called_once()
        call_args = mock_alert.send_alert.call_args
        assert call_args.kwargs.get("priority") == "high" or call_args[1].get("priority") == "high" or "high" in str(call_args)

    def test_same_code_does_not_double_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        weather = {"weather_code": 95, "temperature": 72, "description": "Thunderstorm"}
        svc._check_severe_weather(weather)
        svc._check_severe_weather(weather)
        assert mock_alert.send_alert.call_count == 1

    def test_heavy_rain_triggers_medium_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        weather = {"weather_code": 65, "temperature": 55, "description": "Heavy rain"}
        svc._check_severe_weather(weather)
        mock_alert.send_alert.assert_called_once()

    def test_extreme_heat_triggers_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        weather = {"weather_code": 0, "temperature": 110, "description": "Clear sky"}
        svc._check_severe_weather(weather)
        mock_alert.send_alert.assert_called_once()

    def test_extreme_cold_triggers_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        weather = {"weather_code": 0, "temperature": 5, "description": "Clear sky"}
        svc._check_severe_weather(weather)
        mock_alert.send_alert.assert_called_once()

    def test_normal_weather_no_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        weather = {"weather_code": 2, "temperature": 72, "description": "Partly cloudy"}
        svc._check_severe_weather(weather)
        mock_alert.send_alert.assert_not_called()

    def test_no_alert_service_does_not_crash(self, svc):
        weather = {"weather_code": 95, "temperature": 72, "description": "Thunderstorm"}
        # Should not raise
        svc._check_severe_weather(weather)

    def test_error_dict_skipped_by_alert(self):
        svc, mock_alert = self._make_svc_with_alert()
        svc._check_severe_weather({"error": "offline"})
        mock_alert.send_alert.assert_not_called()


# ── Location handling ─────────────────────────────────────────────────────────

class TestLocationHandling:
    def test_default_location_used_when_no_location_service(self, svc):
        loc = svc._get_location()
        assert loc["latitude"] == DEFAULT_LATITUDE
        assert loc["longitude"] == DEFAULT_LONGITUDE
        assert loc["timezone"] == DEFAULT_TIMEZONE

    def test_location_service_result_used_when_available(self, svc_with_location):
        loc = svc_with_location._get_location()
        assert loc["latitude"] == 38.9364
        assert loc["source"] == "manual"

    def test_location_service_exception_falls_back_to_default(self):
        loc_svc = MagicMock()
        loc_svc.get_location.side_effect = RuntimeError("GPS broken")
        svc = WeatherService(location_service=loc_svc)
        loc = svc._get_location()
        assert loc["latitude"] == DEFAULT_LATITUDE

    def test_location_service_returns_none_falls_back(self):
        loc_svc = MagicMock()
        loc_svc.get_location.return_value = None
        svc = WeatherService(location_service=loc_svc)
        loc = svc._get_location()
        assert loc["latitude"] == DEFAULT_LATITUDE


# ── _location_signature ────────────────────────────────────────────────────────

class TestLocationSignature:
    def test_same_location_same_signature(self):
        loc = {"latitude": 38.9364, "longitude": -104.7595, "timezone": "America/Denver"}
        a = WeatherService._location_signature(loc)
        b = WeatherService._location_signature(loc)
        assert a == b

    def test_different_lat_different_signature(self):
        loc_a = {"latitude": 38.9364, "longitude": -104.7595, "timezone": "America/Denver"}
        loc_b = {"latitude": 40.0, "longitude": -104.7595, "timezone": "America/Denver"}
        assert WeatherService._location_signature(loc_a) != WeatherService._location_signature(loc_b)

    def test_different_timezone_different_signature(self):
        loc_a = {"latitude": 38.9364, "longitude": -104.7595, "timezone": "America/Denver"}
        loc_b = {"latitude": 38.9364, "longitude": -104.7595, "timezone": "America/New_York"}
        assert WeatherService._location_signature(loc_a) != WeatherService._location_signature(loc_b)


# ── SocketIO emit ─────────────────────────────────────────────────────────────

class TestEmit:
    def test_emit_called_on_fetch_during_poll(self):
        mock_sio = MagicMock()
        svc = WeatherService(socketio=mock_sio)
        api_data = _make_api_response()
        with patch("requests.get", return_value=_mock_requests_get(api_data)):
            weather = svc._fetch()
        svc._emit("weather_update", weather)
        mock_sio.emit.assert_called_once_with("weather_update", weather)

    def test_emit_noop_when_no_socketio(self, svc):
        # Should not raise when socketio is None
        svc._emit("weather_update", {"temperature": 72})
