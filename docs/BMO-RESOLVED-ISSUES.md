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
