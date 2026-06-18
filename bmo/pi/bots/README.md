# Discord bots (package name is intentional)

This directory is named **`bots/`**, not `discord/`, so the local package does not **shadow** the `discord.py` library import.

See [`../../docs/DESIGN-CONSTRAINTS.md`](../../docs/DESIGN-CONSTRAINTS.md) (naming: `bots/`).

## DM bot (`discord_dm_bot.py`) — PHASE-20 control plane

The DM bot runs as its own `bmo-dm-bot` systemd unit. Because Flask runs in a
*separate* process, `app.py`'s `/api/discord/dm/*` routes proxy to a loopback
control server in this process (`dm_bot_control.py`, `build_control_app` /
`start_control_server`).

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `DISCORD_DM_BOT_TOKEN` | — | bot token |
| `DISCORD_GUILD_ID` | — | scopes slash-command sync + voice to one guild |
| `DISCORD_DM_VOICE_CHANNEL` | `🗺️ \| Dungeon` | voice channel name to join |
| `DISCORD_DM_VOICE_CHANNEL_ID` | — | numeric voice channel ID (wins over name) |
| `DM_BOT_CONTROL_PORT` | `5006` | loopback control server port |
| `VTT_SYNC_URL` | — (empty) | VTT sync receiver, e.g. `http://10.0.0.5:5001`. **Empty/unset = Pi→VTT sync disabled** (no retry threads). |
| `VTT_SYNC_TOKEN` | — | bearer for the VTT receiver; falls back to `BMO_API_KEY`. Must equal the VTT app's `bmoApiKey`. |
| `KOKORO_TTS_URL` / `KOKORO_TTS_VOICE` / `PIPER_DM_MODEL` / `BMO_VOICE_CAST_PATH` | — | PHASE-21 TTS backend ladder + voice-cast store (see `services/discord_tts.py`, `voice_casting.py`). |
| `DISCORD_PBP_CHANNEL` | `play-by-post` | PHASE-36 play-by-post text channel NAME for turn pings |
| `DISCORD_PBP_CHANNEL_ID` | — | numeric play-by-post channel ID (wins over name) |
| `PBP_REMINDER_TICK_SECONDS` | `600` | PHASE-36 reminder-loop tick interval |
| `BMO_PBP_RATE_LIMIT` | `60 per minute` | rate limit on the `/api/discord/pbp/*` POST proxies |

### Narrate result vocabulary (`/control/narrate` → `result`)

- `queued` — accepted, will play in FIFO order.
- `duplicate` — a repeated `event_id`; not re-spoken (idempotent).
- `no_voice` — no/dropped voice connection (`ok:false`, HTTP 200 — do NOT retry).
- `dropped_queue_full` — the bounded (20) queue is full (`ok:false`, HTTP 200).

The HTTP status is always 200 for narrate; the `result` body is the truth channel
(a non-2xx would make the VTT retry and double-speak once the cooldown lapses).

### PHASE-22 sync plane

**Pi→VTT push events** (the bot calls `agents.vtt_sync` helpers; payloads match the
VTT's zod contract): `discord_message {text, author, characterName?}` (player text +
DM replies + session-end traces), `discord_roll {formula, total, rolls?, rollerName,
characterName?}`, `player_join`/`player_leave {playerName, characterName?}`. Each is a
no-op + dispatched off-thread when sync is disabled, and wrapped so a sync failure
never breaks the bot.

**VTT→Pi state** lands via `/control/sync/{initiative,state}` into `vtt_state`. Initiative
syncs render **one** live tracker message in the session text channel — edited (≥1s
spacing under a lock), not reposted. `/control/status.vtt_sync` surfaces config +
`last_push` + cached-state freshness without any network probe.

### PHASE-36 play-by-post (`bots/pbp.py`)

Async turn queue persisted to `~/home-lab/bmo/pi/data/pbp_sessions.json` (survives restarts;
delete to hard-reset). Pings whoever is up in the `DISCORD_PBP_CHANNEL`; a reminder loop sends
one nudge per turn at the configured cadence and an opt-in auto-skip at 2×.

**`/pbp` slash commands** (channel-scoped to the session's channel):

- `/pbp claim character:<name>` — link your Discord account to a participant so you get pinged
  (case-insensitive, matches name or character; first-match exact > startswith).
- `/pbp status` — public embed: scene, round, ordered queue (✅ claimed / ⬜ unclaimed, ▶ current).
- `/pbp done note:<optional>` — end YOUR turn (only the current claimant); advances + pings next.
- `/pbp skip` — **requires `manage_guild`**; skips the current turn.

**Advance result vocabulary** (`/control/pbp/advance` → `result`): `advanced` (turn moved, next pinged),
`duplicate` (repeated `event_id`, no-op), `stale_turn` (`expected_turn_index` mismatch — `ok:false`,
HTTP 200, the VTT must refresh). Mentions only ping from message **content**, so unclaimed players
appear as a bold name with no ping until they `/pbp claim`.

### Session-end reasons (`/control/status` → `last_session_end.reason`)

- `stopped` — `/dm stop` or the bridge stop.
- `auto_leave_empty` — the voice channel emptied for 30s (recap saved, memory closed).
