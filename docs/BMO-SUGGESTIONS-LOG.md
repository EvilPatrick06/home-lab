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

---

---

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

---

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

---

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

---

---

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

---

---

---

---

---

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

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
