# PHASE-22 — Discord sync plane (finish the bidirectional VTT ↔ Discord state/event channel)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Finish the bidirectional VTT↔Discord sync plane that today is dead at every end, and wire the separate "Push to Discord" text-narration feature the settings UI already promises. The decision is **finish, not delete**: the VTT-side sync receiver is already fully hardened and tested (rate limit, body cap, zod validation, eventId dedup, bearer auth — built in Phase 28a/28c), PHASE-36 (async play-by-post) builds directly on this plane, and the scope allocation enumerates the finish items. This phase delivers: (1) the Pi push helpers actually called by the Discord bot with payloads that match the VTT's zod contract and a bearer token the receiver accepts; (2) VTT→Pi state sync routed through the PHASE-20 control plane so the bot process (not the wrong Flask process) caches and consumes `vtt_state` — including a live initiative embed in the session text channel; (3) preload exposure + renderer listeners for the Pi→VTT events that currently die unobserved at the renderer boundary, with an activity feed and honest unreachable alerts; (4) a renderer push path (opt-in, default OFF) that sends initiative/game-state to Discord; (5) `sendNarrationToDiscord` wired into the AI reply pipeline (gated by the integration's own enabled flag, default OFF) with voice/ruling tags stripped; and (6) removal of the `apply_patch.py` source-editing scaffolding and the wrong-process `register_sync_routes`.

## Dependencies & cross-phase notes

- **Depends on: PHASE-20** (`discord-bridge-foundation`). PHASE-20 creates `bmo/pi/bots/dm_bot_control.py` (aiohttp control server on loopback `:5006` inside the `bmo-dm-bot` process) and rewrites the four Flask `/api/discord/dm/*` routes in `bmo/pi/app.py` as proxies to it. Sub-phase 22B adds two more control routes + two more proxies in exactly that pattern. PHASE-20 also adds `DiscordSessionSection.tsx` (DM-tab session UI) which 22E extends, fixes 4xx-vs-unreachable counting in `bmoPiFetch`, and establishes the corrected preload listener pattern (wrapped listener + returned unsubscribe). **Verify PHASE-20's Completed section before starting; line numbers in PHASE-20-touched files will have shifted — locate by symbol/grep, not by line.**
- **Coordinate with PHASE-21** (`discord-voice-quality`): it rewrites `_speak`/TTS in `bmo/pi/bots/discord_dm_bot.py`. This phase touches the same file but only event handlers (`on_message`, `on_voice_state_update`, `_handle_player_input`, `_roll_cmd`, `_auto_leave_if_empty`) and `setup_hook` — no TTS code. PHASE-21 runs before this phase (numeric order).
- **Coordinate with PHASE-16** (`bmo-blueprint-refactor`): it splits `bmo/pi/app.py` into blueprints (calendar/music/tv/chat/system/realtime). The Discord DM routes are not in its list, but locate them by `grep -n "discord/dm" bmo/pi/app.py` at execution time in case they moved.
- **Coordinate with PHASE-05** (preload listener lifecycle): all new `on*` preload listeners added here MUST use the corrected pattern (wrap the callback, return an unsubscribe that removes exactly that listener). The legacy no-unsubscribe pattern is visible at `dnd-app/src/preload/index.ts:177-211` — do not copy it.
- **Coordinate with PHASE-12** (i18n sweep): every new UI string lands in BOTH `en.json` and `es.json`, then `npm run i18n:gen-keys`.
- **Coordinate with PHASE-08**: it deletes the dead `ai-stream-handler.ts`/`finalizeAiResponse` duplicate pipeline (whose copy also "sends narration"). By this phase it should be gone — verify with `grep -rn "finalizeAiResponse" dnd-app/src` (must be empty) so 22F's single wiring point in `ai-service.ts` stays the only one.
- **PHASE-36** (`async-play-by-post`) consumes this plane: keep `SyncEvent` types/payloads stable and documented (22G) — it will add the "Discord message → AI turn" path that this phase deliberately does NOT add (renderer consumption here is display-only).
- **PHASE-13** owns campaignId path-sanitization in AI IPC handlers; nothing here writes campaign-scoped files.

## Verified findings

All claims below verified 2026-06-10 against the live tree. The audit file this phase absorbed is deleted; this section is self-contained.

### F1 — VTT→Pi push: renderer end is unwired (channels + handlers exist, no preload, no caller)

`IPC_CHANNELS.BMO_SYNC_INITIATIVE`/`BMO_SYNC_SEND_STATE` exist (`dnd-app/src/shared/ipc-channels.ts:211-212`; the full BMO block is `:204-212` with `BMO_SYNC_EVENT` at `:210`). Main-process handlers exist (`dnd-app/src/main/ipc/bmo-sync-handlers.ts:18-39`, registered from `src/main/ipc/index.ts:239`, which also calls `startSyncReceiver()` at module registration, `bmo-sync-handlers.ts:15`). They call `sendInitiativeToPi` (`dnd-app/src/main/bmo-bridge.ts:185-196`, POSTs `/api/discord/dm/sync/initiative`) and `sendGameStateToPi` (`:197-210`, POSTs `/api/discord/dm/sync/state`). But the preload (`dnd-app/src/preload/index.ts:505-510` — the "BMO Pi Bridge" block exposes only `bmoStartDm`/`bmoStopDm`/`bmoNarrate`/`bmoDmStatus`) exposes neither channel, and no renderer caller exists. Initiative/state are never pushed.

The renderer-side initiative shape maps 1:1 onto the wire shape: `InitiativeState { entries, currentIndex, round }` with `InitiativeEntry { entityName, entityType: 'player'|'npc'|'enemy', isActive, total, ... }` (`dnd-app/src/renderer/src/types/game-state.ts:61-79`), held at `useGameStore.initiative` (`stores/game/types.ts:52`, slice in `stores/game/initiative-slice.ts`).

```bash
grep -n "BMO_SYNC" dnd-app/src/shared/ipc-channels.ts                       # 210-212
grep -rn "bmoSyncInitiative\|BMO_SYNC_INITIATIVE\|BMO_SYNC_SEND_STATE" dnd-app/src --include="*.ts*" | grep -v test
# → only bmo-sync-handlers.ts + ipc-channels.ts (no preload, no renderer)
sed -n '61,79p' dnd-app/src/renderer/src/types/game-state.ts
```

### F2 — VTT→Pi push: Pi end is unregistered, and registering it in Flask would be the wrong process anyway

`register_sync_routes(app)` (`bmo/pi/agents/vtt_sync.py:87-137`) defines `/api/discord/dm/sync/initiative` (`:123`) + `/api/discord/dm/sync/state` (`:129`), but `bmo/pi/app.py` never calls it — the name appears only in the module docstring and in `bmo/pi/scripts/apply_patch.py`. The routes 404 today. Critically, even if registered, the routes would update the module-global `vtt_state` (`vtt_sync.py:84`) **in the Flask (`bmo`) process**, while the Discord bot runs in the separate `bmo-dm-bot` systemd unit (`bmo/setup-bmo.sh:223` = Flask `app.py`; `:312` = `python -m bots.discord_dm_bot`) — the same process-split that killed the PHASE-20 bridge. The fix must route VTT state into the **bot** process (22B), so `register_sync_routes` is deleted, not registered.

```bash
grep -rn "register_sync_routes" bmo/pi --include="*.py" | grep -v agents/vtt_sync.py
# → only scripts/apply_patch.py (and nothing in app.py)
grep -n "ExecStart" bmo/setup-bmo.sh    # 223 bmo (app.py), 312 bmo-dm-bot (-m bots.discord_dm_bot)
```

### F3 — Pi→VTT push: the one live caller's payload FAILS the receiver's zod schema (correction to the audit)

The audit said Discord DM replies "reach the VTT main process and are silently dropped" at the renderer boundary. **Reality is worse: they are rejected with HTTP 400 at the receiver's zod validation, before any forwarding.** `bmo/pi/agents/dnd_dm.py:81` calls `push_discord_message('DM', reply[:2000])`; `push_discord_message` (`vtt_sync.py:174-186`) sends payload `{"username", "content", "characterName"}` — but the receiver validates `/api/sync` bodies against `SyncEventSchema` (`dnd-app/src/main/bmo-bridge.ts:386-389`), whose `discord_message` member requires a `text` field (`DiscordMessagePayloadSchema`, `dnd-app/src/shared/ipc-schemas.ts:98-105`: `text` required, `author`/`channelId`/`system` optional, `.loose()`). `username`/`content` do not satisfy it → `safeParse` fails → 400 `invalid payload` → `_send_with_retry` (`vtt_sync.py:140-159`) sees non-200, retries 4×, drops. Same mismatch for rolls: `push_discord_roll` (`:189-205`) sends `{username, expression, result, characterName}` but `DiscordRollPayloadSchema` (`ipc-schemas.ts:107-115`) requires `formula` (string) + `total` (number). `push_player_join`/`push_player_leave` (`:208-223`) send `{username}` which passes `PlayerJoinLeavePayloadSchema` (`ipc-schemas.ts:117-123`, all-optional `.loose()`) but leaves `playerName` unset. Fix direction: the zod schemas are the hardened, tested contract (`dnd-app/src/main/bmo-bridge.test.ts:68-244` covers them) — adapt the Pi sender (22A).

```bash
sed -n '174,223p' bmo/pi/agents/vtt_sync.py        # payload keys: username/content/expression/result
sed -n '98,123p' dnd-app/src/shared/ipc-schemas.ts # required keys: text / formula+total
grep -n "push_discord_message" bmo/pi/agents/dnd_dm.py   # 15 (import), 81 (call)
```

Also: `dnd_dm.py:81` pushes the **raw** reply before `self._parse_gamestate(reply)` (`:86`) strips the ` ```gamestate ` block — the VTT would receive internal state JSON in the message text.

### F4 — Pi→VTT push: events that pass validation die at the renderer boundary; channel double-use; lying unreachable toast

`forwardToRenderer()` (`bmo-bridge.ts:254-259`) sends validated events to all windows on `IPC_CHANNELS.BMO_SYNC_EVENT` (`/api/sync` → `:400`; `state_request` GET → `:327-333`) and `IPC_CHANNELS.BMO_SYNC_INITIATIVE` (`/api/sync/initiative` → `:412`). **Zero `ipcRenderer.on` listeners exist for either channel** (grep across `src/preload` + renderer is empty), so every event is discarded. Two side problems: (a) `'bmo:sync-initiative'` is double-used — it is the renderer→main **invoke** channel (`bmo-sync-handlers.ts:18`) AND the main→renderer **send** channel (`bmo-bridge.ts:412`); (b) `notifyBmoUnreachable()` (`bmo-bridge.ts:71-80`, fired from `bmoPiFetch` at `:156` after 3 consecutive failures) fabricates a `discord_message` sync event with payload `{system: true, text: 'BMO unreachable — Discord sync paused'}` — never displayed (dead channel), and the wording lies (nothing pauses; retries continue).

```bash
grep -rn "bmo:sync-event\|BMO_SYNC_EVENT" dnd-app/src/preload dnd-app/src/renderer  # → empty
sed -n '71,80p;254,259p;400p;412p' dnd-app/src/main/bmo-bridge.ts
```

### F5 — The bot itself never calls the push helpers

`push_discord_roll`, `push_player_join`, `push_player_leave`, `request_vtt_state` (`vtt_sync.py:226-235`), and `check_vtt_health` (`:238-245`) have **zero callers**. `push_discord_message` is called only by the Pi-kiosk voice DM agent (`dnd_dm.py:81`). `bmo/pi/bots/discord_dm_bot.py` imports nothing from `vtt_sync`, even though its handlers produce exactly the events the receiver consumes: `on_voice_state_update` tracks joins/leaves (`discord_dm_bot.py:636-661`), `on_message` handles player text (`:663-687`), `_handle_player_input` produces DM replies (`:690-760`, response logged at `:748-749`), `_roll_cmd` logs rolls (`:898-945`, session log at `:940-945`), `_auto_leave_if_empty` ends sessions (`:877-891`). (PHASE-20 reworks `_auto_leave_if_empty` and `_roll_cmd` — re-locate by symbol at execution.)

```bash
grep -rn "from agents.vtt_sync import\|import vtt_sync" bmo/pi --include="*.py" | grep -v tests
# → only agents/dnd_dm.py:15
grep -rn "push_discord_roll\|push_player_join\|push_player_leave\|request_vtt_state\|check_vtt_health" bmo/pi --include="*.py" | grep -v agents/vtt_sync.py | grep -v tests
# → empty
```

### F6 — Bind + bearer: defaults can't connect, and the auth contract is one-sided

The VTT sync receiver binds `127.0.0.1` unless `BMO_SYNC_BIND` is set (`bmo-bridge.ts:20-21`, listen at `:427-428`), so a Pi pushing to the default `VTT_SYNC_URL=http://vtt.local:5001` (`vtt_sync.py:30`; also `bmo/.env.template:65`) gets connection-refused — every event costs 4 attempts × 5s timeout on a daemon thread (`vtt_sync.py:31,36,140-159`). There is no startup validation/log of the resolved target on the Pi side. The receiver enforces `Authorization: Bearer <key>` when a key is configured (`bmo-bridge.ts:352-359`; key resolution `getBmoApiKey()` = `process.env.BMO_API_KEY` → user settings, `dnd-app/src/main/bmo-config.ts:90-95`), but `_send_with_retry` sends **no Authorization header at all** (`vtt_sync.py:140-159` — zero `Authorization` occurrences in the file) → with a key set, every POST 401s. Additional discovery beyond the audit: `applyBmoApiKeyFromSettings` (`bmo-config.ts:97-105`) has **zero production callers** (only its own test, `bmo-config.test.ts`) — the settings half of the key resolution is dead plumbing; only the env var works today. The Pi side has a matching shared-secret concept already: `BMO_API_KEY` in `bmo/pi/app.py:259` (the Pi's own front-door bearer gate, `:292-320`), so the same secret can serve both directions.

```bash
sed -n '20,21p;352,359p' dnd-app/src/main/bmo-bridge.ts
grep -n "Authorization" bmo/pi/agents/vtt_sync.py        # → empty
grep -rn "applyBmoApiKeyFromSettings" dnd-app/src --include="*.ts" | grep -v bmo-config
# → only bmo-config.test.ts
```

### F7 — `vtt_state` is never read by the bot; `apply_patch.py` is in-place source-editing scaffolding

`vtt_state` (`VTTState` cache with `update_initiative`/`update_game_state`/`format_initiative_embed`, `vtt_sync.py:40-84`) has no consumer — `discord_dm_bot.py` does not import the module, so cached initiative/state could never display in Discord. `bmo/pi/scripts/apply_patch.py` is a deploy script that rewrites checked-in `app.py` and `dnd_dm.py` **in place** on the Pi (string-replace patching, `apply_patch.py:11-29` for app.py, `:36-58` for dnd_dm.py); its dnd_dm half already landed in source (the import/call exist at `dnd_dm.py:15,81`), its app.py half never ran. It is a repo-vs-deployed drift hazard and must be deleted (its one referenced doc line: `bmo/pi/README.md:105`).

```bash
grep -rn "apply_patch" bmo --include="*.py" --include="*.md" --include="*.sh" -r | grep -v scripts/apply_patch.py
# → only bmo/pi/README.md:105
```

### F8 — "Push to Discord" TEXT narration never fires automatically; tag-stripping gap

`sendNarrationToDiscord` (`dnd-app/src/main/discord-integration/discord-service.ts:276-322`) is reachable only via the `DISCORD_SEND_MESSAGE` IPC handler (`src/main/ipc/discord-handlers.ts:68-77`; channel `ipc-channels.ts:245`; preload `discord.sendMessage` at `preload/index.ts:524-525`) — and **zero renderer call sites exist** (the settings UI only calls `testConnection`, `DiscordIntegrationSettings.tsx:110`). It is never called from the AI pipeline: `ai-service.ts:908-915` deliberately sends voice-only narration with the comment "NO Discord TEXT — the narration text stays only in the in-game chat". Yet the settings UI promises otherwise: `en.json:6890` `ui.discordIntegration.infoBox` = "AI DM narration will be sent to Discord after each response. Technical metadata like [DM_ACTIONS] and [STAT_CHANGES] is automatically filtered out." (the audit quoted older text "AI narration will appear here when the DM responds" — the current string differs but is equally false today). The integration is fully opt-in: `sendNarrationToDiscord` returns early unless `config.enabled` (`discord-service.ts:283-285`), and config defaults to disabled. Tag gap: `cleanTextForDiscord` (`:236-260`) strips `[DM_ACTIONS]`/`[STAT_CHANGES]`/`[RULE_CITATION]`/`[FILE_READ]`/`[WEB_SEARCH]`/`[PROVIDER_CONTEXT]` but NOT `[NPC:…]`/`[EMOTION:…]` voice tags (regexes in `src/main/ai/ai-response-parser.ts:38-54`) nor `[RULING …]…[/RULING]` blocks. The finalized `displayText` in `ai-service.ts` (`:879` — built with `stripVoiceTags(stripRulings(...))`) is already clean, so wiring with `displayText` is safe, but `cleanTextForDiscord` should strip them anyway as defense for other callers. Campaign name for the webhook username is available in main via `loadCampaignById` (`src/main/ai/campaign-context.ts:3-9`; `campaign.name` used at `:15`).

```bash
grep -rn "sendNarrationToDiscord\|DISCORD_SEND_MESSAGE" dnd-app/src --include="*.ts*" | grep -v test
# → discord-service.ts, discord-handlers.ts, preload, ipc-channels — no renderer caller, no ai-service caller
grep -n "NPC\|EMOTION\|RULING" dnd-app/src/main/discord-integration/discord-service.ts   # → empty
sed -n '908,915p' dnd-app/src/main/ai/ai-service.ts
```

### F9 — Existing infrastructure to build on (verified)

- Receiver hardening is done and tested: rate limit 60/min/IP, 64KB body cap, Content-Type check, bearer auth, zod validation, eventId dedup (bounded 500), loopback bind — `bmo-bridge.ts:291-433`, tests `bmo-bridge.test.ts:68-244`.
- Pi-side eventId stamping + bounded retry already exist (`vtt_sync.py:161-171`: stable uuid4 per event, reused across retries; `_send_with_retry` 4 attempts, backoff 0.5/1.5/3.0s) with tests `bmo/pi/tests/agents/test_vtt_sync.py`.
- `_post_to_vtt` dispatches on a daemon `threading.Thread` (`vtt_sync.py:170`) — non-blocking from the caller's perspective in both the gevent Flask process and the bot's asyncio process (real OS thread; `requests` blocks only that thread). `request_vtt_state`/`check_vtt_health` are **synchronous blocking** calls (`:226-245`) — in the bot they must go through `asyncio.to_thread`.
- Renderer alert plumbing: `pushDmAlert(severity, text)` from `components/game/overlays/DmAlertTray` (used in `hooks/use-game-effects.ts:63,119,152`).
- Store-subscribe + debounce model for pushing state from the renderer: `hooks/use-ai-memory-sync.ts:94-110` (plain `useGameStore.subscribe` with manual prev-value diffing + debounce timer) — copy this pattern.
- Hook mount point: `GameLayout.tsx:503` (`useGameEffects(...)`).
- Settings storage: `AppSettingsSchema` is `.passthrough()` (`src/main/storage/settings-storage.ts:11-41`); `applyBmoBaseUrlFromSettings` is applied at startup (`src/main/index.ts:352`) and on save (`src/main/ipc/storage-handlers.ts:299`) — the two call sites where the API-key + bind settings get wired in 22D.
- Settings UI section: `SettingsPage.tsx:1884-1887` renders `<DiscordIntegrationSettings />`.
- Pi tests are hardware-free (`bmo/pi/tests/conftest.py` mocks; `pytest.ini` `asyncio_mode = auto`); `tests/test_app_endpoints.py` and `tests/agents/test_vtt_sync.py` exist; PHASE-20 adds `tests/test_dm_bot_control.py`.

## Sub-phases

Order: Pi contract fixes first (22A-22C, pytest-checkable; the Pi targets the VTT's EXISTING schema, so nothing breaks while dnd-app work lands later), then dnd-app (22D-22F), docs last (22G).

### 22A — Pi: `vtt_sync` contract + config truth (payload shapes, bearer, URL gating, scaffolding removal)

**Objective:** make every Pi→VTT push schema-valid (F3), authenticated (F6), and configuration-honest (F6); delete the wrong-process route registration (F2) and `apply_patch.py` (F7).

**Files:** `bmo/pi/agents/vtt_sync.py`, `bmo/pi/agents/dnd_dm.py`, `bmo/pi/tests/agents/test_vtt_sync.py`, `bmo/.env.template`, `bmo/pi/scripts/apply_patch.py` (delete), `bmo/pi/README.md`.

**Steps:**
1. Config block rework (`vtt_sync.py:30-36`):
   ```python
   VTT_SYNC_URL = (os.environ.get("VTT_SYNC_URL") or "").strip().rstrip("/")
   VTT_SYNC_TOKEN = (os.environ.get("VTT_SYNC_TOKEN") or os.environ.get("BMO_API_KEY") or "").strip()
   ```
   No more `vtt.local` fallback: when `VTT_SYNC_URL` is empty, `sync_enabled()` returns False and `_post_to_vtt`/`request_vtt_state`/`check_vtt_health` are no-ops that log ONCE ("VTT sync disabled — VTT_SYNC_URL not set") via a module-level `_disabled_logged` flag. This kills the doomed 4×5s retry threads for unconfigured deployments. Add `def validate_sync_config() -> dict` returning `{"enabled", "url", "auth": bool(VTT_SYNC_TOKEN)}` and logging the resolved target — called from the bot at startup (22B) and usable from a REPL.
2. Bearer auth (`_send_with_retry`, `:140-159`): build `headers = {"Authorization": f"Bearer {VTT_SYNC_TOKEN}"} if VTT_SYNC_TOKEN else {}` and pass to both `requests.post(...)` here and the two `requests.get(...)` calls (`:226-245`).
3. Last-push observability (for 22B's status surfacing, no blocking health probes): module-level `last_push: dict = {"ok": None, "at": None, "url": None, "status": None}` updated inside `_send_with_retry` on final success/failure (thread-safe enough under the GIL for a read-only status consumer; document that).
4. Payload alignment to the VTT zod contract (F3) — keep function signatures, change wire keys:
   - `push_discord_message(username, content, character_name=None)` → payload `{"text": content, "author": username, "characterName": character_name}`.
   - `push_discord_roll(username, roll_expression, result, character_name=None)` → payload `{"formula": roll_expression, "total": result, "rollerName": username, "characterName": character_name}`. Add optional `rolls: list[int] | None = None` parameter → `"rolls"` key when provided.
   - `push_player_join(username, character_name=None)` / `push_player_leave(username)` → payload `{"playerName": username, "characterName": character_name}` / `{"playerName": username}`.
   (`.loose()` schemas accept the extra `characterName`; required keys now match `ipc-schemas.ts:98-123`.)
5. Delete `register_sync_routes` and its inner `_parse_json` (`vtt_sync.py:87-137`) — superseded by 22B's control-plane routes. KEEP `VTTState`, `vtt_state`, and `format_initiative_embed` (`:40-84`) — 22B consumes them in the bot process. Update the module docstring (it still describes the patch-deploy workflow).
6. `dnd_dm.py`: move the `push_discord_message('DM', reply[:2000])` call (`:81-84`) to AFTER `reply = self._parse_gamestate(reply)` (`:86`) so the VTT never receives raw ` ```gamestate ` blocks; keep the try/except wrapper.
7. Delete `bmo/pi/scripts/apply_patch.py`; remove its line from `bmo/pi/README.md` (`:105`).
8. `bmo/.env.template`: update the `VTT_SYNC_URL` entry (`:65`) — note that empty/unset disables Pi→VTT sync; add `VTT_SYNC_TOKEN` (documented as "must equal the VTT's BMO_API_KEY; falls back to this file's BMO_API_KEY").
9. Tests (`tests/agents/test_vtt_sync.py` — extend, keep existing retry/eventId cases green; they monkeypatch `vtt_sync.requests.post`): bearer header present when token set / absent otherwise; pushes are no-ops (no `requests.post`, no thread) when `VTT_SYNC_URL` empty; new payload keys for all four push helpers; `last_push` updated on success and exhaustion; `validate_sync_config` shape. Use `monkeypatch.setattr(vtt_sync, "VTT_SYNC_URL", ...)`/`(vtt_sync, "VTT_SYNC_TOKEN", ...)` for config.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/agents/test_vtt_sync.py -q && python -c "import ast; ast.parse(open('agents/vtt_sync.py').read()); ast.parse(open('agents/dnd_dm.py').read())"`.

**Acceptance:** every push helper emits a schema-valid payload with a bearer token when configured; unset `VTT_SYNC_URL` produces zero network attempts; `register_sync_routes` and `apply_patch.py` no longer exist anywhere in the repo (`grep -rn "register_sync_routes\|apply_patch" bmo/` → empty except git history).

### 22B — Pi: VTT→Pi state sync through the control plane + `vtt_state` consumption

**Objective:** give the VTT→Pi direction a live landing zone in the BOT process (F2), and make the cached state actually do something in Discord (F7): a live initiative embed and AI-context injection.

**Files:** `bmo/pi/bots/dm_bot_control.py` (PHASE-20 deliverable — extend), `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/app.py`, `bmo/pi/tests/test_dm_bot_control.py`, `bmo/pi/tests/test_app_endpoints.py`.

**Steps:**
1. Control routes (in `dm_bot_control.py`, same `web.Application` PHASE-20 built; import per repo rule `from agents.vtt_sync import vtt_state, validate_sync_config`):
   - `POST /control/sync/initiative` — body = the VTT initiative shape (`{entries:[{entityName,entityType,isActive}], currentIndex, round}`). Call `vtt_state.update_initiative(body)`; then if `bot.session.active` and `bot.session.text_channel_id`, schedule `asyncio.create_task(bot.post_initiative_embed())` (step 3). Return `{ok: true}`.
   - `POST /control/sync/state` — body = the condensed game-state shape (`{mapName?, ambientLight?, activeCreatures?, partyHp?}`). `vtt_state.update_game_state(body)`. Return `{ok: true}`.
   - Extend `GET /control/status` with `"vtt_sync": {**validate_sync_config(), "last_push": vtt_sync.last_push, "has_initiative": vtt_state.initiative is not None, "has_game_state": vtt_state.game_state is not None, "state_age_s": <seconds since vtt_state.last_updated or None>}` — read-only, never a network probe (the blocking `check_vtt_health` is NOT called here).
2. Flask proxies (`bmo/pi/app.py`, adjacent to the PHASE-20 `/api/discord/dm/*` proxy block — locate with `grep -n "discord/dm" bmo/pi/app.py`): add `POST /api/discord/dm/sync/initiative` and `POST /api/discord/dm/sync/state`, each forwarding the JSON body to `http://127.0.0.1:{DM_BOT_CONTROL_PORT}/control/sync/<name>` with timeouts `(2, 12)` and relaying status + JSON verbatim; `requests.ConnectionError/Timeout` → 503 `{"error": "DM bot not running"}` (identical mapping to the PHASE-20 proxies — these are the exact paths `sendInitiativeToPi`/`sendGameStateToPi` already POST to, F1). The global `before_request` bearer gate (`app.py:292-320`) covers them automatically.
3. Initiative embed in Discord (`discord_dm_bot.py`): add `async def post_initiative_embed(self) -> None` — builds `embed_dict = vtt_state.format_initiative_embed()` (`vtt_sync.py` keeps it; returns `None` when no entries → no-op), converts via `discord.Embed.from_dict(embed_dict)`, and **edits one pinned-message-style tracker instead of spamming**: keep `self._initiative_message: discord.Message | None`; if set, `await self._initiative_message.edit(embed=...)` else `self._initiative_message = await channel.send(embed=...)` (channel = `self.get_channel(self.session.text_channel_id)`). Rate-discipline: coalesce bursts with a `self._initiative_edit_lock = asyncio.Lock()` + minimum 1.0s spacing (`await asyncio.sleep(max(0, 1.0 - elapsed))`) — Discord allows ~5 message edits per 5s and discord.py queues beyond that. Clear `_initiative_message` in `session.reset()` aftermath (it belongs to the bot, not the session — clear wherever PHASE-20's stop/auto-leave paths clear `_campaign_name`).
4. AI-context injection: in `_handle_player_input` (`discord_dm_bot.py:690-760` — re-locate by name), where the system/context messages are assembled, append one compact line when `vtt_state.game_state` is fresher than 10 minutes: `[VTT STATE] map=<mapName>; party: <name> <hp>/<maxHp>(<conditions>), ...` (truncate to ~400 chars). Skip silently when absent/stale.
5. Session-start state pull: in the control-server `/control/start` handler (PHASE-20's), after voice join succeeds, fire `asyncio.create_task(asyncio.to_thread(request_vtt_state))` (blocking `requests.get` runs in a worker thread — never on the loop) and log `validate_sync_config()` once in `setup_hook` (the 22A startup validation).
6. Tests:
   - `test_dm_bot_control.py`: sync routes update `vtt_state` (assert `initiative`/`game_state` replaced); initiative route schedules the embed task only when session active + text channel set; `post_initiative_embed` sends once then edits (mock channel/message); status block contains `vtt_sync` with no network call (assert `requests.get` not called); context line appears in `_handle_player_input` prompt when fresh and is omitted when stale (monkeypatch `vtt_state.last_updated`).
   - `test_app_endpoints.py`: the two new proxies forward body + relay status; ConnectionError → 503.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_dm_bot_control.py tests/test_app_endpoints.py tests/agents/test_vtt_sync.py -q`.

**Acceptance:** `curl -X POST localhost:5000/api/discord/dm/sync/initiative -d '{"entries":[{"entityName":"A","entityType":"player","isActive":true}],"currentIndex":0,"round":2}' -H 'Content-Type: application/json'` (bot process up) → 200, `vtt_state.initiative` set, and a live session shows/edits exactly one initiative embed; `/control/status` exposes the `vtt_sync` block without blocking.

### 22C — Pi: bot event push wiring (messages, rolls, join/leave, session end)

**Objective:** the Discord bot emits the events the VTT receiver was built for (F5).

**Files:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py`.

**Steps:**
1. Module import: `from agents.vtt_sync import push_discord_message, push_discord_roll, push_player_join, push_player_leave` (all are thread-dispatching no-ops when sync is disabled per 22A — safe to call unconditionally; wrap each call site in `try/except Exception: pass` anyway, matching the `dnd_dm.py` precedent, so sync can never break the bot).
2. `on_message` (`:663-687`): after the existing `_log("Text from %s ...")`, call `push_discord_message(player_name, content)`.
3. `_handle_player_input` (`:690-760`): where the DM reply is added to the session (`:748-749`, `clean_text`), call `push_discord_message('DM', clean_text[:2000])`.
4. `_roll_cmd` (`:898-945`): inside the existing `if isinstance(bot, DMBot) and bot.session.active:` block, call `push_discord_roll(interaction.user.display_name, expression, total, rolls=rolls)`.
5. `on_voice_state_update` (`:636-661`): on join-tracking, `push_player_join(member.display_name)`; on leave-tracking, `push_player_leave(member.display_name)` (inside the existing `not member.bot` guards, only when `session.active`).
6. Session-end trace: in `_auto_leave_if_empty` (PHASE-20's reworked version) and the stop paths, after the session ends, `push_discord_message('BMO', 'Discord DM session ended (<reason>)')` — arrives at the VTT as a `discord_message` with `author: 'BMO'`; the renderer treats it as informational (22E). Do NOT invent a new event type (the zod union is the contract; PHASE-36 may extend it).
7. Tests (`test_dm_bot_control.py`): monkeypatch the four push helpers (`monkeypatch.setattr("bots.discord_dm_bot.push_discord_roll", spy)`) — roll during active session pushes formula/total; player text pushes; DM reply pushes once per reply; join/leave push on voice-state transitions; no pushes when session inactive; a raising push helper does not propagate.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_dm_bot_control.py tests/test_dm_bot_voice.py -q`.

**Acceptance:** with a live session and `VTT_SYNC_URL` set, Discord text/rolls/joins/leaves and session-end produce schema-valid POSTs to the VTT receiver; with sync unconfigured, zero network activity and zero behavioral change in Discord.

### 22D — dnd-app main: channel split, schema extension, preload exposure, key/bind wiring

**Objective:** events stop dying at the renderer boundary (F4): dedicated main→renderer channels, an honest unreachable event, preload listeners with unsubscribes, renderer-callable push invokes, and a working (env-free) shared-secret + opt-in LAN bind (F6).

**Files:** `dnd-app/src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/main/bmo-bridge.ts`, `src/main/bmo-config.ts`, `src/main/index.ts`, `src/main/ipc/storage-handlers.ts`, `src/main/storage/settings-storage.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/bmo-bridge.test.ts`, `src/shared/ipc-schemas.test.ts`.

**Steps:**
1. Channel split (F4 side note): add `BMO_SYNC_INITIATIVE_EVENT: 'bmo:sync-initiative-event'` to the BMO block (`ipc-channels.ts:204-212`). Change the forward at `bmo-bridge.ts:412` to `forwardToRenderer(IPC_CHANNELS.BMO_SYNC_INITIATIVE_EVENT, parsed.data)`. `BMO_SYNC_INITIATIVE` remains invoke-only.
2. Honest unreachable event: extend `SyncEventSchema` (`ipc-schemas.ts:139-170`) with a seventh union member `{...SyncEventBaseFields, type: z.literal('bmo_unreachable'), payload: z.object({}).loose()}`; add `'bmo_unreachable'` to the `SyncEvent['type']` union in `bmo-bridge.ts:85-92`. Rewrite `notifyBmoUnreachable()` (`bmo-bridge.ts:71-80`) to send `{type: 'bmo_unreachable', payload: {}, timestamp: Date.now()}` — the renderer owns the (truthful) wording (22E). Note: the receiver only ever forwards Pi-validated events; `bmo_unreachable` is main-internal, but putting it in the schema keeps the renderer's `z.infer` type complete.
3. Preload (BMO block, `preload/index.ts:505-510`) — corrected listener pattern (PHASE-05):
   ```ts
   bmoSyncInitiative: (initiative: {...InitiativeState wire shape...}) => ipcRenderer.invoke(IPC_CHANNELS.BMO_SYNC_INITIATIVE, initiative),
   bmoSyncGameState: (state: {...condensed shape...}) => ipcRenderer.invoke(IPC_CHANNELS.BMO_SYNC_SEND_STATE, state),
   onBmoSyncEvent: (cb) => { const l = (_e, d) => cb(d); ipcRenderer.on(IPC_CHANNELS.BMO_SYNC_EVENT, l); return () => ipcRenderer.removeListener(IPC_CHANNELS.BMO_SYNC_EVENT, l) },
   onBmoSyncInitiative: (cb) => { /* same pattern on BMO_SYNC_INITIATIVE_EVENT */ }
   ```
   Type them in `preload/index.d.ts` next to the existing `bmo*` entries (`:844-847`): the listener payloads are `ValidatedSyncEvent`-shaped (`import`-free structural types in the d.ts; mirror `ipc-schemas.ts:172-173`), the invokes return the `BridgeResponse`-truthful `Promise<{ ok?: boolean; error?: string; statusCode?: number }>`.
4. Wire the dead settings key path (F6): call `applyBmoApiKeyFromSettings(st.data)` next to `applyBmoBaseUrlFromSettings(st.data)` in `src/main/index.ts:352`, and `applyBmoApiKeyFromSettings(parsed.data)` next to the call at `storage-handlers.ts:299`. Add `bmoApiKey: z.string().optional()` to `AppSettingsSchema` (`settings-storage.ts`, near `bmoPiBaseUrl` at `:32`) with a doc comment ("shared secret for the BMO sync receiver; must match the Pi's VTT_SYNC_TOKEN/BMO_API_KEY"). Encrypt at rest like `turnServers.credential` does (`settings-storage.ts:44-62` `decryptOptional`/`encryptOptional`) — add `bmoApiKey` to those transforms.
5. Opt-in LAN bind (F6, off by default): add `bmoSyncLanEnabled: z.boolean().optional()` to `AppSettingsSchema`. In `bmo-bridge.ts`, export `applySyncBindFromSettings(settings: { bmoSyncLanEnabled?: boolean } | null | undefined): void` with precedence: env `BMO_SYNC_BIND` (existing `:20-21`) ALWAYS wins; else `bmoSyncLanEnabled === true` AND `getBmoApiKey()` returns a key → bind `0.0.0.0`; else `127.0.0.1`. When the setting is true but no key is configured, stay loopback and `logToFile('WARN', ...)` ("LAN sync bind requested but no shared secret configured — staying on loopback"). When the effective bind changes while the receiver runs: `await stopSyncReceiver(); startSyncReceiver()` (both exist, `:291,:447`). Call `applySyncBindFromSettings` at the same two call sites as step 4. Loopback stays the default per platform security guidance (see Research notes) — LAN exposure is a deliberate, keyed, opt-in act.
6. Tests:
   - `bmo-bridge.test.ts` (receiver suite at `:68` boots the real server on an ephemeral port): initiative POST forwards on `bmo:sync-initiative-event` (assert the channel string on the mocked `webContents.send`); `notifyBmoUnreachable` emits `type: 'bmo_unreachable'` and the payload parses against `SyncEventSchema`; `applySyncBindFromSettings` respects env-wins / keyless-stays-loopback (assert via exported state or the listen-host log mock — structure the function so the chosen host is returned for testability).
   - `ipc-schemas.test.ts`: `bmo_unreachable` member parses; a Pi-shaped `discord_message` (`{text, author, characterName}`) and `discord_roll` (`{formula, total, rolls, rollerName, characterName}`) parse (locks the 22A contract from the VTT side).

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/bmo-bridge.test.ts src/shared/ipc-schemas.test.ts src/main/ipc/bmo-sync-handlers.test.ts`.

**Acceptance:** Pi-validated events and initiative syncs reach the renderer on distinct channels with working unsubscribes; the shared secret is configurable from settings (no env needed); LAN bind is possible only as keyed opt-in; all existing receiver tests stay green.

### 22E — dnd-app renderer: sync consumption (activity feed + alerts) and opt-in state push

**Objective:** the events become visible (F4) and the VTT can push initiative/state to Discord (F1) — display-only consumption, opt-in push, zero behavior change while the toggle is off.

**Files:** `src/renderer/src/stores/use-discord-sync-store.ts` (new) + colocated `use-discord-sync-store.test.ts`, `src/renderer/src/hooks/use-discord-sync.ts` (new) + colocated `use-discord-sync.test.ts`, `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/components/game/bottom/DiscordSessionSection.tsx` (PHASE-20 deliverable — extend; fallback `DMTabPanel.tsx` if absent), `src/renderer/src/i18n/locales/en.json`, `es.json`, `src/renderer/src/i18n/generated-keys.ts` (regenerated).

**Steps:**
1. New store `use-discord-sync-store.ts` (zustand, repo pattern): state `{ activity: DiscordActivityEntry[]; syncToDiscordEnabled: boolean }` where `DiscordActivityEntry = { id: string; at: number; kind: 'message' | 'roll' | 'join' | 'leave' | 'initiative' | 'info'; summary: string }`; actions `addActivity` (bounded FIFO, cap 100), `clearActivity`, `setSyncToDiscordEnabled` (persist to `localStorage['dnd-vtt:discord-sync-enabled']`, default **false** — mirror `use-narration-tts-store.ts:10-35`).
2. New hook `use-discord-sync.ts` (model: `use-ai-memory-sync.ts:80-117`), signature `useDiscordSync({ isDM, campaignId })`, mounted once in `GameLayout.tsx` next to `useGameEffects` (`:503`). DM-side only (`if (!isDM) return` inside the effect). Three responsibilities:
   - **Inbound events:** subscribe `window.api.onBmoSyncEvent` (cleanup with the returned unsubscribe). Map: `discord_message` → activity `{kind:'message', summary: '<author>: <text-trunc-120>'}`; `discord_roll` → `{kind:'roll', summary: '<rollerName> rolled <formula> = <total>'}`; `player_join`/`player_leave` → activity + `pushDmAlert('info', t('notify.discordSync.playerJoined'|'playerLeft', {name}))`; `bmo_unreachable` → `pushDmAlert('warning', t('notify.discordSync.bmoUnreachable'))` — truthful wording: "BMO unreachable — Discord sync events may be missed" (no "paused" lie), deduped to at most one alert per 60s via a ref; `state_request` → respond by pushing current state (next bullet, regardless of toggle — it is an explicit ask from the Pi). Subscribe `window.api.onBmoSyncInitiative` → activity `{kind:'initiative', summary: 'Discord initiative: <n> entries, round <r>'}` — **display-only; never mutate `useGameStore`** (Discord-side rolls do not drive VTT combat; PHASE-36 owns any deeper integration).
   - **Outbound push (opt-in):** when `syncToDiscordEnabled`, `useGameStore.subscribe` with manual prev-diff on `state.initiative` (the `use-ai-memory-sync` pattern), debounce 1500 ms, then `window.api.bmoSyncInitiative({ entries: initiative.entries.map(({entityName, entityType, isActive}) => ({entityName, entityType, isActive})), currentIndex, round })`. Push the condensed game state (`mapName` from the active map, `partyHp` from player tokens — reuse the field extraction shapes `sendGameStateToPi` types at `bmo-bridge.ts:197-205`) on map/initiative change, debounce 3000 ms. Failures: log via `console.warn` only — `bmoPiFetch` already owns retry + unreachable signaling; do not alert per-push.
   - **state_request reply:** same gather functions, fired immediately (no debounce), even when the toggle is off but only when `isDM`.
3. UI: extend `DiscordSessionSection.tsx` (PHASE-20G) with (a) a "Sync game state to Discord" checkbox bound to `syncToDiscordEnabled` (same toggle styling as the Speak-narration toggle, `DMTabPanel.tsx:231-239`), with a one-line description ("Pushes initiative and party status to the Discord session"), and (b) a collapsed-by-default "Discord activity" list rendering the last 20 `activity` entries (timestamp + summary, monospace-light). If PHASE-20's component is missing at execution (drift), put both directly in `DMTabPanel.tsx`'s AI-DM tab and note it in Completed.
4. i18n: add `game.discordSync.*` (toggle label/desc, activityTitle, activityEmpty) and `notify.discordSync.*` (playerJoined, playerLeft, bmoUnreachable, sessionEnded) to `en.json` AND `es.json`; `npm run i18n:gen-keys`.
5. Tests:
   - `use-discord-sync-store.test.ts`: bounded activity FIFO; toggle persistence (localStorage mock); default false.
   - `use-discord-sync.test.ts` (renderHook, mock `window.api` + `DmAlertTray`'s `pushDmAlert`): inbound mapping per type; unreachable alert dedup; unsubscribes called on unmount; toggle ON + initiative change → exactly one debounced `bmoSyncInitiative` call (fake timers); toggle OFF → zero pushes; `state_request` → immediate push even when toggle off; non-DM → no subscriptions.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/stores/use-discord-sync-store.test.ts src/renderer/src/hooks/use-discord-sync.test.ts && npm run i18n:gen-keys` (diff shows only the new keys).

**Acceptance:** Discord messages/rolls/joins/leaves appear in the DM-side activity feed; join/leave/unreachable surface as DM alerts with truthful wording; enabling the toggle pushes debounced initiative + state to the Pi; everything is inert for players and for DMs who never enable it.

### 22F — dnd-app: wire "Push to Discord" text narration into the AI pipeline

**Objective:** make the settings UI's promise true (F8): every finalized AI reply is forwarded to Discord text — if and only if the user enabled the integration (existing `config.enabled`, default false).

**Files:** `src/main/ai/ai-service.ts`, `src/main/discord-integration/discord-service.ts`, `src/main/discord-integration/discord-service.test.ts`.

**Steps:**
1. `cleanTextForDiscord` (`discord-service.ts:236-260`): add three strips before the whitespace cleanup — `[NPC: x]` and `[EMOTION: x]` (reuse the exact patterns from `stripVoiceTags`, `ai-response-parser.ts:47-50`: `/\[NPC:\s*[a-z_]+\s*\]/gi`, `/\[EMOTION:\s*[a-z_]+\s*\]/gi`) and `[RULING …]…[/RULING]` blocks (`/\s*\[RULING[^\]]*\][\s\S]*?\[\/RULING\]\s*/g`).
2. `ai-service.ts` finalize path (currently `:908-915`; PHASE-20F wraps `sendNarration` in `isNarrationEnabled()` — locate by `grep -n "sendNarration" src/main/ai/ai-service.ts`): after the voice-narration call, add a fire-and-forget text push:
   ```ts
   // Push the narration TEXT to Discord (webhook / bot-DM) — separate, user-enabled
   // integration; sendNarrationToDiscord no-ops unless Discord integration is enabled.
   void (async () => {
     const campaign = await loadCampaignById(request.campaignId)
     const name = typeof campaign?.name === 'string' ? campaign.name : undefined
     await sendNarrationToDiscord(displayText, name)
   })().catch((err) => logToFile('WARN', '[AI] Discord text push failed:', String(err)))
   ```
   Imports: `sendNarrationToDiscord` from `../discord-integration`, `loadCampaignById` from `./campaign-context` (already used by `context-builder.ts:273`). Update the stale comment block ("NO Discord TEXT — the narration text stays only in the in-game chat") to describe both senders: voice (toggle-gated) and text (Discord-integration-gated, default off).
3. Tests (`discord-service.test.ts` — extend): `cleanTextForDiscord` strips `[NPC: gruff_dwarf]`, `[EMOTION: angry]`, and a `[RULING question="x"]…[/RULING]` block while preserving narration; disabled config → `sendNarrationToDiscord` returns `{success: true}` without fetching (likely already covered — verify, extend if not).

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/discord-integration/discord-service.test.ts`.

**Acceptance:** with Discord integration enabled (webhook or bot-DM), every finalized AI reply lands in Discord, tag-free and truncated to 2000 chars (`discord-service.ts:30,264-271`); with it disabled (default), zero fetches; `en.json:6890`'s infoBox claim is now accurate.

### 22G — Docs + protocol truth

**Objective:** every new env var, setting, endpoint, and event documented; no doc claims behavior the code lacks.

**Files:** `docs/ARCHITECTURE.md`, `bmo/docs/SERVICES.md`, `bmo/pi/bots/README.md`, `dnd-app/README.md`, `bmo/.env.template` (verify 22A landed).

**Steps:**
1. `docs/ARCHITECTURE.md` (VTT↔BMO protocol section): document the full sync plane — VTT→Pi: `/api/discord/dm/sync/{initiative,state}` (Flask proxy → bot control server → `vtt_state`); Pi→VTT: `/api/sync` + `/api/sync/initiative` on `:5001` with the six event types + `bmo_unreachable` (main-internal), eventId dedup, bearer (`BMO_API_KEY` ↔ `VTT_SYNC_TOKEN`), loopback-default bind with keyed opt-in LAN bind.
2. `bmo/docs/SERVICES.md`: under the DM-bot entry, add the two sync control routes and the `vtt_sync` status block; note `VTT_SYNC_URL` unset = sync disabled (no retries).
3. `bmo/pi/bots/README.md`: env table (`VTT_SYNC_URL`, `VTT_SYNC_TOKEN`), the push-event vocabulary with payload shapes (the zod contract), and the initiative-embed behavior.
4. `dnd-app/README.md:252` (BMO→VTT receiver row): add the bearer/bind settings (`bmoApiKey`, `bmoSyncLanEnabled`) and the new renderer surfaces.
5. Deployment note in SERVICES.md: `bmo` + `bmo-dm-bot` both need restart after pull (warn the user; never restart unprompted, per CLAUDE.md).

**Cheap checks:** `grep -n "VTT_SYNC_TOKEN" bmo/.env.template bmo/pi/bots/README.md docs/ARCHITECTURE.md`.

**Acceptance:** docs describe exactly what shipped; no references to `apply_patch.py` or `register_sync_routes` remain anywhere (`grep -rn "apply_patch\|register_sync_routes" --exclude-dir=.git --exclude-dir=node_modules .` → only this plan in `completed/` history).

## Research notes

- **Finish-vs-delete decision.** Delete was a real option (the audit allowed it), but three facts favor finish: the expensive half (a hardened, zod-validated, deduping, rate-limited receiver + tests) already exists on the VTT side; PHASE-36's async play-by-post explicitly builds on Discord events reaching the VTT; and the wire contract mismatch (F3) shows the feature died from never being integration-tested, not from a design flaw. The deleted parts are exactly the pieces that were wrong-by-architecture: Flask-process route registration (F2) and in-place source patching (F7).
- **Why VTT→Pi sync rides the PHASE-20 control plane.** Registering Flask routes (the original `register_sync_routes` design) caches state in the wrong process — the bot can never read it (same topology bug as PHASE-20 F1). Routing app.py→loopback-control-server keeps one public surface (Flask `:5000`, CF-tunnel reachable, front-door bearer gate at `app.py:292-320`) while the state lands in the bot's memory. aiohttp-inside-the-bot-loop is the standard pattern (PHASE-20 research): https://docs.aiohttp.org/en/stable/web_advanced.html
- **Blocking HTTP in the bot process.** `requests` calls block the asyncio loop; discord.py guidance is to use async clients or push blocking work to a thread (`asyncio.to_thread`/`run_in_executor`) — interactions can fail outright if the loop stalls. `_post_to_vtt`'s existing daemon-thread dispatch already complies; only `request_vtt_state`/`check_vtt_health` needed the `to_thread` treatment (22B step 5), and the status endpoint reads cached `last_push` instead of probing. Sources: https://discordpy.readthedocs.io/en/async/faq.html , https://tutorial.vcokltfre.dev/tips/blocking/ , https://github.com/Rapptz/discord.py/discussions/9749
- **Initiative embed: edit, don't repost.** Discord rate-limits message edits (~5 per 5 s per message); a live tracker should hold one message and edit it with ≥1 s spacing — discord.py queues over-limit calls but bursty edits degrade. The lock + min-spacing in 22B step 3 implements this. Sources: https://discord.com/developers/docs/topics/rate-limits , https://github.com/Rapptz/discord.py/issues/5093
- **Bearer over HMAC for this hop.** Industry webhook guidance prefers HMAC-SHA256 signatures (integrity + replay protection), with bearer/shared-secret as the simpler accepted alternative (~8% of surveyed webhooks). Here the receiver already implements bearer (RFC 6750 shape, `bmo-bridge.ts:352-359`) and the threat model is a single-owner LAN/tunnel with idempotent (eventId-deduped) handlers — completing the existing bearer contract beats introducing a second auth scheme on one side. Replay risk is bounded by the dedup set + loopback-default bind. Sources: https://datatracker.ietf.org/doc/html/rfc6750 , https://hookdeck.com/webhooks/guides/what-are-the-webhook-authentication-strategies , https://ngrok.com/blog/get-webhooks-secure-it-depends-a-field-guide-to-webhook-security , idempotency-key semantics https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- **Loopback-default bind stays; LAN is keyed opt-in.** Binding a desktop app's helper server to `0.0.0.0` exposes it to every LAN peer (and the internet under port-forwarding) — the standing recommendation is loopback unless deliberately exposed. The 22D design (env override > keyed settings opt-in > loopback) keeps the safe default while making the documented "BMO callbacks → VTT on `:5001`" architecture achievable without shell access. Sources: https://www.electronjs.org/docs/latest/tutorial/security , https://stenzr.medium.com/understanding-0-0-0-0-vs-127-0-0-1-c6257ae35c62
- **Renderer push pattern.** Plain `useGameStore.subscribe` + manual prev-diff + debounce is the repo's established pattern (`use-ai-memory-sync.ts:94-110`, `use-dm-triggers.ts:35`); `subscribeWithSelector` middleware would be cleaner but is not installed on these stores and retrofitting middleware types repo-wide is out of scope. Source (for the road not taken): https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector
- **Alternatives considered.** (1) New `session_end`/`sync_status` event types in the zod union — rejected: `discord_message` with `author:'BMO'` covers the UX need and keeps the wire contract stable for PHASE-36 to extend deliberately. (2) Feeding inbound Discord messages into the AI conversation — rejected here (display-only): auto-injecting remote text into prompts is behavior-risky and is precisely PHASE-36's turn-queue design space. (3) Changing the VTT zod schemas to accept the Pi's `{username, content}` keys — rejected: the schemas are tested, typed (`ValidatedSyncEvent`), and renderer-facing; the Pi sender is the cheaper, single-site change. (4) WebSocket/SSE instead of HTTP POST callbacks — rejected: the retry+dedup POST plane exists and is hardened; reliability needs are modest (events are advisory).

## Test plan

- **22A:** `bmo/pi/tests/agents/test_vtt_sync.py` — extended (bearer header on/off, URL-unset no-op, new payload keys ×4, `last_push`, `validate_sync_config`); existing retry/eventId cases stay green.
- **22B:** `bmo/pi/tests/test_dm_bot_control.py` — sync routes update `vtt_state`; embed task gating; `post_initiative_embed` send-then-edit; status `vtt_sync` block non-blocking; context-injection freshness. `bmo/pi/tests/test_app_endpoints.py` — two new proxies (forward + 503 mapping).
- **22C:** `test_dm_bot_control.py` — push-helper spies across message/roll/join/leave/session-end; inactive-session and raising-helper cases. `test_dm_bot_voice.py` stays green.
- **22D:** `dnd-app/src/main/bmo-bridge.test.ts` — new-channel forwarding, `bmo_unreachable` shape, bind precedence; `src/shared/ipc-schemas.test.ts` — new union member + Pi-shaped payloads; `src/main/ipc/bmo-sync-handlers.test.ts` stays green.
- **22E:** new colocated `use-discord-sync-store.test.ts` + `use-discord-sync.test.ts` (inbound mapping, alert dedup, unsubscribe, debounced opt-in push, state_request, non-DM inert).
- **22F:** `src/main/discord-integration/discord-service.test.ts` — tag-strip additions + disabled-config no-fetch.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` — **plus** `cd bmo/pi && python -m pytest tests/` (Pi code touched).

## Acceptance criteria

1. Every Pi→VTT push helper emits payloads that parse against `SyncEventSchema`/`InitiativeSyncSchema`, carries `Authorization: Bearer` when a token is configured, and is a logged no-op when `VTT_SYNC_URL` is unset (no retry threads).
2. The Discord bot pushes player messages, DM replies, rolls, joins/leaves, and session-end through `vtt_sync`; failures never affect bot behavior.
3. `POST /api/discord/dm/sync/{initiative,state}` reach the bot process via the control plane; `vtt_state` is consumed (live edited initiative embed in the session text channel + fresh-state line in the DM prompt + status surfacing); 503 truthfully means the bot process is down.
4. The renderer receives sync events on `bmo:sync-event` and initiative on the new `bmo:sync-initiative-event` (no channel double-use), shows them in a DM-side activity feed, and alerts join/leave/unreachable with truthful wording (no "paused" lie).
5. "Sync game state to Discord" is opt-in (default OFF) and, when on, debounce-pushes initiative + condensed state; `state_request` is answered regardless of the toggle (DM-side only).
6. The sync receiver's shared secret is settable from app settings (encrypted at rest) without env vars; LAN bind requires both the opt-in setting AND a configured key (env `BMO_SYNC_BIND` still wins); default remains loopback.
7. Every finalized AI reply is forwarded to Discord text iff the Discord integration is enabled (default off), with `[NPC:]`/`[EMOTION:]`/`[RULING]` stripped by `cleanTextForDiscord`; the settings infoBox claim is true.
8. `register_sync_routes`, its `_parse_json`, and `bmo/pi/scripts/apply_patch.py` are gone; `bmo/pi/README.md` and all protocol docs match shipped behavior.
9. The 4-gate plus `pytest bmo/pi/tests/` is green; all new strings exist in `en.json` + `es.json` with regenerated keys.

## Out of scope

- Discord DM session start/stop/status UI, narrate idempotency/honesty, control-server creation, 4xx-unreachable counting → **PHASE-20** (prerequisite; verify shipped, do not re-fix).
- Streaming/sentence-chunked TTS, `text[:500]`, barge-in, NPC voice casting, emotion-prosody map → **PHASE-21**.
- Feeding inbound Discord messages/rolls into the AI conversation or VTT combat state; per-scene turn queue; Discord turn pings → **PHASE-36** (this phase's renderer consumption is deliberately display-only).
- Deleting the dead `ai-stream-handler.ts` duplicate pipeline → **PHASE-08** (verify it is already gone).
- `DMTabPanel.tsx` label-truth fixes ("Ollama" hardcodes etc.) → **PHASE-10**.
- campaignId path-sanitization in AI IPC handlers → **PHASE-13**.
- `app.py` blueprint refactor → **PHASE-16** (this phase only adds two proxy routes wherever the DM-bridge routes live).
- BMO deploy automation (shipping this to the Pi via CI) → **PHASE-42**; this phase documents the manual restart requirement only.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 — file:line citations + one-line summaries per sub-phase. -->
