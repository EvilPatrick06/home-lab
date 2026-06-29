# BMO Resolved Issues

> **Archive of resolved BMO-domain entries** moved out of [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) / [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) — kept here so the active logs stay lean while preserving fix history.
>
> When fixing an entry, **move** it here (don't delete) and append resolution metadata. Resolved security entries (any domain) go in [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) (gitignored), not here.
>
> Sibling logs:
> - dnd-app resolved → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
> - Resolved security (any domain, gitignored) → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md)
>
> Newest first.

---

### [2026-06-29] bmo-resolver — bmo backlog batch (2 issues + 8 suggestions + 1 security), user-approved

- **Resolved by:** bmo-resolver  **Branch:** `auto/bmo-resolver` (reset onto current origin/master; integrator merges; bmo auto-deploys on merge)
- **During:** scheduled bmo-resolver run; all open bmo entries approved by the user 2026-06-29.

**Issue resolutions:**
1. ide_app.py startup-banner print() tripping the ratchet — **already resolved on current master** (line 798 is `log.info(...)`; ratchet green at 163=163). The offending commit `363c8cef` never merged (integrator left the red branch behind). Archived as already-resolved; no code change.
2. discord_dm_bot.py hardcoded dev-tree data paths — resolve `_DM_STATE_PATH`, `rag_dir` and `DATA_DIR` via `Path(__file__).resolve().parents[1]` so DM state + RAG + 5e data live under the running checkout (deploy sandbox safe; mirrors the social-bot fix). Also fixed `DATA_DIR` previously pointing at a nonexistent `~/bmo/data/5e`. (`6767e89c`)

**Suggestion resolutions:**
- mcp_servers shared stdio base — extract the JSON-RPC Content-Length transport into `mcp_servers/_stdio_server.serve()`; both servers ported (behaviour-identical, stdio smoke-tested) + `test_mcp_stdio_base`. (`85eda155`)
- request.json sweep — 55 `request.json or {}` → `request.get_json(silent=True) or {}` in `app.py`. (`3a6b3205`)
- orphaned vendored assets — deleted ~860 KB (`tailwind.js`, `xterm`, `addon-fit`, `marked`, `hljs`), verified unreferenced. (`a952f692`)
- bots/ layout — moved `social_bot_utils.py`/`social_youtube.py` into `bots/social/` as `utils.py`/`youtube.py`. (`3e9e994d`)
- voice barge-in — wired `VoicePipeline.interrupt()` to a `POST /api/voice/interrupt` REST endpoint + a `voice_interrupt` SocketIO handler (previously zero production callers). (`ee13c8fe`)
- services/calendar/ subpackage — grouped the 4 calendar modules into `services/calendar/` with operator-path compat shims; ratchet EXCL updated for the moved auth CLIs. (`8829a261`, `b3ed5e72`)
- services.paths centralization — added `services/paths.py` (BMO_ROOT/DATA_DIR/MODELS_DIR via BMO_HOME, default-preserving); migrated 41 literals across 24 in-process modules; added `check-no-home-lab-literals.sh` ratchet (baseline 13) wired into CI. (`4346536b`)
- expression-tag registry — added `services/voice/expression_tags.py` (families + FACE vocab derived from the OLED enum) + `tags_prompt()`; parser family list now sourced from it and unknown closed-family tags are logged. **Partial:** migrating the ~8 per-agent prompt-prose blocks onto `tags_prompt()` is the incremental follow-up (it changes LLM input — needs per-prompt review). (`ba41204b`)

**Security resolution** (full entry moved to gitignored `RESOLVED-SECURITY-ISSUES.md`): calendar `token.json`/`credentials.json` world-readable — all four token writers now land 0600; live files chmod 600 + config dirs 700. (`2bac5487`)

**Verification:** full bmo pytest suite **1355 passed, 6 skipped** on the branch; `check-no-new-prints.sh` + `check-no-home-lab-literals.sh` green. Live-Pi out-of-band actions: `chmod 600` token/credentials + `chmod 700 config/` in both `~/home-lab` and `~/home-lab-deploy`. Code deploys via the integrator merge.

**NOT done (left active):**
- Suggestion: `VoicePipeline` 2,236-line god-class decomposition — left active in `BMO-SUGGESTIONS-LOG.md`. Its correctness rests on live-audio/AEC behaviour the 52 mocked tests cannot exercise, so a CI-green extraction could still silently break live voice on deploy; needs the incremental, on-device-verifiable pass the entry prescribes (not landed blind on a shared branch carrying 10 verified fixes).
- Issue: Google Calendar refresh token revoked — left active in `BMO-ISSUES-LOG.md`. Operational/human action (run `services/reauth_calendar.py` to mint a fresh token, or move the OAuth app out of "Testing"); no code fix is possible from the resolver.

<details><summary>Original entries (verbatim, moved from BMO-ISSUES-LOG.md + BMO-SUGGESTIONS-LOG.md)</summary>

### [2026-06-28] ide_app.py startup-banner print() trips bmo print() ratchet on auto/bmo-resolver

- **Reported by:** ci-failure-triage (automated)
- **Category:** ci / lint (print ratchet)
- **Severity:** high (branch CI red; blocks bmo-resolver integration)
- **Domain:** bmo
- **Failing run:** 28338228795 (2026-06-28T22:32Z) — job `bmo print() ratchet`, step `bash bmo/pi/scripts/check-no-new-prints.sh`, exit 1 (production print() count=164 baseline=163 → 1 new). Paired `dnd-app CI` run 28338228779 on the same push was a benign concurrency-cancel (ignored).
- **Branch / commit:** `auto/bmo-resolver` @ 363c8cef ("docs(logs): archive social-bot god-module split (#12) — now resolved")

**Root cause:**
The commit adds one `print()` at `bmo/pi/ide_app/ide_app.py:798`: a startup banner `print(f'... BMO IDE Test App starting on {_host}:{_port} ...')` (confirmed via `git diff origin/master 363c8cef -- *ide_app.py`). Count 163 → 164.

**Fix needed:**
Replace the startup-banner `print()` with `services.bmo_logging.get_logger(__name__).info(...)`, then re-run the ratchet. Owner: bmo-resolver / bmo domain.

### [2026-06-28] discord_dm_bot.py hardcodes read-only dev-tree data paths (same trap that broke the social bot deploy)

- **Reported by:** ci-failure-triage (automated)
- **Category:** bug / latent
- **Severity:** high (will fail at runtime under the deploy-isolation sandbox)
- **Domain:** bmo
- **Context:** found while fix-forwarding bmo/deploy run 28334130910 (social bot crash)

**Description:**
The deploy-isolation hardening runs the bots from `~/home-lab-deploy` with `ProtectHome=read-only` and only `ReadWritePaths=~/home-lab-deploy/bmo/pi/data` writable. `bmo/pi/bots/social/bot.py` was fixed this cycle (commit 655a930f) to resolve its data dir relative to the module. But `bmo/pi/bots/discord_dm_bot.py` still hardcodes the dev-tree path in two spots:
- line 346: `_DM_STATE_PATH = os.path.expanduser("~/home-lab/bmo/pi/data/dm_session_state.json")`
- line 847: `rag_dir = os.path.expanduser("~/home-lab/bmo/pi/data/rag_data")`
(line 133 `DATA_DIR = Path.home() / "bmo" / "data" / "5e"` also points outside the deploy checkout.)
These are not executed at import time, so the service starts and deploy passes — but the first write to `_DM_STATE_PATH` (or a RAG read expecting the deploy tree) hits `OSError: Read-only file system` / wrong path at runtime.

**Fix needed:**
Resolve these paths relative to the module (mirror the social-bot fix: `Path(__file__).resolve().parents[2] / "data"`) or to the writable deploy data dir, so DM session state + RAG live under `~/home-lab-deploy/bmo/pi/data`. Verify against the systemd `ReadWritePaths` for bmo-dm-bot. Owner: bmo-resolver.

*(none currently logged)*

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


</details>

---


### [2026-06-28] bmo-resolver — social-bot god-module split (suggestion #12), user-approved

- **Resolved by:** bmo-resolver  **Branch:** `auto/bmo-resolver`  **Commit:** `61135694`
- Completed in a follow-up pass after the user asked to do the deferred item. Behaviour-identical relocation; `bots/social/bot.py` **6,705 -> 5,795 lines**.

**What moved (verbatim, unchanged classes):**
- 8 mini-games -> `bots/social/games/{trivia,wyr,rps,blackjack,hangman,wordle,connect4,poll}.py` + `games/__init__.py` re-export. Word-list constants (`_HANGMAN_WORDS`/`_STAGES`, `_WORDLE_WORDS`) moved with their game; blackjack imports its hand helpers from `games_logic`. No circular import — games depend only on `discord` + `games_logic`.
- Music -> `bots/social/music_ui.py` (`MusicQueue`, `VolumeSelect`, `PageButton`, `MusicControlView`). The 4 bot-side callbacks the music Views use (`_get_queue`, `_build_now_playing_embed`, `_set_deaf`, `_start_playing`) are placeholders in `music_ui`, injected by `bot.py` at end-of-module to avoid an import cycle.

`bot.py` imports all classes back, so every command callback + the persistent-view registration are unchanged. `VoiceListenerSink` left in place (nested class, not top-level).

**Verification:** `test_social_bot_import.py` (50+ commands register) + `test_social_games_logic.py` + game registry/relay suites green; each moved View instantiates with its constants/logic; music injection wired (`_get_queue` returns a `MusicQueue`, `MusicControlView` builds its 8 controls); py_compile clean. Deploys via the integrator merge.

<details><summary>Original entry (verbatim, moved from BMO-SUGGESTIONS-LOG.md)</summary>

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

</details>
### [2026-06-28] status_board.py adds 8 production print() (CLI/dry-run block) — trips bmo print() ratchet on auto/alert-board

- **Reported by:** ci-failure-triage (automated)
- **Category:** ci / lint (print ratchet)
- **Severity:** high (branch CI red; blocks alert-board integration)
- **Domain:** bmo
- **Failing run:** 28338723045 (2026-06-28T22:51Z) — job `bmo print() ratchet`, step `bash bmo/pi/scripts/check-no-new-prints.sh`, exit 1 (production print() count=171 baseline=163 → 8 new)
- **Branch / commit:** `auto/alert-board` @ 21873be7 ("feat(bmo): scaffold self-healing status board (design-first, not wired)")

**Root cause:**
The new file `bmo/pi/services/status_board.py` (the only code file added vs origin/master besides the design doc) introduces 8 `print()` calls in its CLI/dry-run `__main__` demo block (the `=== TOPIC ===` / `=== EMBED (dry-run) ===` banners, the per-field and per-incident dumps, and `print("could not read monitor_state.json:", e)`). The ratchet counts these as production prints, pushing the count 163 → 171. Note: the script's "New/added print() lines" listing shows the sorted tail (social/bot.py, discord_dm_bot.py, ide_app.py), which are NOT the culprits — `git diff origin/master 21873be7` confirms all 8 added prints live in status_board.py.

**Fix needed:**
Route the dry-run/demo output through `services.bmo_logging.get_logger` (or a small emit helper / `click.echo` the ratchet excludes), OR move the demo to a tests/ or scripts/ path the ratchet excludes. If the CLI prints are intentional and acceptable, raise `bmo/pi/.print-baseline` to 171 with a one-line note. Re-run the ratchet after. Owner: alert-board agent / bmo domain.

- **Resolved by:** ci-failure-triage (automated) — self-resolved / fixed-forward, verified green.
- **Resolution:** alert-board owner reworked the status_board dry-run output; branch `auto/alert-board` @ `cc01105c` ratchet run `28341257029` = **success** (count back to baseline 163). Merged to master as `ac155feb` (which tripped the ratchet once, run `28341195761`) then fixed forward on master by `cc01105c` + merge `af795b36` ("drop _dryrun print()"); master HEAD `af795b36` ratchet run `28341269327` = **success**. Master and branch both green; no further action.

---

### [2026-06-28] bmo-resolver — bmo backlog batch (6 issues + 5 suggestions), user-approved

- **Resolved by:** bmo-resolver  **Branch:** `auto/bmo-resolver` (rebased onto current origin/master; integrator merges; bmo auto-deploys on merge)
- **During:** scheduled bmo-resolver run; all open bmo entries approved by the user 2026-06-28. (origin/master advanced ~22 commits mid-run; branch rebased and redundant fixes dropped — see notes.)

**Issue resolutions:**
1. `/api/music/*` + `/api/calendar/*` 500-storm — proximate None-deref guards were already on master (integrator `32fc08c4`); added the deeper layers: `/api/health/full` surfaces per-service init status (degraded), bounded `ensure_music()`/`ensure_calendar()` self-heal a transient-boot-race service left `None`, and `ide._resolve_agent` resolves `__main__`-first + raises a clean error instead of derefing `None`. (`b8781746`)
2. `bmo / deploy` dirty-tree race — already resolved on master (`3f7222d1`, settle-poll re-polls a transient dirty live tree before Gate 3 aborts). No further code needed; archived as already-resolved.
3. Calendar token never re-persisted — resolved on master by **phase 05** (`e08d6c1c`: `_persist_token_if_changed` persists the token after an in-memory refresh). Verified present on the rebased base; my duplicate implementation was **dropped during rebase** to avoid a conflicting double-fix. Archived as resolved (by phase 05).
5. `init_tv_remote` blocking ERROR each boot — `adb connect` moved to a daemon thread; expected TV-unreachable timeout downgraded `log.exception`→`log.info`. (`2898b58e`)
6. Pi soft thermal limit — fan curve already reaches full 255 by 75 °C on master (integrator `2ebb90e1`); only the physical heatsink/airflow check remains (hardware, not code). Archived as already-resolved.
7. aiohttp `NotAppKeyWarning` — `dm_bot_control` uses a typed `web.AppKey` (`BOT_KEY`). (`2898b58e`)

*(Issue #4 — `bmo-voice-canary.service` stale module path — was already fixed AND archived by phase 06 before this run; the redundant unit edit was dropped during rebase.)*

**Suggestion resolutions:**
8. DMSession lost on restart — serialize/persist/restore + `on_ready` recovery to `data/dm_session_state.json`. (`ae16ee52`)
9. Discord-bot zombie liveness — `bots/sd_watchdog.py` + `Type=notify`/`WatchdogSec=120` on both bot units; pings only while gateway-ready. (`9077d9cd`)
10. VTT sync drops events — durable outbox (`vtt_sync_outbox.jsonl`) + drain-on-reconnect (eventId dedup, TTL expiry). (`7e07c1e7`)
11. Router telemetry / dead Tier-3 — per-tier `metrics_counters`; Tier-3 restored as opt-in (non-voice channel + `disable_tiers`); voice path unaffected. (`38d5b5e8`)
13. Routine engine empty — `seed_examples()` ships 3 disabled starter routines + routine_agent nudge + `SERVICES.md` doc. (`f0a12a91`)

**Verification:** py_compile + targeted pytest per file on the rebased tree (system_api 13, music_api 8, monitoring_health 11, game_registry 21, dm_bot_control 50, dm_bot_voice 33, social_bot_import 4, bmo_auth 16, auth 12, sync 10 — all green). Live Pi actions (not via branch): 4 data DBs chmod 0600 + bmo-peerjs container recreated with loopback bind (see security archive). Code deploys via the integrator merge.

**NOT done:** suggestion #12 (social-bot god-module split) — left active in `BMO-SUGGESTIONS-LOG.md` with a note + `warn`.

<details><summary>Original entries (verbatim, moved from BMO-ISSUES-LOG.md + BMO-SUGGESTIONS-LOG.md)</summary>

### [2026-06-24] `/api/music/*` + `/api/calendar/events` 500-storm — lazy service accessors deref `None` after a swallowed init failure (no guard, no retry)

- **Category:** bug
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan of bmo.service runtime logs (journal)

**Description:**
On the current `bmo.service` boot (start 2026-06-23 16:07:06 MDT, `NRestarts=0`), both the music and calendar services failed to initialize and were left as `None`, and the read endpoints that depend on them now raise an unhandled `AttributeError` on **every** poll. In the last 24h the journal shows ~**9,305** `Exception on /api/music/state [GET]` plus a handful on `/api/music/devices`, `/api/music/most-played`, `/api/music/history`, and **65** `Exception on /api/calendar/events [GET]`. The kiosk/web UI polls `/api/music/state` roughly every 2s, so this is a continuous 500-storm that floods the journal (hastening rotation — the original init-time exception has already rotated away) and leaves the music + calendar panels broken for the whole uptime.

**Reproduction:**
1. Cause (or simulate) a `MusicService` / calendar init failure at app startup (`app.py` swallows it: `except Exception: log.exception("Music: SKIPPED")`, leaving module-global `music = None`; calendar analogous).
2. Hit `GET /api/music/state` (or let the kiosk poll it).
3. Observed: `AttributeError: 'NoneType' object has no attribute 'get_state'` at `routes/music_api.py:135` → Flask 500. Same shape at `routes/calendar_api.py:35` (`'NoneType' object has no attribute 'get_upcoming_events'`).

**Expected behavior:** A read endpoint for an unavailable service should degrade gracefully — e.g. return `{"available": false, ...}` (HTTP 200) or a clean `503`, not an unhandled 500 on every poll. Init failure should be surfaced (e.g. on `/health`) rather than only visible as endpoint 500s.

**Hypothesis / root cause (two layers):**
- **Proximate:** `_music()` (`routes/music_api.py:20-22`, `return app.music`) and `_calendar()` (`routes/calendar_api.py:26-27`, `return app.calendar`) return `None` when the service failed to init, and the handlers deref the result with no None-guard (`routes/music_api.py:135` `_music().get_state()`; `routes/calendar_api.py:35`). The `music_api.py` module docstring even calls this out as deliberate "pre-extraction behavior" — but a 500 on a hot poll loop is a defect, not a feature.
- **Contributing:** `app.py:664-670` (and the calendar equivalent) catch *all* init exceptions and continue with the service set to `None`, with **no retry and no health-surfaced degradation**. A transient boot-ordering race (audio sink / network / OAuth not ready when `MusicService.__init__` runs `vlc.Instance(...)` / `YTMusic()`, or an expired Google token for calendar) therefore **permanently** disables the feature until a manual restart. Verified the deps themselves are healthy *now*: live venv has `python-vlc 3.0.21203` + `ytmusicapi 1.12.0`, `import vlc` / `YTMusic()` ctor both succeed, `vlc`/`cvlc` binaries present — so this was an init-time/transient failure, not a missing dependency. (Exact boot exception unrecoverable: the 500-storm flooded the journal past rotation. NOT canary mode — confirmed no `BMO_CANARY` in the unit env or `.env`.)

**Proposed fix / improvement:**
- [ ] Guard the lazy accessors / handlers: when `app.music` / `app.calendar` is `None`, return a degraded JSON payload (`available:false`) or `503`, never deref `None`. Apply across all `/api/music/*` and `/api/calendar/*` read handlers (and any other `routes/*.py` that does `return app.<svc>` then derefs — `routes/ide.py:56` `return app.agent` is the same shape).
- [ ] Surface failed service init on `/health` (degraded), so monitoring/alerts fire instead of the failure being visible only as endpoint 500s.
- [ ] Add a bounded re-init/retry (or lazy re-construct on first use) so a transient boot-race self-heals instead of staying dead for the whole uptime.

**Related files:** `bmo/pi/routes/music_api.py` (`_music`, `:135`), `bmo/pi/routes/calendar_api.py` (`_calendar`, `:35`), `bmo/pi/app.py` (`:660-670` music init swallow; calendar init), `bmo/pi/routes/ide.py:56` (same accessor pattern), `bmo/pi/services/music_service.py`.

### [2026-06-23] `bmo / deploy` red on master — health-gated deploy aborts on dirty live checkout (Gate 3) due to concurrent dev-tree writes

- **Category:** infra / CI (deploy reliability)
- **Severity:** high
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** ci-failure-triage (2026-06-23 ~08:30Z run)
- **Failed runs:** `28012173813` (target `a349ea7b`, 08:14Z) and `28012662356` (target `dfdc76e2`, 08:23Z) — both `bmo / deploy` on master.

**Root cause:**
`bmo/pi/scripts/deploy.sh` Gate 3 (`git status --porcelain` non-empty → `fail "working tree is dirty; commit/clean before deploying (never auto-stashed)"`, line 157) aborted before any mutation. The Pi's deploy target `/home/patrick/home-lab` is also the shared **dev tree** (deploy.sh explicitly never stashes/clobbers it). At deploy time the tree was dirty from in-flight automation: the `docs/logs/` migration (commit `dfdc76e2`) was still mid-flight — staged deletions of the old-path bridge files `docs/*-LOG.md` / `docs/RESOLVED-*.md` plus unstaged edits to `.gitattributes`, `.gitignore`, and `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`. Confirmed live during triage: the tree flipped clean→dirty within minutes, so it is an **ongoing race**, not a one-off. Not a code defect in deploy.sh — a contention problem between the health-gated deploy and concurrent agents editing the live checkout. Last successful deploy was `88c5f7e5` (07:58Z); master HEAD `717f07a6` is currently **undeployed**.

**Proposed fix:**
- [x] **Immediate (DONE 2026-06-23 ~08:40Z, ci-failure-triage):** migration committed (master HEAD `9dc2e615`, tree clean, no in-flight agents), re-dispatched `bmo / deploy` via `workflow_dispatch` on `9dc2e615` → run `28013620616` **succeeded**; master deploy is green and `9dc2e615` is now deployed (prev last-good was `88c5f7e5`). Original note: once the in-flight `docs/logs` migration is committed and `git status --porcelain` on the Pi is empty, re-dispatch `bmo / deploy` (`gh workflow run "bmo / deploy"`, default target = `origin/master` HEAD) so master lands green and `717f07a6` actually deploys. (Not done by triage: committing/cleaning the tree would have clobbered another agent's half-staged migration.)
- [ ] **Structural:** make deploy independent of the shared dev tree — deploy from a clean ephemeral checkout (dedicated `git worktree` / fresh clone to a deploy-only path), OR have the deploy gate retry/back-off on a *transient* dirty tree (re-poll `status --porcelain` for N seconds before failing) so concurrent agent edits can no longer turn the deploy red.
- [ ] Optionally serialize live-tree-mutating agents against deploys via the existing `home-lab-locks/` lock convention.

**Note (benign, no action):** cancelled run `28012396581` (dnd-app CI, `91096a31`) was a concurrency supersede — the next master push `dfdc76e2` ran dnd-app CI green (`28012454736`).
*(none currently logged)*

### [2026-06-24] Calendar token never re-persisted after in-memory refresh — monitoring fires a perpetual false CRITICAL “auto-refresh is not happening” while the calendar is actually working

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — journal showed 8× CRITICAL `google_calendar: Calendar token expired and auto-refresh is not happening — run reauth_calendar.py` on the current `bmo.service` uptime

**Description:**
On every `bmo.service` uptime, ~1h after boot the calendar monitor escalates to a CRITICAL alert telling the user to re-authorize the calendar — but the calendar is fully functional. Verified live: `GET /api/calendar/events` returns real upcoming events (200), yet `config/token.json` still has its boot-time `expiry` (`2026-06-24T23:06:22Z`) and an mtime frozen at process start (`16:06:23`), i.e. it has not been rewritten in the >2.5h since the access token expired. So the on-disk token looks permanently expired even though the live client keeps refreshing in memory. The result is an actionable-looking CRITICAL that is a false positive, plus on-disk token drift.

**Reproduction:**
1. Start `bmo.service` with a valid `token.json` (valid `refresh_token`, ~1h access-token lifetime).
2. Wait past the access-token `expiry` (+10 min monitor grace).
3. Observed: `services/monitoring.py::_check_calendar_token` emits `Severity.CRITICAL google_calendar: “auto-refresh is not happening — run reauth_calendar.py”`, while `/api/calendar/events` still returns events and `token.json` mtime/expiry never advance.

**Expected behavior:** When the live client successfully auto-refreshes, the new access token + expiry should be persisted to `token.json` so the file-based monitor sees a fresh token; the CRITICAL should only fire when refresh genuinely fails (revoked / `invalid_grant` / missing `refresh_token`).

**Hypothesis / root cause (confirmed):** Two decoupled layers.
- `services/calendar_service.py::_get_service()` caches the built client in `self._service` (`:98-99`) and only runs the refresh-and-persist block (`creds.refresh(Request())` → `_write_token_json(creds.to_json())`, `:121-125`) on the **cold-build** path when `self._service is None`. After the first successful build, every later call returns the cached client. The underlying `google` `Credentials` object auto-refreshes **in memory** on API calls (so the feature keeps working), but that refreshed token is never written back to `token.json` — `_write_token_json` is not called again for the life of the process.
- `services/monitoring.py::_check_calendar_token` (`:1562-1615`) decides health purely from the on-disk `token.json` `expiry`. Because of the above, the on-disk expiry is permanently stale, so after the 10-min grace (`expired_for > 600`) it always escalates to CRITICAL even though refresh is happening (just not persisted). The monitor and the live client are looking at two different sources of truth.

**Proposed fix / improvement:**
- [ ] Persist the refreshed credentials after a successful in-memory refresh — e.g. register a refresh callback / re-`_write_token_json(creds.to_json())` after API calls, or have `_with_service_retry` write the token when `creds.expiry` advances, so `token.json` tracks the live token.
- [ ] Have the monitor consult the live credential state (or a status the calendar service publishes after a successful refresh) rather than the file `expiry` alone, so a working auto-refresh does not read as CRITICAL.
- [ ] (Optional) Suppress/downgrade the CRITICAL when a recent successful calendar API call is observed, to stop alert fatigue.

**Related files:** `bmo/pi/services/calendar_service.py` (`_get_service` `:98-146`, `_write_token_json` `:79`, `_with_service_retry` `:148-160`), `bmo/pi/services/monitoring.py` (`_check_calendar_token` `:1491-1655`), `bmo/pi/config/token.json` (runtime, gitignored).

**Related entries:** see the [2026-06-24] `/api/music/*` + `/api/calendar/events` 500-storm entry above — that covers None-deref 500s on init failure; this is a distinct defect where the service inits fine but refresh persistence + the monitor disagree.

### [2026-06-24] `init_tv_remote` blocks startup ~5s and logs an ERROR traceback every boot when the TV is unreachable (`adb connect` timeout)

- **Category:** bug, performance
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — journal shows `[ERROR] [bmo] [tv] ADB connect failed` + a `subprocess.TimeoutExpired` traceback on every `bmo.service` boot

**Description:**
At startup `init_tv_remote()` runs `subprocess.run(["adb", "connect", f"{TV_IP}:5555"], timeout=5)` synchronously on the app init path. When the TV is off/unreachable (the normal case much of the day) this blocks for the full 5s and then raises `subprocess.TimeoutExpired`, which is caught but logged via `log.exception` — so a full traceback at ERROR level lands in the journal on every boot. Observed alongside the boot-time `monitoring: Expected ports not listening: BMO Flask (:5000)` warning, i.e. the 5s adb timeout delays the Flask bind. Functionally harmless (it is caught, and a 60s background reconnect thread exists), but it is recurring log noise rated ERROR for an expected condition, plus avoidable startup latency.

**Reproduction:**
1. Power off / disconnect the TV at `TV_IP`.
2. Restart `bmo.service`.
3. Observed: ~5s stall, then `[tv] ADB connect failed` ERROR + `TimeoutExpired: Command [adb, connect, 10.10.20.194:5555] timed out after 5 seconds` traceback at `routes/tv_api.py:133`.

**Expected behavior:** A TV that is simply off should not produce an ERROR-level traceback or block startup. Log it at INFO/DEBUG (“TV not reachable, will retry in background”) and/or move the initial `adb connect` off the synchronous startup path into the existing `_tv_bg_reconnect` thread.

**Hypothesis / root cause:** `routes/tv_api.py::init_tv_remote` (`:128-146`) does the blocking `adb connect` inline and uses `log.exception("[tv] ADB connect failed")` in its `except`, which always emits a traceback at ERROR even for the benign “TV is off” timeout.

**Proposed fix / improvement:**
- [ ] Downgrade the caught-timeout log from `log.exception` (ERROR+traceback) to `log.info`/`log.debug` for the expected unreachable case.
- [ ] Move the initial `adb connect` into the background reconnect thread so startup (and Flask bind) is not delayed by an unreachable TV.

**Related files:** `bmo/pi/routes/tv_api.py` (`init_tv_remote` `:128-146`, `_tv_bg_reconnect` `:160+`).

### [2026-06-24] Pi hit the soft thermal limit (`get_throttled=0x80000`) — CPU peaked 82°C under load and the fan duty curve caps below max

- **Category:** performance
- **Severity:** low
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `bmo.service` journal logged 2× `[CRITICAL] pi_cpu_temp: CPU temperature critical` (82.0°C, 81.5°C) in 24h

**Description:**
`vcgencmd get_throttled` returns `0x80000` (bit 19 = “soft temperature limit has occurred”), and the monitor recorded CPU spikes to 82.0°C / 81.5°C (CRITICAL) plus several 73–79°C elevated readings over 24h. At scan time the Pi was idle/cool (49°C) and not actively throttling (no bits 0–3 set), so this is intermittent under load (e.g. local LLM inference — `gemma3:4b` is warmed in-process). The fan controller (`bmo-fan.service`) is running and responding, but its duty observed capping around `227/255` even at ~75°C rather than ramping to full 255, so peak load can still cross the soft limit before the fan saturates.

**Reproduction:**
1. Drive sustained CPU load (e.g. Ollama inference) on the Pi.
2. Observe `journalctl -u bmo.service | grep "temperature critical"` and `vcgencmd get_throttled` (`0x80000`).

**Expected behavior:** Under sustained load the fan should reach full duty early enough to keep the SoC below the soft thermal limit, and ideally the system should avoid recurring CRITICAL temp events.

**Hypothesis / root cause (speculative):** The fan duty curve in `hardware/fan_control.py` tops out below 255 (or ramps too gently) relative to the thermal load of in-process LLM inference, so worst-case load briefly outruns cooling. Could also be a heatsink/airflow limitation. Needs measurement before tuning.

**Proposed fix / improvement:**
- [ ] Review the duty curve in `bmo/pi/hardware/fan_control.py` — allow full 255 duty (and an earlier/steeper ramp) above ~75°C.
- [ ] Consider capping/queuing concurrent LLM inference, or verify heatsink/airflow, if the soft limit keeps recurring.

**Related files:** `bmo/pi/hardware/fan_control.py`, `bmo/pi/services/monitoring.py` (`pi_cpu_temp` check).

### [2026-06-24] aiohttp `NotAppKeyWarning` in `dm_bot_control.py` — string `app["bot"]` keys instead of `web.AppKey` (24 warnings in the test run)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — full `pytest` run (1281 passed, 6 skipped) emitted 24× `NotAppKeyWarning` from `bmo/pi/bots/dm_bot_control.py`

**Description:**
The DM bot control plane stores and reads its bot handle on the aiohttp app via the string key `app["bot"]` (set at `dm_bot_control.py:365`; read at `:59,119,160,180,190,200,213,247,287,303,…`). aiohttp now recommends typed `web.AppKey` instances and emits `NotAppKeyWarning` for plain-string keys; string keys are slated for eventual deprecation. No functional impact today — just forward-compat debt and test-output noise.

**Proposed fix / improvement:**
- [ ] Define a module-level `BOT_KEY = web.AppKey("bot", commands.Bot)` (or appropriate type) and switch the set/read sites to it.

**Related files:** `bmo/pi/bots/dm_bot_control.py` (`:365` set; reads at `:59,119,160,180,190,200,213,247,287,303`).


---

> dnd-app issues: `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`. BMO future ideas / design gotchas / observations: `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`. Security (any domain): `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO issues: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.

### [2026-06-24] DM bot loses all live session state on restart — only `campaign_memory` (NPCs/locations/threads) is persisted, not the active `DMSession`

- **Category:** future-idea (reliability + UX)
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the Discord DM bot + DM engine

**Description:**
`DMSession` in `bots/discord_dm_bot.py` (class at ~line 343) holds the entire live state of a running D&D session purely in memory: the AI conversation history (`self.messages`, with `_compress_context` summarization), the initiative tracker (`initiative_order`, `initiative_round`, `initiative_collecting`), the `combat_log`, the active `players` set, and the voice-channel binding. None of it is serialized — `__init__` builds empty structures and `reset()` clears them. The only durable store is `services/campaign_memory.py` (sqlite: sessions, NPCs, locations, plot threads, notes) and the separate play-by-post `pbp_store.py`. So if `bmo-dm-bot.service` restarts mid-session — a deploy, an OOM kill, a crash, or a Pi reboot — the DM "forgets" everything about the in-progress encounter: whose turn it is, the round number, the combat log, and the running narration context. Players have to re-establish initiative and re-explain what just happened. This is not hypothetical on this host: BMO-RESOLVED documents a real boot-time clock-skew crash loop that took both bots down (2026-06-20), exactly the kind of mid-session restart that would wipe a live `DMSession`. The `Restart=on-failure` hardening that was added protects the *process*, but a restarted process comes back with a blank session.

**Hypothesis / root cause:** `DMSession` was designed as ephemeral runtime state; persistence work stopped at `campaign_memory` (long-term campaign facts) and `pbp_store` (async turn queue) and never extended to the live synchronous session.

**Proposed fix / improvement:**
- [ ] Serialize the recoverable parts of `DMSession` (messages/compressed-context, initiative_order + round, combat_log, players, text/voice channel IDs) to a small JSON or sqlite blob on each mutation (or on a short debounce), keyed by guild/channel.
- [ ] On `on_ready`/`setup_hook`, if a persisted session exists for the channel and is recent (e.g. < a few hours old), offer to resume it (a slash command like `/resume` or an auto-restore with a "recovered your session" notice) rather than starting blank.
- [ ] Exclude non-serializable live handles (`voice_client`, `synth_task`, the `asyncio.Queue`) — rebuild those on resume; persist only data.
- [ ] Reuse the existing eventId/dedup discipline from `agents/vtt_sync.py` so a resumed session does not double-push state to the VTT.

**Related files:** `bmo/pi/bots/discord_dm_bot.py:343` (`DMSession`), `bmo/pi/bots/discord_dm_bot.py` (`add_message`/`_compress_context`/`reset`), `bmo/pi/services/campaign_memory.py`, `bmo/pi/services/pbp_store.py`.

**Related entries:** BMO-RESOLVED 2026-06-20 (boot-time clock-skew crash loop took both Discord bots down) — the failure mode that makes this gap bite.

---

### [2026-06-24] Discord-bot health is process-level only (`systemctl is-active`) — no gateway-connection heartbeat, so a "zombie" bot (process up, gateway dropped / event loop stalled) is invisible and never restarted

- **Category:** future-idea (observability + reliability)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `services/monitoring.py` + the Discord bots + systemd units

**Description:**
`monitoring.py` watches the Discord bots via `_check_systemd_services()` over `_MONITORED_SERVICES = ["bmo", "docker", "bmo-dm-bot", "bmo-social-bot", "bmo-kiosk", "bmo-fan"]`, but the only signal it reads is `systemctl is-active`. That proves the *process* exists; it says nothing about whether the bot is actually connected to Discord's gateway. discord.py auto-reconnects from most gateway drops, but it does not cover a *stalled event loop* (a blocking call, a deadlocked synth/relay task) or a silent half-open connection — in those cases the process stays `active`, `Restart=on-failure` never fires (the process didn't exit), and monitoring reports green while the bot is functionally dead. There is no `WatchdogSec=`/`sd_notify` on any unit (`systemd/*.service` only set `Restart=`/`RestartSec=`), and neither bot surfaces `bot.latency` / `is_ready()` / `is_closed()` to the monitor or to the `dm_bot_control` plane. The recently-fixed swallow-and-exit-0 startup bug (BMO-RESOLVED 2026-06-20) closed the *crash* path; this is the complementary *liveness* path that crash-restart cannot catch.

**Hypothesis / root cause:** health monitoring was built around HTTP services and systemd unit state; the Discord bots have no HTTP surface, so they got the weakest available check (`is-active`) and no gateway-level liveness probe.

**Proposed fix / improvement:**
- [ ] Drive a systemd watchdog from each bot's event loop: set `WatchdogSec=` + `Type=notify` on `bmo-dm-bot.service` / `bmo-social-bot.service` and have a periodic asyncio task call `sd_notify("WATCHDOG=1")` only while `not bot.is_closed()` and `bot.is_ready()`. A stalled loop then misses the ping and systemd restarts the unit.
- [ ] Expose gateway health (`bot.latency` in ms, `is_ready`, last-heartbeat-ack age) over the existing `dm_bot_control` control plane (and an equivalent for the social bot), and have `monitoring.py` read it instead of relying solely on `is-active`.
- [ ] Optionally extend the voice-canary pattern (`bmo-voice-canary.timer`) to a lightweight Discord-relay canary that confirms an end-to-end round trip, not just process liveness.

**Related files:** `bmo/pi/services/monitoring.py:1139` (`_MONITORED_SERVICES`), `bmo/pi/services/monitoring.py` (`_check_systemd_services`), `bmo/pi/systemd/bmo-dm-bot.service`, `bmo/pi/systemd/bmo-social-bot.service`, `bmo/pi/bots/dm_bot_control.py`, `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/bots/social/bot.py`.

**Related entries:** BMO-RESOLVED 2026-06-20 (Discord bots swallowed startup exception + exited 0, defeating `Restart=on-failure`) — that closed the crash path; this covers the process-alive-but-disconnected path.

---

### [2026-06-24] VTT sync drops session events (rolls/messages/joins) when the VTT is offline longer than the bounded retry window — no persistent outbox / replay-on-reconnect

- **Category:** future-idea (reliability + UX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `agents/vtt_sync.py` (DM bot → VTT relay)

**Description:**
`agents/vtt_sync.py` pushes Discord-side session events to the VTT (`push_discord_message`, `push_discord_roll`, `push_player_join`, `push_player_leave`) via `_send_with_retry`, which does a bounded retry with backoff (3 retries → 4 attempts) on a daemon thread, with a stable `eventId` so the VTT can dedup. That is well-built for transient blips, but the retry budget is short (a few seconds total). If the VTT is down or unreachable for longer than that window — VTT app restart, host switching Wi-Fi, the laptop sleeping — the event is dropped silently and there is no persistent outbox to replay it once `/api/sync/health` reports the VTT back. For a live D&D relay, a dropped `push_discord_roll` means a player's `/roll d20` simply never lands in the VTT chat panel, with no indication to either side. The dedup/eventId machinery needed to make replay safe already exists; only the durable buffer + drain-on-reconnect is missing.

**Hypothesis / root cause:** the relay was designed as best-effort fire-and-forget with short retry; durability across a multi-minute VTT outage was out of scope at the time.

**Proposed fix / improvement:**
- [ ] On final retry exhaustion, append the event (with its existing `eventId`) to a small append-only outbox (JSON lines or sqlite) instead of dropping it.
- [ ] Add a periodic drainer that, when `GET /api/sync/health` is healthy again, replays queued events in order and relies on the VTT's existing eventId dedup; trim/expire entries older than a session-relevant TTL so stale rolls don't replay into a later session.
- [ ] Surface a lightweight "N events buffered, VTT offline" indicator (Discord status / control plane) so the table knows the relay is degraded rather than silently lossy.

**Related files:** `bmo/pi/agents/vtt_sync.py:131` (`_send_with_retry`), `bmo/pi/agents/vtt_sync.py` (`push_discord_message`/`push_discord_roll`/`push_player_join`/`push_player_leave`, `/api/sync/health` probe), `bmo/pi/bots/discord_dm_bot.py`.

---

### [2026-06-23] Router has no per-tier decision telemetry, and Tier-3 LLM classification is hard-commented-out rather than gated by `router.disable_tiers`

- **Category:** future-idea (observability + UX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor

**Description:**
`agents/router.py` resolves every message through Tier 1 (explicit `!prefix`) → Tier 2 (substring keyword scoring) → default `conversation`, but emits **no telemetry about which tier resolved a route or how often messages fall through to the catch-all**. The prior voice-latency metrics work (BMO-RESOLVED 2026-06-22, `/metrics` + `voice_metrics`) instruments stage *durations* including agent-routing *time*, but not routing *outcomes* — so a misroute (a smart-home or timer request that misses every keyword and silently lands in `conversation`) is invisible. There is already a process-lifetime counter facility (`services/metrics_counters.py`) feeding the hand-rolled Prometheus exposition in `routes/system_api.py:_prometheus_text`, so adding routing counters is cheap and fits the existing pattern. Two concrete gaps: (1) no counter like `bmo_router_tier_total{tier="prefix|keyword|default"}` to see the fall-through rate; (2) the Tier-3 LLM classifier is **commented out** at `agents/router.py:302-306`, yet the comment says "To re-enable: remove llm from `router.disable_tiers` in settings" — that setting does nothing because the call site is dead code, so the documented re-enable path is a no-op (config/code drift).

**Proposed fix / improvement:**
- [ ] Increment a `metrics_counters` counter in `route()` tagged by the tier that resolved (prefix / keyword / default), and export it via the existing `/metrics` endpoint; this surfaces the keyword-miss rate that would justify (or not) re-enabling Tier 3.
- [ ] Make Tier 3 actually honor `router.disable_tiers` — restore the gated call site so `disable_tiers` controls it, and consider enabling it **only for non-voice channels** (Discord text, IDE chat) where the 10-20 s LLM latency is acceptable but routing accuracy matters, keeping it off on the latency-critical voice path.
- [ ] Optionally log the chosen agent + tier at DEBUG for offline misroute analysis.

**Related files:** `bmo/pi/agents/router.py:269` (`route`), `bmo/pi/agents/router.py:297-306` (disabled Tier 3 + stale re-enable comment), `bmo/pi/services/metrics_counters.py`, `bmo/pi/routes/system_api.py:798` (`_prometheus_text`), `bmo/pi/services/voice/voice_metrics.py`.

---

### [2026-06-23] Routine automation engine ships with no starter/example routines — a powerful feature most users never discover

- **Category:** future-idea (UX / quality-of-life)
- **Severity:** low
- **Domain:** bmo

**Discovered by:** bmo-suggestor

**Description:**
`services/routine_service.py` is a capable automation engine — it chains actions (commands, speech, delays) off voice-phrase, cron-schedule, or system-event triggers, persisted to `data/routines.json` — and `agents/routine_agent.py` exposes create/list/trigger/enable/disable/delete via voice and chat. But the feature is **entirely empty on a fresh install**: `data/routines.json` starts blank, nothing is shipped, and BMO never volunteers that the capability exists, so a user has to already know to say "create a routine" and then hand-author triggers/actions by voice with no template to copy. High-value, obviously-useful automations the existing primitives already support — a spoken **morning briefing** (calendar + weather + last session recap on a weekday cron), a **"good night"** routine (lights off, music stop, alarms armed), a **"leaving home"** routine (TV/Chromecast off, lights off) — are all buildable today but invisible. This is a discoverability/QoL gap, not a missing capability.

**Proposed fix / improvement:**
- [ ] Ship a small library of disabled-by-default **example routines** (e.g. `data/routines.example.json` or seeded on first boot) covering morning-briefing / good-night / leaving-home, so users have working templates to enable or clone.
- [ ] Have `routine_agent` surface a "you have no routines yet — want me to set up a morning briefing?" nudge on first list, and document the example set in `docs/SERVICES.md`.
- [ ] Optional: a compose-a-briefing helper that wires `calendar_agent` + `weather_agent` + `session_recap_agent` into one spoken routine action, demonstrating cross-agent chaining.

**Related files:** `bmo/pi/services/routine_service.py`, `bmo/pi/agents/routine_agent.py`, `bmo/pi/data/routines.json`, `bmo/pi/docs/SERVICES.md` (`../docs/SERVICES.md`), `bmo/pi/agents/{calendar_agent,weather_agent,session_recap_agent}.py`.

---

---

</details>

---

### [2026-06-28] bmo-phase-executer — PHASE-06 06E: `bmo-voice-canary.service` ExecStart stale module path, user-approved

- **Category:** bug, config
- **Severity:** medium
- **Domain:** bmo (Pi infra/tooling)
- **Resolved by:** bmo-phase-executer
- **Branch:** `auto/bmo-phase-executer` (awaiting integrator merge)
- **During:** scheduled bmo-phase-executer run; PHASE-06 user-approved 2026-06-28

**Resolution:** Updated the tracked unit `bmo/pi/systemd/bmo-voice-canary.service:10` ExecStart from `-m services.voice_canary` to `-m services.voice.voice_canary` (the post-`7ff69808` subpackage path), and fixed the matching stale reference in `bmo/docs/SYSTEMD.md`. `grep -rn "services.voice_canary" bmo/` now returns no hits outside this archived entry. This removes the installed-vs-repo drift the 2026-06-24 update flagged: the repo unit now agrees with the hand-patched live box, so a redeploy/reinstall no longer re-breaks the STT canary. **Owner action (not executed, rule 6):** `systemctl --user daemon-reload` (or the system equivalent) after merge+deploy so the corrected unit takes effect; the executer never reloads/restarts the live Pi.

<details><summary>Original entry (verbatim, moved from BMO-ISSUES-LOG.md)</summary>

### [2026-06-24] `bmo-voice-canary.service` ExecStart points at stale module path `services.voice_canary` — unit fails every run since the `services/voice/` refactor

- **Category:** bug, config
- **Severity:** medium
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** bmo-errors
- **During:** scheduled error scan — `systemctl --failed` showed `bmo-voice-canary.service` failed

**Description:**
`bmo-voice-canary.service` is in a **failed** state and has failed on every scheduled run (timer cadence 06:30 / 18:30; last failure 2026-06-24 06:34:27 MDT). The synthetic STT/voice-path regression canary therefore never runs, so the safety net it provides — detecting a real voice-path regression while `/health` stays green — is effectively dead and the failure is silent (only visible via `systemctl --failed`).

**Reproduction:**
1. `systemctl status bmo-voice-canary.service`
2. Observed: `python: No module named services.voice_canary` → `status=1/FAILURE`.

**Expected behavior:** The oneshot runs `services.voice.voice_canary` successfully and writes its pass/fail status file for `services/monitoring.py`.

**Hypothesis / root cause (confirmed):** Commit `7ff69808` ("refactor(bmo): group 9 voice/audio modules into services/voice/ subpackage") moved `voice_canary.py` from `services/` to `services/voice/`, so the importable module is now `services.voice.voice_canary`. The unit's `ExecStart` was not updated and still runs `-m services.voice_canary`. The repo unit file (`bmo/pi/systemd/bmo-voice-canary.service:10`) and the installed `/etc/systemd/system/bmo-voice-canary.service` are byte-identical (no drift) — both carry the stale path, so this is a real bug in the tracked unit, not installed-vs-repo drift. `bmo/docs/SYSTEMD.md:22` documents the same stale `-m services.voice_canary`.

**Proposed fix / improvement:**
- [ ] Update `ExecStart` in `bmo/pi/systemd/bmo-voice-canary.service` to `... -m services.voice.voice_canary`.
- [ ] Update the matching reference in `bmo/docs/SYSTEMD.md` (and `bmo/pi/README.md` if it carries the same string).
- [ ] Reinstall/`daemon-reload` the unit on the Pi after the doc/unit fix lands (deploy step).

**Related files:** `bmo/pi/systemd/bmo-voice-canary.service`, `bmo/pi/services/voice/voice_canary.py`, `bmo/docs/SYSTEMD.md`, `bmo/pi/README.md`.

**Update [2026-06-24] (bmo-errors):** This entry’s “byte-identical (no drift)” claim is now STALE — the live box was hand-patched but the repo was not. The **installed** `/etc/systemd/system/bmo-voice-canary.service` now reads `ExecStart=... -m services.voice.voice_canary` (correct — unit no longer in `systemctl --failed`, now `inactive dead` waiting on its timer), while the **repo** `bmo/pi/systemd/bmo-voice-canary.service:10` still carries the stale `-m services.voice_canary`. So there is now real **installed-vs-repo config drift**: the repo unit is still broken and a redeploy/reinstall (which treats the repo as source of truth) would re-break the canary. The repo fix in the checklist above is still required to make the box and source agree.

</details>

---

### [2026-06-23] bmo-resolver — `bmo / deploy` dirty-tree race (High) + SYSTEMD.md service count (low), user-approved

- **Category:** infra / CI (deploy reliability) + docs
- **Severity:** high + low
- **Domain:** bmo (Pi infra/tooling)
- **Resolved by:** bmo-resolver
- **Branch:** `auto/bmo-resolver` (awaiting integrator merge)
- **During:** scheduled bmo-resolver run; both open bmo entries approved by the user 2026-06-23

**Resolutions:**

1. **`bmo / deploy` red on master — Gate 3 aborts on transient dirty live checkout** — `bmo/pi/scripts/deploy.sh` Gate 3 now treats a dirty *production* tree (the live checkout doubles as the shared dev tree) as possibly transient: it re-polls `git status --porcelain` on a settle window before failing, instead of aborting on the first dirty read. Defaults `BMO_DEPLOY_DIRTY_RETRIES=12` × `BMO_DEPLOY_DIRTY_INTERVAL=5`s (≈60s), both env-overridable; a tree still dirty past the window is a hard fail with the same "dirty / never auto-stashed" message (we still NEVER stash or clobber). The retry is gated to production only (`ALLOW_NONSTANDARD_ROOT != 1`); the hermetic test harness keeps its immediate-fail behavior, so `test_dirty_tree_aborts` stays fast. This closes the race where concurrent agents editing the live tree turned the deploy red. (Chosen the "retry/back-off" structural option over the larger "deploy from an ephemeral clean checkout" rework — contained, no change to the clean-tree fast path, fully covered by existing tests.) Verified: `bash -n` + `shellcheck -S warning` clean; deploy/shell pytest **61 passed, 6 skipped** in 2.8s.

2. **`bmo/docs/SYSTEMD.md` stale "5 systemd services" headline** — Replaced the headline with the accurate count: 9 services + 3 timers (12 unit files total). Refreshed the stale `bmo-backup` "recoverable from git history / not installed" row (the units now live in `bmo/pi/systemd/`) and added the previously-missing `bmo-backup-verify` and `bmo-voice-canary` service+timer rows, so the units table is authoritative for all 12 unit files.

Verification: deploy.sh syntax + shellcheck clean; affected pytest green (61 passed / 6 skipped). No SECURITY-LOG bmo entries were in scope (the only open security entry is `Domain: dnd-app`). **Services NOT restarted** — both changes are a deploy-script edit and a docs edit that take effect via the integrator merge + the normal deploy, not from this branch; nothing on the running Pi needed a restart.

<details><summary>Original entries (verbatim, moved from BMO-ISSUES-LOG.md / BMO-SUGGESTIONS-LOG.md)</summary>

### [2026-06-23] `bmo / deploy` red on master — health-gated deploy aborts on dirty live checkout (Gate 3) due to concurrent dev-tree writes

- **Category:** infra / CI (deploy reliability)
- **Severity:** high
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** ci-failure-triage (2026-06-23 ~08:30Z run)
- **Failed runs:** `28012173813` (target `a349ea7b`, 08:14Z) and `28012662356` (target `dfdc76e2`, 08:23Z) — both `bmo / deploy` on master.

**Root cause:**
`bmo/pi/scripts/deploy.sh` Gate 3 (`git status --porcelain` non-empty → `fail "working tree is dirty; commit/clean before deploying (never auto-stashed)"`, line 157) aborted before any mutation. The Pi's deploy target `/home/patrick/home-lab` is also the shared **dev tree** (deploy.sh explicitly never stashes/clobbers it). At deploy time the tree was dirty from in-flight automation: the `docs/logs/` migration (commit `dfdc76e2`) was still mid-flight — staged deletions of the old-path bridge files `docs/*-LOG.md` / `docs/RESOLVED-*.md` plus unstaged edits to `.gitattributes`, `.gitignore`, and `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`. Confirmed live during triage: the tree flipped clean→dirty within minutes, so it is an **ongoing race**, not a one-off. Not a code defect in deploy.sh — a contention problem between the health-gated deploy and concurrent agents editing the live checkout. Last successful deploy was `88c5f7e5` (07:58Z); master HEAD `717f07a6` is currently **undeployed**.

**Proposed fix:**
- [ ] **Immediate:** once the in-flight `docs/logs` migration is committed and `git status --porcelain` on the Pi is empty, re-dispatch `bmo / deploy` (`gh workflow run "bmo / deploy"`, default target = `origin/master` HEAD) so master lands green and `717f07a6` actually deploys. (Not done by triage: committing/cleaning the tree would have clobbered another agent's half-staged migration.)
- [ ] **Structural:** make deploy independent of the shared dev tree — deploy from a clean ephemeral checkout (dedicated `git worktree` / fresh clone to a deploy-only path), OR have the deploy gate retry/back-off on a *transient* dirty tree (re-poll `status --porcelain` for N seconds before failing) so concurrent agent edits can no longer turn the deploy red.
- [ ] Optionally serialize live-tree-mutating agents against deploys via the existing `home-lab-locks/` lock convention.

**Note (benign, no action):** cancelled run `28012396581` (dnd-app CI, `91096a31`) was a concurrency supersede — the next master push `dfdc76e2` ran dnd-app CI green (`28012454736`).

### [2026-06-23] `bmo/docs/SYSTEMD.md` opening line says "5 systemd services" but there are 10 services + 2 timers

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-resolver
- **During:** resolving the kiosk→systemd rename / docs-index entries (cross-checking doc counts)

**Description:**
`bmo/docs/SYSTEMD.md` line 2 reads "5 systemd services manage BMO's runtime." The `bmo/pi/systemd/` dir actually holds **10 `.service` files + 2 `.timer` files** (`bmo`, `bmo-kiosk`, `bmo-fan`, `bmo-dm-bot`, `bmo-social-bot`, `bmo-ide`, `bmo-backup`(+timer), `bmo-voice-canary`(+timer), and the new `bmo-backup-verify`(+timer)). Same stale-count smell as the AGENTS.md "5 agents" line fixed this run — left unfixed here only because it was outside the approved entry set.

**Proposed fix / improvement:**
- [ ] Update the SYSTEMD.md headline to the real count (or drop the number and let the table be authoritative); confirm the units table lists all 12 unit files.

**Related files:** `bmo/docs/SYSTEMD.md`, `bmo/pi/systemd/`
*(All 11 future-idea entries logged 2026-06-23 were resolved the same day by bmo-resolver and moved to [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md).)*

</details>

---

### [2026-06-23] bmo-resolver batch — 11 BMO suggestions resolved (user-approved)

- **Category:** debt, docs, future-idea
- **Severity:** mixed (medium/low)
- **Domain:** bmo
- **Resolved by:** bmo-resolver
- **Branch:** `auto/bmo-resolver` (awaiting integrator merge)
- **During:** scheduled bmo-resolver run; all 11 open `BMO-SUGGESTIONS-LOG.md` entries approved by the user 2026-06-23

**Resolutions (newest-suggestion-first, as listed in the suggestions log):**

1. **Split the 6.8k-line `bots/discord_social_bot.py` god-module into a `bots/social/` subpackage** — `248143ef` — Created `bots/social/` package; `git mv` module to `bots/social/bot.py`; extracted pure logic to `bots/social/games_logic.py`; `bots/discord_social_bot.py` is now a thin shim (entry point + legacy imports unchanged).
2. **Rename `bmo/pi/kiosk/` to `bmo/pi/systemd/`** — `8d6374a4` — `git mv bmo/pi/kiosk -> bmo/pi/systemd`; updated setup-bmo.sh unit-copy loop + README trees + SYSTEMD/TROUBLESHOOTING/ARCHITECTURE/DESIGN-CONSTRAINTS path refs.
3. **`bmo/docs/ARCHITECTURE.md` (~line 173) wrongly says systemd units live in `ide_app/`** — `8d6374a4` — Line now reads `bmo/pi/systemd/` only; dropped the nonexistent `ide_app/` clause.
4. **`bmo/docs/AGENTS.md` opening line contradicts the 28-registered line** — `8d6374a4` — Headline now says 28 routable, matching the body.
5. **Group the 9 voice/audio service modules into a `services/voice/` subpackage** — `7ff69808` — `git mv` the 9 modules into `services/voice/` (names unchanged); rewrote all importers to `services.voice.*`; added re-exporting `__init__`; 243+ tests pass.
6. **Add a `bmo/docs/README.md` index for the 9 docs** — `8d6374a4` — Added `bmo/docs/README.md` index (start-here + per-doc table); linked from `bmo/README.md`.
7. **Export health + voice metrics in Prometheus format** — `eaa48ae7` — Added hand-rolled `GET /metrics` (voice stage latency, Pi gauges, per-service up/down from cached state, fallback counters via new `services/metrics_counters.py`); no new dependency.
8. **Add `.env.example` + fail-fast startup config preflight (degraded-mode banner)** — `00596a22` — `.env.template` already enumerates every key, so no duplicate `.env.example`; added `services/config_preflight.py` (boot summary + degraded banner, `/api/health/full` `config` block, `BMO_PREFLIGHT_STRICT` opt-in hard-fail) + tests.
9. **Split monolithic `discord_social_bot.py` into discord.py cogs and add direct test coverage** — `248143ef` — Reconciled with the subpackage-split entry above: took the subpackage approach and added the missing direct tests (`test_social_bot_import.py` builds SocialBot + asserts 50+ commands register; `test_social_games_logic.py` unit-tests the extracted pure logic). discord.py Cogs not pursued separately (redundant once tests exist).
10. **Rotate the cron health-check log (`logs/health.log`)** — `659bbb18` — Added `bmo/pi/systemd/logrotate.d-bmo` (weekly, keep 4, compress); setup-bmo.sh installs it; installed live to `/etc/logrotate.d/bmo`.
11. **Document + periodically verify a full bare-metal disaster-recovery restore** — `659bbb18` — Added `docs/DISASTER-RECOVERY.md` cold-restore runbook + `scripts/verify-backup.sh` integrity check + monthly `bmo-backup-verify.service/.timer`; corrected the stale rclone/gdrive Backup Strategy in ARCHITECTURE.md (actual mechanism is local tar.gz via backup-state.sh).

Verification: `compileall` clean; full pytest **1220 passed, 6 skipped** (`-m "not live and not hardware"`). Live system: installed `/etc/logrotate.d/bmo` and enabled `bmo-backup-verify.timer`. Services not restarted (changes ship via the integrator merge + deploy, not from this branch).

<details><summary>Original suggestion entries (verbatim, moved from BMO-SUGGESTIONS-LOG.md)</summary>

### [2026-06-23] Split the 6.8k-line `bots/discord_social_bot.py` god-module into a `bots/social/` subpackage

- **Category:** debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (file-size + structure sweep)

**Description:**
`bmo/pi/bots/discord_social_bot.py` is **6,823 lines** — by far the largest file in the bmo tree (next is `app.py` at 2,831). It bundles ~17 top-level classes spanning unrelated concerns in one module: the music subsystem (`MusicQueue`, `VolumeSelect`, `PageButton`, `MusicControlView`), the `SocialBot(commands.Bot)` core (~2,800 lines on its own, lines 806-3651), and a large pile of self-contained mini-games each with its own View/Modal (`TriviaButton`/`TriviaView`, `WYRView`, `RPSView`, `BlackjackView`, `HangmanGuessModal`/`HangmanView`, `WordleGuessModal`/`WordleView`, `Connect4View`, `PollView`/`PollButton`). The games and the music UI have little coupling to the bot core beyond command registration, so the file is hard to navigate, review, and test in isolation.

**Hypothesis / root cause:** organic accretion — every new game/feature was appended to the single bot module instead of getting its own file.

**Proposed fix / improvement:**
- [ ] Create `bmo/pi/bots/social/` subpackage; move the bot core to `social/bot.py`.
- [ ] Extract each mini-game into `bmo/pi/bots/social/games/{trivia,wyr,rps,blackjack,hangman,wordle,connect4,poll}.py`, registered via a small `games/__init__.py` loader the bot calls at startup.
- [ ] Extract the music UI/queue into `social/music_ui.py`.
- [ ] Keep `bots/discord_social_bot.py` as a thin shim importing `social.bot` so the systemd `python -m bots.discord_social_bot` entry point and `bmo-social-bot.service` stay unchanged.

**Blocked by:** none (mechanical refactor; gated by existing bot tests + CI).

**Related files:** `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/bots/social_bot_utils.py`, `bmo/pi/kiosk/bmo-social-bot.service`, `bmo/pi/tests/test_dm_bot_control.py`

---

### [2026-06-23] Rename `bmo/pi/kiosk/` to `bmo/pi/systemd/` — the dir holds ALL units, not just the kiosk

- **Category:** debt, docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (systemd unit-location sweep)

**Description:**
`bmo/pi/kiosk/` is the single source of truth for **every** systemd unit in the project — 10 `.service` files + 2 `.timer` files (`bmo.service`, `bmo-fan.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`, `bmo-backup.service`/`.timer`, `bmo-voice-canary.service`/`.timer`, `bmo-ide.service`, plus `bmo-kiosk.service`) — yet only `bmo-kiosk.service` is actually kiosk-related. The directory name undersells its role and is misleading: a contributor looking for the main `bmo.service` definition would not think to open `kiosk/`. It also holds `install-kiosk.sh` and `logrotate.d-bmo-bots.example`, which are likewise not kiosk-specific.

**Hypothesis / root cause:** the dir started life holding only the kiosk unit, then became the consolidation point for all units (per the 2026-06-22 single-source consolidation) without a rename.

**Proposed fix / improvement:**
- [ ] `git mv bmo/pi/kiosk bmo/pi/systemd` (or `bmo/pi/units`).
- [ ] Update the ~9 references: `bmo/setup-bmo.sh` (~lines 221-227 unit-copy loop), `bmo/docs/SYSTEMD.md` (rows + lines 72/106/112/235), `bmo/docs/ARCHITECTURE.md` (~173), `bmo/docs/TROUBLESHOOTING.md` (~217), `bmo/README.md` tree.
- [ ] Keep `install-kiosk.sh` name (it does install the kiosk) but note in `SYSTEMD.md` that units now live under `systemd/`.

**Blocked by:** none. Low blast radius — all references are greppable string paths, no Python imports involved.

**Related files:** `bmo/pi/kiosk/` (whole dir), `bmo/setup-bmo.sh`, `bmo/docs/SYSTEMD.md`, `bmo/docs/ARCHITECTURE.md`, `bmo/docs/TROUBLESHOOTING.md`, `bmo/README.md`

**Related entries:** see the `bots/`-not-`discord/` design-gotcha in `bmo/docs/DESIGN-CONSTRAINTS.md` — same "name no longer matches contents" smell, opposite conclusion (kiosk SHOULD rename; bots/ must NOT because it shadows `discord.py`).

---

### [2026-06-23] `bmo/docs/ARCHITECTURE.md` (~line 173) wrongly says systemd units live in `ide_app/`

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (doc-vs-tree cross-check)

**Description:**
The Deployment section states: "Systemd unit definitions live in `bmo/pi/kiosk/` and `bmo/pi/ide_app/`." This is inaccurate — there are **zero** unit files under `bmo/pi/ide_app/`; all 10 services + 2 timers (including `bmo-ide.service`) live in `bmo/pi/kiosk/`. `bmo/docs/DESIGN-CONSTRAINTS.md` even correctly notes that the `ide_app` `bmo-ide.service` unit file lives in `kiosk/`. The stale clause would send a contributor to the wrong directory looking for the experimental IDE unit.

**Hypothesis / root cause:** doc drift — `ide_app/` may once have carried its own unit before the 2026-06-22 unit consolidation into `kiosk/`.

**Proposed fix / improvement:**
- [ ] Edit line ~173 to read "Systemd unit definitions live in `bmo/pi/kiosk/`." (drop the `ide_app/` clause). If renaming per the kiosk-to-systemd suggestion above, update to `bmo/pi/systemd/` in the same edit.

**Related files:** `bmo/docs/ARCHITECTURE.md` (~173), `bmo/pi/kiosk/`, `bmo/pi/ide_app/`

---

### [2026-06-23] `bmo/docs/AGENTS.md` opening line ("5 specialized AI agents") contradicts the "28 registered" line below it

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (doc accuracy sweep)

**Description:**
The first body line of `bmo/docs/AGENTS.md` reads "5 specialized AI agents, each owning one capability." The very next paragraph says "The registered/routable count is 28." The repo has ~40 modules in `bmo/pi/agents/`. The "5" is a stale headline from an earlier era of the agent system and now directly contradicts the rest of its own document.

**Hypothesis / root cause:** the headline number was never updated as agents were added (5 to 28 routable).

**Proposed fix / improvement:**
- [ ] Change the opening line to match: e.g. "A set of specialized AI agents (28 routable), each owning one capability." Or drop the count from the headline and let the per-section counts ("Core infrastructure (12)", etc.) be authoritative.
- [ ] While there, sanity-check the section counts against the actual `create_*_agent()` calls in `agent.py` + `agents/_registry.py`.

**Related files:** `bmo/docs/AGENTS.md`, `bmo/pi/agent.py`, `bmo/pi/agents/_registry.py`

---

### [2026-06-23] Group the 9 voice/audio service modules into a `services/voice/` subpackage

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (services/ cohesion review)

**Description:**
`bmo/pi/services/` is a flat directory of ~47 modules. Nine of them form a clear voice/audio cluster — `audio_output_service.py`, `bmo_say.py`, `discord_tts.py`, `system_audio.py`, `voice_canary.py`, `voice_casting.py`, `voice_metrics.py`, `voice_personality.py`, `voice_pipeline.py` (the last is the 2,232-line core). They are scattered alphabetically among calendar/music/game/list services, so the audio stack is hard to see as a unit. A `services/voice/` (or `services/audio/`) subpackage would make the boundary explicit and shrink the top-level listing.

**Hypothesis / root cause:** flat `services/` namespace never sub-grouped as the module count grew.

**Proposed fix / improvement:**
- [ ] Create `bmo/pi/services/voice/` and `git mv` the nine modules in, with a re-exporting `voice/__init__.py`.
- [ ] Update importers (`from services.voice_pipeline import ...` to `from services.voice import ...`), gated by CI/pytest.
- [ ] **Keep the existing module file names** per the "Service module names" rule in `bmo/docs/DESIGN-CONSTRAINTS.md` (avoid stdlib-shadowing renames during the move).

**Blocked by:** broader-than-trivial import churn — larger than the other items here; defer unless touching this area anyway.

**Related files:** `bmo/pi/services/voice_pipeline.py`, `bmo/pi/services/bmo_say.py`, `bmo/pi/services/discord_tts.py`, `bmo/pi/services/audio_output_service.py`, `bmo/pi/services/system_audio.py`, `bmo/pi/services/voice_canary.py`, `bmo/pi/services/voice_casting.py`, `bmo/pi/services/voice_metrics.py`, `bmo/pi/services/voice_personality.py`

**Related entries:** "Service module names" design-gotcha in `bmo/docs/DESIGN-CONSTRAINTS.md` (the stdlib-collision caveat applies to any renames done during the move).

---

### [2026-06-23] Add a `bmo/docs/README.md` index for the 9 docs in `bmo/docs/`

- **Category:** docs, future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (docs/ navigability review)

**Description:**
`bmo/docs/` holds 9 reference docs (`AGENTS.md`, `ARCHITECTURE.md`, `CLOUDFLARE_TUNNEL_SETUP.md`, `DEPLOY.md`, `DESIGN-CONSTRAINTS.md`, `NETWORK_ACCESS.md`, `SERVICES.md`, `SYSTEMD.md`, `TROUBLESHOOTING.md`) but no index/landing page. A new contributor has to open files blind to learn which covers what. A one-screen `README.md` with a one-line description + link per doc (and a pointer to the repo-root `docs/` logs) would make the set discoverable.

**Hypothesis / root cause:** docs accreted individually; no index was ever added.

**Proposed fix / improvement:**
- [ ] Add `bmo/docs/README.md` listing each doc with a one-line purpose and a link, plus a short "start here" pointer (ARCHITECTURE to SERVICES to SYSTEMD to TROUBLESHOOTING).
- [ ] Link to it from `bmo/README.md`.

**Related files:** `bmo/docs/` (all), `bmo/README.md`
### [2026-06-23] Export health + voice metrics in Prometheus format with a lightweight historical store

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (observability surface)

**Description:**
Observability today is point-in-time + push-only: `services/voice_metrics.py` keeps a bounded in-memory ring (200 samples/stage) exposed as a JSON snapshot at `GET /api/metrics/voice`, and `services/monitoring.py` evaluates health every 60s and pushes Discord/SocketIO/OLED alerts. There is no `/metrics` Prometheus endpoint and no time-series persistence, so trends (CPU-temp creep, voice p95 latency drift across a week, under-voltage frequency, fallback-to-Ollama rate) are invisible — every restart resets the rings and only the current moment is queryable.

**Proposed fix / improvement:**
- [ ] Add a `prometheus_client`-format `/metrics` endpoint (or hand-rolled text exposition) surfacing the existing voice-stage aggregates, monitoring service up/down gauges, Pi stats (temp/CPU/RAM/disk), and counters for LLM fallback / STT-TTS fallback.
- [ ] Pair with a tiny on-Pi scraper+store (VictoriaMetrics single-binary or Prometheus in the existing docker-compose, modest retention) and a couple of Grafana panels, or a static history file the Web UI charts.
- [ ] Keep recording cheap and non-raising (same discipline as `voice_metrics.record_stage`).

**Blocked by:** none. Mind the Pi's disk budget (baseline ~83% used) — pick a low-retention store.

**Related files:** `bmo/pi/services/voice_metrics.py`, `bmo/pi/routes/system_api.py` (`/api/metrics/voice`), `bmo/pi/services/monitoring.py`, `bmo/pi/docker-compose.yml`

---

### [2026-06-23] Add `.env.example` + fail-fast startup config preflight (degraded-mode banner)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (setup/reliability)

**Description:**
There is no `.env.example` (nor any `*.example`) in `bmo/pi/`, and `app.py` has no required-env/config preflight — the only "preflight" match in `app.py` is the CORS OPTIONS handler. The set of required secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`, `FISH_AUDIO_API_KEY`, `ANTHROPIC_API_KEY`, `OPENWEATHER_API_KEY`, `DISCORD_WEBHOOK_URL`, the Calendar OAuth token, etc.) is only discoverable by reading code, and a missing/typo'd key surfaces lazily at first use (a failed voice turn or a 500) rather than at boot. Two pain points: (1) standing up a fresh Pi is trial-and-error; (2) a degraded deploy is hard to diagnose because nothing reports "running without TTS — FISH_AUDIO_API_KEY unset, will use Piper".

**Proposed fix / improvement:**
- [ ] Commit a `.env.example` enumerating every consumed env var with a one-line comment and a placeholder value (no real secrets).
- [ ] Add a startup preflight that classifies each key as required/optional, logs a single concise summary at boot ("✅ 6/7 providers configured; ⚠️ degraded: TTS→local Piper"), and either hard-fails on a truly required-missing key or surfaces the degraded set on `/api/health/full`.
- [ ] Optionally generate the `.env.example` from the preflight's key registry so the two never drift.

**Blocked by:** none.

**Related files:** `bmo/pi/app.py`, `bmo/pi/services/cloud_providers.py`, `bmo/pi/services/voice_pipeline.py`, `bmo/pi/routes/system_api.py` (`/api/health/full`), `bmo/docs/ARCHITECTURE.md` (Cloud APIs table)

---

### [2026-06-23] Split monolithic `discord_social_bot.py` into discord.py cogs and add direct test coverage

- **Category:** future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (DX / maintainability)

**Description:**
`bmo/pi/bots/discord_social_bot.py` is the single largest source file in the tree at ~6,823 lines with ~264 top-level `class`/`def`/`async def` definitions, and it has no direct unit test (no test module imports `discord_social_bot`; the sibling DM bot at least has `tests/test_dm_bot_control.py`). A 6.8k-line god-module is hard to navigate, slow to load mentally, and risky to change — and being untested means regressions in music/games/trivia features ship silently. discord.py's Cog system exists precisely for this.

**Proposed fix / improvement:**
- [ ] Carve the bot into Cogs by feature area (music, trivia/games, moderation/util, TTS) under `bmo/pi/bots/social/cogs/`, leaving a thin loader.
- [ ] Add unit tests around the pure-logic pieces (command parsing, trivia scoring, queue management) with the discord client mocked, mirroring `test_dm_bot_control.py`.
- [ ] Do it incrementally (one cog per PR) so each step stays green under the existing CI gate.

**Blocked by:** none. Watch the package-naming gotcha in `DESIGN-CONSTRAINTS.md` (keep `bots/`; never create a `discord/` package that shadows `discord.py`).

**Related files:** `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py`

---

### [2026-06-23] Rotate the cron health-check log (`logs/health.log`) — app logs rotate, this one does not

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (reliability / disk hygiene)

**Description:**
Application logging already rotates (`services/bmo_logging.py` uses `RotatingFileHandler`, 10 MB × 5). But the separate cron health check appends to `logs/health.log` via shell redirection (`*/5 * * * * .../scripts/health-check.sh >> .../logs/health.log 2>&1`, per `ARCHITECTURE.md`) with no `logrotate.d` entry for bmo and no rotation in the script itself. Every 5 minutes, forever, append-only — unbounded growth on a Pi whose baseline disk usage is already ~83%. Low probability of acute harm, but it is exactly the kind of slow leak that eventually trips the "Disk full" troubleshooting path.

**Proposed fix / improvement:**
- [ ] Add an `/etc/logrotate.d/bmo` entry (or have `setup-bmo.sh` install one) covering `logs/health.log` with weekly rotation + a small `rotate N` + `compress`.
- [ ] Alternatively have `health-check.sh` self-truncate/rotate, or pipe through `logger` to journald (which is already size-managed).

**Blocked by:** none.

**Related files:** `bmo/pi/scripts/health-check.sh`, `bmo/pi/services/bmo_logging.py`, `bmo/setup-bmo.sh`, `bmo/docs/ARCHITECTURE.md` (Scheduled Tasks / cron)

---

### [2026-06-23] Document + periodically verify a full bare-metal disaster-recovery restore

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (portability / DR)

**Description:**
The backup story is one-directional and unverified end-to-end. `backup.sh` pushes `data/` + `config/` + `requirements.txt` to Google Drive nightly, and `setup-bmo.sh` rebuilds system deps/systemd/docker — but there is no single tested "stand BMO up on a fresh Pi from a cold backup" runbook, and no automated check that the gdrive backup is actually restorable. The only restore-named test, `tests/test_music_restore.py`, covers an in-app music-state feature, not the gdrive backup. So the recovery path (fresh Pi → run setup → `rclone sync` data/config back → re-auth calendar) is documented in fragments across `ARCHITECTURE.md`/`DEPLOY.md` and has, as far as the tree shows, never been exercised. A silently-corrupt or partial backup would only be discovered during a real outage.

**Proposed fix / improvement:**
- [ ] Write one consolidated DR runbook: fresh-Pi → `setup-bmo.sh` → restore data/config → calendar re-auth → health-check pass, with expected outputs.
- [ ] Add a lightweight monthly backup-integrity job: pull the latest gdrive backup into a temp dir, assert key files exist + parse (e.g. `alarms.json`, `recent_chat.json`, `config/token.json` shape) and a manifest checksum matches, alert via the existing Discord webhook on mismatch.
- [ ] Optionally snapshot the installed dep set so a restore reproduces a known-good environment, not just `requirements.txt`.

**Blocked by:** none.

**Related files:** `bmo/pi/backup.sh`, `bmo/setup-bmo.sh`, `bmo/docs/ARCHITECTURE.md` (Backup Strategy), `bmo/docs/DEPLOY.md`


---

---

---

---

---

---

---

---

---

---

---

</details>

---

### [2026-06-22] Voice pipeline starts degraded every boot — Silero VAD disabled (no `torchaudio`) and openwakeword default models missing → energy-only VAD + energy+STT wake fallback

- **Category:** config, bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` boot journal + voice_pipeline.py read + venv/pip + `arecord -l`)

**Description:**
On the live Pi, the voice pipeline logs two ERROR-level failures at every boot and runs in a degraded mode:
1. `[vad] Silero VAD not available, using energy-only` → `_load_silero_vad` (voice_pipeline.py ~240) does `import torchaudio` ("required by silero"), but **`torchaudio` is not installed** (`pip show torchaudio` → not found; `torch==2.12.0+cpu` IS installed; `torchaudio` is not in `requirements.txt`/`requirements.in`). So Silero VAD can never load and the pipeline permanently falls back to energy-only VAD (worse speech/no-speech discrimination).
2. `[wake] openwakeword not available, using energy+STT fallback...` → `_load_wake_model` (voice_pipeline.py ~211-215) raises `RuntimeError("no wake word ONNX model files found ...")`. `openwakeword==0.6.0` and `onnxruntime==1.26.0` ARE installed, but the **default ONNX model weight files were never downloaded** (`_get_wake_model_paths()` returns empty), so wake-word detection falls back to the cruder energy+STT path.

Net: both core voice-front-end models are unavailable; the assistant runs on the weaker energy-based fallbacks and prints ERROR tracebacks each boot.

**Caveat (honest):** this Pi currently has **no capture device** (`arecord -l` lists zero CAPTURE hardware), so wake/VAD are paused anyway right now — the impact is **latent**. But these are real packaging/setup gaps that (a) spam ERROR tracebacks every boot and (b) will silently leave voice degraded the moment a mic is attached. The "no audio input device" pause is a separate, already-known quiet-degrade path (commit f87518cc); the model/dep gaps here are distinct.

**Expected behavior:** with the documented deps + models installed, Silero VAD and openwakeword should load; if a model/dep is genuinely optional, the absence should log once at INFO (not an ERROR traceback every boot).

**Hypothesis / root cause:** the 2026-04-23 CPU-only-torch venv rebuild (see resolved log) installed `torch` but never added `torchaudio`; and `setup-bmo.sh` / `install-venv.sh` do not run `openwakeword`'s model download step (e.g. `python -c "import openwakeword.utils; openwakeword.utils.download_models()"`), so the `.onnx` weights are absent.

**Proposed fix / improvement:**
- [ ] Add `torchaudio` (CPU build, matching `torch` 2.12 / the pinned index) to `requirements.in` + recompile, OR make `_load_silero_vad` degrade at INFO without a traceback if Silero is intentionally optional.
- [ ] Add an openwakeword model-download step to `setup-bmo.sh` / `scripts/install-venv.sh` (or ship a bundled custom model) so `_get_wake_model_paths()` resolves.
- [ ] Demote the per-boot wake/VAD-unavailable ERRORs to a single INFO when running headless / mic-absent.

**Related files:** `bmo/pi/services/voice_pipeline.py` (`_load_silero_vad` ~234, `_load_wake_model` ~210, `_get_wake_model_paths`), `bmo/pi/requirements.in` / `requirements.txt`, `bmo/setup-bmo.sh`, `bmo/pi/scripts/install-venv.sh`

**Related entries:** resolved 2026-04-23 "CPU-only torch venv rebuild"; wake-word quiet-degrade commit f87518cc

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Declared+installed the missing STT engine faster-whisper, installed torchaudio (CPU) for Silero VAD, and downloaded the openwakeword default models on the live venv; added faster-whisper to requirements.in and torchaudio to the CPU torch install step; demoted the per-boot Silero/wake-unavailable ERROR tracebacks to a single INFO. Voice front-end deps now satisfied (a mic is still required for live use) (branch `auto/bmo-resolver`).
- **Addendum 2026-06-23 (bmo-resolver):** persisted the openwakeword default-model download into `scripts/install-venv.sh` (best-effort, guarded) so future venv rebuilds fetch the wake models — not just the one-off live download.

### [2026-06-22] Pi thermal throttling — CPU hit 84°C, soft-temp limit + frequency capping occurred this boot despite `bmo-fan` active (`get_throttled=0xe0000`)

- **Category:** performance, config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal + `vcgencmd measure_temp` / `get_throttled`)

**Description:**
The health monitor fired repeated CRITICALs this boot: `pi_cpu_temp: 🌡️ CPU temperature critical: 84.2°C` and `pi_power: 🌡️ Soft temperature limit active NOW (flags: 0xe0008)` (multiple cycles ~18:51–18:54). `vcgencmd get_throttled` reads **`0xe0000`** = bits 17/18/19 set → "arm frequency capping has occurred", "throttling has occurred", "soft temperature limit has occurred" (no under-voltage bits, no currently-active bits). Current temp at scan ≈ 74–75°C with `bmo-fan.service` **active** — so the fan runs but cooling is insufficient under load and the SoC has been thermally throttling. Throttling directly slows the CPU-bound voice/STT pipeline and sustained 80°C+ shortens hardware life.

**Reproduction:**
1. `vcgencmd get_throttled` → `0xe0000` (throttle/soft-limit/freq-cap occurred since boot).
2. `journalctl -u bmo.service -b | grep -i "temperature critical"` → CPU peaked 84.2°C.

**Expected behavior:** under normal load the Pi should stay below the soft-temp limit (no throttle/freq-cap bits) with the fan running.

**Hypothesis / root cause:** cooling headroom is marginal — fan curve too conservative, fan/heatsink undersized for the enclosed touchscreen build, or a CPU-heavy workload (faster-whisper "small" int8 STT, onnxruntime) spiking temps. Needs a hardware/fan-curve look, not a code fix per se.

**Proposed fix / improvement:**
- [ ] Review `bmo-fan` control curve (`bmo/pi/hardware/fan_control.py`) — raise duty / lower the on-threshold so it ramps before 80°C.
- [ ] Check enclosure airflow / heatsink contact.
- [ ] Consider throttling background CPU work when `pi_cpu_temp` is in the critical band.

**Related files:** `bmo/pi/hardware/fan_control.py`, `bmo/pi/services/monitoring.py` (`_check_*` thermal/power checks), `bmo/pi/kiosk/bmo-fan.service`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Shipped the code-addressable mitigation — fan curve ramps earlier/harder (full duty by 75C vs 80C + more mid-band duty) for thermal headroom; the physical airflow/heatsink-contact check the entry flags is hardware, not code (branch `auto/bmo-resolver`).

### [2026-06-22] `agent.py` mixes the core LLM-routing brain with D&D-specific helpers — extract the D&D helpers

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/agent.py` is the second-largest source file in the repo (~2,167 lines / 99 KB) and its module docstring scopes it to "Cloud API AI with local Ollama fallback" — i.e. model selection plus `llm_chat` / `llm_chat_stream` routing and RAG. Interleaved among those, however, it also carries a cluster of D&D-domain helpers that have nothing to do with LLM routing: `_summarize_character`, `_load_character_file`, `_discover_maps`, `_parse_cr`, `_build_dm_data_context`, `_calculate_encounter_difficulty`, and `_load_monster_stat_block` (lines ~562-818). Those belong with the existing D&D logic in `services/dnd_engine.py` / `agents/dnd_dm.py`, not in the generic agent brain. Extracting them would shrink the core file, sharpen its single responsibility (LLM routing + RAG), and put the encounter/monster/character math next to the rest of the D&D engine. Working code — reorg only, defer until someone is already in this area.

**Proposed fix / improvement:**
- [ ] Move the D&D helper functions out of `agent.py` into `services/dnd_engine.py` (or a new `services/dnd_dm_data.py`); update imports in `agent.py` and any callers.
- [ ] Leave LLM routing / RAG (`llm_chat*`, `_select_model`, `get_resolved_model`, `rag_search`, `BmoAgent`) in `agent.py`.

**Related files:** `bmo/pi/agent.py`, `bmo/pi/services/dnd_engine.py`, `bmo/pi/agents/dnd_dm.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Extracted the 7 D&D helpers + DND_DATA_DIR to services/dnd_dm_data.py; agent.py re-exports them and shrinks ~250 lines (branch `auto/bmo-resolver`).

### [2026-06-22] Single-user owner identity (Gavin) is hardcoded across the tree — lift into config for portability/forkability

- **Category:** portability, future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** Automated improvement-suggestion scan of the bmo/ tree.

**Description:**
The owner's identity is baked into source in **~51 places**. The social bot's personality prompt hardcodes created by Gavin, who is your best friend and creator (`bots/discord_social_bot.py`), the default speaker is `gavin` in multiple spots (`agents/settings.py` `default_name`, `cli.py`, `routes/realtime_ws.py`, `routes/chat_api.py`, `dev/bmo_ui_lab_server.py`), agent tool docs use `{name: Gavin}` as the canonical example (`agent.py`, `app.py`), and the one-shot enrollment script is literally named `wake/enroll_gavin.py` (whose docstring also still references the now-obsolete `voice_profiles.pkl` — persistence moved to `voice_profiles.json`). None of this is a bug for the current single-user deployment, but it means the project can't be cleanly shared/forked or run for a second household without a find-and-replace through prompts and code. A small `owner`/`identity` config block (name, relationship descriptor, default speaker) read at startup would centralize it.

**Proposed fix / improvement:**
- [ ] Introduce an `owner`/`identity` config (name + relationship + default speaker) sourced from settings/env, with Gavin as the default value so behavior is unchanged.
- [ ] Replace the hardcoded literals in the personality prompt, settings defaults, agent tool examples, and route fallbacks with that config.
- [ ] Rename `enroll_gavin.py` → `enroll_voice.py` (accept a `--name`), and fix its docstring to say `voice_profiles.json`.

**Related files:** `pi/bots/discord_social_bot.py`, `pi/agents/settings.py`, `pi/cli.py`, `pi/routes/realtime_ws.py`, `pi/routes/chat_api.py`, `pi/wake/enroll_gavin.py`, `pi/agent.py`, `pi/app.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added services/identity.py (Gavin defaults, env-overridable); wired social-bot prompt + settings default; renamed enroll_gavin.py -> enroll_voice.py with --name + .json docstring fix (branch `auto/bmo-resolver`).

### [2026-06-22] Expose BMO's own subsystems (timers, calendar, smart-home, lists, music) as MCP servers, not just the D&D data server

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** Automated improvement-suggestion scan of the bmo/ tree.

**Description:**
`pi/mcp_servers/` currently exposes exactly one server — `dnd_data_server.py` (5e references + RAG over stdio JSON-RPC) — and it is cleanly built with env-var-configurable data roots. BMO has a rich set of first-party capabilities behind in-process Python services (`timer_service`, `calendar_service`, `smart_home`, `list_service`, `music_service`, `weather_service`, `location_service`). Today those are reachable only through BMO's own agents/HTTP routes. Wrapping a few of them as MCP servers (the same stdio pattern the D&D server already establishes) would let *other* MCP clients — Claude Desktop, Claude Code, other agents on the LAN — drive BMO's timers/calendar/home directly, and would give BMO's own orchestrator a uniform tool interface to its subsystems instead of bespoke per-service wiring. It also makes each capability independently testable and reusable outside the Flask process.

**Proposed fix / improvement:**
- [ ] Pick 1-2 high-value, low-risk subsystems first (e.g. timers + lists) and wrap their service functions as MCP tools following `dnd_data_server.py`'s structure.
- [ ] Register them in `mcp_servers/mcp_settings.json`; document auth/trust expectations (the README already flags that file as a code-execution surface).
- [ ] Keep write-capable tools (smart-home control, calendar create) behind explicit opt-in so a remote MCP client can't actuate the house by default.

**Related files:** `pi/mcp_servers/dnd_data_server.py`, `pi/mcp_servers/mcp_settings.json`, `pi/services/timer_service.py`, `pi/services/list_service.py`, `pi/services/smart_home.py`, `pi/services/calendar_service.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added mcp_servers/bmo_lists_server.py (file-backed lists as MCP tools, write tools gated); registered in mcp_settings.json. Timers left out (in-process state) (branch `auto/bmo-resolver`).

### [2026-06-22] Mock-hardware "simulator" run mode for off-Pi development

- **Category:** portability
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of init_services() + hardware/ adapters

**Description:**
Off-Pi, `init_services()` wraps each hardware service (LED, OLED, camera, mic/voice) in try/except and simply SKIPs it on `ImportError`; CANARY mode is import-only. A contributor on a laptop can boot Flask but cannot exercise the LED ring, OLED face, camera, or the wake -> STT -> TTS flow at all — those subsystems are absent, not simulated. There is no functional-stub layer (virtual LED/OLED state surfaced to the web UI, file/synthetic mic input, canned camera frames) to develop or UX-test the full experience off-device.

**Proposed fix / improvement:**
- [ ] Add a `BMO_SIMULATE=1` mode providing stub hardware adapters that implement the same interfaces with fake-but-observable behavior (LED/OLED state pushed to the existing web UI; mic fed from a wav file or injected text; camera returns a static/sample frame).
- [ ] Document it in `DEPLOY.md` / `bmo/pi/README.md` so off-Pi end-to-end UX testing is a first-class path.

**Related files:** `app.py` (`init_services`), `hardware/led_controller.py`, `hardware/oled_face.py`, `hardware/camera_service.py`, `services/voice_pipeline.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added hardware/sim_hardware.py stubs + BMO_SIMULATE=1 wiring in init_services for LED/OLED/camera; documented in README (branch `auto/bmo-resolver`).

### [2026-06-22] Periodic synthetic voice-path canary wired into monitoring + Discord alerts

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of dev/ benchmarks + monitoring

**Description:**
`dev/benchmark_full.py` / `benchmark_audio.py` / `benchmark_llm.py` already exercise the STT -> LLM -> TTS path, but they are manual one-off dev tools. `services/monitoring.py` and the cron health check only probe liveness/HTTP status, not the real end-to-end voice path. A regression that leaves `/health` green but breaks actual STT/TTS quality or latency (model swap, cloud API change, mic config drift) goes unnoticed until a human talks to BMO. Recorded wake clips already exist under `wake/clips` (`record_wake_clips.py`).

**Proposed fix / improvement:**
- [ ] Wrap a lightweight synthetic run (feed a known clip -> assert transcript approximately matches + TTS produced + stage latency under budget), building on `benchmark_full.py` rather than duplicating it.
- [ ] Run it on a slow cadence (cron / systemd timer) and feed pass/fail + latency into `monitoring.py` so the existing Discord alert path fires on regression.

**Related files:** `dev/benchmark_full.py`, `services/monitoring.py`, `services/voice_pipeline.py`, `wake/clips`, `health_check.sh`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added services/voice_canary.py + monitoring._check_voice_canary + bmo-voice-canary.timer; surfaced a real gap (faster_whisper missing) (branch `auto/bmo-resolver`).

### [2026-06-22] Adopt `bmo_logging` everywhere — retire stray `print()` and silent `except: pass`

- **Category:** future-idea, debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** Automated improvement-suggestion scan of the bmo/ tree.

**Description:**
`services/bmo_logging.py` is a well-built structured-logging shim (env-controlled level via `BMO_LOG_LEVEL`, optional rotating file handler, optional JSON output for Loki/Vector, a CWE-117 log-injection sanitizer, and `log.exception` for tracebacks) — but it is only referenced by **32 of 193** Python files under `pi/`. Meanwhile the production tree (excluding `cli/`, `dev/`, `scripts/`) still contains **~347 `print()` calls** and **~169 `except ...: pass` blocks that swallow the exception with no log line at all**. The prints bypass level control, journald severity, and the JSON/file sinks, so they are invisible to `journalctl -u bmo -p err` and to any future log shipping. The silent excepts hide real failures in exactly the long-running, gevent-driven paths (voice pipeline, bots, services) where a swallowed error manifests as BMO mysteriously doing nothing — the hardest class of bug to diagnose on a headless Pi. This is the observability counterpart to the already-logged bots swallow startup crashes issue, but as a codebase-wide hygiene effort rather than a single bug.

**Proposed fix / improvement:**
- [ ] Add a lint/CI check (ruff already runs — e.g. `flake8-print`/`T20`, or a forbidden-pattern grep like the dnd-app gate) that flags new `print()` in production modules under `pi/` outside `cli/`, `dev/`, `scripts/`.
- [ ] Sweep existing `print()` calls to `get_logger(<subsystem>)` at the right level; keep `print` only in CLI/dev/diagnostic tools where stdout IS the interface.
- [ ] Triage the ~169 `except: pass` sites: convert expected and ignorable ones to `log.debug(...)` and genuine error paths to `log.exception(...)`, so failures leave a breadcrumb instead of vanishing.

**Related files:** `pi/services/bmo_logging.py`, `pi/services/voice_pipeline.py`, `pi/bots/discord_social_bot.py`, `pi/bots/discord_dm_bot.py`, `pi/app.py`, `pi/agent.py`

**Related entries:** [2026-06-22] Aggregate voice-pipeline stage latency into an exported metrics endpoint; [2026-06-22] Periodic synthetic voice-path canary

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added a print() ratchet (scripts/check-no-new-prints.sh + CI + .print-baseline=163) so production prints can't grow; existing convert opportunistically (branch `auto/bmo-resolver`).

### [2026-06-22] `discord_social_bot.py` is a 7k-line monolith — split into a package

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/bots/discord_social_bot.py` is 277 KB / ~6,996 lines in a single file — by far the largest source file in the repo (the next bot, `discord_dm_bot.py`, is ~2,082 lines; most service modules are under 1k). A file this size is hard to navigate, review, and test, and it makes the coverage note in `.coveragerc` ("gevent-spawned branches look uncovered") harder to reason about. It almost certainly bundles several independent concerns (music, games, casual chat, command handlers, event listeners) that could each move into a `bots/social/` subpackage. Working code — reorg only, defer until someone is touching this area.

**Proposed fix / improvement:**
- [ ] Identify the cohesive feature clusters (music / games / chat / command + event registration) inside the file.
- [ ] Extract them into a `bots/social/` package (or sibling modules) with the bot entrypoint wiring them together; keep behavior identical.

**Related files:** `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/bots/discord_dm_bot.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** First decomposition: extracted stateless helpers to bots/social_bot_utils.py (seam for further music/cog extraction) (branch `auto/bmo-resolver`).
- **Addendum 2026-06-23 (bmo-resolver):** extracted the next sibling module `bots/social_youtube.py` (the 5 yt-dlp search/extract helpers, re-exported); `discord_social_bot.py` 6,967 to 6,823 lines, behaviour identical. Verified by py_compile + import smoke.

### [2026-06-22] No off-tree backup/snapshot of BMO's gitignored runtime state

- **Category:** future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of persistence paths (settings_store / campaign_memory / list_service / chat_history) vs `.gitignore` and `scripts/deploy.sh`

**Description:**
All of BMO's accumulated, mutable state lives untracked-and-gitignored inside the working tree under `bmo/pi/data/` and is the only copy anywhere: `campaign_memory.db` (SQLite — D&D NPC/campaign memory), `dnd_sessions/` (session logs), plus a pile of JSON state — `lists.json`, `notes.json`, `alarms.json`, `play_counts.json`, `music_history.json`, `recent_chat.json`, `settings.json`, `alert_history.json`, etc. (see `.gitignore` lines ~92–119). `deploy.sh` is correctly careful (it refuses a dirty tree and never `git clean`s, so deploys do not clobber this state), but that is the *only* thing protecting it. There is no periodic backup/snapshot: an SSD/SD failure, a stray manual `git clean -fdx`, or a bad block on the single Pi disk silently destroys every D&D campaign's memory, all alarms, lists, notes, and play history with no recovery path. No `backup`/`restore`/`rsync`/`tar` of `data/` exists anywhere in `scripts/`.

**Hypothesis / root cause:** State accreted file-by-file as features shipped; each module just picks its own path under `data/`. Because it is gitignored it is invisible to the git-based deploy safety net, so no one added an out-of-band copy.

**Proposed fix / improvement:**
- [ ] Add a small `scripts/backup-state.sh` that tars/rsyncs the gitignored runtime set (`campaign_memory.db`, `dnd_sessions/`, and the `data/*.json` state files) to a second location — another disk, a NAS/`rclone` remote, or at minimum a timestamped copy outside the repo tree.
- [ ] Run it on a `systemd` timer (daily) and surface last-success age in `/api/health/full` so a stale/failed backup is visible.
- [ ] Document restore in `DEPLOY.md` / `TROUBLESHOOTING.md`. (`rclone` is already a dependency — `routes/rclone_api.py` exists — so an off-device target is low-effort.)

**Related files:** `bmo/pi/services/settings_store.py`, `bmo/pi/services/campaign_memory.py`, `bmo/pi/services/chat_history.py`, `bmo/pi/services/list_service.py`, `bmo/.gitignore`, `bmo/pi/scripts/deploy.sh`, `bmo/pi/routes/rclone_api.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added backup-state.sh + bmo-backup.service/.timer (daily 03:00, keep 14); enabled live and took a first backup (branch `auto/bmo-resolver`).

### [2026-06-22] No cross-provider LLM failover in `cloud_chat` (+ inconsistent transient-retry across providers)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `services/cloud_providers.py` LLM routing/reliability

**Description:**
`cloud_chat()` dispatches a request to exactly one provider based on the model-name prefix (`gemini*` -> Gemini, `claude*` -> Claude, `llama/mixtral/groq-*` -> Groq) with no fallback. If the chosen provider is down or rate-limited, the call raises and the caller (voice pipeline, agents) gets nothing — for the always-on voice path that means BMO goes silent on a single-vendor outage, even though three other working LLM backends are configured. Compounding it, transient-error handling is inconsistent: `gemini_chat()` retries up to 3x on HTTP 5xx with linear backoff, but `claude_chat()` and `groq_llm_chat()` are single-shot (`post(...)` -> `raise_for_status()`), so a one-off 502/503 from Claude/Groq fails the whole turn where the same blip against Gemini would be absorbed. There is no shared retry/backoff helper and no notion of "primary down -> try secondary".

**Hypothesis / root cause:** Providers were added incrementally; the retry loop was bolted onto Gemini (the flaky-preview primary) only, and routing stayed a simple prefix switch rather than a resilience layer.

**Proposed fix / improvement:**
- [ ] Factor one transient-retry helper (5xx + timeout, bounded backoff) and apply it uniformly to all three chat providers.
- [ ] Add an opt-in failover ladder in `cloud_chat` (e.g. primary -> a configured fallback model on a *different* vendor) for non-streaming chat, gated by a setting so DM/Code-Agent determinism is not silently changed. Respect the gevent/`os.system` design constraint — keep failover at the Python routing layer, do not touch the curl paths.
- [ ] Optionally record which provider served each turn via the metrics idea already logged (2026-06-22 "Aggregate voice-pipeline stage latency...") so failover events are observable.

**Related files:** `bmo/pi/services/cloud_providers.py` (`cloud_chat`, `gemini_chat`, `claude_chat`, `groq_llm_chat`), `bmo/pi/services/voice_pipeline.py`, `bmo/docs/DESIGN-CONSTRAINTS.md` (gevent/`os.system` constraint)

**Related entries:** `BMO-SUGGESTIONS-LOG.md` [2026-06-22] Aggregate voice-pipeline stage latency into an exported metrics endpoint.

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added shared _post_with_retry (claude+groq now retry 5xx like gemini) and an opt-in cross-vendor failover ladder in cloud_chat gated by BMO_LLM_FAILOVER_MODEL (branch `auto/bmo-resolver`).

### [2026-06-22] Consolidate scattered systemd `.service` units into one location

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
Four tracked systemd unit files live in two different directories. Three sit together in `bmo/pi/kiosk/` (`bmo-kiosk.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`) alongside `install-kiosk.sh`, while a fourth — `bmo-ide.service` — sits off on its own in `bmo/pi/ide_app/`. There is no single place to look for "what units does this host run", and the kiosk installer can't pick up the IDE unit. Either co-locate all units (e.g. a `bmo/pi/kiosk/` or new `bmo/pi/systemd/` dir) or document why the IDE unit is intentionally separate.

**Proposed fix / improvement:**
- [ ] Pick a canonical home for unit files (likely `bmo/pi/kiosk/` since the installer is there, or a dedicated `systemd/` dir).
- [ ] Move `ide_app/bmo-ide.service` there (update any install script / docs that reference its path).

**Related files:** `bmo/pi/ide_app/bmo-ide.service`, `bmo/pi/kiosk/bmo-kiosk.service`, `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`, `bmo/pi/kiosk/install-kiosk.sh`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** kiosk/*.service is now the single source; setup-bmo.sh installs by copying those files instead of drifting heredocs; applied bot time-sync ordering live too (branch `auto/bmo-resolver`).
- **Addendum 2026-06-23 (bmo-resolver):** physically relocated the unit (`git mv ide_app/bmo-ide.service kiosk/bmo-ide.service`) and updated the README tree + `SYSTEMD.md` + `DESIGN-CONSTRAINTS.md` path refs; the unit ExecStart still targets `ide_app/`.

### [2026-06-22] Aggregate voice-pipeline stage latency into an exported metrics endpoint

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the voice pipeline + monitoring stack

**Description:**
`services/voice_pipeline.py` already takes ad-hoc per-stage timestamps (`_t_stt0`, `_t_chat0`, the `record` elapsed log) and `services/bmo_logging.py` can emit JSON, but STT/LLM/TTS stage durations and agent-routing time are only written as scattered log lines — never aggregated or exported. `services/monitoring.py` tracks a per-service health-check `response_time`, but that is liveness latency, not the user-perceived "wake -> spoken reply" budget. There is no `/api/metrics` (or Prometheus text) endpoint and no rolling p50/p95 for the voice path, so latency regressions are invisible until BMO subjectively "feels slow."

**Proposed fix / improvement:**
- [ ] Add a small in-process metrics collector (counters + histograms / ring buffer) fed by the existing `_t_*` timers, recording each stage duration and the chosen agent route.
- [ ] Expose it at `/api/metrics` (JSON, or Prometheus text for scraping) and optionally surface p50/p95 inside `/api/health/full`.

**Related files:** `services/voice_pipeline.py`, `services/monitoring.py`, `app.py`, `services/bmo_logging.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added services/voice_metrics.py + GET /api/metrics/voice (count/avg/p50/p95/max per stage), fed from existing [timing] points (branch `auto/bmo-resolver`).

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added .github/workflows/subprojects-ci.yml (npm ci + vitest + vite build for dungeon-scholar; npm ci + wrangler dry-run for oracle-worker) (branch `auto/bmo-resolver`).

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Removed the orphaned .githooks/ (husky is authoritative per CONTRIBUTING) and dropped the dead .githooks/** path filter from security-audit.yml (branch `auto/bmo-resolver`).
- **Addendum 2026-06-23 (bmo-resolver):** completed the remaining bullet — husky `pre-commit` now runs dungeon-scholar`s vitest when its files are staged (CI `subprojects-ci.yml` remains authoritative).

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (the app.py
> blueprint-refactor remainder, flask-talisman, the gevent ThreadPoolExecutor /
> requests-vs-httpx gotchas, and the venv/threading observations) became
> the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new BMO items below as they appear.

*(none active)*

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** AGENTS.md already canonical and referenced by the others; added scripts/check-agent-instructions.sh + CI drift guard (branch `auto/bmo-resolver`).

### [2026-06-22] Inconsistent script naming in `pi/scripts/` (kebab-case vs snake_case)

- **Category:** debt
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/scripts/` mixes two naming conventions. Most entries are kebab-case (`apply-access-config.sh`, `cloudflare-access-api.sh`, `deploy.sh`, `diagnose-cloudflare.sh`, `install-venv.sh`, `seed-5e-library.sh`, `setup-cloudflare-tunnel.sh`, `setup-tailscale.sh`, `sync-shared-5e-json.sh`, `check-complexity.py`), but three use snake_case: `e2e_test.sh`, `health_check.sh`, `win_proxy.py`. Standardizing on one convention (kebab-case is the clear majority) would make the directory tidier and easier to scan. CAVEAT: the three odd-ones-out are referenced elsewhere — `health_check.sh` appears in `bmo/README.md`, `docs/ARCHITECTURE.md` (including a cron example) and is wired into a real crontab; `win_proxy` symbols appear in `state.py` / `routes/ide.py`. Any rename must update all those references (and the live crontab / any systemd unit) in lock-step, so this is low-value churn — log it, fix opportunistically rather than as a standalone change.

**Proposed fix / improvement:**
- [ ] If standardizing, rename the three snake_case scripts to kebab-case and update every reference (README, ARCHITECTURE.md, cron, and any code that shells out to them) in the same change.

**Related files:** `bmo/pi/scripts/e2e_test.sh`, `bmo/pi/scripts/health_check.sh`, `bmo/pi/scripts/win_proxy.py`, `bmo/README.md`, `bmo/docs/ARCHITECTURE.md`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Renamed health_check.sh->health-check.sh and e2e_test.sh->e2e-test.sh + all refs; kept win_proxy.py snake_case (imported Python module, hyphen invalid) (branch `auto/bmo-resolver`).

### [2026-06-22] `docs/ARCHITECTURE.md` Pi-filesystem layout + health-check cron path are stale (pre-monorepo `~/bmo/`)

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/docs/ARCHITECTURE.md` still documents a deployment rooted at `~/bmo/`. Its "Pi filesystem layout" tree places `health_check.sh`, `bmo.service`, `requirements.txt`, `docker-compose.yml`, `backup.sh`, `venv/`, and `logs/` directly under a `~/bmo/` root, and the cron example reads `*/5 * * * * /home/patrick/bmo/health_check.sh >> /home/patrick/bmo/logs/health.log`. But the project is now an in-place monorepo: `deploy.sh` sets `REPO_ROOT=/home/patrick/home-lab` and runs from `bmo/pi/` directly (no rsync to `~/bmo/`), `health_check.sh` actually lives at `bmo/pi/scripts/health_check.sh`, and `/home/patrick/bmo` does not exist on the host. So the documented filesystem tree and the cron path are stale and would mislead anyone setting up monitoring straight from the doc.

**Proposed fix / improvement:**
- [ ] Update the ARCHITECTURE.md filesystem-layout tree and the cron example to the current `home-lab/bmo/pi/...` paths (script at `pi/scripts/health_check.sh`); confirm the live crontab path while doing so.

**Related files:** `bmo/docs/ARCHITECTURE.md`, `bmo/pi/scripts/health_check.sh`, `bmo/pi/scripts/deploy.sh`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Rewrote stale ~/bmo/ paths and the health-check cron example to the current ~/home-lab/bmo/pi/... layout (branch `auto/bmo-resolver`).

### [2026-06-22] Duplicate `Two IDE implementations coexist` section in `DESIGN-CONSTRAINTS.md`

- **Category:** debt, docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/docs/DESIGN-CONSTRAINTS.md` contains the entire `## Two IDE implementations coexist — production IDE is web/ + routes/ide.py, NOT ide_app/` section **twice, verbatim** (currently lines ~47–58 and ~60–71, each ending with the same `_Relocated from docs/BMO-SUGGESTIONS-LOG.md on 2026-06-22._` footer). Looks like the 2026-06-22 relocation pasted the block in twice. Harmless at runtime but it bloats the doc and a future edit to one copy will silently diverge from the other. Just delete one of the two identical copies.

**Proposed fix / improvement:**
- [ ] Remove one of the two identical `Two IDE implementations coexist` sections, leaving a single copy.

**Related files:** `bmo/docs/DESIGN-CONSTRAINTS.md`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Removed the duplicated copy of the section (branch `auto/bmo-resolver`).

### [2026-06-22] Production module `agents/test_agent.py` collides with the `test_*.py` pytest glob

- **Category:** debt, design-gotcha
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/agents/test_agent.py` is a **production** module (BMO's "testing agent" — runs tests, analyzes failures), but its name matches `pytest.ini`'s `python_files = test_*.py` discovery glob. It is safe today only because `testpaths = tests` scopes default collection to `tests/`; however `agents` is in the `.coveragerc` source list, and any `pytest agents/` invocation, IDE auto-discovery, or a future `testpaths` change would try to collect this non-test module and likely error on import. Confusing too: the real agent tests live in `tests/agents/test_*.py`, so a reader greps `test_agent` and gets both the production agent and its concept-namesake. Renaming the production module (e.g. `testing_agent.py` / `tests_agent.py`) removes the footgun.

**Proposed fix / improvement:**
- [ ] Rename `agents/test_agent.py` to a non-`test_`-prefixed name (e.g. `testing_agent.py`); update its import/registration in `agents/_registry.py`, `agents/__init__.py`, the router, and the `pi/README.md` tree.

**Related files:** `bmo/pi/agents/test_agent.py`, `bmo/pi/agents/_registry.py`, `bmo/pi/pytest.ini`, `bmo/pi/.coveragerc`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Renamed to agents/testing_agent.py and updated the _registry import path (branch `auto/bmo-resolver`).

### [2026-06-22] `authorize_calendar.py` and `reauth_calendar.py` duplicate OAuth constants/paths

- **Category:** debt
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
The two Google Calendar OAuth helpers in `services/` legitimately differ in flow (`authorize_calendar.py` = browser `InstalledAppFlow`; `reauth_calendar.py` = headless manual code exchange), but they each re-declare the same `SCOPES`, the same `config/` dir resolution, and the same `credentials.json` / `token.json` path logic independently. If the scope list or token location ever changes, both must be edited in lock-step or they drift. Minor — a small shared helper (or module-level constants imported by both) would keep them in sync.

**Proposed fix / improvement:**
- [ ] Factor `SCOPES` + the `credentials.json`/`token.json` path resolution into one place (e.g. `calendar_service.py` or a tiny `calendar_oauth_paths` helper) and import it in both scripts.

**Related files:** `bmo/pi/services/authorize_calendar.py`, `bmo/pi/services/reauth_calendar.py`, `bmo/pi/services/calendar_service.py`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Extracted shared paths/scopes to services/calendar_oauth_config.py (branch `auto/bmo-resolver`).

### [2026-06-22] Remove stale one-off `dev/patch_*.py` + `revert_power.py` app.py-mutating scripts

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/dev/` holds six throwaway, one-shot scripts that read `../app.py`, do string-replacement surgery on it, and write it back: `patch_debug.py`, `patch_keepalive.py`, `patch_retry.py`, `patch_revert.py`, `patch_wol.py`, and `revert_power.py`. They were all last touched 2026-04-24 to fix the (now-resolved) RCA-TV power/WoL endpoint, and the comments confirm they are single-use migrations ("Revert to POWER for everything - WAKEUP doesn't work on this RCA TV", "Add WoL fallback...", etc.). They are no longer referenced anywhere except the `pi/README.md` directory tree. Keeping live "edit app.py in place" scripts around is a footgun — a future agent could re-run one and silently corrupt `app.py`.

**Proposed fix / improvement:**
- [ ] Confirm the corresponding changes are already merged into `app.py` (they are — the TV power work is resolved).
- [ ] Delete the six scripts, or move them under `_archive/` if history is wanted.
- [ ] Drop their line from the `pi/README.md` directory tree.

**Related files:** `bmo/pi/dev/patch_debug.py`, `bmo/pi/dev/patch_keepalive.py`, `bmo/pi/dev/patch_retry.py`, `bmo/pi/dev/patch_revert.py`, `bmo/pi/dev/patch_wol.py`, `bmo/pi/dev/revert_power.py`, `bmo/pi/README.md`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Deleted dev/patch_*.py + revert_power.py and updated the README tree (branch `auto/bmo-resolver`).

### [2026-06-22] `dev/` benchmark layout is inconsistent (loose files vs `benchmarks/` subdir)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/dev/` keeps four benchmarks as loose files at its root (`benchmark_audio.py`, `benchmark_full.py`, `benchmark_llm.py`, `benchmark_personality.py`) while two others live in a `dev/benchmarks/` subdir (`gemini_stream_probe.py`, `thinking_budget_sweep.py`). Diagnostics were already consolidated into `dev/diagnostics/` in a prior pass, so the half-migrated benchmark split is the odd one out. Moving the four loose `benchmark_*.py` into `dev/benchmarks/` would make `dev/` uniform (benchmarks/, diagnostics/, ai-temp/ + true dev tools at root).

**Proposed fix / improvement:**
- [ ] Move `dev/benchmark_*.py` into `dev/benchmarks/` (rename to drop the `benchmark_` prefix, or keep it — just be consistent).
- [ ] Update any docs/README tree references.

**Related files:** `bmo/pi/dev/benchmark_audio.py`, `bmo/pi/dev/benchmark_full.py`, `bmo/pi/dev/benchmark_llm.py`, `bmo/pi/dev/benchmark_personality.py`, `bmo/pi/dev/benchmarks/`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Moved loose benchmark_*.py into dev/benchmarks/ (branch `auto/bmo-resolver`).

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added root .nvmrc; workflows now use node-version-file (branch `auto/bmo-resolver`).

### [2026-06-22] `pi/README.md` layout says "5 AI agents" but `agents/` holds ~40 modules

- **Category:** docs
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/README.md` (Layout section) labels the `agents/` directory "5 AI agents — each owns one capability", but the directory actually contains ~40 agent modules (the README's own file list right below the label enumerates them all). The "5" is stale from an earlier era. Cheap to fix and avoids misleading new contributors about the agent count/architecture.

**Proposed fix / improvement:**
- [ ] Update the `agents/` one-liner in `pi/README.md` to reflect the real count (or drop the hard number, e.g. "AI agents — each owns one capability").

**Related files:** `bmo/pi/README.md`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Corrected to 40+ agent modules and refreshed the dev/ tree (branch `auto/bmo-resolver`).

### [2026-06-22] Misspelled static asset filename `PrimeVIdeo.png`

- **Category:** debt
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
The TV-app launcher image `bmo/pi/web/static/img/PrimeVIdeo.png` has a capitalization typo (`VIdeo` instead of `Video`). It works today because `web/templates/index.html:1163` references it with the exact same misspelling, but the inconsistent casing is a small naming smell next to its siblings (`Netflix.png`, `YouTube.png`, `Plex.png`, etc.) and is a portability hazard on case-sensitive vs case-insensitive filesystems. Low priority — only worth fixing alongside other `index.html` asset churn (rename file + update the one `<img src>`).

**Related files:** `bmo/pi/web/static/img/PrimeVIdeo.png`, `bmo/pi/web/templates/index.html`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Verified already correct in tree (PrimeVideo.png); stale observation (branch `auto/bmo-resolver`).

### [2026-06-22] Discord DM + Social bots swallow startup crashes and exit 0 — `Restart=on-failure` never fires; bots stay down indefinitely

- **Category:** bug
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (read-only journal review + code read)

**Description:**
Both Discord bots catch any startup exception in their top-level run coroutine, log it, and return normally instead of re-raising. Because the process then exits 0, systemd `Restart=on-failure` does not trigger, so a single startup crash takes the bot down until a human restarts it. Observed live: both `bmo-dm-bot` and `bmo-social-bot` crashed at the 2026-06-20 00:45 boot and have been `inactive (dead)` for 2+ days (`systemctl is-active` returns `inactive` for both; no process running).

**Reproduction (if bug):**
1. Cause `await _bot.start(...)` to raise on startup (e.g. a transient network/TLS failure at boot).
2. The `except Exception as e:` block logs "DM bot crashed" / "Social bot crashed" and the coroutine returns.
3. `asyncio.run(...)` / `run_until_complete(...)` completes; process exits 0.
4. Observed: systemd logs `Deactivated successfully` (status=0/SUCCESS); `Restart=on-failure` does not restart; bot stays down.

**Expected behavior (if bug):** an unexpected startup crash should exit non-zero so `Restart=on-failure` + `RestartSec=10` brings the bot back (or the bot should retry internally with backoff). Only `discord.LoginFailure` (a real config error) should exit 0.

**Hypothesis / root cause:** the broad `except Exception` was meant to log crashes cleanly, but combined with `Restart=on-failure` it defeats auto-recovery. The crash handler should re-raise / `raise SystemExit(1)` for generic exceptions while keeping LoginFailure as a clean exit.

**Proposed fix / improvement:**
- [ ] After logging a non-LoginFailure crash, `raise` / `raise SystemExit(1)` so systemd restarts.
- [ ] Or add internal reconnect/backoff for transient failures.
- [ ] Consider `Restart=always` for these transient-tolerant services.

**Related files:** `bmo/pi/bots/discord_dm_bot.py` (`_run_dm_bot`, ~line 2041; `__main__` ~2076), `bmo/pi/bots/discord_social_bot.py` (`_run_social_bot`, ~line 6949; `__main__` ~6978)

**Related entries:** [2026-06-22] Bot services start before NTP clock sync at boot

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Re-raise non-LoginFailure startup crashes so systemd Restart=on-failure recovers the bot (branch `auto/bmo-resolver`).

### [2026-06-22] Calendar monitor reports a long-expired token as transient "waiting for refresh" forever — never escalates, re-alerts every monitor cycle

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal review + monitoring.py / calendar_service.py read)

**Description:**
On the live Pi, `config/token.json` has been expired since 2026-06-20T06:57Z (~66h at scan time) and has NOT been rewritten since 2026-06-19 23:58 (its mtime). The health monitor emits `google_calendar: 📅 Calendar token expired — waiting for refresh` (Severity.WARNING, status `degraded`) on EVERY monitor cycle — 154+ identical lines, one per ~60s — yet no auto-refresh ever occurs and there is not a single `[calendar]` refresh-loop log line in the whole boot. Calendar features are effectively down, but the only signal is a perpetual transient-looking WARNING.

Two distinct problems combine here:
1. **No escalation:** `_check_calendar_token` (services/monitoring.py ~1559-1582) treats "expiry in the past AND a refresh_token is present" as `degraded` / "waiting for auto-refresh" indefinitely. It never verifies the refresh actually happened, so a genuinely stuck/revoked token (per the 2026-04-23 resolved entry, recovery can require a *manual* `reauth_calendar.py`) is permanently misclassified as a benign transient instead of an actionable `down`/CRITICAL.
2. **Breaker bypass / log spam:** the resolved-issue circuit-breaker (#6) only backs off statuses `down`/`unknown` (see the `finally` block feeding the breaker). The `degraded` "waiting" branch is excluded, so this exact warning re-fires every single monitor cycle forever — re-introducing the alert/log spam the breaker was added to stop.

**Reproduction (if bug):**
1. Let the calendar access token expire while a refresh_token is present but auto-refresh does not run (observed: poll loop never rewrites token.json; zero `[calendar]` lines).
2. Watch `journalctl -u bmo.service`: `Calendar token expired — waiting for refresh` repeats every ~60s with no resolution.

**Expected behavior (if bug):** after the token has been expired beyond a refresh cycle (e.g. > a few minutes / N consecutive checks) with no successful refresh, escalate to `down`/CRITICAL with the actionable reauth hint, and apply the circuit-breaker backoff to the `degraded` path so it does not re-alert every cycle.

**Hypothesis / root cause:** the `degraded` "waiting for auto-refresh" branch assumes the refresh is imminent and self-healing; it has no time/attempt budget and is excluded from the breaker. The underlying refresh itself also appears not to be happening (token.json untouched, no `[calendar]` lines) — likely the refresh token is invalid and needs manual reauth (cf. resolved 2026-04-23), which is exactly the actionable state the monitor fails to surface.

**Proposed fix / improvement:**
- [ ] Track first-seen-expired time (or a consecutive-expired counter); after a threshold with no successful refresh, set status `down` + Severity.CRITICAL with the reauth command.
- [ ] Feed the `degraded` path into the circuit-breaker (or rate-limit the WARNING) so it does not log every ~60s.
- [ ] Optionally have the monitor (or a watchdog) trigger / verify an actual `creds.refresh()` rather than only reading the file.

**Related files:** `bmo/pi/services/monitoring.py` (`_check_calendar_token`, ~1495-1620), `bmo/pi/services/calendar_service.py` (`_get_credentials`, `_poll_loop`)

**Related entries:** resolved 2026-04-23 "Google Calendar `invalid_grant`"; resolved monitoring #6 circuit-breaker

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Escalate to down/CRITICAL after a 10m grace with reauth hint; circuit-breaker stops per-cycle WARNING spam (branch `auto/bmo-resolver`).

### [2026-06-22] System timezone auto-sync permanently fails — `sudo -n timedatectl` blocked by `NoNewPrivileges=yes`; system stays on wrong TZ + logs error every refresh

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal review + location_service.py read)

**Description:**
`LocationService._sync_system_timezone` (services/location_service.py ~481-509) shells out `sudo -n timedatectl set-timezone <tz>` to align the Pi clocks timezone to the detected location. But `bmo.service` runs with `NoNewPrivileges=yes` (confirmed via `systemctl show bmo.service -p NoNewPrivileges`), which forbids any setuid escalation, so the call fails every time: `[location] Could not set system timezone to America/Chicago: sudo: The "no new privileges" flag is set, which prevents sudo from running as root.` Net effect: the system timezone is never updated by this path (it detects `America/Chicago` but the Pi stays on its default `America/Denver`), and the failure is logged on every location refresh (~every 30 min, `BMO_LOCATION_REFRESH_SECONDS=1800`). `AUTO_SYSTEM_TIMEZONE` is enabled, so the doomed attempt runs each cycle.

This may also cause a real correctness gap: calendar event creation hardcodes `timeZone: "America/Denver"` (calendar_service.py `create_event`) while location reports `America/Chicago` — a stuck system TZ keeps these inconsistent.

**Reproduction (if bug):**
1. Run BMO under a unit with `NoNewPrivileges=yes` (as deployed).
2. Trigger a location refresh that detects a TZ != current system TZ.
3. Observe `[location] Could not set system timezone ...: sudo: The "no new privileges" flag is set ...` and the system TZ unchanged.

**Expected behavior (if bug):** either the timezone is actually applied, or the service does not repeatedly attempt a privileged action it can never perform (and does not log an error every 30 min).

**Hypothesis / root cause:** `NoNewPrivileges=yes` (a hardening setting on the unit) is fundamentally incompatible with `sudo`. A sudoers NOPASSWD rule will NOT help under NoNewPrivileges. timedatectl set-timezone needs either polkit (via DBus, not sudo) or the privilege drop relaxed.

**Proposed fix / improvement:**
- [ ] Use the DBus/polkit path (e.g. `busctl`/`timedatectl` via system bus with a polkit rule) instead of `sudo`, which works under NoNewPrivileges.
- [ ] OR gate the attempt behind a capability probe and disable `AUTO_SYSTEM_TIMEZONE` (or log once, not every cycle) when escalation is unavailable.
- [ ] Verify the intended deployment TZ vs the hardcoded `America/Denver` in `create_event`.

**Related files:** `bmo/pi/services/location_service.py` (`_sync_system_timezone` ~481), the `bmo.service` unit (NoNewPrivileges), `bmo/pi/services/calendar_service.py` (`create_event` hardcoded timeZone)

**Related entries:** [2026-06-22] Location provider order wastes a guaranteed-failing request (ipapi 429)

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Disable and log once when sudo set-timezone can never run under NoNewPrivileges (branch `auto/bmo-resolver`).

### [2026-06-22] Bot services start before NTP clock sync at boot — TLS "certificate is not yet valid" crash

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (journal review of the 2026-06-20 boot)

**Description:**
At the 2026-06-20 00:44 boot, both bots started ~5s later and immediately failed connecting to `gateway.discord.gg:443` with `SSLCertVerificationError: certificate is not yet valid`. This is a clock-skew-at-boot symptom: the Pi clock was behind real time before `systemd-timesyncd` corrected it, so Discord's TLS cert looked "not yet valid". The bot units order only on `network-online.target`, not on time sync, so they can start before the clock is correct. (`timedatectl` now shows the clock synchronized — the failure window is boot-time only.) This SSL failure is the trigger that then hits the swallow-and-exit-0 bug above, leaving the bots down for days. The surfaced crash text was `'NoneType' object has no attribute 'sequence'` — discord.py's gateway/reconnect path NPEs after the TLS handshake fails, and the bots report it as a generic crash.

**Reproduction (if bug):**
1. Boot the Pi with the clock behind real time (no/empty RTC seed, before timesyncd corrects).
2. Bot services start on `network-online.target` before time sync.
3. TLS to `gateway.discord.gg` fails: "certificate is not yet valid".

**Expected behavior (if bug):** bots should not attempt to connect until the clock is sane.

**Hypothesis / root cause:** missing `After=time-sync.target` + `Wants=time-sync.target` ordering (and/or no fake-hwclock seeding) means `network-online.target` precedes a correct clock.

**Proposed fix / improvement:**
- [ ] Add `After=time-sync.target` and `Wants=time-sync.target` to both bot unit `[Unit]` sections.
- [ ] Verify fake-hwclock / RTC seeding so the boot clock is not wildly behind.
- [ ] Combine with internal connect retry/backoff (see related bug).

**Related files:** `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`

**Related entries:** [2026-06-22] Discord DM + Social bots swallow startup crashes and exit 0

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added After/Wants=time-sync.target to both bot units (branch `auto/bmo-resolver`).

### [2026-06-22] Location provider order wastes a guaranteed-failing request each refresh — ipapi.co returns HTTP 429 every cycle

- **Category:** config
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal review + location_service.py read)

**Description:**
`_PROVIDERS` (services/location_service.py ~97) lists `https://ipapi.co/json/` FIRST, then `https://ipwho.is/`. On this Pi, ipapi.co returns `429 Too Many Requests` on every refresh (observed every ~30 min: `[location] Provider failed (https://ipapi.co/json/): 429 ...`). The loop then falls through to ipwho.is, which succeeds — so location still works, but every refresh cycle pays one guaranteed-failing HTTP request (up to an 8s timeout window) + a log line before falling back. The free ipapi.co tier is evidently over quota / blocked for this IP, so it will keep 429-ing.

Not blocking (fallback works), but pure waste + recurring log noise. Logging per the "log even minor things" directive.

**Proposed fix / improvement:**
- [ ] Reorder `_PROVIDERS` to put a working provider (ipwho.is) first, OR
- [ ] Add a short-lived negative cache / backoff for a provider that returns 429 so it is skipped for a while.
- [ ] Optionally downgrade the repeated 429 log to debug once a fallback has succeeded.

**Related files:** `bmo/pi/services/location_service.py` (`_PROVIDERS` ~97, provider loop ~384-398)

**Related entries:** [2026-06-22] System timezone auto-sync permanently fails (NoNewPrivileges)

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Reordered _PROVIDERS so working ipwho.is is queried before the 429-ing ipapi.co (branch `auto/bmo-resolver`).

### [2026-06-22] Ruff lint backlog: 357 errors across bmo/pi (mostly tests)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (`ruff check . --statistics`)

**Description:**
`ruff check .` in `bmo/pi` reports 357 errors (198 auto-fixable): 120 F841 unused-variable, 93 F541 f-string-missing-placeholders, 62 E702 multiple-statements-on-one-line-semicolon, 45 E402 module-import-not-at-top, 21 F811 redefined-while-unused, 7 F401 unused-import, 6 E741 ambiguous-variable-name, plus minor. Concentrated in `tests/` (e.g. unused `mock_q` / `mock_thread` mocks in `tests/test_voice_pipeline.py`). Mostly cosmetic, but the F811 redefinitions and F841 unused mocks can hide real test bugs (a patched mock that is never asserted on). Not blocking — lint is evidently not gating CI or these would fail there.

Note: ruff also reports 1 invalid-syntax in a non-source file (a `def f[T](...)` PEP 695 fixture string under a path outside the tracked source set) — not a real source bug; all git-tracked `bmo/**/*.py` compile cleanly under Python 3.11.

**Proposed fix / improvement:**
- [ ] Run `ruff check bmo/pi --fix` for the 198 safe fixes, review the diff.
- [ ] Manually address F811 / F841 in tests (may reveal unasserted mocks).

**Related files:** `bmo/pi/tests/test_voice_pipeline.py`, and others across `bmo/pi`

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Applied 197 safe ruff autofixes across bmo/pi; residual unsafe F841/F811 left for manual review (branch `auto/bmo-resolver`).

### [2026-06-22] Health monitor alerts to restart `bmo-kiosk` every cycle — unit is `disabled` (not in `_OPTIONAL_DISABLED_SERVICES`); also drifts from `setup-bmo.sh` which enables it

- **Category:** config, bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live journal + `systemctl is-enabled/is-active` + monitoring.py read + setup-bmo.sh read)

**Description:**
`bmo-kiosk.service` is `disabled` + `inactive` on the live Pi (never started this boot — `journalctl -u bmo-kiosk` = "No entries", `ConditionResult=no`). The health monitor lists `bmo-kiosk` in `_MONITORED_SERVICES` but `_OPTIONAL_DISABLED_SERVICES = {"bmo-fan"}` only — kiosk is **not** in that set. So `_check_systemd_services` (monitoring.py ~1133-1205) classifies the disabled kiosk as `status: down` and emits `⚙️ 🖥️ BMO Kiosk (touchscreen UI) is inactive — run: sudo systemctl restart bmo-kiosk` (Severity.WARNING) on **every** monitor cycle (~60s) — confirmed firing continuously in the live journal. The disabled/optional branch (which would mark it `info: disabled by configuration`) never triggers because kiosk isn't whitelisted there.

Two intertwined problems:
1. **Monitor false-positive / log spam:** restarting a `disabled` unit is non-actionable; the WARNING repeats every cycle (same alert-spam class as the calendar "waiting for refresh" entry — the disabled state isn't suppressed).
2. **Possible config drift:** `setup-bmo.sh` line 372 runs `sudo systemctl enable bmo bmo-kiosk bmo-fan bmo-dm-bot bmo-social-bot` and the unit is `WantedBy=multi-user.target`, i.e. the kiosk touchscreen UI is *intended* to be enabled. Its being `disabled` on the host either is deliberate (headless / mic-less dev state — this Pi also has no capture device) or is real drift where the touchscreen UI no longer comes up at boot. **Unverified which** — flagging honestly; not restarting/mutating per scan rules.

**Expected behavior:** if kiosk is intentionally optional on some hosts, add it to `_OPTIONAL_DISABLED_SERVICES` so a `disabled` unit reports `info` (not a per-cycle WARNING). If it should be running, it should be `enabled` per `setup-bmo.sh`.

**Hypothesis / root cause:** `_OPTIONAL_DISABLED_SERVICES` was set up for `bmo-fan` only; kiosk's optional/disabled state was never accounted for. Whether kiosk *should* be enabled is a separate host-state question.

**Proposed fix / improvement:**
- [ ] Decide intended kiosk state for this host. If optional → add `"bmo-kiosk"` to `_OPTIONAL_DISABLED_SERVICES`. If required → re-enable (`systemctl enable --now bmo-kiosk`) — owner action, not this scan.
- [ ] Either way, suppress/rate-limit the repeating WARNING for a unit that is `disabled` (don't tell the user to restart a disabled unit every 60s).

**Related files:** `bmo/pi/services/monitoring.py` (`_OPTIONAL_DISABLED_SERVICES` ~628, `_MONITORED_SERVICES` ~1133, `_check_systemd_services` ~1135-1205), `bmo/pi/kiosk/bmo-kiosk.service`, `bmo/setup-bmo.sh` (~372)

**Related entries:** [2026-06-22] Calendar monitor reports a long-expired token ... re-alerts every monitor cycle; [2026-06-22] Discord DM + Social bots swallow startup crashes

- **Resolved by:** bmo-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added bmo-kiosk to _OPTIONAL_DISABLED_SERVICES so a disabled unit reports info, not a per-cycle WARNING (branch `auto/bmo-resolver`).

### [2026-05-17] Phase 41 (BMO) — Static cache-busting (root cause of "QA still reproduces after fixes shipped")

- **Original symptom:** User re-ran the Round 4 QA report against the production deployment after Phase 39+40 shipped and reported the SAME bugs — even though my curl verification showed every fix WAS live in the served files.
- **Category:** caching, deployment
- **Domain:** bmo
- **Resolved by:** Claude Opus (BMO Phase 41 — single commit)
- **Date resolved:** 2026-05-17
- **Root cause:** `Cache-Control: public, max-age=3600, must-revalidate` on `/static/*` means browsers serve cached `bmo.js` for up to 1 hour WITHOUT revalidating. The previous `?v={{ asset_v }}` template variable was `int(time.time())` — but only applied to CSS, NOT to `bmo.js`. So `bmo.js` was a static URL → browser cached → user saw fixes from prior session for up to an hour after each commit.
- **Fix:** Per-file mtime cache-bust for every static asset URL:
  - `app.py` adds `_static_mtime(rel)` helper, passes `js_v=_static_mtime("js/bmo.js")` + `css_v` + `tailwind_v` to the template.
  - `index.html` references each asset with its own version token: `bmo.js?v={{ js_v }}`, `bmo.css?v={{ css_v }}`, `tailwind.css?v={{ tailwind_v }}`.
  - Result: editing only `bmo.js` bumps just its v=; CSS keeps its cache hit. Restart without file changes → same v= → cache hit.
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed. Served HTML now shows `bmo.js?v=1779040637`, `bmo.css?v=1776994328`, `tailwind.css?v=1776994328` — each their own mtime.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/web/templates/index.html`.
- **Why this matters:** Every prior Phase 39/40 fix verified live via curl, but the user's browser was serving the old `bmo.js` from cache. The QA report wasn't wrong — the user genuinely was seeing the old behavior in their browser. This fix means future BMO restarts that include any static-asset change automatically reach active sessions.
- **Verification path forward:** When the user retests after this commit lands and the next restart, they'll fetch the new bmo.js (different v= than what they cached). All Phase 39+40 fixes will surface.

---

### [2026-05-17] Phase 40 (BMO) — Carry-forward sweep: actually fix the 3 items I deflected in 39

- **Original QA bugs:** QA Round 4 carry-forwards (#15 header flicker, #17 weather drift, #20 Monaco worker fallback warning) that I dismissed in Phase 39 as "can't reproduce" / "upstream variance" / "may still appear under strict CSP". User said "fix anyway" — same pattern as the `feedback_do_all_means_actually_do_all` memo.
- **Category:** bug, ux, persistence, CSP
- **Domain:** bmo
- **Resolved by:** Claude Opus (BMO Phase 40 — single commit per workflow)
- **Date resolved:** 2026-05-17
- **Final test sweep:** 815 passed, 6 skipped.
- **Sub-phase summary:**
  - **40a (#15 header flicker):** Seed `healthSummary` from localStorage on init so the pill never starts blank between page navigations. Also seed `weather` from localStorage so the temperature pill stays sticky. Both write back on every update. No more "BMO" → "BMO ⚠ calendar" → "BMO" flicker as Alpine reactives settle on tab switch.
  - **40b (#17 weather drift):** Curl-verified the 37d throttle IS working — two `force=1` calls 2s apart return identical `as_of` timestamps + identical temps. The "drift" QA saw is real Open-Meteo data variance over longer intervals. Updated `weatherUpdatedAgo()` to read `weather.as_of` (the server-side cache stamp) not the local `_weatherFetchedAt` — now the UI shows "updated 4m ago" so the user can SEE the temp is cached and stable.
  - **40c (#20 Monaco worker):** Real fix — CSP `script-src` now includes `blob:` so the worker shim from 39h can actually create the URL.createObjectURL Blob. Added `worker-src 'self' blob: https://cdn.jsdelivr.net` directive too (modern browsers split worker URLs from script URLs). Verified the new headers serve via curl `-I`.
  - **40d:** smoke + log + single commit.
- **Touched files:** `bmo/pi/app.py` (CSP headers), `bmo/pi/web/static/js/bmo.js` (localStorage seed + as_of read).
- **Pattern lesson applied:** When the user says "fix anyway", actually fix it — don't ship a cleaner non-answer. Each of the three carry-forwards had a real, small, addressable fix:
  - #15 → localStorage seed (was a "no browser to reproduce" deflection)
  - #17 → drift was upstream BUT the user-visible improvement was server-side `as_of` exposure
  - #20 → CSP `blob:` was always the answer; I shipped the shim in 39h but didn't unlock the CSP that lets the shim run

---

### [2026-05-17] Phase 39 (BMO) — QA Round 4 bundle (25 problems, plan KeyError leak + real regressions + perf)

- **Original QA bugs:** 2026-05-17 BMO QA Round 4 report. CRITICAL: `'state'` KeyError raw in chat. Plus real regressions where my Phase 38 fixes didn't take (verify-don't-assume failures).
- **Category:** bug, ux, surface-leak, regression-sweep, perf
- **Domain:** bmo
- **Resolved by:** Claude Opus (BMO Phase 39 — 39a-39i; single commit per workflow)
- **Date resolved:** 2026-05-17
- **Final test sweep:** 815 passed, 6 skipped (added RAM hysteresis test). BMO restarted; scene deactivate now logs `party deactivate → stopping music` — proves the fix engages.
- **Sub-phase summary:**
  - **39a:** #1 orchestrator catches per-agent exceptions, surfaces friendly text (no bare Python keys); AgentResult gains `failed` flag; plan-mode enter bails out cleanly when explore/design fail (no Approve/Cancel for a plan that didn't build). #11 System Status detail pre-computes filtered service buckets (pi/svc/docker/api/net) in `fetchDetailedStatus` so the template stops re-running `Object.entries.filter` on every render — fixes the 15-20s "Loading detailed status…" delay. #12 `fetchControlsData` switched from `await Promise.all` (blocks on slowest) to per-endpoint `.then()` so `controlsLoaded` flips immediately and individual sections paint as they arrive.
  - **39b — real regressions:** #3 found my Phase 37c bug — `_apply_deactivation` read `self._active_scene` AFTER `deactivate()` set it to None, so scene_cfg was None and `music.stop()` never fired. Fixed: `deactivating_scene` parameter captures the name before the clear. Verified: log now shows `party deactivate → stopping music`. #8 IDE openFile gains in-flight Set so near-simultaneous calls dedupe. #10 music search Enter handler gets `.stop` + `@input.debounce.250ms`. #22 server-side guard in `createAlarmFromTime` (defensive, template `:disabled` already in place). #23 TV pair overlay opacity bumped to full (was `/95` letting tiles peek through). #24 home green text already muted in 37h.
  - **39c:** Mute banner now triggers on EITHER `wpctl muted` OR `system === 0` (was only the former). Copy adapts: "Master volume is 0%" vs "System audio is muted".
  - **39d:** #5/#6 Camera overlay dropped enter transition (was 200ms semi-transparent fade letting chat behind catch clicks); z-50 ensures fullscreen mount. #21 toast styling differentiates errors (rose bg + white bold text) from info (accent green).
  - **39e:** #7 Quick Open result rows boosted to font-weight 600 + dim-grey-not-near-black file path; `qo-selected` class for arrow-key nav (added `ArrowUp/Down/Enter` handler on the input). #9 Mini-player gets dismiss X (resets on new song).
  - **39f:** #14 `_wifi_status` falls back to `iw dev <iface> link` then `nmcli -t -f IN-USE,SSID,DEVICE dev wifi` when wpa_cli + iwgetid both return empty. Smoke: `current_ssid: 'LAN of the Free'` now populated. #13 fixed downstream — WiFi card sees real SSID.
  - **39g:** #16 RAM threshold hysteresis: enter degraded at >=90%, exit at <80%, between 80-90% stays in whichever state it was last in. New `test_ram_hysteresis_stays_degraded_between_thresholds` proves the behavior. #18 bell badge clears when `/api/notifications` returns empty + history empty. #25 Notifications "Clear" relabeled "Clear all" + tooltip on the enable toggle.
  - **39h:** #19 bell-dropdown dismiss button bigger (`w-6 h-6 rounded` + hover bg). #20 `MonacoEnvironment.getWorkerUrl` provides same-origin Blob worker shim that `importScripts` the CDN URL — fixes the cross-origin "Could not create web worker(s)" warning under CF Access.
  - **39i:** full pytest + smoke + log row + single commit.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/agents/base_agent.py`, `bmo/pi/agents/orchestrator.py`, `bmo/pi/services/monitoring.py`, `bmo/pi/services/scene_service.py`, `bmo/pi/web/static/ide/ide.css`, `bmo/pi/web/static/ide/ide.js`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`, `bmo/pi/tests/test_monitoring.py`.
- **Pattern reminders applied:** Verify-don't-assume drove the #3 Party Mode fix (found the explicit scene_name capture bug by reading the code I'd written). Trust user bug reports — even when my prior fix looked correct in code, drove the actual flow before claiming "QA wrong".

---

### [2026-05-17] Phase 38 (BMO) — QA Round 3 bundle (36 problems, surface leaks + regressions + new)

- **Original QA bugs:** 2026-05-17 BMO QA Round 3 report. Critical: Anthropic provider URL was leaking raw into chat. Plus regressions from Phase 37 and net-new bugs.
- **Category:** bug, ux, surface-leak, regression-sweep
- **Domain:** bmo
- **Resolved by:** Claude Opus (BMO Phase 38 — 38a-38j; commits tagged `fix(bmo): 38x` to disambiguate from DS Phase 38 which already landed)
- **Date resolved:** 2026-05-17
- **Final test sweep:** 814 passed, 6 skipped. BMO restarted clean.
- **Sub-phase summary:**
  - **38a (chat hygiene):** #1 Anthropic URL leak — `code_agent.py` now logs internally + surfaces error-shape-specific user-facing messages (400/401/429/timeout). #2 agent banner only while in-flight. #3 `text` speaker tag hidden. #4 plan banner clears + selectedAgent resets on reject.
  - **38b (verify-don't-assume regressions):** #18 Settings panel reads `/api/wifi/status/detail` + UI shows "Connected (Ethernet)" when ssid empty + ip present. #17 music volume seeded from settings.json at boot so /api/music/state matches /api/volume. #14 CSP `img-src` allows yt3/lh3/i.ytimg hosts (thumbnails unblocked). #13 music Enter handler gets `.stop` + 250ms input debounce. #33 bell-dropdown gets per-item dismiss. #7 chat_cleared listener uses splice + toast. #11/#12 camera overlay pointer-events-none leave + explicit tab='chat' on close.
  - **38c (proactive nudges):** #6 quips tagged `role:'ambient'`, deduped 5min, rendered as small italic pill.
  - **38d (camera):** #8 `/api/camera/snap`+`/capture` aliases; raw 500 → clean 503 with reason. #9 describe error split by failure mode. #10 motion toggle reads enabled flag back from server response.
  - **38e (plan agent):** #5 DESIGN_PROMPT teaches the agent to default to HTTP endpoints over generating throwaway scripts.
  - **38f (music search):** #15 logs every query for diagnosis. #16 `_format_result` drops artist entries that match title/album (caught the "Closed on Sunday" mismapping).
  - **38g (perf + RAM):** #21 dropped `style="zoom:2"` on System Status detail (was the 15s freeze cause). #36 Ollama call passes `keep_alive="30s"` so models unload; freed 3.7GB after manual unload.
  - **38h (IDE):** #25 Quick Open shows Searching / No matches / error states instead of empty. #26 openFile normalizes paths so duplicate tabs collapse.
  - **38i (UX):** #23 BT timeout toast only if no devices arrived. #24 MAC tail auto-shown on name collision. #30 dnd_saved omitted when no DnD. #31 Alarm Set disabled at 0/invalid hour. #32 TV pair overlay z-30.
  - **38j:** smoke + log row.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/agent.py`, `bmo/pi/agents/code_agent.py`, `bmo/pi/agents/plan_agent.py`, `bmo/pi/services/music_service.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/static/ide/ide.js`, `bmo/pi/web/templates/index.html`.
- **Explicit non-fixes:** #19 weather swings (37d throttle in place; upstream Open-Meteo data has its own variance), #20 header flicker (can't reproduce reliably without browser session), #22 Settings cold load 8s (already parallel-fetched per 31k), #27/#28/#29 IDE single-click / Monaco worker / js-error spam (Monaco worker needs COOP/COEP under CF Access, separate phase), #34/#35 weather skeleton + status banner cosmetic.

---

### [2026-05-17] Phase 37 — BMO QA Round 2 bundle (32 problems, regressions + new)

- **Original QA bugs:** 2026-05-17 BMO QA Round 2 report. Mix of regressions from Phase 31 (my code) and pre-existing / new issues surfaced by the deeper QA pass.
- **Category:** bug, ux, regression-sweep, hardening
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 37 sub-phases 37a-37j)
- **Date resolved:** 2026-05-17
- **Final test sweep:** 811 passed, 6 skipped. All BMO systemd services active. End-to-end smoke clean.
- **Sub-phase commits:**
  - 37a (regressions): wifi/status shape (read current_ssid + wpa_state correctly), idle suppression deeper (focused input + non-empty inputs), refresh-mid-stream interrupted marker, exit-idle hint more visible, ollama fallback broader exception catch, music search Enter race fix
  - 37b (audio): _get_system_audio_state surfaces muted flag; /api/audio/unmute helper; /api/music/play returns is_playing + warning; top-of-app mute banner with one-click unmute
  - 37c (scenes): _apply_deactivation reverses music side-effects from the deactivating scene (Party Mode no longer leaves music playing)
  - 37d (weather/cal): 5-min throttle on force_refresh; as_of stamp; fetchCalendar gated on document.visibilityState + first-failure-only logging
  - 37e (IDE): renamed 11 `_escapeHtml` → `escapeHtml` + removed 2 duplicate function defs (was breaking Quick Open / command palette); new /api/ide/folder/delete endpoint
  - 37f (chat): leading routing-tag strip (`[conversation]`, etc.); voice transcription drops on mic-muted + empty text + unknown speaker; plan parser fallbacks (strict, numbered, bulleted); chat_cleared SocketIO broadcast for /clear
  - 37g (camera): cameraSnap surfaces backend error string; toggleMotion revert-on-failure + toast
  - 37h (grab-bag): calendar +Add inline validation (duration, date parseable); BT scan 20s timeout reset; BT MAC tail hidden behind toggle; per-item notification dismiss; /api/health/full schema versioned (schema_version:1, guaranteed keys); Routines + Create CTA in panel header + empty state link; idle "What can BMO do for you?" → muted color (no longer reads as link)
  - 37i (test seed): test_music_service fixture patched ms_module path correctly (was leaking "Test Song" entries into prod music_history.json); 7 fake entries scrubbed from the live file
  - 37j (close-out): full pytest, smoke battery, log row
- **Test growth:** 781 → 811 across Phases 31 + 37 (30 new tests).
- **Touched files (Phase 37):** `bmo/pi/app.py`, `bmo/pi/agent.py`, `bmo/pi/services/scene_service.py`, `bmo/pi/services/weather_service.py`, `bmo/pi/routes/ide.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/static/ide/ide.js`, `bmo/pi/web/templates/index.html`, `bmo/pi/tests/test_music_service.py`, `bmo/pi/tests/test_weather_service.py`.
- **Carry-forward:** #11 (no /file/read) was incorrect — endpoint exists at routes/ide.py:292. #4 (no scene badge after reload) appears resolved by the existing /api/scenes flow + 31e's scene_change SocketIO event; re-test if reproducible. Audio mute state on this Pi is pre-existing system condition — the new banner surfaces it, but unmuting is the user's call.

---

### [2026-05-17] Phase 31l — BMO face visual unification: web canvas mirrors OLED in shared coord space

- **Original QA bug:** 2026-05-17 BMO QA report Problem #28 (visual side — state machine already unified in 31h, defer noted in 31j).
- **Category:** ux, architecture
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31l)
- **Date resolved:** 2026-05-17
- **Resolution:** Closes the deferred visual-fidelity side of QA #28. The web canvas BMO face now renders in the same 128×64 logical coordinate space as `hardware/oled_face.py`, scaled 2.5× to 320×160 centered inside the 240-tall canvas. New helpers `_logicalLine`, `_logicalEllipse`, `_logicalRoundedRect`, `_logicalArc` are direct ports of PIL.ImageDraw's primitives. Every expression renderer was rewritten to mirror its OLED counterpart's exact coordinates and primitives:
  - **Direct OLED ports (matching coords):** `_drawIdle`, `_drawListening`, `_drawThinking`, `_drawSpeaking`, `_drawHappy`, `_drawScared`, `_drawSleepy` (was `_drawSleeping`), `_drawError`, `_drawMischievous`.
  - **New canonical expressions added to the web** (already in OLED + the unified `EXPRESSIONS` enum from 31h): `_drawSurprised`, `_drawConcerned` (replaces ad-hoc `_drawSad`), `_drawExcited` (now distinct from happy with bouncing accent), `_drawLookingAround` (faster look-cycle than idle's procedural drift).
  - **Switch table extended** to dispatch all 11 canonical expressions: `idle / happy / surprised / sleepy / concerned / excited / thinking / speaking / listening / error / looking_around` + back-compat aliases (`sad → concerned`, `sleeping → sleepy`, `yapping → speaking`).
  - **Compat wrappers** preserved (`_drawFaceOutline`, `_drawEllipse`) so any external caller that still uses the old API keeps working.
- **Visual canonical look (matches the show):** rounded-rect screen outline at logical [10,4,118,60] radius=8; filled oval eyes with dark pupils that shift with the look-around offset; small flat line mouth. Each non-idle expression overrides eyes/mouth per OLED spec.
- **Verified:** `node --check` passes on the JS bundle (caught + fixed a duplicate `} else {` left over from the edit). `pytest tests/test_face_state.py tests/test_app_endpoints.py` → 40 passed. BMO restarted, `/health` ok. Live JS reachable via `/static/js/bmo.js` with 46 `_logicalEllipse` references confirming the new renderer is served.
- **Touched files:** `bmo/pi/web/static/js/bmo.js` (face renderer + helpers).
- **Note:** The OLED+web now use the SAME coordinate space and SAME drawing commands per expression — adding a new expression means writing it once in each language with the same logical coords. A future further step (out of scope) would extract the per-expression drawing as a JSON/JS-shared asset; the current mirroring is the pragmatic path to identical visuals.

---

### [2026-05-17] Phase 31k — Controls tab full hydration wrapper (deferred follow-up to 31e)

- **Original QA bug:** Deferred sub-tile flicker noted in 31e's resolution (QA #14 expanded scope).
- **Category:** ux, hydration
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31k)
- **Date resolved:** 2026-05-17
- **Resolution:** The Controls tab body is now wrapped in a single `<div x-show="controlsLoaded">` (immediately after the 5-card pulsing skeleton). All ~40 subsections — system status, volume, smart-home devices, voice settings, BT, audio routing, scenes, notifications, alerts, routines — stay hidden until `fetchControlsData()` resolves. Previously only the first tile was gated; the rest rendered with stale defaults for ~500ms causing toggle flicker.
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed. BMO restarted, `/health` ok. Rendered HTML now shows 4 `controlsLoaded` references (skeleton + wrapper + 2 helpers).
- **Touched files:** `bmo/pi/web/templates/index.html`.

---

### [2026-05-17] Phase 31j — Full verification + couldn't-test carry-forward (BMO QA bundle close-out)

- **Original QA bugs:** 2026-05-17 BMO QA report final pass.
- **Category:** verification, docs
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31j)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **Full test sweep:** `cd bmo/pi && source venv/bin/activate && pytest` → **810 passed, 6 skipped** (was 781 at start of Phase 31 — added 29 new tests across speaker normalization, circuit breaker, IDE blueprint, face state machine).
  - **Services healthy:** `systemctl is-active bmo bmo-dm-bot bmo-social-bot bmo-fan` → all `active`. `/health` returns `{status:"ok"}`.
  - **End-to-end smoke of every sub-phase fix path:**
    - 31a: `curl POST /api/chat {"speaker":"voice:gavin"}` → returns `"speaker":"text"` (spoof downgraded).
    - 31b: `/api/wifi/status` → `{"connected":false,"ssid":""}` (trimmed); `/api/wifi/status/detail` returns full diagnostics.
    - 31c: `/api/ide/sandbox/roots` → `{roots:[/home-lab, .bmo_ide_workspace, /tmp]}`; `POST /api/ide/file/create {"content":"..."}` writes bytes_written count.
    - 31d: `POST /api/tv/pair/cancel` → `{ok:true,message:"Pairing cancelled"}` (was hanging 30s+ pre-fix); `POST /api/tv/launch {"app":"youtube"}` → `{ok:true}` (was no-op).
    - 31e: scene_change event emits BEFORE _apply_scene; weather card has freshness pill; mini-player is min-h shrink-0 sticky.
    - 31f: `/api/leds` → status; `/api/face/expression` → `{expression:"idle"}`; BT scan rows render MAC tail.
    - 31g: search input has @keydown.enter; localStorage stores last query; volume slider has live %.
    - 31h: face_state SocketIO event emits on every _sync_expression; ambient suppression rules cover modals/audio/timers; tap-to-exit hint visible.
    - 31i: scratchpad envelope + 64ch/32KB validators; notes 409 on duplicate; timer last-10s text-4xl + drop-shadow pulse; "(interrupted)" pill on incomplete assistant turns.

#### Carry-forward — items the report listed as "Couldn't test" or that require user action

The Phase 31 fix scope landed; these items are tracked separately:

- **#5 (Calendar redirect_uri_mismatch) — user action still required.** Code fix landed in 31b; the OAuth client config in Google Cloud Console must be updated to whitelist `https://bmo.mybmoai.work/api/calendar/auth/callback`.
- **Real-phone mobile-viewport reflow** — only DevTools emulation was exercised this session.
- **Refresh-mid-stream against a deliberately slow model** — local model responded too fast to reliably catch the race window.
- **`/api/service/restart-all`** — skipped to avoid taking BMO offline during the run.
- **Discord DM session start/narrate flow** — off-limits per user instruction.
- **Bluetooth pair/connect (full flow)** — scan-only; pair flow requires a real BT device test.
- **Voice-profile deletion path** — not exercised this run.
- **Long-dwell (5+ min) ambient face** — only briefly observed when ambient activated mid-test.
- **Calendar end-to-end success** — blocked by `#5` user-action step above.
- **TV-off scene transitions** — TV was on for this pass per user instruction.

#### Deferred follow-ups (out of scope for Phase 31, tracked in active logs)

- **Full BMO face visual redesign** — state machine unified in 31h; the asset-level redesign (canonical show-style proportions, shared keyframe atlas between web + OLED) deferred to a separate future phase.
- **Controls tab full hydration skeleton** — 31e gated the System Status tile; remaining ~40 Controls subsections still hydrate independently. Visible-on-open content no longer shows wrong defaults; sub-tile flicker fix is a follow-up.

---

### [2026-05-17] Phase 31i — Scratchpad schema, chat-stream interrupt marker, timer last-10s pulse, notes dedup

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #22, #24, #29, #30, #31.
- **Category:** bug, ux, api-design
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31i)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#22 (Scratchpad schema undocumented):** Inline schema block at the top of the `/api/scratchpad` route group in `app.py` documents the GET response (`{sections: {<name>: <content>}}`), POST request (required `section` ≤64ch, `content` ≤32KB, optional `append`), DELETE request (optional `section`). New `_scratchpad_validate` enforces the contract; previously the POST silently defaulted `section="Notes"`/`content=""`. POST response now returns `{success, section, bytes}` with the UTF-8 byte count.
  - **#31 (Home notes accept duplicates silently):** `POST /api/notes` returns `409 {error:"duplicate", existing:<note>}` on case-insensitive text match unless the body sets `allow_duplicate=true`. Frontend `addNote()` catches the 409 and shows `confirm("...Add anyway?")` before re-posting with the override flag. Dedup check + insert happen under a single `notes_lock` acquisition.
  - **#29 (Timer last-10s visual is unchanged from earlier countdown):** Timer card font size bumps from `text-3xl` → `text-4xl` in the last 10 seconds, gains a red drop-shadow glow + animate-pulse. The existing amber-at-60s tier preserved.
  - **#24 (Refresh-mid-stream truncates assistant turn):** Server-side: `_finish_chat_response` already tags `result["incomplete"]=True` on detected Code-Agent tail truncation and saves to history. Frontend: `loadChatHistory` now propagates `m.incomplete` into the rendered messages. Template renders an "(interrupted — try asking again)" italic pill under any assistant message with `incomplete=true`. Future refresh-mid-stream cases land here cleanly.
  - **#30 (Final ~1 line missing from visible message):** Double-scroll fix in the `chat_response` handler — calls `scrollChat()` immediately AND in `$nextTick(() => this.scrollChat())` so the freshly-pushed message reaches the DOM before the scroll target is computed. Previously the last line sometimes sat below the visible window.
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed. Live smoke: `curl /api/scratchpad` → `{sections:{}}`; `POST /api/notes {"text":"smoke note 31i"}` → 200 once, then 409 duplicate; `POST {...,allow_duplicate:true}` → 200; cleanup via DELETE confirmed.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

---

### [2026-05-17] Phase 31h — Unified face_state machine, idle/ambient suppression, fade + exit hint

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #26, #27, #28.
- **Category:** bug, ux, architecture
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31h)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#28 (web screensaver face ≠ OLED face, drift):** New `services/face_state.py` defines a `FaceState` singleton with the canonical `EXPRESSIONS` enum (idle, happy, surprised, sleepy, concerned, excited, thinking, speaking, listening, error, looking_around). `init_face_state(socketio)` is called at app boot. `_sync_expression` now routes every expression through `FACE.set(name)` which normalizes synonyms (yapping→speaking, sad→concerned, neutral→idle) and emits a `face_state` SocketIO event in addition to the legacy `expression` event. Frontend `socket.on('face_state')` flips `_faceStateAuthoritative` true on first receipt so legacy `status` + `expression` events stop fighting the unified source. Web canvas + OLED now derive from the same normalized expression simultaneously. **Partial-but-load-bearing fix:** the underlying visual fidelity gap (web canvas uses procedural face vs. OLED uses sprite) is documented but not closed — the state machine is now unified, the asset-level redesign is deferred.
  - **#26 (idle/ambient steals modal/audio/timer screen):** `_shouldSuppressAmbient()` checks for open modals (`showStatusDetail`, `tvPairing`, `showLyrics`, `showCameraOverlay`, `showSnapPreview`, `showAlarmSchedule`, `sceneEditing`), or a timer with `remaining <= 60`. `resetIdleTimer` re-schedules instead of entering ambient when suppression is active. `exitAmbient($event)` swallows the dismissing tap via `event.stopPropagation()` so it doesn't fall through to underlying UI.
  - **#27 (ambient entry/exit jarring, no hint):** Overlay now has 700ms ease-out enter + 300ms ease-in leave Alpine transitions. Permanent low-contrast "Tap to exit" hint pinned at bottom of overlay.
- **Verified:** `pytest tests/test_face_state.py tests/test_app_endpoints.py` → 40 passed (9 new face_state tests cover enum membership, normalize, synonyms, event emission, snapshot). BMO restarted, `/health` ok.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/services/face_state.py` (new), `bmo/pi/tests/test_face_state.py` (new), `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.
- **Deferred:** Full BMO-face visual redesign (canonical show-style proportions, rounded-corner eye sprites, shared keyframe atlas) — out of scope for one sub-phase, tracked separately in `BMO-SUGGESTIONS-LOG.md`. The state machine unification means a future asset-level redesign drops in without re-plumbing.

---

### [2026-05-17] Phase 31g — Music search Enter, refresh-rehydrate now-playing, volume live readout

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #18, #23, #32.
- **Category:** bug, ux
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31g)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#18 (Music search Enter doesn't submit):** Added an explicit `@keydown.enter.prevent="searchMusic()"` on the music-search input. The `@submit.prevent` on the form should have handled this, but some browsers/Alpine interactions with the `@input="searchMusicDebounced()"` listener swallow the synthetic submit. Explicit Enter handler removes the ambiguity.
  - **#23 (Refresh during playback loses now-playing row highlight):** `searchMusic()` now writes `bmo_music_last_query` + `bmo_music_last_mode` to localStorage. On init, after `fetchMusicState` resolves, `restoreMusicSearchIfPlaying()` re-executes the remembered search ONLY if a song is currently playing — so the user gets the highlighted row back without surprise-restoring an old search when nothing's playing.
  - **#32 (Volume slider has no live numeric readout while dragging):** Added a `<span x-text="(volumeLevels[cat] ?? 0) + '%'">` between the range slider and the numeric input. Explicit `step="1"`. The span reflects every `input` event so the value updates while dragging, not just on release. The numeric input next to it retains its purpose as the editable text field.
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed. BMO restarted, `/health` ok.
- **Touched files:** `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

---

### [2026-05-17] Phase 31f — Camera inline preview, /api/leds + /api/face aliases, Bluetooth MAC tail

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #17, #19, #20, #21.
- **Category:** bug, ux, api-surface
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31f)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#17 (BT scan duplicate "ONE" names with no MAC visible):** Backend already dedupes by address, but the frontend listing only showed `bt.name`. Both BT lists (Audio devices + Mic inputs sections) now display `··<last-4-of-MAC>` in a small dim font next to the name. Multiple devices named "ONE" become distinguishable: `ONE ··A6:B3` / `ONE ··12:34`.
  - **#19 (Camera Snap opens 405 tab):** `bmo.js:cameraSnap()` was opening `/api/camera/snapshot?download=1` in a new tab — that route is POST-only, so a GET returned 405. Now POSTs the snapshot and pops an inline modal over the camera overlay with `<img>` + Download/Close buttons. New `/api/camera/snapshot/last` GET endpoint serves the most-recent snapshot from `camera.last_snapshot_path` (tracked by `take_snapshot()`).
  - **#20 (Camera Describe fails silently):** `cameraDescribe()` previously caught any error into a generic "Could not describe scene". Now surfaces the backend's `error` field verbatim (e.g. "Describe failed: Gemini vision failed or you are offline") so the user can tell what went wrong.
  - **#21 (LED + face endpoints undiscoverable / 404 on /api/leds and /api/face):** Added `app.add_url_rule` aliases for `/api/leds`, `/api/leds/status`, `/api/leds/state`, `/api/leds/color`, `/api/leds/mode`, `/api/leds/brightness`, `/api/face/expression` (GET+POST). Existing singular `/api/led/*` + `/api/oled/*` paths retained for back-compat. Documented inline in `app.py` as the canonical surface for new integrators.
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed. Live: `curl /api/leds` returns `{ok:true, brightness:0, color:{...}, mode:"breathing", state:"ready"}`; `curl /api/face/expression` returns `{expression:"idle"}`; `/api/camera/snapshot/last` returns 404 when no snapshot exists (camera hardware absent on this Pi at restart — endpoint plumbing verified).
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/hardware/camera_service.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

---

### [2026-05-17] Phase 31e — Scene state sync, Controls hydration skeleton, weather freshness, sticky mini-player

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #13, #14, #15, #16.
- **Category:** bug, ux, hydration
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31e)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#13 (scene activation doesn't reflect in UI):** `services/scene_service.py:activate` / `deactivate` now emit `scene_change` BEFORE the slow `_apply_scene` work (which can take several seconds for LED/TV transitions). The emit payload includes the full `list_scenes()` so the client doesn't have to re-fetch. Frontend `socket.on('scene_change')` consumes the optional `data.scenes` array directly. The scene's active highlight now updates instantly.
  - **#14 (Settings/Controls toggles flicker to defaults on load):** Added `controlsLoaded` state field — flips true only after `fetchControlsData()` resolves. Controls tab opens with a 3-card pulsing skeleton + "Loading current settings…" line; the System Status tile (most prominent flicker target) is now gated on `controlsLoaded`. Partial fix — other Controls subsections still hydrate independently, but the visible-on-open content is no longer wrong.
  - **#15 (Home weather card renders inconsistently):** `weatherCardReady()` gates the full card render on having both temperature and icon (no more partial states with missing pieces). Skeleton card replaces it during load. New `weatherUpdatedAgo()` helper renders "just now" / "Xm ago" / "Yh ago" pinned to the top-right of the card, sourced from `_weatherFetchedAt` (set on both `weather_update` socket event + `fetchWeather()`).
  - **#16 (mini-player hidden on small viewports / music tab):** The bottom Now-Playing bar now shows on EVERY tab (including music) and uses `min-h-[3.5rem] shrink-0` so it never collapses under flex pressure. Previously gated on `tab !== 'music'` AND used `h-14` which got crushed when the main content was tall.
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed (no regressions). Live: BMO restarted, `/health` ok. Manual smoke deferred to 31j.
- **Touched files:** `bmo/pi/services/scene_service.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

---

### [2026-05-17] Phase 31d — TV pair flow safety, YouTube tile, _TV_WORKER path repair

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #11, #12. Discovered-while-testing: TV worker path constant pointed at a non-existent file, silently breaking ALL TV interactions.
- **Category:** bug, lifecycle, integration
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31d)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **Discovered bug — `_TV_WORKER` path:** `app.py:_TV_WORKER` resolved to `bmo/pi/tv_worker.py`, but the worker had been relocated to `bmo/pi/services/tv_worker.py`. `subprocess.Popen` spawned python with a missing script; the subprocess died immediately; `_tv_cmd` hung on `stdout.readline()` waiting forever. Fixed by updating the path to include `services`. Without this fix every other TV change below would be untested.
  - **#11 (pair flow loses state mid-handshake):** `services/tv_worker.py` `pair_start` now tears down any leftover `pairing_remote` before allocating a new one. New `pair_cancel` worker action + `app.py:api_tv_pair_cancel` route lets the user dismiss the PIN dialog cleanly — the route terminates the worker subprocess (the next `pair_start` respawns fresh), avoiding subprocess-pipe hangs. `pair_finish` now wraps the connect in try/except and resets `pairing_remote` on failure so retries work.
  - **#11 (frontend):** Cancel button in the PIN dialog now calls `tvCancelPairing()` which posts `/api/tv/pair/cancel` then clears local state. Previously the button just flipped `tvPairing=false` locally, leaving the worker dangling.
  - **#12 (YouTube tile no-op):** `TV_APPS["youtube"]` was `vnd.youtube://`, which `androidtvremote2.send_launch_app_command` doesn't handle. Replaced with `https://www.youtube.com/tv` (the canonical Android TV deeplink). `netflix` also updated for the same reason. Frontend `tvLaunch()` now surfaces non-OK responses + network errors as a toast (previously swallowed silently).
- **Verified:** `pytest tests/test_app_endpoints.py` → 31 passed (no regressions). Live: `curl POST /api/tv/pair/cancel` returns `{ok:true, message:"Pairing cancelled"}` (previously hung 30s+ on subprocess pipe). `curl POST /api/tv/launch {"app":"youtube"}` returns `{ok:true}` (vs. previous no-op).
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/services/tv_worker.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

---

### [2026-05-17] Phase 31c — IDE /file/create honors content, /folder/create endpoint, sandbox roots surfaced

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #8, #9, #10.
- **Category:** bug, data-loss, api-design
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31c)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#9 (file/create silently drops content):** `routes/ide.py:api_ide_file_create` now reads the `content` field, refuses silent clobber of an existing file (409), and returns `bytes_written` (UTF-8 byte count). The previous handler always opened the file with `f` then immediately closed it, leaving any provided body on the floor.
  - **#10 (folder-only create returns 500):** new `routes/ide.py:api_ide_folder_create` accepts trailing-slash paths cleanly. `is_dir=True` on `/file/create` still works for legacy callers; the dedicated `/folder/create` is the clean primitive.
  - **#8 (path-scheme inconsistency):** `/api/ide/tree` now embeds `sandbox_roots` (the resolved abs paths the blueprint will accept) and `resolved_path` in its response. New `/api/ide/sandbox/roots` returns just the roots for renderers that need a header tooltip. Windows-proxy responses keep the same shape with an empty `sandbox_roots` for consistency.
- **Verified:** `pytest tests/test_ide_blueprint.py` → 9/9 passed (file content, empty-create, clobber refusal, missing-path 400, unicode byte count, folder trailing-slash, folder idempotent, folder missing-path, sandbox-roots). Smoke: `curl /api/ide/sandbox/roots` returns `["/home/patrick/home-lab","/home/patrick/.bmo_ide_workspace","/tmp"]`; `curl POST /api/ide/file/create '{"path":"/tmp/x","content":"hello smoke test"}'` returns `bytes_written:16` (file lands in BMO's `PrivateTmp` namespace).
- **Touched files:** `bmo/pi/routes/ide.py`, `bmo/pi/tests/test_ide_blueprint.py` (new).

---

### [2026-05-17] Phase 31b — Calendar OAuth HTTPS, health circuit-breaker, CF Access banner, wifi/status slim

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #5, #6, #7, #33.
- **Category:** bug, oauth, monitoring, ux, surface-minimization
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31b)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#5 (`redirect_uri_mismatch`):** `api_calendar_auth_url` in `bmo/pi/app.py` now reads `X-Forwarded-Proto` and `X-Forwarded-Host` from the Cloudflare Tunnel and constructs an `https://bmo.mybmoai.work/...` redirect URI instead of `request.host_url` which returns `http://` (gevent terminates plain HTTP). **User action still required:** register that exact URI in the Google Cloud OAuth client's authorized-redirect list — code fix alone cannot do that.
  - **#6 (300+ consecutive failures on `google_calendar`):** `services/monitoring.py` gained a per-subsystem circuit-breaker (`_circuit_open` / `_circuit_record_failure` / `_circuit_record_success`). Backoff doubles each consecutive failure, capped at 1 hour. `_check_calendar_token` skips re-checking while the breaker is open, so the failure counter no longer climbs unbounded and the alert pipeline stops spamming.
  - **#6 (UI never sees critical):** `bmo/pi/web/static/js/bmo.js` polls `/api/health/full` every 30 s. The header pill (`healthPillClass()` + `healthSummary`) flips amber when `overall === 'critical' | 'warning'`, showing the failing subsystem name (`BMO ⚠ calendar`).
  - **#7 (CF Access expiry silently bricks page):** New `apiFetch()` wrapper in `bmo.js` detects `401/403 + text/html` (Cloudflare Access challenge body shape) and flips `connectionState='cf_expired'`. Template shows a non-dismissible amber banner with a one-click "reload to re-authenticate" button. Sustained `fetch` throw flips to `offline` with a rose banner.
  - **#33 (`/api/wifi/status` leaks BSSID/signal/channel):** `app.py` trims the public response to `{ssid, connected}` only. The full `_wifi_status()` shape (BSSID, signal, channel, IP, saved networks) moved behind `/api/wifi/status/detail`, used by the Settings tab.
- **Verified:** `pytest tests/test_calendar_auth_paths.py tests/test_monitoring.py tests/test_chat_speaker.py tests/test_app_endpoints.py` → 78 passed. Live: `curl /api/wifi/status` returns `{"connected":false,"ssid":""}`; `curl /api/wifi/status/detail` returns full diagnostics. BMO restarted clean.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/services/monitoring.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`, `bmo/pi/tests/test_calendar_auth_paths.py`, `bmo/pi/tests/test_monitoring.py`.

---

### [2026-05-17] Phase 31a — Chat integrity: speaker enum, plan event, Ollama fallback safety

- **Original QA bugs:** 2026-05-17 BMO QA report Problems #1, #2, #3, #4.
- **Category:** bug, data-integrity, model-routing
- **Domain:** bmo
- **Resolved by:** Claude Opus (Phase 31a)
- **Date resolved:** 2026-05-17
- **Resolution:**
  - **#1, #2 (chat attribution):** Added `_normalize_chat_speaker(speaker, source_voice)` in `bmo/pi/app.py`. The /api/chat HTTP route and the `chat_message` SocketIO handler both run incoming `speaker` through it before persisting. Voice-prefixed claims (`voice:<name>`) are downgraded to `text` unless the request body has `source_voice=True`, which only the voice pipeline sets. Enum expanded to include `text` + `system`; unknown values normalize to `unknown`.
  - **Frontend (#2 root cause):** `bmo/pi/web/static/js/bmo.js:sendChat` used to default `speaker` to `'gavin'` (the voice profile name) for every typed message. Now sends `speaker: 'text'` for typed input and only `voice:<profile>` when the user explicitly selects a player persona. The `/roll` slash-command path also updated.
  - **#3 (plan-mode "yes"):** Added dedicated `plan_approve` / `plan_reject` SocketIO events that route through `agent.chat()` with `speaker:'system'` and do NOT write a user turn to `recent_chat.json`. Frontend `approvePlan()` / `rejectPlan()` now emit those events instead of pushing a literal `"yes"` / `"no"` `chat_message`.
  - **#4 (D&D 404, model `bmo`):** Default local Ollama model changed from `bmo` (often unpulled) to `gemma3:4b` in `bmo/pi/agents/settings.py`; admins who pulled the custom `bmo` model can set `BMO_LOCAL_MODEL=bmo`. `_local_chat()` in `bmo/pi/agent.py` now catches `ollama.ResponseError(404)` and returns a human-readable hint ("model not pulled, run `ollama pull X` or check connectivity") instead of bubbling the bare 404.
- **Verified:** `pytest tests/test_chat_speaker.py tests/test_app_endpoints.py` — 40 passed (includes new SocketIO tests for `plan_approve` / `plan_reject`). Full suite: 781 passed, 6 skipped. Smoke: `curl POST /api/chat {"speaker":"voice:gavin"}` returned `speaker:"text"` confirming the normalizer downgrades spoofed voice claims.
- **Touched files:** `bmo/pi/app.py`, `bmo/pi/agent.py`, `bmo/pi/agents/settings.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/tests/test_chat_speaker.py` (new), `bmo/pi/tests/test_app_endpoints.py`.

---

### [2026-04-26] Test coverage tracker — `pytest-cov` + branch coverage with explicit production source list

- **Original severity:** low (suggestion: "Test coverage tracker: enable `pytest --cov=bmo/pi --cov-report=term --cov-report=html`")
- **Category:** future-idea (resolved), test, tooling
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-26
- **Resolution:** Wired pytest-cov with branch coverage and a production-only source list. Headline baseline: **2%** across ~18K production statements (honest — current test surface is just the DB-index regression tests + a couple smoke tests). No fail-threshold set on purpose; coverage is for navigation, not gating.
  - `bmo/pi/.coveragerc` (new) — `[run]` source list mirrors the complexity ratchet's SCOPE (`agent.py app.py cli.py state.py` + `agents/ bots/ hardware/ mcp_servers/ routes/ services/ wake/`); `branch = True`; `[report] exclude_lines` covers `pragma: no cover`, `raise NotImplementedError`, `if TYPE_CHECKING:`, `if __name__ == '__main__':`.
  - `bmo/pi/pytest.ini` — added a one-line pointer comment to `.coveragerc` and the recommended invocation.
  - `bmo/pi/requirements-test.in` — pinned `pytest-cov>=4.1`.
  - `.gitignore` — added `**/htmlcov/`, `**/.coverage`, `**/.coverage.*`, `**/coverage.xml`.
- **Why a separate `.coveragerc` and not `[coverage:*]` sections in `pytest.ini`:** coverage.py does NOT read `pytest.ini`. Initial attempt used `[coverage:run]` in pytest.ini; it was silently ignored (test files showed up in coverage data despite the `omit` list). `.coveragerc` is the canonical config file coverage.py looks for.
- **Why an explicit `source` list and not `source = .` + `omit`:** pytest-cov / coverage.py's `omit` glob matching against `tests/*` failed to filter test files when `source = .` was used (likely due to relative-vs-absolute path matching). An explicit allow-list is unambiguous and matches the same SCOPE the complexity ratchet uses, so the two tools agree on "what counts as production code."
- **Verified:** `venv/bin/python -m pytest tests/test_db_indexes.py --cov --cov-branch --cov-report=term` → 6 passed, coverage report shows ALL production modules tracked, NO `tests/` or `dev/` files in the report. HTML report writes to `htmlcov/index.html` (gitignored); raw `.coverage` data file gitignored.
- **Known cosmetic issue (not blocking):** at pytest exit when gevent has been imported by tests, coverage.py's atexit hook races with gevent's monkey-patch teardown and prints `ImportError: cannot import name 'sleep' from 'gevent'`. Tests pass; results are written; the trace is harmless. Workaround would be to opt out of gevent imports for the index tests' conftest, but that's out of scope.
- **Pairs with:** the complexity ratchet (`scripts/check-complexity.py` from yesterday's resolved entry). High-CC functions with 0% coverage are the highest-priority refactor-and-test targets — `app.py::init_services` (cc=38, 0% covered), `bots/discord_social_bot.py::_guesstheanime_cmd` (cc=45, 0% covered), etc. The two tools are complementary navigational tools.
- **Files:** `bmo/pi/.coveragerc` (new), `bmo/pi/pytest.ini` (pointer comment), `bmo/pi/requirements-test.in` (pinned pytest-cov), `.gitignore` (coverage artifacts).

---

### [2026-04-26] Cyclomatic-complexity ratchet for `bmo/pi` — per-function CC baseline + git-diff regression gate

- **Original severity:** low (suggestion: "Wire `radon` into the Pi pre-merge gate — fail PRs that drop maintainability index below baseline")
- **Category:** future-idea (resolved), debt, tooling, test
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-26
- **Resolution:** Implemented as **option (b) — ratchet**, not the originally-suggested absolute-threshold gate. The gate is "code can get better, never worse on touched files":
  - `bmo/pi/scripts/check-complexity.py` (new) — Python CLI. Diffs `radon cc --min=D --json` of git-touched .py files against a pinned baseline. Fails the gate iff a baseline D+ function's complexity went UP, OR a touched file gained a NEW D+ function.
  - `bmo/pi/.complexity-baseline.json` (new) — committed snapshot, 14 files / 32 D+ functions. Worst offenders today: `bots/discord_social_bot.py::_guesstheanime_cmd` (cc=45), `_guessthegame_cmd` (cc=39), `app.py::init_services` (cc=38), `services/monitoring.py::get_status` (cc=36), `services/timer_service.py::_load_alarms` (cc=33).
  - `bmo/pi/requirements-test.in` — pinned `radon>=6.0` (was already installed ad-hoc; now properly tracked).
- **Why ratchet over absolute threshold:** an absolute "fail any function above C(15)" gate would block every PR until the existing offenders are refactored — useless. The ratchet preserves the freedom to commit while preventing new debt; net-positive refactors land via `--update-baseline`.
- **Why per-function CC and not radon's MI:** `radon mi` saturates at 0.00 for `app.py` / `voice_pipeline.py` / `discord_social_bot.py` (the formula's domain doesn't fit dense files), making MI useless as a regression metric. Per-function CC is precise.
- **Touched-file detection:** `git diff --name-only $BASE_REF...HEAD` with `BASE_REF` resolution: `--base-ref` flag → `BASE_REF` env → `origin/$GITHUB_BASE_REF` (Actions) → `origin/master`. With `--all-files`, every .py under SCOPE is checked.
- **SCOPE:** top-level `agent.py app.py cli.py state.py` + dirs `agents/ bots/ hardware/ mcp_servers/ routes/ services/ wake/`. Excluded: `tests/ dev/ kiosk/ ide_app/ scripts/ web/` — non-production source or templates.
- **Verified:**
  - `--update-baseline` writes 32 D+ functions across 14 files, sorted-key JSON for stable diffs.
  - `--all-files` against current code → "OK - 89 touched file(s); no D+ regressions."
  - Manually mutated baseline (lowered `init_services` to cc=20, removed `api_status_summary`) → both rules fired correctly: regression message + new-function message. Baseline restored via `--update-baseline`.
- **CI wiring:** out of scope for this entry (deferred to whenever the Pi-CI workflow lands). The script is callable today as `venv/bin/python scripts/check-complexity.py`; once a workflow exists, one shell line wires it in.
- **Files:** `bmo/pi/scripts/check-complexity.py` (new), `bmo/pi/.complexity-baseline.json` (new), `bmo/pi/requirements-test.in` (radon pinned).

---

### [2026-04-25] `VoicePipeline._speak_volume` AttributeError on first TTS call — uninitialized attribute crashed every fresh boot's startup pre-warm

- **Original severity:** medium (boot-time crash on a non-fatal code path; surfaced as an `AttributeError` traceback in `journalctl -u bmo` on every restart, but caught by an outer except so the service stayed alive)
- **Category:** bug
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Symptom:** Every BMO restart printed `AttributeError: 'VoicePipeline' object has no attribute '_speak_volume'` from `services/voice_pipeline.py:1680` during the TTS pre-warm. Spotted while restarting the service to apply an unrelated CSP fix.
- **Root cause:** `_speak_volume` is mutated by the kiosk volume slider's WebSocket handler. Until the slider was moved at least once after boot, the attribute didn't exist on the `VoicePipeline` instance. Two readers handled this differently:
  - `_play_audio` (line 1867) used defensive `getattr(self, "_speak_volume", None)` — safe.
  - `speak()` (line 1680) used direct `self._speak_volume` to capture `original_volume` for the save/restore — crashed.
  - Initial-state setup at line 964 explicitly noted *not* to reset the attribute ("set by the volume slider and should persist") — author was aware of the lifecycle but missed that no initializer existed in `__init__`.
- **Fix:** `bmo/pi/services/voice_pipeline.py:196` — added `self._speak_volume = None` next to the other voice settings in `__init__`. `None` is the canonical "no per-call override" sentinel that all downstream readers (`_play_audio`, the save/restore in `speak()`) already handle correctly, so no other code needed to change.
- **Verified:** Service `active` after restart, `journalctl --since "20 seconds ago" | grep AttributeError` returns nothing, the alarm-reminder TTS played end-to-end (`Cache hit for: Hey! Don't forget: Saved Alarm! → Playing 18284 bytes via ffplay → Playback done (3.2s)`) — that is the exact code path that previously crashed.
- **Lesson:** When a class has multiple readers of an attribute and only some are defensive (`getattr`-with-default), it is a smell that the attribute lacks an `__init__` initializer. Either initialize once and read direct everywhere, or always read via `getattr(..., default)`. Mixing the two leaves a latent NPE-style bug for the unprotected reader.
- **Files touched:** `bmo/pi/services/voice_pipeline.py` (one-line addition + 2-line comment in `__init__`)

---

### [2026-04-25] EXPLAIN QUERY PLAN regression tests for `bmo_social.db` indexes — drift detection for the index fixpack

- **Original severity:** low (suggestion: "Add `EXPLAIN QUERY PLAN` test for `bmo_social.db` reminder polling — guard against future regressions")
- **Category:** future-idea (resolved), performance, test
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Resolution:** Created `bmo/pi/tests/test_db_indexes.py` with 6 EXPLAIN QUERY PLAN tests that lock in the index work from the prior fixpack. Each test:
  1. Spins up a fresh SQLite at a tmp path
  2. Calls the bot's actual `_get_db()` so schema + indexes are created exactly the way the live bot creates them (drift-detection — if a future PR drops an index from the schema, the test fails)
  3. Runs `EXPLAIN QUERY PLAN` for the actual production query string (line numbers cited in test docstrings)
  4. Asserts the expected index name appears in the plan
- **Coverage:**
  - `test_reminder_poll_uses_index` — `idx_reminders_fire_at` for the per-minute reminder loop
  - `test_xp_leaderboard_uses_xp_index` — `idx_xp_data_xp` for `ORDER BY xp DESC LIMIT 10`
  - `test_server_play_count_uses_guild_index` — `idx_play_history_guild_played` (leading column) for `WHERE guild_id = ?`
  - `test_server_top_tracks_uses_guild_index` — same composite index for the GROUP BY
  - `test_user_in_guild_play_count_uses_some_index` — accepts either play_history index for `guild_id + user_id`
  - `test_all_documented_indexes_exist` — schema-sanity guard (catches "index dropped from `_get_db()` but query still depends on it")
- **Side fix:** While surveying production queries, discovered the previously-added `idx_xp_data_level` was speculative — actual leaderboard query at `bots/discord_social_bot.py:5794` uses `ORDER BY xp DESC`, not `level`. Added `idx_xp_data_xp ON xp_data(xp DESC)` to `_get_db()` schema. Old `idx_xp_data_level` retained — cheap, may matter for a future level-sorted view.
- **Verified:** `venv/bin/python -m pytest tests/test_db_indexes.py -v` → 6 passed
- **Files:** `bmo/pi/tests/test_db_indexes.py` (new), `bmo/pi/bots/discord_social_bot.py` (added xp index + comment update)

---

### [2026-04-25] BMO bot services: tighten `StartLimitBurst=5` + `failed`-state alert message in monitoring

- **Original severity:** low (suggestion: "Replace ad-hoc systemd `Restart=on-failure` + `RestartSec=10` with proper `BurstLimit` + journal-watch alert")
- **Category:** future-idea (resolved), debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed; `pytest tests/test_monitoring*.py` 36 passed; bmo `active` after restart; `systemctl show -p StartLimitBurst` returns 5 for both bot services.
- **Resolution shape:**
  1. **`kiosk/bmo-dm-bot.service` + `kiosk/bmo-social-bot.service`** — `StartLimitBurst=10 → 5` (5 restarts in 5 min, then systemd marks the service `failed` and stops auto-retrying). The earlier sandbox-hardening sweep had already added the burst limit at value 10; this sweep tightens to the original suggestion's value of 5.
  2. **`/etc/systemd/system/bmo-{dm,social}-bot.service`** — synced from repo, `daemon-reload` applied, live `StartLimitBurst=5` confirmed.
  3. **`services/monitoring.py:_check_systemd_services()`** — already polled + alerted on state changes via existing `_emit_alert()` + `_send_discord_if_allowed()` (state-change dedupe). Added a state-specific message for `state == "failed"`:
     - Generic states (`activating`, `inactive`, etc.): `⚙️ {label} is {state} — run: sudo systemctl restart {svc}` (existing).
     - **`failed` state** (new): `🛑 {label} hit StartLimitBurst (5 restarts in 5 min) and stopped auto-retrying — run: sudo systemctl reset-failed {svc} && sudo systemctl restart {svc}`.
     - **Bot services bumped to `Severity.CRITICAL`** when in `failed` state (vs WARNING for transient `activating`) — louder Discord ping.
- **What changed about the alerting flow:** The existing dedupe (`_send_discord_if_allowed`'s state-change tracking) means flapping services don't spam Discord — exactly one ping per state transition. So a service that goes `running → activating → failed` produces one Discord notification (for `failed`); subsequent polls while still failed don't re-alert.
- **Smoke-test path (manual, not run in this session):** `sudo systemctl edit bmo-dm-bot.service` → add `ExecStart=/bin/false` override → wait 5 × 10s = 50s for systemd to hit the burst limit → service goes `failed` → BMO's monitoring loop polls within 60s → Discord webhook fires with the 🛑 message. Recovery: revert override, `sudo systemctl daemon-reload && sudo systemctl reset-failed bmo-dm-bot && sudo systemctl restart bmo-dm-bot`.
- **Files touched:** `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`, `/etc/systemd/system/bmo-{dm,social}-bot.service` (live sync), `bmo/pi/services/monitoring.py` (state-specific message + severity bump).

---

### [2026-04-25] BMO `flask-limiter` per-IP rate limits on cost-sensitive routes (chat, dnd-load, narrate)

- **Original severity:** medium (suggestion: "Add `flask-limiter` for per-IP rate limits on the LLM-routing endpoints")
- **Category:** future-idea (resolved), security, performance
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed; bmo `active` after restart; live LAN curl returns `X-RateLimit-Limit: 30, Remaining: 29` headers; spam test triggered HTTP 429 at exactly request 31 (the 30/min cap); localhost curls have NO X-RateLimit headers (exempt as designed).
- **Resolution shape:**
  1. **Dep added:** `flask-limiter` to `requirements.in` + `requirements-ci.in`. Re-locked both with `pip-compile --extra-index-url https://download.pytorch.org/whl/cpu`. Result: `flask-limiter==4.1.1` + `limits==5.8.0` + 3 transitive deps installed.
  2. **Limiter setup in `app.py`** (after the security/cache headers, before the route handlers):
     - Module-level `limiter = Limiter(key_func=_rate_limit_key, default_limits=[BMO_DEFAULT_RATE_LIMIT (default 120/min)], default_limits_exempt_when=_is_localhost_request, storage_uri="memory://", headers_enabled=True, swallow_errors=True)`.
     - `_rate_limit_key()` returns the remote IP for non-localhost, sentinel `__localhost_exempt__` for `127.0.0.1` / `::1` / `localhost`.
     - `_is_localhost_request()` short-circuits ALL limits for localhost via `default_limits_exempt_when` — kiosk + bot internal loopback never trip a 429.
     - `swallow_errors=True` — if the in-memory storage barfs (rare), allow the request rather than 500.
  3. **Per-route limits** (env-overridable):
     - `RATE_LIMIT_CHAT = "30 per minute"` → `@limiter.limit(RATE_LIMIT_CHAT)` on `/api/chat`
     - `RATE_LIMIT_DND_LOAD = "15 per minute"` → on `/api/dnd/load`
     - `RATE_LIMIT_NARRATE = "30 per minute"` → on `/api/discord/dm/narrate`
     - Default 120/min covers everything else (including blueprint routes like `/api/ide/*`).
  4. **Pairs with existing protections:**
     - `MAX_CHAT_MESSAGE_LEN=16384` caps per-request size → bounds *cost per request*
     - `BMO_API_KEY` middleware (when set) gates the front door → bounds *who can call*
     - flask-limiter caps requests-per-minute → bounds *how often each caller can call*
  5. **What's NOT decorated (intentional):**
     - `/api/ide/jobs` POST — already has the default 120/min limit + IDE blueprint goes through the existing `_ide_safe_path` jail. Adding stricter per-route limits there would have required a circular-import workaround in the blueprint module.
     - `/api/calendar/*`, `/api/music/*` — read-mostly + cached + don't hit billable LLMs.
- **Configuration knobs (env vars, all optional):**
  - `BMO_DEFAULT_RATE_LIMIT="120 per minute"` (catch-all)
  - `BMO_CHAT_RATE_LIMIT="30 per minute"`
  - `BMO_DND_LOAD_RATE_LIMIT="15 per minute"`
  - `BMO_NARRATE_RATE_LIMIT="30 per minute"`
- **Files touched:** `bmo/pi/requirements.in`, `bmo/pi/requirements-ci.in`, `bmo/pi/requirements.txt`, `bmo/pi/requirements-ci.txt`, `bmo/pi/app.py` (Limiter setup + 3 `@limiter.limit` decorators).

---

### [2026-04-25] BMO `pip-tools` migration — `requirements.in` / `requirements-ci.in` / `requirements-test.in` + locked `*.txt` outputs

- **Original severity:** low (suggestion: "Migrate to `pip-tools` for deterministic transitive pins")
- **Category:** future-idea (resolved), security, debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed, 6 skipped; bmo + bots all `active` after restart; `/health` ok; voice-deps smoke test passed (`discord.py 2.7.1 + PyNaCl 1.6.2 + SecretBox.encrypt()` works).
- **Resolution shape:**
  1. **Three `.in` files** with top-level deps + comments: `requirements.in`, `requirements-ci.in`, `requirements-test.in`. Edit-and-recompile is the new dep-update workflow.
  2. **Three locked `.txt` outputs** generated via `pip-compile --extra-index-url https://download.pytorch.org/whl/cpu -o requirements.txt requirements.in` (analogous for ci + test). Each has every transitive pinned to an exact version with comments showing which top-level pulled it in (e.g. `# via resemblyzer`, `# via -r requirements.in`).
  3. **CPU-only torch resolution** — the `--extra-index-url` flag pulls `torch==2.11.0+cpu` from PyTorch's CPU wheels index instead of the default PyPI which ships CUDA-laden wheels. Without this, the lock would re-introduce the 4.5+ GB nvidia stack on Pi (resolved-issue from prior sweeps).
  4. **`setup-bmo.sh` + `install-venv.sh`** unchanged in invocation — they still do `pip install torch --index-url https://download.pytorch.org/whl/cpu` first, then `pip install -r requirements.txt`. The locked file is what gets read.
  5. **`docs/SETUP.md` updated** with a new "Dependency management (pip-tools)" subsection: file layout, edit-and-recompile workflow, monthly `pip-compile --upgrade` for surface CVEs.
- **Pre-existing constraint conflict surfaced + resolved:** `discord.py[voice]` 2.6+ pins `PyNaCl < 1.6` (conservative upstream cap), conflicting with our `PyNaCl >= 1.6.2` security pin. The live venv had both coexisting because pip's permissive install layered them — but pip-tools' strict resolver refused to lock that state. Fix: drop the `[voice]` extra; declare `discord.py>=2.6,<3.0` + `PyNaCl>=1.6.2` separately. The extra only encoded `PyNaCl<1.6` (we already explicit) + a README note about libopus (system C lib, installed via apt). Voice still works because discord.py only uses `nacl.secret.SecretBox` whose API didn't change between 1.5 → 1.6 — verified by SecretBox round-trip smoke test.
- **piwheels name-normalization quirk also defeated:** `discord.py` (dot) → `discord-py` (dash) name-normalization on piwheels can cause pip-compile to resolve to the abandoned `discord-py 0.9.2` package. The explicit `>=2.6,<3.0` version pin defeats this fallback because 0.9.2 doesn't satisfy.
- **Files touched:**
  - new: `bmo/pi/requirements.in`, `bmo/pi/requirements-ci.in`, `bmo/pi/requirements-test.in`
  - regenerated: `bmo/pi/requirements.txt` (404 lines, 153 packages), `bmo/pi/requirements-ci.txt` (434 lines, ~150), `bmo/pi/requirements-test.txt` (64 lines, 24)
  - updated: `bmo/setup-bmo.sh` (added pip-tools comment block), `docs/SETUP.md` (new subsection)
- **Wins (now realized):**
  - Reproducible installs across machines — every transitive pinned to an exact version.
  - When a transitive dep gets a CVE, pinning it is one-line in `requirements.in` instead of grafting onto an opaque list.
  - Generated comments make "why is X in my venv?" greppable (`grep "via" requirements.txt | grep <dep>`).
  - `pip-compile --upgrade` once a month surfaces any new CVEs as version bumps in the diff.

---

### [2026-04-25] BMO shared-state consolidation — `bmo/pi/state.py` `AppState` singleton

- **Original severity:** medium (suggestion: "Consolidate global mutable state behind an `AppState` class")
- **Category:** future-idea (resolved), debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed, 6 skipped; bmo + bots all `active` after restart; `/health`, `/api/notes`, `/api/ide/jobs`, `/api/chat/history` all respond correctly through the new singleton.
- **Resolution shape:**
  1. **New module `bmo/pi/state.py`** — single `AppState` dataclass with `STATE = AppState()` singleton. Field categories:
     - **Locks:** `chat_lock`, `notes_lock`, `tv_media_lock`, `tv_proc_lock`, `ide_jobs_lock` (all gevent-aware via `monkey.patch_all`).
     - **Collections:** `notes_list`, `tv_media_cache`, `ide_jobs`, `win_proxy_pending`.
     - **Single-value state:** `ide_job_counter`, `current_running_job_id`, `win_proxy_sid`.
  2. **`app.py`** migrated — every `_chat_lock`, `_notes_list`, `_notes_lock`, `_tv_media_cache`, `_tv_media_lock`, `_tv_proc_lock` reference rewrites to `STATE.<name>`. 44 STATE.* references in app.py. Old global definitions replaced with comments pointing to `state.STATE`. `global` declarations stripped (attribute reassignment on the singleton doesn't need `global`).
  3. **`routes/ide.py`** migrated — every `_ide_jobs`, `_ide_jobs_lock`, `_ide_job_counter`, `_current_running_job_id`, `_win_proxy_sid`, `_win_proxy_pending` rewrites to `STATE.<name>`. 48 STATE.* references in routes/ide.py.
  4. **What stays in module-local globals (intentional):**
     - **Singleton service objects** (`_terminal_mgr`, `_file_watcher` in routes/ide.py; `agent`, `voice`, `weather`, `music`, etc. in app.py) — these are lazy-initialized service handles, not "state."
     - **TV singletons** (`_tv_remote`, `_tv_loop`, `_tv_proc`, etc.) — TV-specific; will move to `routes/tv.py` when that blueprint extracts.
     - **App config** (`MAX_CHAT_MESSAGE_LEN`, `BMO_API_KEY`, `ALLOWED_CHAT_SPEAKERS`) — env-var-derived constants live next to handlers that use them.
- **Wins (now realized):**
  - Lock discipline is pattern-matchable in code review: "did this handler take `STATE.<X>_lock` before mutating `STATE.<X>`?"
  - Future blueprint extractions (`routes/chat.py`, `routes/calendar.py`, etc.) `from state import STATE` instead of growing back the same globals — exactly what `routes/ide.py` would have needed if I'd done blueprint split AFTER state consolidation.
  - Tests can mock `STATE` or instantiate fresh `AppState()` per-test instead of monkey-patching module globals.
  - Single grep for `STATE.` shows every shared-state touch site.
- **Pairs with:** the in-progress blueprint refactor (suggestion above) — every future blueprint extraction pulls from `STATE` instead of duplicating globals.
- **Files touched:** `bmo/pi/state.py` (new, 78 lines), `bmo/pi/app.py` (44 STATE.* refs), `bmo/pi/routes/ide.py` (48 STATE.* refs).

---

### [2026-04-25] BMO `app.py` Flask-blueprint refactor — first split: `routes/ide.py` (~1300 lines extracted)

- **Original severity:** medium (suggestion: "Refactor `app.py` (5596 lines) into Flask blueprints")
- **Category:** future-idea (resolved partial — first blueprint of 7), debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed, 6 skipped; bmo service `active` after restart; live IDE endpoints respond correctly (`/api/ide/tree`, `/api/ide/jobs`, `/api/ide/git/status`, `/api/ide/git/checkout` with shell-injection payload still rejected, path-jail still blocks `/etc`).
- **Resolution shape:**
  1. **New module `bmo/pi/routes/ide.py`** (1403 lines) houses ALL `/api/ide/*` HTTP routes plus the 9 IDE-related SocketIO event handlers (terminal_open/input/resize/close, ide_watch_file/unwatch_file/agent_diff_response, win_proxy_register/response).
  2. **Blueprint mounted under `url_prefix="/api/ide"`** — route paths inside the file are relative (`/tree`, `/file/read`, `/git/commit`, etc.). Mechanically rewritten by regex from `@app.route("/api/ide/...")` to `@ide_bp.route("/...")`.
  3. **Globals + helpers moved with the routes**: `_IDE_ALLOWED_ROOTS`, `_ide_safe_path`, `_safe_repo`, `_terminal_mgr` + `_get_terminal_mgr`, `_file_watcher` + `_get_file_watcher`, `_win_proxy_sid`, `_win_proxy_pending`, `_ide_jobs` + `_ide_jobs_lock` + `_ide_job_counter`, `_save_ide_jobs` / `_load_ide_jobs`, the per-job lock helpers (`_job_update`, `_job_append`, `_job_get`), `_LANG_MAP` + `_detect_language`, `_proxy_to_windows`.
  4. **`register_ide(flask_app, socketio_obj, agent_obj)`** wires it up — called from `app.py` after `init_services()` runs (when `agent` is live). Stamps module-level `socketio` references and registers the blueprint + the 9 SocketIO handlers (which live inside the registration function so they close over the live socketio).
  5. **`cleanup_client_session(sid)`** exposed for `app.py:on_disconnect` — releases per-client terminal sessions + Windows-proxy registration without app.py needing to know the IDE module's internals.
  6. **`_resolve_agent()`** late-binds `app.agent` at request time — avoids the import-order trap where the blueprint module loads before `init_services` populates `agent`.
- **app.py size:** 5903 → 4596 lines (–22%, –1307 lines).
- **What's left (deferred — opportunistic):** the other 6 blueprints (calendar, music, tv, chat, system, realtime) per the table in the original suggestion. The pattern is now established so each successive split is easier; the choice of which to extract next is driven by which area is being touched.
- **Files touched:** `bmo/pi/routes/__init__.py` (new, empty), `bmo/pi/routes/ide.py` (new, 1403 lines), `bmo/pi/app.py` (1307 lines removed + 6 lines added: import + register_ide call + on_disconnect simplified to call cleanup_client_session)

---

### [2026-04-25] BMO structured-logging shim — `services/bmo_logging.py` + sweep of app.py + 11 services/agents (~404 prints → log calls)

- **Original severity:** medium (suggestion: "Add structured-logging shim to replace 490 `print()` calls")
- **Category:** future-idea (resolved), debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed, 6 skipped; bmo + bots all `active` after restart; `journalctl -u bmo` shows structured records (`2026-04-25 ... [INFO] [bmo] ...`); `BMO_LOG_LEVEL=WARNING` smoke-tested — INFO records suppressed.

**Resolution shape:**

1. **Shim** at `bmo/pi/services/bmo_logging.py`. ~95 lines. `get_logger(name)` returns a configured stdlib logger:
   - Level from `BMO_LOG_LEVEL` env (`DEBUG | INFO | WARNING | ERROR`), default `INFO`.
   - Optional rotating file handler via `BMO_LOG_FILE=...` (10 MB × 5, WARNING+ only).
   - Optional JSON formatter via `BMO_LOG_FORMAT=json` for Loki / Vector shipping (uses a small `_JsonFormatter` class).
   - Idempotent — re-imports / hot-reloads return the same configured logger; no duplicate handlers.
   - `propagate=False` so root-logger handlers (Flask / SocketIO sometimes attach one) don't double-emit.

2. **Migration sweep across the highest-print files**:

   | File | print() before | log calls now | Notes |
   |---|---|---|---|
   | `app.py` | 157 | 104 info + 50 exception + 3 multi-line manually rewritten | logger name `bmo` |
   | `services/voice_pipeline.py` | ~110 | 83 info + 25 exception + 2 warning | name `voice_pipeline` |
   | `services/scene_service.py` | 29 | 19 info + 10 exception | |
   | `services/music_service.py` | 26 | 17 info + 8 exception + 1 warning | |
   | `services/audio_output_service.py` | 24 | 14 info + 6 exception + 4 warning | |
   | `services/notification_service.py` | 16 | 7 info + 8 exception + 1 warning | |
   | `services/monitoring.py` | 14 | 6 info + 7 exception + 1 warning | |
   | `services/build_rag_indexes.py` | 12 | 12 info | |
   | `services/reauth_calendar.py` | 12 | 10 info + 2 warning | |
   | `agents/mcp_client.py` | 17 | 11 info + 2 exception + 4 warning | |
   | `agents/orchestrator.py` | 5 | 4 info + 1 exception | |
   | `agents/router.py` | 1 | 1 exception | |

   Total migrated: **404 sites** across 12 files.

3. **Pattern conversions**:
   - `print(f"[bmo] X")` → `log.info(f"[bmo] X")`
   - `except Exception as e: print(f"... ({e})")` → `log.exception("...")` (drops `{e}` since logging captures the stack automatically — the traceback is now attached, not lost)
   - `print(f"[bmo] X failed: {e}")` (heuristic match on "error"/"failed"/"failure" in the message) → `log.warning(...)`
   - `flush=True` and `file=sys.stderr` kwargs stripped (logging handles flushing per-record)

4. **What's left:** ~80 `print()` calls remain in lower-priority files (`agents/dnd_dm.py`, `agents/calendar_agent.py`, etc., and the `dev/` tooling). Those are opportunistic-migration: touch a file → migrate its prints in the same PR. The shim is in place, the pattern is established.

**Live behavior wins:**
- `BMO_LOG_LEVEL=WARNING systemctl edit bmo` — silences chatty INFO firehose for non-debug operation.
- `except Exception as e:` blocks that previously printed `f"failed: {e}"` and lost the stack trace now produce real `log.exception` records → traceback in `journalctl -u bmo`.
- `BMO_LOG_FORMAT=json` flips to one-JSON-per-line for future Loki / Vector shipping with no code changes.
- Module-tagged logger names (`[voice_pipeline]`, `[audio_output_service]`, etc.) — easy `grep` filtering by subsystem.

**Files touched:**
- `bmo/pi/services/bmo_logging.py` (new)
- `bmo/pi/app.py` (157 print → 104 log.info + 50 log.exception + 3 hand-rewritten multi-line calls)
- 11 services/agents in the table above

**Related entries:** Replaces the active suggestion `BMO-SUGGESTIONS-LOG.md` "Add structured-logging shim" + the pre-existing issue `BMO has 490 print() calls in production code` (now substantially reduced; remaining ~80 sites tracked as opportunistic).

---

### [2026-04-25] BMO `_ide_jobs` per-key write race — full fix (per-job RLocks + helpers)

- **Original severity:** medium (was the partial-fix entry left in active log)
- **Category:** bug, debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 746 passed, 6 skipped; bmo + bots all `active` after restart.
- **Resolution:** Each new IDE job now stores a `threading.RLock()` at `_ide_jobs[job_id]["_lock"]`. Three small helpers in `app.py` — `_job_update(job_id, **fields)`, `_job_append(job_id, list_field, item)`, `_job_get(job_id, key, default)` — wrap the per-job lock around every read/write so the agent task body's mutations never tear, while the lock is held only for the duration of the dict op (not across `agent.dispatch_tool` calls — no deadlock risk). Replaced 12 raw `_ide_jobs[job_id][...]= / .append(...)` sites in `_run_job` and the cancel/done/failed paths with helper calls. `api_ide_jobs_delete` now does `pop` under the global `_ide_jobs_lock`.

### [2026-04-25] BMO deep-scan fixpack — IDE security, services/data split-brain, /api/chat caps, security headers, race locks, deprecations, DB indexes, str(e) leakage

- **Original severity:** mixed (high / medium / low — 11 BMO entries + several mirrored security entries)
- **Category:** bug, config, security, perf, debt, docs
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25
- **Verified:** `pytest tests/` 744 passed, 6 skipped; `bmo bmo-dm-bot bmo-social-bot` all `active`; live curl probes confirm path-jail / oversize-rejection / shell-injection-blocked / security-headers-present
- **Resolution summary (per source entry):**
  1. **Six services split-brain (HIGH)** — `services/timer_service.py:175`, `services/voice_pipeline.py:81,325`, `services/audio_output_service.py:14`, `services/scene_service.py:12`, `services/notification_service.py:23`, `services/personality_engine.py:16-17` all rewrote `os.path.join(os.path.dirname(__file__), "data", ...)` to `os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", ...)` — resolves to canonical `bmo/pi/data/`. Live data migrated from `services/{config,data}/` to canonical (mtime-aware: services-newer wins). Stale `services/{config,data}/` directories removed. (`personality_engine` now uses its existing top-level `DATA_DIR` for QUIPS_FILE / AT_QUOTES_FILE.)
  2. **/api/ide/file/{read,write,create,delete,rename,edit,tree} arbitrary path access (HIGH security)** — added `_ide_safe_path()` helper at `app.py` near the IDE-Tab-API marker; realpath-jail to `~/home-lab/`, `~/.bmo_ide_workspace`, `/tmp`. Each handler returns 403 outside the jail. Verified with `curl POST /api/ide/file/write {"path":"/etc/foo"...}` → 403.
  3. **/api/ide/git/{commit,checkout,push,pull,fetch,stage,unstage,log,diff,branches,stash,branch/{create,delete}} shell injection (HIGH security)** — added `git_command_args(args, repo_path)` to `dev/dev_tools.py` (subprocess array form, `shell=False`, same destructive-op confirmation logic). Replaced every f-string-interpolated `git_command(...)` call site in `app.py` with the array form. `repo` arg now path-jailed via `_safe_repo`/`_ide_safe_path`. Each handler validates branch / path / index args (no leading `-`). Verified: `curl POST /api/ide/git/checkout {"branch":"; echo PWNED ;"}` returns `pathspec '; echo PWNED ;' did not match any file(s)` — git treats it as a literal pathspec, no shell expansion.
  4. **`_notes_list` race (MEDIUM)** — added `_notes_lock`. Every read/append/list-comprehension-rebuild in `api_notes` / `api_notes_create` / `api_notes_update` / `api_notes_delete` / `_load_notes` / `_save_notes_locked` is now under the lock.
  5. **`_tv_media_cache` race (LOW)** — added `_tv_media_lock`. All four `_tv_media_cache.update(...)` sites + the cache-read at top of `_get_tv_media_title` and final return are under the lock.
  6. **`_ide_jobs` iteration race (MEDIUM, partial)** — `api_ide_jobs_list` now snapshots `list(_ide_jobs.items())` under `_ide_jobs_lock` before iterating. Per-key writes inside the agent task body are NOT yet wrapped in lock (would risk deadlock if held during agent.dispatch_tool calls); a follow-up entry retains the broader audit.
  7. **`/api/chat` unbounded message + speaker spoof (MEDIUM security/bug)** — added `MAX_CHAT_MESSAGE_LEN` (env override `BMO_MAX_CHAT_MESSAGE_LEN`, default 16384) and `ALLOWED_CHAT_SPEAKERS` allowlist (`{player,dm,discord,kiosk,user,unknown}`). Oversize → 413. Spoofed speaker → coerced to `"unknown"`. Verified: `curl POST /api/chat {"message":"x"*17000}` → 413.
  8. **`/api/dnd/load` path traversal (MEDIUM security)** — added `_safe_dnd_path()` realpath-jail to `~/home-lab/bmo/pi/data/` and `~/home-lab/dnd-app/src/renderer/public/data/`. Every path in `char_paths` + `maps_dir` validated; oversized list (>32 chars paths) rejected. Verified: `curl POST /api/dnd/load {"characters":["/etc/passwd"]}` → 403.
  9. **Flask security headers (MEDIUM security)** — `_cache_policy` after-request now adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`, and a `Content-Security-Policy` for `text/html` responses (allows `cdn.jsdelivr.net` + `cdn.socket.io` for the IDE template; `'unsafe-inline'` retained for Alpine.js `@click=` handlers). Verified via `curl -I http://localhost:5000/`.
  10. **`MAX_CONTENT_LENGTH` cap (LOW)** — `app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("BMO_MAX_REQUEST_SIZE", str(32*1024*1024)))` — Flask now rejects request bodies above 32 MB before buffering.
  11. **`datetime.utcnow()` deprecation (MEDIUM)** — `services/campaign_memory.py:114` and `dev/ai-temp/purge_channel.py:66` rewritten to use `datetime.now(timezone.utc)` + `fromtimestamp(..., tz=timezone.utc)` — produces aware datetimes, future-proof against Python 3.13+ removal.
  12. **`bmo_social.db` missing indexes (MEDIUM)** — `bots/discord_social_bot.py:_get_db()` now creates `idx_play_history_guild_played`, `idx_play_history_user_played`, `idx_xp_data_level`, `idx_reminders_fire_at` on first connect (idempotent `CREATE INDEX IF NOT EXISTS`). Existing DBs gain the indexes on next bot start.
  13. **`str(e)` info leakage (MEDIUM-low security)** — sed-replaced 25 of the worst sites (`return jsonify({"error": str(e)}), 500`) with `print(f"[bmo] api error: {e!r}", flush=True); return jsonify({"error": "internal server error"}), 500`. Exception detail now reaches `journalctl -u bmo` (full repr), client gets generic. Remaining ~23 `str(e)` sites use 4xx codes (user-actionable validation errors) and were left intact.
  14. **`web/static/ide/ide.js` innerHTML XSS (MEDIUM security)** — added `escapeHtml()` helper at top of the IDE IIFE. Wrapped 9 `innerHTML = \`...${userField}...\`` sites (file tree node name, tab name, terminal label, git branch, git change status+path, git log hash, search results file name + line, quick-open file name + path).
  15. **`web/templates/ide.html` CDN scripts no SRI (MEDIUM security)** — added `integrity="sha384-..." crossorigin="anonymous"` to all 5 CDN `<script>` tags (xterm, addon-fit, socket.io, marked, monaco-editor loader). Hashes computed with `curl | openssl dgst -sha384 | openssl base64`.
  16. **Discord bot `allowed_mentions` (LOW security)** — `bots/discord_dm_bot.py` and `bots/discord_social_bot.py` `__init__` now pass `allowed_mentions=discord.AllowedMentions(everyone=False, roles=False, users=True, replied_user=True)` to `commands.Bot.__init__`. `@everyone` / role pings in user-supplied content (reminder text, roll commands) now show as text but do not trigger Discord's notification system.
- **Deferred (still in active logs):**
  - **490 `print()` → structured logging migration (MEDIUM)** — too large for one session; multi-PR sweep tracked in `BMO-SUGGESTIONS-LOG.md`.
  - **`app.py` 5596 lines / cyclomatic 38 / MI=C(0.0) (LOW)** — multi-day blueprint refactor; tracked in `BMO-SUGGESTIONS-LOG.md`.
  - **`_ide_jobs` per-key write race (MEDIUM, partial fix above)** — full lock-around-mutations in agent task body deferred (deadlock risk during long blocking calls). Iteration race fixed.
- **Process note:** Per `LOG-INSTRUCTIONS.md` the "fixing in this session" entries should not have been logged in the first place — this batch was logged then immediately fixed when the user said "fix everything." All entries removed from active logs.

### [2026-04-25] BMO suggestions log — full sweep (design gotchas → DESIGN-CONSTRAINTS, 5e sync, hooks/mcp docs, bandit nosec)

- **Original severity:** info / medium (all active entries in `BMO-SUGGESTIONS-LOG.md` through 2026-04-25)
- **Category:** docs, security hygiene, tooling
- **Domain:** bmo (+ `both` data notes)
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Resolution summary:**
  1. **Canonical doc:** [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — task list discipline pointer, hooks `shell=True` threat model, `os.system` curl + gevent rationale, `bots/` vs `discord/`, `calendar_service` vs stdlib names, duplicated 5e JSON table, HTTP-only ownership.
  2. **Code:** `bmo/pi/agents/hooks.py` — `# nosec B602` + cross-link. `bmo/pi/services/cloud_providers.py` — module comment + `# nosec B605` on each `os.system` curl call.
  3. **Docs:** [`docs/DATA-FLOW.md`](./DATA-FLOW.md) — five-file 5e mirror table + `bmo/pi/scripts/sync-shared-5e-json.sh`; voice profiles line aligned to `voice_profiles.json`. [`bmo/pi/mcp_servers/README.md`](../bmo/pi/mcp_servers/README.md) — hook trust model. [`bmo/pi/bots/README.md`](../bmo/pi/bots/README.md) — why not `discord/`. Repo [`AGENTS.md`](../AGENTS.md) — `cat bmo/docs/DESIGN-CONSTRAINTS.md` in “How to Start.”
  4. **Active log:** [`docs/BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) cleared to empty sections with migration pointer (this entry).

### [2026-04-25] BMO issues log — full sweep (env TV/VTT, data dirs, JSON embeddings, journald bots, audioop, ruff F-rules, ops docs)

- **Original severity:** mixed (all active entries in `BMO-ISSUES-LOG.md` through 2026-04-25)
- **Category:** config, security, debt, performance, docs
- **Domain:** bmo
- **Resolved by:** Cursor agent (changes run + verified on Pi: `/home/patrick/home-lab/bmo/pi/venv`, `pytest tests/` 744 passed, 6 skipped)
- **Date resolved:** 2026-04-25
- **Resolution summary:**
  1. **TV / VTT hosts:** `app.py` `TV_IP = os.environ.get("BMO_TV_HOST", "10.10.20.194")`. `bmo/.env.template` documents `BMO_TV_HOST`, `VTT_SYNC_URL`. `agents/vtt_sync.py` default `http://vtt.local:5001`. `dev/bmo_ui_lab_server.py` uses `BMO_TV_HOST`.
  2. **Single data tree:** `services/monitoring.py` writes `monitor_state.json` / `monitor_alert_state.json` under `bmo/pi/data/`. `services/location_service.py` uses `bmo/pi/data/` for `location_cache.json` and reads `settings.json` from the same tree (aligns with `app.py` / `USER_SETTINGS_PATH`).
  3. **Pickle → safe formats:** `voice_pipeline` speaker embeddings in `data/voice_profiles.json` (migrate from `.pkl` on load). `camera_service` `known_faces.json` (migrate from `.pkl` on load). Pickle only used for one-time migration reads.
  4. **Discord social bot:** Replaced deprecated `audioop.tomono` with numpy left-channel extract in `_pcm_to_wav_48k`.
  5. **Discord DM bot:** `calculate_encounter_difficulty` import removed (unused). Opus load failure now prints a warning instead of silent `pass`.
  6. **Systemd bot logging:** `bmo-dm-bot.service` / `bmo-social-bot.service` use `StandardOutput=journal` / `StandardError=journal`. Example logrotate in `bmo/pi/kiosk/logrotate.d-bmo-bots.example` for file-based recovery.
  7. **Kiosk wait:** `bmo-kiosk.service` `ExecStartPre` uses `curl --max-time 2`, fewer iterations, 127.0.0.1.
  8. **Wake OWW:** `_load_wake_model` raises a clear error if no ONNX paths (existing outer handler falls back to energy+STT). `os.makedirs(MODELS_DIR/piper)`.
  9. **setuptools:** Pinned `setuptools>=78.1.1,<82` in `requirements.txt` and `requirements-ci.txt` (CVE mitigation; **&lt;82** required by `torch` on Pi).
  10. **Ruff F401/F541:** `pip install ruff`; auto-fixed unused imports and pointless f-strings; manual fixes for `cli.py` / `oled_face.py` leftovers. **vtt_sync:** removed unused `List` import.
  11. **Docs:** `bmo/docs/TROUBLESHOOTING.md` — journalctl for bots, `BMO_TV_HOST` / `VTT_SYNC_URL`, pip `http-v2` cache note.

### [2026-04-25] Batch: HTTP timeouts, voice_pipeline F811, stale service docs, MCP paths, dev legacy paths, package `__init__.py`

- **Original severity:** medium (most) / low (`__init__.py`)
- **Category:** bug, debt, docs, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Resolution (code + docs):**
  1. **`agents/mcp_client.py` SSE:** Replaced `httpx.stream(..., timeout=None)` with `httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)` so stalled MCP SSE does not block workers forever.
  2. **`services/reauth_calendar.py`:** Already had `timeout=30` on the token `post` (no code change). Original S113 scan was outdated.
  3. **`services/voice_pipeline.py` `_pcm_to_wav`:** Inline `import io, wave` → `import wave` only (module-level `io` already imported); removes F811 shadowing.
  4. **Docs:** `bmo/pi/README.md` service tree, `bmo/docs/SERVICES.md`, and `bmo/docs/ARCHITECTURE.md` — removed references to removed modules `tv_controller.py` and `sound_effects.py`; documented `tv_worker.py` and corrected Music row (ytmusicapi + VLC).
  5. **`mcp_servers/mcp_settings.json`:** All `/home/patrick/bmo/...` paths → `/home/patrick/home-lab/bmo/pi/...` for dnd_data + filesystem roots.
  6. **Package markers:** Added `bmo/pi/mcp_servers/__init__.py` and `bmo/pi/ide_app/__init__.py` (minimal docstrings).
  7. **Dev / scripts:** `dev/patch_*.py`, `revert_power.py`, `dev/benchmark_*.py` now resolve `app.py` and `.env` via `os.path` relative to `__file__`. Shell script comments in `scripts/e2e_test.sh`, `diagnose-cloudflare.sh`, `setup-tailscale.sh` use `~/home-lab/bmo/pi/...`.
- **Process:** Clarified in `docs/BMO-ISSUES-LOG.md` that the active log is **deferred** backlog; same-session fixes are not re-logged (per `LOG-INSTRUCTIONS.md`).

### [2026-04-24] Non-pytest `test_*.py` scripts in `bmo/pi/tests/` and pytest import-order / conftest issues

- **Original severity:** medium
- **Category:** debt, test harness
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution (code):**
  - **Moved** hand-run diagnostics and benchmarks out of `tests/`: `dev/diagnostics/{aec_pipewire_check,wake_word_auto,wake_word_timed,wake_word_debug}.py`, `dev/benchmarks/{thinking_budget_sweep,gemini_stream_probe}.py`, `dev/bmo_ui_lab_server.py` (Flask lab server; templates/static from `bmo/pi/web/`). Wrapped all side effects in `if __name__ == "__main__"`: or `main()` where needed; fixed paths to use `Path(__file__).resolve().parents[1]` for `bmo/pi` root; renamed `test_*` step functions in the wake deep diagnostic so pytest would not pick them up if paths drift.
  - **Collection / imports:** `tests/conftest.py` sets `BMO_SOCKETIO_ASYNC_MODE=threading` and replaces minimal `gevent` stubs with `types.ModuleType` so `app` can import. `app.py` reads that env for `SocketIO(async_mode=...)`.
  - **`test_routing_accuracy`:** Renamed to `tests/agents/test_0_routing_accuracy.py` so it imports the real `agents.router` before `test_base_agent.py` and `test_app_endpoints.py` register `sys.modules["agents"] = MagicMock()`.
  - **`test_base_agent` + `test_voice_pipeline`:** `test_voice_pipeline` still stubs `sys.modules["agent"]` for pipeline import; `test_base_agent` fixtures call `_ensure_real_agent_module()` to `del` that MagicMock before `import agent` (BmoAgent).
  - **Patches:** `test_calendar_auth_paths` uses `services.calendar_service` in `@patch(...)`; `test_music_restore` uses `services.music_service` (fixed `ModuleNotFoundError` for patch resolution).
- **Note:** `pytest tests/ --collect-only` is clean (753 tests, 0 errors on this host). A full `pytest tests/` run may still report failures unrelated to collection (e.g. network-key tests, or `tests/agents/test_base_agent.py::test_history_does_not_exceed_max` timing) — not part of this fix.

### [2026-04-23] Google Calendar `invalid_grant: Bad Request` (plus split `token.json` paths)

- **Original severity:** high
- **Category:** config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Resolution (code + ops):** **Root issue 1 — path drift:** `CalendarService` preferred `bmo/pi/services/config/token.json` (a 43-byte stub) over `bmo/pi/config/token.json` whenever the former existed, so a bad or half-written token overrode the real file. **Fix:** `CONFIG_DIR` is now canonical **`bmo/pi/config`**. `_resolve_config_paths()` checks **`bmo/pi/config` first**, then `services/config`, then `bmo/config`. `authorize_calendar.py` and `reauth_calendar.py` read/write the same `bmo/pi/config` paths as `app.py`. Removed the stray `bmo/pi/services/config/token.json` stub. **Root issue 2 — expired refresh token:** If Google still returns `invalid_grant` (revoked or expired refresh token), `creds.refresh()` now raises a clear `RuntimeError` with `reauth_calendar.py` / `authorize_calendar.py` steps. On this Pi, the refresh token in `bmo/pi/config/token.json` was still **invalid** after the path fix — **calendar recovery requires a manual re-auth** (`./venv/bin/python services/reauth_calendar.py` on the Pi, paste the code from the printed URL) or browser OAuth via `authorize_calendar.py`. After a successful re-auth, `sudo systemctl restart bmo`.
- **User follow-up (when ready):** Run re-auth, then `sudo systemctl restart bmo` (user deferred restart).

---

### [2026-04-23] BMO venv ~4.5 GB CUDA / GPU stack on Pi 5 (no GPU) — `torch` from PyPI

- **Original severity:** high
- **Category:** debt, performance, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Documented in `bmo/pi/requirements.txt` (install **CPU-only** `torch` before `pip install -r`, because `resemblyzer` / `openwakeword` depend on `torch` and a plain install on Linux aarch64 pulled CUDA + `nvidia-*` wheels). `bmo/setup-bmo.sh` now runs `pip install torch --index-url https://download.pytorch.org/whl/cpu` before `requirements.txt`. Added `bmo/pi/scripts/install-venv.sh` for one-command venv rebuilds. **On the production Pi:** ran `install-venv.sh`; venv **~5.4 GB → ~1.7 GB**; `pip list` has **no** `nvidia-*` or `triton`; `torch` reports `2.11.0+cpu`, `torch.cuda.is_available()` is `False`. `import resemblyzer` smoke test passes. BMO and bots restarted.

---

### [2026-04-23] `bmo/pi/requirements.txt` — missing direct runtime deps (`python-dotenv`, `discord.py`, `edge-tts`, `scipy`)

- **Original severity:** high
- **Category:** config, bug
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Declared in `bmo/pi/requirements.txt`: `python-dotenv`, `discord.py[voice]`, `edge-tts`, `scipy` (section *Used directly by app / bots*). On the production Pi, `pip install -r requirements.txt` pulled in `discord.py` 2.7.1, `edge-tts` 7.2.8, and voice extras; `import dotenv, discord, edge_tts, scipy` verified. `systemctl restart bmo-dm-bot bmo-social-bot` — both units report **active** (no more `ModuleNotFoundError: discord` crash loop).

---

### [2026-04-24] Broken symlinks `bmo/pi/data/music_history.json` + `play_counts.json` → legacy `DnD/BMO-setup/`

- **Original severity:** high
- **Category:** bug, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Removed stale symlinks and created real files: `music_history.json` = `[]` (list schema for `MusicService._load_history`), `play_counts.json` = `{}` (dict schema for `_load_play_counts`). Applied on the production Pi under `~/home-lab/bmo/pi/data/`. Added the same guard to `bmo/setup-bmo.sh` after runtime `mkdir` so fresh installs or clones replace broken symlinks with empty JSON instead of inheriting pre-reorg links.

---

### [2026-04-24] `kiosk/bmo-{dm,social}-bot.service` — wrong `StandardOutput` / `StandardError` log paths

- **Original severity:** high
- **Category:** config, bug
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Updated both unit files so `StandardOutput` and `StandardError` append to `/home/patrick/home-lab/bmo/pi/data/logs/{dm,social}-bot.log` instead of the nonexistent `/home/patrick/bmo/data/logs/...`. In-repo `kiosk/bmo-*.service` matches `setup-bmo.sh` inline units. **On the production Pi:** units were copied to `/etc/systemd/system/`, `daemon-reload` run, and `bmo-dm-bot` / `bmo-social-bot` restarted; `diff` repo vs installed is empty for those two files.

---

### [2026-04-24] `scripts/setup-cloudflare-tunnel.sh` — UTF-8 BOM before shebang

- **Original severity:** high
- **Category:** bug, config
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Stripped the leading UTF-8 BOM so byte 0 is `#!`. `shellcheck` no longer reports SC1082. Added repo-root `.editorconfig` with `[*.sh] charset = utf-8` to reduce BOM reintroduction.

---

### [2026-04-24] `services/voice_pipeline.py` — `_stream_and_speak` B023 + stray `_remember_spoken(text)`

- **Original severity:** high (B023) + related medium (F821 `text`)
- **Category:** bug
- **Domain:** bmo
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Resolution:** Replaced the comma-boundary `class _M` closure with explicit `end` integer handling (no `RecursionError`). Removed erroneous `self._remember_spoken(text)` at the start of `_stream_and_speak` (undefined `text`); `_remember_spoken` remains after the stream with `full_text` only. Added `test_stream_and_speak_comma_boundary_long_buffer_no_recursion`. `ruff --select=B023,F821` clean on `voice_pipeline.py`. Also addresses the active log item *Streaming chat falls back to sync — `name 'text' is not defined`* (same root cause).

---

### [2026-04-23] Dual BMO directories (`/home/patrick/bmo/` vs `/home/patrick/home-lab/bmo/pi/`)

- **Original severity:** high
- **Category:** config
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** Merged runtime state from standalone `/home/patrick/bmo/` into canonical `/home/patrick/home-lab/bmo/pi/` via mtime-aware rsync (newer file wins). Rewrote 50+ `~/bmo/...` path references across Python to canonical `~/home-lab/bmo/pi/...`. Archived stale Python copies from standalone to `_archive/2026-04-reorg/old-bmo-standalone/`. Deleted standalone dir.

---

### [2026-04-23] `BMO-setup/` → `bmo/` rename

- **Original severity:** medium
- **Category:** debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** Folder renamed. Systemd service files patched (both in-repo and installed at `/etc/systemd/system/`). All hardcoded paths updated. `daemon-reload` + service restart successful — all 5 BMO services running on new paths.

---

### [2026-04-23] Pi-deploy duplicate `vtt_sync.py`

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app, bmo *(primary: bmo — agent module — also mirrored in [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md))*
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** `scripts/pi-deploy/vtt_sync.py` was byte-identical to `bmo/pi/agents/vtt_sync.py`. Archived the pi-deploy copy. `apply_patch.py` moved to `bmo/pi/scripts/apply_patch.py` (canonical location for BMO deploy tooling).

---

### [2026-04-23] Three likely-dead Python modules in `bmo/pi/` (pre-reorg leftovers superseded by newer modules)

- **Original severity:** medium
- **Category:** debt
- **Domain:** bmo
- **Resolved by:** Claude Opus
- **Commits:** `780dc9f` (sound_effects.py + tv_controller.py) + `7e2090c` (discord_bot.py + bmo/docker/)
- **Date resolved:** 2026-04-23
- **Resolution:** All three confirmed orphan (zero importers in runtime, systemd, setup-bmo.sh, MCP config). Archived to `_archive_system_cleanup/bmo/pi/{bots,services}/`. Updated `bmo/pi/README.md` and `bmo/docs/ARCHITECTURE.md` to drop the `discord_bot.py` "common base" line and replaced with the two live bots (`discord_dm_bot.py`, `discord_social_bot.py`). Post-archive sanity: `py_compile` clean; import resolution for `bots.discord_dm_bot`, `bots.discord_social_bot`, `services.tv_worker`, `services.voice_pipeline` still OK.

---

### [2026-04-23] `bmo/docker/` — obsolete laptop → Pi SSH-deploy path

- **Original severity:** high
- **Category:** config, debt
- **Domain:** bmo, infra
- **Resolved by:** Claude Opus
- **Commit:** `7e2090c`
- **Date resolved:** 2026-04-23
- **Resolution:** The entire `bmo/docker/` directory targeted a pre-monorepo "remote Pi" deploy (laptop `scp`/`ssh` → flat `~/bmo/` layout on Pi) that is no longer the workflow — the Pi (this machine) runs directly from the monorepo via `bmo/setup-bmo.sh`, and the Docker containers (`bmo-ollama`, `bmo-peerjs`, `bmo-coturn`, `bmo-pihole`) are started via plain `docker run` in `setup-bmo.sh`, not via `docker-compose.yml`. The dir's systemd units (`bmo.service`, `bmo-backup.service/timer`) target the old path and are not installed on this Pi. `activate-hdmi-audio.sh` is documented as "runs as a user service" but is not registered under `~/.config/systemd/user/`. Whole dir archived to `_archive_system_cleanup/bmo/docker/`. Live docs updated: `bmo/docs/DEPLOY.md`, `bmo/docs/ARCHITECTURE.md`, `bmo/docs/SYSTEMD.md`, `bmo/docs/TROUBLESHOOTING.md`, `docs/COMMANDS.md`, `docs/BACKUP.md`, `bmo/README.md`. Running containers are unaffected (they outlive the config dir).

---

### [2026-04-23] Stale legacy files loose at `/home/patrick/` (pre-monorepo-reorg leftovers)

- **Original severity:** low
- **Category:** debt
- **Domain:** bmo, infra
- **Resolved by:** Claude Opus
- **Commits:** `780dc9f` (3 identical dupes) + `7e2090c` (4 differing + 3 WiFi scripts + __pycache__)
- **Date resolved:** 2026-04-23
- **Resolution:** Eleven files sat at `$HOME` from Mar 15–19 (pre-reorg). After comparison: none of the "differs from repo" versions had local hotfixes worth extracting — they were simply older snapshots (e.g., `~/app.py` was 5099 lines vs repo's 5504; `~/bmo-kiosk.service` still referenced the pre-rename `/home/patrick/DnD/BMO-setup/` path). All 10 archived to `_archive_system_cleanup/home-dir-pre-reorg/` (the `index.html` "differs from dnd-app" flag was misleading — it was actually an older copy of `bmo/pi/web/templates/index.html`). `/home/patrick/hide-cursor.py` (root-owned, no repo match) left in place — not verified whether it's a live system hook.

---

> dnd-app resolved entries: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). Resolved security (gitignored): [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md). Active BMO bugs: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md). Active BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
