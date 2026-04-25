"""BMO Location Service — resolves current location/timezone from network.

Uses IP geolocation providers to determine latitude/longitude/timezone and keeps
the Pi system timezone aligned (when allowed).
"""

from __future__ import annotations

import json
import os
import re
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
DEVICE_LOCATION_TTL_SECONDS = int(os.environ.get("BMO_DEVICE_LOCATION_TTL_SECONDS", "7200"))
AUTO_SYSTEM_TIMEZONE = os.environ.get("BMO_AUTO_SYSTEM_TIMEZONE", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}

_PI_DATA = Path(__file__).resolve().parent.parent / "data"
_CACHE_PATH = _PI_DATA / "location_cache.json"
_SETTINGS_PATH = _PI_DATA / "settings.json"


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


def _maps_api_key() -> str:
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    if key:
        return key
    try:
        if _SETTINGS_PATH.exists():
            with open(_SETTINGS_PATH, encoding="utf-8") as f:
                settings = json.load(f)
            return str((settings.get("services") or {}).get("maps_api_key", "")).strip()
    except (OSError, json.JSONDecodeError):
        return ""
    return ""


def _scan_wifi_access_points() -> list[dict]:
    proc = None
    for cmd in (
        ["nmcli", "-t", "--escape", "no", "-f", "BSSID,SIGNAL", "dev", "wifi", "list", "--rescan", "yes"],
        ["nmcli", "-t", "-f", "BSSID,SIGNAL", "dev", "wifi", "list", "--rescan", "yes"],
    ):
        try:
            candidate = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=12,
                check=False,
            )
            if candidate.returncode == 0:
                proc = candidate
                break
        except (OSError, subprocess.SubprocessError):
            continue
    if proc is None:
        return []

    pattern = re.compile(r"^[0-9A-Fa-f:]{17}$")
    strongest: dict[str, int] = {}
    for raw in proc.stdout.splitlines():
        line = raw.strip()
        if not line:
            continue
        # nmcli may escape colons in BSSID as '\:' in terse mode.
        line = line.replace("\\:", ":")
        if ":" not in line:
            continue
        mac_part, signal_part = line.rsplit(":", 1)
        mac = mac_part.strip().lower()
        if not pattern.match(mac):
            continue
        try:
            signal_pct = max(0, min(100, int(signal_part)))
        except ValueError:
            continue
        if mac not in strongest or signal_pct > strongest[mac]:
            strongest[mac] = signal_pct

    aps = []
    for mac, signal_pct in sorted(strongest.items(), key=lambda item: item[1], reverse=True)[:15]:
        # Rough conversion from quality percent to dBm for Google Geolocation API.
        signal_dbm = int(round((signal_pct / 2.0) - 100))
        aps.append({"macAddress": mac, "signalStrength": signal_dbm})
    return aps


def _google_timezone(lat: float, lon: float, key: str) -> str:
    try:
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/timezone/json",
            params={"location": f"{lat},{lon}", "timestamp": int(time.time()), "key": key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if str(data.get("status")) == "OK":
            tz = str(data.get("timeZoneId", "")).strip()
            if tz:
                return tz
    except (requests.RequestException, ValueError):
        pass
    return ""


def _reverse_label(lat: float, lon: float) -> tuple[str, str, str]:
    try:
        resp = requests.get(
            "https://api.bigdatacloud.net/data/reverse-geocode-client",
            params={"latitude": lat, "longitude": lon, "localityLanguage": "en"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        city = str(data.get("city") or data.get("locality") or "").strip()
        region = str(data.get("principalSubdivision") or "").strip()
        country = str(data.get("countryName") or data.get("countryCode") or "").strip()
        return city, region, country
    except (requests.RequestException, ValueError):
        return "", "", ""


def _reverse_label_for_device(lat: float, lon: float) -> tuple[str, str, str]:
    key = _maps_api_key()
    if key:
        try:
            resp = requests.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"latlng": f"{lat},{lon}", "key": key},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            if str(data.get("status")) == "OK":
                components = (data.get("results") or [{}])[0].get("address_components", [])
                city = ""
                region = ""
                country = ""
                for comp in components:
                    types = comp.get("types") or []
                    long_name = str(comp.get("long_name", "")).strip()
                    if not city and any(t in types for t in ("locality", "postal_town", "administrative_area_level_3")):
                        city = long_name
                    if not region and "administrative_area_level_1" in types:
                        region = long_name
                    if not country and "country" in types:
                        country = long_name
                if city or region or country:
                    return city, region, country
        except (requests.RequestException, ValueError):
            pass
    return _reverse_label(lat, lon)


def _google_wifi_location() -> dict | None:
    key = _maps_api_key()
    if not key:
        return None
    wifi_aps = _scan_wifi_access_points()
    if not wifi_aps:
        return None
    try:
        resp = requests.post(
            f"https://www.googleapis.com/geolocation/v1/geolocate?key={key}",
            json={"considerIp": False, "wifiAccessPoints": wifi_aps},
            timeout=12,
        )
        resp.raise_for_status()
        payload = resp.json()
        loc = payload.get("location") or {}
        lat = loc.get("lat")
        lon = loc.get("lng")
        if lat is None or lon is None:
            return None
        lat = float(lat)
        lon = float(lon)
        city, region, country = _reverse_label(lat, lon)
        tz = _google_timezone(lat, lon, key) or DEFAULT_LOCATION["timezone"]
        data = {
            "latitude": lat,
            "longitude": lon,
            "timezone": tz,
            "city": city,
            "region": region,
            "country": country,
            "location_label": _make_label(city, region, country) or f"{lat:.4f}, {lon:.4f}",
            "source": "google_wifi",
            "updated_at": time.time(),
        }
        accuracy = payload.get("accuracy")
        if isinstance(accuracy, (int, float)):
            data["accuracy_m"] = round(float(accuracy), 1)
        return data
    except (requests.RequestException, ValueError):
        return None


def _timezone_from_coords(lat: float, lon: float) -> str:
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m",
                "timezone": "auto",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        tz = str(data.get("timezone", "")).strip()
        if tz:
            return tz
    except (requests.RequestException, ValueError):
        pass
    return ""


def _mls_wifi_location() -> dict | None:
    wifi_aps = _scan_wifi_access_points()
    if not wifi_aps:
        return None
    mls_key = os.environ.get("BMO_MLS_API_KEY", "geoclue").strip() or "geoclue"
    try:
        resp = requests.post(
            f"https://location.services.mozilla.com/v1/geolocate?key={mls_key}",
            json={"wifiAccessPoints": wifi_aps},
            timeout=12,
        )
        resp.raise_for_status()
        payload = resp.json()
        loc = payload.get("location") or {}
        lat = loc.get("lat")
        lon = loc.get("lng")
        if lat is None or lon is None:
            return None
        lat = float(lat)
        lon = float(lon)
        city, region, country = _reverse_label(lat, lon)
        tz = _timezone_from_coords(lat, lon) or DEFAULT_LOCATION["timezone"]
        data = {
            "latitude": lat,
            "longitude": lon,
            "timezone": tz,
            "city": city,
            "region": region,
            "country": country,
            "location_label": _make_label(city, region, country) or f"{lat:.4f}, {lon:.4f}",
            "source": "mozilla_wifi",
            "updated_at": time.time(),
        }
        accuracy = payload.get("accuracy")
        if isinstance(accuracy, (int, float)):
            data["accuracy_m"] = round(float(accuracy), 1)
        return data
    except (requests.RequestException, ValueError):
        return None


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
        with self._lock:
            current = dict(self._cache)
        if self._is_fresh_device_location(current):
            return current

        mozilla_wifi = _mls_wifi_location()
        if mozilla_wifi:
            with self._lock:
                self._cache = mozilla_wifi
            self._save_cache(mozilla_wifi)
            self._sync_system_timezone(mozilla_wifi.get("timezone", ""))
            return dict(mozilla_wifi)

        google_wifi = _google_wifi_location()
        if google_wifi:
            with self._lock:
                self._cache = google_wifi
            self._save_cache(google_wifi)
            self._sync_system_timezone(google_wifi.get("timezone", ""))
            return dict(google_wifi)

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

    def update_from_device(self, payload: dict) -> dict:
        """Accept browser geolocation and normalize to human-readable location."""
        lat = float(payload.get("latitude"))
        lon = float(payload.get("longitude"))
        if lat < -90 or lat > 90 or lon < -180 or lon > 180:
            raise ValueError("Invalid coordinates")

        timezone_name = str(payload.get("timezone", "")).strip() or _timezone_from_coords(lat, lon) or DEFAULT_LOCATION["timezone"]
        city, region, country = _reverse_label_for_device(lat, lon)
        label = _make_label(city, region, country) or "Current location"

        accuracy_m = payload.get("accuracy_m")
        try:
            accuracy_value = float(accuracy_m) if accuracy_m is not None else None
        except (TypeError, ValueError):
            accuracy_value = None

        data = {
            "latitude": lat,
            "longitude": lon,
            "timezone": timezone_name,
            "city": city,
            "region": region,
            "country": country,
            "location_label": label,
            "source": "device_browser",
            "updated_at": time.time(),
        }
        if accuracy_value is not None:
            data["accuracy_m"] = round(accuracy_value, 1)

        with self._lock:
            self._cache = data
        self._save_cache(data)
        self._sync_system_timezone(timezone_name)
        return dict(data)

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

    def _is_fresh_device_location(self, data: dict) -> bool:
        if not isinstance(data, dict):
            return False
        if data.get("source") != "device_browser":
            return False
        updated_at = float(data.get("updated_at", 0))
        return (time.time() - updated_at) < DEVICE_LOCATION_TTL_SECONDS

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
