#!/usr/bin/env python3
"""Delete all messages in a Discord channel (bot token + channel id from env)."""

import datetime
import os
import sys
import time

import requests

CHANNEL_ID = os.environ.get("DISCORD_CHANNEL_ID")
TOKEN = os.environ.get("DISCORD_BOT_TOKEN") or os.environ.get("DISCORD_DM_BOT_TOKEN") or os.environ.get(
    "DISCORD_SOCIAL_BOT_TOKEN"
)

if not CHANNEL_ID:
    print("ERROR: Set DISCORD_CHANNEL_ID", file=sys.stderr)
    sys.exit(1)
if not TOKEN:
    print(
        "ERROR: No Discord bot token (DISCORD_BOT_TOKEN, DISCORD_DM_BOT_TOKEN, or DISCORD_SOCIAL_BOT_TOKEN)",
        file=sys.stderr,
    )
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bot {TOKEN}",
    "Content-Type": "application/json",
}
BASE = "https://discord.com/api/v10"


def fetch_messages(before=None):
    params = {"limit": 100}
    if before:
        params["before"] = before
    r = requests.get(f"{BASE}/channels/{CHANNEL_ID}/messages", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def bulk_delete(ids):
    r = requests.post(
        f"{BASE}/channels/{CHANNEL_ID}/messages/bulk-delete",
        headers=HEADERS,
        json={"messages": ids},
    )
    if r.status_code not in (200, 204):
        print(f"  bulk-delete failed ({r.status_code}): {r.text}")
    return r.status_code in (200, 204)


def delete_one(msg_id):
    r = requests.delete(f"{BASE}/channels/{CHANNEL_ID}/messages/{msg_id}", headers=HEADERS)
    if r.status_code == 429:
        retry_after = r.json().get("retry_after", 1)
        print(f"  rate limited, sleeping {retry_after}s")
        time.sleep(retry_after)
        return delete_one(msg_id)
    return r.status_code == 204


def is_recent(snowflake_id):
    """True if the message is < 14 days old (bulk-delete eligible)."""
    ts_ms = (int(snowflake_id) >> 22) + 1420070400000
    age = datetime.datetime.utcnow() - datetime.datetime.utcfromtimestamp(ts_ms / 1000)
    return age.days < 14


total = 0
before = None

print(f"Purging all messages in channel {CHANNEL_ID}...")

while True:
    messages = fetch_messages(before)
    if not messages:
        break

    recent = [m["id"] for m in messages if is_recent(m["id"])]
    old = [m["id"] for m in messages if not is_recent(m["id"])]

    if len(recent) >= 2:
        if bulk_delete(recent):
            print(f"  bulk-deleted {len(recent)} messages")
            total += len(recent)
    elif len(recent) == 1:
        old.append(recent[0])

    for mid in old:
        if delete_one(mid):
            total += 1
            print(f"  deleted old message {mid} ({total} total)")
        else:
            print(f"  failed to delete {mid}")
        time.sleep(0.5)

    before = messages[-1]["id"]
    time.sleep(0.5)

print(f"Done — {total} messages deleted.")
