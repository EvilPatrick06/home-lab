# BMO Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — BMO-domain only.**
>
> Sibling logs:
>
> - dnd-app suggestions → `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`
> - BMO active bugs / debt → `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - Security concerns (global, any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule:** `Domain: bmo` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to BMO behavior → mirrored here AND in `SUGGESTIONS-LOG-DNDAPP.md` where cross-tooling rules touch dnd-app too.

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-28] `VoicePipeline` is a 2,236-line god-class — wake, VAD, STT, TTS, enrollment, device handling and the turn loop all live in one class (the `services/voice/` move grouped the files but never decomposed this core)

- **Category:** future-idea (architecture + DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the voice pipeline + `services/voice/` subpackage

**Description:**
`services/voice/voice_pipeline.py` is a single `VoicePipeline` class (declared at line 140) spanning 2,236 lines — the second-largest source file in the bmo tree after `bots/social/bot.py`. One class owns at least six unrelated concerns, each a self-contained subsystem: **wake-word detection** for two engines (`_wake_word_loop`, `_wake_listen_cycle_porcupine`, `_wake_listen_cycle_oww`, `_load_wake_model`, `_get_wake_model_paths`); **VAD** (`_load_silero_vad`, `_silero_check_speech`, plus the energy-only fallback in `_wake_listen_cycle`); **STT** (`_load_whisper`, `_quick_stt`, `_pcm_to_wav`); **TTS streaming** (`_tts_worker`, `_stream_and_speak`, `_wait_for_tts`, `interrupt`); **speaker enrollment / profiles** (`_load_speaker_encoder`, `_load_voice_profiles`, `_check_enrollment_request`, `_validate_enrollment_clip`); **device/AEC/mic handling** (`_input_device_available`, `_await_input_device`, `_check_aec`, `_mute_mic`); and the **turn orchestration loop** (`_process_one_turn`, `listen_for_followup`, `_follow_up_loop`, `_wait_for_speech`). The 2026-06-23 `services/voice/` refactor (BMO-RESOLVED) made the *audio-stack boundary* explicit by grouping the nine voice/audio modules into a subpackage, but it explicitly left the file itself as "the 2,232-line core" — it `git mv`'d the module; it did not split this class. This is the exact same "package move done, class extraction not done" pattern already logged for the social bot (this log, 2026-06-23). The class works and is well-tested (`tests/test_voice_pipeline.py`), so this is maintainability/reviewability debt, not a bug — but every change to wake or TTS means navigating a 2k-line file where the subsystems share only `self`.

**Hypothesis / root cause:** the pipeline grew organically engine-by-engine (porcupine → openWakeWord, energy VAD → Silero, etc.); each addition bolted another cluster of methods onto the one class rather than introducing a collaborator, and the `services/voice/` grouping addressed file *placement* without touching internal structure.

**Proposed fix / improvement:**
- [ ] Extract cohesive collaborators that `VoicePipeline` composes rather than inlines: `WakeDetector` (porcupine + oww + model loading), `SpeechGate`/`Vad` (Silero + energy), `Transcriber` (whisper + quick-STT + wav framing), `SpeechOutput` (the `_tts_worker`/`_stream_and_speak`/interrupt machinery), and `SpeakerEnrollment` (encoder + profiles + enrollment-request handling). Leave `VoicePipeline` as the thin turn-loop orchestrator.
- [ ] Keep the public surface (`start_listening`/`stop_listening`/`start_conversation`/`get_voice_settings`/`update_voice_setting`) stable so `app.py` and the kiosk WS handlers are untouched.
- [ ] Move per-subsystem tests alongside each extracted unit; the existing `test_voice_pipeline.py` becomes an integration test over the composed orchestrator.
- [ ] Gate the whole refactor behind CI/pytest (it is a pure restructuring — no behavior change), in line with the fix-forward stance.

**Related files:** `bmo/pi/services/voice/voice_pipeline.py:140` (`VoicePipeline`), and the method clusters cited above; `bmo/pi/tests/test_voice_pipeline.py`.

**Related entries:** BMO-RESOLVED 2026-06-23 (group the 9 voice/audio modules into `services/voice/`) — that grouped the files but called this out as the unsplit core; this log 2026-06-23 (social-bot package move done, class extraction not done) — the same pattern in the other god-module.

---

### [2026-06-28] Both `mcp_servers/*` hand-roll identical JSON-RPC stdio framing — extract a shared base so new BMO MCP servers (timers/calendar/smart-home/music) don't re-implement the protocol

- **Category:** future-idea (DX + portability)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `pi/mcp_servers/`

**Description:**
`mcp_servers/` now has two stdio servers — `bmo_lists_server.py` (128 lines) and `dnd_data_server.py` (307 lines) — and each **independently re-implements the same JSON-RPC 2.0 over Content-Length-framed stdio plumbing**: a `_read_message()` that parses `Content-Length` headers off stdin, a `_write_message()` that emits `Content-Length: …\r\n\r\n{body}`, `_result(id, result)` / `_error(id, code, message)` wrappers, and a `main()` dispatch loop handling `initialize` → `notifications/initialized` → `tools/list` → `tools/call`. These blocks are byte-for-byte equivalent across the two files (lists: lines 27-115; dnd_data: lines 55-294). There is no shared helper — `mcp_servers/` holds only the two servers, an `__init__.py`, the README, and `mcp_settings.json`. The earlier "expose BMO's subsystems as MCP servers" idea (BMO-RESOLVED 2026-06-22) envisioned wrapping timers/calendar/smart-home/music the same way, but only the lists server materialized; every additional server will copy this boilerplate again, and a protocol-level fix (e.g. handling the `initialized` notification, an MCP spec bump, batch framing, or graceful EOF) has to be applied in N places.

**Hypothesis / root cause:** the dnd-data server came first and established the stdio pattern by hand; the lists server was written by copying that framing rather than factoring it out, because no base module existed to import.

**Proposed fix / improvement:**
- [ ] Add `mcp_servers/_stdio_server.py` exposing the transport (read/write/Content-Length framing, `result`/`error` helpers) and a tiny dispatch loop that takes a `name → handler` tool table plus a `TOOLS` manifest, so a concrete server is just "define TOOLS + handlers, call `serve(TOOLS, handlers)`".
- [ ] Port `bmo_lists_server.py` and `dnd_data_server.py` onto it (behavior-identical; covered by their existing import/JSON-RPC tests).
- [ ] This directly lowers the cost of the deferred timers/calendar/smart-home/music MCP servers — each becomes ~a tool table over the existing in-process service, not another protocol re-implementation.

**Related files:** `bmo/pi/mcp_servers/bmo_lists_server.py:27-115`, `bmo/pi/mcp_servers/dnd_data_server.py:55-294`, `bmo/pi/mcp_servers/__init__.py`, `bmo/pi/mcp_servers/README.md`.

**Related entries:** BMO-RESOLVED 2026-06-22 (expose BMO's own subsystems as MCP servers) — only the lists server shipped; a shared base is the missing enabler for the rest.

---

### [2026-06-28] BMO's hardware-control tag vocabulary (`[FACE:]`/`[LED:]`/`[EMOTION:]`/`[SOUND:]`/`[MUSIC:]`/`[NPC:]`) has no single source of truth — it's hand-listed in ~8 prompt files, parsed by regex in one place, and the valid face set is a separate enum, so the three can silently drift

- **Category:** future-idea (reliability + DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the personality/expression-tag path (prompts → parser → hardware)

**Description:**
BMO controls its face, LEDs, sounds, TTS emotion, music and NPC voices by having the LLM emit inline tags like `[FACE:happy]`, `[LED:rainbow]`, `[EMOTION:sassy]`. The set of legal tags is defined three separate ways that nothing keeps in sync:
1. **Advertised to the model** as prose, independently re-listed in at least eight prompt-bearing modules: `agents/orchestrator.py`, `agents/conversation.py`, `agents/timer_agent.py`, `agents/weather_agent.py`, `agents/music_agent.py`, `services/personality_engine.py`, `services/voice/voice_personality.py`, and `services/timer_service.py` (each enumerates its own subset of FACE/LED/EMOTION/SOUND tags in the system prompt).
2. **Parsed/dispatched** by regex in `services/voice/voice_personality.py` (the module that turns response tags into hardware actions + Fish-Audio emotion/NPC voice mapping).
3. **Implemented** as a hard enum of face names in `hardware/oled_face.py` (`HAPPY`/`LAUGHING`/`SINGING`/`MISCHIEVOUS`/… each with a `_render_*`).
A `grep` for any central registry (`TAG_REGISTRY`/`VALID_FACES`/`FACE_TAGS`/`EXPRESSION_TAGS`) finds nothing — the lists are maintained by hand. The drift modes are real: add a face to `oled_face.py` and the model never learns it exists (you must remember to edit every prompt); advertise a `[FACE:x]` in a prompt that `oled_face.py` doesn't implement and the renderer silently no-ops; and an emitted tag the parser doesn't recognize risks leaking into spoken/displayed output instead of being consumed. Because each agent re-lists its own subset, the vocabularies are already partial and inconsistent across agents.

**Hypothesis / root cause:** the tag protocol started small (a handful of faces in `conversation.py`) and every new agent/feature copied the relevant snippet into its own prompt; the parser and the OLED enum grew in parallel. No shared definition was introduced, so "the list of valid tags" exists only as duplicated prose + one regex + one enum.

**Proposed fix / improvement:**
- [ ] Introduce one registry (e.g. `services/voice/expression_tags.py` or a small data file) that enumerates each tag family and its allowed values, with the OLED enum derived from / validated against it.
- [ ] Generate the prompt snippet from the registry (a single `tags_prompt()` helper the agents import) instead of hand-listing values per file, so the model is always told exactly what the parser+hardware support.
- [ ] Drive the `voice_personality` parser/dispatcher off the same table, and have it log (via `bmo_logging`) any tag it sees that isn't in the registry — turning silent drift into an observable warning.
- [ ] Add a tiny test asserting prompt-advertised tags ⊆ parser-handled tags ⊆ hardware-implemented tags (or an explicit allowlist for intentional supersets).

**Related files:** `bmo/pi/agents/conversation.py`, `bmo/pi/agents/orchestrator.py`, `bmo/pi/agents/timer_agent.py`, `bmo/pi/agents/weather_agent.py`, `bmo/pi/agents/music_agent.py`, `bmo/pi/services/personality_engine.py`, `bmo/pi/services/voice/voice_personality.py`, `bmo/pi/services/timer_service.py`, `bmo/pi/hardware/oled_face.py`.
### [2026-06-28] `request.json or {}` used 58× in `app.py` — the same 415-before-fallback brittleness PHASE-07 fixed on the list surface applies repo-wide

- **Category:** debt (robustness / consistency)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-phase-executer
- **During:** PHASE-07 implementation (list-endpoint request-parsing robustness)

**Description:**
`data = request.json or {}` appears **58×** in `bmo/pi/app.py`. Flask's `request.json` is the *non-silent* accessor: it raises `UnsupportedMediaType` (415) before the `or {}` fallback can run whenever the request mimetype isn't `application/json`, so every such site 415s on a bodyless / non-JSON POST instead of falling back to an empty dict. PHASE-07 hardened the three list-item handlers (`api_list_add_item`, `api_list_check_item`, `api_list_clear`) to `request.get_json(silent=True) or {}`; the remaining ~55 sites still carry the brittle pattern. No user impact today (the dashboard callers always send the JSON header), but any future caller (curl probe, bodyless toggle, third-party script) gets a confusing 415.

**Proposed fix / improvement:** A scoped repo-wide sweep replacing `request.json or {}` with `request.get_json(silent=True) or {}` (auditing each site for whether default-on-empty or a clean 400 is the right semantics, as PHASE-07 did per-handler). Out of PHASE-07's scope (which intentionally fixed only the QA-flagged list surface + its sibling, per INSTRUCTIONS.md rule 12).

**Related files:** `bmo/pi/app.py` (~55 remaining `request.json or {}` sites).

### [2026-06-24] ~860 KB of orphaned vendored frontend assets in `web/static/` — Tailwind Play-CDN runtime + a duplicate xterm/marked/hljs vendor set the IDE no longer loads locally

- **Category:** debt (cleanup / dead artifacts)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of `bmo/pi/web/static` vs the templates that reference it

**Description:**
Several large vendored frontend blobs ship in the repo but are referenced by **nothing** — they are dead weight from earlier asset strategies that were since changed:
- `web/static/js/tailwind.js` (**412 KB**, the Tailwind *Play CDN* runtime) — `index.html` loads the **compiled** stylesheet `/static/css/tailwind.css`, which `setup-bmo.sh:122` builds with the Tailwind CLI (`tailwindcss -i static/css/tailwind-input.css -o static/css/tailwind.css --minify`). The JIT-in-browser runtime is unused; it has not been touched since the April monorepo reorg (`f96bad8f`).
- `web/static/js/xterm.min.js` (**290 KB**), `web/static/js/addon-fit.min.js`, `web/static/css/xterm.min.css`, `web/static/vendor/marked.min.js` (**35 KB**), `web/static/vendor/hljs/highlight.min.js` (**122 KB**) + `github-dark.css` — `ide.html` now pulls xterm, addon-fit, xterm.css and marked from **jsdelivr CDN**, and hljs is referenced nowhere at all. A repo-wide grep for these local paths across `*.html`/`*.js`/`*.py`/`*.css` returns zero hits, and `web/static/ide/sw.js` does not precache them.

Net: ~860 KB of tracked binaries that no served page loads. They bloat the repo, the Docker image, and every `rsync`/deploy, and they mislead future contributors into thinking the app self-hosts these libs (it half does — `alpine.min.js`, `socket.io.min.js`, `bmo.js` ARE loaded locally by `index.html`, while the IDE went CDN). This is also a latent **inconsistency/supply-chain** smell: `index.html` vendors its JS locally for offline/Cloudflare-independence, but `ide.html` depends on three external CDNs — a deliberate-looking split that is probably accidental drift.

**Hypothesis / root cause:** asset strategy changed twice (Tailwind browser-runtime → CLI-compiled CSS; IDE local-vendor → jsdelivr CDN) and the now-unreferenced files were never deleted.

**Proposed fix / improvement:**
- [ ] Delete the confirmed-orphan files: `web/static/js/tailwind.js`, `web/static/js/xterm.min.js`, `web/static/js/addon-fit.min.js`, `web/static/css/xterm.min.css`, `web/static/vendor/marked.min.js`, `web/static/vendor/hljs/` (verify with a final `grep -r` for each basename before removing).
- [ ] Decide the IDE vendoring policy deliberately: either re-vendor xterm/addon-fit/marked locally (matches `index.html`, survives a CDN/Cloudflare outage on the kiosk) **or** document that `ide.html` intentionally uses CDNs — and note it in `bmo/docs/DESIGN-CONSTRAINTS.md` so it is not "fixed" back and forth.
- [ ] Add a tiny CI check (or extend `check-no-new-prints.sh`-style guard) that greps templates for every file under `web/static/{js,vendor}` and flags any that nothing references, to stop orphans re-accumulating.

**Related files:** `bmo/pi/web/static/js/tailwind.js`, `bmo/pi/web/static/js/xterm.min.js`, `bmo/pi/web/static/js/addon-fit.min.js`, `bmo/pi/web/static/css/xterm.min.css`, `bmo/pi/web/static/vendor/marked.min.js`, `bmo/pi/web/static/vendor/hljs/{highlight.min.js,github-dark.css}`, `bmo/pi/web/templates/index.html`, `bmo/pi/web/templates/ide.html`, `bmo/setup-bmo.sh:119-122`, `bmo/pi/tailwind.config.js`.

---

### [2026-06-24] `bots/` package layout is inconsistent — social-only helpers + the social entrypoint shim live at `bots/` top level beside the `bots/social/` package, while the DM bot has no package at all

- **Category:** future-idea (structure / DX consistency)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of the `bmo/pi/bots/` tree

**Description:**
The social-bot decomposition created a `bots/social/` package (`__init__.py`, `bot.py`, `games_logic.py`), but two modules that are **exclusively social-bot code** still sit at the `bots/` top level next to it: `bots/social_bot_utils.py` and `bots/social_youtube.py`. Their own docstrings say they were "Extracted from discord_social_bot.py … decompose the social-bot monolith into sibling modules," and the only importers are `bots/social/bot.py` and each other (`social_youtube` imports `social_bot_utils`). So the package boundary is half-drawn: some social pieces are inside `bots/social/`, two are outside it. Meanwhile the **DM** bot is the mirror-image inconsistency — `bots/discord_dm_bot.py` (83 KB) + `bots/dm_bot_control.py` + `bots/pbp.py` are a comparably large subsystem with **no** package, sitting flat in `bots/` alongside the social files. The result is a directory where naming (`social_*` flat files vs a `social/` dir vs un-namespaced `discord_dm_bot.py`) does not communicate the actual module ownership, making the tree harder to navigate and to reason about which file belongs to which bot.

This is distinct from the existing god-module entry (which is about extracting the View/Modal classes *out of* `bots/social/bot.py`); this item is purely about **where the already-extracted modules live** and the asymmetry between the two bots' layouts.

**Hypothesis / root cause:** the package was introduced mid-decomposition; the earliest-extracted helpers predate the `bots/social/` dir and were never moved in, and the DM bot was never given the same treatment.

**Proposed fix / improvement:**
- [ ] `git mv bots/social_bot_utils.py bots/social/utils.py` and `git mv bots/social_youtube.py bots/social/youtube.py` (update the two import sites in `bots/social/bot.py`/`social_youtube.py`); keep `bots/discord_social_bot.py` as the unchanged `python -m` entry shim.
- [ ] Consider a parallel `bots/dm/` package (`bot.py`, `control.py`, `pbp.py`) with `bots/discord_dm_bot.py` kept as the entrypoint shim, so the two bots have symmetric, self-describing layouts.
- [ ] Behavior-identical reorg; `tests/test_social_bot_import.py` (50+ commands register) guards the social move.

**Related files:** `bmo/pi/bots/social_bot_utils.py`, `bmo/pi/bots/social_youtube.py`, `bmo/pi/bots/social/bot.py:37,445`, `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/bots/dm_bot_control.py`, `bmo/pi/bots/pbp.py`, `bmo/pi/bots/discord_social_bot.py`.

**Related entries:** Future-ideas 2026-06-23 (social-bot god-module decomposition incomplete) — complementary: that one moves classes out of `bot.py`; this one fixes where the sibling modules sit.

---

### [2026-06-24] Calendar OAuth/service code is four flat files at `services/` top level — would read better as a `services/calendar/` subpackage, mirroring the existing `services/voice/`

- **Category:** future-idea (structure / DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of the `bmo/pi/services/` directory

**Description:**
The Google Calendar integration is spread across four sibling files at the `services/` top level — `calendar_service.py` (the API client, 15.7 KB), `calendar_oauth_config.py` (explicitly "Shared Google Calendar OAuth config — single source of truth for paths + scopes"), `authorize_calendar.py` (browser OAuth flow), and `reauth_calendar.py` (headless re-auth). They form one obvious cluster (`calendar_oauth_config` exists solely to be shared by `authorize_calendar` and `reauth_calendar`), yet they are interleaved alphabetically among ~40 unrelated service modules, so the relationship is invisible from the listing. The codebase already established the grouping pattern with `services/voice/` (10 voice modules in their own subpackage); the calendar cluster is the next-most-obvious candidate and currently the largest un-grouped one.

**Hypothesis / root cause:** `services/` grew flat; only the voice subsystem was ever pulled into a subpackage, so later clusters (calendar, and arguably the calendar-adjacent `accounts.py`/`identity.py`/`jwt_util.py`/`auth_guard.py` auth set) never got the same treatment.

**Proposed fix / improvement:**
- [ ] Introduce `services/calendar/` (`__init__.py` re-exporting the public surface) and move the four files in as `service.py`, `oauth_config.py`, `authorize.py`, `reauth.py`; update the ~6 intra-repo import sites.
- [ ] Keep a thin compatibility shim or update imports atomically so `app.py`'s calendar wiring and the QA/phase docs referencing these paths don't break.
- [ ] Optionally document the "cluster ≥3 related service modules into a subpackage" convention in `bmo/docs/ARCHITECTURE.md` so `services/` stays navigable as it grows.

**Related files:** `bmo/pi/services/calendar_service.py`, `bmo/pi/services/calendar_oauth_config.py`, `bmo/pi/services/authorize_calendar.py`, `bmo/pi/services/reauth_calendar.py`, `bmo/pi/services/voice/` (precedent), `bmo/pi/app.py` (calendar wiring), `bmo/docs/ARCHITECTURE.md`.
### [2026-06-24] Voice barge-in / "stop talking" is unreachable — `VoicePipeline.interrupt()` has a unit test but zero production callers, so BMO cannot be cut off mid-speech

- **Category:** future-idea (UX)
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the Pi voice pipeline (`services/voice/voice_pipeline.py`)

**Description:**
The voice pipeline already contains all the machinery for barge-in: `_tts_interrupted = threading.Event()` (init ~line 185), an `interrupt()` method (~line 993) that sets the event, clears the TTS queue and aborts current playback, and `_tts_worker` / `_stream_and_speak` / playback loops that all check `self._tts_interrupted.is_set()` between chunks (~lines 937, 989, 1037, 1065). There is even a unit test for it (`tests/test_voice_pipeline.py::test_interrupt_clears_speaking_state`). But a repo-wide grep shows **`interrupt()` has no production caller** — nothing in `app.py`, `routes/` (incl. the `realtime_ws.py` / `game_relay_ws.py` socketio handlers), the wake-word loop, or the agents ever invokes it. The Discord side has its own separate `interrupt` plumbing (`bots/discord_dm_bot.py`, `bots/dm_bot_control.py`) but that does not touch the Pi voice pipeline. Net effect: once BMO starts a long spoken answer, the user has no voice or UI way to stop it — `_follow_up_loop` only begins listening *after* TTS finishes, and the wake word is not monitored during playback. The user must wait out the whole utterance (or kill the service). The capability exists and is tested; it is simply not wired to any trigger.

**Hypothesis / root cause:** `interrupt()` was built as half-duplex barge-in infrastructure but the triggering side (wake-word/VAD monitoring during playback, plus a UI/REST "stop" control) was never connected. AEC notes in `_check_aec` suggest full-duplex listening-while-speaking was anticipated but left unfinished.

**Proposed fix / improvement:**
- [ ] Run a lightweight wake-word (or VAD energy) listener on the mic *during* TTS playback; on a hit, call `self.interrupt()` and drop straight into `_process_one_turn` so the user can talk over BMO. Leverage the existing PipeWire echo-cancel source so playback is not self-detected.
- [ ] Expose an explicit "stop talking" control: a `@socketio.on("voice_interrupt")` handler (and/or a small `POST /api/voice/interrupt`) that calls `pipeline.interrupt()` — wires the kiosk/dashboard Stop button to the already-implemented method.
- [ ] Treat the spoken closing word "stop" (already in the `is_closing` set) as an interrupt while speaking, not just between turns.
- [ ] Emit a `conversation_mode`/`status` event on interrupt so the UI reflects the cut-off (mirrors the existing "(interrupted)" pill used on the chat side).

---

### [2026-06-24] BMO root path `~/home-lab/bmo/pi` is hardcoded across ~40 Python files — no central path/config root, hurting portability (Docker / other user / CI)

- **Category:** future-idea (portability, DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only portability review of the bmo/ Python tree

**Description:**
The absolute path prefix `~/home-lab/bmo/pi/...` (and a few `/home/patrick/home-lab` literals) is repeated as `os.path.expanduser(...)` in ~40 source files, with no single module that owns the project root. Examples: `app.py:2140` (`notes.json`), `agent.py:21,325,344`, `agents/memory.py:15`, `agents/learning_agent.py:13`, `agents/settings.py:23,99`, `routes/ide.py:64,149,1333`, `routes/chat_api.py:558`, `bots/social/bot.py:70,902`, `bots/discord_dm_bot.py:753`, `hardware/camera_service.py:18`, `mcp_servers/dnd_data_server.py:22,27,32`, `wake/enroll_voice.py:25,89`. There is no `BMO_HOME` / `BMO_ROOT` env var or shared `paths.py`; `config_preflight.py` and `settings_store.py` exist but do not centralize the filesystem root. This couples the entire assistant to a specific home directory layout (`patrick` user, repo cloned at exactly `~/home-lab`). It makes the existing `docker/` image, any non-`patrick` user, a relocated checkout, and CI more brittle than necessary — and any future relocation of the data dir means editing dozens of files. (Distinct from the already-resolved "owner identity (Gavin) hardcoded" entry, which was about *who* the user is, not *where the tree lives*.)

**Hypothesis / root cause:** organic growth — each module reached for `os.path.expanduser("~/home-lab/bmo/pi/...")` independently rather than importing a shared root, because no path module was established early.

**Proposed fix / improvement:**
- [ ] Add a tiny `services/paths.py` (or extend `config_preflight`) exporting `BMO_ROOT` / `DATA_DIR` / `MODELS_DIR`, resolved from a `BMO_HOME` env var with the current `~/home-lab/bmo/pi` as the default. Never raises; importable from hot paths.
- [ ] Mechanically migrate the ~40 call sites to `from services.paths import DATA_DIR` etc. (small, low-risk, mostly find/replace; do it incrementally per package to keep diffs reviewable).
- [ ] Add a lint/CI check (similar to `scripts/check-no-new-prints.sh`) that fails on new `expanduser("~/home-lab` literals outside `paths.py`, to stop the pattern from regrowing.
- [ ] Wire `BMO_HOME` through the Docker image and systemd unit `Environment=` so the container/relocated installs work without code edits.

---

### [2026-06-23] Social-bot decomposition stopped at the package move — `bots/social/bot.py` is still a 6,695-line / 261 KB god-module (per-game + music-UI extraction never done)

- **Category:** future-idea (architecture / DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor

**Description:**
The "split the social-bot god-module" work (BMO-RESOLVED 2026-06-23, `248143ef`) is marked done, but it only created the `bots/social/` package, `git mv`d the file to `bots/social/bot.py`, and extracted **pure helper functions** into `bots/social/games_logic.py` (9 small functions: deck/hand math, fuzzy title match, time parsing). The two largest checklist items from that resolved entry were **not** completed: "extract each mini-game into `social/games/{trivia,wyr,rps,blackjack,hangman,wordle,connect4,poll}.py`" and "extract the music UI/queue into `social/music_ui.py`". As a result `bots/social/bot.py` is **still 6,695 lines / 261 KB — by far the largest source file in the bmo tree** (next is `app.py` at ~2,947), holding 17 top-level classes spanning three unrelated concerns in one module: the music subsystem (`MusicQueue` + its `VoiceListenerSink`, `VolumeSelect`, `PageButton`, `MusicControlView` — lines 244-808), the `SocialBot(commands.Bot)` core (~2,830 lines, 810-3639), and 8 self-contained mini-games each with its own View/Modal (`TriviaButton`/`TriviaView`, `WYRView`, `RPSView`, `BlackjackView`, `HangmanGuessModal`/`HangmanView`, `WordleGuessModal`/`WordleView`, `Connect4View`, `PollView`/`PollButton` — lines 3640-6480). The games and music UI couple to the bot core only via command registration, so the bulk of the file is still hard to navigate, review, and test in isolation. The seams (`games_logic.py`, `social_bot_utils.py`, `social_youtube.py`) already exist — only the View/Modal classes themselves remain unmoved.

**Proposed fix / improvement:**
- [ ] Finish the planned extraction: move each mini-game's View/Modal into `bots/social/games/<game>.py`, registered via a small `games/__init__.py` loader called at bot startup; the pure logic already lives in `games_logic.py` next door.
- [ ] Extract `MusicQueue` + the music Views into `bots/social/music_ui.py`.
- [ ] Keep `bots/social/bot.py` as the bot core + the existing `bots/discord_social_bot.py` shim so the systemd `python -m bots.discord_social_bot` entry point stays unchanged.
- [ ] Behavior-identical reorg; the existing `test_social_bot_import.py` (asserts 50+ commands register) guards against accidental command-loss during the move.

**Related files:** `bmo/pi/bots/social/bot.py` (244-6480), `bmo/pi/bots/social/games_logic.py`, `bmo/pi/bots/social/__init__.py`, `bmo/pi/bots/discord_social_bot.py` (shim), `bmo/pi/tests/test_social_bot_import.py`.

**Update [2026-06-28] (bmo-resolver):** Approved in the 2026-06-28 batch but **left unfixed this run** — a behaviour-identical extraction of this 6,704-line live-bot core (8 game View/Modal classes + the music UI, deeply interspersed with helpers/commands and with circular-import hazards) is verifiable here only by the command-registration import test, which does not exercise the moved game/music runtime, and a silent break would degrade live Discord features. Best done as its own runtime-tested change; `warn` sent.

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
