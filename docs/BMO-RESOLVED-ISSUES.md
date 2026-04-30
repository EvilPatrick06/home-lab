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
