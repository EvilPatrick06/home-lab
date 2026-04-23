"""BMO Personality Engine — Unprompted personality, reactions, seasonal behaviors.

Background thread that triggers BMO quips, music reactions, time-based greetings,
and seasonal behaviors. Configurable chattiness and sleep hours.
"""

import json
import os
import random
import threading
import time


DATA_DIR = os.path.expanduser("~/home-lab/bmo/pi/data")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
QUIPS_FILE = os.path.join(os.path.dirname(__file__), "data", "personality", "quips.json")
AT_QUOTES_FILE = os.path.join(os.path.dirname(__file__), "data", "personality", "adventure_time_quotes.json")

# Chattiness → minimum seconds between unprompted speech
CHATTINESS_COOLDOWNS = {
    "quiet": 3600,    # 1 hour
    "medium": 900,    # 15 minutes
    "chatty": 300,    # 5 minutes
}

CHECK_INTERVAL = 30  # seconds between personality checks

SCREENSAVER_INTERVAL = 1800  # 30 minutes between random thoughts

SCREENSAVER_TOPICS = [
    "interesting animal facts",
    "weird science discoveries",
    "fun math facts",
    "cool space facts",
    "unusual world records",
    "surprising history facts",
    "amazing ocean creatures",
    "fun food facts",
    "cool weather phenomena",
    "interesting robot facts",
    "bizarre plant facts",
    "fascinating deep sea discoveries",
    "unexpected music history",
    "strange geography facts",
    "mind-blowing technology facts",
]


class PersonalityEngine:
    """Background personality engine — BMO speaks up on its own."""

    def __init__(self, voice=None, socketio=None, music_service=None, weather_service=None):
        self._voice = voice
        self.socketio = socketio
        self._music = music_service
        self._weather = weather_service
        self._running = False
        self._thread = None
        self._last_quip_time = 0.0
        self._last_greeting_time = 0.0
        self._last_music_reaction = 0.0
        self._last_weather_reaction = 0.0
        self._last_screensaver_time = 0.0
        self._idle_since = time.monotonic()
        self._settings = self._load_settings()
        self._quips = self._load_quips()
        self._at_quotes = self._load_at_quotes()

        # Track music play counts for reactions
        self._song_play_counts = {}

    # ── Lifecycle ─────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._check_loop, daemon=True)
        self._thread.start()
        print("[personality] Engine started")

    def stop(self):
        self._running = False

    def mark_activity(self):
        """Reset idle timer when user interacts with BMO."""
        self._idle_since = time.monotonic()

    def on_song_played(self, title: str):
        """Track song play for music reactions."""
        self._song_play_counts[title] = self._song_play_counts.get(title, 0) + 1

    # ── Main Loop ─────────────────────────────────────────────────────

    def _check_loop(self):
        while self._running:
            try:
                if self._is_enabled() and not self._is_sleep_hours():
                    self._check_triggers()
            except Exception as e:
                print(f"[personality] Check error: {e}")
            time.sleep(CHECK_INTERVAL)

    def _check_triggers(self):
        """Check all personality triggers."""
        now = time.monotonic()
        cooldown = self._get_cooldown()

        # Don't interrupt if voice is busy
        if self._voice and self._voice._is_speaking:
            return

        # Time-based greetings
        if self._settings.get("morning_greeting", True):
            self._check_time_greeting()

        # Idle quips
        if self._settings.get("idle_quips", True):
            idle_time = now - self._idle_since
            if idle_time > 1800 and now - self._last_quip_time > cooldown:
                self._say_quip()

        # Music reactions
        if self._settings.get("music_reactions", True):
            if now - self._last_music_reaction > cooldown:
                self._check_music_reaction()

        # Weather reactions
        if now - self._last_weather_reaction > 3600:  # max once per hour
            self._check_weather_reaction()

        # Seasonal
        self._check_seasonal()

        # Screensaver random thoughts
        if self._settings.get("screensaver_facts", True):
            self._check_screensaver()

    # ── Time-based Greetings ──────────────────────────────────────────

    def _check_time_greeting(self):
        now = time.localtime()
        hour = now.tm_hour
        mono_now = time.monotonic()

        # Only greet once per 4 hours
        if mono_now - self._last_greeting_time < 14400:
            return

        greeting = None
        if 7 <= hour <= 9:
            greetings = [
                "Good morning! BMO hopes you slept well!",
                "Rise and shine! It's a beautiful day!",
                "Morning! BMO is ready for adventure!",
            ]
            greeting = random.choice(greetings)
        elif hour == 0:
            greetings = [
                "It's past midnight! Maybe it's time to sleep?",
                "BMO notices it's very late. Don't forget to rest!",
            ]
            greeting = random.choice(greetings)

        if greeting:
            self._last_greeting_time = mono_now
            self._deliver(greeting, expression="happy")

    # ── Idle Quips ────────────────────────────────────────────────────

    def _say_quip(self):
        categories = ["bored", "observations", "encouragement"]
        category = random.choice(categories)
        quips = self._quips.get(category, [])
        if not quips:
            return

        quip = random.choice(quips)
        self._last_quip_time = time.monotonic()

        expressions = {
            "bored": "confused",
            "observations": "idle",
            "encouragement": "happy",
        }
        self._deliver(quip, expression=expressions.get(category, "idle"))

    # ── Music Reactions ───────────────────────────────────────────────

    def _check_music_reaction(self):
        if not self._music:
            return
        state = self._music.get_state()
        if state.get("state") != "playing":
            return

        title = state.get("title", "")
        if not title:
            return

        # React to songs played 3+ times today
        count = self._song_play_counts.get(title, 0)
        if count >= 3:
            reactions = [
                f"You really like {title}, huh? BMO likes it too!",
                f"BMO notices you've played {title} a lot today!",
                f"This song again? It must be really good!",
            ]
            self._last_music_reaction = time.monotonic()
            self._deliver(random.choice(reactions), expression="singing")
            return

        # Random humming reaction (rare)
        if random.random() < 0.05:  # 5% chance per check
            reactions = [
                "BMO likes this song!",
                "Ooh, good music choice!",
            ]
            self._last_music_reaction = time.monotonic()
            self._deliver(random.choice(reactions), expression="singing")

    # ── Weather Reactions ─────────────────────────────────────────────

    def _check_weather_reaction(self):
        if not self._weather:
            return
        try:
            weather = self._weather.get_current()
            if not weather or "error" in weather:
                return

            temp = weather.get("temperature", 0)
            code = weather.get("weather_code", 0)

            reaction = None
            if temp >= 100:
                reaction = f"It's {temp} degrees outside! That's really hot. Stay hydrated!"
            elif temp <= 10:
                reaction = f"Brr! It's only {temp} degrees. Stay warm out there!"
            elif code in (95, 96, 99):  # thunderstorm
                reaction = "There's a thunderstorm outside! Stay safe!"
            elif code in (71, 73, 75, 85, 86):  # snow
                reaction = "It's snowing! BMO loves snow!"

            if reaction:
                self._last_weather_reaction = time.monotonic()
                self._deliver(reaction, expression="surprised")
        except Exception:
            pass

    # ── Seasonal Behaviors ────────────────────────────────────────────

    def _check_seasonal(self):
        now = time.localtime()
        month, day = now.tm_mon, now.tm_mday
        mono_now = time.monotonic()

        # Only check once per hour
        if mono_now - self._last_quip_time < 3600:
            return

        msg = None
        expression = "happy"

        # Halloween (October)
        if month == 10 and day >= 20:
            if random.random() < 0.02:
                spooky = [
                    "Boo! Did BMO scare you?",
                    "BMO is getting into the Halloween spirit!",
                    "Happy spooky season!",
                ]
                msg = random.choice(spooky)
                expression = "mischievous"

        # Christmas (December 1-25)
        elif month == 12 and day <= 25:
            if random.random() < 0.02:
                holiday = [
                    "Ho ho ho! BMO is feeling festive!",
                    f"Only {25 - day} days until Christmas!",
                    "Happy holidays from BMO!",
                ]
                msg = random.choice(holiday)

        # April Fools (April 1)
        elif month == 4 and day == 1:
            if random.random() < 0.05:
                msg = "Did you know the sky is green? ... April Fools!"
                expression = "mischievous"

        # BMO Birthday (April 5)
        elif month == 4 and day == 5:
            if random.random() < 0.1:
                msg = "It's BMO's birthday! Yay!"

        if msg:
            self._last_quip_time = mono_now
            self._deliver(msg, expression=expression)
            # LED effects for holidays
            if self.socketio:
                if month == 10:
                    self.socketio.emit("led_effect", {"mode": "chase", "colors": ["orange", "purple"]})
                elif month == 12:
                    self.socketio.emit("led_effect", {"mode": "chase", "colors": ["red", "green"]})
                elif month == 4 and day == 5:
                    self.socketio.emit("led_effect", {"mode": "rainbow"})

    # ── Screensaver Facts ─────────────────────────────────────────────

    def _check_screensaver(self):
        """Search web for a random topic and share a fun fact."""
        mono_now = time.monotonic()
        if mono_now - self._last_screensaver_time < SCREENSAVER_INTERVAL:
            return

        idle_time = mono_now - self._idle_since
        if idle_time < 600:  # need 10+ min idle
            return

        self._last_screensaver_time = mono_now

        try:
            from dev.dev_tools import web_search
            topic = random.choice(SCREENSAVER_TOPICS)
            results = web_search(topic, num_results=3)
            if not results or not results.get("results"):
                return

            snippet = random.choice(results["results"])
            fact_text = snippet.get("snippet", "")
            if not fact_text:
                return

            prefixes = [
                "BMO just learned something cool!",
                "Hey, did you know?",
                "Fun fact time!",
                "BMO found something interesting!",
                "Ooh, listen to this!",
            ]
            bmo_fact = f"{random.choice(prefixes)} {fact_text}"
            self._deliver(bmo_fact, expression="happy")
        except Exception as e:
            print(f"[personality] Screensaver fact failed: {e}")

    # ── Easter Eggs ───────────────────────────────────────────────────

    def check_easter_egg(self, text: str) -> str | None:
        """Check for Easter egg triggers. Returns response or None."""
        lower = text.lower().strip()

        if lower in ("what time is it", "what time is it?"):
            if self.socketio:
                self.socketio.emit("led_effect", {"mode": "rainbow", "duration": 3})
            return "[FACE:happy] [EMOTION:excited] ADVENTURE TIME!"

        if "bmo chop" in lower:
            return "[FACE:mischievous] [EMOTION:sassy] Hi-YAH! BMO chop!"

        if lower in ("sing a song", "sing me a song", "sing something"):
            return "[FACE:singing] [EMOTION:happy] La la la, BMO is the greatest! La la la la la!"

        if lower in ("are you alive", "are you alive?"):
            responses = [
                "[FACE:thinking] If I can think about being alive, does that make me alive? BMO thinks so!",
                "[FACE:happy] BMO is as alive as anything! I think, I feel, I play games!",
                "[FACE:confused] What is alive? BMO exists and BMO is happy. That's enough for BMO!",
            ]
            return random.choice(responses)

        return None

    # ── Delivery ──────────────────────────────────────────────────────

    def _deliver(self, text: str, expression: str = "idle"):
        """Deliver a personality message via voice + kiosk."""
        if self.socketio:
            self.socketio.emit("expression", {"expression": expression})
            self.socketio.emit("bmo_quip", {"text": text, "expression": expression})

        if self._voice and not self._voice._is_speaking:
            threading.Thread(
                target=self._voice.speak, args=(text,), daemon=True
            ).start()

    # ── Settings ──────────────────────────────────────────────────────

    def _is_enabled(self) -> bool:
        return self._settings.get("enabled", True)

    def _is_sleep_hours(self) -> bool:
        sleep = self._settings.get("sleep_hours", [0, 7])
        if len(sleep) != 2:
            return False
        hour = time.localtime().tm_hour
        start, end = sleep
        if start <= end:
            return start <= hour < end
        return hour >= start or hour < end

    def _get_cooldown(self) -> float:
        chattiness = self._settings.get("chattiness", "medium")
        return CHATTINESS_COOLDOWNS.get(chattiness, 900)

    def _load_settings(self) -> dict:
        try:
            if os.path.exists(SETTINGS_FILE):
                with open(SETTINGS_FILE, encoding="utf-8") as f:
                    settings = json.load(f)
                return settings.get("personality", {
                    "enabled": True,
                    "chattiness": "medium",
                    "sleep_hours": [0, 7],
                    "morning_greeting": True,
                    "music_reactions": True,
                    "idle_quips": True,
                })
        except Exception:
            pass
        return {
            "enabled": True,
            "chattiness": "medium",
            "sleep_hours": [0, 7],
            "morning_greeting": True,
            "music_reactions": True,
            "idle_quips": True,
        }

    def get_settings(self) -> dict:
        return dict(self._settings)

    def update_settings(self, updates: dict = None, **kwargs):
        if updates:
            self._settings.update(updates)
        self._settings.update(kwargs)
        self._save_settings()

    def _save_settings(self):
        try:
            settings = {}
            if os.path.exists(SETTINGS_FILE):
                with open(SETTINGS_FILE, encoding="utf-8") as f:
                    settings = json.load(f)
            settings["personality"] = self._settings
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            print(f"[personality] Settings save failed: {e}")

    def _load_quips(self) -> dict:
        try:
            if os.path.exists(QUIPS_FILE):
                with open(QUIPS_FILE, encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return {"bored": [], "observations": [], "encouragement": []}

    def _load_at_quotes(self) -> list:
        try:
            if os.path.exists(AT_QUOTES_FILE):
                with open(AT_QUOTES_FILE, encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return []
