"""BMO Alert Service — Proactive multi-channel alert dispatcher.

Sends alerts via voice, kiosk UI, and Discord DM based on priority levels.
Respects quiet hours (critical alerts override). Keeps rolling history.

Config: ~/DnD/bmo/pi/data/alert_config.json
History: ~/DnD/bmo/pi/data/alert_history.json
"""

import json
import os
import threading
import time

import requests


DATA_DIR = os.path.expanduser("~/DnD/bmo/pi/data")
CONFIG_FILE = os.path.join(DATA_DIR, "alert_config.json")
HISTORY_FILE = os.path.join(DATA_DIR, "alert_history.json")
MAX_HISTORY = 200

# Priority → delivery channels
PRIORITY_CHANNELS = {
    "critical": ["voice", "kiosk", "discord", "chime"],
    "high":     ["voice", "kiosk", "discord", "chime"],
    "medium":   ["kiosk", "discord", "chime_soft"],
    "low":      ["kiosk"],
}

# Default quiet hours (overridden by config)
DEFAULT_QUIET_START = 23  # 11 PM
DEFAULT_QUIET_END = 7     # 7 AM


class AlertService:
    """Multi-channel alert dispatcher with quiet hours and deduplication."""

    def __init__(self, voice_pipeline=None, socketio=None):
        self.voice = voice_pipeline
        self.socketio = socketio
        self._config = self._load_config()
        self._history = self._load_history()
        self._lock = threading.Lock()
        self._dedup = {}  # source:title → last_sent timestamp
        self._dedup_window = 300  # 5 min dedup window

    # ── Send Alert ────────────────────────────────────────────────────

    def send_alert(self, source: str, title: str, body: str,
                   priority: str = "medium") -> bool:
        """Send an alert through appropriate channels based on priority.

        Args:
            source: Alert source (e.g. "weather", "calendar", "package")
            title: Short title
            body: Full alert body
            priority: "critical", "high", "medium", "low"

        Returns:
            True if alert was sent (not deduplicated/suppressed)
        """
        if priority not in PRIORITY_CHANNELS:
            priority = "medium"

        # Dedup check
        dedup_key = f"{source}:{title}"
        now = time.time()
        with self._lock:
            last = self._dedup.get(dedup_key, 0)
            if now - last < self._dedup_window:
                return False
            self._dedup[dedup_key] = now
            # Clean old dedup entries
            cutoff = now - self._dedup_window * 2
            self._dedup = {k: v for k, v in self._dedup.items() if v > cutoff}

        channels = list(PRIORITY_CHANNELS[priority])
        is_quiet = self._is_quiet_hours()

        # Quiet hours: suppress voice except for critical
        if is_quiet and priority != "critical":
            channels = [c for c in channels if c != "voice"]

        # Build alert record
        alert = {
            "source": source,
            "title": title,
            "body": body,
            "priority": priority,
            "timestamp": now,
            "channels": channels,
            "quiet_suppressed": is_quiet and "voice" not in channels,
        }

        # Save to history
        self._save_alert(alert)

        # Dispatch to channels
        for channel in channels:
            try:
                if channel == "voice":
                    self._deliver_voice(title, body, priority)
                elif channel == "kiosk":
                    self._deliver_kiosk(alert)
                elif channel == "discord":
                    self._deliver_discord(title, body, priority)
                elif channel in ("chime", "chime_soft"):
                    self._deliver_chime(channel == "chime_soft")
            except Exception as e:
                print(f"[alert] Failed to deliver via {channel}: {e}")

        print(f"[alert] {priority.upper()} [{source}] {title}")
        return True

    # ── Delivery Channels ─────────────────────────────────────────────

    def _deliver_voice(self, title: str, body: str, priority: str):
        """Speak the alert via TTS."""
        if not self.voice:
            return
        # Critical gets full body, others just title
        if priority == "critical":
            text = f"Alert! {title}. {body}"
        else:
            text = f"{title}. {body}" if len(body) < 100 else title
        # Pass priority so alarms/emergencies bypass bedtime mode
        speak_priority = "emergency" if priority == "critical" else "alarm"
        threading.Thread(
            target=self.voice.speak, args=(text,),
            kwargs={"priority": speak_priority}, daemon=True
        ).start()

    def _deliver_kiosk(self, alert: dict):
        """Send alert to kiosk UI via SocketIO."""
        if self.socketio:
            self.socketio.emit("proactive_alert", alert)

    def _deliver_discord(self, title: str, body: str, priority: str):
        """Send alert as Discord DM using the social bot token."""
        token = os.environ.get("DISCORD_SOCIAL_BOT_TOKEN")
        owner_id = os.environ.get("DISCORD_OWNER_ID")
        if not token or not owner_id:
            return

        headers = {
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
        }

        try:
            # Create DM channel
            r = requests.post(
                "https://discord.com/api/v10/users/@me/channels",
                json={"recipient_id": owner_id},
                headers=headers, timeout=10,
            )
            r.raise_for_status()
            dm_channel_id = r.json()["id"]

            # Send message
            emoji = {"critical": "🚨", "high": "⚠️", "medium": "📢", "low": "ℹ️"}.get(priority, "📢")
            message = f"{emoji} **{title}**\n{body}"
            requests.post(
                f"https://discord.com/api/v10/channels/{dm_channel_id}/messages",
                json={"content": message},
                headers=headers, timeout=10,
            )
        except Exception as e:
            print(f"[alert] Discord DM failed: {e}")

    def _deliver_chime(self, soft: bool = False):
        """Play alert chime sound."""
        if self.socketio:
            self.socketio.emit("play_chime", {"soft": soft})

    # ── Quiet Hours ───────────────────────────────────────────────────

    def _is_quiet_hours(self) -> bool:
        """Check if current time is within quiet hours."""
        quiet = self._config.get("quiet_hours", {})
        if not quiet.get("enabled", True):
            return False
        start = quiet.get("start", DEFAULT_QUIET_START)
        end = quiet.get("end", DEFAULT_QUIET_END)
        hour = time.localtime().tm_hour
        if start > end:  # wraps midnight (e.g. 23-7)
            return hour >= start or hour < end
        return start <= hour < end

    # ── History & Config ──────────────────────────────────────────────

    def get_history(self, limit: int = 50, source: str | None = None) -> list[dict]:
        """Get recent alert history, optionally filtered by source."""
        with self._lock:
            alerts = self._history
            if source:
                alerts = [a for a in alerts if a.get("source") == source]
            return alerts[:limit]

    def get_config(self) -> dict:
        return dict(self._config)

    def update_config(self, **kwargs):
        """Update alert config (quiet_hours, enabled sources, etc.)."""
        self._config.update(kwargs)
        self._save_config()

    def _save_alert(self, alert: dict):
        """Append alert to rolling history."""
        with self._lock:
            self._history.insert(0, alert)
            if len(self._history) > MAX_HISTORY:
                self._history = self._history[:MAX_HISTORY]
        self._save_history()

    def _load_config(self) -> dict:
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[alert] Config load failed: {e}")
        return {
            "quiet_hours": {
                "enabled": True,
                "start": DEFAULT_QUIET_START,
                "end": DEFAULT_QUIET_END,
            },
            "sources": {
                "weather": True,
                "calendar": True,
                "package": True,
                "timer": True,
                "system": True,
            },
        }

    def _save_config(self):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2)
        except Exception as e:
            print(f"[alert] Config save failed: {e}")

    def _load_history(self) -> list:
        try:
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[alert] History load failed: {e}")
        return []

    def _save_history(self):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with self._lock:
                with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                    json.dump(self._history, f, ensure_ascii=False)
        except Exception as e:
            print(f"[alert] History save failed: {e}")
