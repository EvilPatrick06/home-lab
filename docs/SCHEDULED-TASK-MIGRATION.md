# Scheduled-task migration — Claude tasks → GitHub Actions / bmo cron

This tracks the migration of recurring Claude scheduled tasks off the LLM
scheduler onto deterministic infrastructure (GitHub Actions and bmo cron). Each
row lands its code CI-gated on a branch; the matching Claude task is retired
(paused) only once its replacement is live.

## How replacements reach the BMO status board

Board posting from a GitHub runner rides the **same Tailscale-SSH path as
`bmo / deploy`**: the runner joins the tailnet ephemerally with the
`TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` repo secrets, then runs the deployed
`notify-board` over Tailscale SSH. Every board-posting workflow is **dormant by
design** — if those secrets are absent the post step is skipped and the run
lands **green**, never red. (The original migration plan called this "the
`BMO_SSH_KEY` secret"; in this repo the equivalent is the Tailscale OAuth pair,
which `bmo / deploy` already uses — so no raw SSH key is stored anywhere.)

bmo-cron replacements post by calling `/home/patrick/bmo-board/notify-board`
directly (they already run on bmo).

## Phase 1 — GitHub Actions (no secret needed to *build*)

| Replacement | Trigger | Retires | Needs secret to POST |
| --- | --- | --- | --- |
| `.github/workflows/ci-failure-triage.yml` | `workflow_run: completed` (failure/success) on master | `ci-failure-triage` | TS_OAUTH (dormant-green without) |
| `.github/workflows/weekly-shipped-digest.yml` | cron `0 23 * * 0` | `weekly-shipped-digest` | TS_OAUTH (dormant-green without) |
| `.github/workflows/stale-branch-pruner.yml` (remote) + `bmo/pi/scripts/stale-local-cleanup.sh` (bmo cron) | cron `0 10 * * 0` / bmo cron | `stale-branch-pruner` | none (uses GITHUB_TOKEN) |
| `.github/workflows/external-uptime-check.yml` | cron `*/30 * * * *` | `external-uptime-check` | TS_OAUTH to post to board; **GitHub-issue fallback needs no secret** |

Runner-side helpers live in `.github/scripts/` (`board-ssh.sh`,
`ci-failure-board.sh`, `shipped-digest.sh`, `uptime-check.sh`,
`prune-merged-branches.sh`).

Cron times are **UTC** (GitHub Actions has no timezone); they approximate the old
America/Denver local times and drift ±1h across DST.

## Phase 2 — deterministic bmo cron (no LLM)

| Replacement | Cron (bmo, local time) | Retires |
| --- | --- | --- |
| `bmo/pi/scripts/cron/calendar-conflict-watch.sh` | weekly Mon 07:00 | `calendar-conflict-watch` |
| `bmo/pi/scripts/cron/severe-weather-alert.sh` | 06:00 & 15:00 daily | `severe-weather-alert` |

## Phase 3 — bmo cron + Gemini (needs a Gemini API key)

| Replacement | Cron (bmo, local time) | Retires | Needs |
| --- | --- | --- | --- |
| `bmo/pi/scripts/cron/weekday-morning-brief.sh` | 06:00 daily | `weekday-morning-brief` | `GEMINI_API_KEY` |
| `bmo/pi/scripts/cron/evening-winddown.sh` | 20:00 daily | `evening-winddown` | `GEMINI_API_KEY` |

Gemini scripts read `GEMINI_API_KEY` from `bmo/pi/.env` (already git-ignored and
loaded by services). Until a key exists they no-op cleanly (post nothing / a
plain non-LLM fallback), so they are safe to install before the key is set.

## What the owner must do to activate

1. **Confirm the Tailscale OAuth secrets exist** (`TS_OAUTH_CLIENT_ID`,
   `TS_OAUTH_SECRET`) in the repo — the same pair `bmo / deploy` uses. Present →
   the board-posting workflows go live automatically. Absent → they stay green
   but silent until added. (This is the plan's "add the `BMO_SSH_KEY` secret"
   step, mapped onto this repo's real mechanism.)
2. **Add `GEMINI_API_KEY`** to `bmo/pi/.env` on the Pi for Phase 3.
3. **Install the bmo crons** (Phases 1-local, 2, 3) — see the crontab block in
   the reference file `bmo/pi/scripts/cron/README.md`.
4. **Retire each Claude task** once its replacement is verified live: pause it in
   the scheduled-tasks panel (or via the scheduled-tasks tool `enabled:false`).
   Retiring is deferred to the owner so a replacement can be watched for one full
   cycle before its Claude counterpart is switched off.
