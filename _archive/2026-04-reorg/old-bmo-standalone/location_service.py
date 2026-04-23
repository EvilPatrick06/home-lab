"""BMO Location Service — resolves current location/timezone from network.

Uses IP geolocation providers to determine latitude/longitude/timezone and keeps
the Pi system timezone aligned (when allowed).
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path

import requests

DEFAULT_LOCATION = {
    "latitude": float(os.environ.get("BMO_WEATHER_LATITUDE", "38.9364")),
    "longitude": float(os.environ.get("BMO_WEATHER_LONGITUDE", "-104.7595")),
    "timezone": os.environ.get("PI_TIMEZONE", "America/Denver"),
    "city": "",
    "region": "",
    "country": "",
    "location_label": os.environ.get("BMO_WEATHER_LOCATION_LABEL", "Default location"),
    "source": "default",
    "updated_at": 0.0,
}

CACHE_TTL_SECONDS = int(os.environ.get("BMO_LOCATION_CACHE_TTL_SECONDS", "21600"))
REFRESH_INTERVAL_SECONDS = int(os.environ.get("BMO_LOCATION_REFRESH_SECONDS", "1800"))
AUTO_SYSTEM_TIMEZONE = os.environ.get("BMO_AUTO_SYSTEM_TIMEZONE", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}

_CACHE_PATH = Path(__file__).resolve().parent / "data" / "location_cache.json"


def _make_label(city: str, region: str, country: str) -> str:
    parts = [p.strip() for p in (city, region, country) if p and str(p).strip()]
    return ", ".join(parts) if parts else ""


def _parse_ipapi(payload: dict) -> dict | None:
    lat = payload.get("latitude")
    lon = payload.get("longitude")
    tz = payload.get("timezone")
    if lat is None or lon is None or not tz:
        return None
    city = str(payload.get("city", "")).strip()
    region = str(payload.get("region", "")).strip()
    country = str(payload.get("country_name", payload.get("country", ""))).strip()
    return {
        "latitude": float(lat),
        "longitude": float(lon),
        "timezone": str(tz).strip(),
        "city": city,
        "region": region,
        "country": country,
        "location_label": _make_label(city, region, country),
        "source": "ipapi",
        "updated_at": time.time(),
    }


def _parse_ipwho(payload: dict) -> dict | None:
    if payload.get("success") is False:
        return None
    lat = payload.get("latitude")
    lon = payload.get("longitude")
    tz_data = payload.get("timezone", {})
    tz = tz_data.get("id") if isinstance(tz_data, dict) else payload.get("timezone")
    if lat is None or lon is None or not tz:
        return None
    city = str(payload.get("city", "")).strip()
    region = str(payload.get("region", "")).strip()
    country = str(payload.get("country", "")).strip()
    return {
        "latitude": float(lat),
        "longitude": float(lon),
        "timezone": str(tz).strip(),
        "city": city,
        "region": region,
        "country": country,
        "location_label": _make_label(city, region, country),
        "source": "ipwhois",
        "updated_at": time.time(),
    }


_PROVIDERS = (
    ("https://ipapi.co/json/", _parse_ipapi),
    ("https://ipwho.is/", _parse_ipwho),
)


class LocationService:
    """Resolves and caches current location/timezone for BMO services."""

    def __init__(self):
        self._lock = threading.Lock()
        self._running = False
        self._poll_thread: threading.Thread | None = None
        self._cache = self._load_cache() or dict(DEFAULT_LOCATION)

    def get_location(self, force_refresh: bool = False) -> dict:
        """Return location data, refreshing if stale."""
        with self._lock:
            current = dict(self._cache)
        is_stale = (time.time() - float(current.get("updated_at", 0))) >= CACHE_TTL_SECONDS
        if force_refresh or is_stale:
            refreshed = self.refresh()
            if refreshed:
                return refreshed
        return current

    def refresh(self) -> dict:
        """Attempt provider refresh and return latest location (cached on success)."""
        for url, parser in _PROVIDERS:
            try:
                response = requests.get(url, timeout=8)
                response.raise_for_status()
                parsed = parser(response.json())
                if not parsed:
                    continue
                with self._lock:
                    self._cache = parsed
                self._save_cache(parsed)
                self._sync_system_timezone(parsed.get("timezone", ""))
                return dict(parsed)
            except (requests.RequestException, ValueError) as exc:
                print(f"[location] Provider failed ({url}): {exc}")
        with self._lock:
            return dict(self._cache)

    def start_polling(self):
        """Start background location refresh."""
        if self._running:
            return
        self._running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def stop_polling(self):
        self._running = False

    def _poll_loop(self):
        while self._running:
            self.refresh()
            time.sleep(REFRESH_INTERVAL_SECONDS)

    def _load_cache(self) -> dict | None:
        try:
            if _CACHE_PATH.exists():
                with open(_CACHE_PATH, encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and data.get("timezone"):
                    return data
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[location] Cache load failed: {exc}")
        return None

    def _save_cache(self, data: dict):
        try:
            _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except OSError as exc:
            print(f"[location] Cache save failed: {exc}")

    def _sync_system_timezone(self, timezone_name: str):
        """Align system timezone to detected timezone when enabled."""
        if not AUTO_SYSTEM_TIMEZONE or not timezone_name:
            return
        try:
            current = subprocess.run(
                ["timedatectl", "show", "--property=Timezone", "--value"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            current_tz = current.stdout.strip()
            if current_tz == timezone_name:
                return
            update = subprocess.run(
                ["sudo", "-n", "timedatectl", "set-timezone", timezone_name],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if update.returncode == 0:
                print(f"[location] System timezone updated: {timezone_name}")
            else:
                err = (update.stderr or "").strip() or "unknown error"
                print(f"[location] Could not set system timezone to {timezone_name}: {err}")
        except (OSError, subprocess.SubprocessError) as exc:
            print(f"[location] Timezone sync unavailable: {exc}")
