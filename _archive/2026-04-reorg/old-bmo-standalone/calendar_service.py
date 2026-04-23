"""BMO Calendar Service — Google Calendar API with full read/write access."""

import datetime
import os
import threading
import time

CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config")
LEGACY_CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "credentials.json")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")
LEGACY_CREDENTIALS_PATH = os.path.join(LEGACY_CONFIG_DIR, "credentials.json")
LEGACY_TOKEN_PATH = os.path.join(LEGACY_CONFIG_DIR, "token.json")
SCOPES = ["https://www.googleapis.com/auth/calendar"]

POLL_INTERVAL = 300  # 5 minutes


class CalendarService:
    """Google Calendar API wrapper with background polling and event cache."""

    def __init__(self, socketio=None, alert_service=None):
        self.socketio = socketio
        self.alert_service = alert_service
        self._service = None
        self._cache = []
        self._cache_lock = threading.Lock()
        self._poll_thread = None
        self._running = False
        self._alerted_events = set()  # event IDs already alerted for dedup

    # ── Auth ─────────────────────────────────────────────────────────

    @staticmethod
    def _resolve_config_paths() -> tuple[str, str]:
        credentials_path = CREDENTIALS_PATH if os.path.exists(CREDENTIALS_PATH) else LEGACY_CREDENTIALS_PATH
        token_path = TOKEN_PATH if os.path.exists(TOKEN_PATH) else LEGACY_TOKEN_PATH
        return credentials_path, token_path

    def _get_service(self):
        if self._service is not None:
            return self._service

        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        credentials_path, token_path = self._resolve_config_paths()

        if not os.path.exists(credentials_path):
            raise RuntimeError(
                "credentials.json missing. Add credentials to ~/bmo/config/credentials.json "
                "or BMO-setup/pi/config/credentials.json"
            )

        creds = None
        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                # Save refreshed token
                os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
                with open(TOKEN_PATH, "w") as f:
                    f.write(creds.to_json())
            else:
                raise RuntimeError(
                    "No valid token.json found. Use Calendar tab authorization or run authorize_calendar.py, "
                    "then ensure token exists in ~/bmo/config/ or BMO-setup/pi/config/"
                )

        self._service = build("calendar", "v3", credentials=creds)
        return self._service

    # ── Read Events ──────────────────────────────────────────────────

    def get_upcoming_events(self, days_ahead: int = 7, max_results: int = 20) -> list[dict]:
        """Fetch upcoming events from Google Calendar."""
        service = self._get_service()
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        time_max = now + datetime.timedelta(days=days_ahead)

        result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=now.isoformat(),
                timeMax=time_max.isoformat(),
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )

        events = result.get("items", [])
        return [self._format_event(e) for e in events]

    def get_today_events(self) -> list[dict]:
        """Get all events for today."""
        return self.get_upcoming_events(days_ahead=1, max_results=50)

    def get_next_event(self) -> dict | None:
        """Get the very next upcoming event."""
        events = self.get_upcoming_events(days_ahead=7, max_results=1)
        return events[0] if events else None

    # ── Create Events ────────────────────────────────────────────────

    def create_event(
        self,
        summary: str,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        description: str = "",
        location: str = "",
    ) -> dict:
        """Create a new calendar event."""
        service = self._get_service()
        event = {
            "summary": summary,
            "location": location,
            "description": description,
            "start": {"dateTime": start_dt.isoformat(), "timeZone": "America/Denver"},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": "America/Denver"},
        }
        created = service.events().insert(calendarId="primary", body=event).execute()
        self._refresh_cache()
        return self._format_event(created)

    # ── Update Events ────────────────────────────────────────────────

    def update_event(self, event_id: str, **kwargs) -> dict:
        """Update an existing event. Accepts: summary, start, end, description, location."""
        service = self._get_service()
        event = service.events().get(calendarId="primary", eventId=event_id).execute()

        if "summary" in kwargs:
            event["summary"] = kwargs["summary"]
        if "description" in kwargs:
            event["description"] = kwargs["description"]
        if "location" in kwargs:
            event["location"] = kwargs["location"]
        if "start" in kwargs:
            event["start"] = {"dateTime": kwargs["start"].isoformat(), "timeZone": "America/Denver"}
        if "end" in kwargs:
            event["end"] = {"dateTime": kwargs["end"].isoformat(), "timeZone": "America/Denver"}

        updated = service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
        self._refresh_cache()
        return self._format_event(updated)

    # ── Delete Events ────────────────────────────────────────────────

    def delete_event(self, event_id: str):
        """Delete a calendar event."""
        service = self._get_service()
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        self._refresh_cache()

    # ── Background Polling ───────────────────────────────────────────

    def start_polling(self):
        """Start background thread that refreshes the event cache every 5 minutes."""
        if self._running:
            return
        self._running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def stop_polling(self):
        """Stop background polling."""
        self._running = False

    def get_cached_events(self) -> list[dict]:
        """Return the cached event list (updated by background polling)."""
        with self._cache_lock:
            return list(self._cache)

    def _poll_loop(self):
        """Background loop that refreshes the event cache."""
        while self._running:
            self._refresh_cache()
            # Check for imminent events and emit reminders
            self._check_reminders()
            time.sleep(POLL_INTERVAL)

    def _refresh_cache(self):
        """Refresh the event cache."""
        try:
            events = self.get_upcoming_events(days_ahead=7, max_results=50)
            with self._cache_lock:
                self._cache = events
        except Exception as e:
            print(f"[calendar] Cache refresh failed: {e}")

    def _check_reminders(self):
        """Check if any events are starting within 15 minutes and emit reminders + alerts."""
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        with self._cache_lock:
            for event in self._cache:
                start_str = event.get("start_iso")
                if not start_str:
                    continue
                try:
                    start = datetime.datetime.fromisoformat(start_str)
                    delta = (start - now).total_seconds()
                    if 0 < delta <= 900:  # Within 15 minutes
                        minutes = int(delta / 60)
                        self._emit("calendar_reminder", {
                            "summary": event["summary"],
                            "minutes_until": minutes,
                            "start": event["start"],
                        })
                        # Send alert (dedup by event ID)
                        event_id = event.get("id", "")
                        if self.alert_service and event_id and event_id not in self._alerted_events:
                            self._alerted_events.add(event_id)
                            self.alert_service.send_alert(
                                "calendar_reminder",
                                f"{event['summary']} in {minutes} minutes",
                                f"Starts at {event.get('start', '')}",
                                priority="high",
                            )
                except (ValueError, TypeError):
                    pass
        # Clean up old alerted events (keep set manageable)
        if len(self._alerted_events) > 100:
            self._alerted_events = set(list(self._alerted_events)[-50:])

    # ── Helpers ──────────────────────────────────────────────────────

    def _format_event(self, event: dict) -> dict:
        """Normalize a Google Calendar event into a simpler dict."""
        start = event.get("start", {})
        end = event.get("end", {})
        start_str = start.get("dateTime", start.get("date", ""))
        end_str = end.get("dateTime", end.get("date", ""))

        return {
            "id": event.get("id", ""),
            "summary": event.get("summary", "(No title)"),
            "description": event.get("description", ""),
            "location": event.get("location", ""),
            "start": self._format_time(start_str),
            "end": self._format_time(end_str),
            "start_iso": start_str,
            "end_iso": end_str,
            "all_day": "date" in start and "dateTime" not in start,
        }

    @staticmethod
    def _format_time(iso_str: str) -> str:
        """Format an ISO datetime string into a human-readable string."""
        if not iso_str:
            return ""
        try:
            dt = datetime.datetime.fromisoformat(iso_str)
            return dt.strftime("%a %b %d, %I:%M %p")
        except ValueError:
            return iso_str

    def _emit(self, event: str, data: dict):
        if self.socketio:
            self.socketio.emit(event, data)
