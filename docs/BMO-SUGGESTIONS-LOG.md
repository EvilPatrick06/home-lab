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

### [2026-04-25] Continue `app.py` Flask-blueprint refactor — extract remaining 6 routes (calendar, music, tv, chat, system, realtime)

- **Category:** future-idea, debt
- **Severity:** medium
- **Domain:** bmo
- **Effort estimate:** 30-60 min per blueprint × 6 ≈ 1 long session
- **Status:** **Partial — `routes/ide.py` extracted** (see `BMO-RESOLVED-ISSUES.md` "first split" entry). Pattern is established; remaining splits follow the same shape.

**What's left:**

| Blueprint file | Routes | Approximate `app.py` line range |
|---|---|---|
| `routes/calendar.py` | `/api/calendar/*`, `_calendar_*` helpers | 1487-1900 |
| `routes/music.py` | `/api/music/*` | scattered |
| `routes/tv.py` | `/api/tv/*`, `_tv_*` helpers, `tv_worker` interaction | 3354-3850 |
| `routes/chat.py` | `/api/chat`, `/api/chat/history`, `_chat_lock` | 1093-3130 |
| `routes/system.py` | `/api/service/*`, `/api/init`, `/health` | top of file |
| `routes/realtime.py` | non-IDE SocketIO events (chat_message, scratchpad_*, client_timezone) | scattered |

After all 6 land, `app.py` shrinks to ~300 lines: Flask construction + blueprint registration + lifespan hooks + middleware (auth, security headers, MAX_CONTENT_LENGTH).

**Pattern (proven by `routes/ide.py`):**
- `register_<domain>(flask_app, socketio_obj, agent_obj)` function in each blueprint module — called after `init_services()` so it can resolve a live agent.
- `_resolve_agent()` helper for late-binding `agent.chat(...)` calls — same pattern in `routes/ide.py:_resolve_agent`.
- SocketIO event handlers live INSIDE the `register_*` function so they close over the live socketio.
- Module-level `socketio = None; agent = None` placeholders set by registration.

**Pairs with:** "Consolidate global mutable state behind an `AppState` class" (separate idea below) — pairs cleanly because as each blueprint extracts its globals, they can move to a shared `state.py` instead of being duplicated.

---

### [2026-04-25] Consolidate global mutable state (`_notes_list`, `_ide_jobs`, `_tv_media_cache`, `_chat_lock`, …) behind an `AppState` class with internal locking

- **Category:** future-idea, debt
- **Severity:** medium
- **Domain:** bmo
- **Effort estimate:** 1-2 days

**Description:** `app.py` defines ~15 module-level globals (lists, dicts, counters, locks). Each handler reaches in to read/write. Lock discipline is inconsistent (locks exist for `_ide_jobs` but the IDE-jobs body doesn't always take it; no lock for `_notes_list`).

**Sketch:**

```python
# bmo/pi/state.py
import threading
from dataclasses import dataclass, field

@dataclass
class _State:
    chat_lock: threading.Lock = field(default_factory=threading.Lock)
    notes_lock: threading.Lock = field(default_factory=threading.Lock)
    ide_jobs_lock: threading.Lock = field(default_factory=threading.Lock)
    tv_media_lock: threading.Lock = field(default_factory=threading.Lock)
    notes_list: list = field(default_factory=list)
    ide_jobs: dict = field(default_factory=dict)
    ide_job_counter: int = 0
    tv_media_cache: dict = field(default_factory=lambda: {"title": "", "artist": "", "app": "", "ts": 0})

STATE = _State()  # one canonical instance
```

Then handlers do `with STATE.notes_lock: STATE.notes_list.append(note)`. Lock discipline becomes pattern-matchable; missing locks fail code review more easily.

**Pairs with:** Issue-log entries "Race conditions on `_notes_list`" and "Race conditions on `_ide_jobs`."

---

### [2026-04-25] Migrate to `pip-tools` (`requirements.in` + compiled `requirements.txt`) for deterministic transitive pins

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** bmo
- **Effort estimate:** 1-2 hours

**Description:** Current `requirements.txt` declares ~60 packages but the venv has 166 (transitive deps). When a transitive dep gets a security advisory (e.g., `setuptools` CVE-2024-6345 in the SECURITY-LOG), there's no way to pin it without adding an explicit line — and that line then drifts every time pip resolves.

`pip-tools` (`pip install pip-tools`) has the standard fix: write top-level deps in `requirements.in`, run `pip-compile` to produce a fully-resolved `requirements.txt` with every transitive pinned + hash-locked. Re-run when deps change. CI installs from the locked file → reproducible across machines.

**Migration:**
- [ ] Move `requirements.txt` content → `requirements.in`
- [ ] `pip-compile --generate-hashes -o requirements.txt requirements.in`
- [ ] Update `bmo/setup-bmo.sh` to install from the locked file
- [ ] Add `pip-compile --upgrade` to a monthly maintenance cron / scheduled remote agent
- [ ] Document the workflow in `bmo/docs/SETUP.md`

**Bonus:** `pip-compile` produces a useful comment on every transitive pin showing the path that pulled it in — easier to explain "why is `flatbuffers` here?"

---

### [2026-04-25] Add `flask-limiter` (gevent-compatible) for per-IP rate limits on the LLM-routing endpoints

- **Category:** future-idea, security, performance
- **Severity:** medium
- **Domain:** bmo
- **Effort estimate:** 2 hours

**Description:** Today every BMO endpoint can be hit at line-speed. The cost-sensitive ones (`/api/chat`, `/api/dnd/*`, `/api/ide/jobs`) hit Anthropic / Gemini / Groq — billable. A misbehaving client (or hostile LAN device) can run up the bill.

`flask-limiter` is the standard fix:

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(get_remote_address, app=app, default_limits=["120 per minute"])
# (storage_uri="memory://" by default — works fine on Pi for single-process)

@app.route("/api/chat", methods=["POST"])
@limiter.limit("30 per minute")
def api_chat(): ...

@app.route("/api/ide/jobs", methods=["POST"])
@limiter.limit("10 per minute")
def api_ide_jobs_create(): ...
```

Per-IP limits, returns 429, configurable per-route. Works under gevent (uses `time.time()` + dict, no blocking).

**Pair with the auth medium entry in `SECURITY-LOG.md`** — auth is the front door, rate-limit is the back door for "authenticated user gone wild" cases (e.g., a buggy bot script in a loop).

**Related entries:** `SECURITY-LOG.md` (medium) "BMO HTTP API has no authentication."

---

### [2026-04-25] Replace ad-hoc systemd `Restart=on-failure` + `RestartSec=10` with proper `BurstLimit` + journal-watch alert

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** bmo
- **Effort estimate:** 30 minutes

**Description:** Current bot service config has `Restart=on-failure` + `RestartSec=10`. When a bot fails (as during the recent discord.py-missing crash loop), it restarts every 10 seconds forever — flooding journald, cooking the SD card with writes (~6 lines/restart × 8640 restarts/day), drowning useful logs.

systemd has built-in burst limiting: `StartLimitIntervalSec=300` + `StartLimitBurst=5` ⇒ 5 restarts in 5 minutes max, then service goes "failed" and stops trying. Combine with a journald watcher (`monitoring_agent.py` already does this) that alerts on "service entered failed state for 10+ minutes" — much louder signal than "service is restarting silently."

**Migration:**
- [ ] Add `StartLimitIntervalSec=300` and `StartLimitBurst=5` to `[Unit]` section of all bot services
- [ ] Update `monitoring_agent.py` to specifically watch for `bmo-*-bot` `failed` state and alert via Discord webhook
- [ ] Document in `bmo/docs/SYSTEMD.md`

---

### [2026-04-25] Add `EXPLAIN QUERY PLAN` test for `bmo_social.db` reminder polling — guard against future regressions

- **Category:** future-idea, performance, test
- **Severity:** low
- **Domain:** bmo
- **Effort estimate:** 30 minutes

**Description:** Pairs with the issue-log entry on missing indexes. Once indexes are added, the test ensures they keep being used:

```python
def test_reminder_poll_uses_index(tmp_path):
    db = tmp_path / "social.db"
    conn = sqlite3.connect(db)
    conn.executescript(open("schema.sql").read())  # includes idx_reminders_fire_at
    plan = conn.execute("EXPLAIN QUERY PLAN SELECT * FROM reminders WHERE fire_at <= ?", (time.time(),)).fetchall()
    assert any("USING INDEX idx_reminders_fire_at" in str(r) for r in plan)
```

Cheap test, large value — "schema looked good but a future PR dropped the index" is a real regression class.

---

### [2026-04-25] Wire `radon` (or `xenon`) into the Pi pre-merge gate — fail PRs that drop maintainability index below baseline

- **Category:** future-idea, debt, tooling
- **Severity:** low
- **Domain:** bmo
- **Effort estimate:** 1 hour

**Description:** `radon mi` and `radon cc` already work (the audit that found `app.py` MI=C used them). Wire into a `bmo/pi/scripts/check-complexity.sh` that runs:

```bash
venv/bin/python -m radon cc app.py services/ agents/ --min=D --total-average
venv/bin/python -m radon mi app.py services/ agents/ -s
# Fail if any function above C(15), or if MI of any touched file dropped vs main
```

Add to `.github/workflows/` once a Pi-CI is wired (a separate idea), and to the local `bmo/pi/scripts/health_check.sh` immediately. Keeps the `app.py:init_services` E(38) from getting worse while the multi-PR refactor lands.

---

### [2026-04-25] Test coverage tracker: enable `pytest --cov=bmo/pi --cov-report=term --cov-report=html`

- **Category:** future-idea, test
- **Severity:** low
- **Domain:** bmo
- **Effort estimate:** 30 minutes

**Description:** `requirements-test.txt` likely has `pytest` but not `pytest-cov`. Adding it gives:
- Per-file coverage % in CI
- HTML report (`htmlcov/`) for browsing uncovered branches
- A regression baseline so PRs that drop coverage by >2% on touched files fail review

Especially valuable for `services/voice_pipeline.py` (~1700 lines, MI=C) — coverage data tells us which D/E-complexity functions are exercised at all.

```bash
echo "pytest-cov" >> requirements-test.txt
# add to pytest.ini:
# [coverage:run]
# source = .
# omit = venv/*, tests/*, dev/*
```

---

### [2026-04-25] Add `flask-talisman` (or hand-rolled equivalent) for security headers — pairs with the CSP entry in BMO-ISSUES-LOG

- **Category:** future-idea, security
- **Severity:** low
- **Domain:** bmo
- **Effort estimate:** 1 hour

**Description:** Issue-log entry covers the headers as bug/debt. Suggestion: use `flask-talisman` for the implementation rather than hand-rolling — it covers HSTS, CSP, frame-options, X-Content-Type-Options, Referrer-Policy in one line:

```python
from flask_talisman import Talisman
Talisman(app, content_security_policy={
    "default-src": "'self'",
    "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", "ws:", "wss:"],
})
```

Talisman handles per-route CSP overrides via decorator if the IDE template needs different rules from the kiosk template.

---

# Design gotchas (warnings for future agents)

> **2026-04-25** — Prior entries (task-list discipline, hooks `shell=True`, `os.system` curl + gevent, `bots/` vs `discord/`, `calendar_service` naming, duplicated 5e JSON, HTTP-only data ownership) were folded into canonical docs and inline code comments. See `[bmo/docs/DESIGN-CONSTRAINTS.md](../bmo/docs/DESIGN-CONSTRAINTS.md)`, `[docs/DATA-FLOW.md](./DATA-FLOW.md)` (5e sync table), `[bmo/pi/mcp_servers/README.md](../bmo/pi/mcp_servers/README.md)`, and `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)` → search for **"BMO suggestions log — full sweep"**. Add new items below as they appear.

### [2026-04-25] DO NOT add `concurrent.futures.ThreadPoolExecutor` (or a `ProcessPoolExecutor`) inside `app.py` — gevent does not patch `concurrent.futures`

- **Category:** design-gotcha
- **Severity:** high
- **Domain:** bmo

**Why it's tempting:** `app.py` already uses `threading.Thread(target=..., daemon=True).start()` in ~12 places for "fire and forget" background tasks (TTS speak, camera describe, network scan, IDE jobs). Modernizing to a `ThreadPoolExecutor` looks like an obvious cleanup — pooled, cancellable, result-future-based. Same for `ProcessPoolExecutor` for CPU-heavy work like RAG indexing.

**Why it's wrong:** `gevent.monkey.patch_all()` (called at the top of `app.py` line 12) patches `threading`, `socket`, `subprocess`, `time`, and friends to be cooperative. It does **not** patch `concurrent.futures.ThreadPoolExecutor` — those threads are real OS threads that don't yield to the gevent event loop. A pool worker doing blocking I/O (file read, HTTP request that didn't go through `requests`/`urllib3`'s patched socket) BLOCKS THE WHOLE GEVENT LOOP — every other handler stalls.

The current `threading.Thread(...)` usage actually works because gevent's `monkey.patch_all()` replaces `threading.Thread` with a gevent greenlet under the hood. So existing code is greenlet-style cooperative. Switching to `ThreadPoolExecutor` is a regression to "real threads" and breaks the model.

**What to do instead:**
- For "fire and forget" background work, keep `threading.Thread(target=..., daemon=True).start()` — it's a gevent greenlet under the hood.
- For pooled/cancellable work, use `gevent.pool.Pool(size=N).spawn(fn, ...)` — gevent-native, supports `pool.kill()`, `result.get(timeout=...)`.
- For genuine CPU-bound work that needs another core, spawn a separate process via `subprocess.Popen` (gevent patches it). Don't try to use `multiprocessing` directly inside the gevent process — gevent and multiprocessing's fork model don't mix cleanly.
- Document the chosen pattern in `bmo/docs/DESIGN-CONSTRAINTS.md`.

**Related files:** `bmo/pi/app.py` (line 12 `monkey.patch_all()`), every site using `threading.Thread`

---

### [2026-04-25] DO NOT use `requests.get/post(...)` directly in BMO routes that touch the LLM-streaming path — use `httpx` (already pinned) which gevent-monkey-patch makes cooperative

- **Category:** design-gotcha
- **Severity:** medium
- **Domain:** bmo

**Why it's tempting:** `requests` is the most ergonomic Python HTTP library. Quick `requests.post("https://api.x/...", json={...}, timeout=30)` is one line.

**Why it's wrong:** Under `gevent.monkey.patch_all()`, `requests` IS cooperative (gevent patches the underlying socket layer). BUT: `requests.Session` reuses connections in ways that subtly hold the gevent loop during slow upstream responses. When an LLM stream stalls mid-token, a `requests.Session.post(...)` call holds the worker, and other routes back up. `httpx` (which BMO already depends on for `agents/mcp_client.py`) handles this cleanly via its async/streaming primitives, even when called synchronously — its internal connection pool yields to gevent more aggressively.

The active `services/cloud_providers.py` curl-via-`os.system` workaround exists EXACTLY because of this — see the "DO NOT replace `os.system('curl …')`" gotcha (now folded into `bmo/docs/DESIGN-CONSTRAINTS.md`). For new code, prefer `httpx` over `requests` to avoid needing the curl workaround.

**What to do instead:**
- For new HTTP calls in BMO production code: `import httpx` and use `httpx.Client(timeout=...)`.
- For existing `requests` call sites that aren't in the streaming-LLM path: leave them; migration is opportunistic, not required.
- For LLM streaming specifically: keep the `os.system("curl ...")` pattern in `services/cloud_providers.py` until it's replaced with a tested `httpx.stream` equivalent under load.
- Document the policy in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

### [2026-04-25] BMO venv: 166 installed packages vs ~60 declared in `requirements.txt` — large transitive dependency footprint

- **Category:** info
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** dependency audit

**Description:** `venv/bin/pip list | wc -l` returns 166. `requirements.txt` declares ~60 (after stripping comments). The 100+ delta is transitive — every `pip install foo` brings its own resolved chain.

This isn't a problem per se, but a few observations:
- Transitive packages can have CVEs (`setuptools` was the recent example) — adding them to `requirements.txt` to pin is fragile because the resolver may pick a different parent on next install
- A 166-package surface is hard to sanity-check by reading `requirements.txt`
- Disk: ~2 GB venv (after the CUDA fix from the prior sweep) — not bad, but the transitive set has its own weight

The `pip-tools` migration (separate future-idea) makes this visible + manageable. Until then, this is just a "you have a long tail" observation — doesn't block anything.

---

### [2026-04-25] `app.py` uses `threading.Thread(target=..., daemon=True).start()` 12 times — works under gevent monkey-patching but fragile pattern

- **Category:** info
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** concurrency audit

**Description:** `app.py` spawns daemon threads for fire-and-forget work in 12 places (TTS speak, scan, describe, TV bg reconnect, IDE job runner, code agent task, etc.). Under `gevent.monkey.patch_all()` these are all greenlets — fine. But:

1. Code reads as if it's using real threads. Future contributors will see `threading.Thread` and assume they can `pool.submit()` it (don't — see the design-gotcha entry above).
2. Greenlets are not preemptive. A spawned task that does CPU-only work without any I/O will starve the rest of the event loop. With `cloud_chat()` calls that's a non-issue; with image processing or local-STT, it could matter.
3. `daemon=True` means the greenlets die when the main greenlet exits. If a task is mid-write to disk during BMO restart, the file may be corrupted. Today this is mitigated by `_save_*_jobs` being lock-protected; new background tasks have to remember.

Useful future-tracking observation, not a fix demand. The design-gotcha entry covers what NOT to do; this one is just "if you spawn many of these and notice latency, suspect greenlet starvation."

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.