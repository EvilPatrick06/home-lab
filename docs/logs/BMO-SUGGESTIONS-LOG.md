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

### [2026-07-02] `.env.template` has drifted from the code — 40+ `BMO_*` env vars the app reads are undocumented, several template keys are referenced nowhere, and the header cites a nonexistent `bmo.sh`

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (cross-check of `.env.template` keys vs `os.environ.get`/`os.getenv` literals in `bmo/pi/**/*.py`)

**Description:**
An earlier resolved entry (".env.example + fail-fast config preflight", commit `00596a22`) recorded that "`.env.template` already enumerates every key" — that is no longer true; the drift is two-way. **(1) Code → template:** 40+ env vars read in `bmo/pi/` never appear in the template, including operationally useful knobs: auth/API (`BMO_API_KEY`, `BMO_IDE_TOKEN`/`BMO_IDE_HOST`/`BMO_IDE_PORT`), the whole rate-limit family (`BMO_AUTH_RATE_LIMIT`, `BMO_CHAT_RATE_LIMIT`, `BMO_DEFAULT_RATE_LIMIT`, `BMO_GAMES_RATE_LIMIT`, `BMO_IDE_JOBS_RATE_LIMIT`, `BMO_DND_LOAD_RATE_LIMIT`, `BMO_NARRATE_RATE_LIMIT`), canary controls (`BMO_CANARY`, `BMO_CANARY_TTS`, `BMO_CANARY_STALE_H`, `BMO_CANARY_STT_BUDGET_S`), logging (`BMO_LOG_LEVEL`/`BMO_LOG_FILE`/`BMO_LOG_FORMAT`), model failover (`BMO_LLM_FAILOVER_MODEL`, `BMO_DND_FALLBACK_MODELS`, `BMO_LOCAL_MODEL`), size/quota limits (`BMO_MAX_REQUEST_SIZE`, `BMO_MAX_CHAT_MESSAGE_LEN`, `BMO_ACCOUNT_QUOTA_BYTES`, `BMO_MAX_BACKUP_SIZE`), and `BMO_HOME`. All have defaults (nothing is broken), but the template presents itself as the config reference, so an operator tuning any of these has to grep source. **(2) Template → code:** several template keys have zero references anywhere else in the repo (`CF_ACCOUNT_ID`, `CF_TUNNEL_ID`, `PI_IP`, `PI_SSH_ALIAS`, `PI_WEB_HOST`; `PI_HOST`/`PI_USER`/`PI_TAILSCALE_HOST`/`CLOUDFLARE_DOMAIN` have only 1–4 hits, some docs-only) — likely leftovers of retired shell tooling. **(3)** The template header says "All commands via \"bash bmo.sh <command>\" will source this file" — no `bmo.sh` exists anywhere in `bmo/`. Bonus: `setup-bmo.sh` section 7 writes its own inline `.env` seed (heredoc) with a *third*, smaller key list that also drifts independently.

**Hypothesis / root cause:** every new feature added its `os.getenv` knob with a default and skipped the template (no guard couples them); the shell-tooling keys and the `bmo.sh` reference survived the retirement of the old command wrapper.

**Proposed fix / improvement:**
- [ ] Regenerate the documented key list: add the missing `BMO_*` knobs grouped by concern (auth/rate-limits, canary, logging, models, size limits, paths) with one-line comments + defaults; drop or annotate the dead `CF_*`/`PI_*` keys (verify `PI_HOST`'s few references first).
- [ ] Fix the header: replace the `bash bmo.sh <command>` claim with how the file is actually consumed (systemd `EnvironmentFile`/dotenv at app boot via `config_preflight`).
- [ ] De-duplicate the third list: make `setup-bmo.sh` seed `.env` by copying `.env.template` instead of its own inline heredoc.
- [ ] Optional guard: a small test (alongside `tests/test_config_preflight.py`) asserting every `BMO_*` var read under `pi/` appears in `.env.template`, so the two cannot drift again.

**Blocked by:** none

**Related files:** `bmo/.env.template`, `bmo/pi/services/config_preflight.py`, `bmo/pi/tests/test_config_preflight.py`, `bmo/setup-bmo.sh` (section 7 inline `.env` heredoc)

**Related entries:** BMO-RESOLVED-ISSUES ".env.example + fail-fast startup config preflight" (`00596a22`) — the state this entry reports drift from.


### [2026-06-29] `agents/` is a 40-file flat package with no sub-grouping — four distinct agent families (D&D, home/IoT, dev-meta, infra) live side-by-side at the top level, the same un-grouped-cluster pattern already logged for the `services/` game files

- **Category:** future-idea (structure / DX), debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of the `bmo/pi/agents/` package layout vs the `services/` subpackage conventions (`services/calendar/`, `services/voice/`)

**Description:**
`bmo/pi/agents/` holds **40 flat `.py` modules** with zero sub-packaging — every agent and every piece of agent infra sits directly at `agents/`. The set cleanly partitions into four families that never share a directory:
- **D&D / game agents:** `dnd_dm.py`, `encounter_agent.py`, `lore_agent.py`, `npc_dialogue_agent.py`, `rules_agent.py`, `treasure_agent.py`, `session_recap_agent.py`.
- **Home / IoT / assistant agents:** `smart_home_agent.py`, `weather_agent.py`, `calendar_agent.py`, `timer_agent.py`, `list_agent.py`, `routine_agent.py`, `music_agent.py`, `alert_agent.py`.
- **Dev / meta agents:** `code_agent.py`, `deploy_agent.py`, `security_agent.py`, `testing_agent.py`, `review_agent.py`, `docs_agent.py`, `design_agent.py`, `plan_agent.py`, `research_agent.py`, `learning_agent.py`, `monitoring_agent.py`, `cleanup_agent.py`.
- **Infra / plumbing (not routable agents):** `base_agent.py`, `router.py`, `orchestrator.py`, `_registry.py`, `mcp_client.py`, `mcp_manager.py`, `memory.py`, `conversation.py`, `hooks.py`, `settings.py`, `scratchpad.py`, `custom_commands.py`, `project_context.py`, `vtt_sync.py`.

This is the **same "largest un-grouped cluster" structural smell already logged for the D&D/game files at `services/` top level** (this log, 2026-06-28 — "~11 flat files at `services/` top level with no `services/game/` subpackage"), but `agents/` is bigger (40 vs ~11) and mixes *four* families plus the routing/registry infra in one flat namespace. The package already has a documented catalog (`bmo/docs/AGENTS.md` — "28 routable agents + infra classes"), so this is purely a *grouping/structure* nit, not a docs gap: opening `agents/` gives no visual cue which file is a routable agent vs. plumbing, and the four domains are only distinguishable by filename prefix convention.

**Hypothesis / root cause:** agents were added one-at-a-time as capabilities grew; the routing layer (`router.py` / `_registry.py` / `orchestrator.py`) keys on module/agent identifiers rather than directory, so a flat layout kept working and there was never a forcing function to introduce subpackages — exactly how the `services/` game cluster accreted.

**Proposed fix / improvement:**
- [ ] Introduce family subpackages mirroring the `services/calendar/` + `services/voice/` precedent: `agents/dnd/`, `agents/home/`, `agents/dev/` (or `agents/meta/`), keeping the routing/registry/base infra at `agents/` top level (`base_agent.py`, `router.py`, `orchestrator.py`, `_registry.py`, `mcp_*`, `memory.py`, `conversation.py`, `hooks.py`).
- [ ] Keep imports stable via the `_registry.py` indirection (and/or re-exports from `agents/__init__.py`) so the router/orchestrator surface does not change; gate on pytest + the CI 4-gate (behavior-neutral move).
- [ ] Update the `bmo/docs/AGENTS.md` catalog to reflect the family grouping once moved.
- [ ] Coordinate with the existing `services/` game-cluster entry (this log, 2026-06-28) so both un-grouped clusters are restructured under one consistent "group by domain family" convention rather than ad-hoc.

**Related files:** `bmo/pi/agents/` (whole package), `bmo/pi/agents/router.py`, `bmo/pi/agents/_registry.py`, `bmo/pi/agents/orchestrator.py`, `bmo/docs/AGENTS.md`

**Related entries:** this log, 2026-06-28 "The D&D / game subsystem is ~11 flat files at `services/` top level… with no `services/game/`… subpackage"; this log, 2026-06-29 "`app.py` is a 3,087-line half-decomposed Flask god-module".

### [2026-06-29] `dev/` is a misleading mixed bag — it holds 4 **production runtime** modules the IDE + agents depend on (`terminal_service`, `file_watcher`, `dev_tools`, `claude_tools`) alongside genuinely dev-only tooling, inviting a "dev/ is non-prod, safe to skip/delete" mistake

- **Category:** future-idea (structure / naming), design-gotcha, debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of `bmo/pi/dev/` and a grep of which `dev/` modules are imported by non-dev production code

**Description:**
`bmo/pi/dev/` presents itself as a non-production scratch area — its own `dev/ai-temp/README.md` says the folder is for "**Not** production… ad-hoc utilities… Delete or promote to `scripts/` if something becomes operational." But four modules at `dev/` top level are in fact **hard production runtime dependencies** of the IDE feature and the agent tool-execution path:
- `dev/terminal_service.py` (`TerminalManager`) → imported by `routes/ide.py` and `ide_app/ide_app.py`.
- `dev/file_watcher.py` (`FileWatcher`) → imported by `routes/ide.py`.
- `dev/dev_tools.py` (`dispatch_tool`, `execute_confirmed`, `write_file_confirmed`, `list_directory`, `read_file`, `edit_file`, `git_command_args`) → imported by `app.py`, `agent.py`, and `routes/ide.py` (5 prod import sites) — these are the core agent/IDE tool primitives.
- `dev/claude_tools.py` (`claude_chat_with_tools`, `set_auto_approve`, `tools_to_claude_format`) → imported by `routes/ide.py` and `agents/code_agent.py`.

Meanwhile the genuinely dev-only contents (`dev/benchmarks/`, `dev/diagnostics/`, `dev/ai-temp/`, and `dev/bmo_ui_lab_server.py` — 2,163 lines, **0** production importers) sit in the same package. So `dev/` conflates "production code that powers the IDE + agent tools" with "throwaway benchmarks/experiments." The name actively misleads: a future contributor (or a deploy/packaging change) that treats `dev/` as excludable — the natural reading reinforced by `ai-temp/README.md` — would break the IDE terminal, file-watching, agent tool dispatch, and `code_agent` Claude tooling. This is a design-gotcha because the breakage is non-obvious and runtime-only (the imports are lazy/`from dev.… import …` inside functions in `routes/ide.py`, so it would not surface at startup).

**Hypothesis / root cause:** the IDE/agent tool primitives were prototyped under `dev/` (where IDE/agent experimentation started) and graduated to production without being relocated; the lazy in-function imports hid the prod coupling, so the `dev/` name was never revisited.

**Proposed fix / improvement:**
- [ ] Relocate the four production modules out of `dev/` into a clearly-production home — e.g. an `ide/` package (`ide/terminal_service.py`, `ide/file_watcher.py`) and a `tools/` package (`tools/agent_tools.py` ← `dev_tools.py`, `tools/claude_tools.py`) — updating the import sites in `app.py`, `agent.py`, `routes/ide.py`, `ide_app/ide_app.py`, `agents/code_agent.py`. Behavior-neutral; gate on pytest + the CI 4-gate.
- [ ] Leave only genuinely dev-only material under `dev/` (`benchmarks/`, `diagnostics/`, `ai-temp/`, `bmo_ui_lab_server.py`) and tighten `dev/`'s README to state plainly that nothing under `dev/` is a runtime dependency (so the "skip/delete dev/" assumption becomes safe and true).
- [ ] Until relocated, add a `bmo/docs/DESIGN-CONSTRAINTS.md` note: "`dev/terminal_service`, `dev/file_watcher`, `dev/dev_tools`, `dev/claude_tools` are production runtime deps of the IDE + agents despite living under `dev/` — do NOT exclude `dev/` from deploy or delete it."

**Related files:** `bmo/pi/dev/terminal_service.py`, `bmo/pi/dev/file_watcher.py`, `bmo/pi/dev/dev_tools.py`, `bmo/pi/dev/claude_tools.py`, `bmo/pi/dev/ai-temp/README.md`, `bmo/pi/routes/ide.py`, `bmo/pi/ide_app/ide_app.py`, `bmo/pi/app.py`, `bmo/pi/agent.py`, `bmo/pi/agents/code_agent.py`

**Related entries:** this log, 2026-06-28 "`pi/scripts/` has no README and ships two non-standard `*.router-deployed` / `*.reference` notify copies" (sibling "what here is operational vs. ad-hoc is unclear" smell).

### [2026-06-29] Speaker identity is resolved every voice turn but dropped before the agent layer — `run_agent`/`agent.run` never receive `speaker`, so memory/lists/learning/personality stay single-user despite BMO already knowing who is talking

- **Category:** future-idea (capability / UX)
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the voice pipeline → orchestrator → agent dispatch path and the per-user state held by the memory/list/learning agents

**Description:**
Every voice turn already pays for speaker identification: `VoicePipeline.identify_speaker()` runs at `services/voice/voice_pipeline.py:436` (its own recorded latency stage, `_record_stage("identify_speaker", …)`), the result gates unregistered speakers (`if speaker == "unknown" and profiles: …ignore`), and the `speaker` string is threaded into the chat callbacks (`_chat_stream_callback(text, speaker)` / `_chat_callback(text, speaker)`) and on into `Orchestrator.handle(message, speaker, history, services, …)` (`agents/orchestrator.py:85`). **But the orchestrator uses `speaker` only for telemetry/UX emits** — the `agent_selected` SocketIO event and the plan-mode passthrough — and then calls `run_agent(agent_name, clean_message, history=history)` **without it**. `run_agent` / `agent.run(message, history, context)` have no `speaker`/`user` parameter, and `context` is `None` on the normal path, so the identified speaker is **discarded before any agent runs**. The downstream agents are correspondingly single-user: `agents/learning_agent.py` persists one global `profile` + `entries` blob (`get_profile()` returns `self._memory.get("profile", {})`, not a per-speaker map), and lists / memory / calendar / personality are likewise global. Net: the system spends inference resolving *who* is speaking, supports *multiple* enrolled voice profiles (`data/voice_profiles.json`, `services/voice/speaker_enrollment.py`), then throws that identity away — so "remember that I like X", "add eggs to my list", or a personalized greeting from any household member all read and write the same shared store, and BMO can never answer "what's on **my** calendar" differently per person even though it knows the speaker.

**Hypothesis / root cause:** speaker-ID was built for the *gate* use case (ignore strangers / label the transcript line) first; threading it through the agent execution context and re-keying the per-user stores (learning/memory/lists) is a larger, separate piece of work that was never done, so `speaker` stops at the orchestrator boundary.

**Proposed fix / improvement:**
- [ ] Add an optional `speaker`/`user` field to the agent call path — either widen `run_agent(..., context=...)` to always pass `{"speaker": speaker}` from `Orchestrator.handle`, or add a first-class param — so agents can opt into per-user behavior without changing the router.
- [ ] Re-key the genuinely user-scoped stores by speaker: `learning_agent` profile/entries, `list_service` lists, and the personalization the personality engine could use (e.g. per-user greeting), with a clear default/fallback bucket for `"unknown"` / single-user setups so nothing regresses when only one profile exists.
- [ ] Keep it behavior-neutral by default (one enrolled profile → identical behavior to today) and gate the multi-user paths on `len(profiles) > 1`, so the feature only activates in actual multi-person households.
- [ ] Add tests: speaker A's "remember X" must not surface for speaker B; unknown speaker falls back to the shared bucket.

**Blocked by:** none (additive; the identity value is already computed and already reaches the orchestrator).

**Related files:** `bmo/pi/services/voice/voice_pipeline.py:436` (`identify_speaker`), `:1448` (definition), `bmo/pi/agents/orchestrator.py:85` (`handle` — receives `speaker`), `:124` (`run_agent` — does not), `bmo/pi/agents/learning_agent.py` (global `profile`/`entries`), `bmo/pi/services/list_service.py`, `bmo/pi/services/voice/speaker_enrollment.py`, `bmo/pi/data/voice_profiles.json`.

**Related entries:** Future-idea 2026-06-28 (agent-registration observability) is adjacent in that both concern the orchestrator/agent layer, but this is the un-flagged *speaker-context-not-propagated* gap, not a registration/observability one.

### [2026-06-29] Tier-2 keyword router has example-assertion tests but no measured accuracy / confusion-matrix eval, so a newly-added keyword can silently steal routes among the ~28 agents' hand-maintained substring lists

- **Category:** future-idea (DX / observability), UX
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `agents/router.py` Tier-2 keyword scoring and its test coverage in `tests/agents/test_0_routing_accuracy.py`

**Description:**
The Tier-2 keyword router (`agents/router._check_keywords`) scores each agent by raw substring hit count (`count = sum(1 for kw in keywords if kw in lower)`) and returns `max(scores, key=scores.get)`. The `KEYWORD_PATTERNS` map is ~28 agents' worth of hand-maintained substrings, several of them very generic — e.g. `lore` owns `"who is"`, `"what is a"`, `"history of"`; `rules` owns `"how does"`, `"can i"`, `"does this work"`. These collide easily with each other and with `conversation`, and ties are resolved by `max()` returning the **first** key in `KEYWORD_PATTERNS` insertion order (today `code` wins ties) — a determinism-by-declaration-order the existing tests explicitly tolerate (`test_0_routing_accuracy.py:123,146`: "either agent is a valid result"). Coverage is solid for the *cases someone thought to assert*, but it is pass/fail example assertions — **there is no aggregate accuracy number, no per-agent confusion matrix, and no labeled corpus**. So when someone adds a keyword to agent X that happens to be a substring of utterances meant for agent Y, nothing fails unless an assertion already pinned that exact X/Y pair. Per-tier *counters* exist (`bmo_router_tier_keyword_total`, etc., added in the resolved 2026-06-23 telemetry work) but they count *which tier fired*, not *whether the chosen agent was correct* — so misroutes, the single biggest voice-UX failure mode, remain unmeasured. The file name `test_0_routing_accuracy.py` promises an accuracy measurement the file does not actually compute.

**Hypothesis / root cause:** the router grew agent-by-agent with each new agent appending its own keyword list; tests were added per agent as examples rather than as a corpus-driven accuracy gate, and the telemetry pass added tier counters but not an outcome/correctness signal.

**Proposed fix / improvement:**
- [ ] Convert the scattered example assertions into a single labeled corpus (`utterance → expected_agent`, dozens per agent incl. known-tricky generic phrases) and compute an **accuracy %** + a **confusion matrix** in the test, failing on a regression threshold and printing the top confused agent pairs — turning the existing telemetry/board metric into a measured DX gate.
- [ ] Use the confusion output to find and tighten the genuinely collision-prone generic keywords (`"who is"`, `"what is a"`, `"how does"`, `"can i"`), e.g. require a longer/multi-word anchor or a minimum score margin before Tier-2 commits (fall through to default/Tier-3 on a weak single-keyword tie).
- [ ] Optional closed loop: now that per-tier counters exist, periodically sample real (anonymized) routed utterances + chosen agent into the corpus so the eval reflects production phrasing, not just hand-written examples.

**Blocked by:** none.

**Related files:** `bmo/pi/agents/router.py` (`_check_keywords`, `KEYWORD_PATTERNS`, `route`), `bmo/pi/tests/agents/test_0_routing_accuracy.py`, `bmo/pi/services/metrics_counters.py`.

**Related entries:** Resolved 2026-06-23 (router per-tier telemetry + Tier-3 re-enable) — that added *tier* counters; this is the un-addressed *routing-correctness* measurement gap on top of it.

### [2026-06-29] `app.py` is a 3,087-line half-decomposed Flask god-module — PHASE-16 extracted 7 blueprints but ~20 domains + 145 inline routes still live in it, with no tracking of what remains

- **Category:** future-idea (structure / DX), debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of the largest bmo source files vs the `routes/` blueprint split

**Description:**
`bmo/pi/app.py` is 3,087 lines — the largest non-bot source file in the tree — and is a **partially-decomposed** Flask god-module. PHASE-16 began extracting the HTTP/WS surface into a `routes/` package and the bottom of the file registers seven blueprints (`register_ide`, `register_game_relay`, `register_library`, `register_rclone`, `register_sounds`, `register_system`, `register_music`, `register_calendar` at `app.py:3021-3028`, plus `chat_api`/`realtime_ws`/`tv_api`). But the extraction stopped half-way: `app.py` still defines **145 inline `@app.route` handlers** and, by its own module docstring (`app.py:1-13`), "still hosts the un-extracted domains: camera, voice enroll, timers/alarms, LED + OLED face, Discord DM bridge, scenes, weather, smart-home, notes, lists, alerts, routines, personality, notifications, MCP, commands, memory, voice-settings, models, and the games registry SSE." So the route surface is split across two homes — a `routes/` blueprint package **and** a 3k-line `app.py` — with no rule or tracked checklist for which domains remain or in what order to finish. This is the same "decompose the oversized module behind a stable public surface" pattern already logged for `services/monitoring.py` (this log, 2026-06-28), `VoicePipeline` (2026-06-28, since resolved), and the social/DM bots — but `app.py` is the un-flagged route-layer instance, and unlike those it is mid-migration with a documented-but-unfinished target. Net: adding or changing any of the ~20 inline domains means navigating a 3k-line file even though the `routes/` convention to host them already exists.

**Hypothesis / root cause:** PHASE-16 extracted the highest-traffic surfaces (system/music/calendar/tv/chat/ide/realtime) into blueprints first and left the long tail of smaller domains inline; the migration was never finished and the remaining set is tracked only as prose in the docstring, so there is no forcing function (or checklist) to complete it.

**Proposed fix / improvement:**
- [ ] Continue the PHASE-16 extraction one cohesive domain at a time into new `routes/` blueprints (e.g. `routes/timers_api.py`, `routes/face_api.py` for LED+OLED, `routes/smart_home_api.py`, `routes/notes_lists_api.py`, `routes/scenes_api.py`, `routes/personality_api.py`, `routes/notifications_api.py`), each registered via a `register_*` shim like the existing blueprints, so `app.py` shrinks toward a thin factory (`Flask`/`SocketIO` construction + auth gate + `init_services()` + the registration block).
- [ ] Track the remaining set explicitly: convert the docstring's prose list of "un-extracted domains" into a short checklist in `bmo/docs/ARCHITECTURE.md` (or a `routes/README.md`) so the half-done state is visible and the convention ("new routes go in a `routes/` blueprint, not `app.py`") is written down.
- [ ] Keep each extraction behavior-neutral and gate it on pytest + the CI 4-gate (no endpoint path/response changes), per the fix-forward stance.

**Related files:** `bmo/pi/app.py:1-13` (docstring inventory of un-extracted domains), `app.py:3021-3028` (blueprint registration block), `app.py` (145 `@app.route` handlers); precedent blueprints `bmo/pi/routes/{system_api,music_api,calendar_api,tv_api,chat_api,ide}.py`; `bmo/pi/docs/ARCHITECTURE.md`.

**Related entries:** Future-ideas 2026-06-28 (`services/monitoring.py` god-class) and the resolved `VoicePipeline` / social-bot / DM-bot decompositions — same oversized-module-behind-a-stable-surface pattern; this is the route-layer instance and the only one that is explicitly mid-migration.

### [2026-06-29] ~5.4 MB of machine-generated RAG chunk-index JSON is committed to git (`data/rag_data/*.json`), regenerable from tracked sources and with no drift/freshness guard

- **Category:** debt (repo-hygiene / portability)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** read-only scan of the largest tracked data artifacts under `bmo/pi/data/`

**Description:**
`bmo/pi/data/rag_data/` holds five tracked, machine-generated RAG indexes totalling **~5.4 MB** — `chunk-index-dnd.json` alone is **5.5 MB** (the single largest file in the bmo tree), plus `chunk-index-{anime,games,movies,music}.json`. They are **not** gitignored (`git check-ignore` returns non-zero; `git ls-files` lists all five) and are produced by the tracked offline script `services/build_rag_indexes.py`, which `save_index()`s them into `RAG_DIR` from the tracked `data/5e-references/` (3.6 MB, 62 files) and the other knowledge sources. `docs/SERVICES.md:70` describes `build_rag_indexes.py` as an "offline script to rebuild RAG indexes," so the artifacts are reproducible from sources already in the repo. Two smells follow: (1) **repo bloat** — a 5.4 MB regenerable blob is carried in every clone/worktree (this scanner's own `git worktree add` checked out 6,406 files including it), and a regenerated index is a 5 MB churning diff whenever it is rebuilt; (2) **silent drift** — each index carries a frozen `"createdAt": "2026-03-06T..."` snapshot with no check that it still matches the current `data/5e-references/` content, so edits to the source markdown leave the committed index stale until someone remembers to rerun the script (the only commit touching `chunk-index-dnd.json` is the original monorepo-reorg import, i.e. it has never been regenerated in-tree). This is hygiene/debt, not a bug — RAG works today — but it is the kind of large committed generated artifact that is usually either gitignored-and-rebuilt or, if intentionally committed, documented + freshness-checked, and here it is neither.

**Hypothesis / root cause:** the indexes were generated once and committed alongside the source references during the monorepo reorg (so the Pi could load RAG without a build step), but no decision was recorded about whether they should be tracked, and no regeneration/freshness step was wired, so they sit as a frozen 5 MB snapshot.

**Proposed fix / improvement (pick one, deliberately):**
- [ ] **Option A — stop tracking, rebuild on deploy.** Add `bmo/pi/data/rag_data/*.json` to `.gitignore`, `git rm --cached` them, and have `build_rag_indexes.py` run as a deploy/first-boot step (`scripts/deploy.sh` or `setup-bmo.sh`). Only if the rebuild cost + any embedding-model dependency is acceptable on the Pi — verify before choosing this.
- [ ] **Option B — keep tracked, but document + guard.** If they are committed on purpose (Pi can't cheaply rebuild), record that in `bmo/docs/SERVICES.md` / `DESIGN-CONSTRAINTS.md` ("these indexes are intentionally committed; rebuild with `build_rag_indexes.py` after editing `data/5e-references/`") and add a small preflight/CI freshness check comparing each index's source-hash/`createdAt` against `data/5e-references/` so a stale index is surfaced instead of drifting silently.
- [ ] Either way, note that `build_rag_indexes.py:15` resolves `RAG_DIR` via the hardcoded `~/home-lab/...` path — that portability angle is already covered by the path-centralization entry (BMO-RESOLVED 2026-06-24, `BMO_ROOT`/`paths.py`); cross-referenced here, not re-logged.

**Related files:** `bmo/pi/data/rag_data/chunk-index-dnd.json` (5.5 MB) + `chunk-index-{anime,games,movies,music}.json`; generator `bmo/pi/services/build_rag_indexes.py:15,44,366`; sources `bmo/pi/data/5e-references/` (tracked); `bmo/pi/docs/SERVICES.md:70`; `bmo/.gitignore`.

**Related entries:** Debt (BMO-RESOLVED 2026-06-24) "~860 KB of orphaned vendored frontend assets in `web/static/`" — same large-tracked-artifacts-that-should-not-be-in-git smell (there the fix was deletion; here it is gitignore-and-rebuild or document-and-guard). Future-idea 2026-06-28 (`services/game/` subpackage incl. a `rag/` home for `rag_search.py`+`build_rag_indexes.py`) — that is about the RAG *code* location; this entry is about the generated RAG *data* artifacts, distinct.
### [2026-06-29] `hardware/fan_control.py` is the one hardware module left out of the off-Pi sim/test/logging parity — unguarded `import smbus`, no `SimFanController`, bare `print()`, and an undocumented `smbus`-vs-`smbus2` / system-python-vs-venv split

- **Category:** future-idea (portability, DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `hardware/` against the `BMO_SIMULATE=1` sim layer and `tests/conftest.py` mock list

**Description:**
The other three hardware controllers — `led_controller.py`, `oled_face.py`, `camera_service.py` — each (a) guard their Pi-only imports behind `try/except ImportError` (`led_controller.py:19-22`, `oled_face.py:11-16`, `camera_service.py:26-33`), (b) have a stub counterpart in `hardware/sim_hardware.py` (`SimLedController:49`, `SimOledFace:69`, `SimCameraService:77`) wired into `app.py`'s `BMO_SIMULATE` branch (`app.py:586,608,650`), and (c) log through `services.bmo_logging`. `fan_control.py` does **none** of these and is the lone exception:
- It does `import smbus` unguarded at top of module (`fan_control.py:11`), so the module raises `ImportError` on import on any non-Pi host (or any host without the apt `python3-smbus` package) — it can't even be imported off-Pi for a smoke test.
- There is **no `SimFanController`** in `sim_hardware.py`, so the fan is the one piece of BMO hardware with no off-Pi observable stub — the gap the 2026-06-22 "Mock-hardware simulator" resolved entry left open (it covered LED/OLED/camera only).
- It uses bare `print(f"[fan] …", flush=True)` everywhere instead of `get_logger("fan")`, inconsistent with the rest of the tree and counter to the `.print-baseline` print-retirement ratchet.
- **Module/runtime mismatch:** the venv pins `smbus2==0.6.1` (`requirements.txt:372`) and `tests/conftest.py:24` mocks `smbus2` — but `fan_control.py` imports `smbus` (the apt `python3-smbus` C module), a *different* package. This works in production only because `bmo-fan.service` runs `/usr/bin/python3 …/fan_control.py` (system Python, not the venv) while every other unit runs `venv/bin/python`. That dual-runtime split is real, deliberate, and **undocumented** — and it means a test that imported `fan_control` would fail even with the conftest mocks, which is presumably why there is **zero test coverage** for it (no `tests/**fan**`).

Net: the fan path is the least-portable, least-testable, least-consistent hardware module, purely because it predates / was never folded into the sim+logging+venv conventions the others follow.

**Hypothesis / root cause:** `fan_control.py` was written as a standalone always-on systemd script (its own process, system Python for `smbus`) before the `BMO_SIMULATE` sim layer and `bmo_logging` conventions existed, and was never retrofitted because it "just runs on the Pi" and isn't imported by `app.py`.

**Proposed fix / improvement:**
- [ ] Switch `fan_control.py` to `smbus2` (already a pinned dep and conftest-mocked) so it can run under the venv like every other unit, OR explicitly document the system-Python requirement in `bmo-fan.service` + `docs/SYSTEMD.md`; either way, guard the import (`try: import smbus2 as smbus / except ImportError:`) so the module is importable off-Pi.
- [ ] Add a `SimFanController` to `sim_hardware.py` (fake duty/temperature pushed to the `sim_hardware` SocketIO event) so the fan joins LED/OLED/camera in `BMO_SIMULATE` mode and the curve logic is UX/test-observable off-device.
- [ ] Replace `print(...)` with `get_logger("fan")` (drops fan off the print ratchet) and add a small unit test for `duty_for_temp()` + hysteresis (pure functions, no hardware) once the import is guarded/mocked.

**Related files:** `bmo/pi/hardware/fan_control.py:11` (`import smbus`), `:79-83` (`run()` bus init), `bmo/pi/hardware/sim_hardware.py:49,69,77` (the three sims, no fan), `bmo/pi/systemd/bmo-fan.service` (`/usr/bin/python3` ExecStart), `bmo/pi/requirements.txt:372` (`smbus2`), `bmo/pi/tests/conftest.py:24` (mocks `smbus2`, not `smbus`), `bmo/pi/app.py:586,608,650` (`BMO_SIMULATE` wiring).

**Related entries:** BMO-RESOLVED 2026-06-22 ("Mock-hardware simulator for off-Pi development") — added `sim_hardware.py` for LED/OLED/camera and explicitly scoped out the fan; this entry is the follow-up that closes that gap.

---

### [2026-06-29] A silently-dead `bmo-fan` controller is unobservable and has no thermal fail-safe — least-hardened unit (no Watchdog/sandbox), monitoring treats it as optional (info, not warning), and the I2C loop never commands a safe duty on error

- **Category:** future-idea (reliability + observability)
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `bmo-fan.service` + `fan_control.py` failure paths vs how the DM bot and `monitoring.py` treat the unit (distinct from the existing fan-*curve/cooling-capacity* entries)

**Description:**
This is **not** the well-logged "fan curve too weak under LLM load" thermal issue (BMO-ISSUES 2026-06-29 + several resolved entries). It is about what happens when the fan *controller software* dies or wedges — a path that is currently both unsafe and invisible:
- **No fail-safe duty on error.** In `fan_control.py`'s loop, an I2C write exception closes and reopens the bus and `sleep`s, but never commands a safe (high) duty first. The FNK0100K holds its last-set duty when commands stop, so if the loop starts erroring while duty was low (cool idle), the fan can stay pinned low while the SoC heats up. A thermal controller should fail *hot* (drive max duty on any uncertainty), not hold-last.
- **Least-hardened unit.** `bmo-fan.service` is a bare `Type=simple` unit with only `Restart=always`. Compare `bmo-dm-bot.service`, which has `WatchdogSec=120` (systemd kills+restarts a stalled event loop), `StartLimitIntervalSec/Burst`, and full sandboxing. The fan loop can wedge (e.g. a hung I2C transaction) without exiting, and nothing would notice — there is no watchdog ping, unlike the bot.
- **Failure is classified as info, not a warning.** `monitoring.py:672` lists `bmo-fan` in `_OPTIONAL_DISABLED_SERVICES`, so `_check_systemd_services` treats a down/disabled `bmo-fan` as informational rather than a per-cycle WARNING (the kiosk entry, BMO-RESOLVED 2026-06-24, documents exactly this branch). Monitoring *does* already read `vcgencmd get_throttled` for thermal/throttle state (`monitoring.py:1444+`) and alerts on CPU temp — but it never correlates "`bmo-fan` not active" with "temp/throttle rising," so a silently-dead fan during a hot workload would surface only as a generic temp-critical alert with no pointer to the actual cause.

So the one service guarding thermal safety is the least observable and least defensively-coded, and its monitoring is deliberately muted.

**Hypothesis / root cause:** `bmo-fan` was treated as best-effort cosmetic cooling (hence "optional" in monitoring and a minimal unit), predating the watchdog/sandbox hardening the Discord bots later got; the control loop optimizes for quiet (hold-last, sub-threshold deltas) rather than for fail-safe thermal behavior.

**Proposed fix / improvement:**
- [ ] Fail hot: on any loop exception (and on `SIGTERM`/clean stop while the Pi is warm), command full duty (`255`) before reopening/closing the bus, instead of holding last duty or zeroing it.
- [ ] Add a liveness signal: convert `bmo-fan.service` to `Type=notify` + `WatchdogSec` (ping each successful loop tick), mirroring `bmo-dm-bot.service`, so a wedged loop is restarted rather than silently stuck.
- [ ] Make a dead fan a real alert when it matters: in `monitoring.py`, escalate `bmo-fan` down→WARNING/CRITICAL *when CPU temp or throttle flags are elevated* (correlate the existing throttle/temp probe with the unit state) instead of the blanket "optional → info" treatment.

**Related files:** `bmo/pi/hardware/fan_control.py` (loop error handling ~`:96-107`, `KeyboardInterrupt` stop path zeroes duty), `bmo/pi/systemd/bmo-fan.service` (bare unit), `bmo/pi/systemd/bmo-dm-bot.service` (`WatchdogSec`/sandbox model to mirror), `bmo/pi/services/monitoring.py:672` (`_OPTIONAL_DISABLED_SERVICES`), `:1177` (`_MONITORED_SERVICES`), `:1444+` (throttle/power probe to correlate).

**Related entries:** BMO-ISSUES 2026-06-29 (Pi thermally throttles under local-LLM fallback) + BMO-RESOLVED fan-curve entries — those are about cooling *capacity*; this is about controller *robustness + observability*, the complementary software half. BMO-RESOLVED 2026-06-24 (kiosk `_OPTIONAL_DISABLED_SERVICES` mis-classification) — same optional-service classification mechanism.

---

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

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
