#!/usr/bin/env python3
"""board_watchdog — dead-man's-switch for the BMO status board (design scaffold).

Routine notifications now live on the board, NOT in SMS. This watchdog is the
ONLY remaining caller of ~/.claude-tools/notify.sh: it texts the owner ONLY when
the board itself can't be trusted — i.e. the board's own stack is dark:
  - the reconciler hasn't refreshed status_board_state.json within MAX_AGE, or
  - the bmo-social bot unit (the board owner) is not active, or
  - the last N board-write attempts failed.

Intended cadence: a small systemd timer every ~5 min (installed at cutover).
De-dupes so it sends at most one "board is dark" text per outage, and one
"board recovered" text when it comes back. Until cutover this is not installed.
"""
import json
import os
import subprocess
import time

# Resolve relative to this script so the deployed copy watches the deploy data
# dir (same files the live cog writes), not a stale non-deploy checkout.
DATA_DIR = os.path.expanduser(os.environ.get("BOARD_DATA_DIR", "")) or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
BOARD_STATE = os.path.join(DATA_DIR, "status_board_state.json")
FLAG = os.path.join(DATA_DIR, ".board_dark")          # de-dupe sentinel
NOTIFY = os.path.expanduser("~/.claude-tools/notify.sh")
MAX_AGE_S = int(os.environ.get("BOARD_MAX_AGE_S", "900"))   # 15 min
BOT_UNIT = os.environ.get("BOARD_BOT_UNIT", "bmo-social-bot.service")


def _board_age():
    try:
        with open(BOARD_STATE, encoding="utf-8") as f:
            return time.time() - float(json.load(f).get("updated", 0))
    except Exception:
        return float("inf")


def _bot_down():
    try:
        r = subprocess.run(["systemctl", "is-active", BOT_UNIT],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() != "active"
    except Exception:
        return True


def _sms(sev, subj, body):
    if os.path.exists(NOTIFY):
        env = dict(os.environ, NOTIFY_FORCE_SMS="1")
        subprocess.run([NOTIFY, sev, subj, body], timeout=60, env=env)


def main():
    age = _board_age()
    reasons = []
    if age > MAX_AGE_S:
        reasons.append(f"board not refreshed for {age/60:.0f} min")
    if _bot_down():
        reasons.append(f"{BOT_UNIT} not active")

    dark = bool(reasons)
    was_dark = os.path.exists(FLAG)

    if dark and not was_dark:
        open(FLAG, "w").write(str(time.time()))
        _sms("error", "BMO status board is DARK",
             "Falling back to SMS — the board can't show status:\n- " + "\n- ".join(reasons))
    elif not dark and was_dark:
        os.remove(FLAG)
        _sms("info", "BMO status board recovered", "The board is live again; SMS fallback off.")


if __name__ == "__main__":
    main()
