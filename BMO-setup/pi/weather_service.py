"""BMO Weather Service — Open-Meteo API (free, no API key required)."""

import os
import threading
import time

import requests

DEFAULT_LATITUDE = float(os.environ.get("BMO_WEATHER_LATITUDE", "38.9364"))
DEFAULT_LONGITUDE = float(os.environ.get("BMO_WEATHER_LONGITUDE", "-104.7595"))
DEFAULT_TIMEZONE = os.environ.get("PI_TIMEZONE", "America/Denver")

# WMO Weather codes → descriptions and icons
WMO_CODES = {
    0: ("Clear sky", "clear"),
    1: ("Mainly clear", "clear"),
    2: ("Partly cloudy", "cloudy"),
    3: ("Overcast", "cloudy"),
    45: ("Foggy", "fog"),
    48: ("Rime fog", "fog"),
    51: ("Light drizzle", "rain"),
    53: ("Moderate drizzle", "rain"),
    55: ("Dense drizzle", "rain"),
    56: ("Freezing drizzle", "snow"),
    57: ("Dense freezing drizzle", "snow"),
    61: ("Slight rain", "rain"),
    63: ("Moderate rain", "rain"),
    65: ("Heavy rain", "rain"),
    66: ("Freezing rain", "snow"),
    67: ("Heavy freezing rain", "snow"),
    71: ("Slight snow", "snow"),
    73: ("Moderate snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Slight showers", "rain"),
    81: ("Moderate showers", "rain"),
    82: ("Violent showers", "rain"),
    85: ("Slight snow showers", "snow"),
    86: ("Heavy snow showers", "snow"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunderstorm + hail", "storm"),
    99: ("Thunderstorm + heavy hail", "storm"),
}

POLL_INTERVAL = 1800  # 30 minutes


class WeatherService:
    """Fetches weather data from Open-Meteo API with background caching."""

    def __init__(self, socketio=None, alert_service=None, location_service=None):
        self.socketio = socketio
        self.alert_service = alert_service
        self.location_service = location_service
        self._cache: dict | None = None
        self._cache_location_signature: tuple[float, float, str] | None = None
        self._running = False
        self._poll_thread = None
        self._last_weather_code = None

    # ── Fetch Weather ────────────────────────────────────────────────

    def get_current(self, force_refresh: bool = False) -> dict:
        """Get current weather conditions."""
        location = self._get_location()
        signature = self._location_signature(location)
        if not force_refresh and self._cache and self._cache_location_signature == signature:
            return self._cache

        return self._fetch(location)

    def _fetch(self, location: dict | None = None) -> dict:
        """Fetch weather from Open-Meteo API."""
        location = location or self._get_location()
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "timezone": location["timezone"],
            "forecast_days": 3,
        }

        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[weather] Fetch failed: {e}")
            return self._cache or {"error": str(e)}

        current = data.get("current", {})
        daily = data.get("daily", {})
        weather_code = current.get("weather_code", 0)
        desc, icon = WMO_CODES.get(weather_code, ("Unknown", "clear"))

        result = {
            "temperature": round(current.get("temperature_2m", 0)),
            "feels_like": round(current.get("apparent_temperature", 0)),
            "humidity": current.get("relative_humidity_2m", 0),
            "wind_speed": round(current.get("wind_speed_10m", 0)),
            "description": desc,
            "icon": icon,
            "weather_code": weather_code,
            "forecast": [],
            "location_label": location.get("location_label", ""),
            "timezone": location.get("timezone", DEFAULT_TIMEZONE),
            "latitude": location.get("latitude", DEFAULT_LATITUDE),
            "longitude": location.get("longitude", DEFAULT_LONGITUDE),
            "location_source": location.get("source", "default"),
        }

        # Daily forecast
        if daily.get("time"):
            for i, date in enumerate(daily["time"]):
                day_code = daily.get("weather_code", [0])[i] if i < len(daily.get("weather_code", [])) else 0
                day_desc, day_icon = WMO_CODES.get(day_code, ("Unknown", "clear"))
                result["forecast"].append({
                    "date": date,
                    "high": round(daily.get("temperature_2m_max", [0])[i]) if i < len(daily.get("temperature_2m_max", [])) else 0,
                    "low": round(daily.get("temperature_2m_min", [0])[i]) if i < len(daily.get("temperature_2m_min", [])) else 0,
                    "description": day_desc,
                    "icon": day_icon,
                })

        self._cache = result
        self._cache_location_signature = self._location_signature(location)
        return result

    # ── Background Polling ───────────────────────────────────────────

    def start_polling(self):
        """Start background weather updates every 30 minutes."""
        if self._running:
            return
        self._running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def stop_polling(self):
        self._running = False

    def _poll_loop(self):
        while self._running:
            weather = self._fetch()
            self._emit("weather_update", weather)
            self._check_severe_weather(weather)
            time.sleep(POLL_INTERVAL)

    def invalidate_cache(self):
        self._cache = None
        self._cache_location_signature = None

    def _check_severe_weather(self, weather: dict):
        """Check for severe weather conditions and send alerts."""
        if not self.alert_service or not weather or "error" in weather:
            return
        code = weather.get("weather_code", 0)
        temp = weather.get("temperature", 50)
        desc = weather.get("description", "")

        # Only alert on weather code changes
        if code == self._last_weather_code:
            return
        self._last_weather_code = code

        # Severe weather codes: thunderstorms (95-99), heavy rain (65), heavy snow (75)
        if code >= 95:
            self.alert_service.send_alert(
                "weather_warning",
                f"Severe Weather: {desc}",
                f"Current temperature: {temp}°F. Take precautions.",
                priority="high",
            )
        elif code in (65, 67, 75, 82, 86):
            self.alert_service.send_alert(
                "weather_warning",
                f"Weather Alert: {desc}",
                f"Current temperature: {temp}°F.",
                priority="medium",
            )
        # Extreme temperature alerts
        elif temp <= 10 or temp >= 105:
            self.alert_service.send_alert(
                "weather_warning",
                f"Extreme Temperature: {temp}°F",
                f"Conditions: {desc}. Stay safe!",
                priority="high",
            )

    # ── Helpers ──────────────────────────────────────────────────────

    def _emit(self, event: str, data: dict):
        if self.socketio:
            self.socketio.emit(event, data)

    def _get_location(self) -> dict:
        if self.location_service:
            try:
                resolved = self.location_service.get_location()
                if resolved:
                    return resolved
            except Exception as e:
                print(f"[weather] Location lookup failed: {e}")
        return {
            "latitude": DEFAULT_LATITUDE,
            "longitude": DEFAULT_LONGITUDE,
            "timezone": DEFAULT_TIMEZONE,
            "location_label": os.environ.get("BMO_WEATHER_LOCATION_LABEL", "Default location"),
            "source": "default",
        }

    @staticmethod
    def _location_signature(location: dict) -> tuple[float, float, str]:
        return (
            round(float(location.get("latitude", DEFAULT_LATITUDE)), 4),
            round(float(location.get("longitude", DEFAULT_LONGITUDE)), 4),
            str(location.get("timezone", DEFAULT_TIMEZONE)),
        )
