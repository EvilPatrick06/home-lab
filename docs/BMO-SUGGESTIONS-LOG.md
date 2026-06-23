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

---

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

---

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

---

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

---

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

---

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

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

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

### [2026-06-22] Misspelled static asset filename `PrimeVIdeo.png`

- **Category:** debt
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
The TV-app launcher image `bmo/pi/web/static/img/PrimeVIdeo.png` has a capitalization typo (`VIdeo` instead of `Video`). It works today because `web/templates/index.html:1163` references it with the exact same misspelling, but the inconsistent casing is a small naming smell next to its siblings (`Netflix.png`, `YouTube.png`, `Plex.png`, etc.) and is a portability hazard on case-sensitive vs case-insensitive filesystems. Low priority — only worth fixing alongside other `index.html` asset churn (rename file + update the one `<img src>`).

**Related files:** `bmo/pi/web/static/img/PrimeVIdeo.png`, `bmo/pi/web/templates/index.html`

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
