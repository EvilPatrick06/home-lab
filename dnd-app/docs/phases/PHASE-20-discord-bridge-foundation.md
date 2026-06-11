# PHASE-20 — Discord bridge foundation (VTT ↔ DM-bot control plane)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the VTT→Discord voice-narration bridge actually work end to end and tell the truth at every layer. Today the entire bridge is dead by deployment topology (Flask reads a process-local bot singleton that lives in a different systemd process), narration is sent twice per AI reply with the renderer toggle only gating one of the two senders, the narrate endpoint reports success in four nothing-was-spoken cases and can speak the same line up to 4× on timeout-retry, there is no in-app way to start/stop/see a Discord DM session, 4xx responses manufacture a false "BMO unreachable" state, bridge-started sessions silently disable Discord text input and leak stale initiative, the slash-command error handler crashes itself, the bot never rejoins voice after an unrecoverable drop, auto-leave strands the VTT, and `/initiative` promises tracking that does not exist. This phase delivers: a control endpoint inside the bot process that `app.py` proxies to (fixing the process split), one toggle-gated narration sender with idempotent + honest narrate results, an in-app session start/stop/status UI, and all the listed bot-behavior fixes — leaving a live, truthful foundation that PHASE-21 (streaming TTS) and PHASE-22 (sync plane) build on.

## Dependencies & cross-phase notes

- **Depends on:** nothing (independent per PHASE-INDEX row 20). PHASE-21 (`discord-voice-quality`) and PHASE-22 (`discord-sync-plane`) and PHASE-36 (`async-play-by-post`) all depend on THIS phase.
- **Coordinate with PHASE-21** on `bmo/pi/bots/discord_dm_bot.py` `_speak`/`_play_audio`: this phase introduces the narration queue + status results but deliberately KEEPS the `text[:500]` truncation (`discord_dm_bot.py:781`) — PHASE-21 replaces it with sentence-chunked streaming TTS and owns barge-in/per-NPC voices/emotion-prosody completion. Do not chunk or change TTS engines here.
- **Coordinate with PHASE-22** on `dnd-app/src/main/bmo-bridge.ts` and `bmo/pi/agents/vtt_sync.py`: PHASE-22 owns the Pi→VTT sync plane (preload exposure of `BMO_SYNC_EVENT`/`BMO_SYNC_INITIATIVE`, `register_sync_routes`, bot push-helper wiring, bind + bearer auth, `apply_patch.py` removal, push-to-Discord TEXT narration). This phase touches `bmoPiFetch` (4xx counting), `sendNarration` (eventId), and the DM-session endpoints only. The auto-leave "notify the VTT" requirement is satisfied here WITHOUT vtt_sync: via honest `/status` fields + honest narrate results that the new in-app UI polls/consumes (PHASE-22 may later add an active push).
- **Coordinate with PHASE-05** on `dnd-app/src/preload/index.ts`: PHASE-05 fixes the preload per-listener unsubscribe root cause. The one new main→renderer listener added here (`onBmoNarrationStatus`) must use the corrected pattern (wrapped listener + returned unsubscribe that removes exactly that listener), not the legacy `ipcRenderer.on` with no removal (`preload/index.ts:177-211` shows the legacy pattern).
- **Coordinate with PHASE-12** (i18n wording sweep): new UI strings land in BOTH `en.json` and `es.json` + regenerate `generated-keys.ts` (`npm run i18n:gen-keys`).
- PHASE-10 touches `DMTabPanel.tsx` (hardcoded "Ollama" label at `DMTabPanel.tsx:51`); this phase adds a Discord session section to the same file — merge conflicts are textual only, keep edits scoped.

## Verified findings

All verified 2026-06-10 against the live tree. The audit file this absorbed is deleted; everything needed is here.

### F1 — The entire VTT→Discord bridge is dead by deployment topology (CRITICAL)

All four bridge endpoints in Flask call `get_dm_bot()`, which returns the module-global `_bot` that is only ever set by `_run_dm_bot()` **in the same process** (`bmo/pi/bots/discord_dm_bot.py:1565-1593`). But the bot is deployed as its own systemd unit while Flask runs in the `bmo` unit:

- `bmo/setup-bmo.sh:223` — `bmo.service` → `ExecStart=.../venv/bin/python app.py` (Flask).
- `bmo/setup-bmo.sh:301-326` — `bmo-dm-bot.service` → `ExecStart=.../venv/bin/python -m bots.discord_dm_bot` (line 312), which runs `asyncio.run(_run_dm_bot())` via the `__main__` block (`discord_dm_bot.py:1624-1630`).

So in the Flask process `get_dm_bot()` is **always `None`**: start → 503 `"DM bot not running"` (`bmo/pi/app.py:2799-2800`), stop/narrate → 404 (`app.py:2855-2856,2907-2908`), status → `{"running": false, "active": false}` (`app.py:2929-2930`). `start_dm_bot()` (in-process thread launcher, `discord_dm_bot.py:1596-1619`) has **zero callers** anywhere. Endpoint locations (drifted from the audit's `2787-2920`): start `app.py:2789-2845`, stop `:2848-2888`, narrate `:2891-2919`, status `:2922-2946`.

Verification:
```bash
grep -rn "start_dm_bot\|get_dm_bot" --include="*.py" bmo/ | grep -v discord_dm_bot.py
# → only app.py:2797,2798,2853,2854,2905,2906,2927,2928 (all get_dm_bot; start_dm_bot: nothing)
grep -n "ExecStart" bmo/setup-bmo.sh   # 223 = app.py (bmo), 312 = -m bots.discord_dm_bot (bmo-dm-bot)
sed -n '1624,1630p' bmo/pi/bots/discord_dm_bot.py   # __main__ → asyncio.run(_run_dm_bot())
```

### F2 — Narration is sent twice per AI reply; only ONE of the two senders honors the toggle

- **Main-process sender (NOT gated):** `dnd-app/src/main/ai/ai-service.ts:913-915` fires `sendNarration(displayText, npc, emotion)` unconditionally for every finalized AI response (it has the parsed `npc`/`emotion` from `parseVoiceTags(cleaned)` at `ai-service.ts:877`). No setting is checked — toggle OFF still POSTs to the Pi (off-LAN via the CF tunnel too).
- **Renderer sender (gated, but loses npc/emotion):** `use-game-effects.ts:146-157` defines `narrateThroughBmo`, gated on `useNarrationTtsStore.enabled` (line 148; store defaults to `false` from localStorage — `stores/use-narration-tts-store.ts:10-16,28-35`), called at `use-game-effects.ts:267` (scene-narration post) and `:448` (per-AI-message effect) — but **without** npc/emotion (`speakNarrationThroughBmo(text)` only, `services/bmo-narration.ts:5-21`).
- A third, **manual** sender exists and is fine: `ChatPanel.tsx:319-324` `handleSpeakNarration` (user-clicked per-message speak button).
- Toggle UI: `components/game/bottom/DMTabPanel.tsx:231-239` (store reads at `:56-57`).
- Consequence: toggle ON double-POSTs; whichever copy lands first claims the TTS slot and starts the 3s cooldown (`discord_dm_bot.py:336-342` `can_tts`/`mark_tts`, `TTS_COOLDOWN = 3.0` at `:54`), so the voice-modulated copy can be dropped by its own twin. With no active session (the normal state per F1), every AI turn produces 1-2 narrate 404s.
- *Correction vs the original audit text:* the renderer path IS gated by the toggle; the accurate statement is that the **main-process** sender ignores it, so the toggle never fully gates narration.

Verification:
```bash
grep -n "sendNarration" dnd-app/src/main/ai/ai-service.ts            # 5 (import), 913
grep -rn "narrateThroughBmo\|speakNarrationThroughBmo" dnd-app/src/renderer/src --include="*.ts*" | grep -v test
sed -n '146,157p;267p;448p' dnd-app/src/renderer/src/hooks/use-game-effects.ts
sed -n '28,35p' dnd-app/src/renderer/src/stores/use-narration-tts-store.ts
```

### F3 — Narrate returns `ok:true` in four nothing-was-spoken cases

`_speak()` (`discord_dm_bot.py:762-793`) silently returns `None` when: (a) voice client missing/disconnected (`:769-771`), (b) within the 3s `TTS_COOLDOWN` — "TTS rate limited, skipping" → the text is **permanently dropped**, no queue (`:773-775`), (c) TTS generation error (`:789-791`). A fourth silent-failure lives in `_play_audio` (`:795-814`): `vc.play()` failure is logged only (`:813-814`). The Flask route can't distinguish any of these from success — `app.py:2911-2915` awaits `bot._speak(...)` and returns `{"ok": true}` unconditionally. So the VTT's `narrationFailed` alert (`use-game-effects.ts:150-154`, i18n `notify.gameEffects.narrationFailed` at `en.json:5087`) never fires, and back-to-back narrations <3s apart silently lose the second.

### F4 — Narrate timeout → 500 → bridge retry = same line spoken up to 4×; stop can double-trigger

`/api/discord/dm/narrate` blocks on `future.result(timeout=15)` (`app.py:2914`, drifted from the audit's `:2904`). If TTS generation + the `while vc.is_playing()` queue-wait (`discord_dm_bot.py:802-803`) exceeds 15s, the handler raises → generic 500 (`app.py:2917-2919`) — but the un-cancelled `_speak` coroutine still completes and speaks. The VTT client `bmoPiFetch` retries network errors/5xx with 200/800/2000ms backoff (`dnd-app/src/main/bmo-bridge.ts:25,141-158`; per-attempt abort at `TIMEOUT_MS = 15_000`, `:16`) → up to 4 queued utterances of the same text. Same pattern hits `/api/discord/dm/stop`: its recap LLM call runs under `future.result(timeout=30)` (`app.py:2882`) vs the client's 15s abort, so a retry re-enters `_stop()` while the first is still running and `bot.session.active` is still true → double farewell/leave/reset (`app.py:2860-2882`). The Pi→VTT direction already has eventId dedup (`bmo-bridge.ts:91-107`); VTT→BMO has none (`sendNarration`, `bmo-bridge.ts:171-176`, sends only `{text, npc, emotion}`).

### F5 — No UI calls `bmoStartDm`/`bmoStopDm`/`bmoDmStatus`; preload status type lies

Preload exposes all four bridge fns (`dnd-app/src/preload/index.ts:505-510`), main handlers exist (`src/main/ipc/ai-handlers.ts:654-671`, channels `BMO_START_DM`/`BMO_STOP_DM`/`BMO_NARRATE`/`BMO_STATUS` at `src/shared/ipc-channels.ts:204-207`) — but zero renderer call sites for start/stop/status exist (only `bmoNarrate` via `bmo-narration.ts:15`). The only session-start paths are the Discord `/dm start` slash command or curl. The "Speak narration" toggle therefore enables a path that 404s on every AI message with no status indicator or start/stop affordance anywhere. Bonus: `preload/index.d.ts:847` types `bmoDmStatus` as `Promise<{ running: boolean; active: boolean; players: string[] }>` but the bridge actually returns the `BridgeResponse` shape (`{ ok?, error?, statusCode?, ...fields }`, `bmo-bridge.ts:62-67`) — failure shapes don't match the type.

Verification:
```bash
grep -rn "bmoStartDm\|bmoStopDm\|bmoDmStatus" dnd-app/src --include="*.ts*" | grep -v ".test." | grep -v preload | grep -v "index.d.ts"
# → empty (no renderer callers)
```

### F6 — 4xx responses count toward "BMO unreachable"

`bmoPiFetch` correctly stops retrying on 4xx (`bmo-bridge.ts:150` breaks the loop) but execution falls through to `consecutiveBmoFailures++` (`:155`) and `notifyBmoUnreachable()` at exactly 3 (`:156`). A 404 "No active DM session" means BMO is healthy and responding — with narration enabled and no session (the default state), 2-3 AI turns manufacture a false unreachable event. (That event is itself currently never rendered — no preload listener for `BMO_SYNC_EVENT` — which is PHASE-22's finding; fix the counting here regardless.)

### F7 — Bridge-started sessions skip the initiative reset and disable Discord text input

`/api/discord/dm/start`'s `_start()` clears `messages` + `combat_log` only (`app.py:2818-2819`) — the slash command also clears `initiative_order` + `initiative_round` (`discord_dm_bot.py:386-387`) → stale combat state leaks into `/status` (`initiative_round` is reported at `app.py:2940`). It also sets `text_channel_id = None` (`app.py:2815`) and `on_message` early-returns on falsy `text_channel_id` (`discord_dm_bot.py:669-670`) → during VTT-driven sessions, Discord players typing get zero DM responses.

### F8 — Start endpoint reports "Could not find Dungeon voice channel" for ALL failures; guild/channel are hardcoded

`_start()` (`app.py:2808-2834`) returns `False` both when no channel is found AND when `join_voice` fails (`join_voice` swallows exceptions and returns `None`, `discord_dm_bot.py:825-835`) — the route maps every `False` to 404 `"Could not find Dungeon voice channel"` (`app.py:2841`). The channel is the hardcoded constant `DUNGEON_CHANNEL_NAME = "🗺️ | Dungeon"` (`discord_dm_bot.py:51`, exact-name match in `find_dungeon_channel` `:818-823`) with no env override, and `_start()` iterates `bot.guilds` taking the first guild with a matching channel (`app.py:2809`) — `campaign_id` has no influence, so a multi-guild bot can narrate in the wrong server. (`GUILD_ID` env exists at `:48` but is only used for slash-command sync, `:553,578-583`.)

### F9 — `_log` kwargs crash: every slash-command failure dies inside its own error handler

`_log(msg: str, *args)` accepts no kwargs (`discord_dm_bot.py:63-66`), but `on_app_command_error` calls `_log("Command /%s failed: %s", ..., error, exc_info=error)` (`:588`) → `TypeError: _log() got an unexpected keyword argument 'exc_info'` raised inside the error handler itself; neither the log line nor the "Something went wrong…" reply (`:589-596`) ever sends.

### F10 — No app-level voice rejoin after an unrecoverable VC drop; status has no voice-connected field

After a drop discord.py can't auto-recover from (kicked, channel deleted, reconnect exhausted), `_speak()` no-ops forever (`:769-771`), the session stays `active`, and `/api/discord/dm/status` (`app.py:2933-2941`) exposes NO voice-connected field, so the VTT cannot detect the bot went mute. `start_voice_listen()` — which WOULD rejoin (`:846-875`) — runs once at session start only (slash `:429` is `_speak` not listen; bridge `_start()` at `app.py:2829`). Note the Discord-side `/dm status` embed DOES show voice state (`discord_dm_bot.py:526-528`) — the HTTP status is the gap.

### F11 — Auto-leave on empty VC resets the session without recap or VTT-visible trace

`_auto_leave_if_empty()` (`discord_dm_bot.py:877-890`, scheduled from `on_voice_state_update` `:656-661`) waits 30s, then `leave_voice()` + `session.reset()` — no recap (unlike `/dm stop` `:453` and bridge stop `app.py:2862`), no `_campaign_memory.end_session(...)` (campaign-memory session left dangling), `_campaign_name`/`_session_id` not cleared, and nothing the VTT can observe → the VTT keeps narrating into 404s, which then feed the F6 false-unreachable bug.

### F12 — `/initiative` promises tracking that doesn't exist

The `/initiative` embed says "BMO will track the order as you roll!" (`discord_dm_bot.py:969`), but `session.initiative_order` is only ever `.clear()`-ed (declared `:283`, cleared at `:300` (reset), `:386` (slash start), `:960` (initiative cmd)); no code path appends entries from `/roll` results (`_roll_cmd` logs to `combat_log` only, `:940-945`) and nothing ever displays an order.

Verification (F3-F4, F7-F12):
```bash
sed -n '762,814p;818,890p;948,983p;283,303p;380,390p;586,596p;63,66p;51p' bmo/pi/bots/discord_dm_bot.py
sed -n '2789,2946p' bmo/pi/app.py
grep -n "initiative_order" bmo/pi/bots/discord_dm_bot.py bmo/pi/app.py
```

### F13 — Current state useful to build on (verified)

- `bmo-bridge.ts` BridgeResponse + retry plumbing exists and is tested (`dnd-app/src/main/bmo-bridge.test.ts:26-66` covers retry + 4xx-no-retry).
- Pi-side narrate route already has a rate limit decorator (`@limiter.limit(RATE_LIMIT_NARRATE)`, `app.py:2893`; `RATE_LIMIT_NARRATE = os.environ.get("BMO_NARRATE_RATE_LIMIT", "30 per minute")` at `app.py:226`) — the proxy rewrite must keep it.
- `aiohttp==3.14.0` is already an installed dependency (pulled by `discord-py==2.7.1`) — `bmo/pi/requirements.txt:14,75` — so the bot-side control server adds no new dependency. `requests==2.34.2` (`requirements.txt:302`) is available for the Flask-side proxy (app.py precedent: local `import requests as http_requests` inside a route, `app.py:2283`).
- Bot tests exist and run hardware-free: `bmo/pi/tests/test_dm_bot_voice.py` constructs `DMBot()` directly with conftest mocks; `bmo/pi/pytest.ini` has `asyncio_mode = auto`.
- IPC plumbing conventions: channels in `src/shared/ipc-channels.ts` (BMO block at `:204-212`), zod schemas in `src/shared/ipc-schemas.ts`, handlers via `handle()` from `src/main/ipc/_safe.ts:38`.
- i18n: strings in `src/renderer/src/i18n/locales/{en,es}.json`, key union regenerated with `npm run i18n:gen-keys` (`dnd-app/package.json:34`).
- Free local port for the control server: nothing in `bmo/` uses 5003-5009 except 5002 (reserved for PHASE-42 blue/green). This phase uses **5006** (`DM_BOT_CONTROL_PORT`).

## Sub-phases

Order keeps both trees green: Pi-side bot fixes first (20A-20E, each pytest-checkable), then the dnd-app side (20F-20G), docs last (20H).

### 20A — Bot hygiene: `_log` kwargs crash, configurable guild/channel, truthful join errors

**Objective:** fix the self-crashing error handler (F9); make voice-channel/guild selection configurable (F8); make join failures distinguishable from channel-not-found (F8).

**Files:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py` (new), `bmo/.env.template`.

**Steps:**
1. Extend `_log` (`discord_dm_bot.py:63-66`) to `def _log(msg: str, *args, exc_info: BaseException | None = None) -> None`; when `exc_info` is passed, append `"".join(traceback.format_exception(exc_info))` after the formatted line (add `import traceback` to the module imports). The `on_app_command_error` call at `:588` then works unchanged.
2. Add env-config next to `DUNGEON_CHANNEL_NAME` (`:51`):
   ```python
   DUNGEON_CHANNEL_NAME = os.environ.get("DISCORD_DM_VOICE_CHANNEL", "\U0001f5fa️ | Dungeon")
   DUNGEON_CHANNEL_ID = os.environ.get("DISCORD_DM_VOICE_CHANNEL_ID", "")  # numeric ID wins over name
   ```
3. Rework `find_dungeon_channel(guild)` (`:818-823`): if `DUNGEON_CHANNEL_ID` is set and parses to int, return `guild.get_channel(int(...))` when it is a `discord.VoiceChannel` in that guild; else fall back to the exact-name scan. Keep the method async (callers await it; tests monkeypatch it).
4. Add a guild-selection helper `def _candidate_guilds(bot) -> list[discord.Guild]`: when `bot._guild_id` is set (`GUILD_ID` env, `:48,553`), return only that guild (via `bot.get_guild`); otherwise all `bot.guilds`. Used by the control-server start path in 20C and by `start_voice_listen` (`:866` loop) — replace `for guild in self.guilds:` with `for guild in _candidate_guilds(self):`.
5. Make `join_voice` (`:825-835`) failure-truthful: return `tuple[Optional[discord.VoiceClient], Optional[str]]` — `(vc, None)` on success, `(None, f"{type(e).__name__}: {e}")` on exception. Update the three call sites: slash `dm_start` (`:375-378` — show the reason in the followup), `start_voice_listen` (`:869` — log it), and the bridge start path (rewritten in 20C anyway). Keep `self.session.voice_client`/`voice_channel_id` assignment on success.
6. Document the new env vars in `bmo/.env.template` next to `DISCORD_GUILD_ID` (line 73).

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_dm_bot_voice.py tests/test_dm_bot_control.py -q` (new test file seeds: `_log(..., exc_info=ValueError("x"))` doesn't raise; `find_dungeon_channel` honors ID override; `join_voice` returns `(None, reason)` on a raising `channel.connect`).

**Acceptance:** `on_app_command_error` path no longer raises `TypeError`; channel/guild selectable via `DISCORD_DM_VOICE_CHANNEL[_ID]` + `DISCORD_GUILD_ID`; join failure reason propagates.

### 20B — Honest `_speak`: status results + narration queue (no more cooldown drops)

**Objective:** replace the four silent `None` returns (F3) with explicit statuses and replace the cooldown skip-drop with a bounded FIFO queue, so the control plane can report spoken/queued/dropped truthfully and nothing waits 15s on playback (F4 groundwork).

**Files:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py`.

**Steps:**
1. Add to `DMSession.__init__` (`:271-290`): `self.narration_queue: asyncio.Queue = asyncio.Queue(maxsize=20)` and clear it in `reset()` (drain via `get_nowait()` loop).
2. Add a queue worker on `DMBot`: `async def _narration_worker(self) -> None` — forever: `item = await self.session.narration_queue.get()`; honor the TTS cooldown by `await asyncio.sleep(remaining)` instead of dropping; call the (renamed) synthesis path; `task_done()`. Start it once in `setup_hook` via `self._narration_task = asyncio.create_task(self._narration_worker())`; cancel it in an overridden `async def close()` before `await super().close()`.
3. Split `_speak` (`:762-793`):
   - `def queue_narration(self, text, npc=None, emotion=None) -> str` (sync, callable from the control server): returns `'no_voice'` when `not vc or not vc.is_connected()` (preserve `:769-771` semantics); `'dropped_queue_full'` when `queue.full()`; else `put_nowait(...)` → `'queued'`.
   - `async def _synthesize_and_play(self, text, npc, emotion) -> str`: the old body minus the cooldown-skip — returns `'spoken'` on success, `'tts_error'` on the `:789-791` path, `'play_error'` when `_play_audio` fails. Change `_play_audio` (`:795-814`) to return `bool` (False on the `:813-814` exception path). **Keep `tts_text = text[:500]` (`:781`) exactly as is — PHASE-21 owns chunking.**
   - Keep an `async def _speak(self, text, npc=None, emotion=None) -> str` wrapper that calls `queue_narration` (greeting/farewell/initiative call sites at `:429,467,981` and `_handle_player_input` `:760` stay working; farewell ordering in the stop path is handled in 20C step 4).
4. Track `self.session.last_narration_status: str | None` (set by the worker after each item) for /status surfacing.

**Cheap checks:** `python -m pytest tests/test_dm_bot_control.py -q` — cases: `queue_narration` returns `no_voice` with no vc; returns `queued` then worker (driven manually with mocked `_synthesize_and_play`) consumes FIFO; queue full → `dropped_queue_full`; cooldown causes delay not drop (mock `time.time`).

**Acceptance:** no code path silently drops narration without a distinct status; two back-to-back narrations <3s apart both play (second is queued, not skipped).

### 20C — Control plane: aiohttp control server in the bot process + `app.py` proxy (fixes the process split)

**Objective:** give the bot process a loopback HTTP control API and turn the four Flask endpoints into thin proxies — `get_dm_bot()` finally reaches a live bot (F1); narrate becomes idempotent + non-blocking (F4); start gets parity + truthful errors (F7, F8); stop becomes idempotent and bounded (F4).

**Files:** `bmo/pi/bots/dm_bot_control.py` (new), `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/app.py`, `bmo/pi/tests/test_dm_bot_control.py`, `bmo/pi/tests/test_app_endpoints.py` (if it asserts on the old handlers), `bmo/.env.template`.

**Steps:**
1. **New `bmo/pi/bots/dm_bot_control.py`** (import style per repo rule: `from bots.discord_dm_bot import ...` never bare). Exports `async def start_control_server(bot) -> web.AppRunner` and `CONTROL_PORT = int(os.environ.get("DM_BOT_CONTROL_PORT", "5006"))`. Uses `aiohttp.web` `AppRunner`/`TCPSite` bound to `127.0.0.1` ONLY (loopback control plane — auth is the Pi box boundary, same trust model as the existing `get_dm_bot()` in-process call):
   ```python
   runner = web.AppRunner(app); await runner.setup()
   site = web.TCPSite(runner, "127.0.0.1", CONTROL_PORT); await site.start()
   ```
   Routes (all JSON):
   - `POST /control/start` — body `{campaign_id?, text_channel_id?}`. 409 `{error:"session_active"}` if `bot.session.active`. Iterate `_candidate_guilds(bot)`; `find_dungeon_channel`; if none found anywhere → 404 `{error:"channel_not_found", channel:DUNGEON_CHANNEL_NAME}`. `join_voice` → on `(None, reason)` → 502 `{error:"join_failed", reason}`. On success, FULL parity with the slash command (`discord_dm_bot.py:380-401`): set `active`, `start_time`, clear `messages`/`combat_log`/**`initiative_order`** and zero **`initiative_round`** (F7), seed `players` from channel members, start campaign memory (mirror `app.py:2821-2823`), and set `text_channel_id = int(body.get("text_channel_id") or channel.id)` — Discord voice channels are text-capable, so VTT-driven sessions get in-VC text chat instead of a dead `on_message` (F7). `await bot.start_voice_listen()`; queue the greeting via `queue_narration`. Return `{ok:true, campaign_id, guild_id, voice_channel_id, text_channel_id}`.
   - `POST /control/stop` — idempotency guard `bot._stopping: bool` (init False in `DMBot.__init__`, reset in `session.reset()` aftermath): if already stopping → 200 `{ok:true, already_stopping:true}`; if not active → 404 `{error:"no_session"}`. Set `_stopping`, then: recap bounded with `recap = await asyncio.wait_for(_generate_recap(bot.session), timeout=10)` (fall back to `""` on `TimeoutError` — keeps the whole handler under the VTT's 15s abort, F4); end campaign memory; queue farewell; `await bot.leave_voice()` after a bounded playback wait (max ~3s, do NOT loop unbounded on `vc.is_playing()`); `session.reset()`; clear `_campaign_name`/`_session_id`/`_stopping`. Return `{ok:true, recap}`.
   - `POST /control/narrate` — body `{text, npc?, emotion?, event_id?}`. 400 if no text. **Idempotency:** module-level bounded insertion-ordered set (cap 500, mirror the pattern at `dnd-app/src/main/bmo-bridge.ts:95-107`); duplicate `event_id` → 200 `{ok:true, result:"duplicate"}` without queueing. Else `result = bot.queue_narration(text, npc, emotion)` and return 200 `{ok:true, result}` for `queued`, 200 `{ok:false, result}` for `no_voice`/`dropped_queue_full` (HTTP 200 so the VTT client never retries — the response body is the truth; retrying a drop would double-speak, F4).
   - `GET /control/status` — `{running:true, active, players, start_time, message_count, combat_log_count, initiative_round, initiative_order:[{name,total}], voice_connected: bool(vc and vc.is_connected()), voice_channel_id, queue_len: session.narration_queue.qsize(), last_narration_status, last_session_end}` (F10, F11, F12 surfacing; `last_session_end` from 20D).
2. **Wire it into the bot:** in `DMBot.setup_hook` (`discord_dm_bot.py:576-584`), after command sync: `from bots.dm_bot_control import start_control_server; self._control_runner = await start_control_server(self)`; in the `close()` override (added 20B step 2) `await self._control_runner.cleanup()` when set.
3. **Rewrite the four Flask routes as proxies** (`app.py:2789-2946`), keeping the exact same external paths, the `/api/v1/` aliases, and the `@limiter.limit(RATE_LIMIT_NARRATE)` decorator on narrate (`:2893`). Each handler: `import requests as http_requests` (local import per app.py precedent at `:2283`), forward the JSON body to `http://127.0.0.1:{DM_BOT_CONTROL_PORT}/control/<name>` with timeouts `(2, 12)` (connect, read), and relay the bot's status code + JSON verbatim. `requests.ConnectionError`/`Timeout` → 503 `{"error": "DM bot not running"}` (truthful: the bot process is down/unreachable — F1's old lie becomes the real signal). Delete the `get_dm_bot()`/`run_coroutine_threadsafe` bodies (`:2796-2845,2852-2888,2904-2919,2926-2946`). Read the port once: `DM_BOT_CONTROL_PORT = os.environ.get("DM_BOT_CONTROL_PORT", "5006")` near the route block.
4. Update the slash `dm_stop` path to also bound its playback wait and reuse the `_stopping` guard so slash + bridge stops can't interleave (`discord_dm_bot.py:434-496`).
5. Add `DM_BOT_CONTROL_PORT` to `bmo/.env.template`.
6. Tests (`test_dm_bot_control.py`): use `aiohttp.test_utils` (`AioHTTPTestCase` or `aiohttp_client`-style fixtures with the raw `web.Application` from a `build_control_app(bot)` factory — structure the module so the app is buildable without binding a port): start parity (initiative cleared, text_channel_id set to the VC id), start error truthfulness (channel_not_found vs join_failed vs session_active), narrate duplicate event_id → `"duplicate"` + queue untouched, narrate no-vc → `ok:false,result:"no_voice"`, stop idempotency (second concurrent → `already_stopping`), status shape includes `voice_connected`/`queue_len`/`initiative_order`. For app.py proxy: in `test_app_endpoints.py`, mock `requests.post`/`requests.get` to assert forwarding + the 503-on-ConnectionError mapping.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_dm_bot_control.py tests/test_app_endpoints.py -q && python -c "import ast,sys; ast.parse(open('app.py').read())"`.

**Acceptance:** with the bot process up, `curl -X POST localhost:5000/api/discord/dm/start` reaches the live bot; narrate never blocks on playback and never reports `ok:true` for a drop; duplicate eventIds are not re-spoken; stop is idempotent and returns < 15s.

### 20D — Voice-health loop (rejoin) + auto-leave parity

**Objective:** the bot rejoins voice after unrecoverable drops (F10) and auto-leave behaves like a real session end the VTT can observe (F11).

**Files:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py`.

**Steps:**
1. Add `async def _voice_health_loop(self) -> None`: every 20s, if `session.active` and (`not vc or not vc.is_connected()`): log, then force-clean any stale client before rejoining — `if vc: await vc.disconnect(force=True)` wrapped in try/except (discord.py keeps kicked clients in a stale "connected-ish" state; force-disconnect + reconnect is the documented workaround — see Research notes), `self.session.voice_client = None`, then `await self.start_voice_listen()`. Backoff: after 3 consecutive failed rejoins, check every 60s instead until one succeeds. Start the task in `setup_hook` alongside the narration worker; cancel in `close()`.
2. Rework `_auto_leave_if_empty` (`:877-890`) for parity with stop: guard with `_stopping`; bounded recap (`asyncio.wait_for(_generate_recap(...), 10)`, fallback `""`); `_campaign_memory.end_session(_session_id, recap)` when available; clear `_campaign_name`/`_session_id`; record `self._last_session_end = {"reason": "auto_leave_empty", "at": datetime.now(timezone.utc).isoformat(), "recap": recap}` (module-visible via `/control/status` `last_session_end`, 20C); then `leave_voice()` + `session.reset()`. Also set `_last_session_end` (`reason: "stopped"`) on the stop paths so /status always explains the most recent end.
3. The VTT-facing contract for F11 is: status polling (20G) shows `active:false` + `last_session_end.reason == "auto_leave_empty"`, and the next narrate returns 404 `no_session` from the proxy which the renderer turns into a single self-clearing alert (20F) — no vtt_sync dependency (PHASE-22 owns push).

**Cheap checks:** `python -m pytest tests/test_dm_bot_control.py -q` — health loop rejoins when `is_connected()` flips false (mock `start_voice_listen`); auto-leave ends campaign-memory session + populates `last_session_end`; `_stopping` prevents auto-leave racing a stop.

**Acceptance:** kill the simulated voice connection → bot attempts rejoin within ≤20s; auto-leave produces a recap, a closed memory session, and an observable status trace.

### 20E — `/initiative` actually tracks the order

**Objective:** make the `/initiative` embed's promise ("BMO will track the order as you roll!", `discord_dm_bot.py:969`) true (F12).

**Files:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py`.

**Steps:**
1. Add `self.initiative_collecting: bool = False` to `DMSession.__init__` + `reset()`.
2. `/initiative` command (`:948-983`): add an optional `action` param (`app_commands.choices`: `start` (default) / `show` / `end`). `start`: clear order, `initiative_round = 1`, `initiative_collecting = True`, keep the embed (text unchanged — it's now true). `show`: render the current order (sorted desc by total, `1. Name — 17` lines; "No rolls yet" when empty). `end`: `initiative_collecting = False`, round stays for status; embed confirms.
3. In `_roll_cmd` (`:896-945`), after the session log block (`:940-945`): if `bot.session.active and bot.session.initiative_collecting and "d20" in expr.lower()`, upsert `{"name": interaction.user.display_name, "total": total}` into `session.initiative_order` (replace an existing entry for the same name), re-sort desc by total, and append a footer line to the roll embed: `Initiative recorded — current order: A (17), B (12)` (truncate to ~6 entries).
4. `/control/status` already exposes `initiative_order` (20C step 1) — confirm it serializes the upserted entries.

**Cheap checks:** `python -m pytest tests/test_dm_bot_control.py -q` — d20 roll during collection records + replaces per-player; non-d20 and out-of-collection rolls don't; `show` ordering correct.

**Acceptance:** `/initiative` → players `/roll 1d20+3` → `/initiative action:show` displays the sorted order; status endpoint mirrors it.

### 20F — dnd-app main: single toggle-gated narration sender, eventId, honest results, 4xx-unreachable fix

**Objective:** ONE narration sender (main process, which has npc/emotion), actually gated by the renderer toggle; idempotency key on every narrate; structured results surfaced to the renderer; 4xx no longer counts toward "BMO unreachable" (F2, F4, F6).

**Files:** `dnd-app/src/main/bmo-bridge.ts`, `src/main/ai/ai-service.ts`, `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/stores/use-narration-tts-store.ts`, `src/renderer/src/hooks/use-game-effects.ts`, `src/main/bmo-bridge.test.ts`, `src/renderer/src/stores/use-narration-tts-store.test.ts`.

**Steps:**
1. **4xx fix** (`bmo-bridge.ts:141-158`): when the loop exits via the 4xx break, the Pi answered — reset the counter instead of incrementing. Concretely: replace the post-loop `consecutiveBmoFailures++ / ===3` block with logic that runs ONLY when `last.statusCode` is undefined or ≥500; a 4xx sets `consecutiveBmoFailures = 0` and returns `last` directly. Extend `bmo-bridge.test.ts` (suite at `:26`): "a 4xx response resets the unreachable counter" (3 sequential 404s must NOT emit the unreachable event).
2. **eventId on narrate** (`bmo-bridge.ts:171-176`): `sendNarration(text, npc?, emotion?)` adds `event_id: crypto.randomUUID()` (Node ≥19 global; `node:crypto` import if lint demands) to the POST body. The `result` field from the Pi (`queued`/`no_voice`/`dropped_queue_full`/`duplicate`) flows through `BridgeResponse`'s index signature untouched.
3. **Main-process narration gate** (`bmo-bridge.ts`): module-level `let narrationEnabled = false` + exports `setNarrationEnabled(v: boolean)` / `isNarrationEnabled()`. Default **false** = narration is opt-in and OFF until the renderer store says otherwise (safe default; matches the store's localStorage-default-false, `use-narration-tts-store.ts:10-16`).
4. **Gate + surface in `ai-service.ts:910-915`**: wrap the `sendNarration` call in `if (isNarrationEnabled())`. On a resolved-but-not-ok result (`!res.ok || (res.result && res.result !== 'queued' && res.result !== 'duplicate')`), broadcast a structured status to all windows on a NEW main→renderer channel `BMO_NARRATION_STATUS` (`'bmo:narration-status'` — add to `ipc-channels.ts` BMO block at `:204-207`): payload `{ ok: boolean; result?: string; error?: string; statusCode?: number }`. Add `BmoNarrationStatusSchema` to `ipc-schemas.ts` (zod object, fields optional, `ok` required) — main validates before sending; renderer types from `z.infer`.
5. **New invoke channel** `BMO_SET_NARRATION_ENABLED` (`'bmo:set-narration-enabled'`) in `ipc-channels.ts` + handler in `ai-handlers.ts` (next to the BMO block at `:654-671`): zod-parse the boolean (`z.boolean()` in `ipc-schemas.ts`), call `setNarrationEnabled`, return `{ success: true }`.
6. **Preload** (`index.ts:505-510` block): add `bmoSetNarrationEnabled(enabled: boolean)` (invoke) and `onBmoNarrationStatus(cb): () => void` — wrapped-listener pattern WITH returned unsubscribe (`const l = (_e, d) => cb(d); ipcRenderer.on(CH, l); return () => ipcRenderer.removeListener(CH, l)`) per the PHASE-05 corrected convention. Fix `index.d.ts:844-847` while here: `bmoDmStatus` return type becomes the truthful union `Promise<{ ok?: boolean; error?: string; statusCode?: number; running?: boolean; active?: boolean; players?: string[]; voice_connected?: boolean; initiative_round?: number; queue_len?: number; last_session_end?: { reason: string; at: string } | null; recap?: string }>` and add the two new entries.
7. **Renderer store syncs main** (`use-narration-tts-store.ts`): in `setEnabled`, after `persistEnabled`, fire-and-forget `window.api.bmoSetNarrationEnabled(enabled)`; also sync once at module init with the loaded value (guard `typeof window !== 'undefined' && window.api` for vitest). Update `use-narration-tts-store.test.ts` to assert the IPC call (mock `window.api`).
8. **Remove the renderer auto-senders**: delete the `narrateThroughBmo` calls at `use-game-effects.ts:267` and `:448` and the now-unused callback/store-read (`:139,146-157,496`) — main is the single auto sender with npc/emotion. KEEP `ChatPanel.tsx` `handleSpeakNarration` (`:319-324`, manual button). Replace the old failure-toast behavior: add a small `useEffect` (in `use-game-effects.ts`, near the old callback) subscribing via `window.api.onBmoNarrationStatus` → `pushDmAlert('error', t('notify.gameEffects.narrationFailed', {error}))`, deduped by reason: keep the last alerted `result` in a ref and only alert again when it changes or 60s pass (prevents one alert per AI turn while no session is active; `no_session` (statusCode 404) gets a distinct message, see 20G strings).

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/bmo-bridge.test.ts src/renderer/src/stores/use-narration-tts-store.test.ts src/renderer/src/services/bmo-narration.test.ts`.

**Acceptance:** toggle OFF → zero narrate POSTs (main gate default false); toggle ON → exactly ONE POST per AI reply, carrying npc/emotion/event_id; 404s never trip the unreachable counter; narrate failures surface as at most one deduped DM alert.

### 20G — dnd-app renderer: Discord session start/stop/status UI

**Objective:** an in-app way to start, stop, and see the Discord DM session (F5), making the toggle's target observable and the F11 auto-leave visible.

**Files:** `src/renderer/src/components/game/bottom/DiscordSessionSection.tsx` (new) + colocated `DiscordSessionSection.test.tsx`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `es.json`, `src/renderer/src/i18n/generated-keys.ts` (regenerated).

**Steps:**
1. New `DiscordSessionSection.tsx` (props: `campaignId: string`). State: `status` (`unknown | botDown | idle | active`), `players`, `voiceConnected`, `lastSessionEnd`, `busy`. Poll `window.api.bmoDmStatus()` on mount + every 20s while mounted (clear interval on unmount); map `{ok:false}` → `botDown`, `{active:false}` → `idle`, else `active`.
2. UI (match the DM-tab button classes, `DMTabPanel.tsx:35-41`): status badge dot (gray unknown / red botDown / yellow idle / green active + mic icon state from `voiceConnected`), player list when active, `Start session` button (`bmoStartDm(campaignId)`; on `{ok:false}` show the structured error — `channel_not_found`/`join_failed` reasons come through from 20C), `Stop session` button (`bmoStopDm()`; when the response carries a non-empty `recap`, show it in a dismissible block). When `lastSessionEnd?.reason === 'auto_leave_empty'` and status is `idle`, render an informational line ("Session auto-ended — voice channel was empty"). Refresh status immediately after start/stop resolves.
3. Render the section inside `DMTabPanel`'s AI-DM tab content, adjacent to the Speak-narration toggle (`DMTabPanel.tsx:231-239`) — DM-only surface already (whole panel is DM-side), no behavior change unless the user clicks; the section is informational by default. When status is not `active` and the narration toggle is ON, show an inline hint ("Speak narration is on but no Discord session is active").
4. i18n: add `game.discordSession.*` keys (status labels, buttons, errors `channelNotFound`/`joinFailed`/`botDown`/`sessionActive`, autoEnded, noSessionHint, recapTitle) to `en.json` AND `es.json`; run `npm run i18n:gen-keys`.
5. Colocated test (`DiscordSessionSection.test.tsx`, vitest + testing-library per repo convention): mocks `window.api` — renders idle state, start button calls `bmoStartDm` with the campaign id, `{ok:false,error:...}` start result renders the error, active status renders players + stop, stop response recap renders, botDown renders the bot-down message.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/game/bottom/DiscordSessionSection.test.tsx && npm run i18n:gen-keys` (verify no diff beyond the new keys).

**Acceptance:** DM can start/stop a Discord session from the DM tab and see live status (running/active/voice/players); every failure mode shows its real reason; nothing auto-starts.

### 20H — Docs + env truth

**Objective:** document the new control plane and env vars so the deployed Pi can be updated correctly.

**Files:** `bmo/docs/SERVICES.md`, `bmo/pi/bots/README.md`, `bmo/.env.template` (verify 20A/20C additions landed), `docs/ARCHITECTURE.md` (the VTT→BMO protocol section).

**Steps:**
1. `bmo/docs/SERVICES.md`: under the DM-bot service entry, document the control server (loopback :5006, `DM_BOT_CONTROL_PORT`), the proxy relationship (`bmo` Flask `/api/discord/dm/*` → `bmo-dm-bot` `/control/*`), and that 503 now truthfully means "bot process down".
2. `bmo/pi/bots/README.md`: env table additions (`DISCORD_DM_VOICE_CHANNEL`, `DISCORD_DM_VOICE_CHANNEL_ID`, `DM_BOT_CONTROL_PORT`), narrate result vocabulary (`queued|duplicate|no_voice|dropped_queue_full`), session-end reasons.
3. `docs/ARCHITECTURE.md`: update the VTT↔BMO protocol description for the narrate contract (event_id + result field) and the status fields the VTT UI consumes.
4. No systemd changes are required (the control server lives inside the existing `bmo-dm-bot` unit; `setup-bmo.sh` untouched) — state this explicitly in SERVICES.md. Deployment note for the user: both `bmo` and `bmo-dm-bot` need a restart after pulling (per CLAUDE.md, warn — do not restart unprompted).

**Cheap checks:** none beyond markdown read-through; `grep -n "DM_BOT_CONTROL_PORT" bmo/.env.template bmo/docs/SERVICES.md`.

**Acceptance:** every new env var + endpoint + result code is documented; no doc claims behavior the code doesn't have.

## Research notes

- **Control endpoint over in-process bot.** Two fixes were possible for F1: (a) call `start_dm_bot()` from `app.py` (in-process thread), or (b) a control API inside the bot process that Flask proxies to. Chose (b): it preserves the deployed topology (separate `bmo-dm-bot` unit with its own `MemoryMax=512M`/`CPUQuota=50%` caps, `setup-bmo.sh:301-326`), avoids running discord.py's gateway + opus + ffmpeg inside the gevent-monkeypatched Flask process (`app.py:11` `from gevent import monkey` — discord.py's asyncio loop and gevent monkeypatching in one process is a known hazard), and keeps `systemctl restart bmo` from dropping the voice connection. Running a small aiohttp app inside the bot's own event loop is the standard pattern, and aiohttp ships with discord.py already (`requirements.txt:14,75`). Threaded-Flask-next-to-bot is the documented anti-pattern. Sources: aiohttp AppRunner/TCPSite for serving inside an existing loop — https://docs.aiohttp.org/en/stable/web_advanced.html (Application runners: `AppRunner(app)` → `await runner.setup()` → `TCPSite(runner, host, port)` → `await site.start()`, cleanup via `await runner.cleanup()`); the Flask-in-a-thread anti-pattern gist (titled "Don't use if you can") — https://gist.github.com/crrapi/c8465f9ce8b579a8ca3e78845309b832.
- **Idempotency key for narrate.** Client-generated unique key per logical request, server replays/acks duplicates instead of re-executing — the IETF HTTPAPI draft formalizes the semantics (we carry it in the JSON body as `event_id` rather than the header since the existing Pi→VTT direction already does exactly that, `bmo-bridge.ts:87-107`). Source: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ . Returning HTTP 200 with `ok:false` + a `result` body for drop cases is deliberate: `bmoPiFetch` retries 5xx (`bmo-bridge.ts:150-153`), and a retried drop would double-speak once the cooldown lapses — the body, not the status code, is the truth channel for "delivered but not spoken".
- **Voice reconnect.** discord.py historically mishandles kicked/forced-disconnect states: the only signal is a self `VOICE_STATE_UPDATE` with `channel_id: null`; stale internal voice state can make `connect()` raise "Already connected" or loop on close code 4000, and clients can take ~60s to settle. Mitigation used in 20D: health loop checks `is_connected()`, force-disconnects any stale client (`await vc.disconnect(force=True)`, swallow errors) before rejoining, with backoff. `VoiceClient.cleanup()` removal from the internal cache is what prevents "still connected" ghosts. Sources: https://github.com/Rapptz/discord.py/issues/2130 (kicked → infinite reconnections), https://github.com/Rapptz/discord.py/issues/1954 (deleted channel → reconnect loop), https://github.com/Rapptz/discord.py/issues/9575 (forced disconnect takes ~1 min to settle), https://discordpy.readthedocs.io/en/latest/api.html (VoiceChannel.connect `reconnect`/`timeout` params; VoiceClient.cleanup contract).
- **Queue-not-drop for cooldown.** The 3s `TTS_COOLDOWN` exists to protect the cloud TTS rate limit, not to discard content; an `asyncio.Queue` + single worker preserves ordering and the existing `_play_audio` serialization (`while vc.is_playing()` wait) while making every outcome reportable. Bounded (20) so a stuck voice connection can't grow memory unbounded; overflow is an explicit `dropped_queue_full`. This queue is the exact seam PHASE-21's sentence-chunked streaming TTS plugs into (chunks become queue items), which is why the truncation at `discord_dm_bot.py:781` is left untouched here.
- **Alternatives considered:** (1) Unix domain socket instead of TCP for the control plane — cleaner isolation but aiohttp's `web.UnixSite` + Flask `requests` over UDS needs `requests-unixsocket` (new dep); loopback TCP on a reserved port keeps zero new dependencies. (2) Renderer-side single sender instead of main — rejected: npc/emotion are parsed in main (`ai-service.ts:877`) and the off-LAN architecture routes Pi HTTP through main anyway. (3) Pushing session-end events Pi→VTT now — rejected: that is PHASE-22's sync plane; polling + honest narrate results cover the UX need without cross-phase file collisions.

## Test plan

- **20A/20B/20C/20D/20E:** new `bmo/pi/tests/test_dm_bot_control.py` (hardware-free, conftest mocks; `pytest.ini` `asyncio_mode = auto`): `_log` exc_info; channel-ID override; `join_voice` failure reason; `queue_narration` statuses + FIFO worker + cooldown-delay-not-drop; control routes via a `build_control_app(bot)` aiohttp test client (start parity/errors, narrate idempotency + honest results, stop idempotency + bounded recap, status shape); voice-health rejoin; auto-leave recap/memory/last_session_end; initiative upsert/sort/show. Update `bmo/pi/tests/test_app_endpoints.py` for the proxy rewrite (mock `requests`; assert forward + 503 mapping). Existing `test_dm_bot_voice.py` must stay green (only `join_voice`'s return shape changes — update its assertions if it touches that signature).
- **20F:** extend `dnd-app/src/main/bmo-bridge.test.ts` (4xx never increments the unreachable counter; narrate body carries `event_id`); update `src/renderer/src/stores/use-narration-tts-store.test.ts` (IPC sync on set + init); `src/renderer/src/services/bmo-narration.test.ts` stays green (manual path unchanged).
- **20G:** new colocated `DiscordSessionSection.test.tsx` (render states, start/stop wiring, error + recap rendering).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` — PLUS `cd bmo/pi && python -m pytest tests/` since Pi code is touched.

## Acceptance criteria

1. `app.py`'s four `/api/discord/dm/*` routes proxy to a live control server inside the `bmo-dm-bot` process; `get_dm_bot()`/`run_coroutine_threadsafe` no longer appear in `app.py`; 503 means the bot process is actually down.
2. Exactly one automatic narration sender exists (main process), gated by the Speak-narration toggle (default OFF), passing npc/emotion and a fresh `event_id` per reply; the renderer auto-send call sites (`use-game-effects.ts:267,448`) are gone; the manual ChatPanel speak button still works.
3. Narrate responses distinguish `queued` / `duplicate` / `no_voice` / `dropped_queue_full`; nothing returns success for a drop; a duplicated `event_id` is never spoken twice; cooldown queues instead of dropping; narrate never blocks on playback (returns immediately after enqueue).
4. Stop (bridge and slash) is idempotent under retry and completes within the client's 15s budget (recap bounded at 10s).
5. A 4xx from the Pi never increments the unreachable counter (regression test in `bmo-bridge.test.ts`).
6. Bridge-started sessions clear initiative state and set a usable `text_channel_id` (the voice channel's chat by default) — `on_message` responds during VTT-driven sessions.
7. Voice channel + guild are env-configurable; start failures report `channel_not_found` vs `join_failed` (with reason) vs `session_active` distinctly.
8. Slash-command errors log with traceback and send the user-facing apology (no `TypeError` in `_log`).
9. A dropped voice connection during an active session is rejoined automatically (≤20s detection); `/api/discord/dm/status` exposes `voice_connected`, `queue_len`, `initiative_order`, and `last_session_end`.
10. Auto-leave generates a bounded recap, closes the campaign-memory session, and is observable from the VTT (status + the in-app section's "auto-ended" notice).
11. `/initiative` records d20 rolls into a visible, sorted order (`action:show`), making the embed text true.
12. The DM tab shows Discord session status with working Start/Stop; all new strings exist in `en.json` + `es.json`; the 4-gate (+ `pytest bmo/pi/tests/`) is green.

## Out of scope

- Sentence-chunked / streaming TTS, the `text[:500]` truncation, barge-in cancellation, per-NPC voice casting, emotion-prosody map completion → **PHASE-21**.
- The bidirectional sync plane: preload exposure of `BMO_SYNC_EVENT`/`BMO_SYNC_INITIATIVE`, renderer listeners, `register_sync_routes`, bot push-helper wiring (`push_player_join`/`push_player_leave` etc.), `VTT_SYNC_URL`/bind/bearer-auth contract, `scripts/apply_patch.py` removal, "Push to Discord" TEXT narration (`discord-service.ts`) → **PHASE-22**.
- The dead `ai-stream-handler.ts`/`finalizeAiResponse` duplicate pipeline (its copy also "sends narration to Discord") → **PHASE-08** owns its deletion; do not extend it here.
- Hardcoded "Ollama" label and other DM-panel truth fixes in `DMTabPanel.tsx` → **PHASE-10**.
- Async play-by-post turn queue on the Pi → **PHASE-36**.
- BMO deploy automation (getting this onto the Pi via CI) → **PHASE-42**; this phase only documents the manual restart requirement.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 — file:line citations + one-line summaries per sub-phase. -->
