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

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
