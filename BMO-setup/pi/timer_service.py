"""BMO Timer & Alarm Service — Countdown timers and scheduled alarms."""

import datetime
import json
import os
import threading
import time
import uuid

WEEKDAY_MAP = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


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
                 tag: str = "reminder"):
        self.id = str(uuid.uuid4())[:8]
        self.label = label or f"Alarm ({target_time.strftime('%I:%M %p')})"
        self.target_time = target_time
        self.hour = target_time.hour
        self.minute = target_time.minute
        self.fired = False
        self.snoozed = False
        self.repeat = repeat  # none, daily, weekdays, weekends, custom
        self.repeat_days = repeat_days or []  # ["mon","wed","fri"] for custom
        self.tag = tag  # wake-up, reminder, timer

    def check(self) -> bool:
        """Check if the alarm should fire now. Returns True if it just triggered."""
        if self.fired:
            return False
        now = datetime.datetime.now()
        if now >= self.target_time:
            self.fired = True
            return True
        return False

    def advance_repeat(self):
        """After firing, advance to the next occurrence for repeating alarms.
        Returns True if alarm was rescheduled, False if non-repeating."""
        if self.repeat == "none":
            return False

        now = datetime.datetime.now()
        base = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)

        if self.repeat == "daily":
            target = base + datetime.timedelta(days=1)
        elif self.repeat == "weekdays":
            target = base + datetime.timedelta(days=1)
            while target.weekday() >= 5:  # skip sat/sun
                target += datetime.timedelta(days=1)
        elif self.repeat == "weekends":
            target = base + datetime.timedelta(days=1)
            while target.weekday() < 5:  # skip mon-fri
                target += datetime.timedelta(days=1)
        elif self.repeat == "custom" and self.repeat_days:
            day_nums = sorted(set(
                WEEKDAY_MAP[d.lower()[:3]] for d in self.repeat_days if d.lower()[:3] in WEEKDAY_MAP
            ))
            if not day_nums:
                return False
            target = base + datetime.timedelta(days=1)
            for _ in range(8):
                if target.weekday() in day_nums:
                    break
                target += datetime.timedelta(days=1)
        else:
            return False

        self.target_time = target
        self.fired = False
        self.snoozed = False
        return True

    def snooze(self, minutes: int = 5):
        """Snooze the alarm for N minutes."""
        self.target_time = datetime.datetime.now() + datetime.timedelta(minutes=minutes)
        self.fired = False
        self.snoozed = True

    @property
    def remaining(self) -> int:
        """Seconds until alarm fires."""
        delta = (self.target_time - datetime.datetime.now()).total_seconds()
        return max(0, int(delta))

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "label": self.label,
            "target_time": self.target_time.strftime("%I:%M %p"),
            "target_date": self.target_time.strftime("%Y-%m-%d"),
            "remaining": self.remaining,
            "fired": self.fired,
            "snoozed": self.snoozed,
            "repeat": self.repeat,
            "tag": self.tag,
            "type": "alarm",
        }
        if self.repeat == "custom" and self.repeat_days:
            d["repeat_days"] = self.repeat_days
        return d


PERSIST_PATH = os.path.join(os.path.dirname(__file__), "data", "alarms.json")


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
        self._load_alarms()

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
                     tag: str = "reminder") -> dict:
        """Create a new alarm. Supports specific date, repeat patterns, and tags."""
        now = datetime.datetime.now()

        if date:
            try:
                d = datetime.datetime.strptime(date, "%Y-%m-%d")
                target = d.replace(hour=hour, minute=minute, second=0, microsecond=0)
            except ValueError:
                target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if target <= now:
                    target += datetime.timedelta(days=1)
        else:
            target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now:
                target += datetime.timedelta(days=1)

        # For weekday/weekend/custom repeats, advance to next matching day
        if repeat == "weekdays" and target.weekday() >= 5:
            while target.weekday() >= 5:
                target += datetime.timedelta(days=1)
        elif repeat == "weekends" and target.weekday() < 5:
            while target.weekday() < 5:
                target += datetime.timedelta(days=1)
        elif repeat == "custom" and repeat_days:
            day_nums = sorted(set(
                WEEKDAY_MAP[d.lower()[:3]] for d in repeat_days if d.lower()[:3] in WEEKDAY_MAP
            ))
            if day_nums and target.weekday() not in day_nums:
                for _ in range(8):
                    target += datetime.timedelta(days=1)
                    if target.weekday() in day_nums:
                        break

        alarm = Alarm(target, label, repeat=repeat, repeat_days=repeat_days, tag=tag)
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
        # Reschedule time if hour or minute changed
        if "hour" in kwargs or "minute" in kwargs:
            new_h = kwargs.get("hour", alarm.hour)
            new_m = kwargs.get("minute", alarm.minute)
            alarm.hour = new_h
            alarm.minute = new_m
            now = datetime.datetime.now()
            new_target = now.replace(hour=new_h, minute=new_m, second=0, microsecond=0)
            if new_target <= now:
                new_target += datetime.timedelta(days=1)
            alarm.target_time = new_target
            alarm.fired = False
            alarm.snoozed = False
        self._save_alarms()
        self._emit("alarm_updated", alarm.to_dict())
        print(f"[timer] Updated alarm: {alarm.label} → {alarm.target_time.strftime('%I:%M %p')}")
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

    def get_all(self) -> list[dict]:
        """Get all active timers and alarms."""
        items = []
        items.extend(t.to_dict() for t in self._timers.values() if not t.fired)
        items.extend(a.to_dict() for a in self._alarms.values() if not a.fired)
        return items

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
            print(f"[alarm] Rescheduled '{alarm.label}' → {alarm.target_time.strftime('%a %I:%M %p')}")
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
                    "target_time": a.target_time.isoformat(),
                    "repeat": a.repeat,
                    "repeat_days": a.repeat_days,
                    "tag": a.tag,
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
                target = datetime.datetime.fromisoformat(item["target_time"])
                alarm = Alarm(
                    target,
                    label=item.get("label", ""),
                    repeat=item.get("repeat", "none"),
                    repeat_days=item.get("repeat_days"),
                    tag=item.get("tag", "reminder"),
                )
                alarm.id = item["id"]
                alarm.fired = item.get("fired", False)
                alarm.snoozed = item.get("snoozed", False)

                # Skip non-repeating alarms whose time has passed
                if alarm.fired and alarm.repeat == "none":
                    continue
                # Advance repeating alarms that fired while we were offline
                if alarm.fired and alarm.repeat != "none":
                    alarm.advance_repeat()

                self._alarms[alarm.id] = alarm
                loaded += 1

            if loaded:
                print(f"[timer] Loaded {loaded} saved alarms")

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
            self.socketio.emit(event, data)
