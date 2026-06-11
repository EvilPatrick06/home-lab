# PHASE-16 — BMO `app.py` Flask-blueprint refactor (calendar / music / tv / chat / system / realtime) + AppState consolidation

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Extract the six remaining route domains still inlined in `bmo/pi/app.py` (5,448 lines, 285 top-level defs) into dedicated modules under `bmo/pi/routes/`, following the pattern already proven by `routes/ide.py` (`register_<domain>(...)` + late-bound service handles + SocketIO handlers attached inside the register function). The six extractions are: **system** (health, wifi, service-restart, status-summary, volume/audio/TTS-output, settings/config), **music** (`/api/music/*`), **calendar** (`/api/calendar/*` incl. the OAuth flow), **tv** (`/api/tv/*` incl. the worker subprocess + auto-skip), **chat** (`/api/chat*` + `/api/dnd/*` + chat persistence), and **realtime** (all root-namespace SocketIO handlers). Shared cross-domain helpers move to three small new `services/` modules (`settings_store`, `chat_history`, `system_audio`), and the remaining single-value mutable globals (`_tts_output`, `_tv_is_on`, `_tv_auto_skip`) are consolidated onto the existing `AppState` dataclass in `bmo/pi/state.py` — finishing the state-consolidation work that `state.py` started. Every HTTP path, response shape, status code, and SocketIO event stays byte-identical; this is a pure structural refactor with zero behavior change, which is why it needs no feature flag.

## Dependencies & cross-phase notes

- **Depends on PHASE-15 (bmo-hygiene).** PHASE-15 decided AGAINST flask-talisman (upstream archived; LAN-HTTP incompatible) and instead ships `bmo/pi/tests/test_security_headers.py` as a regression lock on the hand-rolled `_cache_policy` after-request hook — with **zero `app.py` edits**, so this phase starts from a clean file. **This phase must NOT move or restructure the app-setup region** (`_cache_policy` at `app.py:43-148`, CSP block, `MAX_CONTENT_LENGTH`, secret key, `BMO_API_KEY` gate — all stay in `app.py`), and PHASE-15's `tests/test_security_headers.py` must remain green through every sub-phase here (it exists precisely to catch this refactor dropping the hook).
- **Coordinate with PHASE-20/21/22 (Discord bridge)** on `bmo/pi/app.py`: those phases cite the Discord DM bridge block (currently `app.py:2787–2948`) and the `register_sync_routes` wiring. This phase does **not** extract the Discord bridge routes — they stay in `app.py` — but the surrounding extractions will shift their line numbers substantially (expect the bridge block to land roughly 2,000 lines earlier). PHASE-20/22 executors must re-grep rather than trust line citations.
- **Coordinate with PHASE-42 (bmo-deploy-automation)**: it touches deployment scripts, not `app.py` internals; no file collision, but a restart of the `bmo` systemd service is required after this phase deploys to the Pi (the running service imports `app.py`).
- This phase touches only `bmo/pi/**` plus this plan file. No dnd-app or dungeon-scholar source files change, so the dnd-app 4-gate is expected to pass trivially; the meaningful gate is `pytest bmo/pi/tests/`.
- **Do not edit `.cursorrules` / `CLAUDE.md` / `AGENTS.md`** to describe the new layout (meta-files, INSTRUCTIONS.md rule 16). Documentation updates go in `bmo/docs/SERVICES.md` and module docstrings only.

## Verified findings

All verifications below were run 2026-06-10 against the live tree at the repo root (worktree `ai-p6-roadmap`, branch `master`, `bmo/pi/app.py` at commit `e7084dc2`-era HEAD). Re-run each command before implementing (rule 3); line numbers cited are exact as of authoring.

### Finding 1 — six route domains still inline in `app.py`; `routes/` holds only five extracted modules (VERIFIED)

`bmo/pi/routes/` contains exactly: `__init__.py` (0 lines), `ide.py` (1,522), `game_relay_ws.py` (195), `library_api.py` (138), `rclone_api.py` (235), `sounds_api.py` (119). None of calendar/music/tv/chat/system/realtime exist as modules. `app.py` is 5,448 lines.

```bash
ls bmo/pi/routes/ && wc -l bmo/pi/app.py bmo/pi/routes/*.py
grep -c "@app.route\|@socketio.on" bmo/pi/app.py          # → 188 route/handler decorators
```

Current section map of `app.py` (verified via `grep -n "^def \|^# ──" bmo/pi/app.py`):

| Section | Lines (2026-06-10) | Phase-16 disposition |
|---|---|---|
| gevent monkey-patch | 11–12 | stays (must remain first) |
| App setup, `_cache_policy`, CSP, CORS | 31–148 | stays (PHASE-15 territory) |
| `MAX_CHAT_MESSAGE_LEN`, `ALLOWED_CHAT_SPEAKERS`, `_is_voice_speaker`, `_normalize_chat_speaker` | 146–177 | → `services/chat_history.py` (16B) |
| Rate limiting: `_rate_limit_key`, `_is_localhost_request`, `limiter = Limiter(...)` (210), `RATE_LIMIT_*` (223–227) | 181–227 | → `extensions.py` (16A) |
| Secret key, `BMO_API_KEY` gate, `_bmo_client_is_trusted_localhost`, `_bmo_optional_api_key` | 230–325 | stays |
| `socketio = SocketIO(...)` | 334–337 | stays |
| Service globals (19 names) + timezone helpers `_normalize_timezone`/`_pi_timezone`/`_request_client_timezone` | 347–405 | stays |
| `init_services()` | 407–855 | stays (call sites updated) |
| `_sync_expression` | 857–874 | stays |
| Pages (favicon/index/ide) | 877–918 | stays |
| Health `/health` + `/api/health/full` (+ `/api/v1` aliases) | 919–956 | → `routes/system_api.py` (16C) |
| WiFi helpers + routes | 957–1310 | → `routes/system_api.py` (16C) |
| Service restart routes | 1311–1370 | → `routes/system_api.py` (16C) |
| `/api/status/summary` | 1371–1450 | → `routes/system_api.py` (16C) |
| Chat API: `_strip_markdown` (1453), `/api/chat` (1458) | 1451–1492 | → `routes/chat_api.py` (16G) |
| DnD: `_DND_ALLOWED_DATA_ROOTS` (1494), `_safe_dnd_path`, `/api/dnd/*` | 1494–1626 | → `routes/chat_api.py` (16G) |
| Agents API + scratchpad HTTP + `/api/init` | 1627–1743 | stays |
| Music `/api/music/*` | 1744–1959 | → `routes/music_api.py` (16D) |
| Calendar `/api/calendar/*` + OAuth helpers + auth url/status/callback | 1961–2399 | → `routes/calendar_api.py` (16E) |
| Camera, voice-enroll, timers/alarms, LED, OLED | 2400–2786 | stays |
| Discord DM bridge | 2787–2948 | stays (PHASE-20) |
| Volume: `_get_system_volume`, `_get_system_audio_state`, `_set_system_volume`, `_audio_unmute_sink` + `/api/volume`, `/api/audio/unmute` | 2949–3072 | helpers → `services/system_audio.py`; routes → `routes/system_api.py` (16C) |
| Audio output/inputs/bluetooth + `_tts_output = "pi"` (3171) + `/api/tts/*` | 3073–3205 | → `routes/system_api.py` (16C) |
| Scenes | 3206–3305 | stays |
| `_load_setting` / `_save_setting` | 3308–3344 | → `services/settings_store.py` (16A) |
| Weather/location, smart home | 3345–3499 | stays |
| Chat persistence: `RECENT_CHAT_FILE` (3503), `_MAX_RECENT` (3504), `DND_LOG_DIR` (3507), `_load_recent_chat`, `_save_recent_message`, `_save_dnd_message`, `_save_chat_message`, `_save_pending_assistant_stub` (3563), `_finalize_pending_assistant` (3578) | 3500–3597 | → `services/chat_history.py` (16B) |
| `_auto_resume_after_restart` (3598), `_restore_agent_history` (3626) | 3598–3645 | stays in `app.py` (startup orchestration; callers of chat_history) |
| `/api/chat/history`, `/api/chat/clear` | 3647–3724 | → `routes/chat_api.py` (16G) |
| Notes, lists, alerts, routines, personality | 3726–4032 | stays |
| TV: constants `TV_IP` (4040), `TV_KEYS`, `TV_APPS`, `_TV_WORKER` (4078), `_ensure_tv_worker` (4086), `_tv_cmd` (4113), `init_tv_remote` (4138), `_parse_media_description` (4189), `_get_tv_media_title` (4212), `/api/tv/*` (4311–4543), auto-skip `_auto_skip_loop` (4550) + routes (4575–4595) | 4033–4595 | → `routes/tv_api.py` (16F) |
| Notifications | 4596–4667 | stays |
| Settings API `/api/settings*`, `/api/config` | 4668–4725 | → `routes/system_api.py` (16C) |
| MCP, commands, memory | 4726–4888 | stays |
| `/api/chat/compact` | 4889–4899 | → `routes/chat_api.py` (16G) |
| Voice settings, models, games registry + SSE | 4900–5107 | stays |
| WebSocket events: `_bmo_websocket_authorized` (5110), `connect` (5123), `_finish_chat_response` (5170), `chat_message` (5234), `plan_approve`/`plan_reject` (5331/5348), `client_timezone` (5365), `scratchpad_read/write/clear` (5375–5404), `disconnect` (5406) | 5108–5415 | → `routes/realtime_ws.py` (16H) |
| `from routes.* import register_*` (5419–5423) + `__main__` block calling them (5425–5448) | 5417–5448 | reworked in 16I |

### Finding 2 — the `routes/ide.py` pattern is proven and is the template (VERIFIED)

`routes/ide.py:1380` defines `register_ide(flask_app, socketio_obj, agent_obj)`: stamps module-level `socketio`/`agent`, calls `flask_app.register_blueprint(ide_bp)`, and defines all `@socketio.on(...)` handlers *inside* the register function so the decorators close over the live SocketIO object. `routes/ide.py:50-58` defines `_resolve_agent()` which does `import app; return app.agent` at request time (late-binding — the blueprint imports before `init_services()` assigns the agent). `routes/ide.py:39` imports `from state import STATE`.

```bash
grep -n "def register_ide" -A 14 bmo/pi/routes/ide.py
grep -n "_resolve_agent" bmo/pi/routes/ide.py | head -3
```

**Critical nuance discovered during verification:** the existing `register_*` calls happen only inside `if __name__ == "__main__":` (`app.py:5425-5448`), which means `import app` (the test path — `tests/test_app_endpoints.py:121`, `tests/test_bmo_auth.py:12-13`) does NOT register the ide/library/rclone/sounds blueprints; tests of those surfaces mount the blueprints themselves (`tests/test_ide_blueprint.py:36-38`). The routes this phase extracts ARE currently exercised through `import app` (e.g. `TestHealth`, `TestChatAPI` in `test_app_endpoints.py`), so the six new `register_*` calls must run **at module import time** (bottom of `app.py`, outside `__main__`) — late-binding makes this safe because no live service is needed at registration.

### Finding 3 — audit's "~300 lines after all 6" target is stale (CORRECTED)

The audit claimed `app.py` would shrink to ~300 lines after the six extractions. Reality: `app.py` has grown to 5,448 lines and now also contains camera, voice-enroll, timers/alarms, LED/OLED, Discord bridge, scenes, weather, smart-home, notes, lists, alerts, routines, personality, notifications, MCP, commands, memory, voice-settings, models, and the games registry — none of which are in this phase's allocation. The six allocated extractions remove ≈2,900 lines; **the corrected post-phase target is `app.py` ≤ 2,650 lines** (verified arithmetic from the section map above). Do not chase ~300; further extractions are future work, not this phase.

### Finding 4 — audit's line ranges are stale (CORRECTED)

Audit said "calendar 1487–1900, tv 3354–3850, chat 1093–3130, system top-of-file, music/realtime scattered". Current reality (see Finding 1 table): calendar 1961–2399, music 1744–1959, tv 4033–4595, chat 1451–1626 + 3500–3724 + 4889–4899, system 919–1450 + 2949–3205 + 4668–4725, realtime 5108–5415. Use the table, not the audit.

### Finding 5 — AppState consolidation is already half-done; only single-value stragglers remain (CORRECTED)

`bmo/pi/state.py` already exists (the audit's "pairs with consolidating global mutable state behind an `AppState` class" is partially shipped): an `AppState` dataclass + `STATE` singleton holding `chat_lock`, `notes_lock`, `tv_media_lock`, `tv_proc_lock`, `ide_jobs_lock`, `notes_list`, `tv_media_cache`, `ide_jobs`, `win_proxy_pending`, `ide_job_counter`, `current_running_job_id`, `win_proxy_sid`. Its docstring explicitly promises: "TV remote / Pairing remote / Bluetooth — also singletons, in `app.py` for now (will move to `routes/tv.py` when that blueprint extracts)."

Remaining un-consolidated mutable globals in `app.py` (verified via `grep -n "^\s*global " bmo/pi/app.py`): `_tts_output` (line 3171, mutated at 3185-3190), `_tv_proc` (4082), `_tv_remote`/`_tv_is_on`/`_tv_loop`/`_tv_pairing_remote`/`_tv_loop_thread` (4035-4038, 4069-4070), `_tv_auto_skip`/`_tv_auto_skip_thread` (4546-4547), plus the 19 service singletons (which intentionally stay out of `AppState` per the state.py docstring). Disposition in this phase: **single values** (`tts_output: str`, `tv_is_on: bool`, `tv_auto_skip: bool`) become `AppState` fields; **process/connection handles** (`_tv_proc`, `_tv_remote`, `_tv_pairing_remote`, thread handles, `_tv_loop`) become module-level state of `routes/tv_api.py` (they are service handles, which state.py says do NOT live on `AppState`).

```bash
sed -n '1,95p' bmo/pi/state.py
grep -n "^\s*global " bmo/pi/app.py
```

### Finding 6 — cross-module importers of symbols this phase moves (VERIFIED)

- `bmo/pi/agent.py:1562` — `from app import _save_setting, socketio` inside `_handle_music_volume`. Must become `from services.settings_store import save_setting` (+ keep `from app import socketio`).
- `bmo/pi/tests/test_chat_speaker.py:12` — `from app import ALLOWED_CHAT_SPEAKERS, _is_voice_speaker, _normalize_chat_speaker`. Update to import from `services.chat_history`.
- `bmo/pi/tests/test_calendar_auth_paths.py:4-10` — imports `_calendar_config_dir`, `_calendar_legacy_config_dir`, `_calendar_merge_token_data`, `_ensure_calendar_credentials_path`, `_ensure_calendar_token_path` from `app`, and patches `app.shutil.copy2` / `app.os.path.exists` / `app.os.makedirs`. Update imports AND patch targets to `routes.calendar_api`.
- `bmo/pi/tests/test_app_endpoints.py` — patches `bmo_app_module.agent` (line 140) and `bmo_app_module.health_checker` (lines 203-283) on the imported `app` module. Late-binding (`import app` at request time inside the blueprints) preserves these monkeypatch points unchanged — this is the decisive reason to late-bind rather than copy service references at register time.
- No other non-test module imports app-level symbols (verified: `grep -rn "from app import\|import app$" bmo/pi --include="*.py" | grep -v tests/ | grep -v routes/ide.py` → only `agent.py:1562`).
- No `url_for(...)` usage anywhere in `app.py` or `bmo/pi/web/templates/*.html` (verified by grep), so blueprint endpoint-name prefixes (`system.health` vs `health`) break nothing.

### Finding 7 — limiter usage sites and the circular-import hazard (VERIFIED)

`limiter.limit` decorates exactly 7 routes (verified `grep -n "limiter.limit" bmo/pi/app.py`): `/api/chat` (1459, `RATE_LIMIT_CHAT`), `/api/dnd/load` (1516, `RATE_LIMIT_DND_LOAD`), `/api/discord/dm/narrate` (2893, `RATE_LIMIT_NARRATE` — stays in app.py), and four `/api/games*` routes (5024-5070, `RATE_LIMIT_GAMES` — stay in app.py). `RATE_LIMIT_IDE_JOBS` (225) is defined but never applied (pre-existing; leave as-is in `extensions.py`). The chat blueprint needs `limiter` at import time → the limiter must move out of `app.py` into an `extensions.py` module (deferred-init pattern: construct `Limiter(key_func=...)` without an app, `limiter.init_app(app)` in `app.py`; decorators bind to the limiter instance, not the app, so decorate-before-init is supported). Versions in play: `flask==3.1.3`, `flask-limiter==4.1.1`, `flask-socketio==5.6.1`, `gevent==26.5.0` (verified in `bmo/pi/requirements.txt:81-104`).

### Finding 8 — gevent monkey-patch gotcha applies to all new modules (VERIFIED)

`app.py:11-12` runs `from gevent import monkey; monkey.patch_all()` before any other import. `monkey.patch_all()` does not patch `concurrent.futures` — pool workers are real OS threads whose blocking I/O stalls the gevent loop. Existing `threading.Thread(daemon=True)` sites (auto-skip loop, TTS speak threads, code-agent task) become greenlets and are safe. **Constraint for every new module: keep `threading.Thread` usage verbatim; never introduce `ThreadPoolExecutor`/`ProcessPoolExecutor`; `subprocess.Popen` is fine for CPU-bound work** (the TV worker already uses it).

### Finding 9 — test harness facts an executor needs (VERIFIED)

- The worktree has no `bmo/pi/venv`; the main checkout's venv works against the worktree: `cd <worktree>/bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/ -q` (verified: `tests/test_chat_speaker.py` + `tests/test_bmo_auth.py` → 20 passed).
- `tests/conftest.py` mocks all hardware modules and stubs gevent; sets `BMO_SOCKETIO_ASYNC_MODE=threading` so `import app` constructs SocketIO without gevent (`app.py:334-337` reads that env var).
- `tests/test_app_endpoints.py:110-116` replaces `flask_socketio.SocketIO` with a MagicMock whose `.on` is a decorator passthrough — `register_realtime(socketio)` at app-module bottom must tolerate a MagicMock socketio (it will: `@socketio.on("x")` on a MagicMock simply returns the function).
- Blueprint tests follow `tests/test_ide_blueprint.py`: build a fresh `Flask` app, `app.register_blueprint(module.bp)`, monkeypatch module attributes, drive `test_client()`.

## Sub-phases

Execute in order; the tree stays importable/green after each. After each sub-phase run the cheap targeted check listed (NOT the full gate). All new modules start with a docstring stating origin (`Extracted from app.py 2026-06-10, PHASE-16`) and wiring notes, mirroring `routes/ide.py`'s header. All new `routes/` modules use lazy `import app as _app_module` inside accessor functions for service singletons — never copy service references at import or register time. Heavy imports (`services.voice_pipeline`, `services.monitoring`, google-auth libs) stay function-local exactly as they are today.

### 16A — `extensions.py` (deferred-init limiter) + `services/settings_store.py`

**Objective:** break the limiter/circular-import knot and make the dotted-settings helpers importable by blueprints and `agent.py`.

**Files:** new `bmo/pi/extensions.py`; new `bmo/pi/services/settings_store.py`; new `bmo/pi/tests/test_settings_store.py`; edit `bmo/pi/app.py`, `bmo/pi/agent.py`, `bmo/docs/SERVICES.md`.

**Steps:**
1. Create `bmo/pi/extensions.py`: move verbatim from `app.py:181-227` — `_rate_limit_key()`, `_is_localhost_request()`, `limiter = Limiter(key_func=_rate_limit_key, default_limits=[...], default_limits_exempt_when=_is_localhost_request, storage_uri="memory://", headers_enabled=True, swallow_errors=True)` **without** the `init_app` call, plus the five `RATE_LIMIT_*` constants. Module docstring: explains the deferred-init pattern (blueprints import `limiter` and decorate at import time; `app.py` calls `limiter.init_app(app)` once).
2. In `app.py`: delete that block; add `from extensions import limiter, RATE_LIMIT_CHAT, RATE_LIMIT_DND_LOAD, RATE_LIMIT_IDE_JOBS, RATE_LIMIT_NARRATE, RATE_LIMIT_GAMES` near the top (after `app = Flask(...)` is fine) and call `limiter.init_app(app)` where the old `limiter.init_app(app)` sat. The seven existing `@limiter.limit(...)` decorations in `app.py` keep working unchanged.
3. Create `bmo/pi/services/settings_store.py`: move `app.py:3308-3344` as public `load_setting(key, default=None)` / `save_setting(key, value)`. Make the file path a module constant `SETTINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "settings.json")` (note: `__file__` is now one level deeper under `services/`, hence the extra `dirname` — the resolved path must remain `bmo/pi/data/settings.json`; assert this in the test) and have both functions read it via the module attribute so tests can monkeypatch it. Keep the swallow-exceptions semantics identical.
4. In `app.py`: delete `_load_setting`/`_save_setting`; add `from services.settings_store import load_setting as _load_setting, save_setting as _save_setting` (keeps the 9 internal call sites — lines 453, 538, 836, 2979, 2998, 3006, 3013-3014, 3068 — diff-free; later sub-phases move several of those call sites out anyway).
5. `agent.py:1562`: replace `from app import _save_setting, socketio` with `from services.settings_store import save_setting as _save_setting` + a separate `from app import socketio` on the next line (preserving the lazy in-function import placement).
6. `bmo/docs/SERVICES.md`: add `settings_store.py` row ("Dotted-key get/set on `data/settings.json`; used by app routes + agent volume handlers").
7. New `tests/test_settings_store.py`: monkeypatch `SETTINGS_PATH` to a tmp file; test dotted set→get roundtrip, default on missing key/file, nested-key creation, and that `SETTINGS_PATH` ends with `bmo/pi/data/settings.json` equivalent (`os.path.join("pi", "data", "settings.json")` suffix when run from repo).

**Cheap check:** `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/test_settings_store.py tests/test_bmo_auth.py -q` and `python3 -m py_compile app.py extensions.py services/settings_store.py agent.py`.

**Acceptance:** both new modules import standalone; `import app` still works under the test mocks; the resolved settings path is unchanged; `agent.py` no longer imports `_save_setting` from `app`.

### 16B — `services/chat_history.py` (persistence + speaker normalization)

**Objective:** make chat persistence and the speaker enum importable by the chat blueprint, the realtime module, and `app.py`'s voice hook, without three-way duplication.

**Files:** new `bmo/pi/services/chat_history.py`; new `bmo/pi/tests/test_chat_history.py`; edit `bmo/pi/app.py`, `bmo/pi/tests/test_chat_speaker.py`, `bmo/docs/SERVICES.md`.

**Steps:**
1. Create `services/chat_history.py` holding, moved verbatim with underscores dropped from public names:
   - `MAX_CHAT_MESSAGE_LEN`, `ALLOWED_CHAT_SPEAKERS` (from `app.py:146-154`), `is_voice_speaker()`, `normalize_chat_speaker()` (157-177);
   - `RECENT_CHAT_FILE`, `MAX_RECENT` (=`_MAX_RECENT`), `DND_LOG_DIR` (3503-3507) — keep the `os.path.expanduser("~/home-lab/...")` values identical, as module attributes (monkeypatch points);
   - `load_recent_chat()` (3510), `save_recent_message()` (3523, uses `STATE.chat_lock` — `from state import STATE`), `save_dnd_message()` (3538), `save_chat_message()` (3556), `save_pending_assistant_stub()` (3563), `finalize_pending_assistant()` (3578).
2. `save_chat_message` reads `agent._dnd_context` today via the app global. Give the module `_agent_resolver: Callable[[], Any] = lambda: None` and `set_agent_resolver(fn)`; `save_chat_message` calls `agent = _agent_resolver()`. `app.py` calls `chat_history.set_agent_resolver(lambda: agent)` right after the service-globals block (module level is fine — the lambda reads the module global at call time, so it sees the agent `init_services()` assigns later).
3. In `app.py`: delete the moved blocks; add `from services import chat_history` and compat bindings used by code that stays in `app.py` (`init_services`'s `_voice_emit_with_oled` at 632-664 calls `_save_chat_message`/`_normalize_chat_speaker`; `_auto_resume_after_restart`/`_restore_agent_history` at 3598-3645 call `_save_chat_message`/`_load_recent_chat`; `/api/chat` until 16G): `_save_chat_message = chat_history.save_chat_message`, `_normalize_chat_speaker = chat_history.normalize_chat_speaker`, `_load_recent_chat = chat_history.load_recent_chat`, `_save_pending_assistant_stub = chat_history.save_pending_assistant_stub`, `_finalize_pending_assistant = chat_history.finalize_pending_assistant`, `MAX_CHAT_MESSAGE_LEN = chat_history.MAX_CHAT_MESSAGE_LEN`, `RECENT_CHAT_FILE = chat_history.RECENT_CHAT_FILE`, `DND_LOG_DIR = chat_history.DND_LOG_DIR`. (16G/16H/16I remove whichever bindings lose their last user; 16I greps for stragglers.)
4. Update `tests/test_chat_speaker.py:12` to `from services.chat_history import ALLOWED_CHAT_SPEAKERS, is_voice_speaker as _is_voice_speaker, normalize_chat_speaker as _normalize_chat_speaker` (keeps test bodies untouched).
5. New `tests/test_chat_history.py`: monkeypatch `RECENT_CHAT_FILE` to tmp; test rolling-buffer cap at `MAX_RECENT`, pending-stub write → `finalize_pending_assistant` replaces it (and strips `incomplete`), finalize-miss returns `False`, `save_chat_message` with default resolver (None agent) writes only the recent buffer, and with a stub agent whose `_dnd_context` is truthy also writes the DnD log (monkeypatch `DND_LOG_DIR` to tmp).
6. `bmo/docs/SERVICES.md`: add `chat_history.py` row.

**Cheap check:** `pytest tests/test_chat_history.py tests/test_chat_speaker.py tests/test_app_endpoints.py -q` (same venv interpreter), `py_compile` on changed files.

**Acceptance:** speaker tests pass from the new import path; `import app` green; `/api/chat` behavior unchanged (covered by `TestChatAPI` in `test_app_endpoints.py`).

### 16C — `services/system_audio.py` + `routes/system_api.py`

**Objective:** extract the system-management HTTP surface (health, wifi, service restart, status summary, volume/audio/Bluetooth/TTS-output, settings/config) — the largest single shrink (~850 lines).

**Files:** new `bmo/pi/services/system_audio.py`, new `bmo/pi/routes/system_api.py`; new `bmo/pi/tests/test_system_api.py`, `bmo/pi/tests/test_system_audio.py`; edit `bmo/pi/app.py`, `bmo/pi/state.py`, `bmo/docs/SERVICES.md`.

**Steps:**
1. Create `services/system_audio.py`: move `_get_system_volume` → `get_system_volume`, `_get_system_audio_state` → `get_system_audio_state`, `_set_system_volume` → `set_system_volume` (2951-2993), `_audio_unmute_sink` → `unmute_sink` (3019-3035). `get_system_audio_state`'s fallback uses `load_setting("volume.system", 25)` → import from `services.settings_store`. Keep the `wpctl` subprocess calls + `XDG_RUNTIME_DIR` env identical. SERVICES.md row.
2. Add `tts_output: str = "pi"` to `AppState` in `state.py` (single-value state section) and delete `_tts_output` from `app.py:3171`.
3. Create `routes/system_api.py` with `system_bp = Blueprint("system", __name__)` (NO url_prefix — paths span `/health`, `/api/...`; keep every path string absolute and byte-identical) and `register_system(flask_app)` that just registers the blueprint. Move verbatim:
   - health: `app.py:919-956` (both `/health`+`/api/v1/health` and `/api/health/full`+`/api/v1/health/full` stacked decorators; `_HEALTH_SCHEMA_VERSION`, `_HEALTH_REQUIRED_KEYS`);
   - wifi: 957-1310 (helpers `_wifi_interface`, `_wifi_status`, `_wifi_saved_networks`, `_wifi_scan_networks`, `_wifi_connect`, `_wifi_connect_saved` + the five routes);
   - service restart: 1311-1370; status summary: 1371-1450;
   - volume/audio routes: `/api/volume` GET (2996) + `/api/audio/unmute` (3037) + `/api/volume` POST (3046) + audio devices/status/output/inputs/input/bluetooth (3075-3175) + `/api/tts/output` GET/POST + `/api/tts/audio/<path:filename>` (3176-3205);
   - settings API: `/api/settings` GET/POST, `/api/settings/reload`, `/api/config` (4668-4725).
4. Late-binding inside the module: `def _app(): import app; return app` — handlers reference `_app().health_checker`, `_app().music`, `_app().voice`, `_app().timers`, `_app().audio_service`, `_app().location_service`, `_app().socketio` (for the `volume_update` emit at old line 3070). `/api/tts/output` POST reads/writes `STATE.tts_output` and still sets `voice._tts_output_mode`. `load_setting`/`save_setting` come from `services.settings_store`; volume helpers from `services.system_audio`.
5. In `app.py`: delete the moved sections; update the two remaining internal callers — `init_services` volume restore (`app.py:836-838`) → `from services.system_audio import set_system_volume`, and music-route unmute calls (1767, 1781, 1802 — until 16D moves them). Add `from routes.system_api import register_system` + `register_system(app)` **at module bottom, OUTSIDE `__main__`** (see Finding 2).
6. New `tests/test_system_audio.py`: mock `subprocess.run` to return `"Volume: 0.25 [MUTED]"` etc.; assert parse → `{"volume": 25, "muted": True}`, set clamps to 0..1.5, unmute returns False on exception.
7. New `tests/test_system_api.py`: mount `system_bp` on a fresh Flask app with a stub `app` module entry in `sys.modules`? — no: simpler and matching `test_app_endpoints.py`, drive through `import app` (the blueprint is registered at import after step 5) and reuse its mock scaffolding style for: `/health` 200 + `api_version`, `/api/health/full` schema keys with `app.health_checker = None`, `/api/volume` GET shape with mocked `system_audio` functions (monkeypatch `routes.system_api` imports), `/api/tts/output` POST validation (400 on bad value, STATE.tts_output updated), `/api/settings` POST 400 on missing key.

**Cheap check:** `pytest tests/test_system_api.py tests/test_system_audio.py tests/test_app_endpoints.py -q` (the existing health/full-health/status-summary tests in `test_app_endpoints.py` MUST still pass unchanged — they monkeypatch `app.health_checker`, which late-binding honors).

**Acceptance:** all pre-existing `test_app_endpoints.py` health/status tests green without edits; `app.py` no longer contains `/api/wifi`, `/api/volume`, `/api/settings` strings (`grep -c "api/wifi" bmo/pi/app.py` → 0).

### 16D — `routes/music_api.py`

**Objective:** extract `/api/music/*` (23 routes, `app.py:1744-1959`).

**Files:** new `bmo/pi/routes/music_api.py`, `bmo/pi/tests/test_music_api.py`; edit `bmo/pi/app.py`.

**Steps:**
1. `music_bp = Blueprint("music", __name__, url_prefix="/api/music")`; convert each `@app.route("/api/music/X")` to `@music_bp.route("/X")` (route bodies verbatim). `register_music(flask_app)` registers it.
2. Late-bind the music service: `def _music(): import app; return app.music`. Replace bare `music.` references with `_music().` (preserve today's behavior where a failed music-service init → `None` → `AttributeError` → Flask 500). `api_music_play`/`play_queue` use `unmute_sink`/`get_system_audio_state` from `services.system_audio`.
3. Remove the section from `app.py`; add `register_music(app)` at module bottom. Note `/api/volume` GET (now in system_api) reads `_app().music._player` — already handled in 16C.
4. `tests/test_music_api.py` (style of `test_ide_blueprint.py`): fresh Flask app + `music_bp`; monkeypatch `routes.music_api`'s `_music` to return a MagicMock and `unmute_sink`/`get_system_audio_state` to stubs; assert `/api/music/search` 400 without `q`; `/api/music/play` returns `ok/is_playing/muted/volume/warning` shape and the muted-sink warning; `/api/music/queue/add` 400 without song; `/api/music/play` with `{"no_unmute": true}` skips unmute (assert stub not called).

**Cheap check:** `pytest tests/test_music_api.py tests/test_music_service.py tests/test_music_restore.py -q`.

**Acceptance:** `grep -c "api/music" bmo/pi/app.py` → 0; new tests green.

### 16E — `routes/calendar_api.py`

**Objective:** extract `/api/calendar/*` + OAuth machinery (`app.py:1961-2399`).

**Files:** new `bmo/pi/routes/calendar_api.py`, edit `bmo/pi/app.py`, `bmo/pi/tests/test_calendar_auth_paths.py`.

**Steps:**
1. `calendar_bp = Blueprint("calendar_api", __name__, url_prefix="/api/calendar")`; routes become relative (`/events`, `/today`, `/next`, `/create`, `/update/<event_id>`, `/delete/<event_id>`, `/auth/url`, `/auth/status`, `/auth/callback`). Module name carries the `_api` suffix (repo gotcha: never shadow stdlib `calendar` naming patterns; matches `library_api.py` convention).
2. Move helpers verbatim: `_calendar_config_dir` (2025), `_calendar_legacy_config_dir` (2029), `_ensure_calendar_credentials_path` (2034), `_ensure_calendar_token_path` (2054), `_calendar_read_token_file` (2074), `_calendar_merge_token_data` (2085), `_calendar_write_token_file` (2094), `_calendar_client_config` (2103), `_calendar_auth_html` (2184). Module needs top-level `import json, os, shutil, time` + `from flask import Blueprint, Response, jsonify, request` (the callback uses `Response`; `requests`/google-auth imports stay function-local as today).
3. Late-bind the service: `def _calendar(): import app; return app.calendar`. The auth-status/callback routes mutate `calendar._service`/`calendar._cache` — via the late-bound handle, behavior identical. **`_ensure_calendar_credentials_path` computes paths from `__file__`** (`os.path.dirname(os.path.abspath(__file__))` — old `app.py` location = `bmo/pi/`); under `routes/` it must become `os.path.dirname(os.path.dirname(os.path.abspath(__file__)))` so the config dir stays `bmo/pi/config` and the legacy dir `bmo/config`. The updated `test_calendar_auth_paths.py` assertions pin this.
4. Remove the section from `app.py`; `register_calendar(app)` at module bottom. After this, `app.py` may no longer use `shutil` at module level — leave import-pruning to 16I.
5. Update `tests/test_calendar_auth_paths.py`: import the five helpers from `routes.calendar_api`; change every `@patch("app.shutil...")`/`@patch("app.os...")` target to `routes.calendar_api...`; add one assertion that `_calendar_config_dir()` endswith `bmo/pi/config` (or the `os.sep` portable equivalent) to lock the `__file__` relocation fix.

**Cheap check:** `pytest tests/test_calendar_auth_paths.py tests/test_calendar_service.py -q`.

**Acceptance:** calendar path tests green from new module; `grep -c "api/calendar" bmo/pi/app.py` → 0; config-dir resolution proven unchanged by test.

### 16F — `routes/tv_api.py` (worker, pairing, keys, media title, auto-skip)

**Objective:** extract the entire TV remote subsystem (`app.py:4033-4595`) and finish the `state.py` TV promise.

**Files:** new `bmo/pi/routes/tv_api.py`, `bmo/pi/tests/test_tv_api.py`; edit `bmo/pi/app.py`, `bmo/pi/state.py`.

**Steps:**
1. Add to `AppState`: `tv_is_on: bool = True`, `tv_auto_skip: bool = False`. Update `state.py`'s docstring "What does NOT live here" TV bullet to say the TV singletons now live in `routes/tv_api.py`.
2. `tv_bp = Blueprint("tv", __name__, url_prefix="/api/tv")`. Move verbatim: constants `TV_IP`, `_TV_CERT_DIR`/`_TV_CERTFILE`/`_TV_KEYFILE`, `TV_KEYS`, `TV_APPS`, `_TV_WORKER`, `_TV_PYTHON` (4040-4081 — **all are `__file__`-relative; under `routes/` each needs the parent-of-parent dirname so they still resolve to `bmo/pi/tv_cert.pem`, `bmo/pi/services/tv_worker.py`, `bmo/pi/venv/bin/python3`**); module state `_tv_proc`, `_tv_remote`, `_tv_pairing_remote`, `_tv_loop`, `_tv_loop_thread`, `_tv_auto_skip_thread`; functions `_ensure_tv_worker` (4086), `_tv_cmd` (4113), `init_tv_remote` (4138), `_parse_media_description` (4189), `_get_tv_media_title` (4212), `_auto_skip_loop` (4550); all 14 `/api/tv/*` routes (4311-4543) + the two auto-skip routes (4575-4595). `STATE.tv_proc_lock`/`tv_media_lock`/`tv_media_cache` usage carries over via `from state import STATE`. Replace every `_tv_is_on` global read/write with `STATE.tv_is_on`, and `_tv_auto_skip` with `STATE.tv_auto_skip` (drop the `global` statements).
3. Public seam for `app.py`'s `init_services` scene closures (`app.py:677, 708-760`): export `tv_cmd(action, **kwargs)` (= `_tv_cmd`), `tv_connected() -> bool` (returns `_tv_remote is not None or os.path.exists(_TV_CERTFILE)` — the exact expression used at 711/718/726/745), `TV_APPS`, `init_tv_remote`, and `tv_is_on()` / `set_tv_is_on(v)` thin wrappers over `STATE.tv_is_on`. Rewrite the five scene closures in `app.py` against this seam (`from routes.tv_api import tv_cmd, tv_connected, TV_APPS, init_tv_remote, tv_is_on, set_tv_is_on` — import placed with the other route imports at the bottom is too late for `init_services` if it's defined above; place this import function-locally inside `init_services` to dodge ordering, matching the file's existing lazy-import style). `threading.Thread(target=init_tv_remote, ...)` at 677 uses the imported symbol.
4. `register_tv(flask_app)` registers the blueprint; call at `app.py` bottom. Remove the whole 4033-4595 section.
5. `tests/test_tv_api.py`: fresh Flask app + `tv_bp`; monkeypatch `routes.tv_api._tv_cmd` to a stub; assert `/api/tv/auto-skip` GET reflects `STATE.tv_auto_skip`, POST toggles it (monkeypatch `threading.Thread` to avoid the real loop), `/api/tv/key` rejects unknown keys (per existing 4391 body), `/api/tv/launch` rejects unknown apps, path constants resolve under `bmo/pi/` (assert `_TV_WORKER` endswith `services/tv_worker.py` and its parent dir == the `pi` dir — locks the `__file__` relocation). Reset `STATE.tv_auto_skip`/`tv_is_on` in fixture teardown.

**Cheap check:** `pytest tests/test_tv_api.py tests/test_app_endpoints.py -q`.

**Acceptance:** `grep -c "_tv_cmd\|TV_APPS" bmo/pi/app.py` → only the `init_services` seam imports remain; no `global _tv` statements anywhere (`grep -n "global _tv" bmo/pi` → empty); scene service closures still constructed.

### 16G — `routes/chat_api.py`

**Objective:** extract the chat + DnD HTTP surface.

**Files:** new `bmo/pi/routes/chat_api.py`, `bmo/pi/tests/test_chat_api.py`; edit `bmo/pi/app.py`.

**Steps:**
1. `chat_bp = Blueprint("chat", __name__)` (no prefix — spans `/api/chat*` and `/api/dnd/*`; keep absolute paths). Move verbatim: `_strip_markdown` (1453), `/api/chat` (1458-1492), `_DND_ALLOWED_DATA_ROOTS` + `_safe_dnd_path` (1494-1514), `/api/dnd/load|sessions|sessions/<date>|sessions/<date>/restore|gamestate|players` (1515-1626), `/api/chat/history` + `/api/chat/clear` (3647-3724), `/api/chat/compact` (4889-4899).
2. Rate limits: `from extensions import limiter, RATE_LIMIT_CHAT, RATE_LIMIT_DND_LOAD`; decorate `/api/chat` and `/api/dnd/load` exactly as before (`@chat_bp.route(...)` then `@limiter.limit(RATE_LIMIT_CHAT)` — decorator order as in current code: route outermost).
3. Late-binding: `def _app(): import app; return app`; use `_app().agent`, `_app().voice`, `_app().socketio` (the `chat_cleared` emit in `/api/chat/clear`), `_app()._request_client_timezone(...)` (timezone helpers stay in `app.py` because the timer/alarm routes that remain there use them — verified call sites at 2590/2616/2664). Persistence + speaker normalization come from `services.chat_history` (`normalize_chat_speaker`, `save_chat_message`, `load_recent_chat`, `RECENT_CHAT_FILE`, `DND_LOG_DIR`, `MAX_CHAT_MESSAGE_LEN`).
4. Remove the moved blocks from `app.py`; `register_chat(app)` at module bottom. Drop the now-unused 16B compat bindings that `/api/chat` was the last consumer of (`MAX_CHAT_MESSAGE_LEN`, `RECENT_CHAT_FILE`, `DND_LOG_DIR` if `_restore_agent_history`/`_auto_resume_after_restart` don't use them — they use `load_recent_chat`/`save_chat_message` only; verify by grep before deleting).
5. `tests/test_chat_api.py`: drive through `import app` + test client (reusing `test_app_endpoints.py`'s mock scaffolding pattern): `/api/chat` 400 on missing/empty message, 413 over `MAX_CHAT_MESSAGE_LEN`, 200 happy path with mocked `app.agent` (assert speaker normalization: posting `speaker:"voice:gavin"` without `source_voice` persists as `text` — monkeypatch `services.chat_history.RECENT_CHAT_FILE` to tmp and inspect), `/api/dnd/load` 403 on out-of-jail path + 400 on empty characters list, `/api/chat/history` returns list.

**Cheap check:** `pytest tests/test_chat_api.py tests/test_app_endpoints.py tests/test_chat_history.py -q` (the existing `TestChatAPI` class in `test_app_endpoints.py` must pass unchanged — it posts `/api/chat` against `bmo_app_module.agent`).

**Acceptance:** existing chat endpoint tests green without edits; `grep -c "api/dnd\|api/chat" bmo/pi/app.py` → 0 route definitions (string may appear in comments only).

### 16H — `routes/realtime_ws.py`

**Objective:** extract the nine root-namespace SocketIO handlers + `_finish_chat_response`.

**Files:** new `bmo/pi/routes/realtime_ws.py`, `bmo/pi/tests/test_realtime_ws.py`; edit `bmo/pi/app.py`.

**Steps:**
1. Create `register_realtime(socketio_obj)` following `register_ide`'s shape (`routes/ide.py:1380`): stamp module-level `socketio = socketio_obj`, then define all handlers inside with `@socketio.on(...)`: `connect` (from `app.py:5123-5168`), `chat_message` (5234-5330), `plan_approve` (5331), `plan_reject` (5348), `client_timezone` (5365), `scratchpad_read`/`write`/`clear` (5375-5404), `disconnect` (5406-5413). Move `_bmo_websocket_authorized` (5110-5121) and `_finish_chat_response` (5170-5232) as module-level functions.
2. Late-binding: `def _app(): import app; return app` pattern as elsewhere; the handlers resolve `_app().agent`, `_app().voice`, `_app().timers`, `_app().weather`, `_app().music`, `_app().calendar`, `_app().oled_face`, `_app().alert_service`, `_app()._sync_expression`, `_app()._normalize_timezone`, `_app()._pi_timezone`, `_app()._request_client_timezone`, `_app().app.app_context()` (in `_finish_chat_response` and the code-agent error path), and `_app().BMO_API_KEY` + `_app()._bmo_client_is_trusted_localhost()` inside `_bmo_websocket_authorized` (so `test_bmo_auth.py`-style monkeypatching of `app.BMO_API_KEY` keeps working). `disconnect` keeps calling `routes.ide.cleanup_client_session(request.sid)` (direct import — both are routes modules, no cycle) and `timers.clear_client`. Chat persistence via `services.chat_history` (`save_chat_message`, `save_pending_assistant_stub`, `finalize_pending_assistant`, `normalize_chat_speaker`).
3. In `app.py`: delete lines 5108-5415; the existing `from routes.ide import register_ide, cleanup_client_session` import drops `cleanup_client_session` if nothing else in `app.py` uses it (the disconnect handler moved). Add `from routes.realtime_ws import register_realtime` + `register_realtime(socketio)` at module bottom (outside `__main__` — handlers were previously registered at import time via module-level decorators, this preserves that; under `test_app_endpoints.py`'s MagicMock socketio the decorators are passthrough no-ops, verified Finding 9).
4. `tests/test_realtime_ws.py`: build a real `Flask` + `SocketIO(app_, async_mode="threading")` (pop the `flask_socketio` stub like `test_app_endpoints.py:404-410` does), inject a stub `app` module into `sys.modules` (`types.ModuleType` with `agent`=MagicMock returning a chat dict, `voice=None`, `timers=None`, `weather=None`, `music=None`, `calendar=None`, `oled_face=None`, `alert_service=None`, `BMO_API_KEY=""`, `_sync_expression=lambda e: None`, `_normalize_timezone=lambda x: None`, `_pi_timezone=lambda: "America/New_York"`, `_request_client_timezone=lambda **k: "America/New_York"`, `app=app_`) **before** importing `routes.realtime_ws`; call `register_realtime(sio)`; assert: client connects (open auth), `chat_message` produces a `chat_response` in `get_received()`, `connect` with `BMO_API_KEY="k"` on the stub and no auth dict is rejected (`is_connected()` False), scratchpad_read with `agent.orchestrator` emits `scratchpad_update`. Monkeypatch `services.chat_history.RECENT_CHAT_FILE` to tmp so handler persistence doesn't write the real buffer.
5. This sub-phase finally makes the realtime handlers genuinely unit-testable (the old `test_app_endpoints.py` SocketIO tests run against a fresh SocketIO with no handlers attached and assert nothing — `assert len(event_names) >= 0` at line 463 — leave those tests as-is; they still pass).

**Cheap check:** `pytest tests/test_realtime_ws.py tests/test_app_endpoints.py -q`.

**Acceptance:** `grep -c "@socketio.on" bmo/pi/app.py` → 0; new realtime tests prove a real round-trip (`chat_message` → `chat_response`), which no test did before.

### 16I — `app.py` final wiring, import prune, state.py/docs truth

**Objective:** leave `app.py` as setup + service init + the un-extracted domains, with honest docs.

**Files:** edit `bmo/pi/app.py`, `bmo/pi/state.py`, `bmo/docs/SERVICES.md` (only if rows missed), `bmo/pi/routes/` module docstrings as needed.

**Steps:**
1. Consolidate the registration block at `app.py` bottom: keep `register_ide(app, socketio, agent)` + `register_game_relay`/`register_library`/`register_rclone`/`register_sounds` inside `__main__` exactly as today (out of scope to move them), with the six new `register_*` calls grouped at module level just above `__main__`, each with a one-line comment. Add a comment explaining the split: new blueprints late-bind services so they register at import (tests see them); `register_ide` predates that and still runs post-`init_services()`.
2. Dead-import prune: after the moves, check and remove now-unused module-level imports in `app.py` (`shutil` — calendar was the only user, verify; `re` — used by `_strip_markdown` which moved, but also `_auto_skip_loop` which moved, verify remaining users e.g. none → remove; `secrets` — still used by `_get_secret_key`; keep). Run `grep -n "^import \|^from " bmo/pi/app.py` then `grep -c "<name>\." app.py` per candidate. Do NOT prune `stream_with_context`/`Response` (games SSE + camera stream still use them).
3. Verify zero leftover references to moved private names: `grep -n "_load_setting\|_save_setting\|_normalize_chat_speaker\|_save_chat_message\|_tv_cmd\|_tts_output\|_get_system_audio_state\|_calendar_config_dir\|_finish_chat_response" bmo/pi/app.py` — every hit must be either the compat import alias (settings) or the `init_services` TV seam; anything else gets fixed.
4. `state.py`: final docstring sweep — the "Pairs with the planned remaining-blueprint splits" paragraph becomes "Used by the routes/ blueprint modules (`routes/chat_api.py`, `routes/tv_api.py`, …)"; the AppState field list comment gains the three new fields.
5. Update the module docstring at the top of `app.py`: list what still lives here (setup/auth/init_services + camera/timers/LED/OLED/discord/scenes/weather/smart-home/notes/lists/alerts/routines/personality/notifications/MCP/commands/memory/voice-settings/models/games) and point at `routes/` for the rest.
6. Line-count sanity: `wc -l bmo/pi/app.py` ≤ 2,650.

**Cheap check:** `python3 -m py_compile bmo/pi/app.py bmo/pi/extensions.py bmo/pi/routes/*.py bmo/pi/services/settings_store.py bmo/pi/services/chat_history.py bmo/pi/services/system_audio.py` then proceed straight to the end-of-phase 4-gate (rule 5).

**Acceptance:** compile-clean; full `pytest bmo/pi/tests/` green; `app.py` ≤ 2,650 lines; no route path string changed anywhere (`git diff` review: every deleted `@app.route("X")` has a matching added blueprint route serving the same absolute path).

## Research notes

- **Blueprint mechanics** — Flask blueprints record operations and replay them on `register_blueprint`; endpoint names get the blueprint-name prefix (only endpoints, not URLs); `url_prefix` is optional, so a blueprint may carry absolute paths spanning several prefixes (our `system`/`chat` cases). Blueprint-level `before_request`/`errorhandler` exist but we deliberately keep the app-level `_bmo_optional_api_key` gate and `_cache_policy` on the app object so behavior is identical for extracted and non-extracted routes. Source: https://flask.palletsprojects.com/en/stable/blueprints/
- **Flask-Limiter + blueprints** — `limit()`/`exempt()` apply to blueprint view functions and whole blueprints; the deferred-init pattern (`limiter = Limiter(key_func)` in a separate module, `limiter.init_app(app)` later) is the documented way to avoid circular imports, and decorators bind to the limiter instance rather than the app so decorate-before-init is safe. One caveat from the docs: nested blueprints (blueprint registered on another blueprint) had limiter bugs pre-2.3 — we use only flat blueprints. We're on `flask-limiter==4.1.1`. Sources: https://flask-limiter.readthedocs.io/en/stable/recipes.html , https://flask-limiter.readthedocs.io/en/stable/
- **Flask-SocketIO handler organization** — handlers can be attached without decorators via `socketio.on_event('name', fn, namespace=...)`, or via class-based `Namespace` subclasses. We instead reuse the repo's own proven shape (decorators inside a `register_*(socketio_obj)` function, `routes/ide.py:1392-1394`) because (a) it's already the house pattern, (b) class namespaces would change handler `self` semantics for no gain, and (c) the root namespace must stay `/` for the kiosk client. Source: https://flask-socketio.readthedocs.io/en/latest/getting_started.html
- **Late-binding over dependency injection** — alternatives considered: passing service objects into `register_*` (what `register_ide` does for `agent`) or an application-factory rewrite. Rejected: register-time injection freezes references made before `init_services()` runs and breaks the test suite's `app.<service> = mock` monkeypatching (Finding 6); a factory rewrite is a much larger blast radius and would invalidate every `import app` test. Late-binding (`import app` inside the handler, attribute lookup at request time) is what `routes/ide.py:_resolve_agent` already does and is the minimal-risk path.
- **gevent constraint** — `monkey.patch_all()` (app.py:11-12) does not patch `concurrent.futures`; new modules keep `threading.Thread(daemon=True)` (greenlets) and `subprocess.Popen` only (Finding 8; this constraint was carried in the consolidated 2026-06-10 audit as a high design-gotcha).
- **Why no feature flag** — every extraction preserves URL, method, payload, status code, and SocketIO event names byte-for-byte; the kiosk web UI, dnd-app `bmo-bridge.ts`, and lan-discovery `/health` probe are URL-coupled only. A flag would double the surface for zero risk reduction.

## Test plan

- **New test files:** `tests/test_settings_store.py` (16A), `tests/test_chat_history.py` (16B), `tests/test_system_audio.py` + `tests/test_system_api.py` (16C), `tests/test_music_api.py` (16D), `tests/test_tv_api.py` (16F), `tests/test_chat_api.py` (16G), `tests/test_realtime_ws.py` (16H).
- **Updated test files:** `tests/test_chat_speaker.py` (import path only, 16B), `tests/test_calendar_auth_paths.py` (import + patch targets + config-dir pin, 16E).
- **Must-pass-unchanged regression files:** `tests/test_app_endpoints.py` (health, status, chat HTTP, index, SocketIO smoke), `tests/test_bmo_auth.py` (auth gate stays in app.py), `tests/test_security_headers.py` (lands in PHASE-15; locks the `_cache_policy` hook this refactor must not drop), `tests/test_ide_blueprint.py`, `tests/test_game_registry.py`, `tests/test_music_service.py`, `tests/test_calendar_service.py`. Any needed edit to these (other than the two listed) means a behavior regression — stop and fix the refactor, not the test.
- **Per-sub-phase cheap checks** are listed inline above (single-file pytest runs + `py_compile`); interpreter: `/home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest`, cwd `bmo/pi` (Finding 9).
- **End-of-phase 4-gate (rule 5):** `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` (expected trivially green — no dnd-app sources touched) **plus**, because this phase is Pi-side: `cd bmo/pi && /home/patrick/home-lab/bmo/pi/venv/bin/python -m pytest tests/ -q` fully green.
- **Post-deploy note for the commit body:** the Pi's running `bmo` service must be restarted (`sudo systemctl restart bmo`) when this lands on the Pi; per CLAUDE.md, warn before restarting and don't leave the service failed.

## Acceptance criteria

1. Six new modules exist and are registered at `app.py` module scope: `routes/system_api.py`, `routes/music_api.py`, `routes/calendar_api.py`, `routes/tv_api.py`, `routes/chat_api.py`, `routes/realtime_ws.py`; plus `extensions.py`, `services/settings_store.py`, `services/chat_history.py`, `services/system_audio.py`.
2. `bmo/pi/app.py` ≤ 2,650 lines; zero `@socketio.on` decorators; zero route definitions for `/api/wifi`, `/api/volume`, `/api/audio`, `/api/tts`, `/api/settings`, `/api/config`, `/api/status`, `/api/service`, `/health`, `/api/music`, `/api/calendar`, `/api/tv`, `/api/chat`, `/api/dnd` remaining in it.
3. Every extracted route serves the identical absolute path + methods (diff review per 16I acceptance); no consumer (kiosk JS, dnd-app `bmo-bridge.ts`, lan-discovery) changes.
4. `AppState` gains `tts_output`/`tv_is_on`/`tv_auto_skip`; `grep -rn "^\s*global " bmo/pi/app.py` returns only the `init_services` service-singleton declaration (currently line 411; it will shift upward as sections above it are removed).
5. `agent.py` no longer imports `_save_setting` from `app`.
6. Full `pytest bmo/pi/tests/` green, including the 8 new test files; `tests/test_app_endpoints.py` and `tests/test_bmo_auth.py` pass without modification.
7. `bmo/docs/SERVICES.md` documents the three new services modules.
8. dnd-app 4-gate green; single phase commit + push per INSTRUCTIONS.md rule 5; plan moved to `completed/` per rule 8.

## Out of scope

- **Discord DM bridge routes** (`app.py` 2787–2948) and all narrate/start/stop fixes — PHASE-20/21.
- **`vtt_sync` / `register_sync_routes` wiring or deletion** — PHASE-22.
- **flask-talisman / security-header work** in the app-setup region — PHASE-15 (dependency; already landed by execution time).
- **Further extractions** (camera, voice-enroll, timers/alarms, LED/OLED, scenes, weather, smart-home, notes, lists, alerts, routines, personality, notifications, MCP, commands, memory, voice-settings, models, games registry, agents/scratchpad HTTP, `/api/init`) — not allocated to any current phase; log as a BMO-SUGGESTIONS entry only if friction demands it.
- **Moving `register_ide`/`register_game_relay`/`register_library`/`register_rclone`/`register_sounds` out of `__main__`**, or refactoring `routes/ide.py` internals.
- **pip-tools / venv package-surface work** — PHASE-15 noted it; not here.
- **BMO deploy automation** (how this reaches the Pi) — PHASE-42.

## Completed

- (filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations)
