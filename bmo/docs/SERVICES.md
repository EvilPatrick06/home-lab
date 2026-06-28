# BMO Services

Service modules in `bmo/pi/services/` — business logic used by agents + Flask routes.

## Services index

### Voice + audio

> These modules live in the `services/voice/` subpackage (import as `services.voice.<module>`). File names are unchanged per the "Service module names" rule in [DESIGN-CONSTRAINTS.md](./DESIGN-CONSTRAINTS.md). The cluster is: `voice_pipeline`, `voice_personality`, `voice_casting`, `voice_metrics`, `voice_canary`, `bmo_say`, `discord_tts`, `audio_output_service`, `system_audio`.

| Module | Purpose |
|---|---|
| `voice_pipeline.py` | STT → agent invocation → TTS loop. Wake-word listens, triggers pipeline. |
| `voice_personality.py` | Persona injection — wraps responses with "BMO-ness". Owns `get_prosody()` (NPC archetype + emotion combine, clamped) + `normalize_emotion()` (VTT vocabulary ↔ legacy moods). |
| `bmo_say.py` | TTS dispatcher (Fish Audio primary, Piper fallback). |
| `audio_output_service.py` | Routes audio to HDMI, Bluetooth, or USB speakers. |
| `discord_tts.py` | DM-bot streaming TTS: `split_sentences()` (sentence-boundary chunking, regex fallback when `stream2sentence`/nltk-punkt are absent) + a backend ladder `synthesize_chunk()` — Kokoro-FastAPI (`KOKORO_TTS_URL`, opt-in LAN/GPU box) → local Piper (`PIPER_DM_MODEL`, libritts_r multi-speaker default, bmo-voice fallback) → Fish Audio cloud — and sox `apply_prosody()`. **bot-process only — uses blocking `requests`; must NOT be imported from gevent-patched `app.py`.** Env: `KOKORO_TTS_URL`, `KOKORO_TTS_VOICE`, `PIPER_DM_MODEL`. |
| `voice_casting.py` | Per-NPC voice casting: a `[SPEAKER:Name]` NPC gets a stable, distinct voice deterministically picked from a backend pool (Kokoro voice ids / Piper speaker ids), biased by archetype group, persisted per campaign in `voice_cast.json` (atomic write + mtime reload — shared by the bot and Flask processes). Stdlib-only (safe in either process). The DM lists/overrides/re-rolls via `/api/discord/dm/voices`. Env: `BMO_VOICE_CAST_PATH`. |

### Calendar + time (4)

| Module | Purpose |
|---|---|
| `calendar_service.py` | Google Calendar read/write via OAuth. |
| `authorize_calendar.py` | One-time OAuth authorization flow (run at setup). |
| `reauth_calendar.py` | Re-authorize after token expiration. |
| `timer_service.py` | Named timers + alarms. Persists to `data/alarms.json`. |

### External integrations (5)

| Module | Purpose |
|---|---|
| `weather_service.py` | Open-Meteo API + caching. Uses `location_service` for coords. |
| `location_service.py` | Geolocation polling (Google geocoding). Cached at `data/location_cache.json`. |
| `music_service.py` | YouTube Music (ytmusicapi) + VLC playback. Persists `data/{music_history,play_counts,playback_state}.json`. |
| `smart_home.py` | Chromecast discovery + control. |
| `tv_worker.py` | ADB subprocess wrapper for TV control (isolates ADB state from main process; TV routes in `app.py`). |

### Notifications + alerts (3)

| Module | Purpose |
|---|---|
| `notification_service.py` | Android notification ingestion + classification. |
| `alert_service.py` | User-facing alerts. Persists to `data/alert_history.json`. |
| `monitoring.py` | Service + hardware health checker. Alerts via Discord webhook. |

### Scenes + routines (3)

| Module | Purpose |
|---|---|
| `scene_service.py` | Scene triggers (morning, evening, party time, etc.) — LED + audio + TV composed. |
| `routine_service.py` | Cron-like scheduled tasks (daily briefing, etc.). |
| `list_service.py` | Generic list management (shopping, TODO). |

### D&D (4)

| Module | Purpose |
|---|---|
| `dnd_engine.py` | Dice roller, rules lookups, encounter-building helpers for `dnd_dm` agent. |
| `campaign_memory.py` | SQLite-backed long-term campaign memory. `data/campaign_memory.db`. |
| `game_registry.py` | In-memory directory of active multiplayer games (Phase 29f). Per-clientId banned-from-this-game flags, SSE subscriber queues, 30s GC tick / 60s TTL. Powers `/api/games*`. |
| `game_relay.py` | Socket.IO star-topology relay for dnd-app multiplayer (Phase 32) — opt-in alternative to the WebRTC mesh; the always-on Pi relays between DM/host and players. |

### AI / RAG (4)

| Module | Purpose |
|---|---|
| `cloud_providers.py` | LLM provider abstraction: Anthropic, Gemini, OpenAI, Groq. |
| `rag_search.py` | Retrieval over pre-built chunk indexes in `data/rag_data/`. |
| `build_rag_indexes.py` | Offline script to rebuild RAG indexes. |
| `personality_engine.py` | Injects personality from `data/personality/{quips,adventure_time_quotes}.json`. |

### Infrastructure (5)

| Module | Purpose |
|---|---|
| `bmo_logging.py` | Structured logging shim over stdlib `logging` — BMO defaults via `get_logger()`. |
| `face_state.py` | Unified BMO face state machine — single source of truth for the expression the OLED + web ambient face both render. |
| `settings_store.py` | Dotted-key get/set on `data/settings.json`; used by app routes (system_api) + agent volume handlers (PHASE-16). |
| `chat_history.py` | Chat persistence (recent-buffer + DnD session log) + speaker-tag normalization; used by chat/realtime blueprints + app startup (PHASE-16). |
| `system_audio.py` | PipeWire/`wpctl` system volume + mute helpers; used by `routes/system_api.py` volume routes + `routes/music_api.py` auto-unmute (PHASE-16). |

## Ports

| Port | Served by | Purpose |
|---|---|---|
| 5000 | `app.py` (Flask) | Main HTTP + WebSocket |
| 5001 | `ide_app/ide_app.py` | Embedded web IDE (optional) |
| 5002 | app.py (canary) | deploy-time boot check only (BMO_PORT/BMO_CANARY; see DEPLOY.md) |

BMO's services run inside the main Flask process on :5000. They share an `init_services()` lifecycle.

## HTTP endpoint map (partial)

Full map in source — use `grep "@app.route" bmo/pi/app.py` for current list.

### Meta

| Path | Method | Returns |
|---|---|---|
| `/health` | GET | `{"status":"ok"}` |
| `/api/health/full` | GET | Pi stats + service statuses |

### Chat / agents

| Path | Method | Purpose |
|---|---|---|
| `/api/chat` | POST (SSE) | Stream chat with agent router |
| `/api/agent/:name/invoke` | POST | Directly invoke one agent |

### Music

| Path | Method | Purpose |
|---|---|---|
| `/api/music/state` | GET | Current playback state |
| `/api/music/play` | POST | Play by track/search |
| `/api/music/pause` | POST | Pause |
| `/api/music/resume` | POST | Resume |
| `/api/music/skip` | POST | Next track |
| `/api/music/search` | GET `?q=...` | Search YT Music |

### Calendar

| Path | Method | Purpose |
|---|---|---|
| `/api/calendar/events` | GET `?days=7` | Upcoming events |
| `/api/calendar/create` | POST | Create event |

### Timers

| Path | Method | Purpose |
|---|---|---|
| `/api/timers` | GET | List active timers |
| `/api/timers` | POST | Create (body: `{"name":...,"duration_sec":...}`) |
| `/api/timers/:id` | DELETE | Cancel |

### Discord control (from VTT)

| Path | Method | Purpose |
|---|---|---|
| `/api/discord/dm/start` | POST | Start the D&D Discord DM session (also at `/api/v1/discord/dm/start`) |
| `/api/discord/dm/stop` | POST | End the session (also `/api/v1/…`) |
| `/api/discord/dm/status` | GET | Session/bot status incl. a `vtt_sync` block (also `/api/v1/…`) |
| `/api/discord/dm/narrate` | POST | Speak narration in the session VC (`/narrate/cancel` for barge-in; also `/api/v1/…`) |
| `/api/discord/dm/sync/initiative` | POST | PHASE-22: push VTT initiative into the bot (live embed) (also `/api/v1/…`) |
| `/api/discord/dm/sync/state` | POST | PHASE-22: push VTT game state into the bot (DM-prompt context) (also `/api/v1/…`) |

> **PHASE-20:** these four routes are **proxies**. The live bot runs in its own
> `bmo-dm-bot` systemd unit (a different process than Flask), so `app.py` forwards
> each call to a loopback **control server** inside the bot — `http://127.0.0.1:5006/control/{start,stop,narrate,status}`
> (`DM_BOT_CONTROL_PORT`, `bmo/pi/bots/dm_bot_control.py`). A `503 "DM bot not running"`
> now truthfully means the `bmo-dm-bot` process is down/unreachable (before PHASE-20
> the bridge was dead-by-topology and always returned 503/404). **No systemd change**
> — the control server lives inside the existing `bmo-dm-bot` unit; `setup-bmo.sh` is
> untouched. After pulling, restart **both** `bmo` and `bmo-dm-bot`.

> **PHASE-22 (sync plane, live):** the two `sync/*` routes are proxies to
> `:5006/control/sync/{initiative,state}`, which cache state in the **bot** process
> (`agents/vtt_sync.vtt_state`) and render a live, edited initiative embed in the
> session text channel. The bot also **pushes** Discord events back to the VTT
> (`agents/vtt_sync` push helpers — message/roll/join/leave/session-end), bearer-authed
> with `VTT_SYNC_TOKEN`; **`VTT_SYNC_URL` unset = Pi→VTT sync disabled** (no retry
> threads). `/control/status` exposes a read-only `vtt_sync` block (config + `last_push`
> + cached-state freshness) — never a blocking health probe. `register_sync_routes` and
> `scripts/apply_patch.py` were deleted. After pulling, restart **both** `bmo` and `bmo-dm-bot`.

#### Play-by-post (PHASE-36)

| Path | Method | Purpose |
|---|---|---|
| `/api/discord/pbp/start` | POST | Start an async turn queue + ping the first player (also `/api/v1/…`) |
| `/api/discord/pbp/advance` | POST | End the current turn → ping the next (idempotent via `event_id`) |
| `/api/discord/pbp/skip` | POST | Skip the current turn → ping the next |
| `/api/discord/pbp/scene` | POST | Reset the queue for a new scene (preserves claims) |
| `/api/discord/pbp/stop` | POST | End the session (idempotent) |
| `/api/discord/pbp/status` | GET | `?campaign_id=` → session snapshot + `overdue` |

> **PHASE-36:** same proxy topology as the DM-bot routes above — `app.py` forwards to
> `:5006/control/pbp/*` inside `bmo-dm-bot`. The turn queue is persisted to
> `~/home-lab/bmo/pi/data/pbp_sessions.json` (survives bot/service restarts; **safe to
> delete to hard-reset all queues**). A `PbpManager` reminder loop (every
> `PBP_REMINDER_TICK_SECONDS`, default 600 s) recomputes overdue-ness from disk and sends
> ONE reminder per turn, plus an opt-in auto-skip at 2× the cadence. Players self-register
> with `/pbp claim` so the bot can `<@mention>` them (mentions only ping from message
> *content*, so unclaimed players degrade to a named-but-unpinged line). PBP is **text-only**
> — it needs **no** active voice session. Advance is idempotent (`event_id`) + staleness-guarded
> (`expected_turn_index`). **No systemd change**; after pulling, restart **both** `bmo` and
> `bmo-dm-bot`.

### Game registry (Phase 29f — public LAN game discovery)

| Path | Method | Purpose |
|---|---|---|
| `/api/games[?client_id=…]` | GET | List active games; each entry annotated with `banned_from_this_game` for the given clientId |
| `/api/games` | POST | Register or replace an entry (rate-limited 30/min, 4 KB body cap) |
| `/api/games/<code>` | PATCH | Merge a patch onto an existing entry (typically player/spectator counts) |
| `/api/games/<code>` | DELETE | Deregister |
| `/api/games/<code>/heartbeat` | POST | Refresh the 60 s entry TTL (hosts ping every 30 s) |
| `/api/games/stream[?client_id=…]` | GET (SSE) | Live stream — initial `games:full` snapshot then `games:added` / `games:updated` / `games:removed` events |

All `/api/games*` responses carry `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Methods` + `Access-Control-Allow-Headers` so the Electron renderer's `file://` origin can fetch them. OPTIONS preflights are short-circuited with a 204 in `_bmo_optional_api_key`. Optional `BMO_REGISTRY_API_KEY` env enforces an `X-Registry-Key` header on announce / patch / delete / heartbeat (the GET + stream routes stay open).

### Cloud backup — D&D VTT (`routes/rclone_api.py`)

The dnd-app can't hold Google Drive credentials, so campaign backups go through the Pi's `gdrive:` rclone remote (separate `DND-VTT-Backups/` folder from BMO's own 3 AM backup).

| Path | Method | Purpose |
|---|---|---|
| `/api/rclone/status` | GET | `{configured, remotes, version, error}` — drives the app's "Check Status" button |
| `/api/rclone/list` | GET | `{ok, campaigns:[{id,size,modified}]}` from `rclone lsjson` of the backup folder |
| `/api/rclone/backup` | POST (multipart) | Stage the uploaded `archive` (a campaign `.tar.gz`) → `rclone copyto gdrive:DND-VTT-Backups/<campaign_id>/campaign.tar.gz` |
| `/api/rclone/restore` | GET `?campaignId=` | `rclone copyto` from the remote → stream the archive back to the app |

Safety: rclone runs with a FIXED argv (no shell); `campaign_id` is slug-validated (rejects path traversal); the upload body cap is raised for `/backup` only (`BMO_MAX_BACKUP_SIZE`, default 512 MiB) via Werkzeug 3.1 per-request `max_content_length`, leaving the app-wide 32 MiB guard intact. ACAO + OPTIONS preflight wired like `/api/games`. LAN-open; off-LAN gated by the Cloudflare Access service token. Tests: `tests/test_rclone_api.py` (injected fake rclone runner).

### Cloud accounts + per-user sync — D&D VTT (`routes/auth_api.py`, `routes/sync_api.py`)

Discord-OAuth login + a per-user, per-entity cloud sync that supersedes the single-folder rclone backup (which stays for signed-out users). Identity is a JWT signed with the Flask `SECRET_KEY`; the user id is always derived from the verified token, never the request, so users are isolated. The Pi is the hot sync hub (`data/sync/<discord_id>/` blobs + `data/sync/manifest.db`), mirrored to `gdrive:DND-VTT-Accounts/<discord_id>/` via a debounced `rclone sync` (`services/sync_mirror.py`).

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/status` | GET | none | `{configured}` — is Discord OAuth set up on the Pi |
| `/api/auth/discord/start?return_to=` | GET | none (rate-limited) | 302 → Discord authorize (signed `state`; `return_to` allowlisted) |
| `/api/auth/discord/callback?code&state` | GET | none (rate-limited) | exchange code → mint JWT → deliver to client (web: URL `#token`, desktop loopback: `?token`) |
| `/api/auth/logout` | POST | bearer | revoke the session (`sessions.revoked`) |
| `/api/account/me` | GET | bearer | profile + quota/usage |
| `/api/sync/manifest` | GET | bearer | `{objects:[{domain,id,hash,version,mtime,size,deleted}]}` |
| `/api/sync/object?domain=&id=` | GET | bearer | the entity blob (octet-stream) + `X-Sync-*` headers |
| `/api/sync/object` | POST (multipart) | bearer | store a blob — last-writer-wins by `version`; per-entity size + per-user quota |
| `/api/sync/object?domain=&id=&version=` | DELETE | bearer | tombstone the entity |

Services: `services/jwt_util.py` (mint/verify HS256), `services/accounts.py` (`data/accounts.db` users+sessions), `services/auth_guard.py` (`require_user`), `services/sync_store.py` (manifest + on-disk blobs, LWW), `services/sync_mirror.py` (debounced rclone mirror). Off-LAN these paths are CF-Access **bypass** at the edge (browsers carry no CF creds) and gated instead by the app JWT — KEEP `/api/auth`, `/api/account`, `/api/sync` in lockstep with `app.py`'s key-gate exemptions + the CF Access bypass app. Env: `DISCORD_OAUTH_CLIENT_ID` / `DISCORD_OAUTH_CLIENT_SECRET` / `DISCORD_OAUTH_REDIRECT_URI`. Tests: `tests/test_auth.py`, `tests/test_sync.py`.

### Bundled sounds — D&D VTT audio offload (`routes/sounds_api.py`)

The dnd-app prefers Pi-hosted copies of its ~130 bundled MP3s when reachable (bundled fallback otherwise), to keep the installer thin. Served read-only from the monorepo's `dnd-app/src/renderer/public/sounds/`.

| Path | Method | Purpose |
|---|---|---|
| `/api/sounds/manifest` | GET | `{version, files:{"<rel>":{size}}}` — `<rel>` omits the leading `sounds/` (e.g. `dice/d20-1.mp3`), matching the client's `mapSoundPathToRel` |
| `/api/sounds/file?path=<rel>` | GET | Raw audio bytes (path-jailed under the sound dir; `Content-Type: audio/mpeg`) |

ACAO + OPTIONS preflight wired like `/api/games`. Tests: `tests/test_sounds_api.py` (fixture sound dir).

The Pi also advertises `_bmo._tcp` (port 5000) via `/etc/avahi/services/bmo.service` — the dnd-app's main process browses it with `bonjour-service` and emits a `BMO_RESOLVED_URL` IPC event to the renderer so the user never has to type the Pi URL into Settings.

### IDE

| Path | Method | Purpose |
|---|---|---|
| `/ide` | GET | Render IDE UI |
| `/api/ide/*` | various | IDE job management (runs on :5001 primarily) |

### System / settings

| Path | Method | Purpose |
|---|---|---|
| `/api/settings` | GET | Read settings.json |
| `/api/settings` | POST | Write settings.json |
| `/api/system/wifi` | GET | Wifi status |
| `/api/system/restart` | POST | Restart a systemd service |

## WebSocket events (SocketIO)

Emit from server → client:

| Event | Payload | When |
|---|---|---|
| `voice_state` | `{"state":"listening"|"processing"|"speaking"}` | Voice pipeline state change |
| `music_state` | `{"state":"playing|paused|stopped", "track":{...}}` | Music state change |
| `weather_update` | `{...}` | New weather data |
| `notification` | `{"title","body","priority"}` | New alert |
| `agent_response` | `{"agent","text","delta"}` | Agent streaming chunk |

Client → server:

| Event | Payload | Purpose |
|---|---|---|
| `chat_message` | `{"text"}` | Send text to agent |
| `voice_start` | `{}` | Manual voice trigger (for devices without wake-word) |
| `request_state` | `{"service"}` | Ask for current state |

## Flask config

```python
app = Flask(__name__, template_folder="web/templates", static_folder="web/static")
```

Templates at `bmo/pi/web/templates/*.html`. Static at `bmo/pi/web/static/`. If you add a new `render_template("foo.html")`, create `bmo/pi/web/templates/foo.html`.

## Adding a new service

1. Create `bmo/pi/services/my_service.py`
2. Initialize in `app.py:init_services()`:
   ```python
   try:
       from services.my_service import MyService
       my_service = MyService(socketio=socketio)
       service_map["my_service"] = my_service
       print("[bmo]   MyService: OK")
   except Exception as e:
       print(f"[bmo]   MyService: SKIPPED ({e})")
   ```
3. Add HTTP routes if needed in `app.py`
4. Add test in `bmo/pi/tests/test_my_service.py`
5. Document above
6. Restart BMO

## Discord bots — intents and least privilege

Two bots live under `bmo/pi/bots/`. Tokens stay in `bmo/pi/.env` (never commit). For **Discord Developer Portal → Bot → Privileged Gateway Intents**, only enable what the code uses:

| Intent | DM bot | Social bot | Rationale |
|--------|--------|------------|------------|
| **Message Content** | On | On | `intents.message_content = True` — read messages for commands/chat |
| **Server Members** | On | On | `intents.members = True` — voice/DM user resolution |
| **Presence** | Off | On | Only social has `intents.presences = True` (activity features) |
| **Voice** | On | On | `intents.voice_states = True` for voice channels |

When generating invite URLs, do **not** use Administrator; add only scopes the bots need (e.g. `applications.commands`, `bot` with `Send Messages`, `Embed Links`, `Read Message History`, `Connect`/`Speak` for voice, `Use Slash Commands`). Re-audit the portal after Python intent changes.

## Debugging services

```bash
# Which services initialized successfully?
journalctl -u bmo --since "5 min ago" --no-pager | grep -E "\[bmo\].*:\s+(OK|SKIPPED)"

# Failing service? Get full traceback
journalctl -u bmo -f
# Then in another terminal: send a request that exercises that service
curl http://localhost:5000/api/<service>/state
```

## Example routines

The routine engine ships no routines on a fresh install. Say "create example routines" (or call `RoutineService.seed_examples()`) to add three **disabled** starter templates — Morning Briefing (calendar + weather on a weekday 07:30 cron / voice), Good Night (bedtime scene + music stop), and Leaving Home (away scene + music stop). Enable one with "enable <name> routine".
