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

### [2026-06-28] `services/monitoring.py` is a 2,221-line `HealthChecker` god-class — ~40 unrelated probe/alerting concerns in one class; the largest service module by far and untouched by the prior god-class entries

- **Category:** future-idea (architecture + DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of `bmo/pi/services/` by file size (monitoring.py is the largest service module at 95 KB)

**Description:**
`services/monitoring.py` is 2,221 lines — the 4th-largest source file in the bmo tree and the single largest under `services/` — and almost all of it is **one class, `HealthChecker`** (declared line 271, running to ~line 1950 with ~40 methods). That one class owns a dozen independent subsystems that share nothing but `self`: a **per-service circuit breaker** (`_circuit_open`/`_circuit_record_failure`/`_circuit_record_success`); **status persistence** (`_load_prev_status`/`_save_prev_status`/`_load_discord_alert_state`/`_save_discord_alert_state`); the **scheduler loop** (`start`/`stop`/`_check_loop`/`check_all`); and a long list of **heterogeneous probes**, each a self-contained checker — `_check_http_service`, `_check_pi_resources`, `_check_docker_containers`, `_check_pihole`, `_check_systemd_services`, `_check_network`, `_check_ports`, `_check_internet`, `_check_pi_power`, `_check_calendar_token` (+ `_calendar_live_probe`/`_resolve_calendar_service`), `_check_cloudflared`, `_check_remote_access`, `_check_rclone`, `_check_voice_canary` — plus an **alerting/dedup layer** (`_alert_fingerprint`, `_normalize_alert_message`, `_emit_alert`, `_process_state_transitions`, `_send_discord_if_allowed`, `_notify_feed_if_allowed`, `set_notification_sink`) and the public `get_status`/`inject_alert`. This is the exact "one class, many unrelated subsystems sharing only `self`" pattern already logged for `VoicePipeline` (this log, 2026-06-28) and `bots/social/bot.py` (2026-06-23) — but `monitoring.py` is not covered by either of those entries and has never had a grouping/extraction pass (there is no `services/monitoring/` subpackage the way there is `services/voice/`). The class works and is exercised in production (`app.py:800,963`, `routes/system_api.py:568,878`), so this is reviewability/maintainability debt, not a bug — but adding or changing any single probe means navigating a 2k-line file, and the module-level stat readers (`get_pi_stats`, `_read_cpu_temp/_percent/_ram/_disk`, `_send_discord_webhook`) sit loose above the class with no boundary.

**Hypothesis / root cause:** monitoring grew one probe at a time (each new service to watch = another `_check_*` method bolted onto `HealthChecker`), and unlike the voice stack it never got even a file-grouping pass, so it accreted into a single oversized class.

**Proposed fix / improvement:**
- [ ] Introduce a `services/monitoring/` subpackage (mirroring `services/voice/`): keep `HealthChecker` as the thin scheduler/orchestrator and extract the probes behind a small `Probe`/checker protocol (`probes/resources.py`, `probes/network.py`, `probes/docker.py`, `probes/external.py` for cloudflared/rclone/remote-access, `probes/calendar.py`, `probes/voice_canary.py`, …) that the orchestrator iterates.
- [ ] Pull the cross-cutting layers into their own collaborators: `CircuitBreaker`, `StatusStore` (the prev-status / alert-state persistence), and an `Alerter` (fingerprint + dedup + discord/notify sinks). `get_pi_stats` + the `_read_*` helpers become a `system_stats.py` module.
- [ ] Keep the public surface (`HealthChecker(socketio, check_interval)`, `start`/`stop`/`check_all`/`get_status`/`inject_alert`/`set_notification_sink`) byte-for-byte stable so `app.py` and `routes/system_api.py` are untouched; gate the pure restructuring behind pytest + the CI 4-gate (no behavior change), per the fix-forward stance.

**Related files:** `bmo/pi/services/monitoring.py:101` (`Severity`), `:271` (`HealthChecker`) and the ~40 methods cited above; consumers `bmo/pi/app.py:800,963`, `bmo/pi/routes/system_api.py:568,878`; precedent `bmo/pi/services/voice/`.

**Related entries:** Future-ideas 2026-06-28 (`VoicePipeline` 2,236-line god-class) and 2026-06-23 (social-bot god-module) — same one-class-many-subsystems pattern; this is the third and currently un-addressed instance. Calendar-cluster entry 2026-06-24 (group `services/` clusters into subpackages) — the `services/monitoring/` subpackage proposed here is another application of that convention.

---

### [2026-06-28] The D&D / game subsystem is ~11 flat files at `services/` top level (~200 KB) with no `services/game/` (or `services/dnd/`) subpackage — the largest un-grouped cluster, bigger than the calendar one already flagged

- **Category:** future-idea (structure / DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of `bmo/pi/services/` clustering vs the `services/voice/` precedent

**Description:**
`services/` holds a large, obviously-cohesive D&D / multiplayer-game subsystem spread as ~11 sibling files interleaved alphabetically among the unrelated service modules: `dnd_engine.py` (20 KB), `dnd_dm_data.py` (11 KB), `game_registry.py` (16 KB), `game_relay.py` (18 KB), `campaign_memory.py` (19 KB), `scene_service.py` (21 KB), `location_service.py` (19 KB), `pbp_store.py` (13 KB), `personality_engine.py` (18 KB), `rag_search.py` (22 KB) and `build_rag_indexes.py` (30 KB) — together ~200 KB, the single biggest related cluster in the directory. `docs/SERVICES.md` even documents them as one functional group (dnd_engine/game_registry/game_relay rows), yet nothing in the tree expresses that grouping. The codebase already established the "pull a cohesive cluster into a subpackage" pattern with `services/voice/` (10 modules), and the calendar entry (this log, 2026-06-24) called the **calendar** group "the largest un-grouped one" — but the game cluster is materially larger and is the more impactful reorg target. Import fan-in is low and reorg-friendly (most modules have 1–2 importers; `rag_search` 6, `pbp_store` 4), so the move is mechanical and low-risk.

**Hypothesis / root cause:** `services/` grew flat and only the voice subsystem was ever subpackaged; the D&D/game modules were each added independently as the dnd-app multiplayer + DM-engine features landed (Phases 29f/32 per SERVICES.md), so the cluster accreted without anyone introducing a `services/game/` home.

**Proposed fix / improvement:**
- [ ] Introduce `services/game/` (with `__init__.py` re-exporting the public surface) and `git mv` the cluster in as `engine.py`, `dm_data.py`, `registry.py`, `relay.py`, `campaign_memory.py`, `scene.py`, `location.py`, `pbp_store.py`, `personality_engine.py`, plus a nested `services/game/rag/` for `rag_search.py` + `build_rag_indexes.py` (the RAG retrieval pair). Update the ~20 intra-repo import sites atomically (or via thin shim re-exports) so `app.py`, `routes/`, the `dnd_dm`/`encounter`/`lore` agents and the dnd-data MCP server keep working.
- [ ] Land it as a behavior-identical reorg gated by pytest + the CI 4-gate; sequence it AFTER (or alongside) the calendar-cluster move so the two land coherently and `docs/SERVICES.md` / `docs/ARCHITECTURE.md` can be updated once.
- [ ] Promote the "cluster ≥3 related service modules into a subpackage" rule to an explicit convention in `docs/ARCHITECTURE.md` (the calendar entry proposed this; the game cluster is the strongest motivating example).

**Related files:** `bmo/pi/services/{dnd_engine,dnd_dm_data,game_registry,game_relay,campaign_memory,scene_service,location_service,pbp_store,personality_engine,rag_search,build_rag_indexes}.py`; precedent `bmo/pi/services/voice/`; `bmo/pi/docs/SERVICES.md:59-62`, `bmo/pi/docs/ARCHITECTURE.md:84`.

**Related entries:** Future-ideas 2026-06-24 (calendar OAuth → `services/calendar/`) — same subpackage-the-cluster idea; this entry is the larger sibling cluster that the calendar entry under-counted ("largest un-grouped one").

---

### [2026-06-28] `pi/scripts/` has no README and ships two non-standard `*.router-deployed` / `*.reference` notify copies whose relationship to the deployed `~/.claude-tools/notify.sh` is undocumented

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of `bmo/pi/scripts/` for stale/inconsistently-named artifacts

**Description:**
`pi/scripts/` is a 20-file operational toolbox (deploy, health-check, backups, cloudflare, e2e) with **no README** explaining what each script is, which run on the Pi vs. in CI vs. by agents, or which are safe to invoke by hand. Two files in particular are confusing without that context: `notify.sh.router-deployed` and `notify-sms.sh.reference`. Their double, non-`.sh` extensions make them non-executable as-is and signal "not run from here," and a repo-wide grep finds **zero references** to either filename in any `.md`/`.sh`/`.py`. They are in fact reference copies of the notification router that is deployed to `~/.claude-tools/notify.sh` (the path every scheduled task — including this scanner — actually calls), and they were last touched 2026-06-28 (`91aecd1c`, `c7e4b3d1`) as part of the "notify.sh board router" work, so they are intentional, not stale. But to a future contributor they read as orphaned/dead artifacts: the naming convention (`.router-deployed` = the live router's source-of-truth copy, `.reference` = the SMS-failsafe reference) is nowhere written down, and there is no pointer from the repo copy to the deployed location or vice-versa. `scripts/notify-board` (the board sender) is similarly undocumented. This is a documentation/clarity gap, not dead code — but it is exactly the kind of thing that gets "cleaned up" (deleted) by a later well-meaning pass because nothing explains it.

**Hypothesis / root cause:** the notify router was developed in-repo and deployed by copying to `~/.claude-tools/`; the in-repo copies were given disambiguating suffixes (`.router-deployed`/`.reference`) to mark them as not-run-here, but the convention was never captured in a `scripts/README.md` or in `docs/`.

**Proposed fix / improvement:**
- [ ] Add `pi/scripts/README.md`: a one-line purpose for each script, a column for "where it runs" (Pi / CI / agent / one-off), and an explicit note on the notify family — that `notify.sh.router-deployed` is the source-of-truth copy of the live `~/.claude-tools/notify.sh` board router, `notify-sms.sh.reference` is the SMS-via-MMS-gateway failsafe reference, and `notify-board` is the board sender they route to.
- [ ] Either keep the `.router-deployed`/`.reference` suffix convention **and document it** in that README (and ideally cross-link from `docs/STATUS-BOARD-DESIGN.md`, since the router feeds the board), or rename to a clearer scheme such as `scripts/reference/notify.sh` + `scripts/reference/notify-sms.sh` so "not run from here" is conveyed by location rather than an unusual extension.
- [ ] Add a short "Notifications" subsection to `docs/STATUS-BOARD-DESIGN.md` (or `docs/SERVICES.md`) describing the deployed-vs-repo split so the in-repo copies are not mistaken for orphans.

**Related files:** `bmo/pi/scripts/notify.sh.router-deployed`, `bmo/pi/scripts/notify-sms.sh.reference`, `bmo/pi/scripts/notify-board`, `bmo/pi/scripts/` (no README); `bmo/pi/docs/STATUS-BOARD-DESIGN.md`.

**Related entries:** Debt 2026-06-24 (orphaned vendored `web/static/` assets) — same "tracked files nothing references" smell; here the fix is documentation (they are intentional), not deletion.

### [2026-06-28] Agent-registration failures are observability-invisible — a dropped specialized agent silently removes a capability with no metric, structured log, or health surface (unlike services, which have `service_init_status` + degraded health)

- **Category:** future-idea (reliability + observability)
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the agent-registration path (`agents/_registry.py` -> `agent.py`) vs the existing service health surface (`routes/system_api.py`)

**Description:**
The orchestrator gets its ~23 non-core specialized agents from `agents/_registry.create_all_agents()` (`agents/_registry.py:46`), which deliberately isolates per-agent failures so one broken agent never drops the rest (PHASE-15 15A). But its only failure signal is a bare `print(f"[registry] FAILED to create agent ...")` on stdout — there is **no `metrics_counters.incr(...)`, no `bmo_logging.get_logger` line, and nothing surfaced to `/api/health/full` or the status board.** So if a deploy ships a module that raises at import/construction time (a bad refactor, a missing dependency, a constructor that throws on a config gap), that agent silently vanishes from `orchestrator.agents` and BMO just quietly loses that capability — timers, smart-home, weather, the D&D agents, etc. The router then falls through / mis-routes with no indication that the agent it wanted no longer exists.

This is a notable asymmetry with how *services* are handled. `routes/system_api.py:api_health_full` already exposes `service_init_status` (read via `getattr(_app(), "service_init_status", {})`), flips `overall` to `degraded`, and lists `degraded_init_services` when any service init swallowed an exception — explicitly so "a swallowed init failure surfaces as degraded rather than only as endpoint 500s." There is **no `agent_init_status` equivalent**: a failed agent never degrades health, never appears in `/metrics`, and never lands on the board (the board's "Agents" section in `bots/social/status_board_cog.py` is fed by agent-produced items, not by registration health). Runtime agent failures *are* observable — `orchestrator.run_agent` (`agents/orchestrator.py:155-163`) calls `log.exception(...)` on a per-turn failure — but even that path increments no counter, and the *registration* path is the truly dark one. Net: the one place designed to "never drop the rest" also makes a dropped agent the hardest failure to notice.

**Hypothesis / root cause:** `create_all_agents` was written for *isolation* (don't let one bad agent crash startup) and used a quick `print` for the diagnostic, predating / not reusing the `service_init_status` pattern later added for services. No agent-registration result is threaded back to `app`/health the way `service_init_status` is, so the observability half of "fail one agent, keep the rest" was never built.

**Proposed fix / improvement:**
- [ ] In `create_all_agents`, on each failure: `metrics_counters.incr("bmo_agent_init_failed_total")` (and/or a per-agent label) and `get_logger("registry").exception(...)` instead of `print(...)` (also drops one entry off the `.print-baseline` ratchet).
- [ ] Return/record per-agent init status (mirror `service_init_status`): have `create_all_agents` report `{agent_name: {"ok": bool, "error": repr}}` up to `agent.py` (`agent.py:624-629`), stash it on the app as `agent_init_status`, and add it to `/api/health/full` so a missing agent flips `overall` to `degraded` and lists `degraded_init_agents` — symmetric with the existing service path.
- [ ] Optionally surface a failed/missing agent as a status-board incident row (it is exactly the "something is wrong" case the board exists for), reusing the empty-board-==-all-good model.
- [ ] Add a tiny test asserting that a forced factory raise both keeps the other agents (already covered in `tests/agents/test_registry.py`) **and** records the failure in the new status surface.

**Related files:** `bmo/pi/agents/_registry.py:46` (`create_all_agents`, the `except`/`print` branch), `bmo/pi/agent.py:618-629` (registration call site), `bmo/pi/routes/system_api.py:87-130` (`api_health_full`, `service_init_status`/`degraded_init_services` — the pattern to mirror), `bmo/pi/services/metrics_counters.py` (`incr`, exported at `/metrics`), `bmo/pi/agents/orchestrator.py:155-163` (runtime failure logging — observable but no counter), `bmo/pi/bots/social/status_board_cog.py` (board "Agents" section), `bmo/pi/tests/agents/test_registry.py`.

**Related entries:** BMO-RESOLVED 2026-06-22 (adopt `bmo_logging` / retire `print()`) — that added the print *ratchet* but left existing prints (incl. this one) to be retired opportunistically and added no agent health surface; BMO-RESOLVED 2026-06-22 (per-service init status / degraded health) — the service-side pattern this proposes to mirror for agents.

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

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
