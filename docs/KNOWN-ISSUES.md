# Known Issues & AI Agent Log

> **PURPOSE:** Living log of known bugs, tech debt, preexisting issues, workarounds, and future-improvement suggestions. Surviving context across agent sessions.
>
> **WHO WRITES HERE:** Humans AND every AI agent (Cursor, Claude Code, Gemini, Copilot, etc.).
>
> **WHEN TO APPEND:** Whenever you discover (a) a bug you can't fix this session, (b) a preexisting defect out of your task's scope, (c) a design pattern worth warning future agents about, (d) a future improvement suggestion.
>
> **NEVER DELETE ENTRIES** without marking them resolved (move to "Resolved" section with fix details).

---

## How to add an entry (template — copy this)

```markdown
### [YYYY-MM-DD] <short title>

- **Category:** bug | debt | config | security | performance | portability | UX | future-idea
- **Severity:** critical | high | medium | low | info
- **Domain:** dnd-app | bmo | both | tooling | docs
- **Discovered by:** <human name / "Claude Code" / "Cursor" / "Gemini" / "Copilot">
- **During:** <what task/session was happening>

**Description:** <what's wrong, or what could be better>

**Reproduction (if bug):**
1. Step one
2. Step two
3. Observed behavior

**Expected behavior:** <if bug>

**Hypothesis / root cause:** <your best guess, may be wrong>

**Proposed fix / improvement:**
- [ ] Step 1
- [ ] Step 2

**Blocked by:** <dependency, if any>

**Related files:** `path/to/file.py`, `other/file.ts`
```

---

## AI Instructions (read carefully)

When working in this repo:

1. **BEFORE starting new work:** `grep -i <keyword>` this file. If your task touches something here, read the entry first.
2. **DURING work, if you find a bug OUTSIDE your scope:**
   - Don't fix it silently
   - Append a new entry here using the template
   - Mention it in your PR/commit message but mark as "logged, deferred"
3. **DURING work, if you find a design pattern worth warning others about:**
   - Append an entry in "Design gotchas" category
4. **AFTER fixing a logged issue:**
   - Move the entry to "Resolved" section with commit SHA + fix details
5. **Entry discipline:**
   - Be concrete. "This is slow" ≠ useful; "Load time 3s on /api/characters because X re-reads disk on every call" = useful.
   - Include reproduction steps for bugs
   - Tag severity honestly (not everything is critical)

Do NOT:
- Delete entries (only move to Resolved)
- Fix unrelated entries during your task (scope creep)
- Add entries for things you'll fix this session (just fix them)

---

# Active Issues

## Critical

*(none currently logged)*

## High

### [2026-04-23] Google OAuth tokens expired after secret history purge

- **Category:** config
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** repo reorg + secret purge via git-filter-repo

**Description:** Google OAuth refresh token in `bmo/pi/config/token.json` was exposed in git history before purge. Token revocation by Google is automatic when the secret leaks. BMO calendar now fails with `invalid_grant: Bad Request`.

**Reproduction:** Tail `journalctl -u bmo` — see `[calendar] Cache refresh failed: ('invalid_grant: Bad Request')`.

**Expected behavior:** Calendar events load.

**Hypothesis / root cause:** Google auto-revoked the exposed refresh token.

**Proposed fix:**
- [ ] Run Google OAuth authorization flow again: `cd bmo/pi && ./venv/bin/python services/authorize_calendar.py`
- [ ] Follow URL, grant permissions, token.json rewritten
- [ ] Restart bmo service: `sudo systemctl restart bmo`

**Related files:** `bmo/pi/services/calendar_service.py`, `bmo/pi/services/authorize_calendar.py`, `bmo/pi/config/token.json`, `docs/SECRETS-ROTATION.md`

---

## Medium

### [2026-04-23] openwakeword model missing — falls back to energy+STT detection

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO service restart after reorg

**Description:** `openwakeword` library installed but default `hey_jarvis_v0.1.onnx` model file missing at expected path. BMO falls back to energy-based + STT wake-word detection (less accurate, slightly slower).

**Reproduction:** `journalctl -u bmo | grep "openwakeword not available"` → `Load model from /home/patrick/DnD/bmo/pi/venv/lib/python3.11/site-packages/openwakeword/resources/models/hey_jarvis_v0.1.onnx failed`

**Expected behavior:** openwakeword ONNX inference used (faster + more accurate than fallback).

**Hypothesis / root cause:** pip install didn't download model files (they're big, shipped separately). Or BMO uses custom `hey_bmo.onnx` + openwakeword was never intended to be primary.

**Proposed fix:**
- [ ] Check if BMO actually wants openwakeword OR just `hey_bmo.onnx` — investigate `services/voice_pipeline.py`
- [ ] If former: `pip install openwakeword[models]` to pull model files
- [ ] If latter: silence the error by catching the ImportError cleanly

**Related files:** `bmo/pi/services/voice_pipeline.py`, `bmo/pi/wake/hey_bmo.onnx`

---

### [2026-04-23] MCP servers fail to initialize (0/3 connect)

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO startup after reorg

**Description:** `journalctl -u bmo` shows `[mcp] Initialized: 0/3 servers, 0 tools`. MCP (Model Context Protocol) integration not functional — agents can't use MCP tools for D&D data queries.

**Reproduction:** Start bmo service → check logs → see `[mcp:dnd_data] Initialize failed: EOF reading from MCP server`

**Expected behavior:** 3 MCP servers initialize, ≥1 tool available per server.

**Hypothesis / root cause:** Likely path issue in `mcp_servers/mcp_settings.json` OR the MCP server process crashing immediately. Worth checking if it uses an old `~/bmo/mcp_servers/...` path.

**Proposed fix:**
- [ ] Verify `bmo/pi/mcp_servers/mcp_settings.json` paths
- [ ] Try running `./venv/bin/python mcp_servers/dnd_data_server.py` manually to see stdout/stderr
- [ ] Check for missing Python deps

**Related files:** `bmo/pi/mcp_servers/dnd_data_server.py`, `bmo/pi/mcp_servers/mcp_settings.json`, `bmo/pi/agents/mcp_manager.py`, `bmo/pi/agents/mcp_client.py`

---

### [2026-04-23] Streaming chat falls back to sync due to undefined variable

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO live usage after restart

**Description:** `[stream] Streaming failed (name 'text' is not defined), falling back to sync` — some code path has an unbound `text` reference. Fallback works so users don't notice, but streaming UX lost.

**Reproduction:** Send a chat message to BMO → check logs.

**Expected behavior:** Response streams live to caller.

**Hypothesis / root cause:** Likely in `app.py:_chat_stream_callback` or a wrapper. Variable shadowing or scope issue.

**Proposed fix:**
- [ ] grep `'text'` usages near streaming callback
- [ ] Add test case that exercises streaming path
- [ ] Fix NameError

**Related files:** `bmo/pi/app.py` (around line 3100+?), possibly `bmo/pi/services/voice_pipeline.py`

---

### [2026-04-23] pytest test isolation: `agents is not a package` collection error

- **Category:** debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** pytest run after reorg

**Description:** `pytest tests/` fails to collect `tests/agents/test_routing_accuracy.py` with `ModuleNotFoundError: No module named 'agents.router'; 'agents' is not a package`. But running that file alone (`pytest tests/agents/test_routing_accuracy.py`) passes 77 tests.

Root cause: `tests/conftest.py` mocks 3rd-party modules (`openwakeword`, `gevent`, `requests`) in `sys.modules`, and one of them pollutes `sys.modules['agents']` when other test modules are collected first.

**Reproduction:**
1. `cd bmo/pi && ./venv/bin/python -m pytest tests/` → errors
2. `./venv/bin/python -m pytest tests/agents/test_routing_accuracy.py` → passes

**Expected behavior:** Full suite runs cleanly.

**Proposed fix:**
- [ ] Refactor `tests/conftest.py` to use `pytest_configure` + `patch.dict(sys.modules)` in fixture scope (not module-level sys.modules pollution)
- [ ] OR split conftest into subset per test directory
- [ ] Related: a few other tests fail collection due to same kind of mocking (`test_wake_*`, `test_calendar_auth_paths`, `test_music_restore`, `test_server`)

**Related files:** `bmo/pi/tests/conftest.py`

---

### [2026-04-23] 5 imports reference `~/DnD/bmo/pi/models/` which doesn't exist

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** path canonicalization

**Description:** Voice pipeline + wake tests reference `os.path.expanduser("~/DnD/bmo/pi/models/piper/en_US-hfc_female-medium.onnx")`. The `models/` directory doesn't exist anywhere. Piper TTS would fail if invoked. Preexisting.

**Reproduction:** grep for `models/piper` in bmo/pi/ → see multiple refs, directory missing.

**Expected behavior:** Either piper model files exist at that path OR code has a graceful fallback.

**Proposed fix:**
- [ ] Either: download piper models (`piper-download-voices`) to `bmo/pi/models/piper/`
- [ ] Or: remove piper-dependent code if user never uses it
- [ ] Or: move piper model download into `setup-bmo.sh`

**Related files:** `bmo/pi/services/voice_pipeline.py`, `bmo/pi/tests/test_wake_auto.py`, `bmo/pi/tests/test_wake_debug.py`, `bmo/pi/tests/test_wake_timed.py`

---

## Low

### [2026-04-23] BMO `/health` endpoint can hang if gevent workers are busy

- **Category:** performance
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** service restart validation

**Description:** After long-running TTS/STT operations, `/health` requests can queue behind active work and eventually exhaust gevent workers. Observed as CLOSE-WAIT socket pileup on port 5000.

**Reproduction:** Let BMO run for ~10 min of heavy use → `curl /health` hangs → `ss -tnp | grep 5000` shows many CLOSE-WAIT.

**Expected behavior:** `/health` returns instantly.

**Hypothesis / root cause:** Blocking operations in some service aren't yielding to gevent. Also `bmo-kiosk`'s ExecStartPre hammers /health 30x/sec during startup — if /health is slow, makes it worse.

**Proposed fix:**
- [ ] Audit services for blocking I/O without gevent yield
- [ ] Consider moving /health to a separate lightweight HTTP server on a different port
- [ ] Reduce bmo-kiosk poll rate (every 2s instead of every 1s)

**Related files:** `bmo/pi/app.py` (/health route + gevent monkey.patch_all), `bmo/pi/kiosk/bmo-kiosk.service`

---

### [2026-04-23] Pre-push hook to block secret commits

- **Category:** future-idea
- **Severity:** low
- **Domain:** tooling
- **Discovered by:** Claude Opus
- **During:** post-purge hardening

**Description:** Despite `.gitignore` hardening, a developer could accidentally commit a `.env` from a typo or via `git add -f`. A pre-commit / pre-push hook running `gitleaks` or `git-secrets` would catch this.

**Proposed fix:**
- [ ] Add `.githooks/pre-commit` with gitleaks scan
- [ ] Document in CONTRIBUTING.md
- [ ] Set `git config core.hooksPath .githooks` in bootstrap script

**Related files:** `.gitignore`, `docs/SECRETS-ROTATION.md`, future `.githooks/pre-commit`

---

## Design gotchas (warnings for future agents)

### [2026-04-23] Never rename `bmo/pi/bots/` to `discord/`

**Severity:** critical

`bmo/pi/bots/` is named `bots/` intentionally. If renamed to `discord/`, it shadows the installed `discord.py` library, breaking all Discord bot imports (`import discord`, `from discord.ext import commands`).

If you're tempted to rename for "consistency" — DON'T.

---

### [2026-04-23] Keep `_service` suffix on `calendar_service.py`

**Severity:** high

Python has a stdlib `calendar` module. Naming our BMO module `services/calendar.py` is fine *inside* the subpackage (`from services.calendar import X` is unambiguous), but some code paths do `import calendar` for the stdlib. Keeping the `_service` suffix avoids any ambiguity.

Same concern for `list_service.py` (don't rename to `list.py` — `list` is Python builtin).

---

### [2026-04-23] Electron-vite enforces `src/{main,preload,renderer,shared}/`

**Severity:** high

Don't restructure the `dnd-app/src/` layout. electron-vite expects exactly these subdirs. Changing names breaks the build.

---

# Resolved Issues

## [2026-04-23] LEAKED SECRETS purged from git history

- **Original severity:** critical
- **Resolved by:** Claude Opus via `git filter-repo`
- **Commit:** `f5d49cd` + history rewrite
- **Notes:** User still needs to rotate the exposed secrets externally. See `docs/SECRETS-ROTATION.md`.

---

## [2026-04-23] Dual BMO directories (`/home/patrick/bmo/` vs `/home/patrick/DnD/bmo/pi/`)

- **Original severity:** high
- **Resolved by:** Claude Opus during reorg
- **Commit:** `2c52d5a`
- **Notes:** Merged runtime state from standalone into canonical via rsync (newer wins). Rewrote 50+ `~/bmo/` refs to `~/DnD/bmo/pi/`. Standalone dir archived then deleted.

---
