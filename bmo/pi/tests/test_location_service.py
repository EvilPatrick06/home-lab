"""Tests for BMO LocationService location-pinning behaviour.

Focus: when an explicit location is configured (BMO_WEATHER_* / BMO_LOCATION_PIN),
the service PINS to the configured coordinates and never lets IP/WiFi
geolocation override them. This is the guard that stops the dashboard from
silently reverting to the US-centroid IP fallback (Kansas).

All network paths are mocked; no real calls are made.
"""

import os
import sys
import time
from unittest.mock import patch

import pytest

_PI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PI_DIR not in sys.path:
    sys.path.insert(0, _PI_DIR)

import services.location_service as loc  # noqa: E402
from services.location_service import LocationService  # noqa: E402


# ── _location_is_pinned ────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "env, expected",
    [
        ({"BMO_LOCATION_PIN": "1"}, True),
        ({"BMO_LOCATION_PIN": "true"}, True),
        ({"BMO_LOCATION_PIN": "on"}, True),
        ({"BMO_LOCATION_PIN": "0"}, False),
        ({"BMO_LOCATION_PIN": "false"}, False),
        # Auto: pin when both coords explicitly configured.
        ({"BMO_WEATHER_LATITUDE": "38.9517", "BMO_WEATHER_LONGITUDE": "-104.7594"}, True),
        # Auto: not pinned when coords absent.
        ({}, False),
        # Explicit off beats configured coords.
        ({"BMO_LOCATION_PIN": "0", "BMO_WEATHER_LATITUDE": "1", "BMO_WEATHER_LONGITUDE": "2"}, False),
    ],
)
def test_location_is_pinned(env, expected):
    keys = ("BMO_LOCATION_PIN", "BMO_WEATHER_LATITUDE", "BMO_WEATHER_LONGITUDE")
    clean = {k: v for k, v in os.environ.items() if k not in keys}
    with patch.dict(os.environ, {**clean, **env}, clear=True):
        assert loc._location_is_pinned() is expected


# ── refresh() honours the pin and skips geolocation ────────────────────────────

def test_refresh_pinned_skips_geolocation_and_returns_configured():
    env = {
        "BMO_LOCATION_PIN": "1",
        "BMO_WEATHER_LOCATION_LABEL": "Colorado Springs, CO",
    }
    with patch.dict(os.environ, env, clear=False):
        svc = LocationService()
        # Poison the in-memory cache with a bad IP-geolocation (Kansas) result,
        # exactly the failure mode we are guarding against.
        svc._cache = {
            "latitude": 38.9822,
            "longitude": -94.6708,
            "timezone": "America/Chicago",
            "city": "Overland Park",
            "region": "Kansas",
            "country": "United States",
            "location_label": "Overland Park, Kansas, United States",
            "source": "ipwhois",
            "updated_at": time.time(),
        }
        with patch.object(loc, "_mls_wifi_location") as mls, \
                patch.object(loc, "_google_wifi_location") as gwifi, \
                patch.object(loc.requests, "get") as http_get, \
                patch.object(svc, "_save_cache"), \
                patch.object(svc, "_sync_system_timezone"):
            result = svc.refresh()

        # No IP/WiFi geolocation was attempted at all.
        mls.assert_not_called()
        gwifi.assert_not_called()
        http_get.assert_not_called()

        # Result is the configured Colorado Springs location, not Kansas.
        assert result["source"] == "configured"
        assert result["location_label"] == "Colorado Springs, CO"
        assert "Kansas" not in result["location_label"]
        assert abs(result["latitude"] - loc.DEFAULT_LOCATION["latitude"]) < 1e-6
        assert abs(result["longitude"] - loc.DEFAULT_LOCATION["longitude"]) < 1e-6


def test_init_pinned_ignores_stale_kansas_cache():
    env = {"BMO_LOCATION_PIN": "1", "BMO_WEATHER_LOCATION_LABEL": "Colorado Springs, CO"}
    kansas = {
        "latitude": 38.98, "longitude": -94.67, "timezone": "America/Chicago",
        "location_label": "Overland Park, Kansas, United States",
        "source": "ipwhois", "updated_at": time.time(),
    }
    with patch.dict(os.environ, env, clear=False):
        with patch.object(LocationService, "_load_cache", return_value=kansas):
            svc = LocationService()
        assert svc._cache["source"] == "configured"
        assert "Kansas" not in svc._cache["location_label"]


def test_fresh_device_location_still_wins_when_pinned():
    """An explicit, fresh device (browser) location must override the pin."""
    env = {"BMO_LOCATION_PIN": "1"}
    with patch.dict(os.environ, env, clear=False):
        svc = LocationService()
        svc._cache = {
            "latitude": 40.0, "longitude": -105.0, "timezone": "America/Denver",
            "location_label": "Somewhere, CO", "source": "device_browser",
            "updated_at": time.time(),
        }
        with patch.object(loc, "_mls_wifi_location") as mls:
            result = svc.refresh()
        mls.assert_not_called()
        assert result["source"] == "device_browser"
