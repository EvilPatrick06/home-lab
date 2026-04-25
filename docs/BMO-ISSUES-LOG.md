# BMO Issues Log

> **Active BMO bugs / tech debt / broken config / perf — domain-scoped to the Pi voice assistant + DM engine + Discord bots (`bmo/`).** Includes Pi-side infra/tooling that BMO depends on (the venv, pip caches, Pi systemd, etc.) since this is the Pi's primary domain.
>
> Sibling logs:
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved BMO entries → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule (BMO-domain entries):** Bug / debt / config / perf issues whose **Domain: bmo** (or Pi-side infra/tooling) → here. dnd-app entries → `ISSUES-LOG-DNDAPP.md`. `Domain: both` → mirror in both issue logs (small duplication is fine; one fix removes both). Security (any domain) → `SECURITY-LOG.md`. Design-gotcha / future-idea / info → `BMO-SUGGESTIONS-LOG.md`.

New entries go at the TOP of their severity section (newest first within each section).

---

# Active BMO Issues

## Critical

*(none currently logged)*

## High

*(none currently logged)*

## Medium

### [2026-04-24] Six `tests/test_*.py` files are not real test files — break pytest collection

- **Category:** debt, bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** pytest collection audit (deep scan)

**Description:** Six files in `bmo/pi/tests/` named `test_*.py` are **not actually test files** — they have no `def test_*` functions and no `pytest`-style classes. They're standalone scripts that execute side-effecting code at import time:

| File | What it does at import time |
|---|---|
| `tests/test_aec.py` | Records 2s of audio with `sounddevice.rec()`, computes RMS — fails collection because `sd.rec()` returns a zero-size array if no input device |
| `tests/test_thinking_budget.py` | `load_dotenv('/home/patrick/bmo/.env')`, hits Gemini API live |
| `tests/test_wake_auto.py` | Live wake-word recording diagnostic — needs hardware |
| `tests/test_wake_timed.py` | Plays beeps, records audio — needs hardware |
| `tests/test_gemini_stream.py` | Hits Gemini SSE API live |
| `tests/test_server.py` | Spins up an entire Flask test server with port 5000 binding |

When pytest tries to collect them (because of the `test_*.py` glob), import-time side effects either fail outright (audio recording with no input → `ValueError: zero-size array`) or have unwanted effects (binding ports, hitting paid APIs). This is a major contributor to the existing "pytest fails to collect with 'agents' is not a package" entry — even after fixing `conftest.py` mocking, these 6 files still trigger collection failures.

**Reproduction:**
```bash
cd bmo/pi && venv/bin/python -m pytest tests/ --collect-only -q 2>&1 | grep ERROR
# → ERROR tests/test_aec.py - ValueError: zero-size array...
# → ERROR tests/test_wake_auto.py, tests/test_wake_debug.py, tests/test_wake_timed.py
# → ERROR tests/test_server.py, tests/test_calendar_auth_paths.py, tests/test_music_restore.py
# → 660 tests collected, 8 errors
```

**Expected behavior:** Pytest collects cleanly. Hardware-required diagnostics live elsewhere (or are properly fixtured/skipped).

**Hypothesis / root cause:** These 6 files were originally hand-run scripts (`python tests/test_aec.py`) that got the `test_` prefix because they "test" something informally. They predate the actual pytest test suite and were never converted.

**Proposed fix:**
- [ ] Move the 6 files out of `tests/`:
  - `tests/test_aec.py`, `tests/test_wake_auto.py`, `tests/test_wake_timed.py` → `dev/diagnostics/aec.py`, etc. (audio diagnostics — keep them runnable manually)
  - `tests/test_thinking_budget.py`, `tests/test_gemini_stream.py` → `dev/benchmarks/` (live-API benchmarks — already siblings of `dev/benchmark_*.py`)
  - `tests/test_server.py` → either delete (if subsumed by `tests/test_app_endpoints.py`) or move to `dev/`
- [ ] Update any docs that reference `python tests/test_*.py` to use the new path
- [ ] Verify `venv/bin/python -m pytest tests/ --collect-only` → 0 errors
- [ ] Combined with the existing `conftest.py` fix (separate entry), the full suite should run

**Related files:** all 6 files listed above

**Related entries:** `[2026-04-23] pytest suite fails to collect with 'agents' is not a package in full run` (medium) — same root area; this one covers the "fake tests" half of the problem, that one covers the conftest.py-mocking half.

---

### [2026-04-24] Hardcoded LAN IPs in BMO runtime code — `TV_IP` and `VTT_SYNC_URL` default

- **Category:** config, portability, bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** hardcoded-IP grep (deep scan)

**Description:** Two LAN IPs are baked into `bmo/pi/` runtime code:

| File:line | Constant | Value | Used by |
|---|---|---|---|
| `app.py:3274` | `TV_IP = "10.10.20.194"` | hardcoded | `/api/tv/input`, `/api/tv/navigate`, etc. (12+ call sites) |
| `agents/vtt_sync.py:28` | `VTT_SYNC_URL = os.environ.get("VTT_SYNC_URL", "http://10.10.20.100:5001")` | env-overridable, but default is hardcoded | `vtt_sync` agent — pushes events to dnd-app |
| `tests/test_server.py:1592` | `TV_IP = "10.10.20.194"` | duplicate hardcode in test file (also part of "fake test files" issue) |

Same anti-pattern as the dnd-app `10.10.20.242` CSP hardcode (logged in `ISSUES-LOG-DNDAPP.md`). On a network where the TV / VTT host gets a different DHCP lease, these silently break: TV controls return ADB connection errors, VTT push events fail with connection-refused.

`VTT_SYNC_URL` is at least env-overridable. `TV_IP` is not — fix requires editing `app.py` and restarting the service.

**Reproduction:**
```bash
grep -rEn '10\.10\.20\.[0-9]+' bmo/pi/ --include="*.py" --include="*.json" --include="*.service" | grep -v venv | grep -v _archive
```

**Expected behavior:** Both should be env-driven (`BMO_TV_HOST`, `BMO_VTT_HOST` or similar) with mDNS fallback (`tv.local`, `vtt.local`) — same pattern as `BMO_PI_URL` already used by dnd-app.

**Proposed fix:**
- [ ] Add to `.env.template`: `BMO_TV_HOST="10.10.20.194"`, document that mDNS / hostname is preferred
- [ ] Replace `TV_IP = "10.10.20.194"` in `app.py` with `TV_IP = os.environ.get("BMO_TV_HOST", "tv.local")`
- [ ] Document the env vars in `bmo/docs/SERVICES.md`
- [ ] Test: set BMO_TV_HOST to a different value, verify ADB calls use it

**Related files:** `bmo/pi/app.py:3274`, `bmo/pi/agents/vtt_sync.py:28`, `bmo/pi/tests/test_server.py:1592`, `bmo/.env.template`

---

### [2026-04-24] BMO bot logs growing unchecked — `social-bot.log` 4 MB / `dm-bot.log` 2.5 MB in <24h, root-owned, no rotation

- **Category:** debt, performance, config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** filesystem audit (deep scan)

**Description:** `bmo/pi/data/logs/{dm,social}-bot.log` grew quickly when the Discord bots were crash-looping on `ModuleNotFoundError: discord` (resolved 2026-04-24 — see [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) *requirements.txt* entry). The structural issues below still apply. Historical snapshot: `social-bot.log` was ~4 MB within 24 hours of crash-restart-every-10s; `dm-bot.log` ~2.5 MB. Issues:

1. **No log rotation.** No `logrotate` config, no Python `RotatingFileHandler`, systemd `StandardOutput=append:` just keeps appending forever. On a 32 GB SD card a stuck-bot scenario fills the disk in weeks.
2. **Root-owned.** systemd opens the destination file as root (the system manager runs as root) regardless of the unit's `User=patrick`. So `patrick` can read the logs but cannot truncate them — `> /home/patrick/home-lab/bmo/pi/data/logs/social-bot.log` fails with `Permission denied`. Forces `sudo` for routine clearing.
3. **When the bots crash-loop, logs fill with duplicate stack traces** (e.g. the old discord import error, ~6 lines per restart).

This entry is about **unbounded log growth + file ownership**, not a specific app bug.

**Reproduction:**
```bash
ls -la /home/patrick/home-lab/bmo/pi/data/logs/
# → -rw-r--r-- 1 root root 4M social-bot.log
# → -rw-r--r-- 1 root root 2.5M dm-bot.log

du -sh /home/patrick/home-lab/bmo/pi/data/logs/
# → 7.2M (and growing)

echo > /home/patrick/home-lab/bmo/pi/data/logs/social-bot.log
# → permission denied
```

**Expected behavior:** Log files cap at e.g. 10 MB rotation × 5 keep, owned by `patrick`, truncatable without sudo.

**Proposed fix:**
- [ ] Add `bmo/pi/data/logs/*.log` to `/etc/logrotate.d/bmo` (size 10M, rotate 5, compress, copytruncate, missingok, notifempty)
- [ ] OR switch the bot services to `StandardOutput=journal` (lets systemd-journald handle rotation natively; access via `journalctl -u bmo-dm-bot`)
- [ ] If keeping file logging, add `LogsDirectory=bmo` to the unit so systemd creates `/var/log/bmo/` with the right ownership
- [ ] One-time clean: `sudo truncate -s 0 /home/patrick/home-lab/bmo/pi/data/logs/{dm,social}-bot.log`
- [ ] Doc note in `bmo/docs/TROUBLESHOOTING.md`: "Bot logs reachable via `journalctl -u bmo-{dm,social}-bot`"

**Related files:** `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`, `/etc/logrotate.d/bmo` (new file), `bmo/docs/TROUBLESHOOTING.md`

---

### [2026-04-24] Two unbounded HTTP timeouts can hang BMO services — `mcp_client` SSE + `reauth_calendar` token-exchange

- **Category:** bug, performance
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** ruff `--select=S113` (deep scan)

**Description:** ruff S113 ("request without timeout") flags two production-path HTTP calls that block forever if the upstream stalls:

1. **`agents/mcp_client.py:357`** — SSE/streaming MCP transport:
   ```python
   with httpx.stream("GET", url, headers={..., "Accept": "text/event-stream"}, timeout=None) as response:
   ```
   `timeout=None` in httpx means "wait forever for connect AND for each chunk." If the MCP server stops responding mid-stream, the entire BMO request handler holding this connection hangs until the user kills the service. Combines unhealthily with the existing "/health endpoint hangs when gevent workers saturated" entry.

2. **`services/reauth_calendar.py:56`** — Google OAuth token exchange:
   ```python
   token_resp = http_requests.post("https://oauth2.googleapis.com/token", data={...})
   ```
   No `timeout=` → uses `requests`' default (no timeout). If Google's OAuth endpoint stalls during reauth (rare, but happened to me on cellular), the user is stuck staring at a frozen reauth page until they restart BMO.

Both are easy fixes; the first one is more impactful because it's an active production code path.

**Reproduction:**
```bash
cd bmo/pi && venv/bin/ruff check --select=S113 --exclude tests,dev . 
# → 2 errors at the locations above
```

**Expected behavior:** Both have explicit timeouts. SSE stream gets a long-but-finite timeout (e.g., `httpx.Timeout(connect=5, read=30)` with reconnect-on-read-timeout); token exchange gets a short `timeout=10`.

**Proposed fix:**
- [ ] `mcp_client.py:357` — replace `timeout=None` with `httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)`. Wrap the streaming loop with reconnect logic if `httpx.ReadTimeout` is raised.
- [ ] `reauth_calendar.py:56` — add `timeout=10` kwarg
- [ ] Run `ruff check --select=S113 --exclude tests,dev .` after fix → expect 0 errors

**Related files:** `bmo/pi/agents/mcp_client.py:357`, `bmo/pi/services/reauth_calendar.py:56`

**Related entries:** `[2026-04-23] BMO /health endpoint can hang when gevent workers saturated` (low) — these unbounded timeouts contribute to the worker-saturation pattern.

---

### [2026-04-24] `services/voice_pipeline.py:769` shadows stdlib `io` module via inline `import io, wave`

- **Category:** bug, debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** ruff F811 (deep scan)

**Description:** `voice_pipeline.py` already imports `io` at the top of the file (line 9):

```python
import asyncio
import io          # line 9
import difflib
...
```

But inside the method `_pcm_to_wav` (line 767), there's an inline `import io, wave`:

```python
def _pcm_to_wav(self, pcm_bytes: bytes) -> bytes:
    """Convert raw PCM to WAV format for STT."""
    import io, wave           # line 769 — shadows the module-level import
    buf = io.BytesIO()
    ...
```

Functionally this works because both imports resolve to the same module object. But ruff F811 flags the redundancy, and it indicates someone forgot the module-level import existed and added the inline import "to be safe" — exactly the kind of pattern that hides drift.

**Reproduction:**
```bash
cd bmo/pi && venv/bin/ruff check --select=F811 services/voice_pipeline.py
# → F811 Redefinition of unused `io` from line 9
```

**Expected behavior:** Single source of truth for the import.

**Proposed fix:**
- [ ] In `_pcm_to_wav`, change `import io, wave` → `import wave` (drop `io`, it's already in scope)
- [ ] Sweep file for other similar patterns: `grep -n "^\s*import" services/voice_pipeline.py | sort | uniq -c | sort -rn`
- [ ] Run `ruff check --select=F811 services/voice_pipeline.py` → expect 0 errors

**Related files:** `bmo/pi/services/voice_pipeline.py:9, 769`

---

### [2026-04-24] Stale doc references to archived modules in `bmo/pi/README.md`, `bmo/docs/SERVICES.md`, `bmo/docs/ARCHITECTURE.md`

- **Category:** docs, debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** doc-drift audit (deep scan)

**Description:** Three docs still reference Python modules that were archived in commits `780dc9f` + `7e2090c` (per `BMO-RESOLVED-ISSUES.md` entry "[2026-04-23] Three likely-dead Python modules in `bmo/pi/`"):

| Doc | Line | Stale ref |
|---|---|---|
| `bmo/pi/README.md` | 47 | `tv_controller.py, tv_worker.py    Chromecast + TV control` |
| `bmo/pi/README.md` | 48 | `sound_effects.py, dnd_engine.py, campaign_memory.py` |
| `bmo/docs/SERVICES.md` | 15 | `\| sound_effects.py \| Plays sfx from data/sfx/*.mp3 \|` |
| `bmo/docs/SERVICES.md` | 34 | `\| tv_controller.py \| TV control via ADB. Pairs with tv_worker.py subprocess. \|` |
| `bmo/docs/ARCHITECTURE.md` | 85 | `\| TV Controller \| tv_controller.py \| — \| Samsung TV WebSocket remote \|` |

Both `sound_effects.py` and `tv_controller.py` are gone from `bmo/pi/services/`. `tv_worker.py` is still alive (and called from `app.py`). New contributors reading these docs will hunt for `tv_controller.py` and not find it.

**Reproduction:**
```bash
grep -n "tv_controller\|sound_effects" bmo/pi/README.md bmo/docs/SERVICES.md bmo/docs/ARCHITECTURE.md
# → 5 hits in 3 files
```

**Expected behavior:** Docs match the live module list. Either remove the rows or replace them with a "previously archived" note.

**Proposed fix:**
- [ ] In `bmo/pi/README.md`: drop `tv_controller.py` from the structure tree (line 47); drop `sound_effects.py` (line 48). `tv_worker.py` stays.
- [ ] In `bmo/docs/SERVICES.md`: delete the `sound_effects.py` row and the `tv_controller.py` row from the services table.
- [ ] In `bmo/docs/ARCHITECTURE.md`: remove the `tv_controller.py` row from the services table; replace with `tv_worker.py` description if needed.
- [ ] Verify: `grep -rn "sound_effects\|tv_controller" bmo/ --include="*.md"` → 0 hits in active docs (mentions in `BMO-RESOLVED-ISSUES.md` are correct historical context)

**Related files:** `bmo/pi/README.md:47-48`, `bmo/docs/SERVICES.md:15,34`, `bmo/docs/ARCHITECTURE.md:85`

**Related entries:** `BMO-RESOLVED-ISSUES.md` "[2026-04-23] Three likely-dead Python modules in `bmo/pi/`" — that resolution should have included these doc updates but missed them.

---

### [2026-04-24] Pickle deserialization in `camera_service.py` and `voice_pipeline.py` — RCE if cache files tampered

- **Category:** bug, security
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** bandit + ruff S301 (deep scan)

**Description:** Two production paths use `pickle.load()` on local files. Pickle is unsafe — if the file is tampered, deserialization runs arbitrary Python code (CVE-class):

1. `hardware/camera_service.py:219` — `pickle.load(KNOWN_FACES_PATH)` for face-recognition embeddings
2. `services/voice_pipeline.py:268` — `pickle.load(VOICE_PROFILES_PATH)` for speaker-verification profiles

The files are written by BMO itself, locally on the Pi, by `patrick`. So the threat model is:
- Realistic: any other process running as `patrick` can write these files (e.g., a malicious npm postinstall in `dnd-app/` dev work) → RCE in BMO
- Less realistic: an attacker with file-system access at all → already game over

So this is "defense-in-depth" rather than "actively exploitable." Still worth fixing because:
- Replacing pickle with a documented format (JSON for embeddings, since they're just float lists) eliminates a whole class of issue
- Pickle is also brittle: if BMO's Python or library version changes, pickled data may not deserialize at all

**Reproduction:**
```bash
cd bmo/pi && venv/bin/ruff check --select=S301 .
# → 2 errors at hardware/camera_service.py:219, services/voice_pipeline.py:268
```

**Expected behavior:** Use a forward-compatible safe format (JSON for embeddings, npy for raw float arrays).

**Proposed fix:**
- [ ] `camera_service.py`: known-faces dict is `{name: embedding_array}` — write as `np.savez_compressed` (or JSON if dimensions are tiny); update read path to match
- [ ] `voice_pipeline.py`: voice profiles dict similar shape; same fix
- [ ] Migrate existing `.pkl` files: load once via pickle, re-save as the safe format, delete the .pkl
- [ ] Add migration shim that detects pickled-old vs safe-new on read, and rewrites on first read

**Related files:** `bmo/pi/hardware/camera_service.py:219`, `bmo/pi/services/voice_pipeline.py:268`

---

### [2026-04-24] Duplicate config / data tree — `services/{config,data}/` shadows `bmo/pi/{config,data}/`

- **Category:** bug, config, debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** path-canonicalization sanity check during BMO error scan

**Description:** Two parallel state-storage trees exist on disk and both are written by different parts of BMO:

| File | `bmo/pi/...` (top-level) | `bmo/pi/services/...` (sub-tree) | Status |
|---|---|---|---|
| `credentials.json` | `config/` | `services/config/` | identical SHA-256 (currently in sync, but two copies) |
| `token.json` | `config/` | `services/config/` | identical SHA-256 (currently in sync, but two copies) |
| `monitor_state.json` | `data/` | `services/data/` | **different content** — `services/data/` is newer (last write 2026-04-24 18:18) |
| `monitor_alert_state.json` | `data/` | `services/data/` | different content (`services/data/` newer) |
| `location_cache.json` | `data/` | `services/data/` | different content (`services/data/` newer) |

Code that touches each:

- `app.py:_calendar_config_dir()` resolves to `bmo/pi/config/` (read primary; legacy fallback `bmo/pi/../config` = `bmo/config/`)
- `services/calendar_service.py:CONFIG_DIR` resolves to `bmo/pi/services/config/` (read primary; `LEGACY_CONFIG_DIR` = `bmo/pi/config/`)
- `services/monitoring.py` line 296 writes to `services/data/monitor_state.json`
- `services/location_service.py` line 40 writes to `services/data/location_cache.json`
- `services/authorize_calendar.py:CONFIG_DIR` = `services/config/`

**Impact:**
1. Re-auth via `services/authorize_calendar.py` writes new `token.json` to `services/config/token.json`. `app.py`'s calendar code reads from `bmo/pi/config/token.json`. The two will diverge silently — explaining part of why Google Calendar repeatedly hits `invalid_grant: Bad Request` (existing entry).
2. Monitoring + location services write fresh state to `services/data/`, but anyone reading `bmo/pi/data/{monitor_state,location_cache}.json` (e.g., a migration script, a backup tool) gets the stale snapshot from 2026-04-23.
3. Backups + restore become unreliable — which set is canonical?

**Reproduction:**
```bash
sha256sum bmo/pi/config/token.json bmo/pi/services/config/token.json
sha256sum bmo/pi/data/monitor_state.json bmo/pi/services/data/monitor_state.json
# → first pair identical (currently); second pair differs (always)
```

**Expected behavior:** Single source-of-truth. Either:
- One canonical path (probably `bmo/pi/config/` and `bmo/pi/data/` since they're domain-level), all services point there, OR
- All under `services/` (all services own their state), top-level dirs gone.

**Hypothesis / root cause:** Pre-reorg, the `services/` subpackage was the entire pi tree, so `services/config/` and `services/data/` were the only paths. Reorg promoted top-level `config/` + `data/` for app.py, but the services-subpackage path resolution was never updated. Now they're parallel-written.

**Proposed fix:**
- [ ] Decide canonical: `bmo/pi/config/` + `bmo/pi/data/` (recommended — already used by app.py, fewer code changes)
- [ ] In `services/calendar_service.py`, `services/authorize_calendar.py`, `services/monitoring.py`, `services/location_service.py`: change the path resolution to `os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")` (one `dirname` higher)
- [ ] Migrate fresh content: copy `services/{config,data}/*` over the top-level (pick newer mtime)
- [ ] `rm -rf services/config services/data` after migration verified
- [ ] Add a startup assertion in `app.py` that fails loudly if either `services/config/` or `services/data/` reappears
- [ ] Run pytest after — calendar / monitoring / location tests should still pass

**Related files:** `bmo/pi/services/calendar_service.py:10-15`, `bmo/pi/services/authorize_calendar.py:20-22`, `bmo/pi/services/monitoring.py:296,304`, `bmo/pi/services/location_service.py:40`, `bmo/pi/app.py:1485-1530`, `bmo/pi/services/{config,data}/`, `bmo/pi/{config,data}/`

**Related entries:** May explain part of `[2026-04-23] Google Calendar auth fails with invalid_grant: Bad Request` (high) — re-auth could have written to `services/config/token.json` while app.py kept reading the stale one from `config/`.

---

### [2026-04-24] 14+ files in `dev/` and `tests/` reference legacy `/home/patrick/bmo/` paths

- **Category:** bug, config, debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** legacy-path sweep during BMO error scan

**Description:** `grep -rn "/home/patrick/bmo/"` on `bmo/pi/` (excluding venv, __pycache__) finds 14+ files still hardcoded to the pre-reorg path:

| Files | What they do | Impact |
|---|---|---|
| `dev/patch_debug.py`, `dev/patch_keepalive.py`, `dev/patch_retry.py`, `dev/patch_revert.py`, `dev/patch_wol.py`, `dev/revert_power.py` | `with open("/home/patrick/bmo/app.py", ...)` — patch the running `app.py` | All broken: open() fails because path doesn't exist. None of these one-off patch scripts can run. |
| `dev/benchmark_audio.py`, `dev/benchmark_full.py`, `dev/benchmark_llm.py`, `dev/benchmark_personality.py` | `load_dotenv('/home/patrick/bmo/.env')` | Benchmarks won't load env vars → API calls fail with empty keys |
| `tests/test_thinking_budget.py`, `tests/test_gemini_stream.py` | `load_dotenv('/home/patrick/bmo/.env')` | Live-API tests can't authenticate; will silently skip or error in CI |
| `scripts/setup-tailscale.sh`, `scripts/e2e_test.sh` | Comment lines mentioning `~/bmo/` | Cosmetic only — doc drift |

**Reproduction:**
```bash
grep -rn "/home/patrick/bmo/\|~/bmo/" bmo/pi/{dev,tests,scripts}/ --include="*.py" --include="*.sh"
```

**Expected behavior:** Use `os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app.py")` or `~/home-lab/bmo/pi/...` — same canonicalization done elsewhere in the reorg.

**Hypothesis / root cause:** The 2026-04-23 reorg path-rewrite caught runtime + import paths but missed dev tooling and a few tests because they're not exercised on every startup.

**Proposed fix:**
- [ ] Sweep with sed: `grep -rln "/home/patrick/bmo/" bmo/pi/{dev,tests,scripts}/ | xargs sed -i 's|/home/patrick/bmo/|/home/patrick/home-lab/bmo/pi/|g'`
- [ ] Eyeball-review the diff (especially the patch scripts — patching `app.py` from a sibling dir is brittle anyway; consider deleting `dev/patch_*.py` if those one-time patches were already applied)
- [ ] Run pytest to verify the rewritten test files still parse and load env

**Related files:** all listed above

---

### [2026-04-24] `audioop` deprecated, slated for removal in Python 3.13 — used in `bots/discord_social_bot.py`

- **Category:** bug, portability
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** Discord bot crash log review

**Description:** `data/logs/social-bot.log` shows on every restart:

```
DeprecationWarning: 'audioop' is deprecated and slated for removal in Python 3.13
  import audioop
```

Used in:
- `bots/discord_social_bot.py:16` — `import audioop`
- `bots/discord_social_bot.py:273` — `mono = audioop.tomono(pcm_bytes, 2, 1, 0)` (stereo→mono mixing for voice channel input)

The Pi currently runs Python 3.11.2, so the warning is not yet a hard break. But:

1. Any system-level Python upgrade (Raspberry Pi OS bookworm → trixie or a manual Python 3.13 install) will break the social bot at import time.
2. The warning floods the log file every 10s during the current crash-loop (60+ warning lines in `data/logs/social-bot.log` already).

**Reproduction:**
```bash
grep -c "DeprecationWarning: 'audioop'" /home/patrick/home-lab/bmo/pi/data/logs/social-bot.log
```

**Expected behavior:** No DeprecationWarning; `audioop`-equivalent code uses a forward-compatible replacement.

**Hypothesis / root cause:** Pre-Python-3.13, `audioop` (a stdlib C module) was the standard way to do stereo→mono mixing. PEP 594 deprecated it in 3.11 and slated removal for 3.13. Replacement is the third-party `audioop-lts` shim or a numpy-based equivalent (mono = (left + right) / 2 over int16 samples).

**Proposed fix (pick one):**
- [ ] Add `audioop-lts` to `requirements.txt`, update import to `try: import audioop except ImportError: import audioop_lts as audioop`
- [ ] OR rewrite the single `audioop.tomono(...)` call as a numpy operation (we already depend on numpy): `mono = ((np.frombuffer(pcm_bytes, dtype=np.int16).reshape(-1, 2).mean(axis=1)).astype(np.int16)).tobytes()`
- [ ] Suppress the DeprecationWarning at import time as a stopgap (not ideal — the warning exists for a reason)

**Related files:** `bmo/pi/bots/discord_social_bot.py:16,273`, `bmo/pi/requirements.txt`

---

### [2026-04-23] `openwakeword` default model missing — fallback active

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO service restart after reorg

**Description:** `openwakeword` library installed but the default `hey_jarvis_v0.1.onnx` model file is missing. BMO silently falls back to energy + STT wake-word detection (works but slightly less accurate).

**Reproduction:** `journalctl -u bmo | grep "openwakeword not available"` → `Load model from .../openwakeword/resources/models/hey_jarvis_v0.1.onnx failed. File doesn't exist`

**Expected behavior:** openwakeword ONNX inference active (faster + more accurate).

**Hypothesis / root cause:** `pip install openwakeword` didn't ship with model files. Or BMO actually uses custom `hey_bmo.onnx` + openwakeword was never intended as primary and we can suppress the error.

**Proposed fix:**
- [ ] Investigate `bmo/pi/services/voice_pipeline.py` — is openwakeword used or vestigial?
- [ ] If vestigial: clean up import, drop dependency
- [ ] If wanted: download model (`pip install openwakeword[models]` or manual)

**Related files:** `bmo/pi/services/voice_pipeline.py`, `bmo/pi/wake/hey_bmo.onnx`

---

### [2026-04-23] MCP servers fail to initialize (0/3 connect)

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO startup after reorg

**Description:** Startup logs show `[mcp] Initialized: 0/3 servers, 0 tools`. MCP (Model Context Protocol) integration non-functional — agents can't use MCP tools for D&D data queries.

**Reproduction:** Start `bmo.service` → check logs → `[mcp:dnd_data] Initialize failed: EOF reading from MCP server`

**Expected behavior:** ≥1 MCP server initializes; tools count > 0.

**Hypothesis / root cause:** Likely path issue in `mcp_servers/mcp_settings.json` (possibly referencing old `~/bmo/mcp_servers/` before path canonicalization) OR the MCP server process crashes immediately on startup.

> **[2026-04-24 update — Claude Opus]** **Hypothesis confirmed.** `mcp_servers/mcp_settings.json` still references the legacy `/home/patrick/bmo/...` path in 5 places (lines 7, 9, 10, 11, and the `filesystem` server's allowed roots at lines 19-21). That dir does not exist on this host (`ls /home/patrick/bmo` → No such file or directory), so the `dnd_data` MCP stdio server can't find its script and the `filesystem` MCP server can't start with valid roots — both fail at init. Fix: rewrite all `/home/patrick/bmo/...` to `/home/patrick/home-lab/bmo/pi/...` in `mcp_settings.json`. After the rewrite, restart bmo and re-check `[mcp] Initialized: ?/3`.

**Proposed fix:**
- [ ] Verify paths in `bmo/pi/mcp_servers/mcp_settings.json`
- [ ] Run `./venv/bin/python mcp_servers/dnd_data_server.py` manually to see stderr
- [ ] Check for missing Python deps
- [ ] If mcp_settings.json references `~/bmo/mcp_servers/...` update to `~/home-lab/bmo/pi/mcp_servers/...`

**Related files:** `bmo/pi/mcp_servers/dnd_data_server.py`, `bmo/pi/mcp_servers/mcp_settings.json`, `bmo/pi/agents/mcp_manager.py`, `bmo/pi/agents/mcp_client.py`

---

### [2026-04-23] pytest suite fails to collect with `'agents' is not a package` in full run

- **Category:** debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** pytest validation after reorg

**Description:** `pytest tests/` fails to collect `tests/agents/test_routing_accuracy.py` with `ModuleNotFoundError: No module named 'agents.router'; 'agents' is not a package`. But running that file alone (`pytest tests/agents/test_routing_accuracy.py`) passes 77 tests successfully.

Root cause: `tests/conftest.py` mocks 3rd-party modules (`openwakeword`, `gevent`, `requests`) by writing to `sys.modules` at module-load time. When earlier test files are collected, they pollute `sys.modules['agents']` as a `MagicMock` before `test_routing_accuracy.py` tries to import.

**Reproduction:**
1. `cd bmo/pi && ./venv/bin/python -m pytest tests/` → errors out
2. `./venv/bin/python -m pytest tests/agents/test_routing_accuracy.py` → passes 77 tests

**Expected behavior:** Full suite runs cleanly.

**Proposed fix:**
- [ ] Refactor `tests/conftest.py` to use `pytest_configure` + `patch.dict(sys.modules)` in fixture scope (not module-level sys.modules writes)
- [ ] OR split conftest into subset per test directory
- [ ] Same root cause also breaks: `test_wake_*`, `test_calendar_auth_paths`, `test_music_restore`, `test_server`

**Related files:** `bmo/pi/tests/conftest.py`

---

### [2026-04-23] Piper TTS model references point to nonexistent path

- **Category:** config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** path canonicalization after reorg

**Description:** Voice pipeline + wake-word tests reference `os.path.expanduser("~/home-lab/bmo/pi/models/piper/en_US-hfc_female-medium.onnx")`. The `bmo/pi/models/` directory doesn't exist. Piper TTS would fail if invoked. Preexisting (pre-reorg).

**Reproduction:** `grep -rn "models/piper" bmo/pi/` → multiple refs. `ls bmo/pi/models/` → dir missing.

**Expected behavior:** Either piper model files exist at referenced path, OR code has graceful fallback, OR piper is removed if unused.

**Proposed fix (pick one):**
- [ ] Download piper voices to `bmo/pi/models/piper/` (add to `setup-bmo.sh`)
- [ ] Remove piper-dependent code if Fish Audio is the only active TTS
- [ ] Add env var to configure model path with fallback to Fish Audio if missing

**Related files:** `bmo/pi/services/voice_pipeline.py`, `bmo/pi/tests/test_wake_{auto,debug,timed}.py`

---

## Low

### [2026-04-24] BMO venv: 4 known CVEs in `pip` (1) + `setuptools` (3)

- **Category:** security, debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** `pip-audit` (deep scan)

**Description:** `venv/bin/pip-audit` reports 4 vulnerabilities:

| Package | Version | Vuln | Fix version |
|---|---|---|---|
| `pip` | 26.0.1 | CVE-2026-3219 | (no fix yet — wait for upstream) |
| `setuptools` | 66.1.1 | CVE-2024-6345 | 70.0.0 |
| `setuptools` | 66.1.1 | PYSEC-2025-49 | 78.1.1 |
| `setuptools` | 66.1.1 | PYSEC-2025-49 (dup) | 78.1.1 |

The `setuptools` ones are actionable. CVE-2024-6345 is a remote-code-execution in `setuptools.package_index.PackageIndex.download` — affects the `pip install` command if it ever processes a package with a malicious download URL. Low real-world risk because the BMO venv is built once and not used for ongoing pip resolution against arbitrary sources, but it's a free fix.

`flatbuffers` was also flagged as "skip — not on PyPI" — it's installed but pinned to `20181003210633` (a date-style version), which means it was sourced from a non-PyPI wheel. Worth checking what installs it (likely transitive via `tensorflow` or `mediapipe`).

**Reproduction:**
```bash
cd bmo/pi && venv/bin/pip-audit
```

**Expected behavior:** No actionable CVEs; pinned versions match the latest patch in the chosen major.

**Proposed fix:**
- [ ] `venv/bin/pip install --upgrade 'setuptools>=78.1.1'` (covers all 3 setuptools CVEs)
- [ ] Add `setuptools>=78` to `requirements.txt` (or a build-only `pyproject.toml` constraints section)
- [ ] Skip the `pip` CVE for now (no fix available); track upstream
- [ ] Re-run `pip-audit` to verify fixes
- [ ] Wire `pip-audit` into the existing security `SECURITY-LOG.md` "No dependency audit in CI" entry's planned weekly cron

**Related files:** `bmo/pi/requirements.txt`, `bmo/pi/venv/`

**Related entries:** `SECURITY-LOG.md` "[2026-04-23] No dependency audit in CI" (low) — concrete data behind that entry.

---

### [2026-04-24] ruff `--select=F` finds 144 correctness issues across BMO Python (102 unused imports, 22 unused vars, 20 f-strings without placeholders)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** `ruff check --select=F` (deep scan)

**Description:** Across `bmo/pi/` (excluding venv, _archive, __pycache__, .pytest_cache):

| Rule | Count | Meaning | Risk |
|---|---|---|---|
| `F401` | 102 | unused-import | low (load time, code clarity) |
| `F841` | 22 | unused-local-variable | low (smell — sometimes hides intent) |
| `F541` | 20 | f-string-missing-placeholders (`f"plain text"` with no `{}`) | none (works fine, just not an f-string) |
| `F811` | 2 | redefined-while-unused (one is the `io` shadowing already its own entry) | medium (real bug potential) |
| `F821` | 0 | was undefined `text` in `_stream_and_speak`; fixed — [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) | — |

The F401 + F541 fixes are auto-applicable: `venv/bin/ruff check --select=F401,F541 --fix --exclude venv,_archive,__pycache__,.pytest_cache .`. F841 needs human review per case.

The F-rule issue with real impact that still has its own entry is F811 `io` shadowing (medium). F821 is fixed.

**Reproduction:**
```bash
cd bmo/pi && venv/bin/ruff check --select=F --statistics --exclude venv,_archive,__pycache__,.pytest_cache .
# → 102 F401, 22 F841, 20 F541, 2 F811, ~146 total (F821 fixed — see resolved log)
```

**Expected behavior:** F401 + F541 zero (auto-fixable). F841 reviewed per-case.

**Proposed fix:**
- [ ] `venv/bin/ruff check --select=F401,F541 --fix --exclude venv,_archive,__pycache__,.pytest_cache .` (auto)
- [ ] Run `pytest` after to confirm no behavior change
- [ ] Manual sweep F841 — usually safe to delete, but a few may be `_ = ...` placeholders left for callers
- [ ] Add `[tool.ruff]` config to `pyproject.toml` enforcing F-rules in pre-commit / CI

**Related files:** all over `bmo/pi/`

**Related entries:** `[2026-04-24] services/voice_pipeline.py:769 shadows stdlib io module via inline import` (medium) — F811. F821 / streaming `text` NameError: resolved; see first entry in [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) (2026-04-24 `voice_pipeline` / streaming fixes).

---

### [2026-04-24] `vulture` finds 14 dead-code candidates (8 unused imports, 6 unused vars at 100% confidence)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** `vulture --min-confidence 80` (deep scan)

**Description:** vulture (a dead-code finder) flags:

```
agents/vtt_sync.py:21              unused import 'List' (90%)
bots/discord_dm_bot.py:42          unused import 'calculate_encounter_difficulty' (90%)
cli.py:25                          unused import 'StringIO' (90%)
cli.py:34                          unused import 'Spinner' (90%)
hardware/camera_service.py:17      unused import 'google_vision_describe' (90%)
hardware/oled_face.py:15           unused import 'ImageFont' (90%)
ide_app/ide_app.py:7               unused import 'mimetypes' (90%)
services/voice_pipeline.py:21      unused import 'edge_tts' (90%)
services/voice_pipeline.py:447     unused variable 'time_info' (100%)
services/voice_pipeline.py:533     unused variable 'time_info' (100%)
services/voice_pipeline.py:686     unused variable 'time_info' (100%)
services/voice_pipeline.py:973     unused variable 'self_inner' (100%)
services/voice_pipeline.py:1228    unused variable 'time_info' (100%)
services/voice_pipeline.py:1443    unused variable 'time_info' (100%)
```

**Notable:**
- `services/voice_pipeline.py:21 unused import 'edge_tts'` — but `edge_tts` IS imported at module level. vulture flags it because nothing in the file references it after the import. Cross-check: maybe it's a top-level side-effect import or only used in dead branches.
- 5× `time_info` unused — these are sounddevice callback params that you can't remove (the callback signature is fixed) but ruff/vulture flag because they're `_unused_param`-able.
- `services/voice_pipeline.py:973 unused variable 'self_inner'` — was the old `_M.end(self_inner)` line (B023; **fixed** — re-run vulture; line number may differ).

**Reproduction:**
```bash
cd bmo/pi && venv/bin/vulture --exclude venv,_archive,__pycache__,.pytest_cache,tests --min-confidence 80 .
```

**Expected behavior:** Zero dead code at 100% confidence after sweep; a few legitimate `_time_info` aliases at 90%.

**Proposed fix:**
- [ ] Audit each unused import; remove or `# vulture: ignore` if it's a side-effect import
- [ ] Rename unused callback params: `time_info` → `_time_info` (suppresses both vulture and ruff B007)
- [x] `self_inner` / B023 — fixed (see [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md))
- [ ] Run vulture in CI at `--min-confidence 90`, fail on regressions

**Related files:** all listed above

---

### [2026-04-24] Missing `__init__.py` in `mcp_servers/` and `ide_app/` — inconsistent with `services/`, `agents/`, `bots/`, `wake/`, `dev/`, `hardware/`

- **Category:** debt, config
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** package-structure audit (deep scan)

**Description:** Empty `__init__.py` files exist in `bmo/pi/{services,agents,bots,wake,dev,hardware}/` (6 dirs) — making them proper Python subpackages per CLAUDE.md's rule "Add `__init__.py` if creating new subpackage." But two sibling dirs are missing them:

```
mcp_servers/__init__.py   # missing
ide_app/__init__.py       # missing
```

Functionally this works today because:
- `mcp_servers/dnd_data_server.py` is invoked as a script (`python3 mcp_servers/dnd_data_server.py`) from `mcp_settings.json`, not imported
- `ide_app/ide_app.py` is invoked as a script from `bmo-ide.service` ExecStart

But CLAUDE.md states the convention is to use the prefix import (`from services.X import Y`, never `from X import Y`). If anyone in the future tries `from mcp_servers.dnd_data_server import ...` or `from ide_app.ide_app import ...`, it'll fail with `ModuleNotFoundError: 'mcp_servers' is not a package` — the same failure mode as the existing pytest collection issue.

**Reproduction:**
```bash
cd bmo/pi && for d in services agents bots wake dev hardware mcp_servers ide_app; do
  test -f "$d/__init__.py" && echo "$d: present" || echo "$d: MISSING"
done
# → mcp_servers: MISSING
# → ide_app: MISSING
```

**Expected behavior:** Both dirs are proper subpackages with empty `__init__.py`, matching the rest.

**Proposed fix:**
- [ ] `touch bmo/pi/mcp_servers/__init__.py bmo/pi/ide_app/__init__.py`
- [ ] Verify nothing breaks: restart bmo, restart bmo-ide (or just `python3 -m mcp_servers.dnd_data_server` to confirm import works)
- [ ] Add the new files to git: `git add bmo/pi/mcp_servers/__init__.py bmo/pi/ide_app/__init__.py`

**Related files:** `bmo/pi/mcp_servers/`, `bmo/pi/ide_app/`

---

### [2026-04-24] ~150 `except: pass`-style swallow blocks across BMO Python — silent-failure debt

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** code smell pass during BMO error scan

**Description:** Static count of `except <ExceptionClass>:` immediately followed by a `pass`-only line found ~150 occurrences across `bmo/pi/` Python (excluding venv, __pycache__). Top offenders:

| File | Approx count | Notes |
|---|---|---|
| `app.py` | ~25 | Mostly `except (OSError, subprocess.SubprocessError): pass` — defensible for filesystem/process probing. Some `except Exception: pass` are riskier. |
| `hardware/led_controller.py` | ~6 | Exception-suppression around hardware probes (likely tolerable but spread across module) |
| `hardware/camera_service.py`, `hardware/fan_control.py` | ~3 each | Same pattern |
| `bots/discord_dm_bot.py` | ~2 | `except Exception` and `except discord.HTTPException` — silently dropping bot errors hides failures |
| `agent.py`, `agents/*` | ~10+ | scattered |

**Impact:** Real failures (network blips, file-not-found, permission errors, library exceptions) are swallowed silently. Symptoms surface as "X feature stopped working but no error in logs" — a recurring debugging time-sink.

**Concrete example:**
```python
# bots/discord_dm_bot.py:38
try:
    discord.opus.load_opus("libopus.so.0")
except Exception:
    pass  # voice will fail later with cryptic error instead of explicit "opus missing"
```

**Proposed fix (incremental):**
- [ ] Sweep `except Exception: pass` (the worst form) — replace with `except Exception as e: logger.warning("...: %s", e)` so errors at least show up
- [ ] Audit narrower `except (OSError, ...)` blocks individually — many are intentional probes; leave them but add a 1-line comment explaining why suppression is correct
- [ ] Add a lint rule (ruff `BLE001` or `S110`) in CI to prevent new bare-pass blocks
- [ ] Track per-file via a checklist; do this as a series of small PRs rather than one mega-sweep

**Reproduction:**
```bash
cd bmo/pi && grep -rEn "^(\s*)except.*:\s*$" --include="*.py" . 2>/dev/null | grep -v venv | grep -v __pycache__ | awk -F: '{
  cmd = "sed -n \"" $2+1 "p\" " $1
  cmd | getline n
  close(cmd)
  if (n ~ /^[[:space:]]+pass[[:space:]]*$/) print $1":"$2
}' | wc -l
# → ~150
```

**Related files:** `bmo/pi/app.py`, `bmo/pi/bots/*`, `bmo/pi/hardware/*`, `bmo/pi/agents/*`

---

### [2026-04-23] BMO `/health` endpoint can hang when gevent workers saturated

- **Category:** performance
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** service restart validation

**Description:** After long-running TTS/STT operations, `/health` requests can queue behind active work. Observed as CLOSE-WAIT socket pileup on port 5000. Workers eventually recover on restart.

**Reproduction:** Let BMO run for ~10 minutes of heavy use → `curl /health` hangs → `ss -tnp | grep 5000` shows many CLOSE-WAIT.

**Expected behavior:** `/health` returns in milliseconds regardless of other workload.

**Hypothesis / root cause:** Some service doing blocking I/O without gevent yield. Additionally `bmo-kiosk.service` ExecStartPre polls /health 30× during startup — if /health is slow, this compounds.

**Proposed fix:**
- [ ] Audit services for blocking I/O (file reads, subprocess calls without `gevent.subprocess`)
- [ ] Consider separate lightweight HTTP server for /health on a different port (no gevent contention)
- [ ] Reduce bmo-kiosk poll rate (every 2s instead of 1s) — or use systemd `Wants=bmo.service` + proper After= dependency

**Related files:** `bmo/pi/app.py` (/health route + `gevent.monkey.patch_all()`), `bmo/pi/kiosk/bmo-kiosk.service`

---

### [2026-04-23] `~/.cache/pip/http-v2/` holds ~3.2 GB (pip's own `cache info` misses this)

- **Category:** debt, infra
- **Severity:** low
- **Domain:** bmo *(Pi-side infra — bmo's venv is the only thing using `pip` on this Pi)*
- **Discovered by:** Claude Opus
- **During:** home-dir sweep

**Description:** `du -sh ~/.cache/pip/http-v2` = 3.2 GB. `pip cache info` reports only 2.2 MB (`http/`) + 344 KB (`wheels/`) — the `http-v2/` directory (pip's newer HTTP cache format) is not inventoried by the CLI. Also: `~/.cache/electron/` = 111 MB (old Electron download tarball — dnd-app dev dep), `~/.npm/_cacache/` = 316 MB (global npm cache — dnd-app dev dep).

**Impact:** ~3.6 GB reclaimable across the three caches. Low priority — disk has 86 GB free — but these grow unbounded over time.

**Proposed fix:**
- [ ] `rm -rf ~/.cache/pip/http-v2` — pip will rebuild on next install
- [ ] `npm cache clean --force` (reclaims ~316 MB from `~/.npm`)
- [ ] `rm -rf ~/.cache/electron` — regenerated on next `pnpm install` if needed

---

### [2026-04-23] Workspace health scan: Pi dev env incomplete + cleanup scan blocked

- **Category:** config, debt, tooling
- **Severity:** low
- **Domain:** both *(also mirrored in [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) — fix once, remove from both)*
- **Discovered by:** Cursor agent
- **During:** root workspace deep scan + system health check (aggressive cleanup prep; no moves executed)

**Description:**
Full automated cleanup pass **blocked** on this host because primary tooling is not runnable.

1. **`dnd-app/`: `node_modules` directory absent** — `npm ls` reports unmet dependency `zustand@^5.0.11`; `npm run lint` fails (`biome: not found`); `npx tsc` resolves wrong package (`tsc@2.0.4` stub) because local TypeScript is not installed. `npm run build` / `npm test` not validated.
2. **System Node = `v18.20.4` (`/usr/bin/node`)** — ad-hoc `npx knip@latest` fails: `node:util` has no `styleText` (needs newer Node for current knip). Project stack (electron-vite, etc.) expected on dev machines is typically **Node 20+**; this Pi is below that for modern nested tooling.
3. **`bmo/pi/venv/`: `bin/` missing** (only `include/`, `lib/`) — `./venv/bin/python` does not exist. **Cannot** run `pytest` or `pip check`. Venv is corrupt or manually stripped; 312M under `bmo/pi` includes this tree.
4. **Bytecode cache:** `find` shows **~1345** `__pycache__` dirs under `bmo/pi/venv` (expected for installed packages) and **11** `__pycache__` dirs under `bmo/pi` **excluding** `venv/` (safe to clear — regenerated on import).
5. **Duplicate-file pass:** `fdupes` / `jdupes` / `rdfind` not in PATH; no full binary duplicate report. Duplicate **code** (jscpd) not run — requires working `dnd-app` install.
6. **Large space (not auto-archived in this pass):** `.git` ~1.8G (includes **~1.6G** `git lfs`); `5.5e References/` ~1.6G — user reference assets; not classified as deletable bloat without explicit rule.
7. **Runtime logs:** `bmo/pi/data/logs/dm-bot.log`, `social-bot.log` — active; not cleanup targets.

**Proposed fix:**
- [ ] On this machine: `cd dnd-app && npm ci` (or `npm install`) after upgrading to **Node 20+** (nvm, nodesource, or official binary).
- [ ] Recreate BMO venv: `cd bmo/pi && rm -rf venv && python3.11 -m venv venv && ./venv/bin/pip install -r requirements.txt` (adjust Python version to match Pi).
- [ ] Re-run: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx knip`, `./venv/bin/python -m pytest`, `./venv/bin/pip check`.
- [ ] Optional: install `fdupes` or use `rdfind` for duplicate PDF/asset audit under `5.5e References/`.

**Related files:** `dnd-app/package.json`, `bmo/pi/requirements.txt`, `bmo/pi/venv/`

---

### [2026-04-23] README.md at repo root is sparse (Phase22 flag)

- **Category:** docs
- **Severity:** low
- **Domain:** docs *(repo-root docs — homed in BMO log since Pi is the production host; minor cross-cutting cleanup)*
- **Discovered by:** Phase22 audit (historical)
- **Status:** partially resolved — root README added during reorg. May still want CONTRIBUTING expansion, CHANGELOG history population.

**Related files:** `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`

---

> dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO future ideas / design gotchas / observations: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved BMO issues: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md).
