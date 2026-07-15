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

### [2026-07-15] `bmo/docs/AGENTS.md` "Adding a new agent" recipe has drifted from the real code on all four steps — flat module path, wrong base-class API (`async invoke` vs sync `run`), a `REGISTRY` dict that doesn't exist, and regex keywords the router would treat as never-matching substrings

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (docs-vs-code cross-check after the agents/ family-subpackage move)

**Description:**
The catalog tables in `bmo/docs/AGENTS.md` were updated for the agents/ regrouping (they correctly show `dnd/…`, `home/…`, `dev/…` paths), but the "Adding a new agent" recipe (`AGENTS.md:131-158`) was not, and every one of its four steps now misleads:
1. Step 1 says create `bmo/pi/agents/my_agent.py` — agents live in family subpackages (`agents/home/`, `agents/dnd/`, `agents/dev/`) since the 2026-06-29 regrouping; a new flat module would be the lone exception.
2. The example subclass defines `async def invoke(self, user_msg, context)` returning a dict — `BaseAgent`'s real interface is the synchronous `run(message: str, history: list[dict], context: dict | None) -> AgentResult` (`agents/base_agent.py:108`); an agent written from the doc's template would never be called.
3. Step 2 shows `from agents.my_agent import MyAgent` + `REGISTRY["my_agent"] = MyAgent` — `agents/_registry.py` has no `REGISTRY` dict; registration is a `_AGENT_SPECS` tuple of `("agents.<family>.<module>", "create_<name>_agent")` factory-name pairs with per-entry import isolation (PHASE-15 15A), so the doc's mechanism doesn't exist and would also bypass the one-bad-agent-doesn't-kill-all guarantee.
4. Step 3 shows regex-style keywords (`r"\bmy\s+thing\b"`) — `KEYWORD_PATTERNS` values are plain substrings matched via `kw in lower` in `router._check_keywords`, so a regex string with `\b`/`\s` would literally never match any utterance.

Net: the one how-to a future contributor (or the code agent itself) would follow to extend the agent system produces a non-loading, non-routing agent.

**Hypothesis / root cause:** the regrouping pass updated the catalog tables (its stated checklist item) but nobody re-read the prose recipe below them; the recipe also predates the `_AGENT_SPECS` isolation rework and the substring router, so it has drifted through at least three refactors unnoticed.

**Proposed fix / improvement:**
- [ ] Rewrite the recipe by transcribing a real, recent, small agent (e.g. `agents/home/weather_agent.py` + its `_AGENT_SPECS` row + its `KEYWORD_PATTERNS` list) so every step is copy-paste true: family-subpackage path, `create_*_agent()` factory, `run(...) -> AgentResult`, plain-substring keywords.
- [ ] Add one sentence noting keywords are substrings (not regexes) and pointing at `tests/agents/test_0_routing_accuracy.py` for the routing assertions a new agent should extend.
- [ ] Optional guard: a tiny doc-truth test asserting the recipe's registry snippet stays in sync (e.g. grep AGENTS.md for `_AGENT_SPECS` once rewritten), in the spirit of the existing doc-truth phases.

**Blocked by:** none

**Related files:** `bmo/docs/AGENTS.md:131-158` ("Adding a new agent"), `bmo/pi/agents/base_agent.py:108` (`run`), `bmo/pi/agents/_registry.py` (`_AGENT_SPECS`), `bmo/pi/agents/router.py:55` (`KEYWORD_PATTERNS`)

**Related entries:** BMO-RESOLVED [2026-06-29] "`agents/` is a 40-file flat package…" (the move whose doc follow-through stopped at the tables); BMO-RESOLVED [2026-06-23] "`bmo/docs/AGENTS.md` opening line ('5 specialized AI agents') contradicts…" (same doc, earlier drift — this doc rots fast and has no truth-test).

---

### [2026-07-15] PHASE-18 is already fully implemented on master (bmo-resolver, 2026-07-02) but still sits in the active phases folder with Status "pending" — the numeric-order phase queue now has a stale no-op phase gating 19–21

- **Category:** docs, debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (active-phases vs resolved-log cross-check)

**Description:**
`bmo/docs/phases/PHASE-18-plan-agent-prompt-format-crash.md` prescribes three things: escape the unescaped braces in `DESIGN_PROMPT`, add a rendering unit test, and audit the other agent prompt templates. All three landed on master out-of-band via `auto/bmo-resolver` on 2026-07-02 (BMO-RESOLVED-ISSUES "[2026-07-02] Plan agent design phase always crashes — `DESIGN_PROMPT.format()` KeyError `'state'`…"): `agents/dev/plan_agent.py:49,51` now carry `{{state:…}}` / `{{scene:"movie"}}`, `tests/agents/test_plan_agent_prompts.py` exists and deliberately exercises the REAL prompt strings, and the resolution note documents the full template audit. Yet the phase file remains in the **active** `bmo/docs/phases/` folder and `PHASE-INDEX.md:43` still lists row 18 as `pending`. Since phases execute in numeric order, the phase-executer's next run would pick up PHASE-18 first and re-execute (or at best re-verify) an already-landed fix before reaching the genuinely pending PHASE-19–21 — wasted run, and the index misstates reality either way.

**Hypothesis / root cause:** two independent agents covered the same defect from different queues — the phase-maker authored PHASE-18 from the QA report while bmo-errors/bmo-resolver fixed the same finding from the issues log — and nothing in either workflow reconciles a resolver fix against pending phase docs.

**Proposed fix / improvement:**
- [ ] Verify-only pass (the phase's own cheap checks: render both prompts, run `test_plan_agent_prompts.py`), then move `PHASE-18-…md` to `completed/` with a short "superseded by bmo-resolver 2026-07-02 (see BMO-RESOLVED-ISSUES entry)" note appended, and flip `PHASE-INDEX.md` row 18 to `done`.
- [ ] Process nit for the phase-maker/resolver docs: when a resolver lands a fix that a pending phase file covers, annotate/close that phase in the same change (one-line rule in `bmo/docs/phases/INSTRUCTIONS.md` or the resolver instructions) so the queue can't hold zombie phases.

**Blocked by:** none

**Related files:** `bmo/docs/phases/PHASE-18-plan-agent-prompt-format-crash.md`, `bmo/docs/phases/PHASE-INDEX.md:43`, `bmo/pi/agents/dev/plan_agent.py:49,51`, `bmo/pi/tests/agents/test_plan_agent_prompts.py`

**Related entries:** BMO-RESOLVED-ISSUES [2026-07-02] "Plan agent design phase always crashes — `DESIGN_PROMPT.format()` KeyError `'state'`…" (the landed fix PHASE-18 duplicates).

---

### [2026-07-15] `pi/tests/` is an 86-file flat directory while the source it covers is now subpackaged — only `tests/agents/` mirrors a source package, so test discovery for any given module is grep-only

- **Category:** debt, future-idea (structure / DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (test-tree layout vs the post-regrouping source layout)

**Description:**
`bmo/pi/tests/` holds **86 flat `test_*.py` modules** plus a single subdir (`tests/agents/`, 9 files). Meanwhile the source tree those tests cover has been progressively subpackaged — `services/voice/`, `services/game/`, `services/calendar/`, `routes/`, `bots/social/` (+ games), `hardware/`, `ide/`, `tools/`, `agents/{home,dnd,dev}/` — so the test tree no longer mirrors the code tree anywhere except `agents/`. Consequences are mild but constant: locating the tests for a module is a grep exercise (voice tests `test_voice_pipeline.py`/`test_tts_cache.py`/`test_discord_tts.py`/`test_audio_output.py`/… sit interleaved with deploy, calendar, board and bot tests in one directory listing), related tests can't be run as a directory (`pytest tests/voice/`), and the flat dir keeps growing (~1 new file per feature). This is the same un-grouped-cluster smell already logged — and since fixed — for the flat `agents/` package and the `services/` game cluster; `tests/agents/` itself proves the mirrored-subdir convention works in this suite.

**Hypothesis / root cause:** tests were added one file per feature into the historically flat dir; the source-side regroupings moved code but never their tests, and pytest's recursive discovery means nothing ever forced the split.

**Proposed fix / improvement:**
- [ ] Introduce mirroring subdirs incrementally, one domain per small PR (`tests/voice/`, `tests/game/`, `tests/routes/`, `tests/bots/`, `tests/board/`…), `git mv` only — no content changes; pytest discovery is recursive so `pytest.ini` needs at most a glance (no `testpaths` pinning today).
- [ ] Keep `conftest.py` at `tests/` root (fixtures stay shared); add an `__init__.py` per new subdir matching the existing `tests/agents/__init__.py` pattern.
- [ ] Do it opportunistically per-domain (e.g. whenever a domain's tests are next touched) rather than big-bang, to keep multi-agent branch conflicts near zero.

**Blocked by:** none

**Related files:** `bmo/pi/tests/` (86 flat files), `bmo/pi/tests/agents/` (the working precedent), `bmo/pi/pytest.ini`, `bmo/pi/tests/conftest.py`

**Related entries:** BMO-RESOLVED [2026-06-29] "`agents/` is a 40-file flat package with no sub-grouping…" and [2026-06-28] "The D&D / game subsystem is ~11 flat files at `services/` top level…" — the source-side halves of the same pattern; this is the test-side remainder.

---
### [2026-07-15] Kiosk chat shows a single opaque "thinking" state while the voice path already streams — expose the existing sentence/chunk streaming to the web chat as incremental `chat_partial` SocketIO events

- **Category:** UX, future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan — read-only review of the chat delivery path (kiosk SocketIO vs. voice pipeline)

**Description:**
The kiosk chat is fire-and-wait: `bmo.js sendChat()` emits one `chat_message` (`web/static/js/bmo.js:1273`), sets `status="thinking"` behind a stuck-state watchdog (`_chatWatchdog`, `bmo.js:126,1278-1284`), and renders nothing until the single final `chat_response` arrives from `routes/realtime_ws.py:_finish_chat_response`. Meanwhile the **voice** path already has true streaming infrastructure: `VoicePipeline._chat_stream_callback` returns a generator of text chunks and `speech_output.stream_and_speak` speaks sentence-by-sentence as the LLM produces them (`services/voice/voice_pipeline.py:209-216,540-552`). So a long Code-Agent or D&D answer that streams audibly on the speaker sits behind an opaque amber "BMO is thinking!" spinner on the kiosk — the surface with a screen is the one that shows nothing incremental. The gap is plumbing, not capability: reuse the same streaming callback in `on_chat_message`, emit incremental `chat_partial` events (append-to-last-bubble on the client), and finish with the existing `chat_response` for persistence/TTS so history, pending-stub finalization (`chat_history.finalize_pending_assistant`), and multi-tab broadcast semantics stay unchanged.

**Proposed fix / improvement:**
- [ ] In `routes/realtime_ws.py`, when the agent path supports it, iterate the same chunk generator the voice pipeline uses and `socketio.emit("chat_partial", {"pending_id":…, "delta":…})` per chunk; keep the final `chat_response` exactly as today.
- [ ] In `bmo.js`, on `chat_partial` append the delta into the pending assistant bubble and re-arm the watchdog (chunks are a natural liveness signal); `chat_response` finalizes the bubble.
- [ ] Leave TTS on the final-response path (kiosk TTS already runs from `_finish_chat_response`) so nothing double-speaks.

**Blocked by:** none

**Related files:** `bmo/pi/routes/realtime_ws.py`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/services/voice/voice_pipeline.py`, `bmo/pi/services/voice/speech_output.py`

**Related entries:** BMO-SUGGESTIONS-LOG [2026-07-02] kiosk two-file god-module (any `bmo.js` change lands in the same flat file until that split happens)

### [2026-07-15] "What BMO remembers" is invisible and unmanageable from the kiosk — `/api/memory` GET/POST/DELETE endpoints exist with ZERO frontend callers, and learning-agent facts have no UI either

- **Category:** UX, future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan — read-only review of the auto-memory subsystem (`agents/memory.py`) and its HTTP/UI surface

**Description:**
BMO persists durable knowledge in two places — per-project auto-memory MD files (`agents/memory.py`, `data/memory/<md5>/MEMORY.md`, auto-loaded into the system prompt) and the learning agent's facts/profile blobs — but neither is visible anywhere a user can look. `app.py` already exposes a full CRUD surface at `/api/memory` (GET `app.py:2805`, POST `:2817`, DELETE `:2835`), yet grepping `api/memory` across `web/static/js/bmo.js` + `web/templates/index.html` finds **no callers**: the endpoints are dead surface. The only way to see or correct what BMO has memorized (a wrong "user preference", a stale decision, a fact attributed to the wrong speaker) is to SSH in and hand-edit MD5-named directories. A small "Memory" panel in kiosk settings — list per-project memories + learning-agent facts (per speaker, once the per-speaker data model lands), view/edit/delete — would make the memory system trustworthy and debuggable, and it is mostly wiring to endpoints that already exist. Privacy angle too: a household voice assistant that silently accumulates facts should let the household see and delete them.

**Proposed fix / improvement:**
- [ ] Add a kiosk settings sub-panel that lists memory projects (needs a small `/api/memory/list` addition — the current GET is single-project), renders `MEMORY.md`, and wires edit/clear to the existing POST/DELETE.
- [ ] Surface learning-agent facts in the same panel (grouped by speaker bucket) with per-fact delete.
- [ ] Show "memory loaded" provenance in chat (subtle indicator when auto-memory was injected into the prompt) so users learn the feature exists.

**Blocked by:** none (per-speaker grouping is nicer after the per-speaker data-model entry, but a single-user panel needs nothing)

**Related files:** `bmo/pi/agents/memory.py`, `bmo/pi/app.py` (memory routes ~2805-2846), `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`

**Related entries:** BMO-SUGGESTIONS-LOG [2026-07-03] per-speaker DATA MODEL still unbuilt (the facts/profile blobs this panel would display)

### [2026-07-15] Two append-only JSONL data files grow without cap or compaction — `board_decisions_outbox.jsonl` (cursor-consumed, never truncated) and `logs/unknown_notifications.jsonl` — while `wake_events.jsonl` already demonstrates the keep-tail cap pattern

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan — read-only sweep of JSONL writers under `services/` / `agents/`

**Description:**
Inventory of JSONL writers: `services/wake_events.py` caps itself (`BMO_WAKE_EVENTS_MAX=5000`, keep-tail rewrite at `wake_events.py:64-73`) — good. But `services/status_board.py:BOARD_DECISIONS` (`board_decisions_outbox.jsonl`) is append-only by design ("reading the append-only outbox never blocks a concurrent bot write") and its consumer (`scripts/board-pending-decisions.sh`) advances **per-producer byte-offset cursors** without ever compacting the file — every Approve/Deny click since the bridge shipped lives in the file forever, and the byte-offset cursors make naive truncation unsafe. `services/notification_service.py:UNKNOWN_NOTIF_LOG` (`data/logs/unknown_notifications.jsonl`, appended at `:563`) has no cap at all — the in-memory history is bounded (`MAX_HISTORY=100`) but the on-disk log is not. Growth is slow, so this is hygiene rather than a live bug — but both files ride the daily state backup (`backup-state.sh` tars all of `data/`), so unbounded files inflate every archive. Precedent for periodic trimming already exists in `scripts/stale-local-cleanup.sh` (notify.log tail-trim).

**Proposed fix / improvement:**
- [ ] Compact the decisions outbox by dropping lines already consumed by **all** known cursors and rebasing cursor offsets atomically (or switch cursors to record-count so truncation is safe).
- [ ] Cap `unknown_notifications.jsonl` with the same keep-tail rewrite `wake_events.py` uses (shared-helper candidate).
- [ ] Hook both into `stale-local-cleanup.sh` (weekly) rather than hot paths.

**Blocked by:** none

**Related files:** `bmo/pi/services/status_board.py`, `bmo/pi/scripts/board-pending-decisions.sh`, `bmo/pi/services/notification_service.py`, `bmo/pi/services/wake_events.py`, `bmo/pi/scripts/stale-local-cleanup.sh`

**Related entries:** none found (greps: jsonl / rotation / unbounded)

### [2026-07-15] `run-check.sh` admission gate is observability-blind — queue waits and EX_TEMPFAIL(75) timeouts go only to stderr, so agent runtime lost to queueing and refused heavy checks are invisible to the board/metrics

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan — read-only review of the heavy-check admission gate added after the 2026-07 OOM

**Description:**
`bmo/pi/scripts/run-check.sh` is the mandatory funnel for every heavy local `tsc`/`vitest`/build run by every scheduled agent on the Pi, and it can (by design) hold a job up to `RUN_CHECK_TIMEOUT_S` (900s default) or refuse it with exit 75. All of that is reported only as `log()` lines on stderr inside whichever agent transcript invoked it (`run-check.sh:160-171`) — no counter, no notify, no board surface. Consequences: (a) sustained RAM pressure that makes every agent burn 10+ minutes queueing per check is indistinguishable from healthy operation unless someone reads individual transcripts; (b) a repeated-timeout pattern (exit 75) — the "the Pi can no longer fit its own workload" early-warning signal — never reaches `monitoring.py` or the status board; (c) tuning `RUN_CHECK_RAM_FLOOR_MB`/`MAX_CONCURRENCY` is guesswork with no wait-time distribution to look at. The repo already has the natural sink: `services/metrics_counters.py` feeds the Prometheus `/metrics` endpoint, but a bash script can't call it — a tiny append-to-file record per admission (waited_s, outcome) that `monitoring.py` tails, plus a `notify.sh warn` after N consecutive timeouts, closes the gap.

**Proposed fix / improvement:**
- [ ] Have `run-check.sh` append one small record per admission attempt (ts, waited_s, outcome=admitted|timeout, cmd summary) to a capped data file.
- [ ] Teach `monitoring.py`/the board to read it: warn on consecutive timeouts or rising median wait; expose `bmo_run_check_wait_seconds` + timeout counters via the existing `/metrics`.
- [ ] Cap the file per the `wake_events.py` keep-tail pattern.

**Blocked by:** none

**Related files:** `bmo/pi/scripts/run-check.sh`, `bmo/pi/services/monitoring.py`, `bmo/pi/services/metrics_counters.py`, `bmo/pi/tests/test_run_check.py`

**Related entries:** BMO-ISSUES-LOG [2026-07-03] `test_ram_floor_blocks_and_never_launches` timing-flaky (same script, unrelated test-margin issue)

### [2026-07-03] Speaker context is now plumbed to the agent layer, but the full per-speaker DATA MODEL is still unbuilt — lists/calendar/personality + the memory `profile`/`preferences` blobs remain single-user

- **Category:** future-idea (capability)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-features-batch (follow-up to the resolved 2026-06-29 speaker-context plumbing)

**Description:**
The 2026-06-29 "speaker dropped before the agent layer" entry is resolved for the **plumbing**: `Orchestrator.handle` now passes `context={"speaker": speaker}`, `BaseAgent.speaker_bucket(context)` resolves the per-speaker bucket (with a `DEFAULT_USER` fallback for unknown/single-user), and `learning_agent` uses it to attribute + filter saved facts per speaker. What is **not** yet done is re-keying the remaining genuinely user-scoped stores by that bucket: `list_service` lists, calendar, the personality engine's per-user greeting, and the learning agent's `profile`/`preferences` blobs (still global maps, only `facts`/`entries` are speaker-stamped today). The seam is in place — this is the larger data-layer piece deliberately deferred.

**Proposed fix / improvement:**
- [ ] Re-key `learning_agent.profile`/`preferences`, `list_service`, and calendar reads/writes by `speaker_bucket`, migrating the existing global blob into the `DEFAULT_USER` bucket so nothing regresses.
- [ ] Gate the multi-user code paths on `len(profiles) > 1` so single-profile households behave identically to today.
- [ ] Add per-store isolation tests mirroring the learning-agent ones (speaker A's list ≠ speaker B's).

**Blocked by:** none (additive; the `speaker_bucket` seam already exists).

**Related files:** `bmo/pi/agents/base_agent.py` (`speaker_bucket`, `DEFAULT_USER`), `bmo/pi/agents/learning_agent.py`, `bmo/pi/services/list_service.py`, `bmo/pi/services/personality_engine.py`.

**Related entries:** BMO-RESOLVED-ISSUES [2026-06-29] "Speaker identity resolved every voice turn but dropped before the agent layer" (the plumbing this builds on).

### [2026-07-02] `agent.py`'s `BmoAgent` is an 80-method god-class — 50 embedded `_handle_*` device-command handlers (music, audio/BT, scenes, ...) live inside the LLM-routing brain, the un-logged remainder after the D&D-helper extraction

- **Category:** debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (module-size + class-shape sweep of `bmo/pi`)

**Description:**
`bmo/pi/agent.py` (1,955 lines) is still the second-largest non-bot source file, and almost everything below line 580 is **one class, `BmoAgent`** (~1,376 lines, **80 methods**). The module's top half is a coherent LLM-routing surface (`llm_chat`/`llm_chat_stream`, model selection, cloud/Ollama fallback, RAG glue) — but `BmoAgent` mixes at least five unrelated concerns sharing only `self`: (1) chat/stream orchestration (`chat`, `chat_stream`, `_parse_response`); (2) MCP client lifecycle (`_init_mcp`, `_reload_mcp_servers`); (3) D&D session context (`load_dnd_context`, `_auto_load_dnd`, `get_gamestate`, recap); (4) restart/resume persistence (`_write_resume_before_restart`, `_read_and_clear_resume`, `_execute_pending_confirmation`); and (5) — the bulk — a **50-method `_handle_*` command-dispatch layer** (`_handle_music_play/pause/next/previous/volume/cast`, `_handle_audio_list_devices/set_output/bt_scan/bt_pair`, `_handle_scene_list/activate`, ... dispatched via `_get_handler`/`_execute_command`). Those handlers are thin adapters onto the `services` dict and have nothing to do with the agent brain; each new voice-controllable capability grows this class further. This is another instance of the already-established oversized-module pattern (`app.py`, `monitoring.py`, kiosk frontend, social bot, `VoicePipeline`) — but `agent.py` has never had its own decomposition entry: the resolved entry extracted only the 7 D&D *data* helpers (~250 lines) and explicitly deferred the rest.

**Hypothesis / root cause:** organic growth — every new `<verb>_<noun>` agent command added a `_handle_*` method to the one class that already had the dispatch table; no `commands/` seam was ever created.

**Proposed fix / improvement:**
- [ ] Extract the `_handle_*` layer behind the existing dispatch seam: a `commands/` module (or `services/command_handlers.py`) holding plain functions grouped by domain (music, audio, scene, ...), registered in a dict the existing `_get_handler` consults — behavior-neutral, `BmoAgent` keeps its public surface.
- [ ] Optionally follow with the smaller extractions (MCP lifecycle, resume-restart persistence) once the handler move lands; D&D context can join `services/dnd_dm_data.py`'s orbit.
- [ ] Gate on pytest (`tests/test_app_endpoints.py`, `tests/agents/*`) + the CI 4-gate; sequence independently of the `app.py` blueprint completion (different files, no overlap).

**Blocked by:** none

**Related files:** `bmo/pi/agent.py:580-1955` (`BmoAgent`), `bmo/pi/agent.py:1242` (`_get_handler`), `bmo/pi/agents/orchestrator.py` (calls `run_agent`), `bmo/pi/services/dnd_dm_data.py` (precedent extraction)

**Related entries:** BMO-RESOLVED 2026-06-24 (agent.py D&D-helper extraction — explicitly partial); Future-ideas 2026-06-29 (`app.py` half-decomposed god-module), 2026-06-28 (`monitoring.py` god-class), 2026-07-02 (kiosk frontend god-module) — same pattern, different file.

---

### [2026-07-02] Nearly half the committed QA screenshots are orphaned — 48 of 99 files in `bmo/docs/phases/QA/screenshots/` are referenced by NO report (active or completed), spanning three abandoned naming generations with no pruning/archival convention

- **Category:** debt, docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (cross-referencing every `screenshots/*.png` against all QA reports)

**Description:**
`bmo/docs/phases/QA/screenshots/` holds 99 LFS-tracked PNGs in one flat directory, accumulated across four QA rounds with three naming conventions (unprefixed `tab-home.png`-era, `r2-*`, `r3-*`, `r4-*`). Cross-referencing against every report — the active `QA-report-2026-07-02.md` plus all 10 in `completed/` — only **51** files are referenced anywhere; **48 are orphaned** (the unprefixed and `r2-` generations are almost fully unreferenced, e.g. `01-home-default.png`, `r2-tab-*.png`, plus stray `tab-cal.png` vs `tab-calendar.png` duplicates). The QA loop archives reports into `completed/` (their link paths were even fixed up to `../screenshots/`), but nothing ever prunes or archives the evidence files themselves, and neither `QA/README.md` nor `QA/INSTRUCTIONS.md` states a naming or retention convention — so each future round (`r5-*`, ...) grows the flat dir further and the orphan ratio only worsens. LFS keeps clone cost low, so this is hygiene/navigability debt, not bloat-urgent.

**Hypothesis / root cause:** the QA agent's instructions cover capturing + committing screenshots but are silent on lifecycle — no counterpart to the report-archival step for the evidence files.

**Proposed fix / improvement:**
- [ ] One-time sweep: delete the 48 unreferenced PNGs (list reproducible via `grep -o "screenshots/[A-Za-z0-9._-]*\.png"` across all reports, `comm -23` against `ls`), on a branch, verifying no report link breaks.
- [ ] Adopt per-round subfolders going forward (`screenshots/2026-07-02/...` or keep the `r<N>-` prefix but document it) and add a retention rule to `QA/INSTRUCTIONS.md` §8: when a report is archived to `completed/`, its unreferenced screenshots are deleted (referenced ones stay).
- [ ] Optionally have the QA agent end each run by listing screenshots it saved but never cited, so orphans stop at the source.

**Blocked by:** none

**Related files:** `bmo/docs/phases/QA/screenshots/` (99 files, 7.1 MB), `bmo/docs/phases/QA/INSTRUCTIONS.md` (§8 output/commit rules — no retention rule), `bmo/docs/phases/QA/README.md`, `.gitattributes` (LFS rules already correct)

**Related entries:** none (first entry covering the QA evidence lifecycle; the 2026-06-28 `pi/scripts/` README entry is the analogous "undocumented directory convention" finding).

---

### [2026-07-02] `STATUS-BOARD-MIGRATION.md` carries a duplicated "## F. Status after live cutover" section (union-merge artifact) and neither STATUS-BOARD doc is listed in the `bmo/docs/README.md` index

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** scheduled cleanup/structure scan (docs-index vs directory-listing cross-check)

**Description:**
Two related docs-hygiene finds. (1) `bmo/docs/STATUS-BOARD-MIGRATION.md` contains the section `## F. Status after live cutover (2026-06-28)` **twice** (lines 85 and 94), with near-identical but non-identical bodies (one says "dead-mans-switch", the other "dead-man's-switch") — the classic duplicate-section-header artifact the union-merge caveat in `AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 2 warns about, here landed in a regular doc and never cleaned. A reader can't tell which F-section is authoritative. (2) `bmo/docs/README.md` presents itself as the BMO docs index ("The docs" table) but omits both `STATUS-BOARD-DESIGN.md` and `STATUS-BOARD-MIGRATION.md` — the only two files in `bmo/docs/` not indexed — and no other doc links to the migration doc, so the board's design/cutover record is undiscoverable from the entry point. Bonus staleness signal: the doc's GATED paragraph says the `status_board_cog` deploy is HELD on a then-red master CI ("pre-existing unrelated dnd-app CI failure") — worth re-verifying and updating when the dup section is fixed, since the hold condition was transient.

**Hypothesis / root cause:** (1) two branches both appended the cutover-status section and a union/auto merge kept both copies (expected for logs, unnoticed in a regular doc); (2) the README index predates the status-board docs and was never extended.

**Proposed fix / improvement:**
- [ ] Merge the two F-sections into one (keep the superset of bullets; they differ only in apostrophe + wrapping), and refresh the GATED paragraph to the current cog-deploy state.
- [ ] Add both STATUS-BOARD docs to the `bmo/docs/README.md` table (one line each: design spec; migration/cutover record).
- [ ] Awareness note for future agents: hand-edited docs touched by parallel branches need a post-merge dedupe glance — union-merge is only configured for logs + DESIGN-CONSTRAINTS, but ordinary auto-merges can still double-append.

**Blocked by:** none

**Related files:** `bmo/docs/STATUS-BOARD-MIGRATION.md:85,94`, `bmo/docs/README.md` ("The docs" table), `bmo/docs/STATUS-BOARD-DESIGN.md`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (Rule 2 union-merge caveat)

**Related entries:** none prior on the status-board docs; complements the 2026-07-02 `.env.template` drift entry (same "docs drifted from reality" family).

---

### [2026-07-02] The kiosk frontend is a two-file god-module — `index.html` (2,492 lines of inline Alpine markup) + `bmo.js` (4,837 lines) with no module split or JS tests, the frontend twin of the already-logged Python god-module pattern

- **Category:** future-idea (structure / DX), debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** Scheduled improvement-suggestion scan of `pi/web/`

**Description:**
The entire kiosk UI — face canvas, chat, music, timers, TV remote, controls, settings, camera, notifications — lives in exactly two hand-edited files: `web/templates/index.html` (2,492 lines, all tabs' markup inline) and `web/static/js/bmo.js` (4,837 lines, one flat script). Every logged backend god-module (`app.py` 3.1k, `monitoring.py` 2.2k, social `bot.py` 6.7k pre-split) has had a decomposition entry; the frontend equivalent never has. Consequences: any two UI changes collide in the same files (bad for the multi-agent workflow specifically — union-merge does not apply to code), no JS is unit-tested (the pytest suite covers the API surface only), and a single syntax error in `bmo.js` can take down every tab at once. The local-vendor / no-build-step constraint is deliberate (offline kiosk; see the resolved vendored-assets entry) and does NOT require a bundler to fix this: native ES modules (`<script type="module">`) and `<template>`/Alpine component extraction work file-split with zero build.

**Proposed fix / improvement:**
- [ ] Split `bmo.js` into per-tab ES modules (`face.js`, `music.js`, `timers.js`, `tv.js`, `chat.js`, …) loaded natively — no bundler, keeping the offline-kiosk constraint.
- [ ] Carve `index.html` tab panels into server-side Jinja `{% include %}` partials so agents editing different tabs touch different files.
- [ ] Add a minimal JS test lane (node --test or vitest on pure-logic modules like formatting/state helpers) to CI's bmo gate.

**Blocked by:** —

**Related files:** `bmo/pi/web/templates/index.html`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/ide.html`

**Related entries:** BMO-SUGGESTIONS-LOG [2026-06-29] "`app.py` is a 3,087-line half-decomposed Flask god-module"; BMO-RESOLVED-ISSUES "~860 KB of orphaned vendored frontend assets in `web/static/`"

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

