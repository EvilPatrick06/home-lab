"""BMO Routine Service — Automation engine with voice, schedule, and event triggers.

Chains actions (commands, speech, delays) triggered by voice phrases,
cron-like schedules, or system events.

Data: ~/bmo/data/routines.json
"""

import json
import os
import re
import threading
import time
import uuid


DATA_DIR = os.path.expanduser("~/bmo/data")
ROUTINES_FILE = os.path.join(DATA_DIR, "routines.json")


def _simple_cron_match(cron_expr: str) -> bool:
    """Match a simple cron expression: 'minute hour dom month dow'.

    Supports: *, specific numbers, ranges (1-5), lists (1,3,5).
    """
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        return False

    now = time.localtime()
    fields = [now.tm_min, now.tm_hour, now.tm_mday, now.tm_mon, now.tm_wday]
    # Python tm_wday: 0=Monday. Cron: 0=Sunday. Convert.
    fields[4] = (fields[4] + 1) % 7

    for field_val, pattern in zip(fields, parts):
        if pattern == "*":
            continue
        # List: "1,3,5"
        if "," in pattern:
            values = [int(v) for v in pattern.split(",")]
            if field_val not in values:
                return False
        # Range: "1-5"
        elif "-" in pattern:
            lo, hi = pattern.split("-", 1)
            if not (int(lo) <= field_val <= int(hi)):
                return False
        # Exact
        else:
            if field_val != int(pattern):
                return False
    return True


class RoutineService:
    """Automation engine — triggers → actions with conditions."""

    def __init__(self, agent=None, voice=None, socketio=None):
        self._agent = agent  # callable or BmoAgent ref
        self._voice = voice
        self.socketio = socketio
        self._routines = self._load()
        self._running = False
        self._scheduler_thread = None
        self._last_triggered = {}  # routine_id → monotonic timestamp
        self._event_listeners = {}  # event_name → [routine_id, ...]

        # Build event listener index
        self._rebuild_event_index()

    # ── Lifecycle ─────────────────────────────────────────────────────

    def start(self):
        """Start the scheduler background thread."""
        if self._running:
            return
        self._running = True
        self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        self._scheduler_thread.start()
        print(f"[routine] Scheduler started ({len(self._routines)} routines)")

    def stop(self):
        self._running = False

    # ── CRUD ──────────────────────────────────────────────────────────

    def create_routine(self, name: str, triggers: list[dict],
                       actions: list[dict], conditions: dict | None = None) -> dict:
        """Create a new routine."""
        routine = {
            "id": f"r_{uuid.uuid4().hex[:8]}",
            "name": name,
            "enabled": True,
            "triggers": triggers,
            "actions": actions,
            "conditions": conditions or {},
        }
        self._routines.append(routine)
        self._save()
        self._rebuild_event_index()
        return routine

    def get_routine(self, routine_id: str) -> dict | None:
        for r in self._routines:
            if r["id"] == routine_id:
                return r
        return None

    def get_all(self) -> list[dict]:
        return list(self._routines)

    def update_routine(self, routine_id: str, **kwargs) -> dict | None:
        for r in self._routines:
            if r["id"] == routine_id:
                r.update(kwargs)
                self._save()
                self._rebuild_event_index()
                return r
        return None

    def delete_routine(self, routine_id: str) -> bool:
        before = len(self._routines)
        self._routines = [r for r in self._routines if r["id"] != routine_id]
        if len(self._routines) < before:
            self._save()
            self._rebuild_event_index()
            return True
        return False

    def enable_routine(self, routine_id: str, enabled: bool = True) -> bool:
        for r in self._routines:
            if r["id"] == routine_id:
                r["enabled"] = enabled
                self._save()
                return True
        return False

    def find_by_name(self, name: str) -> dict | None:
        """Find a routine by name (case-insensitive)."""
        name_lower = name.lower()
        for r in self._routines:
            if r["name"].lower() == name_lower:
                return r
        return None

    # ── Trigger Checking ──────────────────────────────────────────────

    def check_voice_trigger(self, transcript: str) -> dict | None:
        """Check if a voice transcript matches any routine trigger.

        Returns the matched routine, or None.
        """
        transcript_lower = transcript.lower().strip()
        for routine in self._routines:
            if not routine.get("enabled", True):
                continue
            for trigger in routine.get("triggers", []):
                if trigger.get("type") != "voice":
                    continue
                for phrase in trigger.get("phrases", []):
                    if phrase.lower() in transcript_lower:
                        if self._check_conditions(routine):
                            return routine
        return None

    def fire_event(self, event_name: str, event_data: dict | None = None):
        """Fire an event trigger (alarm_fired, timer_fired, etc.)."""
        routine_ids = self._event_listeners.get(event_name, [])
        for rid in routine_ids:
            routine = self.get_routine(rid)
            if routine and routine.get("enabled", True) and self._check_conditions(routine):
                threading.Thread(
                    target=self.trigger_routine, args=(routine["id"],), daemon=True
                ).start()

    def _check_conditions(self, routine: dict) -> bool:
        """Check if a routine's conditions are met (time window, cooldown)."""
        conditions = routine.get("conditions", {})

        # Time window
        window = conditions.get("time_window")
        if window:
            now_str = time.strftime("%H:%M")
            after = window.get("after", "00:00")
            before = window.get("before", "23:59")
            if after <= before:
                if not (after <= now_str <= before):
                    return False
            else:  # wraps midnight
                if before <= now_str <= after:
                    return False

        # Cooldown
        cooldown = conditions.get("cooldown_sec", 0)
        if cooldown > 0:
            last = self._last_triggered.get(routine["id"], 0)
            if time.monotonic() - last < cooldown:
                return False

        return True

    # ── Action Execution ──────────────────────────────────────────────

    def trigger_routine(self, routine_id: str) -> bool:
        """Execute a routine's actions sequentially."""
        routine = self.get_routine(routine_id)
        if not routine:
            return False

        self._last_triggered[routine_id] = time.monotonic()
        name = routine["name"]
        print(f"[routine] Triggering: {name}")

        if self.socketio:
            self.socketio.emit("routine_triggered", {"id": routine_id, "name": name})

        actions = routine.get("actions", [])
        for i, action in enumerate(actions):
            delay = action.get("delay_sec", 0)
            if delay > 0:
                time.sleep(delay)

            action_type = action.get("type", "")

            if self.socketio:
                self.socketio.emit("routine_step", {
                    "id": routine_id, "step": i, "total": len(actions),
                    "action": action_type,
                })

            try:
                if action_type == "speak":
                    text = action.get("text", "")
                    if text and self._voice:
                        # Routine speech bypasses bedtime mode (routines are intentional)
                        self._voice.speak(text, priority="alarm")

                elif action_type == "command":
                    cmd = action.get("action", "")
                    params = action.get("params", {})
                    if cmd and self._agent:
                        agent = self._agent() if callable(self._agent) else self._agent
                        if agent:
                            agent.chat(f"!{cmd} {json.dumps(params)}" if params else f"!{cmd}")

                elif action_type == "alert":
                    alert_svc = None
                    if self._agent:
                        agent = self._agent() if callable(self._agent) else self._agent
                        if agent and hasattr(agent, 'services'):
                            alert_svc = agent.services.get("alerts")
                    if alert_svc:
                        alert_svc.send_alert(
                            source="routine",
                            title=action.get("title", name),
                            body=action.get("body", ""),
                            priority=action.get("priority", "medium"),
                        )

            except Exception as e:
                print(f"[routine] Action {i} failed: {e}")

        if self.socketio:
            self.socketio.emit("routine_done", {"id": routine_id, "name": name})

        print(f"[routine] Completed: {name} ({len(actions)} actions)")
        return True

    # ── Scheduler ─────────────────────────────────────────────────────

    def _scheduler_loop(self):
        """Background thread: check cron triggers every 30s."""
        while self._running:
            for routine in self._routines:
                if not routine.get("enabled", True):
                    continue
                for trigger in routine.get("triggers", []):
                    if trigger.get("type") != "schedule":
                        continue
                    cron = trigger.get("cron", "")
                    if cron and _simple_cron_match(cron):
                        if self._check_conditions(routine):
                            threading.Thread(
                                target=self.trigger_routine,
                                args=(routine["id"],),
                                daemon=True,
                            ).start()
            time.sleep(30)

    # ── Event Index ───────────────────────────────────────────────────

    def _rebuild_event_index(self):
        """Rebuild the event_name → [routine_id] index."""
        self._event_listeners = {}
        for routine in self._routines:
            for trigger in routine.get("triggers", []):
                if trigger.get("type") == "event":
                    event = trigger.get("event", "")
                    if event:
                        self._event_listeners.setdefault(event, []).append(routine["id"])

    # ── Built-in Routines ─────────────────────────────────────────────

    def seed_defaults(self):
        """Create built-in routines if none exist."""
        if self._routines:
            return

        self.create_routine(
            name="Good Morning",
            triggers=[
                {"type": "voice", "phrases": ["good morning bmo", "good morning"]},
            ],
            actions=[
                {"type": "command", "action": "weather", "params": {}, "delay_sec": 0},
                {"type": "command", "action": "calendar_today", "params": {}, "delay_sec": 2},
                {"type": "speak", "text": "Time to start the day!", "delay_sec": 1},
            ],
            conditions={"time_window": {"after": "05:00", "before": "12:00"}, "cooldown_sec": 3600},
        )

        self.create_routine(
            name="Bedtime",
            triggers=[
                {"type": "voice", "phrases": [
                    "bedtime bmo", "good night bmo", "goodnight bmo",
                    "good night", "goodnight", "bedtime", "time for bed",
                    "i need sleep", "i'm going to sleep", "going to bed",
                    "nighty night", "lights out",
                ]},
            ],
            actions=[
                {"type": "command", "action": "smart_home", "params": {"action": "scene", "scene": "bedtime"}, "delay_sec": 0},
                {"type": "speak", "text": "Good night! Sweet dreams!", "delay_sec": 1},
            ],
            conditions={"time_window": {"after": "20:00", "before": "03:00"}, "cooldown_sec": 3600},
        )

        self.create_routine(
            name="Leaving",
            triggers=[
                {"type": "voice", "phrases": ["i'm leaving", "heading out", "bye bmo"]},
            ],
            actions=[
                {"type": "command", "action": "music_stop", "params": {}, "delay_sec": 0},
                {"type": "speak", "text": "Bye bye! See you later!", "delay_sec": 0},
            ],
            conditions={"cooldown_sec": 600},
        )

        print("[routine] Seeded 3 default routines")

    # ── Persistence ───────────────────────────────────────────────────

    def _load(self) -> list:
        try:
            if os.path.exists(ROUTINES_FILE):
                with open(ROUTINES_FILE, encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[routine] Load failed: {e}")
        return []

    def _save(self):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(ROUTINES_FILE, "w", encoding="utf-8") as f:
                json.dump(self._routines, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[routine] Save failed: {e}")
