"""Startup configuration preflight for BMO.

Classifies every provider/integration env var (and the Calendar OAuth token
file) as required or optional, so a missing/typo'd key surfaces at boot — with a
single concise summary line and a degraded-mode banner — instead of lazily at
first use (a failed voice turn or a 500).

Cheap + side-effect-free (pure env + file-exists reads), so it is safe to call
in both the live boot path and the canary, and to re-call from /api/health/full.
It only logs when given a logger; the health route calls it without one.

Default stance is NON-fatal: it logs/surfaces the degraded set but does not stop
boot. Set BMO_PREFLIGHT_STRICT=1 to make a missing REQUIRED key raise.

The key registry below is the single source of truth for "what secrets does BMO
consume" — keep it in sync with bmo/.env.template. (See BMO-SUGGESTIONS-LOG
2026-06-23: ".env.example + fail-fast startup config preflight".)
"""

from __future__ import annotations

import os
from pathlib import Path

# (env_var, required?, subsystem, degraded-behavior note when missing)
_KEY_REGISTRY = [
    ("GEMINI_API_KEY",         True,  "primary LLM (Gemini)",      "assistant + router cannot reach the cloud LLM"),
    ("GROQ_API_KEY",           False, "STT (Groq Whisper)",        "speech-to-text unavailable; voice input degraded"),
    ("FISH_AUDIO_API_KEY",     False, "TTS (Fish Audio)",          "TTS falls back to local Piper"),
    ("ANTHROPIC_API_KEY",      False, "D&D DM model (Claude)",     "D&D DM falls back to the primary LLM"),
    ("GOOGLE_VISION_API_KEY",  False, "vision/OCR",                "image vision/OCR unavailable"),
    ("DISCORD_WEBHOOK_URL",    False, "alerts → Discord",          "alerts will not post to Discord"),
    ("DISCORD_DM_BOT_TOKEN",   False, "Discord DM bot",            "bmo-dm-bot cannot connect"),
    ("DISCORD_SOCIAL_BOT_TOKEN", False, "Discord social bot",      "bmo-social-bot cannot connect"),
]

# Non-env config that is still required for a feature: the Calendar OAuth token.
_TOKEN_FILE = Path(__file__).resolve().parents[1] / "config" / "token.json"


def _present(name: str) -> bool:
    return bool((os.environ.get(name) or "").strip())


def run_preflight(logger=None) -> dict:
    """Inspect configuration and return a structured summary.

    Returns a dict:
      {
        "configured":   [subsystem, ...],     # key present
        "degraded":     [{"key","subsystem","note"}, ...],  # optional, missing
        "missing_required": [{"key","subsystem","note"}, ...],
        "required_total": int, "required_ok": int,
        "optional_total": int, "optional_ok": int,
        "calendar_token": bool,
        "banner": str,                        # one-line human summary
        "ok": bool,                           # False if any required missing
      }
    If `logger` is given, logs the banner (warning if degraded/missing).
    """
    configured, degraded, missing_required = [], [], []
    required_total = required_ok = optional_total = optional_ok = 0

    for key, required, subsystem, note in _KEY_REGISTRY:
        present = _present(key)
        if required:
            required_total += 1
            if present:
                required_ok += 1
                configured.append(subsystem)
            else:
                missing_required.append({"key": key, "subsystem": subsystem, "note": note})
        else:
            optional_total += 1
            if present:
                optional_ok += 1
                configured.append(subsystem)
            else:
                degraded.append({"key": key, "subsystem": subsystem, "note": note})

    calendar_token = _TOKEN_FILE.is_file()
    if not calendar_token:
        degraded.append({
            "key": "config/token.json", "subsystem": "Google Calendar",
            "note": "calendar reads unavailable until OAuth token is restored",
        })

    # PHASE-08 08B: surface the token's TTL (cheap file read, no Google client,
    # no refresh — never reads the token value itself). Lets a session/monitor
    # judge expiry from a number without forcing a (live-mutating) refresh.
    calendar_token_expiry = None
    calendar_token_ttl_s = None
    if calendar_token:
        try:
            import json
            from datetime import datetime, timezone
            with open(_TOKEN_FILE, encoding="utf-8") as _tf:
                _td = json.load(_tf)
            _exp = _td.get("expiry") if isinstance(_td, dict) else None
            if _exp:
                _dt = datetime.fromisoformat(str(_exp).replace("Z", "+00:00"))
                if _dt.tzinfo is None:
                    _dt = _dt.replace(tzinfo=timezone.utc)
                calendar_token_expiry = _dt.isoformat()
                calendar_token_ttl_s = int((_dt - datetime.now(timezone.utc)).total_seconds())
        except Exception:
            calendar_token_expiry = None
            calendar_token_ttl_s = None

    providers_ok = required_ok + optional_ok
    providers_total = required_total + optional_total
    parts = [f"{providers_ok}/{providers_total} providers configured"]
    if missing_required:
        parts.append("MISSING REQUIRED: " + ", ".join(
            f"{m['subsystem']} ({m['key']})" for m in missing_required))
    if degraded:
        parts.append("degraded: " + "; ".join(
            f"{d['subsystem']}→{d['note']}" for d in degraded))
    banner = "; ".join(parts)
    ok = not missing_required

    if logger is not None:
        prefix = "[bmo]   Config preflight: "
        if missing_required:
            logger.error(prefix + banner)
        elif degraded:
            logger.warning(prefix + banner)
        else:
            logger.info(prefix + banner)

    if missing_required and os.environ.get("BMO_PREFLIGHT_STRICT", "").lower() in ("1", "true", "yes"):
        raise RuntimeError(
            "BMO_PREFLIGHT_STRICT: required config missing — " + ", ".join(
                f"{m['key']}" for m in missing_required))

    return {
        "configured": configured,
        "degraded": degraded,
        "missing_required": missing_required,
        "required_total": required_total, "required_ok": required_ok,
        "optional_total": optional_total, "optional_ok": optional_ok,
        "calendar_token": calendar_token,
        "calendar_token_expiry": calendar_token_expiry,
        "calendar_token_ttl_s": calendar_token_ttl_s,
        "banner": banner,
        "ok": ok,
    }
