"""BMO Notification Service — KDE Connect notification bridge.

Monitors notifications from Android phone and Windows PC via KDE Connect D-Bus,
deduplicates cross-device alerts, announces via TTS, and supports voice replies.

Requirements:
    sudo apt install kdeconnect
    Phone + PC must be paired with the Pi via KDE Connect.

Usage:
    from services.notification_service import NotificationService
    notifier = NotificationService(voice_pipeline=voice, socketio=socketio)
    notifier.start()
"""

import hashlib
import json
import os
import subprocess
import threading
import time

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "data", "settings.json")
UNKNOWN_NOTIF_LOG = os.path.expanduser("~/DnD/bmo/pi/data/logs/unknown_notifications.jsonl")
MAX_HISTORY = 100
DEDUP_WINDOW = 10  # seconds — suppress duplicate notifications within this window


class NotificationService:
    """Bridges KDE Connect notifications to BMO voice + web UI."""

    def __init__(self, voice_pipeline=None, socketio=None, alert_service=None):
        self.voice = voice_pipeline
        self.socketio = socketio
        self.alert_service = alert_service
        self._running = False
        self._thread = None
        self._history = []  # list of notification dicts (newest first)
        self._seen_hashes = {}  # hash → timestamp for dedup
        self._lock = threading.Lock()
        self._blocklist = set()  # app package names to ignore
        self._enabled = True
        self._devices = {}  # device_id → device_name
        self._load_settings()

    # ── Lifecycle ────────────────────────────────────────────────────

    def start(self):
        """Start monitoring KDE Connect notifications via D-Bus."""
        if self._running:
            return

        if not self._check_kdeconnect():
            print("[notify] KDE Connect not available — install with: sudo apt install kdeconnect")
            return

        self._running = True
        self._discover_devices()
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        print(f"[notify] Notification service started ({len(self._devices)} devices)")

    def stop(self):
        self._running = False

    def _check_kdeconnect(self) -> bool:
        """Check if KDE Connect CLI is available."""
        try:
            result = subprocess.run(
                ["kdeconnect-cli", "--version"],
                capture_output=True, text=True, timeout=5,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _discover_devices(self):
        """Find paired KDE Connect devices."""
        try:
            result = subprocess.run(
                ["kdeconnect-cli", "--list-available", "--id-name-only"],
                capture_output=True, text=True, timeout=10,
            )
            self._devices = {}
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                # Format: "device_id device_name" or "device_id - device_name"
                parts = line.split(" ", 1)
                if len(parts) == 2:
                    self._devices[parts[0]] = parts[1].lstrip("- ").strip()

            if not self._devices:
                # Try alternative format
                result2 = subprocess.run(
                    ["kdeconnect-cli", "--list-devices"],
                    capture_output=True, text=True, timeout=10,
                )
                for line in result2.stdout.strip().split("\n"):
                    if "paired" in line.lower() and "reachable" in line.lower():
                        # Format: "- DeviceName: DeviceID (paired and reachable)"
                        parts = line.split(":")
                        if len(parts) >= 2:
                            name = parts[0].strip("- ").strip()
                            dev_id = parts[1].split("(")[0].strip()
                            self._devices[dev_id] = name

            if self._devices:
                print(f"[notify] Found devices: {', '.join(self._devices.values())}")
            else:
                print("[notify] No paired KDE Connect devices found")
        except Exception as e:
            print(f"[notify] Device discovery failed: {e}")

    # ── Monitoring Loop ──────────────────────────────────────────────

    def _monitor_loop(self):
        """Monitor KDE Connect notifications via dbus-monitor."""
        try:
            # Use dbus-monitor to watch for KDE Connect notification signals
            proc = subprocess.Popen(
                [
                    "dbus-monitor",
                    "--session",
                    "type='signal',interface='org.kde.kdeconnect.device.notifications'",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )

            buffer = []
            while self._running:
                line = proc.stdout.readline()
                if not line:
                    time.sleep(0.1)
                    continue

                buffer.append(line.strip())

                # Process complete signal blocks
                if line.strip() == "" and buffer:
                    self._process_dbus_signal(buffer)
                    buffer = []

                # Keep buffer from growing too large
                if len(buffer) > 50:
                    self._process_dbus_signal(buffer)
                    buffer = []

            proc.terminate()
        except Exception as e:
            print(f"[notify] Monitor loop error: {e}")
            # Fallback: poll notifications via CLI
            self._poll_loop()

    def _poll_loop(self):
        """Fallback: poll for notifications via kdeconnect-cli."""
        print("[notify] Falling back to polling mode")
        known_ids = set()
        while self._running:
            try:
                for device_id in self._devices:
                    result = subprocess.run(
                        ["kdeconnect-cli", "--device", device_id, "--list-notifications"],
                        capture_output=True, text=True, timeout=10,
                    )
                    for line in result.stdout.strip().split("\n"):
                        line = line.strip()
                        if not line:
                            continue
                        # Parse notification lines
                        notif_id = hashlib.md5(line.encode()).hexdigest()[:12]
                        if notif_id not in known_ids:
                            known_ids.add(notif_id)
                            device_name = self._devices.get(device_id, "Unknown")
                            self._handle_notification(
                                app="unknown",
                                title="",
                                body=line,
                                device=device_name,
                                device_id=device_id,
                                notif_id=notif_id,
                            )
                # Keep known_ids from growing unbounded
                if len(known_ids) > 500:
                    known_ids = set(list(known_ids)[-200:])
            except Exception as e:
                print(f"[notify] Poll error: {e}")
            time.sleep(5)

    def _process_dbus_signal(self, lines: list[str]):
        """Parse a D-Bus signal block for notification data."""
        signal_line = ""
        strings = []
        for line in lines:
            if line.startswith("signal"):
                signal_line = line
            if "string" in line:
                # Extract string value: string "value"
                start = line.find('"')
                end = line.rfind('"')
                if start >= 0 and end > start:
                    strings.append(line[start + 1 : end])

        if "notificationPosted" not in signal_line:
            return

        # Try to extract device ID from signal path
        device_id = ""
        if "/modules/kdeconnect/devices/" in signal_line:
            parts = signal_line.split("/modules/kdeconnect/devices/")
            if len(parts) > 1:
                device_id = parts[1].split("/")[0]

        # The signal only carries the notification ID — fetch full details via D-Bus
        notif_id = strings[0] if strings else ""
        if not notif_id or not device_id:
            return

        device_name = self._devices.get(device_id, "Unknown Device")
        app, title, body = self._fetch_notification_details(device_id, notif_id)

        if notif_id or title or body:
            self._handle_notification(
                app=app,
                title=title,
                body=body,
                device=device_name,
                device_id=device_id,
                notif_id=notif_id,
            )

    # ── Notification Processing ──────────────────────────────────────

    def _fetch_notification_details(self, device_id: str, notif_id: str) -> tuple[str, str, str]:
        """Fetch app, title, body from KDE Connect via gdbus.

        Uses gdbus call which returns GVariant format — much easier to parse
        than dbus-send's verbose output.
        """
        obj_path = f"/modules/kdeconnect/devices/{device_id}/notifications/{notif_id}"
        iface = "org.kde.kdeconnect.device.notifications.notification"
        try:
            result = subprocess.run(
                [
                    "gdbus", "call", "--session",
                    "--dest", "org.kde.kdeconnect",
                    "--object-path", obj_path,
                    "--method", "org.freedesktop.DBus.Properties.GetAll",
                    iface,
                ],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                return "unknown", "", ""

            out = result.stdout.strip()
            # GVariant format: ({'appName': <'Life360'>, 'title': <'Rabekha'>, ...},)
            # Extract string values using regex: 'key': <'value'>
            import re as _re
            props = {}
            for match in _re.finditer(r"'(\w+)':\s*<'((?:[^'\\]|\\.|'')*)'?>", out):
                props[match.group(1)] = match.group(2).replace("\\n", "\n")

            app = props.get("appName", "unknown")
            title = props.get("title", "")
            body = props.get("text", "") or props.get("ticker", "")

            # Extract package name from internalId for app matching
            # Format: "0|com.snapchat.android|...|...|..."
            internal_id = props.get("internalId", "")
            if internal_id and "|" in internal_id:
                parts = internal_id.split("|")
                if len(parts) >= 2 and "." in parts[1]:
                    package_name = parts[1]
                    # Use package name as app identifier for template matching
                    app = package_name

            return app, title, body
        except Exception as e:
            print(f"[notify] D-Bus property fetch failed: {e}")
            return "unknown", "", ""

    def _handle_notification(self, app: str, title: str, body: str,
                              device: str, device_id: str, notif_id: str):
        """Process a single notification — dedup, filter, announce, store."""
        if not self._enabled:
            return

        # Check blocklist
        if app.lower() in self._blocklist:
            return

        # Deduplication: hash the content, suppress if seen within window
        content = f"{app}:{title}:{body}"
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
        now = time.time()

        with self._lock:
            if content_hash in self._seen_hashes:
                if now - self._seen_hashes[content_hash] < DEDUP_WINDOW:
                    return  # Duplicate from another device
            self._seen_hashes[content_hash] = now

            # Clean old hashes
            cutoff = now - DEDUP_WINDOW * 2
            self._seen_hashes = {
                h: t for h, t in self._seen_hashes.items() if t > cutoff
            }

        # Build notification record
        notif = {
            "id": notif_id or content_hash,
            "app": app,
            "title": title,
            "body": body,
            "device": device,
            "device_id": device_id,
            "timestamp": now,
            "read": False,
        }

        # Store in history
        with self._lock:
            self._history.insert(0, notif)
            if len(self._history) > MAX_HISTORY:
                self._history = self._history[:MAX_HISTORY]

        print(f"[notify] {device} → {app}: {title} — {body[:60]}")

        # Log unknown/unrecognized apps for future mapping
        is_unknown = (not app or app == "unknown" or app not in self._get_known_apps())
        if is_unknown:
            self._log_unknown_notification(notif)

        # Emit to web GUI
        if self.socketio:
            self.socketio.emit("notification", notif)

        # Announce via TTS
        if self.voice:
            announcement = self._format_announcement(app, title, body, device)
            # Scrub long digit sequences (codes, phone numbers, OTPs) from TTS
            import re as _re
            announcement = _re.sub(r'\b\d{4,}\b', '', announcement)  # 4+ digit sequences
            announcement = _re.sub(r'\s{2,}', ' ', announcement).strip()
            if not announcement:
                return
            notif_volume = self._load_notif_volume()
            try:
                self.voice.speak(announcement, volume=notif_volume)
            except Exception as e:
                print(f"[notify] TTS failed: {e}")

        # Package delivery detection → alert service
        if self.alert_service:
            combined = f"{title} {body}".lower()
            package_keywords = ["delivered", "out for delivery", "arriving today",
                                "has shipped", "package arrived", "left at front door",
                                "delivery attempt", "in transit"]
            if any(kw in combined for kw in package_keywords):
                self.alert_service.send_alert(
                    "package_delivery",
                    f"Package Update: {title}",
                    body[:200],
                    priority="medium",
                )

    @staticmethod
    def _is_readable_text(text: str) -> bool:
        """Check if text is meaningful for TTS (not just numbers/IDs/hashes/codes)."""
        if not text or len(text.strip()) < 3:
            return False
        # Strip whitespace and punctuation for analysis
        stripped = ''.join(c for c in text if c.isalnum() or c == ' ')
        if not stripped.strip():
            return False
        alnum = ''.join(c for c in text if c.isalnum())
        if not alnum:
            return False
        digit_ratio = sum(c.isdigit() for c in alnum) / len(alnum)
        # If more than 40% digits, it's probably a code/ID/number — skip it
        if digit_ratio > 0.4:
            return False
        # Reject very short messages that are just codes (e.g. "2FA: 482910")
        words = stripped.split()
        if len(words) <= 2 and digit_ratio > 0.2:
            return False
        return True

    def _format_announcement(self, app: str, title: str, body: str, device: str) -> str:
        """Format notification into a natural, descriptive TTS announcement."""
        app_lower = app.lower()

        # ── App-specific announcement templates ──
        # Each entry: (friendly_name, verb_with_person, verb_without_person)
        # "person" = title field (usually the sender's name)
        APP_TEMPLATES = {
            # Snapchat
            "com.snapchat.android": ("Snapchat", "sent you a snap", "snap"),
            # Messaging / SMS
            "com.google.android.apps.messaging": ("text", "texted you", "text message"),
            "com.android.mms": ("text", "texted you", "text message"),
            "com.samsung.android.messaging": ("text", "texted you", "text message"),
            # Discord
            "com.discord": ("Discord", "sent you a message on Discord", "Discord notification"),
            # Instagram
            "com.instagram.android": ("Instagram", "sent you something on Instagram", "Instagram notification"),
            # Facebook / Messenger
            "com.facebook.orca": ("Messenger", "sent you a message on Messenger", "Messenger message"),
            "com.facebook.katana": ("Facebook", "sent you a notification on Facebook", "Facebook notification"),
            "com.facebook.lite": ("Facebook", "sent you a notification on Facebook", "Facebook notification"),
            # TikTok
            "com.zhiliaoapp.musically": ("TikTok", "sent you something on TikTok", "TikTok notification"),
            "com.ss.android.ugc.trill": ("TikTok", "sent you something on TikTok", "TikTok notification"),
            # Twitter / X
            "com.twitter.android": ("X", "sent you something on X", "X notification"),
            # Telegram
            "org.telegram.messenger": ("Telegram", "sent you a message on Telegram", "Telegram message"),
            # Signal
            "org.thoughtcrime.securesms": ("Signal", "sent you a message on Signal", "Signal message"),
            # Slack
            "com.slack": ("Slack", "sent you a message on Slack", "Slack message"),
            # Email
            "com.google.android.gm": ("Gmail", "sent you an email", "email"),
            "com.microsoft.office.outlook": ("Outlook", "sent you an email", "email"),
            "com.yahoo.mobile.client.android.mail": ("Yahoo Mail", "sent you an email", "email"),
            # Phone calls
            "com.google.android.dialer": ("phone", "is calling you", "phone call"),
            "com.samsung.android.incallui": ("phone", "is calling you", "phone call"),
            "com.android.phone": ("phone", "is calling you", "phone call"),
            # YouTube
            "com.google.android.youtube": ("YouTube", "posted on YouTube", "YouTube notification"),
            # Spotify
            "com.spotify.music": ("Spotify", None, "Spotify notification"),
            # Reddit
            "com.reddit.frontpage": ("Reddit", "sent you something on Reddit", "Reddit notification"),
            # Twitch
            "tv.twitch.android.app": ("Twitch", "went live on Twitch", "Twitch notification"),
            # Cash App / Venmo / PayPal
            "com.squareup.cash": ("Cash App", "sent you money on Cash App", "Cash App notification"),
            "com.venmo": ("Venmo", "sent you money on Venmo", "Venmo notification"),
            "com.paypal.android.p2pmobile": ("PayPal", "sent you money on PayPal", "PayPal notification"),
            # Google
            "com.google.android.apps.maps": ("Google Maps", None, "Google Maps notification"),
            "com.google.android.calendar": ("Google Calendar", None, "calendar reminder"),
            # Amazon
            "com.amazon.mShop.android.shopping": ("Amazon", None, "Amazon notification"),
            # Uber / Lyft
            "com.ubercab": ("Uber", None, "Uber notification"),
            "me.lyft.android": ("Lyft", None, "Lyft notification"),
            # DoorDash / UberEats
            "com.dd.doordash": ("DoorDash", None, "DoorDash update"),
            "com.ubercab.eats": ("Uber Eats", None, "Uber Eats update"),
            # Life360
            "com.life360.android.safetymapd": ("Life360", None, "Life360 update"),
            # WhatsApp
            "com.whatsapp": ("WhatsApp", "sent you a message on WhatsApp", "WhatsApp message"),
            # Groupme
            "com.groupme.android": ("GroupMe", "sent you a message on GroupMe", "GroupMe message"),
        }

        template = APP_TEMPLATES.get(app)

        if template:
            friendly_name, verb_with_person, verb_without_person = template
            person = title.strip() if title else ""
            msg = body.strip() if body and self._is_readable_text(body) else ""

            # Phone calls get special treatment
            if "calling" in (verb_with_person or ""):
                if person:
                    return f"{person} is calling you"
                return "You have an incoming phone call"

            if person and verb_with_person:
                if msg:
                    return f"{person} {verb_with_person}. {msg}"
                return f"{person} {verb_with_person}"
            elif msg:
                return f"You got a {verb_without_person}. {msg}"
            elif person:
                return f"{person} sent you a {friendly_name} notification"
            else:
                return f"New {verb_without_person}"
        else:
            # Unknown app — try to make a readable name from the package
            if "." in app:
                # e.g. "com.someapp.cool" -> "cool"
                friendly = app.split(".")[-1].replace("_", " ").title()
            else:
                friendly = app if app and app != "unknown" else ""

            person = title.strip() if title else ""
            msg = body.strip() if body and self._is_readable_text(body) else ""

            if person and msg and friendly:
                return f"{person} sent you a {friendly} notification. {msg}"
            elif person and msg:
                return f"Gavin! You got a notification from {person}. {msg}"
            elif person and friendly:
                return f"{person} sent you a {friendly} notification"
            elif person:
                return f"Gavin! You got a notification from {person}, but BMO doesn't know which app!"
            elif msg and friendly:
                return f"New {friendly} notification. {msg}"
            elif msg:
                return f"Gavin! You got a new notification. {msg}"
            else:
                return "Gavin! You got a new notification, but BMO doesn't know from who!"

    def _get_known_apps(self) -> set:
        """Return the set of app package names we have templates for."""
        return {
            "com.snapchat.android", "com.google.android.apps.messaging",
            "com.android.mms", "com.samsung.android.messaging",
            "com.discord", "com.instagram.android",
            "com.facebook.orca", "com.facebook.katana", "com.facebook.lite",
            "com.zhiliaoapp.musically", "com.ss.android.ugc.trill",
            "com.twitter.android", "org.telegram.messenger",
            "org.thoughtcrime.securesms", "com.slack",
            "com.google.android.gm", "com.microsoft.office.outlook",
            "com.yahoo.mobile.client.android.mail",
            "com.google.android.dialer", "com.samsung.android.incallui",
            "com.android.phone", "com.google.android.youtube",
            "com.spotify.music", "com.reddit.frontpage",
            "tv.twitch.android.app", "com.squareup.cash",
            "com.venmo", "com.paypal.android.p2pmobile",
            "com.google.android.apps.maps", "com.google.android.calendar",
            "com.amazon.mShop.android.shopping",
            "com.ubercab", "me.lyft.android",
            "com.dd.doordash", "com.ubercab.eats",
            "com.life360.android.safetymapd",
            "com.whatsapp", "com.groupme.android",
        }

    def _log_unknown_notification(self, notif: dict):
        """Log unrecognized notifications to a JSONL file for future mapping."""
        try:
            os.makedirs(os.path.dirname(UNKNOWN_NOTIF_LOG), exist_ok=True)
            entry = {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "app": notif.get("app", ""),
                "title": notif.get("title", ""),
                "body": notif.get("body", ""),
                "device": notif.get("device", ""),
                "notif_id": notif.get("id", ""),
            }
            with open(UNKNOWN_NOTIF_LOG, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            print(f"[notify] Failed to log unknown notification: {e}")

    def _load_notif_volume(self) -> int:
        """Load notification volume from settings."""
        try:
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
                return settings.get("volume", {}).get("notifications", 80)
        except Exception:
            pass
        return 80

    # ── Reply ────────────────────────────────────────────────────────

    def reply(self, notif_id: str, message: str, device_id: str = "") -> bool:
        """Reply to a notification via KDE Connect.

        Args:
            notif_id: The notification ID to reply to.
            message: The reply message text.
            device_id: Optional device ID. If empty, tries all devices.

        Returns:
            True if reply was sent successfully.
        """
        devices_to_try = [device_id] if device_id else list(self._devices.keys())

        for dev_id in devices_to_try:
            try:
                result = subprocess.run(
                    [
                        "kdeconnect-cli",
                        "--device", dev_id,
                        "--reply", notif_id,
                        "--message", message,
                    ],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    print(f"[notify] Reply sent via {self._devices.get(dev_id, dev_id)}")
                    return True
                else:
                    print(f"[notify] Reply failed: {result.stderr.strip()}")
            except Exception as e:
                print(f"[notify] Reply error: {e}")

        return False

    # ── History & Settings ───────────────────────────────────────────

    def get_history(self, limit: int = 50) -> list[dict]:
        """Get recent notification history."""
        with self._lock:
            return self._history[:limit]

    def clear_history(self):
        with self._lock:
            self._history.clear()

    def get_settings(self) -> dict:
        return {
            "enabled": self._enabled,
            "blocklist": sorted(self._blocklist),
            "devices": self._devices,
        }

    def update_settings(self, enabled: bool = None, blocklist: list = None):
        if enabled is not None:
            self._enabled = enabled
        if blocklist is not None:
            self._blocklist = set(blocklist)
        self._save_settings()

    def _save_settings(self):
        try:
            os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
            settings = {}
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
            settings["notifications"] = {
                "enabled": self._enabled,
                "blocklist": sorted(self._blocklist),
            }
            with open(SETTINGS_PATH, "w") as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            print(f"[notify] Save settings failed: {e}")

    def _load_settings(self):
        try:
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
                notif = settings.get("notifications", {})
                self._enabled = notif.get("enabled", True)
                self._blocklist = set(notif.get("blocklist", []))
        except Exception:
            pass
