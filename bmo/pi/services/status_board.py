"""BMO Status Board — single self-healing status surface (design scaffold).

DESIGN-FIRST SCAFFOLD — not yet wired into app.py or any bot. Import-safe and
side-effect-free; performs NO Discord I/O in this module. The live cutover (the
bmo-social bot owning a pinned embed in #status, retiring the webhook firehose
AND the SMS path) is gated on owner approval.

Owner-selected model: ONE bot-owned, pinned embed EDITED IN PLACE by a periodic
reconciler. The board is the single pane of glass for EVERYTHING — incidents
(something is wrong), items that need attention (reply to an email, a deadline),
and informational notes (today's calendar). SMS (~/.claude-tools/notify.sh) is
retired for routine notices and kept ONLY as a dead-man's-switch for when the
board's own stack (Pi / bot / Discord) is dark.

Core principles
  - EMPTY BOARD == ALL GOOD. A row exists only because something is wrong, needs
    attention, or is informational. No heartbeat / "all green" spam.
  - EVERY PRODUCER IS A RECONCILER FOR ITS OWN NAMESPACE. Each source re-syncs
    its full current item set every run (sync_source). Anything not re-reported
    is dropped automatically — so an item you finished but forgot to check off
    disappears on the next scan. The Done button just dismisses early.
  - EVENTUAL CONSISTENCY. Health incidents are re-derived from real checks every
    cycle, so the board self-heals even if a one-shot "resolved" signal is missed.

This module provides the pure, testable core. The Discord transport (bot edits,
threads, topic, presence, buttons) lives in a separate driver added at cutover.
"""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field, fields, asdict

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(_PI_ROOT, "data")
MONITOR_STATE = os.path.join(_DATA_DIR, "monitor_state.json")
BOARD_STATE = os.path.join(_DATA_DIR, "status_board_state.json")
BOARD_INBOX = os.path.join(_DATA_DIR, "board_inbox.json")
# Append-only decisions outbox: a board Approve/Deny click writes one JSON
# line here naming the item, the decision, and the ORIGINATING session id, for
# the dispatch-side poller to read and resume that session. See
# docs/BOARD-APPROVAL-BRIDGE.md.
BOARD_DECISIONS = os.path.join(_DATA_DIR, "board_decisions_outbox.jsonl")
# An inbox item auto-expires once its producer stops re-posting it (each
# notify-board post refreshes 'seen'). Backstop so nothing lingers if a
# 'resolved/approved' signal is missed and before the Done button is used.
INBOX_TTL_S = int(os.environ.get("BOARD_INBOX_TTL_S", str(26 * 3600)))
# Agent items (approvals/blocked/findings) expire faster: most agents re-run
# every 2-4h and re-post if still relevant, so a resolved one clears on its own.
AGENT_TTL_S = int(os.environ.get("BOARD_AGENT_TTL_S", str(6 * 3600)))
# Page size for the board's paginated "awaiting your decision" agent rows.
# The renderer may shrink the EFFECTIVE page size further so the total
# component count always stays strictly under Discord's 40-component cap.
AWAITING_PER_PAGE = int(os.environ.get("BOARD_AWAITING_PER_PAGE", "5"))

# Severity ordering (worst first) drives the board color + topic summary.
SEV_ORDER = ["critical", "warning", "info", "ok"]
SEV_DOT = {"critical": "🔴", "warning": "🟡", "info": "🔵", "ok": "🟢"}
SEV_COLOR = {"critical": 0xFF0000, "warning": 0xFFA500, "info": 0x00BFFF, "ok": 0x2ECC71}
_ACTIVE = ("critical", "warning")  # "info" = informational / honest skip, not an incident

# Board buckets (owner's three) → section header + which severities/categories.
#   incident   : something is WRONG          (from health/CI/deploy/chat probe)
#   attention  : something NEEDS YOU          (email to reply, deadline due, cal soon)
#   info       : informational               (today's calendar FYI, honest skips)
SECTIONS = [
    ("incident",  "🚨 Incidents"),
    ("attention", "📌 Needs you"),
    ("agent",     "🤖 Agents"),
    ("today",     "📅 Today"),
    ("info",      "💡 Info"),
]

# Mirror of monitoring.HealthChecker._REQUIRED_FOR_OVERALL (single source at cutover).
REQUIRED_FOR_OVERALL = {
    "svc_bmo", "svc_docker", "internet", "net_wlan0",
    "google_calendar", "pihole", "pihole_dns", "cloudflared",
}

DOMAIN_ORDER = ["infra", "bmo", "dnd-app", "dungeon-scholar"]
DOMAIN_TITLE = {
    "infra": "🛰️ Infra / CI", "bmo": "🏠 BMO",
    "dnd-app": "🎲 dnd-app", "dungeon-scholar": "📚 dungeon-scholar",
}


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
    if status == "skipped":
        return "warning"  # a check whose tooling is missing -> actionable incident (install it)
    if status in ("info", "unknown"):
        return "info"
    if status == "degraded":
        return "warning"
    if status == "down":
        return "critical" if key in REQUIRED_FOR_OVERALL else "warning"
    return "info"


# -- Agent identity: ONE canonical key per producing agent --------------------
# The agents section dedups by *producer*, but the same logical agent can post
# through two paths: the generic notify.sh router (source "agent"/"notify", with
# the producer name carried as the "Name: message" title prefix) and a slug-keyed
# direct post (source = the agent slug). Keying the board by the raw `source`
# treats those as two sources and shows the status twice. agent_identity()
# collapses both to the SAME slug, so a source updates its single live row in
# place instead of appending a second line.
_GENERIC_AGENT_SOURCES = {"", "agent", "notify"}


def _slug(text: str) -> str:
    """Producer slug -- mirrors notify.sh's key derivation (lowercase,
    non-alphanumeric runs -> '-', trimmed, capped)."""
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:48]


def agent_identity(source, title):
    """Return (canonical_key, display_label, message) for an agent item.

    canonical_key is the producer slug used for dedup/grouping; it is identical
    whether the item arrived via the slug source or via the generic router bucket
    (with the producer name in the title prefix). display_label is the
    plain-English producer name; message is the title with any "Name:" prefix
    removed."""
    title = (title or "").strip()
    if ":" in title:
        name, message = title.split(":", 1)
        name, message = name.strip(), message.strip()
    else:
        name, message = "", title
    src = (source or "").strip()
    if src.lower() in _GENERIC_AGENT_SOURCES:
        if name:                       # "Name: message" -> producer + message
            return _slug(name), name, message
        # bare title -> the whole title IS the producer identity, no message
        return (_slug(title) or "agent"), (title or "agent"), ""
    return _slug(src), (name or src), message


def agent_keys(rows):
    """Distinct canonical agent producers among the given rows (for counts)."""
    return {agent_identity(r.get("source"), r.get("title"))[0]
            for r in rows if r.get("category") == "agent"}


def group_agent_rows(rows):
    """Collapse agent rows to ONE rendered entry per canonical producer.

    Returns [{key, label, severity, message, count}] sorted by label. Multiple
    distinct asks from the same producer fold into a single 'N items awaiting
    review' entry at that producer's worst severity -- the single-self-healing-
    board contract (one live entry per source, updated in place)."""
    groups = {}
    labels = {}
    for r in rows:
        if r.get("category") != "agent":
            continue
        key, label, message = agent_identity(r.get("source"), r.get("title"))
        # Dedup distinct ASKS by message so the SAME status arriving via two
        # paths (generic source + slug source) counts once, not twice.
        msgs = groups.setdefault(key, {})
        mkey = _slug(message)
        sev = r["severity"]
        prev = msgs.get(mkey)
        if prev is None or SEV_ORDER.index(sev) < SEV_ORDER.index(prev["severity"]):
            msgs[mkey] = {"message": message, "severity": sev}
        labels.setdefault(key, label)
    out = []
    for key, msgs in groups.items():
        items = sorted(msgs.values(), key=lambda m: SEV_ORDER.index(m["severity"]))
        worst = items[0]["severity"]
        message = items[0]["message"] if len(items) == 1 else f"{len(items)} items awaiting review"
        out.append({"key": key, "label": labels[key], "severity": worst,
                    "message": message, "count": len(items)})
    out.sort(key=lambda g: g["label"].lower())
    return out


# ── Inbox: producer-synced feed items (email / calendar / deadlines / notes) ──

@dataclass
class Item:
    """A keyed feed item posted by a producer (scheduled task or service).

    id:       stable per logical thing (e.g. f"email:{gmail_thread_id}") so the
              same email/deadline maps to the same row across runs.
    source:   producer namespace (e.g. "email-triage"); sync_source replaces the
              whole namespace each run → resolved items auto-drop.
    category: incident | attention | info  (owner's three buckets).
    """
    id: str
    source: str
    category: str
    title: str
    detail: str = ""
    severity: str = "info"
    url: str | None = None        # "Open" link (email/event/dashboard)
    created: float = 0.0          # first seen — drives 'since <t:R>'
    seen: float = 0.0             # last time a producer re-posted it (TTL)
    due: float | None = None      # for deadlines → 'due <t:R>'
    session_id: str | None = None  # originating dispatch/cowork session id (approve/deny bridge)


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


_ITEM_FIELDS = {f.name for f in fields(Item)}


def _item_from_dict(d: dict) -> "Item":
    """Build an Item, ignoring any unknown keys so an older/newer on-disk
    schema (e.g. before/after 'session_id' was added) never crashes the loader."""
    return Item(**{k: v for k, v in d.items() if k in _ITEM_FIELDS})


def load_inbox() -> dict:
    try:
        with open(BOARD_INBOX, encoding="utf-8") as f:
            raw = json.load(f)
        return {src: {i["id"]: _item_from_dict(i) for i in items} for src, items in raw.items()}
    except Exception:
        return {}


def save_inbox(inbox: dict) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    raw = {src: [asdict(it) for it in items.values()] for src, items in inbox.items()}
    with open(BOARD_INBOX, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)


def prune_inbox(inbox: dict, ttl_s: float = INBOX_TTL_S) -> int:
    """Drop items whose last 'seen' (or created) is older than ttl_s."""
    now = time.time(); dropped = 0
    for src in list(inbox):
        keep = {}
        for iid, it in inbox[src].items():
            limit = AGENT_TTL_S if getattr(it, "category", "") == "agent" else ttl_s
            age = now - (getattr(it, "seen", 0) or it.created or now)
            if age <= limit:
                keep[iid] = it
            else:
                dropped += 1
        inbox[src] = keep
    return dropped


def sync_source(inbox: dict, source: str, items: list[Item]) -> dict:
    """Replace ALL items for `source` with `items` (the producer-as-reconciler
    contract). Preserves `created` for ids that persist so 'since' stays stable.
    Items previously present but absent now are dropped (auto-expire)."""
    now = time.time()
    prev = inbox.get(source, {})
    new = {}
    for it in items:
        it.source = source
        it.created = prev[it.id].created if it.id in prev else (it.created or now)
        new[it.id] = it
    inbox[source] = new
    return inbox


def mark_done(inbox: dict, item_id: str) -> bool:
    """Done button: dismiss one item immediately, wherever it lives."""
    for src in inbox:
        if item_id in inbox[src]:
            del inbox[src][item_id]
            return True
    return False


# ── Approve/Deny bridge: decisions outbox + originating-session relay ─────

def is_approval_item(it) -> bool:
    """True if this inbox item is an agent 'awaiting approve/deny' item that
    carries an originating session id — the marker that a board click can relay
    the decision back to the session that posted it. Only these items get
    Approve/Deny buttons; everything else keeps the existing in-chat path."""
    return getattr(it, "category", "") == "agent" and bool(getattr(it, "session_id", None))


def is_approval_row(r: dict) -> bool:
    """Row-dict form of is_approval_item (used by the renderer)."""
    return r.get("category") == "agent" and bool(r.get("session_id"))


def clamp_page(page, total_items: int, per_page: int) -> int:
    """Clamp a stored 0-based page index against the CURRENT item count, so a
    list that shrank (items resolved/approved) never strands the board on an
    empty page, and corrupt persisted state degrades to page 0."""
    try:
        page = int(page or 0)
    except (TypeError, ValueError):
        page = 0
    if per_page <= 0 or total_items <= 0:
        return 0
    last_page = (total_items - 1) // per_page
    return max(0, min(page, last_page))


def page_slice(items: list, page: int, per_page: int) -> list:
    """The items visible on 0-based `page` at `per_page` items per page."""
    if per_page <= 0:
        return list(items)
    start = page * per_page
    return list(items)[start:start + per_page]


def record_decision(decision: str, item, *, decided_by: str = "board",
                    text: str | None = None, outbox: str | None = None) -> dict:
    """Append a decision record to the append-only decisions outbox (JSONL) for
    the dispatch-side poller to consume, and return the record written.

    decision is 'approve', 'deny', or 'other'. The record names the item, its
    source, the ORIGINATING session id (so the poller knows which session to
    resume), the item title, who decided, and a timestamp. For an 'other'
    decision (the board's ✏️ Other modal) the free-form instruction the user
    typed is carried in an additional 'text' field, which the poller relays into
    the session verbatim. Writing is append-only so a click never races the
    bot's inbox writes. See docs/BOARD-APPROVAL-BRIDGE.md.
    """
    if decision not in ("approve", "deny", "other"):
        raise ValueError(
            f"decision must be 'approve', 'deny', or 'other', got {decision!r}")
    outbox = outbox or BOARD_DECISIONS
    rec = {
        "ts": time.time(),
        "decision": decision,
        "item_id": getattr(item, "id", None),
        "source": getattr(item, "source", None),
        "session_id": getattr(item, "session_id", None),
        "title": getattr(item, "title", ""),
        "decided_by": decided_by,
    }
    if decision == "other":
        # Only 'other' carries free-form text; approve/deny lines stay unchanged.
        rec["text"] = text or ""
    os.makedirs(os.path.dirname(outbox), exist_ok=True)
    with open(outbox, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def dedupe_agents(inbox: dict) -> int:
    """Collapse already-persisted duplicate agent items that map to the same
    canonical producer AND carry the same message (e.g. the same status posted
    under both the generic 'agent' source and the agent's own slug source). Keeps
    the most-recently-seen copy and drops the rest, so a stale dual-keyed line
    clears on the next reconcile. Returns the number of duplicates removed."""
    seen = {}
    removed = 0
    for src in inbox:
        for iid, it in list(inbox[src].items()):
            if getattr(it, "category", "") != "agent":
                continue
            key, _label, message = agent_identity(it.source, it.title)
            ident = (key, _slug(message))
            ts = (getattr(it, "seen", 0) or 0) or (getattr(it, "created", 0) or 0)
            if ident not in seen:
                seen[ident] = (src, iid, ts)
                continue
            psrc, piid, pts = seen[ident]
            if ts > pts:
                inbox[psrc].pop(piid, None)
                seen[ident] = (src, iid, ts)
            else:
                inbox[src].pop(iid, None)
            removed += 1
    return removed


# ── State: board identity + open health incidents (auto-derived) ─────────────

@dataclass
class Incident:
    key: str
    label: str
    domain: str
    severity: str
    message: str
    since: float
    thread_id: int | None = None


@dataclass
class BoardState:
    board_message_id: int | None = None
    channel_id: int | None = None
    incidents: dict = field(default_factory=dict)
    updated: float = 0.0
    muted: dict = field(default_factory=dict)          # incident key -> mute_until ts
    collapse_info: bool = False                        # Info section hidden?
    pinged_critical: list = field(default_factory=list)  # critical keys already pinged
    board_v2: bool = False                             # is the live board a Components-V2 msg?
    awaiting_page: int = 0                             # current awaiting-approval page (persisted)

    @classmethod
    def load(cls) -> "BoardState":
        try:
            with open(BOARD_STATE, encoding="utf-8") as f:
                d = json.load(f)
            inc = {k: Incident(**v) for k, v in d.get("incidents", {}).items()}
            try:
                page = int(d.get("awaiting_page", 0) or 0)
            except (TypeError, ValueError):
                page = 0
            return cls(d.get("board_message_id"), d.get("channel_id"), inc,
                       d.get("updated", 0.0), d.get("muted", {}),
                       d.get("collapse_info", False), d.get("pinged_critical", []),
                       d.get("board_v2", False), page)
        except Exception:
            return cls()

    def save(self) -> None:
        os.makedirs(_DATA_DIR, exist_ok=True)
        d = {"board_message_id": self.board_message_id, "channel_id": self.channel_id,
             "incidents": {k: asdict(v) for k, v in self.incidents.items()},
             "updated": time.time(), "muted": self.muted,
             "collapse_info": self.collapse_info, "pinged_critical": self.pinged_critical,
             "board_v2": self.board_v2, "awaiting_page": self.awaiting_page}
        with open(BOARD_STATE, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2)


def derive_incidents(monitor_state: dict, labels: dict | None = None,
                     extra: list | None = None, messages: dict | None = None) -> list[dict]:
    """Re-derive keyed health rows from real state. extra = CI/deploy/chat-probe
    adapters [{key,label,status,message}] so non-monitor truth shares the board."""
    labels = labels or {}
    messages = messages or {}
    rows = []
    for key, status in (monitor_state or {}).items():
        rows.append({"key": key, "label": labels.get(key, key), "domain": _domain_for(key),
                     "status": status, "severity": _status_to_sev(key, status),
                     "message": messages.get(key, "")})
    for r in (extra or []):
        k = r["key"]
        rows.append({"key": k, "label": r.get("label", k), "domain": _domain_for(k),
                     "status": r.get("status", "unknown"),
                     "severity": _status_to_sev(k, r.get("status", "unknown")),
                     "message": r.get("message", "")})
    return rows


def reconcile_incidents(state: BoardState, rows: list[dict]) -> BoardState:
    now = time.time()
    by_key = {r["key"]: r for r in rows}
    for key in list(state.incidents):
        if by_key.get(key, {}).get("severity", "ok") not in _ACTIVE:
            del state.incidents[key]          # recovered or downgraded → close (+archive thread)
    for r in rows:
        if r["severity"] not in _ACTIVE:
            continue
        if r["key"] in state.incidents:
            inc = state.incidents[r["key"]]
            inc.severity, inc.message, inc.label = r["severity"], r["message"], r["label"]
        else:
            state.incidents[r["key"]] = Incident(r["key"], r["label"], r["domain"],
                                                 r["severity"], r["message"], now)
    state.updated = now
    return state


# ── Unified view: incidents + info health + inbox items → renderable rows ─────

def all_rows(state: BoardState, health_rows: list[dict], inbox: dict) -> list[dict]:
    rows = []
    for r in health_rows:                      # active incidents + informational skips
        if r["severity"] == "ok":
            continue
        inc = state.incidents.get(r["key"])
        rows.append({"category": "incident" if r["severity"] in _ACTIVE else "info",
                     "severity": r["severity"], "title": r["label"],
                     "detail": r["message"], "since": inc.since if inc else None,
                     "due": None, "url": None,
                     "kind": "incident", "key": r["key"], "id": None, "source": None})
    for src in inbox.values():
        for it in src.values():
            rows.append({"category": it.category, "severity": it.severity,
                         "title": it.title, "detail": it.detail, "since": it.created,
                         "due": it.due, "url": it.url,
                         "kind": "item", "key": it.id, "id": it.id, "source": it.source,
                         "session_id": getattr(it, "session_id", None)})
    return rows


def worst_severity(rows: list[dict]) -> str:
    present = {r["severity"] for r in rows}
    for s in SEV_ORDER:
        if s in present:
            return s
    return "ok"


def render_topic(rows: list[dict]) -> str:
    if not rows:
        return "🟢 All clear"
    inc = [r for r in rows if r["category"] == "incident" and r["severity"] in _ACTIVE]
    att = [r for r in rows if r["category"] == "attention"]
    brf = [r for r in rows if r["category"] == "brief"]
    info = [r for r in rows if r["category"] == "info"]
    agt_src = agent_keys([r for r in rows if r["severity"] != "info"])
    if inc:
        head = "🔴" if any(r["severity"] == "critical" for r in inc) else "🟡"
        bits = [f"{len(inc)} incident" + ("s" if len(inc) != 1 else "")]
    else:
        head, bits = "🟢", ["systems normal"]
    if att:
        bits.append(f"📌 {len(att)}")
    if brf:
        bits.append(f"📋 {len(brf)}")
    if agt_src:
        bits.append(f"🤖 {len(agt_src)}")
    if info:
        bits.append(f"💡 {len(info)}")
    return f"{head} " + " · ".join(bits)


def render_presence(rows: list[dict]) -> str:
    inc = [r for r in rows if r["category"] == "incident" and r["severity"] in _ACTIVE]
    att = len([r for r in rows if r["category"] in ("attention", "brief")])
    agt = len(agent_keys([r for r in rows if r["severity"] != "info"]))
    if inc:
        return f"🔴 {len(inc)} incident(s)"
    if att + agt:
        return f"🟡 {att + agt} to review"
    return "🟢 all green"


def render_embed(rows: list[dict]) -> dict:
    worst = worst_severity(rows)
    fields, summary = [], []
    for cat, header in SECTIONS:
        crows = [r for r in rows if r["category"] == cat]
        if not crows:
            continue
        crows.sort(key=lambda r: SEV_ORDER.index(r["severity"]))
        if cat == "agent":
            agroups = group_agent_rows(crows)
            alines = []
            for g in agroups[:10]:
                line = f"{SEV_DOT[g['severity']]} **{g['label']}**"
                if g["message"]:
                    line += f" — {g['message']}"
                alines.append(line)
            if len(agroups) > 10:
                alines.append(f"_…and {len(agroups) - 10} more_")
            fields.append({"name": f"{header} · {len(agroups)}",
                           "value": "\n".join(alines)[:1024], "inline": False})
            summary.append(f"{header.split()[0]} {len(agroups)}")
            continue
        lines = []
        for r in crows[:10]:
            line = f"{SEV_DOT[r['severity']]} **{r['title'].strip()}**"
            if r.get("due"):
                line += f" · due <t:{int(r['due'])}:R>"
            elif r.get("since"):
                line += f" · <t:{int(r['since'])}:R>"
            if r.get("detail"):
                line += f"\n\u2003{r['detail'].strip()[:170]}"
            lines.append(line)
        if len(crows) > 10:
            lines.append(f"_…and {len(crows) - 10} more_")
        fields.append({"name": f"{header} · {len(crows)}",
                       "value": "\n".join(lines)[:1024], "inline": False})
        summary.append(f"{header.split()[0]} {len(crows)}")
    ts = f"<t:{int(time.time())}:R>"
    if not fields:
        return {"title": "🟢 All clear",
                "color": SEV_COLOR["ok"],
                "description": f"No incidents — nothing needs you.\nUpdated {ts}",
                "footer": {"text": "BMO status board · self-healing"}}
    return {"title": "📟 BMO Status Board",
            "color": SEV_COLOR[worst],
            "description": "\u2002·\u2002".join(summary) + f"\nUpdated {ts}",
            "fields": fields,
            "footer": {"text": "self-healing · items clear automatically when resolved"},
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


# ── Dead-man's-switch: only fires SMS when the board itself is dark ───────────

def board_is_stale(state: BoardState, max_age_s: float = 600) -> bool:
    """True if the reconciler hasn't updated the board within max_age_s — the
    cue for the watchdog to fall back to notify.sh (Pi/bot/Discord dark)."""
    return (time.time() - (state.updated or 0)) > max_age_s
