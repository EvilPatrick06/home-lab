# PHASE-15 — BMO hygiene: agent-registry resilience, DM rest persistence, curl secret hygiene, stale markers, header/lockfile regression locks

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Close out the seven BMO-domain hygiene findings from the 2026-06-10 audit consolidation: (1) make the specialized-agent registry fail loudly and per-agent instead of silently dropping all 23 extra agents on any single ImportError; (2) make the D&D DM engine's long-rest resolution actually persist the recovery it narrates (and make short-rest text instruct the model to persist via the existing ` ```gamestate ` block); (3) get API keys off curl command lines (visible in `/proc/*/cmdline` to any local process) and add `--fail` so HTTP 4xx/5xx error bodies stop masquerading as audio/JSON payloads — in `fish_audio_tts` and the two sibling `os.system("curl …")` sites that share the flaw; (4) remove the inert `tools=` declaration on the DM agent; (5) delete the stale "IDE Tab (under construction)" comment; (6) lock in the already-shipped security-header set with a regression test (decision: do NOT adopt `flask-talisman` — upstream archived 2026-04-18); (7) lock in the already-adopted pip-tools workflow with a lockfile-sync test. Everything is Python under `bmo/pi/` plus one JS comment deletion; no dnd-app or dungeon-scholar code changes.

## Dependencies & cross-phase notes

- **Prerequisites: none.** PHASE-15 is in the no-dependency front block (PHASE-INDEX rows 01–19).
- **PHASE-16 (bmo-blueprint-refactor) depends on THIS phase** and will heavily rewrite `bmo/pi/app.py`. This phase deliberately makes **no edits to `app.py`** (the security-header work lands as tests only, sub-phase 15F), so PHASE-16 inherits a clean file. The new `tests/test_security_headers.py` will also protect PHASE-16: if the blueprint extraction accidentally drops the `_cache_policy` after-request hook, the test goes red.
- **PHASE-20/21/22 (Discord bridge/voice/sync) touch `bmo/pi/agents/dnd_dm.py`** (the `push_discord_message` call at `dnd_dm.py:81-84`) **and `bmo/pi/services/cloud_providers.py`** (PHASE-21 plans to replace the cloud `fish_audio_tts` dependency with local Kokoro/Piper TTS). The curl-hygiene helper added here (15D) also serves the Gemini-stream and Groq-STT paths, so it stays useful even after PHASE-21 retires `fish_audio_tts`. Land 15B/15D before those phases (numeric order already guarantees this).
- **PHASE-42 (bmo-deploy-automation)** touches `bmo/setup-bmo.sh`; this phase only reads it (verification for 15G), no collision.
- Repo conventions that apply (CLAUDE.md): new BMO test files go in `bmo/pi/tests/`; imports use subpackage prefixes (`from agents.X import Y`, `from services.X import Y`); never rename `bots/` or `services/calendar_service.py`; warn before restarting BMO systemd services (no restarts are required to land this phase — code is picked up on next service restart, which the user controls).
- **Design constraint that overrides naive fixes** (`bmo/docs/DESIGN-CONSTRAINTS.md`, "os.system(\"curl …\") in services/cloud_providers.py"): the main app runs under `gevent.monkey.patch_all()`; `os.system` is intentionally unpatched so curl gets normal blocking OS behavior. Do **not** replace `os.system` with `subprocess.run`/`requests.post`/`httpx` in this phase. The 15D fix keeps `os.system("curl …")` and moves the secrets into a `0600` temp **curl config file** (`-K`), which is invisible to `/proc/*/cmdline`.

## Verified findings

All verifications below were run on 2026-06-10 against the live tree at the repo root. Re-run them before implementing (INSTRUCTIONS.md rule 3); line numbers may drift.

### F1 — `except ImportError: pass` silently disables ALL 23 registry agents (bug/medium)

**Claim (verified true):** `BmoAgent` registers 5 core agents, then imports `agents._registry.create_all_agents` inside a `try/except ImportError: pass` with the stale comment `# Remaining agents not yet implemented`. `_registry.py` exists and registers **23** agents, each via an import *inside* `create_all_agents` — so a single broken agent module raises ImportError out of `create_all_agents`, the bare `except ImportError: pass` in `agent.py` swallows it, and **all 23** specialized agents vanish with **zero log output**. The orchestrator silently falls back to the 5 core agents (conversation, code, dnd_dm, plan, research). Two stale comments compound it: `agent.py:875` claims the agents are "not yet implemented", and the `_registry.py` module docstring (line 5) claims it "registers the remaining 14 agents" (actual: 23).

**Citations:**
- `bmo/pi/agent.py:860-867` — core-agent list + `register_agents(core_agents)`.
- `bmo/pi/agent.py:869-875` — the `try: from agents._registry import create_all_agents … except ImportError: pass  # Remaining agents not yet implemented` block.
- `bmo/pi/agents/_registry.py:5` — stale "registers the remaining 14 agents" docstring line.
- `bmo/pi/agents/_registry.py:14-88` — `create_all_agents` with 23 inline `from agents.<x> import create_<x>` + `agents.append(...)` pairs (music, smart_home, test, security, design, cleanup, monitoring, deploy, review, docs, timer, calendar, weather, learning, list, alert, routine, encounter, npc_dialogue, lore, rules, treasure, session_recap).

**Verification commands + observed output:**
```bash
sed -n '869,876p' bmo/pi/agent.py
#   shows: try / from agents._registry import create_all_agents /
#   create_all_agents(...) / register_agents(extra_agents) /
#   except ImportError: / pass  # Remaining agents not yet implemented
grep -c "agents.append" bmo/pi/agents/_registry.py     # → 23
sed -n '5p' bmo/pi/agents/_registry.py                 # → "This file registers the remaining 14 agents."
```

**Existing test impact:** `bmo/pi/tests/test_app_endpoints.py:29,93` and `bmo/pi/tests/agents/test_base_agent.py:28,63-64` install `sys.modules["agents._registry"] = MagicMock()` with `create_all_agents = MagicMock(return_value=[])` at module import time. Any new test that imports the **real** `agents._registry` must pop/restore that `sys.modules` entry around the import (see 15A test design).

### F2 — DM rest resolution computes recovery but never writes the gamestate (bug/medium)

**Claim (verified true):** `_resolve_short_rest` (`bmo/pi/agents/dnd_dm.py:568-584`) and `_resolve_long_rest` (`dnd_dm.py:586-603`) read `self._gamestate` and return descriptive planning text — `_resolve_long_rest` even computes the new hit-dice totals (`recovery = max(1, hit_dice_max // 2)`, `new_remaining = min(hit_dice_max, hit_dice_remaining + recovery)` at `:600-602`) — but neither mutates `self._gamestate` nor calls `self._save_gamestate()` (`:407-416`). Their output is appended as `[SHORT REST: …]`/`[LONG REST: …]` extras to the hidden DM-planning text inside `_dm_planning_phase` (call sites `:377-385`, matched from `REST_SHORT:`/`REST_LONG:` planning directives at `:312-316`). Persistence therefore depends entirely on the LLM volunteering a ` ```gamestate ` fenced block (parsed and saved by `_parse_gamestate`, `:418-465`) — and nothing in the rest planning text instructs it to do so. Result: narration can claim full recovery while the persisted `GAMESTATE_FILE` keeps stale HP/slots/hit dice across restarts.

**Gamestate shape (from `_load_gamestate` `:394-406`, `_parse_gamestate` `:418-465`, and the context renderer at `:157-180`):** `{"date": "<ISO>", "characters": {"<Name>": {"hp": int, "hp_max": int, "hit_dice_remaining": int, "hit_dice_max": int, "hit_dice_size": "d8", "spell_slots": {"<level>": int-remaining}, "conditions": [str], "gold": int, "inventory": [str]}}}`. Note `spell_slots` stores *remaining* counts only — no per-level maxima are tracked, so "restore all slots" cannot be computed; the honest mutation is to drop the `spell_slots` key (the character-sheet baseline shown to the model assumes full slots; a stale depleted map is strictly worse than absence).

**Verification commands:**
```bash
grep -n "_resolve_short_rest\|_resolve_long_rest\|_save_gamestate" bmo/pi/agents/dnd_dm.py
#   → defs at 568/586; _save_gamestate def at 407; NO _save_gamestate call inside 568-603
sed -n '568,603p' bmo/pi/agents/dnd_dm.py   # confirm read-only bodies
sed -n '377,386p' bmo/pi/agents/dnd_dm.py   # REST_SHORT/REST_LONG regex call sites
```

### F3 — `fish_audio_tts` exposes the API key on the curl command line and runs without `--fail` (security/medium) — EXTENDED: two sibling sites share the flaw

**Claim (verified true, and broader than the audit text):** `fish_audio_tts` (`bmo/pi/services/cloud_providers.py:455-528`) shells out via `os.system` with `-H 'Authorization: Bearer {FISH_AUDIO_API_KEY}'` interpolated into the command string (`:505-512`, the header at `:507`) — the key is visible to any local process via `ps`/`/proc/<pid>/cmdline` for the duration of every narration. Without `-f/--fail`, a 4xx/5xx from Fish Audio (the API returns 401/402/422 with a JSON `{"status","message"}` body) exits 0 and the JSON error body is returned as "audio" bytes — the Discord bot's FFmpegPCMAudio fails or plays garbage while the caller reports success. The `headers` dict at `:472-476` is dead code (defined, never referenced; the curl string rebuilds the headers inline).

**Extension found during verification — two more `os.system("curl …")` sites leak secrets the same way:**
- `gemini_chat_stream` (`cloud_providers.py:146-…`): URL built at `:190` as `f"{GEMINI_BASE}/models/{model_id}:streamGenerateContent?key={GEMINI_API_KEY}&alt=sse"` and passed on the command line at `:205-211` → the Gemini key is in `/proc` via the URL. Also no `--fail`.
- `groq_stt` (`cloud_providers.py:397-…`): `-H 'Authorization: Bearer {GROQ_API_KEY}'` on the command line at `:421-429` (header at `:423`). Also no `--fail`.
- NOT affected: `gemini_chat` (`:82`, key-in-URL at `:120` but sent in-process via `_gemini_session.post` — never on a command line) and `groq_llm_chat`/`groq_llm_chat_stream` (`:331/:356`, headers dicts at `:338/:362` passed to `requests` in-process).

**Constraint:** `cloud_providers.py:15-17` and `bmo/docs/DESIGN-CONSTRAINTS.md` mandate keeping `os.system("curl …")` (gevent patches `subprocess`/`requests`; `os.system` is intentionally unpatched). The fix must keep `os.system` — move every secret-bearing option (headers, URL, form, data, output) into a curl **config file** (`-K <file>`), created `0600` by `tempfile` (POSIX `mkstemp` semantics), and add `fail` to the config so HTTP ≥ 400 → curl exit 22 → `os.system` returns nonzero → the existing `ret != 0` guards raise.

**Verification commands:**
```bash
grep -n "os.system" bmo/pi/services/cloud_providers.py          # → 205, 421, 505 (3 curl sites)
sed -n '505,515p' bmo/pi/services/cloud_providers.py             # Bearer FISH_AUDIO_API_KEY inline, no -f/--fail
sed -n '472,477p' bmo/pi/services/cloud_providers.py             # dead headers dict
sed -n '188,212p' bmo/pi/services/cloud_providers.py             # gemini stream: key in URL on cmdline
sed -n '419,432p' bmo/pi/services/cloud_providers.py             # groq_stt: Bearer GROQ_API_KEY on cmdline
sed -n '15,17p' bmo/pi/services/cloud_providers.py               # gevent/os.system design-constraint comment
```

### F4 — `DndDmAgent` declares `tools=['read_file','list_directory']` but no code path executes tools for this agent (stub/low)

**Claim (verified true):** the factory `create_dnd_dm_agent` (`bmo/pi/agents/dnd_dm.py:625-637`) sets `tools=["read_file", "list_directory"]` at `:632`, but `DndDmAgent.run()` (`:47-90`) only calls `self.llm_call(messages)` (`:78`) — a plain completion via `BaseAgent.llm_call` (`bmo/pi/agents/base_agent.py:158-171`), no tool loop. `BaseAgent` provides the tool plumbing (`get_available_tools` `:173-200` reading `self.config.tools` at `:191/:193`, `get_tool_descriptions` `:~217`, `dispatch_tool` `:~287`), but agents that use tools implement their own loops — `DndDmAgent` never calls any of these (verified: `read_file` appears in `dnd_dm.py` only at `:632`; no `get_tool_descriptions`/`dispatch_tool` references in the file). The config entry is inert. **Decision for this phase: remove it** (`tools=[]` via the `AgentConfig` default — just delete the `tools=` line). The DM agent's file access is explicit and code-driven (`load_dnd_context`, `_load_monster_stat_block`, loot tables), not LLM-tool-driven; declaring tools the agent can never call is misleading config. No runtime behavior changes (nothing consumes the list for this agent).

**Verification commands:**
```bash
grep -n "read_file\|list_directory\|get_tool_descriptions\|dispatch_tool\|get_available_tools" bmo/pi/agents/dnd_dm.py
#   → single hit: 632 (the config line). run() has no tool loop.
sed -n '47,90p' bmo/pi/agents/dnd_dm.py     # run(): llm_call only
sed -n '625,637p' bmo/pi/agents/dnd_dm.py   # the factory + tools= line
```

### F5 — Stale "IDE Tab (under construction)" section marker in `bmo.js` (debt/low)

**Claim (verified true):** `bmo/pi/web/static/js/bmo.js:405` is the lone comment line `// ── IDE Tab (under construction — new IDE on port 5001) ──` — an empty section header (no code between it and the `// ── Init ──` marker at `:407`) claiming the IDE is unfinished. The IDE shipped long ago: `bmo/pi/routes/ide.py`, `bmo/pi/web/templates/ide.html`, and `bmo/pi/ide_app/` all exist; the kiosk tab redirects to `/ide` (`bmo/pi/web/templates/index.html:942` — `$watch('tab', v => { if(v === 'ide') window.location.href = '/ide'; })` — and `:2019` — `if(t.id === 'ide') { window.location.href = '/ide'; return; }`); the IDE has its own tests (`tests/test_ide_app.py`, `tests/test_ide_blueprint.py`). Delete the dead comment line.

**Verification commands:**
```bash
grep -n "under construction" bmo/pi/web/static/js/bmo.js          # → 405 only
ls bmo/pi/routes/ide.py bmo/pi/web/templates/ide.html bmo/pi/ide_app  # all exist
grep -n "'/ide'" bmo/pi/web/templates/index.html                  # → 942, 2019 (tab redirects)
```

### F6 — `flask-talisman` for security headers (suggestion) — DRIFTED: headers already shipped by hand; decision is to NOT adopt talisman and lock the headers with a test

**Corrected claim:** the audit migrated a 2026-04-25 suggestion to add `flask-talisman` (HSTS/CSP/frame-options/nosniff/referrer in one line). The codebase has since shipped an equivalent hand-rolled implementation: `bmo/pi/app.py:43` defines `@app.after_request def _cache_policy(response)` which sets, on every response, `X-Content-Type-Options: nosniff` (`:59`), `X-Frame-Options: SAMEORIGIN` (`:60`), `Referrer-Policy: strict-origin-when-cross-origin` (`:61`), `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` (`:62-65`), plus cache policy (`no-cache` for HTML, 1 h for `/static/`), per-prefix CORS carve-outs for `/api/games*`, `/api/library*`, `/api/rclone*`, `/api/sounds*` (`:67-107`), and a carefully tuned `Content-Security-Policy` on `text/html` responses (`:108-130+`; `'unsafe-eval'` required by Alpine.js expression compilation, `blob:` for Monaco workers, jsdelivr/socket.io CDN hosts). All headers use `setdefault` so per-route overrides remain possible. HSTS is intentionally absent: BMO serves plain HTTP on the LAN (port 5000); browsers ignore `Strict-Transport-Security` over HTTP, and the HTTPS path (Cloudflare tunnel) gets HSTS at the Cloudflare edge.

**Decision (do not change at implementation time — researched 2026-06-10):** do NOT adopt `flask-talisman`. The original `GoogleCloudPlatform/flask-talisman` repo was archived 2026-04-18 (read-only); the community fork `wntrblm/flask-talisman` has had no PyPI release in 12+ months (Snyk flags it as discontinued/low-attention). Talisman's defaults (`force_https=True`) would break the LAN-HTTP deployment, and replacing the hand-tuned CSP/CORS logic with talisman's would be churn with negative value. The remaining gap is **regression coverage**: nothing asserts the header set today, and PHASE-16's blueprint refactor of `app.py` could silently drop the hook. Sub-phase 15F adds the test; `app.py` itself is untouched.

**Verification commands:**
```bash
grep -n "after_request\|X-Content-Type-Options\|X-Frame-Options\|Referrer-Policy\|Permissions-Policy\|Content-Security-Policy" bmo/pi/app.py | head
#   → 43 (hook), 59, 60, 61, 62, 115 (CSP)
grep -rn "talisman" bmo/pi/ --include="*.py" --include="*.txt" --include="*.in"   # → no hits (not installed)
ls bmo/pi/tests/ | grep -i header                                                  # → no existing header test
```

### F7 — venv 166 packages vs ~60 declared; pip-tools would make it manageable (info) — DRIFTED: pip-tools already adopted; lock it with a sync test

**Corrected claim:** the audit carried a migrated observation that the venv held 166 packages vs ~60 declared and suggested pip-tools. The workflow has since landed in full: `bmo/pi/requirements.in` (37 top-level declarations) is compiled by pip-compile into `bmo/pi/requirements.txt` (138 `==`-pinned packages including transitives; autogenerated header at `requirements.txt:1-6` records the exact command with `--extra-index-url https://download.pytorch.org/whl/cpu --no-strip-extras`). Parallel pairs exist for CI (`requirements-ci.in`/`.txt`) and tests (`requirements-test.in`/`.txt`). `bmo/setup-bmo.sh:90-97` documents the regeneration command; CI (`.github/workflows/bmo-pi-pytest.yml`) installs from `requirements-ci.txt`. Note: pip-compile omits "unsafe" packages by default — `requirements.txt:420` shows `# setuptools` commented out — so any sync check must allowlist `pip`/`setuptools`/`wheel`/`distribute`. The transitive-CVE-surface concern is managed; the only remaining work is a cheap guard that the `.in` → `.txt` pairs do not drift (someone hand-adding a dep to `.in` without recompiling), which 15G adds.

**Verification commands:**
```bash
head -6 bmo/pi/requirements.txt              # pip-compile autogen header
grep -c "==" bmo/pi/requirements.txt         # → 138
grep -cv '^\s*#\|^\s*$\|^--' bmo/pi/requirements.in   # → 37
sed -n '90,97p' bmo/setup-bmo.sh             # documented pip-compile workflow
grep -n "requirements-ci" .github/workflows/bmo-pi-pytest.yml   # CI uses the compiled lockfile
```

### Test environment facts (verified 2026-06-10)

- System `python3` is 3.11.2 with **no pytest**. The BMO venv at `/home/patrick/home-lab/bmo/pi/venv` has pytest 9.0.3. Run BMO tests from the worktree's `bmo/pi/` directory with the venv interpreter:
  ```bash
  cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/ -q
  ```
- Baseline confirmed green: `tests/agents/test_base_agent.py` + `tests/test_app_endpoints.py` → 78 passed.
- `bmo/pi/tests/conftest.py` mocks all hardware/gevent modules so tests run anywhere; `flask_client`/`mock_filesystem` fixtures exist. Test files that import `app` define their own deferred-import fixtures (see `test_app_endpoints.py:103-148`).
- CI: `.github/workflows/bmo-pi-pytest.yml` runs `python -m pytest tests/ -q` from `bmo/pi` with `requirements-ci.txt`. New tests must not require packages outside that lockfile (everything specified below is stdlib + pytest + existing deps).

## Sub-phases

Order keeps the tree green throughout: each sub-phase is independent, lands code + its test together, and the only cross-file coupling (15A's sys.modules hygiene) is self-contained.

### 15A — Agent-registry: per-agent import isolation + loud failure logging

**Objective:** one broken agent module costs exactly that one agent (with a loud log line), never all 23; a broken `_registry` module itself logs loudly instead of silently passing.

**Files:** `bmo/pi/agents/_registry.py`, `bmo/pi/agent.py`, new `bmo/pi/tests/agents/test_registry.py`.

**Steps:**
1. Rewrite `bmo/pi/agents/_registry.py` to be data-driven. Replace the 23 inline import/append pairs (`:18-88`) with a module-level spec table + loop:
   ```python
   import importlib

   # (module path, factory name) for every non-core specialized agent.
   _AGENT_SPECS: tuple[tuple[str, str], ...] = (
       ("agents.music_agent", "create_music_agent"),
       ("agents.smart_home_agent", "create_smart_home_agent"),
       ("agents.test_agent", "create_test_agent"),
       ("agents.security_agent", "create_security_agent"),
       ("agents.design_agent", "create_design_agent"),
       ("agents.cleanup_agent", "create_cleanup_agent"),
       ("agents.monitoring_agent", "create_monitoring_agent"),
       ("agents.deploy_agent", "create_deploy_agent"),
       ("agents.review_agent", "create_review_agent"),
       ("agents.docs_agent", "create_docs_agent"),
       ("agents.timer_agent", "create_timer_agent"),
       ("agents.calendar_agent", "create_calendar_agent"),
       ("agents.weather_agent", "create_weather_agent"),
       ("agents.learning_agent", "create_learning_agent"),
       ("agents.list_agent", "create_list_agent"),
       ("agents.alert_agent", "create_alert_agent"),
       ("agents.routine_agent", "create_routine_agent"),
       ("agents.encounter_agent", "create_encounter_agent"),
       ("agents.npc_dialogue_agent", "create_npc_dialogue_agent"),
       ("agents.lore_agent", "create_lore_agent"),
       ("agents.rules_agent", "create_rules_agent"),
       ("agents.treasure_agent", "create_treasure_agent"),
       ("agents.session_recap_agent", "create_session_recap_agent"),
   )

   def create_all_agents(scratchpad, services, socketio=None) -> list:
       """Create every non-core agent; a failure in one never drops the rest."""
       agents = []
       for module_name, factory_name in _AGENT_SPECS:
           try:
               module = importlib.import_module(module_name)
               factory = getattr(module, factory_name)
               agents.append(factory(scratchpad, services, socketio))
           except Exception as e:  # ImportError, AttributeError, ctor errors alike
               print(f"[registry] FAILED to create agent {module_name}.{factory_name}: {e!r} — continuing without it")
       return agents
   ```
   Preserve the original spec ORDER (it matches the current registration order; verify against the pre-edit file). Keep the type hints/signature identical (`scratchpad: SharedScratchpad`, `services: dict[str, Any]`, `socketio: Any = None`). Update the module docstring: replace "This file registers the remaining 14 agents." with a non-hardcoded sentence ("This file registers every non-core specialized agent listed in `_AGENT_SPECS`.").
2. In `bmo/pi/agent.py:869-875`, replace the silent-drop block:
   ```python
   # Register all remaining specialized agents (per-agent failures are
   # logged and skipped inside create_all_agents).
   try:
       from agents._registry import create_all_agents
   except ImportError as e:
       print(f"[agent] FAILED to import agents._registry — running with core agents only: {e!r}")
   else:
       extra_agents = create_all_agents(scratchpad, self.services, self.socketio)
       self.orchestrator.register_agents(extra_agents)
   ```
   (Resilience preserved — BMO still boots with the 5 core agents if the registry module itself is broken — but never silently.)
3. New `bmo/pi/tests/agents/test_registry.py`:
   - **sys.modules hygiene:** other test files install `sys.modules["agents._registry"] = MagicMock()`. At the top of each test (or a module fixture), `saved = sys.modules.pop("agents._registry", None)`, `registry = importlib.import_module("agents._registry")` (plus `importlib.reload` if it was already the real module), and restore `sys.modules["agents._registry"] = saved` in teardown when `saved` is not None. Importing the real module is cheap post-refactor (its body imports only `importlib` and the scratchpad type).
   - `test_spec_table_has_23_unique_agents`: `len(registry._AGENT_SPECS) == 23`; module paths unique; factory names unique.
   - `test_one_broken_agent_does_not_drop_the_rest`: inject a synthetic good module (`types.ModuleType("agents._fake_ok")` with `create_fake = lambda sp, sv, so=None: MagicMock()`) into `sys.modules`, monkeypatch `registry._AGENT_SPECS` to `(("agents._fake_ok", "create_fake"), ("agents._fake_missing", "create_missing"))`, call `create_all_agents(MagicMock(), {}, None)`, assert exactly 1 agent returned and `capsys.readouterr().out` contains `[registry] FAILED` and `agents._fake_missing`. Clean the synthetic module out of `sys.modules` in teardown.
   - `test_factory_exception_is_isolated_too`: same shape but the good module's factory raises `RuntimeError`; assert 0 returned (or order the specs so a later good one still lands) and the failure line is printed — proves the `except Exception` breadth.

**Cheap checks:** `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/agents/test_registry.py tests/agents/test_base_agent.py -q` (the second file guards against sys.modules pollution regressions). Also `python -c` compile check: `/home/patrick/home-lab/bmo/pi/venv/bin/python -m py_compile bmo/pi/agents/_registry.py bmo/pi/agent.py` (from repo root).

**Acceptance:** registry test green; `test_base_agent.py` + `test_app_endpoints.py` still green (their `agents._registry` mocks unaffected); no bare `except ImportError: pass` remains at `agent.py` (grep returns nothing); stale "14 agents" / "not yet implemented" comments gone.

### 15B — DM rest resolution persists what it narrates

**Objective:** a `REST_LONG` planning directive applies and saves the recovery it describes; `REST_SHORT` (inherently interactive — hit-dice spend is a player choice) explicitly instructs the model to persist via the existing ` ```gamestate ` block.

**Files:** `bmo/pi/agents/dnd_dm.py`, new `bmo/pi/tests/agents/test_dnd_dm_rest.py`.

**Steps:**
1. In `_resolve_long_rest` (`dnd_dm.py:586-603`), after computing the recovery, mutate and save — conservatively, only when the character already exists in the loaded gamestate (an LLM-invented name must not create a phantom record):
   ```python
   def _resolve_long_rest(self, character_name: str) -> str:
       if not self._gamestate:
           return f"{character_name} takes a long rest. Full HP restored, all spell slots restored."
       characters = self._gamestate.get("characters", {})
       # Case-insensitive match against known characters (planning directives
       # echo names with unreliable casing).
       canonical = next((k for k in characters if k.lower() == character_name.lower()), None)
       char_state = characters.get(canonical, {}) if canonical else {}
       hp_max = char_state.get("hp_max", "?")
       hit_dice_max = char_state.get("hit_dice_max")
       hit_dice_remaining = char_state.get("hit_dice_remaining")
       lines = [f"Long Rest for {character_name}:"]
       lines.append(f"  HP: Restored to {hp_max}")
       lines.append("  Spell Slots: All restored")
       lines.append("  Conditions: All removed")
       new_remaining = None
       if hit_dice_max is not None and hit_dice_remaining is not None:
           recovery = max(1, hit_dice_max // 2)
           new_remaining = min(hit_dice_max, hit_dice_remaining + recovery)
           lines.append(f"  Hit Dice: Recover {recovery} → now {new_remaining}/{hit_dice_max}")
       if canonical:
           if isinstance(hp_max, (int, float)):
               char_state["hp"] = hp_max
           char_state["conditions"] = []
           # No per-level maxima are tracked; drop the remaining-counts map so the
           # sheet baseline (full slots) applies instead of a stale depleted map.
           char_state.pop("spell_slots", None)
           if new_remaining is not None:
               char_state["hit_dice_remaining"] = new_remaining
           self._save_gamestate()
           lines.append("  (Applied to the saved game state.)")
       else:
           lines.append(
               "  (Character not found in game state — after narrating, emit a "
               "```gamestate``` block with the updated hp/conditions/hit dice.)"
           )
       return "\n".join(lines)
   ```
2. In `_resolve_short_rest` (`dnd_dm.py:568-584`), keep the read-only body (it cannot know the hit-dice spend) but append an explicit persistence instruction as the final line:
   ```python
   lines.append(
       "  After the player decides and you roll healing, emit a ```gamestate``` block "
       "updating hp and hit_dice_remaining so the recovery is saved."
   )
   ```
3. New `bmo/pi/tests/agents/test_dnd_dm_rest.py`. Module preamble: replicate `tests/agents/test_base_agent.py`'s pre-import mocking pattern only as far as needed to `from agents.dnd_dm import create_dnd_dm_agent` (conftest already mocks hardware/gevent; `dnd_dm` imports `from agent import GAMESTATE_DIR, GAMESTATE_FILE, OLLAMA_PLAN_OPTIONS, …` so the `agent` module must be importable — if `test_base_agent.py`'s preamble mocks are required, copy the minimal subset and note the source). Fixture: build the agent with `MagicMock()` scratchpad/services, `monkeypatch.setattr(dnd_dm_module, "GAMESTATE_FILE", str(tmp_path / "gamestate.json"))` and `…"GAMESTATE_DIR", str(tmp_path)` (the names are module globals in `dnd_dm`'s namespace via `from agent import …`). Tests:
   - `test_long_rest_mutates_and_saves`: seed `agent_obj._gamestate = {"date": "2026-06-10", "characters": {"Yorick": {"hp": 3, "hp_max": 27, "hit_dice_max": 4, "hit_dice_remaining": 1, "spell_slots": {"1": 0}, "conditions": ["poisoned"]}}}`; call `_resolve_long_rest("Yorick")`; assert `hp == 27`, `conditions == []`, `"spell_slots" not in` the char state, `hit_dice_remaining == 3` (recover `max(1, 4//2)=2`), the tmp gamestate file exists and round-trips the same values, and the text contains "Applied to the saved game state".
   - `test_long_rest_case_insensitive_name`: directive name `"yorick"` matches the `"Yorick"` record.
   - `test_long_rest_unknown_character_is_read_only`: name `"Nobody"` → no file written, no `characters` entry created, text contains the ` ```gamestate ` fallback instruction.
   - `test_short_rest_is_read_only_but_instructs_persistence`: seeded state unchanged after `_resolve_short_rest("Yorick")`; no file written; returned text contains "```gamestate" and "hit_dice_remaining".

**Cheap checks:** `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/agents/test_dnd_dm_rest.py -q`.

**Acceptance:** all four tests green; `_resolve_long_rest` calls `_save_gamestate()` exactly once on the known-character path; `_resolve_short_rest` performs no writes; no other dnd_dm behavior touched.

### 15C — Remove the inert `tools=` declaration on the DM agent

**Objective:** the agent config stops advertising tools that no code path can ever execute.

**Files:** `bmo/pi/agents/dnd_dm.py` (factory at `:625-637`), `bmo/pi/tests/agents/test_dnd_dm_rest.py` (one added assertion).

**Steps:**
1. Delete the line `tools=["read_file", "list_directory"],` at `dnd_dm.py:632` (the `AgentConfig.tools` default is `field(default_factory=list)` — `bmo/pi/agents/base_agent.py:~60`).
2. Add to `test_dnd_dm_rest.py`: `test_dm_agent_declares_no_tools` — build via `create_dnd_dm_agent` and assert `agent_obj.config.tools == []` with a comment explaining why (run() has no tool loop; see F4).

**Cheap checks:** rerun `tests/agents/test_dnd_dm_rest.py`; `grep -n "read_file" bmo/pi/agents/dnd_dm.py` → no hits.

**Acceptance:** grep clean; tests green; no other `AgentConfig` fields changed.

### 15D — curl secret hygiene + `--fail` across all three `os.system("curl …")` sites

**Objective:** no API key (or key-bearing URL) ever appears on a process command line; HTTP ≥ 400 raises instead of returning error-JSON as payload bytes. `os.system` stays (gevent design constraint).

**Files:** `bmo/pi/services/cloud_providers.py`, new `bmo/pi/tests/test_cloud_providers_curl.py`.

**Steps:**
1. Add a module-level helper near the top of `cloud_providers.py` (after the constants):
   ```python
   def _curl_cfg_quote(value: str) -> str:
       """Quote a value for a curl config file (escape backslash + double quote)."""
       return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

   def _run_curl_config(option_lines: list[str], label: str) -> None:
       """Run curl with every option in a 0600 temp config file (-K).

       Keeps secrets (Authorization headers, key-bearing URLs) out of
       /proc/<pid>/cmdline. `fail` makes HTTP >= 400 exit 22 so callers raise
       instead of treating an error body as payload. os.system is intentional —
       see bmo/docs/DESIGN-CONSTRAINTS.md (gevent leaves it unpatched).
       """
       import tempfile
       with tempfile.NamedTemporaryFile(suffix=".curlcfg", delete=False, mode="w") as cf:
           cf.write("\n".join(["fail", "silent", "show-error", *option_lines]) + "\n")
           cfg_path = cf.name  # mkstemp semantics: created 0600
       try:
           ret = os.system(f"curl -K {shlex.quote(cfg_path)} 2>/dev/null")  # nosec B605
           if ret != 0:
               code = os.waitstatus_to_exitcode(ret)
               raise RuntimeError(f"{label} curl failed (exit {code}; 22 = HTTP error >= 400)")
       finally:
           try:
               os.remove(cfg_path)
           except OSError:
               pass
   ```
   (`shlex` is already imported inside the call sites; move/ensure a module-level `import shlex`. `os.waitstatus_to_exitcode` exists on Python ≥ 3.9; the Pi runs 3.11.)
2. Convert `fish_audio_tts` (`:505-512`): delete the dead `headers` dict (`:472-476`); keep payload temp-file writing; replace the `os.system` call with:
   ```python
   _run_curl_config([
       f"url = {_curl_cfg_quote(FISH_AUDIO_BASE + '/tts')}",
       'request = "POST"',
       f"header = {_curl_cfg_quote('Authorization: Bearer ' + FISH_AUDIO_API_KEY)}",
       'header = "Content-Type: application/json"',
       'header = "model: s1"',
       f"data = {_curl_cfg_quote('@' + payload_path)}",
       f"output = {_curl_cfg_quote(out_path)}",
   ], label="Fish Audio")
   ```
   Keep the timing print (wrap the helper call with the existing `_t0`/`_t1` instrumentation) and the audio-bytes read. The old `if ret != 0: raise` is replaced by the helper's raise.
3. Convert `gemini_chat_stream`'s curl site (`:205-211`): the key-bearing URL (`:190`) moves into the config file unchanged (`url = "...generateContent?key=...&alt=sse"` — semantics identical, just no longer on the cmdline):
   ```python
   _run_curl_config([
       f"url = {_curl_cfg_quote(url)}",
       'request = "POST"',
       'header = "Content-Type: application/json"',
       f"data = {_curl_cfg_quote('@' + payload_path)}",
       f"output = {_curl_cfg_quote(out_path)}",
   ], label="Gemini stream")
   ```
4. Convert `groq_stt`'s curl site (`:421-429`) — multipart form options become `form =` config lines:
   ```python
   form_lines = [
       f"form = {_curl_cfg_quote(f'file=@{tmp_path};type=audio/wav')}",
       'form = "model=whisper-large-v3"',
       f"form = {_curl_cfg_quote('language=' + language)}",
       'form = "response_format=verbose_json"',
   ]
   if prompt:
       form_lines.append(f"form = {_curl_cfg_quote('prompt=' + prompt)}")
   _run_curl_config([
       f"url = {_curl_cfg_quote(GROQ_BASE + '/audio/transcriptions')}",
       'request = "POST"',
       f"header = {_curl_cfg_quote('Authorization: Bearer ' + GROQ_API_KEY)}",
       *form_lines,
       f"output = {_curl_cfg_quote(out_path)}",
   ], label="Groq STT")
   ```
5. Update the stale per-site comments ("gevent patches subprocess but not os.system" lines stay accurate; the inline "-H Bearer" rationale comments go away with the code). Keep `# nosec B605` on the one remaining `os.system` call inside the helper.
6. New `bmo/pi/tests/test_cloud_providers_curl.py` (conftest mocks make `import services.cloud_providers` safe; set `FISH_AUDIO_API_KEY` etc. via `monkeypatch.setattr` on the module, since the constants are read at module level from env):
   - Shared fake: `monkeypatch.setattr(cp.os, "system", fake)` where `fake(cmd)` records `cmd`, extracts the `-K <path>` argument (regex `-K (\S+)` then `shlex.split` to unquote), snapshots the config file content into a list, optionally writes a canned output file (parse the `output = "…"` line), and returns 0.
   - `test_fish_audio_key_never_on_cmdline`: monkeypatch `cp.FISH_AUDIO_API_KEY = "sk-SECRET-123"`, have the fake write fake audio bytes to the output path, call `cp.fish_audio_tts("hello")`; assert the recorded command contains `"curl -K "` and does NOT contain `"sk-SECRET-123"` or `"Authorization"`; assert the snapshotted config content DOES contain the Bearer line, a `fail` line, and the url; assert returned bytes equal the canned audio.
   - `test_fish_audio_http_error_raises`: fake returns `22 << 8` (curl exit 22 as an os.system wait status); assert `RuntimeError` with `"exit 22"` in the message.
   - `test_gemini_stream_key_not_on_cmdline`: monkeypatch `cp.GEMINI_API_KEY = "gem-SECRET"`; drive `gemini_chat_stream` far enough to hit the curl (have the fake write a minimal SSE file the parser accepts, or assert the RuntimeError path after recording the command); assert `"gem-SECRET"` absent from the recorded command and present in the config snapshot. If full SSE parsing proves brittle, asserting on the recorded command + config before raising via a nonzero return is sufficient — the secret-exposure property is the test's point.
   - `test_groq_stt_key_not_on_cmdline`: same shape for `groq_stt(b"RIFF....")` with a canned verbose_json output file; assert no `GROQ_API_KEY` value on the cmdline; assert `form =` lines present in the config.
   - `test_config_file_removed_after_call`: the fake records the cfg path; after the call assert `not os.path.exists(cfg_path)`.
   - `test_cfg_quote_escapes`: `_curl_cfg_quote('a"b\\c') == '"a\\"b\\\\c"'`.

**Cheap checks:** `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/test_cloud_providers_curl.py -q`; `grep -n "Bearer {" bmo/pi/services/cloud_providers.py` → no hits inside `os.system` strings (the two `requests`-based Groq/Gemini headers dicts at `:338/:362/:120` legitimately remain — in-process, never on a cmdline).

**Acceptance:** all three curl sites go through `_run_curl_config`; no API key or key-bearing URL appears in any `os.system` argument string; `fail` present in every generated config; dead `headers` dict at `fish_audio_tts` removed; tests green. Runtime note for the user-controlled restart: behavior change is intentional — Fish Audio/Gemini-stream/Groq-STT HTTP errors now raise `RuntimeError` (callers already handle exceptions from these functions) instead of propagating garbage bytes.

### 15E — Delete the stale "IDE Tab (under construction)" marker

**Objective:** remove the dead comment claiming the IDE is unfinished.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**
1. Delete line 405 (`// ── IDE Tab (under construction — new IDE on port 5001) ──`) and the now-doubled blank line so exactly one blank line separates the `gameState: {}` block from the `// ── Init ──` marker.

**Cheap checks:** `grep -n "under construction" bmo/pi/web/static/js/bmo.js` → empty; `node --check` is not applicable (the file is an inline-loaded script with Alpine globals, not a module) — instead `grep -c "" bmo/pi/web/static/js/bmo.js` to confirm only the intended 2-line shrink (4453 → 4451).

**Acceptance:** grep clean; no other bmo.js changes in the diff.

### 15F — Security-header regression test (decision: no flask-talisman)

**Objective:** lock in the hand-rolled header set (F6) so PHASE-16's `app.py` blueprint refactor cannot silently drop it. Zero `app.py` edits.

**Files:** new `bmo/pi/tests/test_security_headers.py`.

**Steps:**
1. Copy the deferred-import app fixture pattern from `bmo/pi/tests/test_app_endpoints.py:103-148` (module-level `sys.modules` mocks including `agents._registry`, then import `app` inside a fixture, yield `app.test_client()`). Reusing that file's exact preamble subset is acceptable and expected — it is the established pattern for app-importing tests.
2. Tests (assert against `/health` — a cheap JSON route — for the universal headers, and against a `text/html` response for CSP; the default Flask 404 page is `text/html` and still passes through `@app.after_request`, so `client.get("/__no_such_route__")` is a robust HTML probe that avoids rendering the heavy kiosk template):
   - `test_nosniff_on_all_responses`: `X-Content-Type-Options == "nosniff"` on `/health`.
   - `test_frame_options`: `X-Frame-Options == "SAMEORIGIN"`.
   - `test_referrer_policy`: `Referrer-Policy == "strict-origin-when-cross-origin"`.
   - `test_permissions_policy`: header present and contains `camera=(self)` and `microphone=(self)`.
   - `test_csp_on_html`: on the 404 HTML probe, `Content-Security-Policy` present, contains `default-src 'self'` and `script-src` with `'unsafe-eval'` (the Alpine.js requirement — if a future change removes it, kiosk buttons break silently; the test failure is the early warning).
   - `test_html_cache_policy`: 404 HTML probe has `Cache-Control: no-cache`.
   - `test_games_api_cors`: `client.get("/api/games")` (any status) carries `Access-Control-Allow-Origin: *`.
3. Add a short module docstring recording the F6 decision: headers are hand-rolled in `app.py::_cache_policy`; `flask-talisman` was evaluated 2026-06-10 and rejected (upstream archived 2026-04-18, fork dormant, `force_https` default incompatible with LAN HTTP); this test is the regression lock and must survive the PHASE-16 blueprint refactor.

**Cheap checks:** `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/test_security_headers.py -q`.

**Acceptance:** all header tests green with zero production-code changes; docstring records the decision and the PHASE-16 hand-off.

### 15G — Requirements lockfile sync guard

**Objective:** cheap permanent guard that the pip-tools pairs (F7) do not drift — every top-level declaration in a `.in` file resolves to a pin in its compiled `.txt`.

**Files:** new `bmo/pi/tests/test_requirements_sync.py`.

**Steps:**
1. Implement a small parser (stdlib only):
   ```python
   import re
   from pathlib import Path

   REQ_DIR = Path(__file__).resolve().parents[1]  # bmo/pi/
   # pip-compile omits "unsafe" packages unless --allow-unsafe.
   UNSAFE = {"pip", "setuptools", "wheel", "distribute"}

   def _norm(name: str) -> str:  # PEP 503
       return re.sub(r"[-_.]+", "-", name).lower()

   def _declared(in_path: Path) -> set[str]:
       names = set()
       for line in in_path.read_text().splitlines():
           line = line.split("#", 1)[0].strip()
           if not line or line.startswith(("-", "--")):
               continue
           name = re.split(r"[<>=!~\[; ]", line, 1)[0]
           if name:
               names.add(_norm(name))
       return names

   def _pinned(txt_path: Path) -> set[str]:
       return {
           _norm(m.group(1))
           for m in re.finditer(r"^([A-Za-z0-9][A-Za-z0-9._-]*)==", txt_path.read_text(), re.M)
       }
   ```
2. Parametrize over the three pairs — `("requirements.in", "requirements.txt")`, `("requirements-ci.in", "requirements-ci.txt")`, `("requirements-test.in", "requirements-test.txt")` — asserting `_declared(in) - UNSAFE <= _pinned(txt)`, with a failure message naming the missing packages and the regeneration command from `bmo/setup-bmo.sh:94-97` (`pip-compile --extra-index-url https://download.pytorch.org/whl/cpu -o requirements.txt requirements.in`).
3. One sanity test: `test_main_lockfile_is_compiled` — `requirements.txt` first lines contain `autogenerated by pip-compile` (guards against someone overwriting the lockfile by hand).

**Cheap checks:** `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/test_requirements_sync.py -q` — must pass against the current tree (verified inputs: 37 declared / 138 pinned in the main pair; `setuptools` is declared in `.in` but only present commented-out at `requirements.txt:420`, hence the UNSAFE allowlist).

**Acceptance:** all three pairs pass today; the test fails if a name is added to any `.in` without recompiling.

## Research notes

- **Secrets on command lines:** any process argument is world-readable via `/proc/<pid>/cmdline` / `ps` for the life of the process; the standard remedies are passing a filename or stdin instead of an argument (curl's `-K` config file, `-H @file`, `--netrc`). Source: [How to Handle Secrets on the Command Line (smallstep)](https://smallstep.com/blog/command-line-secrets/).
- **curl config file + fail semantics:** `-K/--config` accepts `option = "value"` lines (long option names without dashes; URLs must use `url = …`); `-f/--fail` exits with code 22 and suppresses the response body for HTTP ≥ 400 (`--fail-with-body` exists if the error body is ever wanted for diagnostics — not used here because the body lands in the `-o` output file that downstream code treats as payload); `-H @file` reads headers from a file (config-file route chosen instead because it also hides the Gemini key-bearing URL). Source: [curl manpage](https://curl.se/docs/manpage.html).
- **Temp-file permissions:** `tempfile.NamedTemporaryFile`/`mkstemp` create files readable/writable only by the creating user (0600), satisfying the "key readable only by the BMO user" requirement without an explicit `chmod`. Source: [Python tempfile docs](https://docs.python.org/3/library/tempfile.html).
- **`os.system` return value:** returns a wait status, not an exit code — curl's exit 22 surfaces as `22 << 8 = 5632`; `os.waitstatus_to_exitcode()` (Python ≥ 3.9; Pi runs 3.11.2) decodes it for the error message. Source: [Python os docs](https://docs.python.org/3/library/os.html#os.waitstatus_to_exitcode).
- **Fish Audio API:** `POST https://api.fish.audio/v1/tts` with `Authorization: Bearer <key>`; errors are 401/402/422 with JSON `{"status","message"}` bodies — exactly what `--fail` now converts into a raised `RuntimeError` instead of bytes fed to FFmpegPCMAudio. Sources: [Fish Audio TTS API reference](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech), [Fish Audio S2 API guide](https://apidog.com/blog/how-to-use-fish-audio-s2-api/).
- **flask-talisman decision:** original repo [GoogleCloudPlatform/flask-talisman](https://github.com/GoogleCloudPlatform/flask-talisman) archived 2026-04-18 (read-only); community fork [wntrblm/flask-talisman](https://github.com/wntrblm/flask-talisman) last pushed ≥ 1 year ago and [Snyk advisor](https://snyk.io/advisor/python/flask-talisman) flags the [PyPI package](https://pypi.org/project/flask-talisman/) as receiving low maintainer attention. Adopting a dormant dependency to replace working, hand-tuned headers (which already cover nosniff/frame/referrer/permissions/CSP, with CORS carve-outs talisman cannot express) is net-negative; talisman's `force_https` default would additionally break LAN-HTTP serving. Alternative considered: Flask's own docs treat header-setting via `after_request` as a first-class pattern ([Flask security considerations](https://flask.palletsprojects.com/en/stable/web-security/)). Chosen approach: keep hand-rolled + regression test.
- **pip-tools:** the `.in` → `pip-compile` → fully pinned `.txt` workflow (already adopted in-tree) is the upstream-recommended layering; pip-compile excludes `pip`/`setuptools`/`wheel`/`distribute` by default unless `--allow-unsafe` — the sync test must allowlist them. Source: [pip-tools docs](https://pip-tools.readthedocs.io/en/latest/).
- **Import-isolation pattern (15A):** `importlib.import_module` per spec entry with a broad `except Exception` per agent is the standard plugin-registry resilience shape; catching only `ImportError` would still drop an agent whose module imports fine but whose factory raises. The loud `print` (not `logging`) matches the codebase convention (`[dnd_dm]`/`[dm-plan]`/`[timing]` bracketed prints throughout `bmo/pi`; journald captures stdout for systemd services).

## Test plan

| Sub-phase | New/updated test file | Coverage |
|---|---|---|
| 15A | `bmo/pi/tests/agents/test_registry.py` (new) | spec-table size/uniqueness; one broken module is isolated + logged; factory exceptions isolated |
| 15B | `bmo/pi/tests/agents/test_dnd_dm_rest.py` (new) | long-rest mutate+save, case-insensitive match, unknown-character read-only fallback, short-rest read-only + persistence instruction |
| 15C | `bmo/pi/tests/agents/test_dnd_dm_rest.py` (updated) | `config.tools == []` |
| 15D | `bmo/pi/tests/test_cloud_providers_curl.py` (new) | no secret on cmdline (fish/gemini-stream/groq-stt); `fail` in config; exit-22 → RuntimeError; cfg cleanup; quoting |
| 15E | — (comment deletion; grep check only) | — |
| 15F | `bmo/pi/tests/test_security_headers.py` (new) | nosniff/frame/referrer/permissions on all responses; CSP + cache policy on HTML; /api/games CORS |
| 15G | `bmo/pi/tests/test_requirements_sync.py` (new) | three `.in`→`.txt` pairs in sync; lockfile is pip-compile output |

**End-of-phase gate (INSTRUCTIONS.md rule 5):** because this phase touches `bmo/pi/`, run the full BMO suite in addition to the standard 4-gate:

```bash
cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/ -q   # full BMO suite (CI parity: bmo-pi-pytest.yml)
cd ../../dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

The dnd-app gates are expected trivially green (no dnd-app files change) but are still required. One commit + one push at phase end; plan file moves to `completed/` (rule 8). Note: BMO runs as systemd services on this host — do NOT restart `bmo`/`bmo-dm-bot` as part of this phase; the changes activate on the user's next restart (CLAUDE.md safety rule: always warn before restarting BMO services).

## Acceptance criteria

- [ ] A single broken agent module costs exactly one agent; the loss is printed with a `[registry] FAILED` line naming the module; a broken `_registry` module itself prints `[agent] FAILED to import agents._registry`; no bare `except ImportError: pass` remains in `bmo/pi/agent.py`.
- [ ] `_resolve_long_rest` persists hp/conditions/hit-dice (and drops stale `spell_slots`) via `_save_gamestate()` for known characters; unknown characters and short rests stay read-only but the planning text explicitly instructs a ` ```gamestate ` block.
- [ ] No API key or key-bearing URL appears in any `os.system` command string in `bmo/pi/services/cloud_providers.py`; all three curl sites use a `0600` config file with `fail`; HTTP ≥ 400 raises `RuntimeError`; the dead `headers` dict in `fish_audio_tts` is gone; `os.system` itself is preserved per `bmo/docs/DESIGN-CONSTRAINTS.md`.
- [ ] `create_dnd_dm_agent` declares `tools=[]` (no inert tool grants).
- [ ] `grep -rn "under construction" bmo/pi/web/static/js/bmo.js` returns nothing.
- [ ] `tests/test_security_headers.py` locks the hand-rolled header set; `bmo/pi/app.py` itself has a zero-line diff in this phase.
- [ ] `tests/test_requirements_sync.py` passes against all three lockfile pairs.
- [ ] Full `pytest bmo/pi/tests/` green (including the pre-existing 78 baseline tests in `test_base_agent.py` + `test_app_endpoints.py`, which mock `agents._registry` and must be unaffected); dnd-app 4-gate green; one phase commit pushed.

## Out of scope

- **`app.py` blueprint refactor + `AppState` consolidation** — PHASE-16 (this phase deliberately leaves `app.py` untouched so 16 starts clean).
- **Replacing `fish_audio_tts` with local streaming TTS (Kokoro/Piper, stream2sentence) and the `text[:500]` truncation fix** — PHASE-21. 15D hardens the existing cloud path only.
- **Discord narrate-path honesty (`ok:true` on failure), `_log` kwargs crash, bridge session UI** — PHASE-20.
- **VTT↔Discord sync plane (`push_discord_message` consumer wiring, `register_sync_routes`)** — PHASE-22 (15B leaves the `push_discord_message` call in `run()` untouched).
- **Replacing `os.system("curl …")` with a load-tested `httpx.stream` implementation** — standing design constraint says keep curl until that lands; no phase currently owns it (log as a suggestion if appetite emerges).
- **BMO deploy automation (Actions SSH deploy, blue/green, Docker)** — PHASE-42.
- **DM-engine feature work (recaps, memory, structured outputs)** — PHASE-23/24/25/26/31.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per landed sub-phase with file:line citations.)
