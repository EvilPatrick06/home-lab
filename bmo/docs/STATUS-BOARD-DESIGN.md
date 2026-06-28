# BMO Status Board — self-healing status surface (design)

> Status: **DESIGN-FIRST / branch scaffold only.** Not wired into `app.py` or any
> bot. Live cutover (bot owning a pinned embed in `#status`, deleting/replacing
> the current webhook firehose) is **gated on owner approval**.

## Problem

The current Discord alerts channel is fed by `services/monitoring.py` via
`DISCORD_WEBHOOK_URL` (`_send_discord_webhook`). It posts one embed per
state-change and, on recovery, posts a *second* "✅ recovered" message instead
of removing the original. Webhooks are fire-and-forget: no message id is kept,
so nothing can be edited or deleted. Result: the channel is an append-only
firehose (50+ messages, ~1 truly-active incident) that does not reflect current
reality. It also can't show non-monitor truth (master CI, deploy health, the
PHASE-09 chat-agent outage).

## Model (owner-selected): single bot-owned, edited-in-place board

- **One pinned embed** in a locked `#status` channel, **edited in place** by a
  periodic **reconciler** — never reposted.
- **Color sidebar = worst current severity.** Fields grouped by domain
  (Infra/CI · BMO · dnd-app · dungeon-scholar). Each line: 🟢/🟡/🔴 + label,
  active rows show `since <t:unix:R>` (Discord relative timestamp).
- **Channel topic** rewritten to a one-line summary ("🟢 All systems normal" /
  "🔴 2 active: …").
- **Per-incident threads** off the board for history; **auto-archived on
  resolve** so the board stays clean.
- **Buttons:** Refresh now · Acknowledge/Mute · Open dashboard (link).
- **Bot presence** reflects overall health ("Watching: 🟢 all green" /
  "🔴 2 incidents").
- **Keyed state store** (`data/status_board_state.json`): board message id +
  `key → incident{since, severity, thread_id}`. The reconciler re-derives truth
  from the real checks every cycle, so the board self-heals even if a one-shot
  "resolved" signal is missed (eventual consistency).

## Why the bot, not the webhook

Topic edits, threads, buttons (interactions), and presence all require a
gateway **bot** — a webhook can do none of them. The `bmo-social` bot
(`bots/social/bot.py`, discord.py 2.7.1) is already a connected gateway client
with Views/buttons, `change_presence`, and message edits, so it is the natural
board owner. `monitoring.py` stops calling the webhook and instead publishes
keyed truth that the bot's reconciler renders.

## Scaffold in this branch

`services/status_board.py` — pure, side-effect-free core (import-safe, no
Discord I/O): `derive_truth()`, keyed `BoardState`/`Incident` + `reconcile()`,
and `render_embed/render_topic/render_presence`. Run `python services/status_board.py`
for a dry-run that renders the would-be board from the live `monitor_state.json`.
The Discord driver (bot edits/threads/topic/presence/buttons) is added at
cutover.
