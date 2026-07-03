# `bmo/pi/scripts/` — operational toolbox

One-line purpose + where each script runs. "Where" legend:

- **Pi** — runs on the Raspberry Pi (deploy target), by a systemd unit, cron, or a human on the box.
- **CI** — invoked by CI / the admission gate.
- **agent** — called by scheduled/automated agents (usually over SSH).
- **one-off** — a human runs it by hand during setup/maintenance.

> New to this dir? Start with the **Notifications** section below — the two
> `notify*.sh.*` files have deliberately odd, non-`.sh` extensions and look like
> orphans, but they are intentional reference copies, **not** dead code. Do not
> "clean them up" (delete them).

## Notifications — the `notify` family (read before touching)

BMO's alerting is **board-first, SMS-only-as-failsafe**. The live router that
every scheduled task actually calls lives **outside this repo**, at
`~/.claude-tools/notify.sh` on the Pi (deployed by copying). The in-repo copies
carry disambiguating suffixes to mark them as *source-of-truth references that
are **not** run from here*:

| Repo file | Role | Runtime location it mirrors |
|---|---|---|
| `notify.sh.router-deployed` | **Source-of-truth copy** of the live notification router. Routes `notify.sh <sev> <subject> <body>` to the status board (via `notify-board`); falls back to SMS only when the board is unreachable or `NOTIFY_FORCE_SMS=1`. | `~/.claude-tools/notify.sh` (the path every agent/scheduled task invokes) |
| `notify-sms.sh.reference` | **SMS failsafe reference.** Sends SMS-via-email-to-MMS-gateway (+ optional email copy). Fires only when the board router can't reach the board. | `~/.claude-tools/notify-sms.sh` |
| `notify-board` | **Board producer CLI** the router routes to. Publishes KEYED items to the BMO status board (writes `data/board_inbox.json`; the Discord bot's reconciler renders it). `sync`/`set`/`clear`/`done`. | run in-repo / on the Pi (Python, executable) |

**Why the `.router-deployed` / `.reference` extensions?** They make the files
non-executable as-is, signalling "this is the canonical copy; the thing that
runs is the deployed one at `~/.claude-tools/`." When the router changes, edit
`notify.sh.router-deployed` here and re-deploy it to `~/.claude-tools/notify.sh`
(and likewise `notify-sms.sh.reference` → `~/.claude-tools/notify-sms.sh`).

To send a notification from an agent/session you call the **deployed** router,
not the repo copy:

```bash
ssh patrick@bmo '~/.claude-tools/notify.sh <sev> "<subject>" "<body>"'
```

## Deploy / release

| Script | Purpose | Where |
|---|---|---|
| `deploy.sh` | Deploy the repo to the Pi (rsync/checkout, install units, restart services). | one-off / Pi |
| `install-venv.sh` | Create/refresh the Python venv from `requirements*.txt`. | Pi / one-off |
| `migrate-bmo-deploy-checkout.sh` | One-time migration to the dedicated `home-lab-deploy` checkout. | one-off |
| `run-check.sh` | Admission gate for heavy checks (pytest/tsc/builds): bounds RAM + concurrency so parallel agents don't OOM the 8GB Pi. Run pytest/heavy jobs THROUGH this. | CI / agent |

## Health / monitoring / board

| Script | Purpose | Where |
|---|---|---|
| `health-check.sh` | Probe BMO's HTTP/health endpoints. | Pi / one-off |
| `e2e-test.sh` | End-to-end smoke test against a running BMO. | one-off |
| `board-pending-decisions.sh` | List status-board items awaiting an owner decision. | agent / one-off |
| `board-decision-nudge.sh` | Nudge (re-surface) pending board decisions. | agent |
| `board_reconcile.py` | Reconcile the board inbox → rendered board state. | Pi / agent |
| `board_watchdog.py` | Watchdog for board freshness/liveness. | Pi |

## Backups

| Script | Purpose | Where |
|---|---|---|
| `backup-state.sh` | Back up BMO runtime state (`data/`, config). | Pi (cron) |
| `verify-backup.sh` | Verify a backup is complete/restorable. | Pi / one-off |

## Cloudflare / network setup

| Script | Purpose | Where |
|---|---|---|
| `setup-cloudflare-tunnel.sh` | Set up the Cloudflare tunnel. | one-off |
| `cloudflare-access-api.sh` | Cloudflare Access API helper. | one-off / agent |
| `apply-access-config.sh` | Apply Cloudflare Access policy config. | one-off |
| `diagnose-cloudflare.sh` | Diagnose tunnel/Access issues. | one-off |
| `setup-tailscale.sh` | Set up Tailscale on the Pi. | one-off |

## Data / library

| Script | Purpose | Where |
|---|---|---|
| `seed-5e-library.sh` | Seed the 5e reference library. | one-off |
| `sync-shared-5e-json.sh` | Sync shared 5e JSON sources. | one-off / agent |

## CI ratchets / lint helpers

| Script | Purpose | Where |
|---|---|---|
| `check-complexity.py` | Complexity ratchet check. | CI |
| `check-no-home-lab-literals.sh` | Fail on hardcoded `home-lab` path literals. | CI |
| `check-no-new-prints.sh` | Print-retirement ratchet (no new bare `print`). | CI |

## Misc

| Script | Purpose | Where |
|---|---|---|
| `stale-local-cleanup.sh` | Clean up stale local artifacts. | one-off |
| `win_proxy.py` | Windows-side dev proxy helper. | dev (off-Pi) |
| `cron/` | Cron job definitions/wrappers. | Pi |
