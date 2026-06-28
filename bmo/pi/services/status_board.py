"""BMO Status Board — single self-healing status surface (design scaffold).

DESIGN-FIRST SCAFFOLD — not yet wired into app.py or any bot. Safe to import
and run as a dry-run; it performs NO Discord I/O in this module. The live
cutover (bot owning a pinned embed in #status) is gated on owner approval.

Model (owner-selected): ONE bot-owned, pinned embed that is EDITED IN PLACE by
a periodic reconciler. The reconciler re-derives truth from the real checks
every cycle and rewrites the board, so the board is eventually-consistent even
if a one-shot "resolved" signal is missed. Per-incident threads hang off the
board for history; they auto-archive on resolve.

This module provides the pure, testable core:
  - the canonical keyed truth model (derive_truth)
  - the board renderer (render_embed / render_topic / render_presence)
  - a keyed incident state store (BoardState) mapping key -> message/thread ids
The Discord transport (bot edits, thread create/archive, topic, presence,
buttons) lives in a separate driver added at cutover; it is intentionally
absent here so this file is import-safe and side-effect-free.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field, asdict

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(_PI_ROOT, "data")
MONITOR_STATE = os.path.join(_DATA_DIR, "monitor_state.json")
BOARD_STATE = os.path.join(_DATA_DIR, "status_board_state.json")

# Severity ordering (worst first) drives the board color + topic summary.
SEV_ORDER = ["critical", "warning", "info", "ok"]
SEV_DOT = {"critical": "🔴", "warning": "🟡", "info": "🔵", "ok": "🟢"}
SEV_COLOR = {"critical": 0xFF0000, "warning": 0xFFA500, "info": 0x00BFFF, "ok": 0x2ECC71}

# Which monitor keys make the whole board critical when down (mirror of
# monitoring.HealthChecker._REQUIRED_FOR_OVERALL — single source at cutover).
REQUIRED_FOR_OVERALL = {
    "svc_bmo", "svc_docker", "internet", "net_wlan0",
    "google_calendar", "pihole", "pihole_dns", "cloudflared",
}

# Domain grouping for the board fields (owner: dnd-app · bmo · dungeon-scholar · infra/CI).
DOMAIN_ORDER = ["infra", "bmo", "dnd-app", "dungeon-scholar"]
DOMAIN_TITLE = {
    "infra": "🛰️ Infra / CI",
    "bmo": "🏠 BMO",
    "dnd-app": "🎲 dnd-app",
    "dungeon-scholar": "📚 dungeon-scholar",
}

# Coarse key->domain map; monitoring keys default to bmo/infra.
def _domain_for(key: str) -> str:
    if key.startswith(("svc_bmo", "voice", "pi_", "docker_bmo", "pihole")):
        return "bmo"
    if key.startswith(("ci_", "deploy_", "net_", "internet", "cloudflared", "tailscale",
                       "rclone", "mdns", "ports", "docker_", "svc_docker", "ollama")):
        return "infra"
    if key.startswith("dndapp_"):
        return "dnd-app"
    if key.startswith("scholar_"):
        return "dungeon-scholar"
    return "bmo"


def _status_to_sev(key: str, status: str) -> str:
    if status == "up":
        return "ok"
    if status in ("info", "unknown"):
        return "info"
    if status == "degraded":
        return "warning"
    if status == "down":
        return "critical" if key in REQUIRED_FOR_OVERALL else "warning"
    return "info"


@dataclass
class Incident:
    """A keyed, identity-based incident. Same key across cycles == same row."""
    key: str
    label: str
    domain: str
    severity: str
    message: str
    since: float                      # unix ts the incident opened
    message_id: int | None = None     # board (unused for single-board model)
    thread_id: int | None = None      # per-incident history thread


@dataclass
class BoardState:
    """Persisted board identity + open incidents keyed by check key.

    board_message_id: the single pinned embed the reconciler edits in place.
    incidents: key -> Incident for everything currently NOT ok (drives threads
    + 'since' relative timestamps + which threads to archive on resolve).
    """
    board_message_id: int | None = None
    channel_id: int | None = None
    incidents: dict = field(default_factory=dict)
    muted: dict = field(default_factory=dict)   # key -> mute_until ts (Ack/Mute button)
    updated: float = 0.0

    @classmethod
    def load(cls) -> "BoardState":
        try:
            with open(BOARD_STATE, encoding="utf-8") as f:
                d = json.load(f)
            inc = {k: Incident(**v) for k, v in d.get("incidents", {}).items()}
            return cls(board_message_id=d.get("board_message_id"),
                       channel_id=d.get("channel_id"), incidents=inc,
                       muted=d.get("muted", {}), updated=d.get("updated", 0.0))
        except Exception:
            return cls()

    def save(self) -> None:
        os.makedirs(_DATA_DIR, exist_ok=True)
        d = {"board_message_id": self.board_message_id, "channel_id": self.channel_id,
             "incidents": {k: asdict(v) for k, v in self.incidents.items()},
             "muted": self.muted, "updated": time.time()}
        with open(BOARD_STATE, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2)


def derive_truth(monitor_state: dict, labels: dict | None = None,
                 extra: list | None = None) -> list[dict]:
    """Re-derive the canonical keyed check list from real state.

    monitor_state: monitoring.HealthChecker._prev_status snapshot (the truth).
    extra: optional adapters (CI/deploy/QA/chat-agent) -> list of
           {key,label,status} dicts, so non-monitor truth (master CI, deploy
           health, the PHASE-09 chat-agent probe) appears on the same board.
    Returns rows: {key,label,domain,status,severity}.
    """
    labels = labels or {}
    rows = []
    for key, status in (monitor_state or {}).items():
        rows.append({
            "key": key, "label": labels.get(key, key),
            "domain": _domain_for(key), "status": status,
            "severity": _status_to_sev(key, status),
        })
    for row in (extra or []):
        k = row["key"]
        rows.append({
            "key": k, "label": row.get("label", k),
            "domain": _domain_for(k), "status": row.get("status", "unknown"),
            "severity": _status_to_sev(k, row.get("status", "unknown")),
        })
    return rows


def reconcile(state: BoardState, rows: list[dict]) -> BoardState:
    """Open/close keyed incidents from current truth. Pure state transition.

    - new not-ok key  -> open incident (since=now); driver opens a thread.
    - key back to ok   -> close incident; driver archives its thread.
    - still not-ok     -> keep incident + original 'since' (no churn).
    """
    now = time.time()
    by_key = {r["key"]: r for r in rows}
    # close resolved
    for key in list(state.incidents):
        if by_key.get(key, {}).get("severity", "ok") == "ok":
            del state.incidents[key]
    # open / refresh active
    for r in rows:
        if r["severity"] == "ok":
            continue
        if r["key"] in state.incidents:
            inc = state.incidents[r["key"]]
            inc.severity, inc.message, inc.label = r["severity"], r.get("message", inc.message), r["label"]
        else:
            state.incidents[r["key"]] = Incident(
                key=r["key"], label=r["label"], domain=r["domain"],
                severity=r["severity"], message=r.get("message", ""), since=now)
    state.updated = now
    return state


def worst_severity(rows: list[dict]) -> str:
    present = {r["severity"] for r in rows}
    for s in SEV_ORDER:
        if s in present:
            return s
    return "ok"


_ACTIVE = ("critical", "warning")  # info = honest skip / neutral, not an incident


def render_topic(rows: list[dict]) -> str:
    active = [r for r in rows if r["severity"] in _ACTIVE]
    if not active:
        return "🟢 All systems normal"
    crit = sum(1 for r in active if r["severity"] == "critical")
    names = ", ".join(r["label"].split(" ", 1)[-1] for r in active[:3])
    head = "🔴" if crit else "🟡"
    return f"{head} {len(active)} active: {names}{' …' if len(active) > 3 else ''}"


def render_presence(rows: list[dict]) -> str:
    active = [r for r in rows if r["severity"] in _ACTIVE]
    return "🟢 all green" if not active else f"🔴 {len(active)} incident(s)"


def render_embed(rows: list[dict], state: BoardState) -> dict:
    """Build the single board embed (Discord embed dict). Edited in place."""
    worst = worst_severity(rows)
    fields = []
    for dom in DOMAIN_ORDER:
        drows = [r for r in rows if r["domain"] == dom]
        if not drows:
            continue
        drows.sort(key=lambda r: SEV_ORDER.index(r["severity"]))
        lines = []
        for r in drows:
            dot = SEV_DOT[r["severity"]]
            line = f"{dot} {r['label']}"
            inc = state.incidents.get(r["key"])
            if inc and r["severity"] != "ok":
                line += f" · since <t:{int(inc.since)}:R>"
            lines.append(line)
        fields.append({"name": DOMAIN_TITLE[dom], "value": "\n".join(lines), "inline": False})
    active = [r for r in rows if r["severity"] in _ACTIVE]
    title = "🟢 BMO Status — all systems normal" if not active else f"BMO Status — {len(active)} active incident(s)"
    return {
        "title": title,
        "color": SEV_COLOR[worst],
        "fields": fields,
        "footer": {"text": "BMO status board · self-healing"},
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "description": f"Updated <t:{int(time.time())}:R>",
    }


def _dryrun() -> None:
    """Render the board from the LIVE monitor_state.json to stdout. No Discord I/O."""
    try:
        with open(MONITOR_STATE, encoding="utf-8") as f:
            ms = json.load(f)
    except Exception as e:
        print("could not read monitor_state.json:", e)
        return
    rows = derive_truth(ms)
    state = reconcile(BoardState.load(), rows)
    print("=== TOPIC ===");    print(render_topic(rows))
    print("=== PRESENCE ==="); print("Watching:", render_presence(rows))
    print("=== EMBED (dry-run) ===")
    emb = render_embed(rows, state)
    print(emb["title"], "| color", hex(emb["color"]))
    for fld in emb["fields"]:
        print("\n#", fld["name"]); print(fld["value"])
    print("\n=== OPEN INCIDENTS (keyed) ===")
    for k, inc in state.incidents.items():
        print(f"  {SEV_DOT[inc.severity]} {k}: {inc.label} [{inc.severity}]")


if __name__ == "__main__":
    _dryrun()
