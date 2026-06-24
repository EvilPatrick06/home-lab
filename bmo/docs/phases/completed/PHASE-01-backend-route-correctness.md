# PHASE-01 — bmo backend route & service correctness

> Authored 2026-06-24 from `bmo/docs/phases/QA/QA-report-2026-06-24.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the server-side dashboard failures the 2026-06-24 QA pass found — the four findings where a `/api/*` call returns 404 or 500 and the UI silently swallows it. Concretely: (1) **list items can't be checked off or deleted** because the `ListService` matches items by text while the routes pass the item **id** (404 on every check/delete from the dashboard); (2) the **entire Music tab is down** — `app.music` is `None`, so every `/api/music/*` route dereferences `None` → `AttributeError` → Flask 500, and the dashboard hot-polls `/api/music/state` so the failure floods the network log; (3) the **Calendar subsystem 500s** on `/events`, `/today`, `/next`, and `/create` even though OAuth is valid, because the cached Google API client (`CalendarService._service`) is stale and the routes only catch `RuntimeError` (or nothing at all); (4) the **System Status card reads "monitoring isn't running"** because `app.health_checker` is `None` and the route/card can't tell "failed to start" from "intentionally off". Also clears the related backend-data leak: ~200 **seeded test messages ("Hello from BMO!")** that leaked from the test fixtures into the live chat-history store, plus the test-isolation gap that let them get there.

This phase is **server-side only** (Python under `bmo/pi/`, plus pytest). The frontend swallow-the-error behaviour, the realtime/socket.io failures, and the dashboard polling/UX are PHASE-02 and PHASE-03.

## Dependencies & cross-phase notes

- **No prerequisite phases.** This is the first plan in the bmo per-domain set ([`PHASE-INDEX.md`](./PHASE-INDEX.md)); it starts from `origin/master@d0974250`.
- **PHASE-02 (realtime reliability)** fixes the *frontend* side of the same Music and Calendar findings — `searchMusic()` parsing the 500 HTML as JSON, and the calendar render showing a false "No events" on a backend error. This phase makes the backend return a clean `503`/structured-error payload; PHASE-02 makes the frontend honor it. The two are complementary and independent (different files); land them in either order, but PHASE-02's "show an error state" steps assume this phase's structured 503/offline payloads exist, so prefer this phase first.
- **PHASE-03 (dashboard UX round)** owns the cross-cutting polling backoff (so `/api/music/state` stops hot-polling a 500) and the chat-history *frontend* display. This phase only clears the leaked data + closes the test-isolation hole; the retention/poll-backoff behaviour is PHASE-03.
- **Live-Pi boundary (INSTRUCTIONS.md rule 6 / "Never mutate the live Pi"):** deleting the polluted `recent_chat.json` and restarting the music service are **live-Pi data/service mutations** — NOT the executer's job. This phase ships the *code* (test isolation, a one-shot guard, route hardening) and **documents** the one-time owner cleanup; it never runs `rm` on Pi data or `systemctl restart`.

## Verified findings

All citations verified 2026-06-24 against `origin/master@d0974250` in the `auto/bmo-phase-maker` worktree. `bmo/pi/app.py` is **2,947 lines**. Baseline build/test gate is `bmo-pi-pytest.yml` (`cd bmo/pi && python -m pytest`); the cheap per-sub-phase check is the single affected test file plus `ruff check` on touched files.

### F1 — List check/delete 404: service matches by text, routes pass the id

**Status: confirmed.** `ListService.add_item` mints `id = str(uuid.uuid4())[:8]` (`bmo/pi/services/list_service.py:70`) and the frontend addresses items by that id — `bmo/pi/web/static/js/bmo.js:4343` (`DELETE /api/lists/<name>/items/<itemId>`) and `bmo.js:4352` (`POST /api/lists/<name>/items/<itemId>/check`). But the service methods match on **text**:

- `check_item(self, list_name, text, done=True)` (`list_service.py:99-111`): `for item in lst["items"]: if text_lower in item["text"].lower():` — substring match on the item text.
- `remove_item(self, list_name, text)` (`list_service.py:79-97`): exact-then-substring match on the item text.

The routes pass the URL path segment (the **id**) straight through as that `text` argument:

- `api_list_check_item(name, item_id)` → `list_service.check_item(name, item_id, done)` (`app.py:2285-2296`).
- `api_list_remove_item(name, item_id)` → `list_service.remove_item(name, item_id)` (`app.py:2275-2283`).

An id like `55d06c8a` is never a substring of the item text, so the service returns `False` → the route returns `404` (`{"error": "Item not found"}`). `add_item` (POST) works because it doesn't look anything up. The notes service (separate, id-based) works correctly, which isolates the defect to the list service's lookup contract.

```bash
sed -n '79,111p' bmo/pi/services/list_service.py     # remove_item + check_item match on text
sed -n '2275,2296p' bmo/pi/app.py                     # routes pass <item_id> as the text arg
grep -n "items/\${itemId}" bmo/pi/web/static/js/bmo.js   # 4343, 4352 — frontend addresses by id
```

### F2 — Music tab fully down: service is `None`, every route 500s unguarded

**Status: confirmed.** `init_services` constructs `MusicService(...)` inside a `try/except` that logs `[bmo] Music: SKIPPED` and leaves the module global `music = None` on any constructor exception (`app.py:659-670`; the global is declared at `app.py:414`). The route layer resolves the service late and dereferences it with **no `None` guard**:

- `_music()` returns `app.music` (`bmo/pi/routes/music_api.py:20-22`).
- `api_music_state` → `return jsonify(_music().get_state())` (`music_api.py:133-135`).
- `api_music_search` → `results = music.search(query)` (`music_api.py:25-32`).
- ~30 other `/api/music/*` routes call `_music().<method>()` directly.

So `app.music is None` → `AttributeError: 'NoneType' object has no attribute 'get_state'` → Flask's default 500 (HTML page). The module docstring already names this as known behaviour: *"a failed init → None → AttributeError → Flask 500, the pre-extraction behavior"* (`music_api.py:3-5`). QA reproduced the 500 from localhost too (`curl http://127.0.0.1:5000/api/music/state` → 500), so it is app-level, not Cloudflare. Two distinct defects: **(a)** the init failure itself (the constructor raised at startup — likely ytmusicapi/VLC/cast backend or a dependency/auth fault; the real exception is in the Pi startup log under `[bmo] Music: SKIPPED`), and **(b)** the unguarded routes turning a missing service into a 500 instead of a clean 503.

```bash
sed -n '655,672p' bmo/pi/app.py                       # Music init try/except → music = None on failure
sed -n '20,32p;131,136p' bmo/pi/routes/music_api.py   # _music()/search/state — no None guard
```

### F3 — Calendar 500s: stale cached `_service`; routes catch too narrowly (or not at all)

**Status: confirmed.** `CalendarService._get_service()` builds and **caches** the Google client once (`if self._service is not None: return self._service`, `bmo/pi/services/calendar_service.py:97-146`); after that it is never re-validated or rebuilt. Every read/write path (`get_upcoming_events` 150-170, `get_today_events` 172-174, `get_next_event` 176-179, `create_event` 183-202) calls `_get_service()` and then a `service.events()....execute()` that raises a **non-`RuntimeError`** (a `googleapiclient`/transport/`RefreshError` at request time) when the cached client is stale. The routes don't survive that:

- `/events` (`calendar_api.py:30-38`) catches **only** `RuntimeError` → any other exception becomes a Flask 500.
- `/today` (41-43), `/next` (46-49), `/create` (52-66) have **no `try/except` at all** — e.g. `return jsonify(_calendar().get_today_events())` → 500 on any error.

The smoking gun is the auth probe: `api_calendar_auth_status` succeeds **only because it forces a rebuild** — `calendar._service = None; calendar.get_next_event()` (`calendar_api.py:316-332`). So nulling `_service` fixes the call, which proves the cached client is the stale culprit. QA confirmed valid OAuth (`/api/calendar/auth/status` → 200 "Calendar token is valid") and reproduced all four 500s from localhost. The frontend then renders the swallowed `/events` failure as a false "No events" (PHASE-02 owns that half).

```bash
sed -n '97,146p' bmo/pi/services/calendar_service.py   # _service cached, never rebuilt on failure
sed -n '30,66p' bmo/pi/routes/calendar_api.py          # /events RuntimeError-only; /today,/next,/create no guard
sed -n '316,333p' bmo/pi/routes/calendar_api.py        # auth/status nulls _service then calls — proves staleness
```

### F4 — System Status card: `health_checker` is `None`, card can't tell "failed" from "off"

**Status: confirmed (root cause: HealthChecker startup failed; reporting is ambiguous).** `api_status_summary` reads `_app().health_checker` and, when it is falsy, returns `{"summary": "I can't check my status right now — monitoring isn't running."}` with HTTP **200** (`bmo/pi/routes/system_api.py:500-505`) — exactly the card text QA saw. The `health_checker` global is declared at `app.py:420` and assigned at `app.py:862-868` inside a `try/except` that logs `[bmo] Health checker: SKIPPED` on failure:

```python
try:
    from services.monitoring import HealthChecker
    health_checker = HealthChecker(socketio=socketio, check_interval=60)
    health_checker.start()
    log.info("[bmo]   Health checker: OK (60s interval)")
except Exception:
    log.exception("[bmo]   Health checker: SKIPPED")
```

So `health_checker is None` ⟹ the `HealthChecker` constructor or `.start()` raised at boot (the real exception is in the Pi log under `[bmo] Health checker: SKIPPED`). Two problems: **(a)** monitoring startup is fragile (one exception silently disables the whole health surface, and Refresh can never recover it without a restart), and **(b)** the route and card cannot distinguish *"monitoring crashed at startup"* from *"monitoring is intentionally off"* — both read as the same vague error. The fix is to make startup record its failure reason and surface it, not to guess the live exception (which this planning-only phase cannot see).

```bash
sed -n '500,506p' bmo/pi/routes/system_api.py    # "monitoring isn't running" when health_checker falsy
sed -n '861,868p' bmo/pi/app.py                   # HealthChecker init try/except → None on failure
grep -n "health_checker" bmo/pi/app.py            # 420 (decl), 862, 864-865 (assign + start)
```

### F5 — Seeded "Hello from BMO!" test data leaked into the live chat-history store

**Status: confirmed.** The live chat history holds ~200 assistant turns whose text is the literal `"Hello from BMO!"`. That string exists **only** in test fixtures — `bmo/pi/tests/test_app_endpoints.py:84,131` and `bmo/pi/tests/agents/test_base_agent.py:69,249` — so a test run (or a seed) persisted against the **real** history store instead of an isolated temp path. The store is `RECENT_CHAT_FILE = ~/home-lab/bmo/pi/data/recent_chat.json` with a rolling cap `MAX_RECENT = 200` (`bmo/pi/services/chat_history.py:61-62`); the 200 identical entries fill the entire buffer and bury any real conversation, making the assistant look broken. The test-isolation gap: `tests/conftest.py` has a `mock_filesystem(tmp_path)` fixture (`conftest.py:102-106`) but it is **not autouse** and `chat_history.RECENT_CHAT_FILE` is a module-level constant resolved at import, so a test that calls `save_chat_message` without monkeypatching that constant writes the developer's/Pi's real file.

```bash
grep -rn "Hello from BMO" bmo/pi --include=*.py        # only tests/ — 4 hits
grep -n "RECENT_CHAT_FILE\|MAX_RECENT" bmo/pi/services/chat_history.py   # 61, 62
grep -n "mock_filesystem\|autouse\|RECENT_CHAT" bmo/pi/tests/conftest.py # 102 (not autouse, no chat patch)
```

## Sub-phases

> All paths are relative to the repo root; run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file (`python -m pytest tests/test_<x>.py -q`) + `ruff check` on touched files. Do NOT add bare `print()` (the `bmo-no-new-prints.yml` guard fails on new ones — use `log`/the module logger). The full suite is `bmo-pi-pytest.yml`'s job at push.

### 01A — List service: look items up by id (with a text fallback for voice)

**Objective:** checking off and deleting a list item from the dashboard returns 200 and mutates the right item; voice flows that pass free text still work.

**Files:** `bmo/pi/services/list_service.py`, `bmo/pi/tests/test_list_service.py` (new).

**Steps:**

1. Add a private resolver to `ListService` that prefers an exact **id** match, then falls back to the existing text matching (so the voice agent, which passes spoken text, keeps working):

   ```python
   def _find_item(self, lst: dict, key: str):
       """Resolve a list item by id first (dashboard addresses items by id),
       then by exact text, then by substring (voice passes spoken text)."""
       items = lst["items"]
       for item in items:
           if item.get("id") == key:
               return item
       k = (key or "").lower().strip()
       for item in items:
           if item["text"].lower().strip() == k:
               return item
       for item in items:
           if k and k in item["text"].lower():
               return item
       return None
   ```

2. Rewrite `check_item` (`list_service.py:99-111`) to use it — keep the same signature (`list_name, text, done=True`) so callers are unchanged; the `text` param is now "id-or-text":

   ```python
   def check_item(self, list_name: str, text: str, done: bool = True) -> bool:
       lst = self._data["lists"].get(_slug(list_name))
       if not lst:
           return False
       item = self._find_item(lst, text)
       if item is None:
           return False
       item["done"] = done
       self._save()
       return True
   ```

3. Rewrite `remove_item` (`list_service.py:79-97`) the same way (resolve via `_find_item`, then `lst["items"].remove(item)`; return `False` when not found).
4. New `tests/test_list_service.py`: create a list, `add_item` (capture the returned `id`); assert `check_item(list, id)` flips `done` to `True` and returns `True`; `remove_item(list, id)` removes it and returns `True`; assert the text fallback still works (`check_item(list, "<exact text>")` and a substring); assert a non-existent id/text returns `False`. Point `LISTS_FILE` at a tmp path via `monkeypatch.setattr(list_service, "LISTS_FILE", str(tmp_path/"lists.json"))` and `DATA_DIR` likewise so the test never touches real data.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_list_service.py -q && ruff check services/list_service.py`.

**Acceptance:** check + delete by id both return `True`/200 and mutate the addressed item; voice text matching is preserved; the new test file is green.

### 01B — Music routes: guard the `None` service (503, not 500) + diagnose the init failure

**Objective:** when the music service failed to initialize, `/api/music/*` returns a clean `503 {"error": "music unavailable"}` instead of a Flask 500 HTML page; the underlying init failure is logged with its real cause so the owner can fix it.

**Files:** `bmo/pi/routes/music_api.py`, `bmo/pi/app.py`, `bmo/pi/tests/test_music_api.py`.

**Steps:**

1. In `music_api.py`, replace the bare `_music()` accessor with a guard helper and a small decorator (or an explicit early-return in each route). Minimal, low-churn approach — add:

   ```python
   from functools import wraps
   from flask import jsonify

   def _music_or_503():
       import app
       return app.music  # may be None

   def _requires_music(fn):
       @wraps(fn)
       def wrapper(*args, **kwargs):
           if _music_or_503() is None:
               return jsonify({"error": "music unavailable",
                               "detail": "music service failed to initialize — check startup logs"}), 503
           return fn(*args, **kwargs)
       return wrapper
   ```

   Apply `@_requires_music` to every `/api/music/*` route below its `@music_bp.route(...)` decorator. Inside each handler, keep using `_music()` (now guaranteed non-`None`). This preserves all existing behaviour and only converts the `None` → 500 case into a 503. (The routes that already wrap their own `try/except` returning 500 — `album`/`playlist` — keep those; the decorator only handles the `None` case.)
2. Harden the startup diagnosis in `app.py` (the `Music: SKIPPED` branch, `app.py:668-670`): the `except Exception:` already calls `log.exception(...)`, which is correct — **confirm it records the traceback** (it does via `log.exception`). Add a one-line breadcrumb the status surface can read: set a module global `music_init_error` (declare `music_init_error = None` next to `music = None` at `app.py:414`, add it to the `global` list at `app.py:475`) and in the except do `music_init_error = repr(...)` capturing the exception, so a future diagnostics route/log can name the cause without re-reading the boot log. Do **not** attempt to "fix" the underlying ytmusicapi/VLC failure here — its true cause is environment/credentials on the Pi (rule 6: no live-Pi mutation); this phase makes the failure *legible and non-fatal to the route layer*.
3. Extend `tests/test_music_api.py`: with `app.music = None` (monkeypatch), assert `GET /api/music/state` and `GET /api/music/search?q=x` both return **503** with the `error` key (not 500); with a stub music object, assert the normal 200 path still works (regression pin).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_music_api.py -q && ruff check routes/music_api.py`.

**Acceptance:** every `/api/music/*` route returns 503 (JSON) when the service is `None`; the happy path is unchanged; `music_init_error` captures the startup exception repr.

### 01C — Calendar: rebuild the stale `_service` on failure + structured route guards

**Objective:** `/events`, `/today`, `/next`, `/create` recover from a stale Google client (one transparent rebuild + retry) and, on a genuine failure, return a structured offline/error payload instead of a 500.

**Files:** `bmo/pi/services/calendar_service.py`, `bmo/pi/routes/calendar_api.py`, `bmo/pi/tests/test_calendar_service.py`.

**Steps:**

1. In `calendar_service.py`, add a private retry wrapper that rebuilds the cached client once when an API call throws something other than the auth `RuntimeError` (mirrors what `auth/status` does by hand):

   ```python
   def _with_service_retry(self, call):
       """Run `call(service)`; on a transport/API error, drop the cached
       client, rebuild once, and retry. RuntimeError (missing/invalid creds)
       propagates unchanged so the route can map it to an offline payload."""
       try:
           return call(self._get_service())
       except RuntimeError:
           raise
       except Exception:
           self._service = None
           return call(self._get_service())
   ```

   Route the four read/write methods through it: `get_upcoming_events` wraps its `service.events().list(...).execute()` body; `create_event`, `update_event`, `delete_event` likewise. (Keep `_get_service`'s own credential-refresh logic; this wrapper only handles the *cached-client-went-stale* case.)
2. In `calendar_api.py`, broaden the route guards so a real failure is a structured payload, never a 500:
   - `/events` (30-38): keep the `RuntimeError → offline` branch; add a second `except Exception:` that `log.exception(...)`s and returns `jsonify({"offline": True, "events": [], "error": "calendar unavailable"})`.
   - `/today` (41-43), `/next` (46-49): wrap in `try/except Exception` returning `jsonify({"offline": True, ...})` (empty list / `{}` respectively) on failure.
   - `/create` (52-66): wrap the body in `try/except`; on `RuntimeError` return `503 {"error": "calendar not authorized"}`, on other exceptions `log.exception` + `500 {"error": "could not create event"}` via the existing `fail(log, e, ...)` helper (already imported) so the UI gets JSON, not an HTML 500.
3. Extend `tests/test_calendar_service.py`: stub a `CalendarService` whose first `_get_service()` returns a fake client that raises a non-`RuntimeError` on `.execute()` and whose second returns a working one; assert `get_upcoming_events()` retries and succeeds and that `_service` was nulled between attempts. Add a route test (in `test_calendar_service.py` or a small route test) asserting `/today` and `/next` return a JSON offline payload (not 500) when the service raises.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_calendar_service.py -q && ruff check routes/calendar_api.py services/calendar_service.py`.

**Acceptance:** a stale-client error triggers exactly one rebuild+retry; `/events`/`/today`/`/next`/`/create` never return a bare 500 — always a structured JSON payload the frontend can branch on.

### 01D — Monitoring: make startup failure legible and the status surface honest

**Objective:** the System Status card distinguishes "monitoring failed to start (here's why)" from "monitoring is off", and a transient HealthChecker startup error no longer silently disables the whole health surface with no diagnosis.

**Files:** `bmo/pi/app.py`, `bmo/pi/routes/system_api.py`, `bmo/pi/tests/test_system_api.py`.

**Steps:**

1. Capture the startup failure reason. Next to `health_checker = None` (`app.py:420`) add `health_checker_error = None`; add it to the `global` declaration (`app.py:475`). In the `Health checker: SKIPPED` except (`app.py:866-868`), set `health_checker_error = repr(...)` for the caught exception (keep the `log.exception`). This is the legibility half — the real underlying exception (psutil/file-permission/socket) is environmental and surfaces in the boot log + this breadcrumb; do not guess-fix it (rule 6).
2. Make `api_status_summary` honest (`system_api.py:500-505`): when `health_checker` is falsy, branch on the breadcrumb —

   ```python
   if not health_checker:
       err = getattr(_app(), "health_checker_error", None)
       if err:
           return jsonify({"summary": "Monitoring failed to start — check the service logs.",
                           "monitoring": "error", "detail": err})
       return jsonify({"summary": "Monitoring is not enabled.",
                       "monitoring": "off"})
   ```

   (Keep the existing healthy/critical/warning branches unchanged for the `health_checker` present case; add `"monitoring": "ok"` to that payload so the card can style the dot deterministically.)
3. Extend `tests/test_system_api.py`: with `app.health_checker = None` and `app.health_checker_error = "RuntimeError(...)"`, assert `/api/status/summary` returns `monitoring == "error"` and includes the detail; with both `None`, assert `monitoring == "off"`; with a stub health_checker returning a healthy status, assert `monitoring == "ok"`.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_system_api.py -q && ruff check routes/system_api.py`.

**Acceptance:** the status summary reports `error` (with a reason) vs `off` vs `ok` distinctly; the card has a deterministic field to render; monitoring startup records why it failed.

### 01E — Chat-history test isolation (stop fixtures writing the live store)

**Objective:** no test can ever write the real `recent_chat.json`; the "Hello from BMO!" leak cannot recur. (The one-time cleanup of the *existing* polluted file is an owner action — documented, not executed.)

**Files:** `bmo/pi/tests/conftest.py`, `bmo/pi/tests/test_chat_history.py`, `bmo/pi/services/chat_history.py` (guard only).

**Steps:**

1. Add an **autouse** fixture to `tests/conftest.py` that redirects the chat-history paths to `tmp_path` for every test:

   ```python
   @pytest.fixture(autouse=True)
   def _isolate_chat_history(tmp_path, monkeypatch):
       from services import chat_history
       monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE",
                           str(tmp_path / "recent_chat.json"), raising=False)
       monkeypatch.setattr(chat_history, "DND_LOG_DIR",
                           str(tmp_path / "dnd_logs"), raising=False)
       yield
   ```

   (Autouse so even tests that don't request it are covered — the leak came from exactly such a test.)
2. Defense in depth in `chat_history.py`: in `save_chat_message`, refuse to write when running under pytest unless the path was redirected — e.g. at the top of the function, `if os.environ.get("PYTEST_CURRENT_TEST") and RECENT_CHAT_FILE.endswith("/home-lab/bmo/pi/data/recent_chat.json"): return`. This is a belt-and-braces guard; the autouse fixture is the primary fix. Keep it tiny and logged at debug only (no new `print`).
3. Add a `tests/test_chat_history.py` assertion: after the autouse fixture, `save_chat_message({...})` writes to the tmp path and `load_recent_chat()` reads it back; assert the real `~/home-lab/.../recent_chat.json` is untouched (compare mtime or assert the constant was patched).
4. **Document the one-time cleanup** (owner action, not run here) at the top of the phase's `## Completed` note and in `bmo/docs/DESIGN-CONSTRAINTS.md`: the live `recent_chat.json` on the Pi still holds the 200 seeded rows; the owner clears it once with the dashboard "clear history" control (`POST /api/chat/clear`, `chat_api.py:735-736`) or by removing the file — a live-Pi data mutation outside executer scope (rule 6).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_chat_history.py -q && ruff check services/chat_history.py tests/conftest.py`.

**Acceptance:** tests cannot write the live store (autouse redirect + guard); a regression test pins it; the existing-data cleanup is documented as an owner action.

## Research notes

- **Late-resolved service globals + `None` guards (01B/01C/01D):** bmo resolves services lazily via `_app()` / `app.<service>` because the route blueprints import before `init_services()` runs (documented in `realtime_ws.py:11-13` and the `music_api.py` header). The cost of that pattern is that a service that failed to init is `None` at call time, and an unguarded dereference is a Flask 500. The fix pattern is uniform: a small `None`-guard (503) at the route boundary plus a captured `*_init_error` breadcrumb so the failure is diagnosable without re-reading the boot log. This matches the "auto-diagnose, don't just report symptoms" rule (INSTRUCTIONS.md rule 28) applied to service health.
- **Stale cached API clients (01C):** Google's `googleapiclient` service object embeds an auth transport; once built, a network blip / token-state change can leave it raising on `.execute()` while a freshly-built one succeeds — exactly what `auth/status` exploits by nulling `_service`. The standard remedy is a rebuild-once-on-failure wrapper (drop the cache, rebuild, retry a single time), distinguishing the missing-credentials case (`RuntimeError`, propagate → offline UI) from a transport/API error (retry). One retry avoids masking a hard outage in a loop.
- **Text-vs-id lookup contracts (01A):** the bug is a contract mismatch — the HTTP layer addresses items by the stable `uuid4()[:8]` id (correct, matches `add_item`), but the service was written for the voice path (spoken free text). Resolving id-first with a text fallback satisfies both callers without changing either signature; the notes service (already id-based) is the in-repo precedent the QA report itself cites.
- **Test persistence isolation (01E):** module-level path constants resolved at import (`RECENT_CHAT_FILE`) are the classic way test writes escape to real data — a fixture must monkeypatch the *constant on the module*, not just set an env var, and making it autouse closes the "a test forgot to request the fixture" hole that caused this leak. The `PYTEST_CURRENT_TEST` env guard is a documented belt-and-braces pattern for refusing real-path writes under the test runner.

## Test plan

- **01A:** new `tests/test_list_service.py` — id check/delete, text fallback, not-found, tmp-path isolation.
- **01B:** `tests/test_music_api.py` — `None`-service → 503 on `state`/`search`; stub-service 200 regression.
- **01C:** `tests/test_calendar_service.py` — stale-client rebuild+retry; `/today`/`/next` offline payload (not 500).
- **01D:** `tests/test_system_api.py` — summary `error`/`off`/`ok` branches.
- **01E:** `tests/test_chat_history.py` — autouse redirect writes tmp not live; guard refuses real-path write under pytest.
- **End of phase (INSTRUCTIONS.md rule 5):** push and let `bmo-pi-pytest.yml` run the full suite + the `no-new-prints` / docker / codeql guards; cheap local checks only per sub-phase. No live-Pi deploy (rule 6).

## Acceptance criteria

- [ ] List check + delete by id return 200 and mutate the addressed item; voice text matching preserved; `test_list_service.py` green.
- [ ] Every `/api/music/*` route returns `503` JSON (not a 500 HTML page) when `app.music is None`; happy path unchanged; `music_init_error` captures the startup repr.
- [ ] Calendar `/events`/`/today`/`/next`/`/create` recover from a stale `_service` (one rebuild+retry) and never return a bare 500 — always a structured JSON payload.
- [ ] System Status summary distinguishes `error` (with reason) / `off` / `ok`; `health_checker_error` records the startup failure cause.
- [ ] Tests cannot write the live `recent_chat.json` (autouse redirect + pytest guard); the existing-data cleanup is documented as an owner action.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Frontend swallowing of the Music 500 / Calendar 500** (`searchMusic()` parsing 500 HTML as JSON; the false "No events" render) — PHASE-02.
- **Cross-cutting poll backoff** so `/api/music/state` stops hot-polling a down service — PHASE-03.
- **Chat-history retention / display dedup** on the frontend — PHASE-03.
- **Fixing the underlying music/health-checker init failures on the Pi** (ytmusicapi/VLC creds, psutil/permissions) — environmental, owner action after the boot-log cause is read (rule 6); this phase only makes those failures legible + non-fatal to the route layer.
- **The live `recent_chat.json` cleanup** — owner action (live-Pi data mutation, rule 6).

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one entry per sub-phase as it lands. The bmo-phase-executer also records here the owner-action note for 01E: the live `recent_chat.json` on the Pi still holds the seeded rows and must be cleared once by the owner — outside executer scope per rule 6.)*

### Execution log (2026-06-24)

- **01A** — `services/list_service.py`: added `_find_item()` (id → exact text → substring) and rewrote `check_item`/`remove_item` to resolve through it; signatures unchanged so the voice path is preserved. New `tests/test_list_service.py` (4 tests: id check/delete, text fallback, not-found, id-priority).
- **01B** — Drift: the music routes already carry a `@music_bp.before_request` guard (`routes/music_api.py:38`) returning a clean `503 {"available": false, "error": ...}` when `_music()` is None, so the F2 "unguarded 500" pre-state was already fixed; **did not** add the redundant per-route decorator (reasonable-reading per INSTRUCTIONS rule 9). Implemented the breadcrumb half: `music_init_error` global (`app.py:415`, added to the `global` list and set to `repr(e)` in the `Music: SKIPPED` except). `tests/test_music_api.py`: None-service → 503 on `/state` and `/search`; stub-service 200 regression.
- **01C** — `services/calendar_service.py`: added `_with_service_retry()` (drop cached client, rebuild once, retry; `RuntimeError` propagates) and routed `get_upcoming_events`/`create_event`/`update_event`/`delete_event` through it. `routes/calendar_api.py`: `/events` gains a catch-all → offline payload; `/today`+`/next` wrapped (offline JSON, never 500); `/create` → `503` on `RuntimeError`, `fail(log, e, 500, ...)` otherwise. `tests/test_calendar_service.py`: rebuild-once+retry, RuntimeError-no-retry, `/today`+`/next` offline-not-500; updated the two existing api-error-propagates tests to the new rebuild-once contract.
- **01D** — `app.py`: `health_checker_error` global (`:421`, in the `global` list, set to `repr(e)` in the `Health checker: SKIPPED` except). `routes/system_api.py` `api_status_summary`: falsy-checker now branches `monitoring: "error"` (+detail) vs `"off"`; healthy payload gains `monitoring: "ok"`. `tests/test_system_api.py`: error/off/ok branches.
- **01E** — `tests/conftest.py`: autouse `_isolate_chat_history` redirects `RECENT_CHAT_FILE`/`DND_LOG_DIR` to `tmp_path` for every test. `services/chat_history.py` `save_recent_message`: defense-in-depth guard refusing a real-path write under `PYTEST_CURRENT_TEST`. `tests/test_chat_history.py`: redirect-active, tmp-write, guard-refuses-real-path.
- **Checks:** targeted pytest across all touched files + chat/app/monitoring regression = **179 passed**; no new ruff errors (baseline E402/F841 only, line-shifted); no new `print()`.
- **OWNER ACTION (rule 6, not executed here):** the live `recent_chat.json` on the Pi still holds the ~200 seeded "Hello from BMO!" rows — clear it once via the dashboard "clear history" control (`POST /api/chat/clear`) or by removing the file; a live-Pi data mutation outside executer scope. Likewise the underlying Music/HealthChecker init failures are environmental (ytmusicapi/VLC creds, psutil/permissions) and surface in the boot log + the new `*_init_error` breadcrumbs for the owner to fix.
