"""BMO Settings — Hierarchical settings system modeled after Claude Code's settings.local.json.

Loads settings from:
  1. ~/DnD/bmo/pi/data/settings.json              (user-level, always loaded)
  2. Walk up from cwd → root (max 10 levels):
       .bmo/settings.local.json            (project-level, gitignored)

Deep merge: dicts merge recursively, lists/scalars replace entirely.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable

# ── Defaults ─────────────────────────────────────────────────────────

USER_SETTINGS_PATH = os.path.expanduser("~/DnD/bmo/pi/data/settings.json")
PROJECT_SETTINGS_NAME = "settings.local.json"


def _get_default_settings() -> dict:
    """Return all default settings — matches current hardcoded values."""
    import platform
    is_pi = platform.machine().startswith("aarch64") or platform.machine().startswith("arm")

    if is_pi:
        ollama_opts = {"num_ctx": 8192, "num_predict": 1024, "temperature": 0.8}
        ollama_plan_opts = {"num_ctx": 4096, "num_predict": 256, "temperature": 0.5}
    else:
        ollama_opts = {"num_ctx": 32768, "num_predict": 2048, "temperature": 0.8}
        ollama_plan_opts = {"num_ctx": 8192, "num_predict": 512, "temperature": 0.5}

    return {
        "llm": {
            "primary_model": os.environ.get("BMO_PRIMARY_MODEL", "gemini-3-pro"),
            "router_model": os.environ.get("BMO_ROUTER_MODEL", "gemini-3-flash"),
            "dnd_model": os.environ.get("BMO_DND_MODEL", "claude-opus-4.6"),
            "cloud_timeout": 30,
            "cloud_health_check_interval": 60,
            "local_model": "bmo",
            "ollama_options": ollama_opts,
            "ollama_plan_options": ollama_plan_opts,
        },
        "tools": {
            "allow": [],
            "deny": [],
            "custom_destructive_patterns": [],
            "trusted_directories": [],
            "auto_approve_destructive": False,
            "max_tool_calls_per_turn": 10,
            "max_output_length": 8000,
            "command_timeout": 30,
        },
        "agents": {},
        "router": {
            "custom_prefixes": {},
            "custom_keywords": {},
            "disable_tiers": [],
            "default_agent": "conversation",
        },
        "plan_mode": {
            "max_plan_steps": 20,
            "auto_approve_plans": False,
        },
        "speaker": {
            "default_name": "gavin",
            "voice_enabled": True,
            "tts_speed": 1.0,
        },
        "services": {
            "voice_enabled": True,
            "camera_enabled": True,
            "music_enabled": True,
            "smart_home_enabled": True,
            "calendar_enabled": True,
            "weather_enabled": True,
            "timers_enabled": True,
            "device_name": "BMO",
            "maps_api_key": os.environ.get("GOOGLE_MAPS_API_KEY", ""),
            "ssh_key_path": "~/.ssh/id_ed25519",
        },
        "mcp": {
            "servers": {
                "dnd_data": {
                    "transport": "stdio",
                    "command": "python3",
                    "args": [os.path.expanduser("~/DnD/bmo/pi/mcp_servers/dnd_data_server.py")],
                    "env": {
                        "DND_MARKDOWN_ROOT": os.path.expanduser("~/DnD/bmo/pi/data/5e-references"),
                        "DND_JSON_ROOT": os.path.expanduser("~/DnD/bmo/pi/data/5e"),
                        "RAG_DATA_DIR": os.path.expanduser("~/DnD/bmo/pi/data/rag_data"),
                    },
                },
                "filesystem": {
                    "transport": "stdio",
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem",
                             os.path.expanduser("~/DnD/bmo/pi"),
                             os.path.expanduser("~/DnD/bmo/pi/data")],
                    "lazy": True,
                },
                "web_search": {
                    "transport": "stdio",
                    "command": "npx",
                    "args": ["-y", "@anthropic/mcp-server-brave-search"],
                    "env": {"BRAVE_API_KEY": os.environ.get("BRAVE_API_KEY", "")},
                    "lazy": True,
                },
            },
            "agent_tools": {
                "dnd_dm": ["mcp__dnd_data__*"],
                "code": ["mcp__filesystem__*"],
                "research": ["mcp__web_search__*", "mcp__dnd_data__search_books", "mcp__dnd_data__rag_search"],
                "smart_home": ["mcp__filesystem__read_file", "mcp__filesystem__list_directory"],
            },
            "readonly_tools": [
                "mcp__*__list*", "mcp__*__get*",
                "mcp__*__read*", "mcp__*__search*",
                "mcp__*__rag_search",
                "mcp__web_search__*",
            ],
            "output_max_tokens": 25000,
        },
        "hooks": {
            "preToolUse": [],
            "postToolUse": [],
        },
        "memory": {
            "enabled": True,
            "max_lines_loaded": 200,
        },
        "ui": {
            "max_history": 200,
            "color_enabled": True,
            "auto_compact_threshold": 150,
            "compact_preserve_last": 5,
        },
    }


# ── Deep Merge ───────────────────────────────────────────────────────

def _deep_merge(base: dict, override: dict) -> dict:
    """Deep merge two dicts. Dicts merge recursively, lists/scalars replace entirely."""
    merged = dict(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


# ── Secret Redaction ─────────────────────────────────────────────────

_SECRET_KEYS = frozenset({
    "maps_api_key", "ssh_key_path",
    "GITHUB_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
    "GEMINI_API_KEY", "GROQ_API_KEY", "FISH_AUDIO_API_KEY",
    "GOOGLE_VISION_API_KEY",
    "Authorization", "api_key", "token", "secret",
})


def _redact_secrets(data: dict, _depth: int = 0) -> dict:
    """Return a copy of the settings dict with secret values replaced by '***'."""
    if _depth > 20:
        return data
    result = {}
    for key, value in data.items():
        if key in _SECRET_KEYS and isinstance(value, str) and value:
            result[key] = "***"
        elif isinstance(value, dict):
            result[key] = _redact_secrets(value, _depth + 1)
        else:
            result[key] = value
    return result


# ── BmoSettings ──────────────────────────────────────────────────────

class BmoSettings:
    """Hierarchical settings manager for BMO.

    Discovers settings files, loads them in order, and deep-merges
    into a single effective configuration.
    """

    def __init__(self, working_dir: str | None = None):
        self._working_dir = working_dir or os.getcwd()
        self._defaults = _get_default_settings()
        self._merged: dict = {}
        self._file_mtimes: dict[str, float] = {}
        self._lock = threading.Lock()
        self._watcher_thread: threading.Thread | None = None
        self._watcher_running = False
        self._change_callbacks: list[Callable[[], None]] = []

        self.reload()

    # ── File Discovery ───────────────────────────────────────────────

    def _find_settings_files(self) -> list[str]:
        """Find all settings files in load order (user → project)."""
        found = []

        # 1. User-level settings (always loaded)
        if os.path.isfile(USER_SETTINGS_PATH):
            found.append(USER_SETTINGS_PATH)

        # 2. Walk up from working_dir to find .bmo/settings.local.json
        current = Path(self._working_dir).resolve()
        candidates = []

        for _ in range(10):
            project_path = current / ".bmo" / PROJECT_SETTINGS_NAME
            if project_path.is_file():
                candidates.append(str(project_path))

            parent = current.parent
            if parent == current:
                break
            current = parent

        # Reverse so parent settings come before child settings
        candidates.reverse()
        found.extend(candidates)

        return found

    # ── Load / Reload ────────────────────────────────────────────────

    def reload(self) -> None:
        """Re-read all settings files and rebuild the merged config."""
        with self._lock:
            merged = dict(self._defaults)
            self._file_mtimes.clear()

            for path in self._find_settings_files():
                try:
                    with open(path, encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, dict):
                        merged = _deep_merge(merged, data)
                    self._file_mtimes[path] = os.path.getmtime(path)
                except Exception as e:
                    print(f"[settings] Failed to load {path}: {e}")

            self._merged = merged

    # ── Getters ──────────────────────────────────────────────────────

    def get(self, dotted_key: str, default: Any = None) -> Any:
        """Get a setting by dotted key path. e.g. 'llm.primary_model'."""
        with self._lock:
            current = self._merged
        keys = dotted_key.split(".")
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default
        return current

    def to_dict(self) -> dict:
        """Return the full merged settings dict."""
        with self._lock:
            return dict(self._merged)

    def to_dict_redacted(self) -> dict:
        """Return the full merged settings with secrets redacted."""
        with self._lock:
            return _redact_secrets(self._merged)

    # ── Setters ──────────────────────────────────────────────────────

    def set(self, dotted_key: str, value: Any, level: str = "user") -> None:
        """Set a value and persist to the specified level file.

        Args:
            dotted_key: e.g. 'speaker.default_name'
            value: The value to set
            level: 'user' or 'project'
        """
        if level == "project":
            path = os.path.join(self._working_dir, ".bmo", PROJECT_SETTINGS_NAME)
        else:
            path = USER_SETTINGS_PATH

        # Load existing file content
        existing = {}
        if os.path.isfile(path):
            try:
                with open(path, encoding="utf-8") as f:
                    existing = json.load(f)
            except Exception:
                existing = {}

        # Set the nested key
        keys = dotted_key.split(".")
        current = existing
        for key in keys[:-1]:
            if key not in current or not isinstance(current[key], dict):
                current[key] = {}
            current = current[key]
        current[keys[-1]] = value

        # Write back
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

        self.reload()

    # ── Agent Config Helpers ─────────────────────────────────────────

    def get_effective_agent_config(self, agent_name: str) -> dict:
        """Get the merged config for a specific agent.

        Returns dict with keys: enabled, temperature, max_turns, can_nest,
        system_prompt_append, tools_allow, tools_deny.
        """
        defaults = {
            "enabled": True,
            "temperature": None,
            "max_turns": None,
            "tools_allow": [],
            "tools_deny": [],
            "system_prompt_append": "",
            "can_nest": None,
        }
        agent_overrides = self.get(f"agents.{agent_name}", {})
        if isinstance(agent_overrides, dict):
            return _deep_merge(defaults, agent_overrides)
        return defaults

    def get_effective_tool_list(self, agent_name: str, base_tools: list[str]) -> list[str]:
        """Apply allow/deny chains to produce the final tool list for an agent.

        Priority: agent-level tools_deny > agent-level tools_allow > global deny > global allow.
        Supports glob patterns (e.g., "mcp__github__*") via fnmatch.
        """
        import fnmatch

        def _matches_any(tool: str, patterns: list[str]) -> bool:
            return any(fnmatch.fnmatch(tool, p) for p in patterns)

        tools = set(base_tools)

        # Global allow — if non-empty, restrict to only matching tools
        global_allow = self.get("tools.allow", [])
        if global_allow:
            tools = {t for t in tools if _matches_any(t, global_allow)}

        # Global deny — remove matching tools
        global_deny = self.get("tools.deny", [])
        if global_deny:
            tools = {t for t in tools if not _matches_any(t, global_deny)}

        # Per-agent allow
        agent_cfg = self.get_effective_agent_config(agent_name)
        agent_allow = agent_cfg.get("tools_allow", [])
        if agent_allow:
            tools = {t for t in tools if _matches_any(t, agent_allow)}

        # Per-agent deny
        agent_deny = agent_cfg.get("tools_deny", [])
        if agent_deny:
            tools = {t for t in tools if not _matches_any(t, agent_deny)}

        return list(tools)

    def is_destructive_auto_approved(self, command: str, cwd: str | None = None) -> bool:
        """Check if a destructive command should be auto-approved.

        Returns True if auto_approve_destructive is enabled AND the cwd
        is within a trusted directory.
        """
        if not self.get("tools.auto_approve_destructive", False):
            return False

        trusted = self.get("tools.trusted_directories", [])
        if not trusted:
            return False

        if not cwd:
            return False

        resolved_cwd = os.path.realpath(os.path.expanduser(cwd))
        for td in trusted:
            resolved_td = os.path.realpath(os.path.expanduser(td))
            if resolved_cwd.startswith(resolved_td):
                return True

        return False

    def get_custom_destructive_patterns(self) -> list[str]:
        """Return built-in + custom destructive patterns."""
        return list(self.get("tools.custom_destructive_patterns", []))

    # ── Hot Reload Watcher ───────────────────────────────────────────

    def start_watching(self) -> None:
        """Start a background thread that polls file mtimes every 2s."""
        if self._watcher_running:
            return
        self._watcher_running = True
        self._watcher_thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._watcher_thread.start()

    def stop_watching(self) -> None:
        """Stop the file watcher thread."""
        self._watcher_running = False
        if self._watcher_thread:
            self._watcher_thread.join(timeout=5)
            self._watcher_thread = None

    def on_change(self, callback: Callable[[], None]) -> None:
        """Register a callback to be called when settings change on disk."""
        self._change_callbacks.append(callback)

    def _watch_loop(self) -> None:
        """Poll settings files for changes every 2 seconds."""
        while self._watcher_running:
            time.sleep(2)
            try:
                changed = False
                for path, old_mtime in list(self._file_mtimes.items()):
                    try:
                        current_mtime = os.path.getmtime(path)
                        if current_mtime != old_mtime:
                            changed = True
                            break
                    except FileNotFoundError:
                        changed = True
                        break

                # Also check if new settings files appeared
                if not changed:
                    current_files = set(self._find_settings_files())
                    known_files = set(self._file_mtimes.keys())
                    if current_files != known_files:
                        changed = True

                if changed:
                    print("[settings] Settings changed on disk — reloading")
                    self.reload()
                    for cb in self._change_callbacks:
                        try:
                            cb()
                        except Exception as e:
                            print(f"[settings] Change callback error: {e}")
            except Exception as e:
                print(f"[settings] Watcher error: {e}")


# ── Module-level Singleton ───────────────────────────────────────────

_settings: BmoSettings | None = None


def init_settings(working_dir: str | None = None) -> BmoSettings:
    """Initialize the global settings singleton."""
    global _settings
    _settings = BmoSettings(working_dir)
    return _settings


def get_settings() -> BmoSettings | None:
    """Return the global settings singleton, or None if not initialized."""
    return _settings
