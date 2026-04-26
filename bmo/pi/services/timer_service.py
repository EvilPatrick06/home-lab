"""BMO Timer & Alarm Service — Countdown timers and scheduled alarms."""

import datetime
import json
import os
import threading
import time
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

WEEKDAY_MAP = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
DEFAULT_EXISTING_ALARMS_TZ = "America/Denver"
UTC = datetime.timezone.utc


def _normalize_timezone(name: str | None) -> str | None:
    tz_name = str(name or "").strip()
    if not tz_name:
        return None
    try:
        ZoneInfo(tz_name)
        return tz_name
    except ZoneInfoNotFoundError:
        return None


class Timer:
    """A countdown timer."""

    def __init__(self, duration_sec: int, label: str = ""):
        self.id = str(uuid.uuid4())[:8]
        self.label = label or f"Timer ({duration_sec}s)"
        self.duration = duration_sec
        self.remaining = duration_sec
        self.started_at = time.time()
        self.paused = False
        self.fired = False

    def tick(self) -> bool:
        """Update remaining time. Returns True if timer just fired."""
        if self.paused or self.fired:
            return False
        elapsed = time.time() - self.started_at
        self.remaining = max(0, self.duration - int(elapsed))
        if self.remaining == 0 and not self.fired:
            self.fired = True
            return True
        return False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "duration": self.duration,
            "remaining": self.remaining,
            "paused": self.paused,
            "fired": self.fired,
            "type": "timer",
        }


class Alarm:
    """A scheduled alarm with optional repeat."""

    def __init__(self, target_time: datetime.datetime, label: str = "",
                 repeat: str = "none", repeat_days: list[str] | None = None,
                 tag: str = "reminder", anchor_timezone: str = DEFAULT_EXISTING_ALARMS_TZ,
                 hour: int | None = None, minute: int | None = None, local_date: str = "",
                 enabled: bool = True):
        tz_name = _normalize_timezone(anchor_timezone) or DEFAULT_EXISTING_ALARMS_TZ
        anchor_tz = ZoneInfo(tz_name)
        if target_time.tzinfo is None:
            target_time = target_time.replace(tzinfo=anchor_tz)
        target_utc = target_time.astimezone(UTC)
        local_target = target_utc.astimezone(anchor_tz)

        self.id = str(uuid.uuid4())[:8]
        self.anchor_timezone = tz_name
        self.label = label or f"Alarm ({local_target.strftime('%I:%M %p')})"
        self.target_time = target_utc
        self.hour = int(local_target.hour if hour is None else hour)
        self.minute = int(local_target.minute if minute is None else minute)
        self.local_date = local_date or (local_target.date().isoformat() if repeat == "none" else "")
        self.fired = False
        self.snoozed = False
        self.enabled = bool(enabled)
        self.repeat = repeat  # none, daily, weekdays, weekends, custom
        self.repeat_days = repeat_days or []  # ["mon","wed","fri"] for custom
        self.tag = tag  # wake-up, reminder, timer

    def check(self) -> bool:
        """Check if the alarm should fire now. Returns True if it just triggered."""
        if self.fired or not self.enabled:
            return False
        now = datetime.datetime.now(UTC)
        if now >= self.target_time:
            self.fired = True
            return True
        return False

    def advance_repeat(self):
        """After firing, advance to the next occurrence for repeating alarms.
        Returns True if alarm was rescheduled, False if non-repeating."""
        if self.repeat == "none":
            return False

        anchor_tz = ZoneInfo(self.anchor_timezone)
        now_local = datetime.datetime.now(UTC).astimezone(anchor_tz)
        base = now_local.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)

        if self.repeat == "daily":
            target = base if base > now_local else base + datetime.timedelta(days=1)
        elif self.repeat == "weekdays":
            target = base if (base > now_local and base.weekday() < 5) else base + datetime.timedelta(days=1)
            while target.weekday() >= 5:  # skip sat/sun
                target += datetime.timedelta(days=1)
        elif self.repeat == "weekends":
            target = base if (base > now_local and base.weekday() >= 5) else base + datetime.timedelta(days=1)
            while target.weekday() < 5:  # skip mon-fri
                target += datetime.timedelta(days=1)
        elif self.repeat == "custom" and self.repeat_days:
            day_nums = sorted(set(
                WEEKDAY_MAP[d.lower()[:3]] for d in self.repeat_days if d.lower()[:3] in WEEKDAY_MAP
            ))
            if not day_nums:
                return False
            target = base if (base > now_local and base.weekday() in day_nums) else base + datetime.timedelta(days=1)
            for _ in range(8):
                if target.weekday() in day_nums:
                    break
                target += datetime.timedelta(days=1)
        else:
            return False

        self.target_time = target.astimezone(UTC)
        self.fired = False
        self.snoozed = False
        return True

    def snooze(self, minutes: int = 5):
        """Snooze the alarm for N minutes."""
        self.target_time = datetime.datetime.now(UTC) + datetime.timedelta(minutes=minutes)
        self.fired = False
        self.snoozed = True

    @property
    def remaining(self) -> int:
        """Seconds until alarm fires."""
        delta = (self.target_time - datetime.datetime.now(UTC)).total_seconds()
        return max(0, int(delta))

    def to_dict(self, viewer_timezone: str | None = None) -> dict:
        viewer_tz_name = _normalize_timezone(viewer_timezone) or self.anchor_timezone
        viewer_tz = ZoneInfo(viewer_tz_name)
        view_dt = self.target_time.astimezone(viewer_tz)
        d = {
            "id": self.id,
            "label": self.label,
            "target_time": view_dt.strftime("%I:%M %p"),
            "target_date": view_dt.strftime("%Y-%m-%d"),
            "remaining": self.remaining,
            "fired": self.fired,
            "snoozed": self.snoozed,
            "enabled": self.enabled,
            "repeat": self.repeat,
            "tag": self.tag,
            "type": "alarm",
            "target_time_utc": self.target_time.isoformat(),
        }
        if self.repeat == "custom" and self.repeat_days:
            d["repeat_days"] = self.repeat_days
        return d


PERSIST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "alarms.json")


class TimerService:
    """Manages timers and alarms with background tick loop."""

    def __init__(self, voice_pipeline=None, socketio=None, agent_fn=None):
        self.voice = voice_pipeline
        self.socketio = socketio
        self.agent_fn = agent_fn  # callable that returns the agent instance
        self.alarm_volume = None  # None = use system volume (no override)
        self._timers: dict[str, Timer] = {}
        self._alarms: dict[str, Alarm] = {}
        self._running = False
        self._tick_thread = None
        self._client_timezone_by_sid: dict[str, str] = {}
        self._load_alarms()
    
    @staticmethod
    def _next_local_occurrence(
        now_local: datetime.datetime,
        hour: int,
        minute: int,
        repeat: str,
        repeat_days: list[str] | None = None,
        date: str = "",
    ) -> datetime.datetime:
        if date:
            try:
                d = datetime.datetime.strptime(date, "%Y-%m-%d").date()
                return now_local.replace(year=d.year, month=d.month, day=d.day, hour=hour, minute=minute, second=0, microsecond=0)
            except ValueError:
                pass
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if repeat == "none":
            if candidate <= now_local:
                candidate += datetime.timedelta(days=1)
            return candidate
        if repeat == "daily":
            if candidate <= now_local:
                candidate += datetime.timedelta(days=1)
            return candidate
        if repeat == "weekdays":
            if candidate <= now_local:
                candidate += datetime.timedelta(days=1)
            while candidate.weekday() >= 5:
                candidate += datetime.timedelta(days=1)
            return candidate
        if repeat == "weekends":
            if candidate <= now_local:
                candidate += datetime.timedelta(days=1)
            while candidate.weekday() < 5:
                candidate += datetime.timedelta(days=1)
            return candidate
        if repeat == "custom" and repeat_days:
            day_nums = sorted(set(
                WEEKDAY_MAP[d.lower()[:3]] for d in repeat_days if d.lower()[:3] in WEEKDAY_MAP
            ))
            if not day_nums:
                return candidate if candidate > now_local else candidate + datetime.timedelta(days=1)
            if candidate <= now_local or candidate.weekday() not in day_nums:
                for _ in range(8):
                    candidate += datetime.timedelta(days=1)
                    if candidate.weekday() in day_nums:
                        break
            return candidate
        return candidate if candidate > now_local else candidate + datetime.timedelta(days=1)

    # ── Timer Operations ─────────────────────────────────────────────

    def create_timer(self, duration_sec: int, label: str = "") -> dict:
        """Create a new countdown timer."""
        timer = Timer(duration_sec, label)
        self._timers[timer.id] = timer
        self._ensure_running()
        self._emit("timer_created", timer.to_dict())
        self._save_all()
        return timer.to_dict()

    def cancel_timer(self, timer_id: str) -> bool:
        """Cancel and remove a timer."""
        if timer_id in self._timers:
            del self._timers[timer_id]
            self._emit("timer_cancelled", {"id": timer_id})
            self._save_all()
            return True
        return False

    def pause_timer(self, timer_id: str) -> bool:
        """Pause or unpause a timer."""
        timer = self._timers.get(timer_id)
        if timer:
            timer.paused = not timer.paused
            if not timer.paused:
                timer.started_at = time.time() - (timer.duration - timer.remaining)
            self._save_all()
            return True
        return False

    # ── Alarm Operations ─────────────────────────────────────────────

    def create_alarm(self, hour: int, minute: int, label: str = "",
                     date: str = "", repeat: str = "none",
                     repeat_days: list[str] | None = None,
                     tag: str = "reminder",
                     timezone_name: str | None = None,
                     enabled: bool = True) -> dict:
        """Create a new alarm. Supports specific date, repeat patterns, and tags."""
        tz_name = _normalize_timezone(timezone_name) or datetime.datetime.now().astimezone().tzinfo.key
        if not tz_name:
            tz_name = DEFAULT_EXISTING_ALARMS_TZ
        anchor_tz = ZoneInfo(tz_name)
        now_local = datetime.datetime.now(UTC).astimezone(anchor_tz)
        target_local = self._next_local_occurrence(
            now_local=now_local,
            hour=hour,
            minute=minute,
            repeat=repeat,
            repeat_days=repeat_days,
            date=date,
        )
        local_date = date if repeat == "none" and date else (target_local.date().isoformat() if repeat == "none" else "")
        alarm = Alarm(
            target_local,
            label,
            repeat=repeat,
            repeat_days=repeat_days,
            tag=tag,
            anchor_timezone=tz_name,
            hour=hour,
            minute=minute,
            local_date=local_date,
            enabled=enabled,
        )
        self._alarms[alarm.id] = alarm
        self._ensure_running()
        self._emit("alarm_created", alarm.to_dict())
        self._save_alarms()
        return alarm.to_dict()

    def cancel_alarm(self, alarm_id: str) -> bool:
        """Cancel and remove an alarm."""
        if alarm_id in self._alarms:
            del self._alarms[alarm_id]
            self._emit("alarm_cancelled", {"id": alarm_id})
            self._save_alarms()
            return True
        return False

    def snooze_alarm(self, alarm_id: str, minutes: int = 5) -> bool:
        """Snooze a fired alarm."""
        alarm = self._alarms.get(alarm_id)
        if alarm and alarm.fired:
            alarm.snooze(minutes)
            self._emit("alarm_snoozed", alarm.to_dict())
            self._save_alarms()
            return True
        return False

    def set_alarm_enabled(self, alarm_id: str, enabled: bool) -> dict | None:
        """Enable/disable an alarm. Re-enabled repeating alarms resume from next valid occurrence."""
        alarm = self._alarms.get(alarm_id)
        if not alarm:
            return None
        enabled = bool(enabled)
        if alarm.enabled == enabled:
            return alarm.to_dict()

        alarm.enabled = enabled
        if not enabled:
            alarm.fired = False
            alarm.snoozed = False
        if enabled:
            alarm.fired = False
            alarm.snoozed = False
            if alarm.repeat != "none":
                anchor_tz = ZoneInfo(alarm.anchor_timezone)
                now_local = datetime.datetime.now(UTC).astimezone(anchor_tz)
                new_target = self._next_local_occurrence(
                    now_local=now_local,
                    hour=alarm.hour,
                    minute=alarm.minute,
                    repeat=alarm.repeat,
                    repeat_days=alarm.repeat_days,
                    date=alarm.local_date,
                )
                alarm.target_time = new_target.astimezone(UTC)

        self._save_alarms()
        self._emit("alarm_updated", alarm.to_dict())
        return alarm.to_dict()

    def update_alarm(self, alarm_id: str, **kwargs) -> dict | None:
        """Update an existing alarm in-place. Accepts hour, minute, label, repeat, repeat_days, tag."""
        alarm = self._alarms.get(alarm_id)
        if not alarm:
            return None
        if "label" in kwargs:
            alarm.label = kwargs["label"]
        if "tag" in kwargs:
            alarm.tag = kwargs["tag"]
        if "repeat" in kwargs:
            alarm.repeat = kwargs["repeat"]
        if "repeat_days" in kwargs:
            alarm.repeat_days = kwargs["repeat_days"] or []
        if "timezone_name" in kwargs:
            alarm.anchor_timezone = _normalize_timezone(kwargs["timezone_name"]) or alarm.anchor_timezone
        if "date" in kwargs:
            alarm.local_date = kwargs["date"] or ""
        # Reschedule time if hour or minute changed
        if "hour" in kwargs or "minute" in kwargs or "repeat" in kwargs or "repeat_days" in kwargs or "timezone_name" in kwargs or "date" in kwargs:
            new_h = kwargs.get("hour", alarm.hour)
            new_m = kwargs.get("minute", alarm.minute)
            alarm.hour = new_h
            alarm.minute = new_m
            anchor_tz = ZoneInfo(alarm.anchor_timezone)
            now_local = datetime.datetime.now(UTC).astimezone(anchor_tz)
            new_target = self._next_local_occurrence(
                now_local=now_local,
                hour=new_h,
                minute=new_m,
                repeat=alarm.repeat,
                repeat_days=alarm.repeat_days,
                date=alarm.local_date,
            )
            alarm.target_time = new_target.astimezone(UTC)
            alarm.fired = False
            alarm.snoozed = False
        self._save_alarms()
        self._emit("alarm_updated", alarm.to_dict())
        print(f"[timer] Updated alarm: {alarm.label} → {alarm.to_dict().get('target_time')}")
        return alarm.to_dict()

    # ── Lookup by label ──────────────────────────────────────────────

    def find_by_label(self, label: str, item_type: str = "") -> dict | None:
        """Find a timer or alarm by label substring match."""
        label_lower = label.lower()
        if item_type != "alarm":
            for t in self._timers.values():
                if label_lower in t.label.lower():
                    return t.to_dict()
        if item_type != "timer":
            for a in self._alarms.values():
                if label_lower in a.label.lower():
                    return a.to_dict()
        return None

    # ── List All ─────────────────────────────────────────────────────

    def get_all(self, viewer_timezone: str | None = None) -> list[dict]:
        """Get all active timers and alarms."""
        items = []
        items.extend(t.to_dict() for t in self._timers.values() if not t.fired)
        items.extend(a.to_dict(viewer_timezone=viewer_timezone) for a in self._alarms.values() if not a.fired)
        return items

    def get_alarm(self, alarm_id: str, viewer_timezone: str | None = None) -> dict | None:
        alarm = self._alarms.get(alarm_id)
        if not alarm:
            return None
        return alarm.to_dict(viewer_timezone=viewer_timezone)

    def set_client_timezone(self, sid: str, timezone_name: str | None):
        tz = _normalize_timezone(timezone_name)
        if tz:
            self._client_timezone_by_sid[sid] = tz
        elif sid in self._client_timezone_by_sid:
            del self._client_timezone_by_sid[sid]

    def clear_client(self, sid: str):
        if sid in self._client_timezone_by_sid:
            del self._client_timezone_by_sid[sid]

    # ── Background Tick Loop ─────────────────────────────────────────

    def _ensure_running(self):
        if self._running:
            return
        self._running = True
        self._tick_thread = threading.Thread(target=self._tick_loop, daemon=True)
        self._tick_thread.start()

    def _tick_loop(self):
        while self._running:
            # Tick timers
            for timer in list(self._timers.values()):
                if timer.tick():
                    self._on_timer_fired(timer)

            # Check alarms
            for alarm in list(self._alarms.values()):
                if alarm.check():
                    self._on_alarm_fired(alarm)

            # Broadcast state updates every second
            self._emit("timers_tick", self.get_all())

            time.sleep(1)

    def _on_timer_fired(self, timer: Timer):
        """Called when a timer reaches zero."""
        msg = f"Beep boop! {timer.label} is done!"
        print(f"[timer] FIRED: {timer.label}")
        self._emit("timer_fired", {"id": timer.id, "label": timer.label, "message": msg})

        if self.voice:
            self.voice.speak(msg, volume=self.alarm_volume, priority="timer")
            if hasattr(self.voice, 'start_conversation'):
                self.voice.start_conversation()

        threading.Timer(5.0, lambda: (self._timers.pop(timer.id, None), self._save_all())).start()

    def _on_alarm_fired(self, alarm: Alarm):
        """Called when an alarm triggers — behavior depends on tag."""
        print(f"[alarm] FIRED: {alarm.label} (tag={alarm.tag})")

        if alarm.tag == "wake-up":
            self._handle_wakeup_alarm(alarm)
        elif alarm.tag == "timer":
            msg = f"Beep boop! {alarm.label} is done!"
            self._emit("alarm_fired", {
                "id": alarm.id, "label": alarm.label, "message": msg,
                "type": "alarm", "tag": alarm.tag, "repeat": alarm.repeat,
            })
            if self.voice:
                self.voice.speak(msg, volume=self.alarm_volume, priority="alarm")
                if hasattr(self.voice, 'start_conversation'):
                    self.voice.start_conversation()
        else:
            # Default "reminder" tag
            msg = f"Hey! Don't forget: {alarm.label}!"
            self._emit("alarm_fired", {
                "id": alarm.id, "label": alarm.label, "message": msg,
                "type": "alarm", "tag": alarm.tag, "repeat": alarm.repeat,
            })
            if self.voice:
                self.voice.speak(msg, volume=self.alarm_volume, priority="alarm")
                if hasattr(self.voice, 'start_conversation'):
                    self.voice.start_conversation()

        # Auto-advance repeating alarms to next occurrence
        if alarm.advance_repeat():
            next_local = alarm.target_time.astimezone(ZoneInfo(alarm.anchor_timezone))
            print(f"[alarm] Rescheduled '{alarm.label}' → {next_local.strftime('%a %I:%M %p')} ({alarm.anchor_timezone})")
            self._save_alarms()

    def _handle_wakeup_alarm(self, alarm: Alarm):
        """Wake-up alarm — BMO generates a personalized morning greeting via the AI agent."""
        self._emit("alarm_fired", {
            "id": alarm.id, "label": alarm.label,
            "message": f"Good morning! {alarm.label}",
            "type": "alarm", "tag": "wake-up", "repeat": alarm.repeat,
        })

        # Ask the agent to generate a unique morning greeting
        agent = self.agent_fn() if self.agent_fn else None
        if agent:
            try:
                now = datetime.datetime.now()
                prompt = (
                    f"SYSTEM INSTRUCTION: This is an internal wake-up alarm trigger, not a user message. "
                    f"Generate ONLY a spoken greeting — no command blocks, no code, no markdown, no brackets, "
                    f"no [EMOTION] tags, no underscores, no formatting. Just plain spoken words.\n\n"
                    f"It's {now.strftime('%A, %B %d')} at {now.strftime('%I:%M %p')}. "
                    f"Generate a morning greeting for Gavin that starts with "
                    f"'Beep Beep! Time to wake up Gavin, it is morning time!' then offer to share "
                    f"today's weather forecast, the latest news, or what Gavin has planned today. "
                    f"Then tell Gavin what BMO is going to do today — pick something fun and different "
                    f"each time (examples: learn origami, practice beatboxing, catalog bugs in the garden, "
                    f"write a haiku, reorganize the spice rack, learn a new dance, study cloud formations, "
                    f"try to befriend a squirrel, paint a tiny masterpiece). "
                    f"Be creative and in-character as BMO. Keep it to 3-4 sentences of plain speech."
                )
                result = agent.chat(prompt, speaker="system")
                msg = result.get("text", "Beep Beep! Time to wake up Gavin!")
                msg = self._clean_for_speech(msg)
            except Exception as e:
                print(f"[alarm] Wake-up agent call failed: {e}")
                msg = "Beep Beep! Time to wake up Gavin, it is morning time! Would you like to hear today's forecast, or maybe the latest news report?"
        else:
            msg = "Beep Beep! Time to wake up Gavin, it is morning time! Would you like to hear today's forecast, or maybe the latest news report?"

        print(f"[alarm] Wake-up message: {msg[:80]}...")
        if self.voice:
            self.voice.speak(msg, volume=self.alarm_volume, priority="alarm")
            if hasattr(self.voice, 'start_conversation'):
                self.voice.start_conversation()

    @staticmethod
    def _clean_for_speech(text: str) -> str:
        """Strip formatting artifacts so TTS reads clean speech."""
        import re
        # Remove [EMOTION:...] tags
        text = re.sub(r'\[EMOTION:\w+\]', '', text)
        # Remove ```command ... ``` blocks entirely
        text = re.sub(r'```[\s\S]*?```', '', text)
        # Remove markdown bold/italic markers
        text = re.sub(r'[*_]{1,3}', '', text)
        # Remove markdown headers
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
        # Remove square bracket notation like [tag] or [label]
        text = re.sub(r'\[[\w\s:-]+\]', '', text)
        # Collapse multiple spaces/newlines
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    # ── Persistence ──────────────────────────────────────────────────

    def _save_all(self):
        """Save both alarms and timers to disk."""
        self._save_alarms()

    def _save_alarms(self):
        """Save alarms and active timers to disk so they survive restarts."""
        try:
            os.makedirs(os.path.dirname(PERSIST_PATH), exist_ok=True)
            alarms = []
            for a in self._alarms.values():
                alarms.append({
                    "id": a.id,
                    "label": a.label,
                    "hour": a.hour,
                    "minute": a.minute,
                    "target_time_utc": a.target_time.isoformat(),
                    "anchor_timezone": a.anchor_timezone,
                    "local_date": a.local_date,
                    "repeat": a.repeat,
                    "repeat_days": a.repeat_days,
                    "tag": a.tag,
                    "enabled": a.enabled,
                    "fired": a.fired,
                    "snoozed": a.snoozed,
                })
            timers = []
            for t in self._timers.values():
                if not t.fired:
                    timers.append({
                        "id": t.id,
                        "label": t.label,
                        "duration": t.duration,
                        "remaining": t.remaining,
                        "started_at": t.started_at,
                        "paused": t.paused,
                    })
            with open(PERSIST_PATH, "w") as f:
                json.dump({"alarms": alarms, "timers": timers}, f, indent=2)
        except Exception as e:
            print(f"[timer] Save failed: {e}")

    def _load_alarms(self):
        """Load saved alarms and timers from disk on startup."""
        if not os.path.exists(PERSIST_PATH):
            return
        try:
            with open(PERSIST_PATH, "r") as f:
                raw = json.load(f)

            # Support both old format (list of alarms) and new format (dict with alarms+timers)
            if isinstance(raw, list):
                alarm_data, timer_data = raw, []
            else:
                alarm_data = raw.get("alarms", [])
                timer_data = raw.get("timers", [])

            loaded = 0
            for item in alarm_data:
                repeat = item.get("repeat", "none")
                repeat_days = item.get("repeat_days")
                tag = item.get("tag", "reminder")
                label = item.get("label", "")
                legacy_target = item.get("target_time")
                legacy_target_utc = item.get("target_time_utc")
                anchor_timezone = _normalize_timezone(item.get("anchor_timezone"))
                local_date = str(item.get("local_date", "") or "")
                enabled = bool(item.get("enabled", True))
                if anchor_timezone:
                    target_utc = datetime.datetime.fromisoformat(legacy_target_utc) if legacy_target_utc else None
                    if target_utc is None and legacy_target:
                        guess = datetime.datetime.fromisoformat(legacy_target)
                        if guess.tzinfo is None:
                            guess = guess.replace(tzinfo=ZoneInfo(anchor_timezone))
                        target_utc = guess.astimezone(UTC)
                    if target_utc is None:
                        target_utc = datetime.datetime.now(UTC)
                    alarm = Alarm(
                        target_utc,
                        label=label,
                        repeat=repeat,
                        repeat_days=repeat_days,
                        tag=tag,
                        anchor_timezone=anchor_timezone,
                        hour=item.get("hour"),
                        minute=item.get("minute"),
                        local_date=local_date,
                        enabled=enabled,
                    )
                    alarm.id = item["id"]
                    alarm.fired = item.get("fired", False)
                    alarm.snoozed = item.get("snoozed", False)
                    if not alarm.enabled:
                        alarm.fired = False
                    # Existing rules on startup
                    if alarm.fired and alarm.repeat == "none" and alarm.enabled:
                        continue
                    if alarm.fired and alarm.repeat != "none" and alarm.enabled:
                        alarm.advance_repeat()
                    self._alarms[alarm.id] = alarm
                    loaded += 1
                    continue

                # Legacy migration: treat existing alarms as Mountain Time anchored.
                mt = ZoneInfo(DEFAULT_EXISTING_ALARMS_TZ)
                now_mt = datetime.datetime.now(UTC).astimezone(mt)
                hour = int(item.get("hour", 0))
                minute = int(item.get("minute", 0))
                date_field = ""
                if repeat == "none":
                    target_local = now_mt.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if legacy_target:
                        try:
                            old = datetime.datetime.fromisoformat(legacy_target)
                            date_field = old.date().isoformat()
                            target_local = target_local.replace(year=old.year, month=old.month, day=old.day)
                        except ValueError:
                            date_field = target_local.date().isoformat()
                    else:
                        date_field = target_local.date().isoformat()
                    alarm = Alarm(
                        target_local,
                        label=label,
                        repeat=repeat,
                        repeat_days=repeat_days,
                        tag=tag,
                        anchor_timezone=DEFAULT_EXISTING_ALARMS_TZ,
                        hour=hour,
                        minute=minute,
                        local_date=date_field,
                        enabled=enabled,
                    )
                    if alarm.target_time < datetime.datetime.now(UTC):
                        alarm.fired = True
                else:
                    next_local = self._next_local_occurrence(
                        now_local=now_mt,
                        hour=hour,
                        minute=minute,
                        repeat=repeat,
                        repeat_days=repeat_days,
                        date="",
                    )
                    alarm = Alarm(
                        next_local,
                        label=label,
                        repeat=repeat,
                        repeat_days=repeat_days,
                        tag=tag,
                        anchor_timezone=DEFAULT_EXISTING_ALARMS_TZ,
                        hour=hour,
                        minute=minute,
                        local_date="",
                        enabled=enabled,
                    )
                alarm.id = item["id"]
                if repeat != "none":
                    alarm.fired = False
                if not alarm.enabled:
                    alarm.fired = False
                self._alarms[alarm.id] = alarm
                loaded += 1

            if loaded:
                print(f"[timer] Loaded {loaded} saved alarms")
                self._save_alarms()

            # Restore timers with adjusted remaining time
            timer_loaded = 0
            now = time.time()
            for item in timer_data:
                elapsed_since_save = now - item["started_at"]
                if item.get("paused"):
                    remaining = item["remaining"]
                else:
                    remaining = item["duration"] - int(elapsed_since_save)

                if remaining <= 0:
                    # Timer expired while BMO was down — fire it now
                    msg = f"Beep boop! {item['label']} finished while I was restarting!"
                    print(f"[timer] EXPIRED DURING DOWNTIME: {item['label']}")
                    self._emit("timer_fired", {"id": item["id"], "label": item["label"], "message": msg})
                    if self.voice:
                        threading.Timer(2.0, lambda m=msg: self.voice.speak(m, volume=self.alarm_volume, priority="timer")).start()
                    continue

                timer = Timer(item["duration"], item["label"])
                timer.id = item["id"]
                timer.paused = item.get("paused", False)
                # Adjust started_at so remaining calculation is correct
                timer.started_at = now - (item["duration"] - remaining)
                timer.remaining = remaining
                self._timers[timer.id] = timer
                timer_loaded += 1

            if timer_loaded:
                print(f"[timer] Restored {timer_loaded} saved timers")

            if loaded or timer_loaded:
                self._ensure_running()
        except Exception as e:
            print(f"[timer] Load failed: {e}")

    def stop(self):
        self._running = False

    def _emit(self, event: str, data):
        if self.socketio:
            if event == "timers_tick":
                for sid, tz in list(self._client_timezone_by_sid.items()):
                    self.socketio.emit("timers_tick", self.get_all(viewer_timezone=tz), room=sid)
                return
            self.socketio.emit(event, data)
