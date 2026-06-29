#!/usr/bin/env python3
"""board_reconcile — standalone one-pass reconciler for the BMO status board.

Decoupled from the social bot: drives the board over the Discord REST API using
the bot token, so it can run on its own systemd timer WITHOUT restarting any
existing service. Each pass:
  1. re-derives health truth from monitor_state.json (auto-clears recovered),
  2. pulls CI (gh) + deploy adapters,
  3. flags the Google Calendar reauth as an attention item while it's down,
  4. merges producer items from board_inbox.json (notify-board),
  5. edits the single pinned board embed in place (creates+pins if missing),
  6. rewrites the channel topic,
  7. stamps status_board_state.json (updated ts) for the dead-man's-switch.

Buttons + presence need a gateway connection and live in status_board_cog.py
(loaded into the social bot at the deploy step); this REST pass delivers the
self-healing board itself. Env: DISCORD_SOCIAL_BOT_TOKEN, DISCORD_BMO_CHANNEL_ID.
"""
import os
import subprocess
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services import status_board as sb  # noqa: E402

API = "https://discord.com/api/v10"
REPO = os.environ.get("BOARD_GH_REPO", "EvilPatrick06/home-lab")

# Friendly labels (mirror of monitoring._SERVICE_LABELS; kept small + safe).
LABELS = {
    "google_calendar": "📅 Google Calendar", "svc_bmo": "🏠 BMO service",
    "svc_docker": "🐳 Docker engine", "svc_bmo_social_bot": "🎵 Social bot",
    "svc_bmo_dm_bot": "🐉 DM bot", "svc_bmo_kiosk": "🖥️ Kiosk",
    "peerjs": "🌐 PeerJS", "ollama_local": "🧠 Ollama", "internet": "🌐 Internet",
    "cloudflared": "🌐 Cloudflare Tunnel", "fish_audio_api": "🔊 Fish Audio",
    "pi_cpu_temp": "🌡️ CPU temp", "pi_load": "📊 System load", "voice_canary": "🎤 Voice path",
    "net_eth0": "🔌 Ethernet", "mdns": "📡 mDNS", "rclone": "☁️ Rclone",
}


def _env():
    e = dict(os.environ)
    envf = os.path.expanduser("~/home-lab/bmo/pi/.env")
    if os.path.exists(envf):
        for ln in open(envf, encoding="utf-8"):
            ln = ln.strip()
            if "=" in ln and not ln.startswith("#"):
                k, v = ln.split("=", 1)
                e.setdefault(k, v.strip().strip('"').strip("'"))
    return e


def ci_adapter():
    """Mark an incident if any recent master CI run failed."""
    try:
        out = subprocess.run(
            ["gh", "run", "list", "--repo", REPO, "--branch", "master", "--limit", "10",
             "--json", "conclusion,status,name,url"],
            capture_output=True, text=True, timeout=20)
        import json
        runs = json.loads(out.stdout or "[]")
    except Exception:
        return []
    failed = [r for r in runs if r.get("conclusion") in ("failure", "timed_out", "cancelled")]
    if not failed:
        return []
    r = failed[0]
    return [{"key": "ci_master", "label": f"🛠️ CI: {r['name']}", "status": "down",
             "message": f"master CI {r['conclusion']} — {r['url']}"}]


def deploy_adapter():
    try:
        active = subprocess.run(["systemctl", "is-active", "bmo"],
                                capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        active = "unknown"
    if active != "active":
        return [{"key": "deploy_bmo", "label": "🚀 BMO deploy", "status": "down",
                 "message": f"bmo.service is {active}"}]
    return []


def calendar_flag(monitor, inbox):
    """Owner asked to flag the calendar reauth while it's down."""
    if monitor.get("google_calendar") == "down":
        sb.sync_source(inbox, "calendar-reauth", [sb.Item(
            id="calendar:reauth", source="calendar-reauth", category="attention",
            title="Reconnect Google Calendar", severity="warning",
            detail="OAuth refresh token revoked — run reauth_calendar.py (or the dashboard re-authorize)",
            created=time.time())])
    else:
        sb.sync_source(inbox, "calendar-reauth", [])
    return inbox


def main():
    e = _env()
    DATA = os.path.expanduser(os.environ.get("BOARD_DATA_DIR", "~/home-lab/bmo/pi/data"))
    sb.MONITOR_STATE = os.path.join(DATA, "monitor_state.json")
    sb.BOARD_STATE = os.path.join(DATA, "status_board_state.json")
    sb.BOARD_INBOX = os.path.join(DATA, "board_inbox.json")
    token = e.get("DISCORD_SOCIAL_BOT_TOKEN", "")
    chan = e.get("DISCORD_BMO_CHANNEL_ID") or e.get("DISCORD_STATUS_CHANNEL_ID") or "1478859146810888242"
    if not token:
        print("no bot token"); sys.exit(1)
    h = {"Authorization": f"Bot {token}", "Content-Type": "application/json"}

    try:
        monitor = sb._read_json(sb.MONITOR_STATE)
    except Exception:
        monitor = {}
    extra = ci_adapter() + deploy_adapter()
    health = sb.derive_incidents(monitor, labels=LABELS, extra=extra)
    state = sb.reconcile_incidents(sb.BoardState.load(), health)
    inbox = calendar_flag(monitor, sb.load_inbox())
    sb.dedupe_agents(inbox)
    sb.prune_inbox(inbox)
    sb.save_inbox(inbox)
    rows = sb.all_rows(state, health, inbox)
    embed = sb.render_embed(rows)
    topic = sb.render_topic(rows)

    # post or edit the single board message
    mid = state.board_message_id
    if mid:
        r = requests.patch(f"{API}/channels/{chan}/messages/{mid}",
                           json={"embeds": [embed], "content": ""}, headers=h, timeout=15)
        if r.status_code == 404:
            mid = None
    if not mid:
        r = requests.post(f"{API}/channels/{chan}/messages",
                          json={"embeds": [embed]}, headers=h, timeout=15)
        r.raise_for_status()
        mid = r.json()["id"]
        requests.put(f"{API}/channels/{chan}/pins/{mid}", headers=h, timeout=15)
        state.board_message_id = int(mid)
        state.channel_id = int(chan)

    # topic (best-effort; rate-limited by Discord)
    requests.patch(f"{API}/channels/{chan}", json={"topic": topic}, headers=h, timeout=15)

    state.updated = time.time()
    state.save()
    print(f"board ok · msg {mid} · topic: {topic}")
    print("rows:", len(rows), "| incidents:", len(state.incidents))


if __name__ == "__main__":
    main()
