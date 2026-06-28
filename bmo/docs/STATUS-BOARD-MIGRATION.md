# Status Board migration & cutover (SMS → single live board)

> **Gated.** Building on `auto/alert-board` is non-destructive. The live cutover
> (create/lock #status, flip monitoring off the webhook, repoint the scheduled
> tasks, clear the old channel, retire routine SMS) happens only on owner GO.

## End state

The board is the single pane of glass. An entry appears ONLY when something is
(1) wrong, (2) needs the owner, or (3) is informational. Empty board = all good.
SMS (`~/.claude-tools/notify.sh`) is retired for routine notices and kept ONLY
as the dead-man's-switch (`scripts/board_watchdog.py`) for when the board's own
stack is dark.

Three producers feed the board:
- **monitoring.py** — health/incidents (auto-derived every cycle).
- **notify-board** CLI — everything the scheduled tasks used to text.
- **bot reconciler** (`status_board_cog.py`) — renders + buttons + threads + topic + presence.

## A. Repo doc edits

| File | Change |
|---|---|
| `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` | Rule referencing `notify.sh` for left-behind branch / skipped Dependabot → "post a board item via `notify-board set integrator <id> attention …`". Keep SMS note only as dead-man's-switch. |
| `bmo/docs/phases/INSTRUCTIONS.md` (rules 19, 23, the STOP-and-ask convention at L82/L114-115) | Replace "fire `~/.claude-tools/notify.sh <sev> …`" with "publish a board item via `notify-board`"; heartbeat/session-active unchanged. |
| `dnd-app/docs/phases/INSTRUCTIONS.md`, `dungeon-scholar/docs/phases/INSTRUCTIONS.md` | Same STOP-and-ask convention swap (they reference the bmo file). |
| `bmo/docs/DISASTER-RECOVERY.md` | Note that routine alerting is the board; SMS only fires on board-dark. |
| `bmo/pi/scripts/verify-backup.sh` | If it calls `notify.sh` directly on failure, switch to `notify-board set backup-verifier …` (keep an SMS line guarded by the dead-man's-switch). |
| `bmo/docs/STATUS-BOARD-DESIGN.md`, this file | Already added on branch. |
| `bmo/pi/README.md`, `bmo/docs/ARCHITECTURE.md` | Document the board as the alerting surface; webhook deprecated. |

## B. Memory / agent-instruction edits

`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules` (repo root) + `bmo/docs/AGENTS.md`:
add a short "Notifications" section — *"User-facing alerts go to the BMO status
board via `notify-board`, never SMS. SMS (`notify.sh`) is the dead-man's-switch
only."* Remove/ update any guidance that says to text the owner.

## C. Scheduled-task conversions (~45 tasks)

Applied via the scheduled-tasks tool at cutover (each task's SKILL.md prompt).
They fall into three patterns; only the "notify" step changes — logic/cadence stay.

**Pattern 1 — content feeds → `attention`/`info` items (re-sync each run):**
`weekday-morning-brief`, `evening-winddown`, `email-triage`,
`email-follow-up-tracker`, `weekly-shipped-digest`, `calendar-conflict-watch`,
`severe-weather-alert`.
New step: build the current item set and
`… | notify-board sync <task-id>` (a clean run with nothing to show →
`notify-board clear <task-id>`). Email items use `id="email:<threadid>"` and a
Gmail deep link so the Done button / next scan both clear them.

**Pattern 2 — silent-unless-broken health checks → `incident` items:**
`pi-health-watchdog`, `ollama-health-check`, `external-uptime-check`,
`bot-heartbeat`, `ci-failure-triage`, `cert-expiry-monitor`, `backup-verifier`.
New step: on problem `notify-board set <task-id> <key> incident "<what>"
--severity <warning|critical> --url <link>`; when healthy `notify-board clear
<task-id>` so it self-heals. (`ci-failure-triage` keys per run id; `cert-expiry`
per cert.)

**Pattern 3 — approval/report agents → `attention` items on STOP-and-ask:**
the 16 scanners, 4 resolvers, `integrator`, the QA testers, phase-makers,
phase-executers. New step: where they currently `notify.sh` for STOP-and-ask,
`notify-board set <agent-id> <id> attention "<decision needed>" --url <log>`.
Their file-logging (ISSUES/SUGGESTIONS/RESOLVED) is unchanged.

> Net: ~dozens of texts/day → 0 routine texts; everything visible live on the board.

## D. Cutover sequence (the gated GO)

1. Create `#status`; deny `@everyone` SEND, allow the bmo-social bot; set `DISCORD_STATUS_CHANNEL_ID` in `bmo/pi/.env`.
2. `bot.py` loads `StatusBoardCog`; it posts + pins the board and converges. **Run dual** (webhook still on) for a cycle or two; confirm the board matches reality.
3. Flip `monitoring.py` from `_send_discord_webhook` to publishing keyed truth only (keep the webhook fn dormant as fallback).
4. Apply the §C task prompt edits; watch a few runs land on the board.
5. Install the `board_watchdog` systemd timer (every 5 min). Stop the legacy "text on everything" paths.
6. Clear the old `#bmo` firehose (archive the channel, or bulk-delete its 50+ messages) — **the only destructive step**.

## E. Rollback

Re-enable `monitoring.py`'s webhook call and revert the task prompts (kept in
git / recoverable from this doc). `notify.sh` is never removed, so SMS can be
fully re-armed by reverting step D5. Board state files
(`status_board_state.json`, `board_inbox.json`) are disposable.
