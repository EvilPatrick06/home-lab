# PHASE-36 — Async play-by-post mode (persistent Pi turn queue + Discord turn pings)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Add an asynchronous play-by-post (PBP) campaign mode: a per-scene turn queue that lives on the 24/7 Pi (persisted to disk, surviving bot/service restarts) plus Discord pings that @-mention whoever is up, with a configurable reminder cadence and an optional auto-skip for overdue turns. Scheduling kills multiplayer campaigns; an AI DM is always available, so a campaign can keep moving at everyone's pace — the DM starts a PBP scene from the VTT, players claim their slot in Discord with `/pbp claim`, each finalized AI reply (or a manual "End turn") advances the queue, and the Pi pings the next player. Everything is opt-in and off by default: no pings, no Discord posts, and no turn tracking happen unless the DM explicitly starts a PBP session for the campaign.

## Dependencies & cross-phase notes

- **Depends on PHASE-20 (`discord-bridge-foundation`)** — hard prerequisite per PHASE-INDEX row 36. This phase extends three things PHASE-20 creates: (1) the bot-process aiohttp control server `bmo/pi/bots/dm_bot_control.py` (loopback `127.0.0.1:${DM_BOT_CONTROL_PORT:-5006}`, routes under `/control/*`, app factory `build_control_app(bot)` testable without binding a port); (2) the `app.py` proxy pattern (Flask `/api/discord/dm/*` → `requests.post("http://127.0.0.1:{port}/control/<name>", timeout=(2, 12))`, `ConnectionError`/`Timeout` → 503 `{"error": "DM bot not running"}`); (3) the `_candidate_guilds(bot)` guild-selection helper and the `close()` override that cancels background tasks. If any of these is missing at execution time, PHASE-20 has not landed — stop per INSTRUCTIONS.md rule 9.
- **Coordinate with PHASE-16 (`bmo-blueprint-refactor`)** on `bmo/pi/app.py`: PHASE-16 extracts ~2,900 lines into blueprints but explicitly leaves the Discord bridge block in `app.py` (PHASE-16 plan, "Discord DM bridge | 2787–2948 | stays"). All `app.py` line numbers below WILL have shifted by execution time — locate the Discord bridge block by grep (`grep -n "api/discord/dm" bmo/pi/app.py`), never by line. PHASE-16 also moves `limiter` + the `RATE_LIMIT_*` constants into `bmo/pi/extensions.py` — import the limiter from wherever it lives at execution time (`grep -rn "limiter = Limiter" bmo/pi/`).
- **Coordinate with PHASE-22 (`discord-sync-plane`)** on `dnd-app/src/main/bmo-bridge.ts`: PHASE-22 owns the Pi→VTT push plane (preload exposure of `BMO_SYNC_EVENT`, renderer listeners, `register_sync_routes`, bearer auth). This phase deliberately uses VTT→Pi polling only for PBP status — do NOT add a Pi→VTT push for turn changes here. PHASE-22 may later push `pbp_turn` events through its plane; the polling contract here keeps working regardless.
- **Coordinate with PHASE-20 on `dnd-app/src/renderer/src/hooks/use-game-effects.ts`**: PHASE-20 sub-phase 20F deletes the renderer `narrateThroughBmo` auto-send call sites (`use-game-effects.ts:267,448` pre-20 numbering). This phase adds a PBP auto-advance hook to the same per-AI-message effect — apply it to the post-20F shape of the file.
- **Coordinate with PHASE-10 and PHASE-20 on `DMTabPanel.tsx`**: PHASE-10 fixes the hardcoded "Ollama" label; PHASE-20 sub-phase 20G adds `DiscordSessionSection` to the AI-DM tab. This phase adds `PlayByPostSection` adjacent to it — merge conflicts are textual only; keep edits scoped.
- **Coordinate with PHASE-12 (i18n sweep)**: all new strings land in BOTH `en.json` and `es.json` + regenerate `generated-keys.ts` (`npm run i18n:gen-keys`, `dnd-app/package.json:34`).
- **Coordinate with PHASE-09 (chat-commands cleanup)**: this phase adds NO new chat commands (PBP controls are UI buttons + Discord slash commands), so there is no registry collision.
- **PHASE-31 (`recaps-qa-assistant`)** also touches BMO campaign-memory surfaces; this phase only *reads* nothing from campaign memory and *writes* nothing to it — no collision.
- Per INSTRUCTIONS.md rule 5, this phase touches Pi code: the end-of-phase gate includes `pytest bmo/pi/tests/` (rule 5 names phase 36 explicitly).

## Verified findings

All verified 2026-06-10 against the live tree. The audit file this absorbed is deleted; everything an executor needs is here. The audit's single entry for this phase was a recommendation: *"Asynchronous play-by-post campaign mode with Discord turn pings. Scheduling kills multiplayer campaigns; an AI DM is always available. A per-scene turn queue persisted on the 24/7 Pi + the existing Discord integration pinging whoever is up enables async play — a real differentiator vs session-only VTTs. Source: fables.gg."* Findings F1–F10 below verify the current state the feature builds on. One correction to the audit's framing: **"the existing Discord integration" cannot ping anyone today** — pre-PHASE-20 the entire VTT→Discord bridge is dead by process topology (Flask reads a process-local bot singleton that lives in a different systemd unit), and even post-PHASE-20 there is no player↔Discord-user mapping anywhere in the system; this phase must build the mapping (`/pbp claim`) and depends on PHASE-20's control plane for liveness.

### F1 — No play-by-post code exists anywhere; clean greenfield

```bash
grep -rni "play.by.post\|pbp" --include="*.py" --include="*.ts" --include="*.tsx" bmo/ dnd-app/src/
# → empty (only this plan file mentions it)
```

### F2 — The Discord DM bot: process model, session state, mention safety (the foundation)

- The bot runs as its own systemd unit: `bmo/setup-bmo.sh:312` → `ExecStart=.../venv/bin/python -m bots.discord_dm_bot` (`bmo-dm-bot.service`), separate from Flask (`bmo.service`, `setup-bmo.sh:223`). PHASE-20 gives the bot process a loopback control server; everything PBP that needs the live Discord client (sending pings, resolving channels/users) must live in the **bot** process and be reached through that control server.
- `DMSession` (`bmo/pi/bots/discord_dm_bot.py:268-303`) is voice-session state (active, voice_client, text_channel_id, messages, initiative_order…) and is fully **in-memory** — `reset()` wipes it. PBP state must NOT live here: a PBP campaign spans days/weeks and must survive restarts. PBP gets its own disk-backed store (F5 pattern).
- `DMBot.__init__` (`discord_dm_bot.py:538-575`) already sets safe mention defaults: `discord.AllowedMentions(everyone=False, roles=False, users=True, replied_user=True)` at `:548-551` — **user mentions are allowed**, so turn pings work without touching mention config. Intents include `members = True` (`:543`). Slash commands are registered in `__init__` via `self.tree.add_command(dm_group)` + a list of standalone commands (`:568-575`); a new `pbp_group` registers the same way. `setup_hook` (`:576-597`) syncs the tree (guild-scoped when `GUILD_ID` env is set, `:48,553`).
- `on_message` (`:663-686`) only feeds the *voice* session's AI loop and early-returns when `session.text_channel_id` is unset — PBP must not depend on it.

```bash
sed -n '268,303p;538,575p;548,551p' bmo/pi/bots/discord_dm_bot.py
grep -n "ExecStart" bmo/setup-bmo.sh        # 223 = app.py (bmo), 312 = -m bots.discord_dm_bot
grep -n "allowed_mentions\|intents.members" bmo/pi/bots/discord_dm_bot.py
```

### F3 — Flask bridge routes + rate-limit precedent

`bmo/pi/app.py` hosts the four `/api/discord/dm/*` routes (pre-PHASE-16/20: `:2789-2946`; **re-grep at execution time**). Each has an `/api/v1/...` alias route decorator. Narrate carries `@limiter.limit(RATE_LIMIT_NARRATE)` with `RATE_LIMIT_NARRATE = os.environ.get("BMO_NARRATE_RATE_LIMIT", "30 per minute")` (`app.py:226` pre-16). New PBP proxy routes follow the identical shape: paired route decorators, env-overridable rate limit, thin proxy to the control server (PHASE-20 pattern).

```bash
grep -n "api/discord/dm\|RATE_LIMIT_NARRATE\|limiter.limit" bmo/pi/app.py | head -20
```

### F4 — dnd-app bridge / IPC / preload plumbing (the VTT side to extend)

- `dnd-app/src/main/bmo-bridge.ts`: `bmoPiFetch` with 15s per-attempt abort (`:16`), 200/800/2000 ms retry backoff that never retries 4xx (`:141-158`), and `BridgeResponse` (`{ ok?, error?, statusCode?, [key: string]: unknown }`, `:62-67`). Existing bridge fns: `startDiscordDm` `:160`, `stopDiscordDm` `:167`, `sendNarration` `:171`, `getDmStatus` `:178`. The Pi→VTT direction has eventId dedup (`:91-107`, bounded insertion-ordered Set, cap 500) — the same idempotency idea is used VTT→Pi for PBP `advance`.
- IPC channels: BMO block at `src/shared/ipc-channels.ts:204-212` (`BMO_START_DM` … `BMO_SYNC_SEND_STATE`). Handlers: `src/main/ipc/ai-handlers.ts:654-671` (`// ── BMO Pi Bridge ──`), registered via `handle()` from `src/main/ipc/_safe.ts:38`; `withSchema(channel, Schema, fn)` (`_safe.ts:50+`) zod-validates the first arg before the body runs — use it for every new PBP handler.
- Zod schemas live in `src/shared/ipc-schemas.ts` (e.g. `InitiativeSyncSchema:133`, `SyncEventSchema:139`).
- Preload: BMO block `src/preload/index.ts:505-510` (`bmoStartDm`/`bmoStopDm`/`bmoNarrate`/`bmoDmStatus`); types in `src/preload/index.d.ts:843-847`. PHASE-20 fixes the `bmoDmStatus` type lie; the new `bmoPbp*` entries land in both files.

```bash
grep -n "export async function" dnd-app/src/main/bmo-bridge.ts | head
sed -n '204,213p' dnd-app/src/shared/ipc-channels.ts
grep -n "withSchema\|export function handle" dnd-app/src/main/ipc/_safe.ts
sed -n '505,511p' dnd-app/src/preload/index.ts; sed -n '843,848p' dnd-app/src/preload/index.d.ts
```

### F5 — Pi persistence precedents (what the PBP store mirrors)

- `bmo/pi/services/campaign_memory.py:15` — `DB_PATH = os.path.expanduser("~/home-lab/bmo/pi/data/campaign_memory.db")`: data files live under `~/home-lab/bmo/pi/data/`, path expanduser'd, directory created on init (`os.makedirs(..., exist_ok=True)`, `:31`). Constructor takes the path as a parameter (testable with `tmp_path`).
- `bmo/pi/services/game_registry.py` — thread-safe singleton service precedent: `threading.RLock` (`:56`), module-level `get_registry()` singleton accessor guarded by `threading.Lock` (`:325-328`), `reset_registry_for_tests()` (`:337`). The PBP store copies this shape (lock, `get_pbp_store()`, `reset_pbp_store_for_tests()`).
- `bmo/pi/data/` already exists and contains JSON state files (e.g. `monitor_alert_state.json`).

```bash
sed -n '15p;29,33p' bmo/pi/services/campaign_memory.py
grep -n "_lock\|get_registry\|reset_registry_for_tests" bmo/pi/services/game_registry.py | head
ls bmo/pi/data/ | head
```

### F6 — The VTT has campaign players but NO Discord identity for them

`Campaign.players: CampaignPlayer[]` (`dnd-app/src/renderer/src/types/campaign.ts:116,173-180`) carries `userId` (a VTT peer id), `displayName`, `characterId: string | null` — **no Discord user id exists anywhere in the campaign model** (the only Discord fields on Campaign are `discordInviteUrl?` `:127` and `aiDm.discordBridge?` `:71`). Therefore the player→Discord mapping cannot be configured from the VTT without asking users to paste numeric Discord IDs; the ergonomic fix is Discord-side self-claim (`/pbp claim`), where `interaction.user.id` is authoritative and typo-proof. The VTT seeds participant *names* (display name + character name); Discord supplies identities.

```bash
grep -n -A8 "interface CampaignPlayer" dnd-app/src/renderer/src/types/campaign.ts
grep -n "discord" dnd-app/src/renderer/src/types/campaign.ts
```

### F7 — Where AI replies finalize renderer-side (the auto-advance hook point)

`use-game-effects.ts` has a per-AI-message effect that fires once per new assistant message (adds it to chat, broadcasts, currently also calls `narrateThroughBmo(lastMsg.content)` at `:448` — deleted by PHASE-20F). `AiMessage` is `{ role: 'user' | 'assistant', content, timestamp, statChanges?, dmActions?, ruleCitations? }` (`use-ai-dm-store.ts:26-33`). The AI pipeline runs on the host/DM instance only (streams over local IPC), so a hook here fires exactly once per AI reply on exactly one machine — the correct place for opt-in auto-advance. `sendMessage(campaignId, content, characterIds, senderName?, …)` (`use-ai-dm-store.ts:111-126,323`) shows `senderName` is available at send time if attribution is wanted later; auto-advance attributes to the queue's current participant, which is the PBP-correct semantics (the reply closes the current turn whoever triggered it).

```bash
grep -n "narrateThroughBmo" dnd-app/src/renderer/src/hooks/use-game-effects.ts
sed -n '26,33p;111,127p' dnd-app/src/renderer/src/stores/use-ai-dm-store.ts
```

### F8 — Renderer store precedent for a small persisted toggle

`use-narration-tts-store.ts` (full file, 35 lines) is the repo's pattern for a tiny persisted zustand store: localStorage key, `loadPersistedEnabled()` with try/catch, `persistEnabled()` on set, default `false`. The PBP renderer store (`use-pbp-store.ts`) copies it. DM-tab toggle button classes to reuse: `btnClass`/`toggleOnClass`/`toggleOffClass` (`DMTabPanel.tsx:35-41`); the Speak-narration toggle the new section sits near is at `DMTabPanel.tsx:231-239`.

```bash
cat dnd-app/src/renderer/src/stores/use-narration-tts-store.ts
sed -n '35,41p' dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx
```

### F9 — Bot test scaffolding runs hardware-free

`bmo/pi/tests/conftest.py` mocks Pi-hardware modules into `sys.modules`; `tests/test_dm_bot_voice.py` constructs `DMBot()` directly and monkeypatches its primitives; `pytest.ini` sets `asyncio_mode = auto` (async test fns need no decorator). PHASE-20 adds `tests/test_dm_bot_control.py` with a `build_control_app(bot)` aiohttp test-client pattern — PBP control-route tests extend that file/pattern.

```bash
sed -n '1,20p' bmo/pi/tests/test_dm_bot_voice.py; cat bmo/pi/pytest.ini
```

### F10 — `turnMode` exists but is the wrong lever

`Campaign.turnMode: 'initiative' | 'free'` (`types/campaign.ts:30,108`) governs *synchronous* table flow. PBP mode is orthogonal (a campaign can be `free` and asynchronous) and is therefore a separate per-campaign runtime state on the Pi + a renderer panel — NOT a third `TurnMode` variant. Do not touch `TurnMode`; widening that union ripples through lobby/game-start code irrelevantly.

```bash
grep -n "TurnMode" dnd-app/src/renderer/src/types/campaign.ts
```

## Sub-phases

Order keeps both trees green: Pi store first (pure Python, own tests), bot manager + slash commands, control/proxy routes, then dnd-app main plumbing, renderer UI last, docs at the end.

### 36A — `services/pbp_store.py`: persistent per-campaign turn-queue store

**Objective:** a disk-backed, thread-safe store owning all PBP truth — participants, turn index, round, scene, timestamps, idempotency — so the queue survives bot restarts and the reminder loop can be reconstructed from disk alone.

**Files:** `bmo/pi/services/pbp_store.py` (new), `bmo/pi/tests/test_pbp_store.py` (new).

**Steps:**
1. Module header per repo convention (subpackage import style is N/A here — no intra-repo imports needed beyond stdlib). Constants:
   ```python
   DEFAULT_PATH = os.path.expanduser("~/home-lab/bmo/pi/data/pbp_sessions.json")  # mirrors campaign_memory.py:15
   MAX_PARTICIPANTS = 12
   MAX_HISTORY = 100
   MIN_REMINDER_HOURS, MAX_REMINDER_HOURS = 1.0, 168.0
   ```
2. `class PbpStore` with `__init__(self, path: str = DEFAULT_PATH)`: `os.makedirs(dirname, exist_ok=True)`, `self._lock = threading.RLock()`, load JSON (corrupt/missing → `{}` + log). All public methods take/return plain dicts (JSON-serializable). Persist with an atomic write: `json.dump` to `path + ".tmp"` then `os.replace(tmp, path)` under the lock.
3. Session record schema (one per `campaign_id`, the dict key):
   ```python
   {
     "active": bool,
     "scene": str,                      # free-text scene label, <=200 chars
     "participants": [                  # ordered turn queue, 1..MAX_PARTICIPANTS
       {"name": str,                    # unique case-insensitive within the session
        "character": str | None,
        "discord_user_id": str | None,  # numeric Discord snowflake as a string; None until claimed
        "discord_display": str | None}
     ],
     "turn_index": int,                 # 0-based into participants
     "round": int,                      # starts at 1; +1 each wrap
     "channel_id": str | None,          # Discord text channel for pings (resolved at start)
     "reminder_hours": float,
     "auto_skip": bool,                 # default False
     "turn_started_at": str,            # ISO-8601 UTC
     "reminded_at": str | None,         # ISO-8601 UTC of the (single) reminder for this turn
     "last_event_id": str | None,       # idempotency: most recent applied advance/skip event
     "history": [ {"at": iso, "kind": str, "detail": str} ],  # bounded MAX_HISTORY, kinds: start|advance|skip|timeout_skip|scene|claim|stop
     "created_at": iso, "updated_at": iso
   }
   ```
4. Methods (each validates, mutates under the lock, persists, returns a deep copy):
   - `start_session(campaign_id, scene, participants, channel_id, reminder_hours=24.0, auto_skip=False) -> dict` — validates participant count/uniqueness/lengths, clamps `reminder_hours` into `[MIN, MAX]`, sets `turn_index=0, round=1, turn_started_at=now, reminded_at=None, last_event_id=None`, `active=True`, appends `start` history. If a session for the campaign is already `active`, raise `PbpError("already_active")` (a module-level exception carrying a `.code`).
   - `set_scene(campaign_id, scene, participants=None) -> dict` — the **per-scene reset**: new scene label, optionally a new participant order (revalidated; preserves any `discord_user_id` claims for names that match case-insensitively), `turn_index=0`, `round=1`, fresh `turn_started_at`, `reminded_at=None`, history `scene`. Raises `PbpError("not_active")` when inactive/missing.
   - `advance(campaign_id, event_id, expected_turn_index=None, reason="advance", detail="") -> tuple[dict, str]` — idempotency first: `event_id == last_event_id` → return `(session, "duplicate")` unchanged. Staleness second: `expected_turn_index is not None and expected_turn_index != turn_index` → return `(session, "stale_turn")` unchanged (protects against a double-click or a poll/advance race skipping two players). Otherwise increment `turn_index`; on wrap (`>= len(participants)`) reset to 0 and `round += 1`; stamp `turn_started_at=now`, `reminded_at=None`, `last_event_id=event_id`, history `reason` (use `"skip"`/`"timeout_skip"` for skips); return `(session, "advanced")`. Raises `PbpError("not_active")`.
   - `claim(campaign_id, participant_name, discord_user_id, discord_display) -> dict` — case-insensitive match on `name` OR `character`; first-match wins exact > startswith; stores both fields; a participant already claimed by a *different* user raises `PbpError("already_claimed")` (re-claim by the same user is a no-op success); unknown name raises `PbpError("unknown_participant")`.
   - `stop_session(campaign_id) -> dict` — `active=False`, history `stop`. Idempotent (stopping an inactive session returns it unchanged).
   - `mark_reminded(campaign_id) -> dict` — sets `reminded_at=now`.
   - `get(campaign_id) -> dict | None`, `all_active() -> dict[str, dict]` (deep copies).
   - `current_participant(session) -> dict` static helper.
5. Module-level singleton: `get_pbp_store()` / `reset_pbp_store_for_tests()` mirroring `game_registry.py:325-337` (lock-guarded lazy init).
6. Tests (`test_pbp_store.py`, use `tmp_path / "pbp.json"`): start validates (empty/oversize/duplicate-name participants rejected; reminder clamp); advance wraps and bumps round; duplicate `event_id` is a no-op `"duplicate"`; `expected_turn_index` mismatch is `"stale_turn"`; claim exact/startswith/case-insensitive + `already_claimed` + same-user re-claim ok; `set_scene` resets index/round, preserves matching claims; persistence: write with one instance, read with a fresh instance; corrupt file on disk → empty store, no raise; `stop_session` idempotent; history bounded at `MAX_HISTORY`.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_pbp_store.py -q`.

**Acceptance:** all listed behaviors pass; a `PbpStore` pointed at a real path round-trips through process restarts (fresh-instance test proves it); no thread-safety hole (every mutation under the lock).

### 36B — `bots/pbp.py`: PbpManager (pings, reminders) + `/pbp` slash commands

**Objective:** the Discord-facing half — turn announcements that actually ping, a restart-safe reminder loop, and player self-service slash commands (`/pbp claim|status|done|skip`).

**Files:** `bmo/pi/bots/pbp.py` (new), `bmo/pi/bots/discord_dm_bot.py`, `bmo/.env.template`, `bmo/pi/tests/test_pbp_manager.py` (new).

**Steps:**
1. **New `bmo/pi/bots/pbp.py`** (imports per repo rule: `from services.pbp_store import get_pbp_store, PbpError` — never bare). Env config:
   ```python
   PBP_CHANNEL_NAME = os.environ.get("DISCORD_PBP_CHANNEL", "play-by-post")
   PBP_CHANNEL_ID = os.environ.get("DISCORD_PBP_CHANNEL_ID", "")   # numeric id wins over name
   PBP_REMINDER_TICK_SECONDS = int(os.environ.get("PBP_REMINDER_TICK_SECONDS", "600"))
   ```
2. `class PbpManager:` constructed with `(bot, store=None)` (store defaults to `get_pbp_store()`).
   - `resolve_channel(self, channel_id: str | None) -> discord.TextChannel | None` — explicit `channel_id` (from the start request) → `bot.get_channel(int(...))` if it is a text-capable channel; else `PBP_CHANNEL_ID` env; else scan `_candidate_guilds(self.bot)` (PHASE-20 helper in `discord_dm_bot.py`) for a text channel whose name equals `PBP_CHANNEL_NAME` (exact, then case-insensitive). Return `None` when nothing matches.
   - `def _mention(self, participant) -> str` — `f"<@{participant['discord_user_id']}>"` when claimed, else bold plain name `f"**{participant['name']}**"` (no ping possible until claimed — see Research: mentions only ping from message *content*, and only for real `<@id>` snowflakes).
   - `async def announce_turn(self, session, *, header: str | None = None, excerpt: str | None = None) -> bool` — fetch channel via `resolve_channel(session["channel_id"])`; **the mention goes in `content`** (`f"{self._mention(cur)} — it's your turn!"` with optional header line), the details go in an embed (scene, round `session['round']`, position `turn_index+1/len`, posting cadence `reminder_hours`, optional excerpt capped at 280 chars cut at a sentence/word boundary, and a one-line how-to footer: "Post your action in the VTT, or `/pbp done` here when finished. `/pbp claim` to link your character."). Mentions inside embeds do NOT notify (Discord platform behavior) — never move the mention into the embed. Returns False (logged) when the channel is gone.
   - `async def start(self, campaign_id, scene, participants, channel_id, reminder_hours, auto_skip) -> dict` — resolve channel first (no channel → `{"ok": False, "error": "channel_not_found", "channel": PBP_CHANNEL_NAME}`); `store.start_session(..., channel_id=str(channel.id))`; send a kickoff message (content pings the first participant; embed lists the full order with claim status); return `{"ok": True, "session": session}`. `PbpError("already_active")` → `{"ok": False, "error": "already_active"}`.
   - `async def advance(self, campaign_id, event_id, expected_turn_index=None, reason="advance", excerpt=None) -> dict` — `store.advance(...)`; `"advanced"` → `announce_turn` (header `"Turn over — next up:"`, or `"Turn skipped — next up:"` for skips) and return `{"ok": True, "result": "advanced", "session": ...}`; `"duplicate"` → `{"ok": True, "result": "duplicate", "session": ...}` (no announcement); `"stale_turn"` → `{"ok": False, "result": "stale_turn", "session": ...}`; `PbpError("not_active")` → `{"ok": False, "error": "not_active"}`.
   - `async def set_scene(...)`, `async def stop(...)` — wrap the store ops; `set_scene` re-announces (header `"New scene:"`); `stop` posts a wrap-up line (no ping) and returns `{"ok": True, "session": ...}`.
   - `def status(self, campaign_id) -> dict` — `{"ok": True, "session": session_or_None, "overdue": bool}` where `overdue = active and (now - turn_started_at) >= reminder_hours`.
   - `async def reminder_tick(self) -> None` — for each `store.all_active()` session: compute `age = now - turn_started_at`; if `age >= reminder_hours` and `reminded_at is None` → send ONE gentle reminder (content mention: `"{mention} — friendly reminder: it's still your turn in *{scene}* ({h}h elapsed)."`), `store.mark_reminded(...)`; if `session["auto_skip"]` and `age >= 2 * reminder_hours` → `await self.advance(campaign_id, event_id=str(uuid.uuid4()), reason="timeout_skip", ...)` with header `"⏭ {name} was skipped after {2h}h — next up:"`. All datetimes UTC (`datetime.now(timezone.utc)`; parse stored ISO via `datetime.fromisoformat`).
   - `async def reminder_loop(self) -> None` — hand-rolled `while True: await self.reminder_tick(); await asyncio.sleep(PBP_REMINDER_TICK_SECONDS)` with a try/except-log around the tick (one bad session must not kill the loop). Hand-rolled (not `discord.ext.tasks`) to match PHASE-20's `_narration_worker`/`_voice_health_loop` pattern and because the tasks extension is explicitly "not meant for schedulers" per its docs (see Research notes). Restart safety is free: every tick reads the persisted store; nothing lives only in memory.
3. **Slash command group** in `bots/pbp.py`: `pbp_group = app_commands.Group(name="pbp", description="Play-by-post turn queue")`. Campaign resolution for ALL subcommands: find the unique active session whose `channel_id == str(interaction.channel_id)` (commands work only in the session's channel; none found → ephemeral "No active play-by-post session in this channel."):
   - `/pbp claim character:<str>` — `store.claim(campaign_id, character, str(interaction.user.id), interaction.user.display_name)`; ephemeral confirm ("You'll be pinged when it's {name}'s turn."); `already_claimed`/`unknown_participant` → ephemeral error naming the unclaimed participants.
   - `/pbp status` — public embed: scene, round, ordered queue with ✅ claimed / ⬜ unclaimed markers and a ▶ on the current turn, time elapsed on the current turn, reminder cadence, auto-skip state.
   - `/pbp done note:<optional str>` — only the user who claimed the CURRENT participant may use it (else ephemeral "It's {name}'s turn, not yours."); calls `manager.advance(campaign_id, event_id=str(uuid.uuid4()), expected_turn_index=session["turn_index"], excerpt=note)`.
   - `/pbp skip` — requires `interaction.user.guild_permissions.manage_guild` (the Discord-side DM affordance; ephemeral refusal otherwise); advances with `reason="skip"`.
4. **Wire into the bot** (`discord_dm_bot.py`): in `DMBot.__init__` after `self.tree.add_command(dm_group)` (`:568`): `from bots.pbp import pbp_group, PbpManager; self.tree.add_command(pbp_group); self.pbp = PbpManager(self)`. In `setup_hook` (alongside PHASE-20's worker startups): `self._pbp_reminder_task = asyncio.create_task(self.pbp.reminder_loop())`; cancel it in the `close()` override PHASE-20 added (add the cancel line next to the narration-worker cancel).
5. `bmo/.env.template`: add `DISCORD_PBP_CHANNEL`, `DISCORD_PBP_CHANNEL_ID`, `PBP_REMINDER_TICK_SECONDS` under the `# ── Discord Bots ──` block (`:70-73`).
6. Tests (`test_pbp_manager.py`, store on `tmp_path`, bot = `MagicMock` with `get_channel`/guilds returning `MagicMock(spec=discord.TextChannel)` whose `send = AsyncMock()`):
   - `resolve_channel` precedence: explicit id > env id > name scan > None.
   - `announce_turn` puts the `<@id>` mention in `content` (assert on the `send` kwargs), never in the embed; unclaimed participant → bold name, no `<@`.
   - `start` happy path (kickoff sent, store active), `channel_not_found`, `already_active`.
   - `advance`: advanced → announcement to next; duplicate event_id → no second announcement; stale index → no mutation; wrap announces round increment.
   - `reminder_tick` with frozen timestamps (write `turn_started_at` directly into the store file): overdue+unreminded → one reminder + `reminded_at` set; second tick → no duplicate reminder; `auto_skip` at 2× → advances with `timeout_skip` history; non-overdue → silent.
   - `/pbp done` permission: non-current-claimant rejected (drive the command callbacks directly with a stubbed `discord.Interaction` MagicMock — `interaction.user.id`, `channel_id`, `response.send_message = AsyncMock()`).

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_pbp_manager.py tests/test_pbp_store.py -q`.

**Acceptance:** a claimed participant gets a real content mention on their turn; unclaimed participants degrade to named-but-unpinged; exactly one reminder per turn; auto-skip only when enabled; the loop never dies on a single bad session; all state readable from disk after a simulated restart (fresh manager + store over the same file).

### 36C — Control routes + Flask proxies

**Objective:** expose the manager over PHASE-20's loopback control plane and mirror it through `app.py` so the VTT (which talks only to Flask on :5000, off-LAN via the CF tunnel) can drive PBP.

**Files:** `bmo/pi/bots/dm_bot_control.py` (extend PHASE-20's file), `bmo/pi/app.py`, `bmo/pi/tests/test_dm_bot_control.py` (extend), `bmo/pi/tests/test_app_endpoints.py` (extend), `bmo/.env.template` (verify; no new vars beyond 36B).

**Steps:**
1. In `build_control_app(bot)` add six routes (all JSON; same conventions as PHASE-20's `/control/*`):
   - `POST /control/pbp/start` — body `{campaign_id, scene, participants: [{name, character?}], channel_id?, reminder_hours?, auto_skip?}`; 400 on missing `campaign_id`/`scene`/empty `participants`; → `bot.pbp.start(...)`; map `{"ok": False, "error": "channel_not_found"}` → HTTP 404, `"already_active"` → 409, store validation `PbpError` → 400 with the `.code`; success → 200 `{ok: true, session}`.
   - `POST /control/pbp/advance` — body `{campaign_id, event_id, expected_turn_index?, excerpt?}`; 400 when `event_id` missing (idempotency is mandatory on this path — it is retried by `bmoPiFetch`); `result: "advanced" | "duplicate"` → 200; `"stale_turn"` → 200 `{ok:false, result:"stale_turn", session}` (HTTP 200 deliberately: a 409 would not be retried, but 200 also can't be — the body is the truth channel and the VTT must refresh, mirroring PHASE-20's narrate-drop contract); `not_active` → 404.
   - `POST /control/pbp/skip` — same as advance with `reason="skip"`.
   - `POST /control/pbp/scene` — body `{campaign_id, scene, participants?}` → `set_scene`; 404 `not_active`.
   - `POST /control/pbp/stop` — body `{campaign_id}`; idempotent 200.
   - `GET /control/pbp/status?campaign_id=` — 200 `{ok:true, session: <dict|null>, overdue}`.
2. In `app.py`, next to the (post-PHASE-20) Discord DM proxy block, add the matching proxies — `POST /api/discord/pbp/<start|advance|skip|scene|stop>` and `GET /api/discord/pbp/status`, each with its `/api/v1/...` alias decorator, each forwarding body/query verbatim to `http://127.0.0.1:{DM_BOT_CONTROL_PORT}/control/pbp/<name>` with `timeout=(2, 12)` and relaying status+JSON; `requests.ConnectionError`/`Timeout` → 503 `{"error": "DM bot not running"}`. Add `RATE_LIMIT_PBP = os.environ.get("BMO_PBP_RATE_LIMIT", "60 per minute")` beside the other `RATE_LIMIT_*` constants (wherever they live post-PHASE-16 — `extensions.py` or `app.py`; re-grep) and decorate the five POST proxies with `@limiter.limit(RATE_LIMIT_PBP)` (status stays unlimited like `/api/discord/dm/status`).
3. Extend `tests/test_dm_bot_control.py` (aiohttp test client over `build_control_app(bot)` with `bot.pbp` a real `PbpManager` over a `tmp_path` store and a mocked channel): start 200/404/409/400 mapping; advance duplicate + stale_turn bodies; missing event_id → 400; status returns the session.
4. Extend `tests/test_app_endpoints.py`: mock `requests.post`/`requests.get`; assert each `/api/discord/pbp/*` forwards to the right `/control/pbp/*` URL with the body intact and maps `ConnectionError` → 503.

**Cheap checks:** `cd bmo/pi && python -m pytest tests/test_dm_bot_control.py tests/test_app_endpoints.py tests/test_pbp_manager.py tests/test_pbp_store.py -q && python -c "import ast; ast.parse(open('app.py').read())"`.

**Acceptance:** with the bot process up, `curl -X POST localhost:5000/api/discord/pbp/start -d '{...}'` starts a queue and pings; a retried advance (same `event_id`) never double-advances; Flask answers 503 truthfully when the bot process is down.

### 36D — dnd-app main: bridge functions + IPC + preload

**Objective:** typed, zod-validated VTT plumbing for the six PBP operations, with a generated `event_id` per advance/skip so the bridge's 5xx retry can never double-advance the queue.

**Files:** `dnd-app/src/main/bmo-bridge.ts`, `src/main/bmo-bridge.test.ts`, `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`.

**Steps:**
1. `bmo-bridge.ts` — below `getDmStatus` (`:178`), add:
   ```ts
   export interface PbpStartPayload {
     campaignId: string
     scene: string
     participants: Array<{ name: string; character?: string }>
     channelId?: string
     reminderHours?: number
     autoSkip?: boolean
   }
   export async function pbpStart(p: PbpStartPayload): Promise<BridgeResponse>      // POST /api/discord/pbp/start  (snake_case body: campaign_id, scene, participants, channel_id, reminder_hours, auto_skip)
   export async function pbpAdvance(campaignId: string, opts?: { expectedTurnIndex?: number; excerpt?: string }): Promise<BridgeResponse>  // body includes event_id: crypto.randomUUID()
   export async function pbpSkip(campaignId: string, opts?: { expectedTurnIndex?: number }): Promise<BridgeResponse>                        // event_id likewise
   export async function pbpSetScene(campaignId: string, scene: string, participants?: PbpStartPayload['participants']): Promise<BridgeResponse>
   export async function pbpStop(campaignId: string): Promise<BridgeResponse>
   export async function pbpStatus(campaignId: string): Promise<BridgeResponse>     // GET /api/discord/pbp/status?campaign_id=...  (encodeURIComponent)
   ```
   `crypto.randomUUID()` is a Node ≥19 global (same usage PHASE-20 introduces for narrate; add a `node:crypto` import only if lint demands).
2. `ipc-channels.ts` — extend the BMO block (`:204-212`): `BMO_PBP_START: 'bmo:pbp-start'`, `BMO_PBP_ADVANCE: 'bmo:pbp-advance'`, `BMO_PBP_SKIP: 'bmo:pbp-skip'`, `BMO_PBP_SET_SCENE: 'bmo:pbp-set-scene'`, `BMO_PBP_STOP: 'bmo:pbp-stop'`, `BMO_PBP_STATUS: 'bmo:pbp-status'`.
3. `ipc-schemas.ts` — add:
   ```ts
   export const PbpParticipantSchema = z.object({ name: z.string().min(1).max(64), character: z.string().max(64).optional() })
   export const PbpStartSchema = z.object({
     campaignId: z.string().min(1), scene: z.string().min(1).max(200),
     participants: z.array(PbpParticipantSchema).min(1).max(12),
     channelId: z.string().optional(), reminderHours: z.number().min(1).max(168).optional(), autoSkip: z.boolean().optional()
   })
   export const PbpAdvanceSchema = z.object({ campaignId: z.string().min(1), expectedTurnIndex: z.number().int().nonnegative().optional(), excerpt: z.string().max(500).optional() })
   export const PbpSceneSchema = z.object({ campaignId: z.string().min(1), scene: z.string().min(1).max(200), participants: z.array(PbpParticipantSchema).min(1).max(12).optional() })
   export const PbpCampaignSchema = z.object({ campaignId: z.string().min(1) })
   ```
4. `ai-handlers.ts` — inside the `// ── BMO Pi Bridge ──` block (`:654-671`), register the six handlers with `handle(CH, withSchema(CH, Schema, (parsed) => pbpX(...)))` (single-object args so `withSchema` validates everything; skip/stop/status reuse `PbpAdvanceSchema`/`PbpCampaignSchema`).
5. Preload (`index.ts:505-510` block): `bmoPbpStart(payload)`, `bmoPbpAdvance(payload)`, `bmoPbpSkip(payload)`, `bmoPbpSetScene(payload)`, `bmoPbpStop(payload)`, `bmoPbpStatus(payload)` — all plain `ipcRenderer.invoke` with one object arg. `index.d.ts` (`:843-847` block): type them against a shared `PbpSession` interface:
   ```ts
   interface PbpParticipant { name: string; character?: string | null; discord_user_id?: string | null; discord_display?: string | null }
   interface PbpSession { active: boolean; scene: string; participants: PbpParticipant[]; turn_index: number; round: number; reminder_hours: number; auto_skip: boolean; turn_started_at: string; reminded_at?: string | null }
   // each fn: Promise<{ ok?: boolean; error?: string; statusCode?: number; result?: string; session?: PbpSession | null; overdue?: boolean }>
   ```
6. Extend `bmo-bridge.test.ts` (existing suite + fetch-mock pattern at `:26-66`): `pbpAdvance` POSTs to `/api/discord/pbp/advance` with a non-empty `event_id` and snake_case keys; two calls generate different `event_id`s; `pbpStatus` hits the query-string URL with the campaign id encoded; `pbpStart` maps camelCase payload → snake_case body.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/main/bmo-bridge.test.ts`.

**Acceptance:** all six ops callable from the renderer through validated IPC; every advance/skip carries a fresh `event_id`; types in `index.d.ts` match the Pi's actual response shape.

### 36E — Renderer: PBP store, PlayByPostSection UI, opt-in auto-advance

**Objective:** the DM-facing control surface — start/stop/scene/skip/end-turn, live status with overdue + claim visibility — and an off-by-default auto-advance that closes the current turn when an AI reply finalizes.

**Files:** `src/renderer/src/stores/use-pbp-store.ts` (new) + `use-pbp-store.test.ts` (new), `src/renderer/src/components/game/bottom/PlayByPostSection.tsx` (new) + `PlayByPostSection.test.tsx` (new), `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/renderer/src/hooks/use-game-effects.ts`, `src/renderer/src/i18n/locales/en.json`, `es.json`, `src/renderer/src/i18n/generated-keys.ts` (regenerated).

**Steps:**
1. `use-pbp-store.ts` — model on `use-narration-tts-store.ts` (F8): state `{ autoAdvance: boolean; lastStatus: PbpStatusSnapshot | null; setAutoAdvance(v): void; setLastStatus(s): void }` where `PbpStatusSnapshot = { active: boolean; turnIndex: number; round: number; scene: string; campaignId: string }`. Persist ONLY `autoAdvance`, default `false`, localStorage key `'dnd-vtt-pbp-auto-advance'` (try/catch like F8). `lastStatus` is volatile (populated by the section's polling and read by the auto-advance hook for `expectedTurnIndex`).
2. `PlayByPostSection.tsx` (props: `campaign: Campaign`) — collapsed-by-default section rendered in `DMTabPanel`'s AI-DM tab next to the PHASE-20 `DiscordSessionSection` (post-20 file shape; pre-20 anchor: the Speak-narration toggle at `DMTabPanel.tsx:231-239`; reuse `btnClass`/`toggleOnClass`/`toggleOffClass` `:35-41`):
   - **Idle state (no active session):** scene-name input; participants editor seeded once from `campaign.players` (rows: `displayName` as `name`, character name as `character` when the player's `characterId` resolves — pass the resolved names in from the parent or resolve via the character store; `characterId` may be null, F6); add/remove/reorder (▲▼ buttons) rows; free-text row add for non-VTT players; reminder-cadence select (12 h / 24 h / 48 h / 72 h, default 24); auto-skip checkbox default **off** with helper text ("Skip a player after 2× the reminder time"); **Start play-by-post** button → `window.api.bmoPbpStart(...)`; on `{ok:false}` render the structured error (`channel_not_found` → "No Discord channel found — create #play-by-post or set DISCORD_PBP_CHANNEL_ID", `already_active`, bot-down 503).
   - **Active state:** badge with scene + round; ordered queue list with ▶ current marker, ✅/⬜ claim markers (from `session.participants[].discord_user_id`), overdue ⚠ when `overdue:true`; buttons: **End turn** (`bmoPbpAdvance({campaignId, expectedTurnIndex: lastStatus.turnIndex})`), **Skip** (`bmoPbpSkip(...)` with a confirm), **New scene** (inline scene input + optional participant re-order → `bmoPbpSetScene`), **Stop** (`bmoPbpStop`); auto-advance toggle bound to `usePbpStore` ("Auto-advance on AI reply"); hint line when any participant is unclaimed ("Unclaimed players won't be pinged — they can run /pbp claim in Discord").
   - **Polling:** `bmoPbpStatus({campaignId})` on mount + every 30 s while the section is expanded (clear interval on unmount/collapse); push `{active, turnIndex: session.turn_index, round, scene, campaignId}` into `usePbpStore.setLastStatus`; `stale_turn` results from End-turn/Skip trigger an immediate re-poll instead of an error toast.
   - DM-only surface already (the whole panel is DM-side); nothing renders for players.
3. **Auto-advance hook** (`use-game-effects.ts`): in the existing per-AI-assistant-message effect (the block that adds the AI message to chat — pre-20 anchor `:430-448`, post-20F the `narrateThroughBmo(lastMsg.content)` line is gone), append:
   ```ts
   const pbp = usePbpStore.getState()
   if (pbp.autoAdvance && pbp.lastStatus?.active && pbp.lastStatus.campaignId === campaign.id) {
     window.api
       .bmoPbpAdvance({ campaignId: campaign.id, expectedTurnIndex: pbp.lastStatus.turnIndex, excerpt: messageContent.slice(0, 280) })
       .then((res) => { if (res?.session) usePbpStore.getState().setLastStatus(/* mapped */) })
       .catch(() => {})
   }
   ```
   Guarded by the effect's existing once-per-message semantics (it keys on the message timestamp); fire-and-forget; `stale_turn`/`duplicate` are silently absorbed (the Pi is the source of truth; the section's next poll reconciles). This only ever runs on the host instance (F7), and only when BOTH the persisted `autoAdvance` toggle AND an active session exist — default behavior is unchanged.
4. i18n: add `game.pbp.*` keys (section title, all buttons/labels/placeholders, status labels, error strings `channelNotFound`/`alreadyActive`/`botDown`/`staleTurn`, unclaimed hint, autoSkip helper, overdue badge) to `en.json` AND `es.json`; run `npm run i18n:gen-keys` and commit the regenerated `generated-keys.ts`.
5. Tests:
   - `use-pbp-store.test.ts`: default false, persistence round-trip (mock localStorage), `setLastStatus` volatile.
   - `PlayByPostSection.test.tsx` (vitest + testing-library, mock `window.api`): idle renders seeded participants from a fixture campaign; start calls `bmoPbpStart` with the edited order + cadence; `{ok:false,error:'channel_not_found'}` renders the channel error; active status renders queue + current marker + claim markers; End-turn passes `expectedTurnIndex`; Stop calls `bmoPbpStop`; unclaimed hint renders.
   - Extend `use-game-effects.test.ts` (exists, F-checked): with `autoAdvance=true` + active lastStatus a new assistant message triggers exactly one `bmoPbpAdvance` (with `expectedTurnIndex`); with the toggle false or no active status it is never called.

**Cheap checks:** `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/stores/use-pbp-store.test.ts src/renderer/src/components/game/bottom/PlayByPostSection.test.tsx src/renderer/src/hooks/use-game-effects.test.ts && npm run i18n:gen-keys` (no diff beyond the new keys).

**Acceptance:** a DM can start/inspect/advance/skip/re-scene/stop a PBP queue entirely from the DM tab; nothing fires without explicit start; auto-advance is opt-in (persisted, default off) and advances at most once per AI reply.

### 36F — Docs + env truth

**Objective:** document the feature so the deployed Pi and future contributors have the full contract.

**Files:** `bmo/docs/SERVICES.md`, `bmo/pi/bots/README.md`, `docs/ARCHITECTURE.md`, `bmo/.env.template` (verify 36B additions landed).

**Steps:**
1. `bmo/docs/SERVICES.md` — under the DM-bot entry: the PBP control routes (`/control/pbp/*`), the store file (`~/home-lab/bmo/pi/data/pbp_sessions.json` — survives restarts; safe to delete to hard-reset all queues), the reminder loop cadence, and that PBP works **without** an active voice session (text-only feature).
2. `bmo/pi/bots/README.md` — env table additions (`DISCORD_PBP_CHANNEL`, `DISCORD_PBP_CHANNEL_ID`, `PBP_REMINDER_TICK_SECONDS`, `BMO_PBP_RATE_LIMIT`); the `/pbp` slash-command reference (claim/status/done/skip + permission rules); advance result vocabulary (`advanced|duplicate|stale_turn`); the claim-before-ping behavior.
3. `docs/ARCHITECTURE.md` — extend the VTT↔BMO protocol section: the six `/api/discord/pbp/*` endpoints, snake_case body shapes, the `event_id` idempotency + `expected_turn_index` staleness contract, and the poll-only status model (push is PHASE-22's plane).
4. State explicitly in SERVICES.md: no systemd changes (the routes live in the existing `bmo-dm-bot` unit's control server); after pulling, both `bmo` and `bmo-dm-bot` need a restart (per CLAUDE.md, warn — do not restart unprompted).

**Cheap checks:** `grep -n "DISCORD_PBP_CHANNEL\|pbp" bmo/.env.template bmo/docs/SERVICES.md bmo/pi/bots/README.md | head`.

**Acceptance:** every new env var, endpoint, slash command, and result code is documented; no doc claims behavior the code doesn't have.

## Research notes

- **Product precedent — Friends & Fables (the audit's cited source).** F&F began as the Discord bot "Franz" (an AI game master) and markets async play directly: *"whether your party's online together or playing asynchronously, your adventure keeps moving at everyone's pace"*, and Discord is recommended for "longer Play By Post (PBP) style campaign[s] that you can play asynchronously." The differentiator claim in the audit holds: session-only VTTs lose campaigns to scheduling; an always-on AI DM + turn pings removes the bottleneck. Sources: https://fables.gg/ , https://fables.gg/blog/how-is-friends-and-fables-different-from-chatgpt-ai-dungeon-or-novelai , https://top.gg/bot/1087069826482184204 .
- **Turn-ping precedent — Avrae.** Avrae's initiative tracker pings *whichever Discord user added that character to initiative* when the character's turn comes up — i.e., self-registration is how player↔character↔Discord-user mapping is solved in the wild, exactly the `/pbp claim` design here (the VTT cannot know Discord snowflakes, F6). Outside combat, PBP GMs manually "make a new status post and ping the next player" — the automated equivalent is `announce_turn`. Sources: https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/54674-avrae-on-a-discord , https://medium.com/john-f-marion-tabletop/how-to-run-a-pathfinder-2e-play-by-post-game-over-discord-d8ae64beb70e .
- **PBP cadence/skip conventions.** Community practice converges on: set an explicit expected posting rate (1 post / 1–4 days), remind once, and skip players past the deadline so the game never stalls — but skipping is a table rule the GM chooses, hence `reminder_hours` configurable (default 24 h) and `auto_skip` strictly opt-in (default off, skip at 2× the cadence). Sources: https://knightsofthebraille.com/2023/02/05/jims-blog-how-to-run-a-play-by-post/ , https://dicehaven.com/play-by-post/guidelines/ , https://www.dndbeyond.com/posts/1668-play-by-post-playing-dungeons-dragons-in-pbp , https://www.enworld.org/threads/for-those-of-you-who-have-set-up-play-by-post-games-how-do-you-do-it.713319/ .
- **Discord platform caveat: mentions only ping from message `content`.** A `<@id>` rendered inside an embed displays as a mention but never notifies — member data is not gathered for embed text, and `allowed_mentions` only governs mentions present in the message content (or components). The design therefore always puts the mention in `content` and the decorative detail in the embed. The bot's existing `AllowedMentions(users=True, everyone=False, roles=False)` (`discord_dm_bot.py:548-551`) already permits user pings while blocking `@everyone` injection from player-supplied text (scene names, notes) — keep participant-supplied strings inside the embed or rely on that default, and never widen it. Sources: https://github.com/discord/discord-api-docs/discussions/4110 , https://docs.discord.com/developers/resources/message (allowed-mentions object), https://github.com/discordjs/discord.js/issues/1519 .
- **Reminder scheduling: hand-rolled loop over `discord.ext.tasks`.** The tasks extension docs state the design "is not meant for schedulers" (those are "better off written by hand with more control over the interval"), and any schedule without underlying storage dies on restart — the canonical robust pattern (python-discord's reminders cog) persists schedules and recomputes on startup. Here the disk store IS the schedule (every tick recomputes overdue-ness from persisted `turn_started_at`/`reminded_at`), so the loop is stateless, restart-safe by construction, and matches PHASE-20's hand-rolled `_narration_worker`/`_voice_health_loop` house style. Sources: https://discordpy.readthedocs.io/en/stable/ext/tasks/index.html , https://github.com/python-discord/bot/blob/main/bot/exts/utils/reminders.py .
- **Idempotency + staleness on advance.** `bmoPiFetch` retries network errors/5xx up to 3× (`bmo-bridge.ts:141-158`) — without an idempotency key a retried advance would skip a player. The client-generated-key pattern (PHASE-20 uses it for narrate, after the IETF HTTPAPI draft) is reused; additionally `expected_turn_index` (an optimistic-concurrency check) protects against the *semantic* duplicate the key can't catch: two distinct advance intents (double-click, auto-advance racing a manual End-turn) each with fresh keys. Source: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ .
- **Alternatives considered.** (1) *Play entirely in Discord* (posts relayed into the VTT conversation): rejected here — Pi→VTT message relay is PHASE-22's sync plane; this phase keeps posting in the VTT and pinging in Discord, which works with polling alone. (2) *Storing the queue in the VTT campaign file*: rejected — the VTT is not 24/7; reminders and pings need the always-on Pi, and the audit names the Pi explicitly. (3) *SQLite instead of JSON for the store*: rejected — single-writer, tiny record set (one per campaign), and `campaign_memory.db` precedent notwithstanding, JSON + atomic replace matches `game_registry`-style simplicity and is trivially inspectable/resettable. (4) *A third `TurnMode` value*: rejected (F10) — PBP is orthogonal runtime state, not a campaign-creation-time mode.

## Test plan

- **36A:** new `bmo/pi/tests/test_pbp_store.py` — validation, wrap/round, idempotency (`duplicate`), staleness (`stale_turn`), claim matrix, per-scene reset preserving claims, restart round-trip, corrupt-file resilience, bounded history.
- **36B:** new `bmo/pi/tests/test_pbp_manager.py` — channel resolution precedence, mention-in-content (never embed), unclaimed degradation, start/advance/wrap announcements, single reminder per turn, opt-in auto-skip at 2×, loop survives a bad session, `/pbp done`/`skip` permission gates.
- **36C:** extend `bmo/pi/tests/test_dm_bot_control.py` (route↔HTTP-status mapping, mandatory `event_id`) and `bmo/pi/tests/test_app_endpoints.py` (proxy forwarding, 503 mapping).
- **36D:** extend `dnd-app/src/main/bmo-bridge.test.ts` (paths, `event_id` freshness, snake_case mapping, status query encoding).
- **36E:** new `use-pbp-store.test.ts`, new `PlayByPostSection.test.tsx`, extend `use-game-effects.test.ts` (auto-advance fires once, only when opted in + active).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` — **plus** `cd bmo/pi && python -m pytest tests/` (Pi code touched; rule 5 names phase 36).

## Acceptance criteria

1. A DM can start a play-by-post session from the DM tab: scene label, ordered participants (seeded from the campaign roster, editable), reminder cadence, optional auto-skip — and the Pi posts a kickoff message in the configured Discord channel pinging the first participant.
2. The turn queue is persisted on the Pi (`pbp_sessions.json`) and survives a `bmo-dm-bot` restart: queue position, claims, scene, and reminder bookkeeping all intact (proven by the fresh-instance store test).
3. Players self-claim via `/pbp claim`; claimed players receive real content mentions (notifications), unclaimed players appear by name without a ping, and the VTT shows claim status per participant.
4. Turns advance from three paths — VTT End-turn button, `/pbp done` by the current claimant, and (when enabled) auto-advance on a finalized AI reply — and every advance pings the next participant; wrapping increments the round.
5. A retried or duplicated advance (same `event_id`) never double-advances; a stale advance (`expected_turn_index` mismatch) never mutates the queue and the VTT reconciles by re-polling.
6. Overdue turns get exactly one reminder ping per turn at the configured cadence; auto-skip (off by default) skips at 2× cadence with a visible "skipped" announcement and history entry.
7. `set_scene` resets the queue per scene (index 0, round 1, fresh deadline) while preserving existing Discord claims for matching participants.
8. The entire feature is opt-in: with no PBP session started, zero Discord posts, zero pings, zero behavior changes anywhere; the auto-advance toggle defaults off and persists per machine.
9. All five POST proxies are rate-limited (`BMO_PBP_RATE_LIMIT`); Flask returns a truthful 503 when the bot process is down; `/api/v1/` aliases exist for every new route.
10. All new strings exist in `en.json` + `es.json` with `generated-keys.ts` regenerated; the 4-gate plus `pytest bmo/pi/tests/` is green.

## Out of scope

- Relaying Discord text posts into the VTT conversation / AI context (Pi→VTT push plane, preload `BMO_SYNC_EVENT` listeners, bearer auth) → **PHASE-22**.
- Voice narration of PBP turns, sentence-chunked TTS, barge-in, per-NPC voices → **PHASE-20/21** (PBP is text-only by design).
- "Previously on" recaps for returning async players → **PHASE-31** (its recap surface can later link from the PBP kickoff message).
- Lines/veils/X-card constraints applying to PBP content → **PHASE-32** (constraints live in the AI prompt layer, not the queue).
- Automating BMO deployment of the new Pi code → **PHASE-42**; this phase documents the manual restart requirement only.
- Combat initiative inside Discord (`/initiative`) → PHASE-20 sub-phase 20E owns it; the PBP queue is narrative turn order, deliberately separate from combat initiative.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 — file:line citations + one-line summaries per sub-phase. -->
