"""Drift guard: every BMO_* env var the code reads is either documented in
bmo/.env.template or explicitly allowlisted here (BMO-SUGGESTIONS 2026-07-02
".env.template has drifted from the code").

The template presents itself as the config reference, so an operator tuning a
knob should find it there. This test scans bmo/pi/ for direct env reads
(os.environ.get / os.getenv / os.environ[...]) of BMO_* vars and fails if any
is neither in the template nor in the allowlist below — so code and template
cannot silently drift apart again.

When you add a new BMO_* env read:
  - if it is an operator-facing knob -> add it (with a comment) to .env.template
  - if it is an internal/derived/test-only var -> add it to
    _INTENTIONALLY_UNDOCUMENTED with a one-line reason.
"""

import re
from pathlib import Path

_PI_ROOT = Path(__file__).resolve().parents[1]           # bmo/pi
_TEMPLATE = _PI_ROOT.parent / ".env.template"            # bmo/.env.template

# Matches os.environ.get("BMO_X"), os.getenv("BMO_X"), os.environ["BMO_X"].
_ENV_READ = re.compile(
    r"""os\.(?:environ\.get|getenv)\(\s*["'](BMO_[A-Z0-9_]+)["']"""
    r"""|os\.environ\[\s*["'](BMO_[A-Z0-9_]+)["']\s*\]"""
)

# BMO_* vars that are intentionally NOT in the operator-facing template:
# internal/derived toggles, test hooks, or self-documenting defaults. Keep the
# reason with each so the list stays honest.
_INTENTIONALLY_UNDOCUMENTED = {
    # Test / dev harness hooks
    "BMO_SIMULATE": "off-Pi simulation flag; dev/test only",
    "BMO_SOCKETIO_ASYNC_MODE": "test/runtime engineio async-mode override",
    "BMO_LAB_DEBUG": "internal UI-lab dev server debug toggle",
    "BMO_LAB_HOST": "internal UI-lab dev server host",
    "BMO_ONNX_LOG_SEVERITY": "internal onnxruntime log-severity override (default ERROR)",
    "BMO_THERMAL_ZONE": "thermal-zone path override; internal, safe default",
    "BMO_VOICE_CAST_PATH": "voice-casting config path; derived, safe default",
    # Deploy/canary internals (set by the boot/canary path, not by operators)
    "BMO_CANARY": "set by the canary boot path, not an operator knob",
    "BMO_CANARY_TTS": "canary-internal probe toggle",
    "BMO_CANARY_STALE_H": "canary-internal staleness window",
    "BMO_CANARY_STT_BUDGET_S": "canary-internal STT budget",
    "BMO_HOME": "deploy-time root; set via systemd Environment=, not .env",
    # Derived / advanced tuning knobs with safe defaults (documented in code)
    "BMO_ACCOUNTS_DB": "derived accounts DB path; default under data/",
    "BMO_ACCOUNT_WEB_RETURN": "OAuth web-return URL; derived from deploy",
    "BMO_DEFAULT_SPEAKER": "internal default speaker id; has a code default",
    "BMO_DEVICE_LOCATION_TTL_SECONDS": "location-cache TTL; safe default",
    "BMO_LOCATION_CACHE_TTL_SECONDS": "location-cache TTL; safe default",
    "BMO_LOCATION_REFRESH_SECONDS": "location refresh cadence; safe default",
    "BMO_RCLONE_TIMEOUT": "rclone op timeout; safe default",
    "BMO_SOURCE_GATE": "internal source-gate mode; safe default",
    "BMO_EXTRA_SOURCE_CIDRS": "advanced allowlist CIDRs; safe default (empty)",
    "BMO_SYNC_DIR": "derived sync dir; default under data/",
    "BMO_SYNC_MAX_ENTITY": "sync size cap; safe default",
    "BMO_SYNC_MIRROR_DEBOUNCE": "sync debounce; safe default",
    "BMO_SYNC_MIRROR_TIMEOUT": "sync timeout; safe default",
    "BMO_VTT_BACKUP_REMOTE": "optional VTT backup rclone remote; safe default",
    "BMO_MLS_API_KEY": "optional real-estate MLS key; feature-gated, safe default",
    "BMO_REGISTRY_API_KEY": "optional game-registry key; feature-gated",
    "BMO_MAX_BACKUP_SIZE": "backup size cap; safe default",
    "BMO_THERMAL_GATE_DISABLE": "thermal-gate escape hatch; safe default off",
    "BMO_DEFAULT_RATE_LIMIT": "per-route rate-limit default; documented family",
    "BMO_OWNER_NAME": "personalization; safe default",
    "BMO_OWNER_RELATIONSHIP": "personalization; safe default",
    # Public-DM tuning family — many derived caps with safe defaults; the whole
    # family is advanced/rarely-tuned, so kept out of the operator template.
    "BMO_PUBLIC_DM_DAILY_LIMIT": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_BODY_BYTES": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_CONCURRENCY": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_CREATURES_LEN": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_GAMESTATE_LEN": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_HISTORY": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_MESSAGE_LEN": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_NAME_LEN": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_TOKENS": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_MAX_TURN_LEN": "public-DM tuning; safe default",
    "BMO_PUBLIC_DM_RATE_LIMIT": "public-DM tuning; safe default",
    "BMO_PUBLIC_TOOL_MAX_BODY_BYTES": "public-tool tuning; safe default",
    "BMO_PUBLIC_TOOL_MAX_CONTEXT_LEN": "public-tool tuning; safe default",
    "BMO_RELAY_MAX_ROOMS": "game-relay capacity cap; safe default",
    "BMO_RELAY_MAX_PEERS_PER_ROOM": "game-relay capacity cap; safe default",
}


def _code_env_vars() -> set[str]:
    found = set()
    for py in _PI_ROOT.rglob("*.py"):
        if "/tests/" in py.as_posix() or "__pycache__" in py.as_posix():
            continue
        text = py.read_text(encoding="utf-8", errors="ignore")
        for m in _ENV_READ.finditer(text):
            found.add(m.group(1) or m.group(2))
    return found


def _template_vars() -> set[str]:
    text = _TEMPLATE.read_text(encoding="utf-8")
    # Include commented-out examples (# BMO_FOO=...) too — they still document.
    return set(re.findall(r"BMO_[A-Z0-9_]+", text))


def test_template_exists():
    assert _TEMPLATE.is_file(), f"missing {_TEMPLATE}"


def test_no_env_drift_between_code_and_template():
    code = _code_env_vars()
    documented = _template_vars() | set(_INTENTIONALLY_UNDOCUMENTED)
    missing = sorted(code - documented)
    assert not missing, (
        "BMO_* env vars read in code but neither in .env.template nor allowlisted:\n  "
        + "\n  ".join(missing)
        + "\n\nAdd operator knobs to bmo/.env.template, or add internal/derived "
        "vars to _INTENTIONALLY_UNDOCUMENTED (with a reason)."
    )


def test_allowlist_has_no_stale_entries():
    """An allowlisted var that the code no longer reads should be removed, so the
    allowlist can't rot into a permanent escape hatch."""
    code = _code_env_vars()
    stale = sorted(set(_INTENTIONALLY_UNDOCUMENTED) - code)
    assert not stale, f"allowlist entries no longer read in code (remove them): {stale}"


def test_no_dead_cf_pi_keys_in_template():
    """The retired shell-tooling keys (zero code references) must stay out of the
    template so it doesn't re-accumulate dead config."""
    text = _TEMPLATE.read_text(encoding="utf-8")
    for dead in ("CF_ACCOUNT_ID", "CF_TUNNEL_ID", "PI_IP", "PI_SSH_ALIAS", "PI_WEB_HOST"):
        assert dead not in text, f"dead key {dead} should have been removed from .env.template"


def test_header_has_no_bmo_sh_reference():
    """The header cited a nonexistent bmo.sh; it must not claim commands source
    this file via bmo.sh."""
    text = _TEMPLATE.read_text(encoding="utf-8")
    assert "bmo.sh" not in text, "the nonexistent bmo.sh reference must be gone from .env.template"
