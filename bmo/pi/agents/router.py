"""3-tier agent router: explicit prefix → keyword matching → LLM classification."""

from __future__ import annotations

import re
from typing import Any


# ── Tier 1: Explicit prefix overrides ───────────────────────────────

EXPLICIT_PREFIXES = {
    "!code": "code",
    "!dm": "dnd_dm",
    "!music": "music",
    "!home": "smart_home",
    "!led": "smart_home",
    "!lights": "smart_home",
    "!timer": "timer",
    "!alarm": "timer",
    "!calendar": "calendar",
    "!cal": "calendar",
    "!weather": "weather",
    "!security": "security",
    "!test": "test",
    "!plan": "plan",
    "!research": "research",
    "!cleanup": "cleanup",
    "!monitor": "monitoring",
    "!deploy": "deploy",
    "!docs": "docs",
    "!review": "review",
    "!design": "design",
    "!learn": "learning",
    "!remember": "learning",
    "!list": "list",
    "!routine": "routine",
    "!alert": "alert",
    "!encounter": "encounter",
    "!npc": "npc_dialogue",
    "!lore": "lore",
    "!rules": "rules",
    "!treasure": "treasure",
    "!loot": "treasure",
    "!recap": "session_recap",
}


# ── Tier 2: Keyword patterns per agent ──────────────────────────────

KEYWORD_PATTERNS: dict[str, list[str]] = {
    "code": [
        "read file", "read the file", "git status", "git log", "git diff",
        "run command", "grep", "help me debug", "fix the bug", "refactor",
        "write a test", "create a pr", "pull request", "deploy code",
        "ssh to", "check gpu", "what does this code do", "open file",
        "edit file", "find files", "list directory", "package.json",
        "npm", "pip install", "python script",
    ],
    "dnd_dm": [
        "roll initiative", "start a campaign", "be the dm", "dungeon master",
        "d20", "saving throw", "dnd campaign", "d&d campaign", "one shot",
        "one-shot", "run a campaign", "dm for", "roll a d",
        "attack roll", "skill check", "ability check",
    ],
    "music": [
        "play music", "play a song", "play some", "next song", "skip song",
        "pause music", "resume music", "play my playlist", "cast to speaker",
        "what's playing", "now playing", "music volume", "stop music",
        "set volume", "set the volume", "volume to", "turn down", "turn up",
        "lower the volume", "raise the volume",
    ],
    "smart_home": [
        "turn on the", "turn off the", "cast to tv", "open netflix",
        "open youtube", "skip intro", "tv volume", "pause tv", "resume tv",
        "chromecast", "smart light", "led color", "set the lights",
        "change lights", "led mode", "rainbow mode", "breathing mode",
        "led brightness", "light color", "turn on lights", "turn off lights",
    ],
    "timer": [
        "set a timer", "set an alarm", "cancel timer", "cancel alarm",
        "snooze", "how much time", "timer for", "alarm for",
        "wake me up", "remind me in",
    ],
    "calendar": [
        "calendar", "schedule", "what's today", "what's on my",
        "add event", "create event", "delete event", "this week",
        "my events", "upcoming events", "what's tomorrow",
    ],
    "weather": [
        "weather", "temperature outside", "will it rain", "forecast",
        "how cold", "how hot", "is it going to snow", "weather today",
    ],
    "security": [
        "security audit", "check vulnerabilities", "review permissions",
        "security scan", "is it secure", "audit the code",
    ],
    "test": [
        "run tests", "run the tests", "write tests", "test coverage",
        "vitest", "pytest", "test results", "failing test",
    ],
    "plan": [
        "plan how to", "design a system", "architect", "how should we",
        "plan mode", "bmo plan", "make a plan", "think this through",
    ],
    "research": [
        "search for", "look up", "find information", "web search",
        "research this", "find out about", "what is the latest",
    ],
    "cleanup": [
        "organize the", "clean up", "restructure", "refactor directory",
        "remove dead code", "consolidate", "tidy up",
    ],
    "monitoring": [
        "check health", "server status", "cloud status", "disk space",
        "cpu usage", "memory usage", "system health", "uptime",
    ],
    "deploy": [
        "deploy to", "push to production", "restart service",
        "deploy the", "release to", "ship it",
    ],
    "docs": [
        "write documentation", "generate docs", "update readme",
        "document this", "add docstrings", "api docs",
    ],
    "review": [
        "review this code", "code review", "review pr", "review the",
        "give feedback on", "check this code",
    ],
    "design": [
        "design the ui", "mockup", "layout", "how should this look",
        "wireframe", "ui design", "visual design",
    ],
    "learning": [
        "remember that", "save this", "what did i tell you about",
        "don't forget", "keep in mind", "recall what",
        "what do you know about me",
    ],
    "list": [
        "add to list", "shopping list", "todo list", "to-do list",
        "what's on my list", "remove from list", "check off",
        "my lists", "grocery list", "create list", "delete list",
        "show list", "clear list",
    ],
    "routine": [
        "routine", "automation", "good morning routine",
        "bedtime routine", "create routine", "my routines",
        "trigger routine", "run routine", "disable routine",
    ],
    "alert": [
        "alert", "recent alerts", "alert settings", "quiet hours",
        "notification settings", "alert history",
    ],
    "encounter": [
        "generate encounter", "random encounter", "build an encounter",
        "encounter for level", "cr encounter", "combat encounter",
        "what monsters", "enemy encounter",
    ],
    "npc_dialogue": [
        "npc says", "npc dialogue", "talk to the", "what does the npc say",
        "in character as", "roleplay as", "speak as the",
        "tavern keeper says", "merchant says", "guard says",
    ],
    "lore": [
        "lore about", "tell me about the", "forgotten realms",
        "what is a", "history of", "deity", "pantheon", "plane of",
        "who is", "where is", "what are the", "setting lore",
    ],
    "rules": [
        "rules question", "how does", "can i", "does this work",
        "rules for", "phb says", "dmg says", "ruling on",
        "grapple rules", "concentration rules", "opportunity attack",
        "multiclass rules", "feat requirement",
    ],
    "treasure": [
        "generate loot", "treasure hoard", "random loot",
        "roll for treasure", "what loot", "treasure table",
        "generate treasure", "magic item roll",
    ],
    "session_recap": [
        "session recap", "previously on", "what happened last session",
        "recap the session", "summarize the adventure", "where did we leave off",
    ],
    "conversation": [
        "learn my voice", "remember my voice", "enroll my voice",
        "voice enrollment", "recognize my voice", "who am i",
        "tell me a joke", "joke", "how are you", "what's up",
        "good morning", "good night", "hello", "hi bmo", "hey bmo",
        "what time is it", "sing a song", "bmo chop", "are you alive",
        "thank you", "thanks", "goodbye", "bye",
        "what's your name", "who are you", "what can you do",
        "how's it going", "what do you think", "tell me something",
        "tell me a story", "what's your favorite", "do you like",
    ],
}


# ── Tier 3: LLM classification prompt ──────────────────────────────

CLASSIFICATION_PROMPT = """You are a message classifier for BMO, a smart assistant. Given a user message, classify it into exactly ONE agent category.

Available agents:
- code: Programming, debugging, file operations, git, SSH, deployment commands
- dnd_dm: D&D dungeon mastering, tabletop RPG sessions, dice rolling, combat
- music: Playing music, controlling playback, casting to speakers
- smart_home: TV control, smart lights, Chromecast, home devices
- timer: Setting timers, alarms, reminders
- calendar: Scheduling, events, calendar queries
- weather: Weather forecasts, temperature, conditions
- security: Security audits, vulnerability checks, permissions review
- test: Running tests, writing tests, test coverage analysis
- plan: Complex multi-step task planning, system design, architecture
- research: Web searches, information lookup, fact-finding
- cleanup: Code/directory organization, dead code removal, restructuring
- monitoring: System health checks, GPU/CPU/disk usage, server status
- deploy: Deploying code, restarting services, releasing to production
- docs: Writing documentation, generating API docs, updating READMEs
- review: Code review, PR feedback, quality analysis
- design: UI/UX design, mockups, layout planning
- learning: Saving user preferences, recalling past context, long-term memory
- list: Managing named lists (shopping, todo, grocery), adding/removing/checking items
- routine: Creating, managing, triggering automation routines (morning, bedtime, leaving)
- alert: Querying alert history, configuring alert settings, quiet hours
- encounter: Generating balanced D&D combat encounters for a given party level and environment
- npc_dialogue: Generating in-character NPC dialogue and roleplay responses
- lore: D&D lore questions about settings, deities, planes, history, factions
- rules: D&D 5e rules questions, mechanics, rulings, citations from PHB/DMG
- treasure: Generating level-appropriate treasure, loot, magic items from DMG tables
- session_recap: Summarizing recent D&D session events into a narrative recap
- conversation: General chat, jokes, opinions, questions about BMO itself, voice enrollment ("learn my voice", "remember my voice", "my name is X" when about voice recognition)

Respond with ONLY the agent name, nothing else.

User message: {message}"""


class AgentRouter:
    """Routes user messages to the best specialized agent using 3-tier matching."""

    def __init__(self, llm_func=None, settings=None):
        """Initialize router.

        Args:
            llm_func: Function to call for LLM classification (tier 3).
                      Signature: llm_func(messages, options) -> str
                      If None, falls back to "conversation" for tier 3.
            settings: BmoSettings instance for custom prefixes/keywords/overrides.
        """
        self._llm_func = llm_func
        self._settings = settings

        # Build effective prefix/keyword maps (base + settings overrides)
        self._prefixes = dict(EXPLICIT_PREFIXES)
        self._keywords = {k: list(v) for k, v in KEYWORD_PATTERNS.items()}

        if settings:
            custom_prefixes = settings.get("router.custom_prefixes", {})
            if isinstance(custom_prefixes, dict):
                self._prefixes.update(custom_prefixes)

            custom_keywords = settings.get("router.custom_keywords", {})
            if isinstance(custom_keywords, dict):
                for agent_name, kw_list in custom_keywords.items():
                    if isinstance(kw_list, list):
                        if agent_name in self._keywords:
                            self._keywords[agent_name].extend(kw_list)
                        else:
                            self._keywords[agent_name] = list(kw_list)

    def route(self, message: str, context: dict | None = None) -> str:
        """Route a message to the best agent.

        Returns the agent name string (e.g. "code", "dnd_dm", "conversation").

        Routing tiers:
            1. Explicit prefix ("!code ...", "!dm ...", etc.)
            2. Keyword matching (fast, no LLM call)
            3. LLM classification (fallback)
        """
        disabled_tiers = []
        default_agent = "conversation"
        if self._settings:
            disabled_tiers = self._settings.get("router.disable_tiers", [])
            default_agent = self._settings.get("router.default_agent", "conversation")

        # Tier 1: Explicit prefix override
        if "prefix" not in disabled_tiers:
            agent = self._check_explicit_prefix(message)
            if agent:
                return agent

        # Tier 2: Keyword matching
        if "keyword" not in disabled_tiers:
            agent = self._check_keywords(message)
            if agent:
                return agent

        # Tier 3: LLM classification — DISABLED for voice pipeline speed
        # LLM classification adds 10-20s latency for marginal routing benefit.
        # Keywords already cover all specialized agents; unmatched messages
        # are overwhelmingly conversational.
        # To re-enable: remove "llm" from router.disable_tiers in settings.
        # if "llm" not in disabled_tiers:
        #     agent = self._llm_classify(message)
        #     if agent:
        #         return agent

        return default_agent

    def _check_explicit_prefix(self, message: str) -> str | None:
        """Tier 1: Check for explicit !prefix override."""
        stripped = message.strip()
        for prefix, agent_name in self._prefixes.items():
            if stripped.lower().startswith(prefix):
                return agent_name
        return None

    def _check_keywords(self, message: str) -> str | None:
        """Tier 2: Fast keyword matching.

        Returns the agent name with the most keyword matches, or None if
        no keywords match.
        """
        lower = message.lower()
        scores: dict[str, int] = {}

        for agent_name, keywords in self._keywords.items():
            count = sum(1 for kw in keywords if kw in lower)
            if count > 0:
                scores[agent_name] = count

        if not scores:
            return None

        # Return the agent with the highest score
        best = max(scores, key=scores.get)
        return best

    def _llm_classify(self, message: str) -> str | None:
        """Tier 3: Use a cheap LLM call to classify the message.

        Uses the ROUTER_MODEL (Gemini Flash) for fast, cheap classification.
        """
        if not self._llm_func:
            return None

        try:
            from agent import OLLAMA_PLAN_OPTIONS, ROUTER_MODEL

            prompt = CLASSIFICATION_PROMPT.format(message=message[:500])
            messages = [{"role": "user", "content": prompt}]
            result = self._llm_func(messages, OLLAMA_PLAN_OPTIONS,
                                    model=ROUTER_MODEL)

            # Parse response — should be just the agent name
            agent_name = result.strip().lower().replace(" ", "_")

            # Validate it's a known agent
            valid_agents = set(self._keywords.keys()) | {"conversation"}
            if agent_name in valid_agents:
                return agent_name

            # Fuzzy match
            for valid in valid_agents:
                if valid in agent_name:
                    return valid

        except Exception as e:
            print(f"[router] LLM classification failed: {e}")

        return None

    @staticmethod
    def strip_prefix(message: str) -> str:
        """Remove the explicit prefix from a message, returning the actual content."""
        stripped = message.strip()
        for prefix in EXPLICIT_PREFIXES:
            if stripped.lower().startswith(prefix):
                return stripped[len(prefix):].strip()
        return message
