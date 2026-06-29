"""PHASE-36 36A — persistent per-campaign play-by-post turn-queue store.

Owns ALL PBP truth (participants, turn index, round, scene, timestamps, idempotency)
on disk so the queue survives bot/service restarts and the reminder loop can be
reconstructed from disk alone. Thread-safe (RLock); every mutation persists atomically
(tmp file + os.replace, mirroring services/voice_casting.py). All public methods take/
return plain JSON-serializable dicts (deep copies out, so callers can't mutate state).
"""

import copy
import json
import logging
import os
from services.paths import DATA_DIR as _P_DATA_DIR
import tempfile
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DEFAULT_PATH = str(_P_DATA_DIR / "pbp_sessions.json")  # mirrors campaign_memory.py
MAX_PARTICIPANTS = 12
MAX_HISTORY = 100
MIN_REMINDER_HOURS, MAX_REMINDER_HOURS = 1.0, 168.0
_MAX_SCENE_LEN = 200
_MAX_NAME_LEN = 64


class PbpError(Exception):
    """Carries a machine-readable .code for HTTP/route mapping (e.g. 'already_active')."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PbpStore:
    def __init__(self, path: str = DEFAULT_PATH):
        self.path = path
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self._lock = threading.RLock()
        self._data: dict = {}
        self._load()

    # ── persistence ──────────────────────────────────────────────
    def _load(self) -> None:
        try:
            with open(self.path, encoding="utf-8") as fh:
                loaded = json.load(fh)
            if isinstance(loaded, dict):
                self._data = loaded
            else:
                logger.warning("pbp_store: %s is not an object; starting empty", self.path)
                self._data = {}
        except FileNotFoundError:
            self._data = {}
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("pbp_store: could not read %s (%s); starting empty", self.path, exc)
            self._data = {}

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, indent=2)
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    # ── validation helpers ───────────────────────────────────────
    @staticmethod
    def _clamp_reminder(hours) -> float:
        try:
            h = float(hours)
        except (TypeError, ValueError):
            return 24.0
        return max(MIN_REMINDER_HOURS, min(MAX_REMINDER_HOURS, h))

    @staticmethod
    def _validate_participants(participants) -> list[dict]:
        if not isinstance(participants, list) or not participants:
            raise PbpError("invalid_participants", "at least one participant required")
        if len(participants) > MAX_PARTICIPANTS:
            raise PbpError("invalid_participants", f"max {MAX_PARTICIPANTS} participants")
        out: list[dict] = []
        seen: set[str] = set()
        for p in participants:
            name = (p.get("name") if isinstance(p, dict) else None) or ""
            name = name.strip()
            if not name or len(name) > _MAX_NAME_LEN:
                raise PbpError("invalid_participants", "participant name empty or too long")
            key = name.casefold()
            if key in seen:
                raise PbpError("invalid_participants", f"duplicate participant name: {name}")
            seen.add(key)
            character = (p.get("character") or None) if isinstance(p, dict) else None
            if character is not None:
                character = str(character)[:_MAX_NAME_LEN]
            out.append(
                {
                    "name": name,
                    "character": character,
                    "discord_user_id": None,
                    "discord_display": None,
                }
            )
        return out

    def _append_history(self, session: dict, kind: str, detail: str = "") -> None:
        session.setdefault("history", []).append({"at": _now(), "kind": kind, "detail": detail[:200]})
        if len(session["history"]) > MAX_HISTORY:
            session["history"] = session["history"][-MAX_HISTORY:]

    @staticmethod
    def _carry_claims(old: list[dict], new: list[dict]) -> list[dict]:
        """Preserve discord claims for names/characters that match case-insensitively."""
        by_key: dict[str, dict] = {}
        for op in old:
            for field in ("name", "character"):
                val = op.get(field)
                if val:
                    by_key.setdefault(val.casefold(), op)
        for np in new:
            for field in ("name", "character"):
                val = np.get(field)
                if val and val.casefold() in by_key:
                    src = by_key[val.casefold()]
                    if src.get("discord_user_id"):
                        np["discord_user_id"] = src["discord_user_id"]
                        np["discord_display"] = src.get("discord_display")
                        break
        return new

    # ── mutations ────────────────────────────────────────────────
    def start_session(
        self,
        campaign_id: str,
        scene: str,
        participants,
        channel_id=None,
        reminder_hours: float = 24.0,
        auto_skip: bool = False,
    ) -> dict:
        scene = (scene or "").strip()[:_MAX_SCENE_LEN]
        if not campaign_id or not scene:
            raise PbpError("invalid_request", "campaign_id and scene required")
        validated = self._validate_participants(participants)
        with self._lock:
            existing = self._data.get(campaign_id)
            if existing and existing.get("active"):
                raise PbpError("already_active")
            now = _now()
            session = {
                "active": True,
                "scene": scene,
                "participants": validated,
                "turn_index": 0,
                "round": 1,
                "channel_id": str(channel_id) if channel_id else None,
                "reminder_hours": self._clamp_reminder(reminder_hours),
                "auto_skip": bool(auto_skip),
                "turn_started_at": now,
                "reminded_at": None,
                "last_event_id": None,
                "history": [],
                "created_at": now,
                "updated_at": now,
            }
            self._append_history(session, "start", scene)
            self._data[campaign_id] = session
            self._save()
            return copy.deepcopy(session)

    def set_scene(self, campaign_id: str, scene: str, participants=None) -> dict:
        scene = (scene or "").strip()[:_MAX_SCENE_LEN]
        if not scene:
            raise PbpError("invalid_request", "scene required")
        with self._lock:
            session = self._data.get(campaign_id)
            if not session or not session.get("active"):
                raise PbpError("not_active")
            if participants is not None:
                validated = self._carry_claims(session["participants"], self._validate_participants(participants))
                session["participants"] = validated
            now = _now()
            session["scene"] = scene
            session["turn_index"] = 0
            session["round"] = 1
            session["turn_started_at"] = now
            session["reminded_at"] = None
            session["updated_at"] = now
            self._append_history(session, "scene", scene)
            self._save()
            return copy.deepcopy(session)

    def advance(
        self,
        campaign_id: str,
        event_id: str,
        expected_turn_index=None,
        reason: str = "advance",
        detail: str = "",
    ) -> tuple[dict, str]:
        with self._lock:
            session = self._data.get(campaign_id)
            if not session or not session.get("active"):
                raise PbpError("not_active")
            # Idempotency first: a retried request with the same event_id is a no-op.
            if event_id and session.get("last_event_id") == event_id:
                return copy.deepcopy(session), "duplicate"
            # Staleness second: an advance intent for a turn that already moved on is dropped.
            if expected_turn_index is not None and expected_turn_index != session["turn_index"]:
                return copy.deepcopy(session), "stale_turn"
            now = _now()
            session["turn_index"] += 1
            if session["turn_index"] >= len(session["participants"]):
                session["turn_index"] = 0
                session["round"] += 1
            session["turn_started_at"] = now
            session["reminded_at"] = None
            session["last_event_id"] = event_id
            session["updated_at"] = now
            self._append_history(session, reason, detail)
            self._save()
            return copy.deepcopy(session), "advanced"

    def claim(self, campaign_id: str, participant_name: str, discord_user_id: str, discord_display: str) -> dict:
        target = (participant_name or "").strip().casefold()
        if not target:
            raise PbpError("unknown_participant")
        with self._lock:
            session = self._data.get(campaign_id)
            if not session or not session.get("active"):
                raise PbpError("not_active")
            participants = session["participants"]

            def find(predicate):
                return next((p for p in participants if predicate(p)), None)

            match = (
                find(lambda p: (p.get("name") or "").casefold() == target)
                or find(lambda p: (p.get("character") or "").casefold() == target)
                or find(lambda p: (p.get("name") or "").casefold().startswith(target))
                or find(lambda p: (p.get("character") or "").casefold().startswith(target))
            )
            if match is None:
                raise PbpError("unknown_participant")
            existing_uid = match.get("discord_user_id")
            if existing_uid and existing_uid != str(discord_user_id):
                raise PbpError("already_claimed")
            match["discord_user_id"] = str(discord_user_id)
            match["discord_display"] = discord_display
            session["updated_at"] = _now()
            self._append_history(session, "claim", match["name"])
            self._save()
            return copy.deepcopy(session)

    def stop_session(self, campaign_id: str) -> dict:
        with self._lock:
            session = self._data.get(campaign_id)
            if not session:
                raise PbpError("not_active")
            if session.get("active"):
                session["active"] = False
                session["updated_at"] = _now()
                self._append_history(session, "stop")
                self._save()
            return copy.deepcopy(session)

    def mark_reminded(self, campaign_id: str) -> dict:
        with self._lock:
            session = self._data.get(campaign_id)
            if not session or not session.get("active"):
                raise PbpError("not_active")
            session["reminded_at"] = _now()
            self._save()
            return copy.deepcopy(session)

    # ── reads ────────────────────────────────────────────────────
    def get(self, campaign_id: str):
        with self._lock:
            session = self._data.get(campaign_id)
            return copy.deepcopy(session) if session else None

    def all_active(self) -> dict:
        with self._lock:
            return {cid: copy.deepcopy(s) for cid, s in self._data.items() if s.get("active")}

    @staticmethod
    def current_participant(session: dict):
        parts = session.get("participants") or []
        idx = session.get("turn_index", 0)
        if 0 <= idx < len(parts):
            return parts[idx]
        return None


_singleton: PbpStore | None = None
_singleton_lock = threading.Lock()


def get_pbp_store() -> PbpStore:
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = PbpStore()
    return _singleton


def reset_pbp_store_for_tests() -> None:
    """Test-only — drop the module singleton so the next call rebuilds it."""
    global _singleton
    with _singleton_lock:
        _singleton = None
