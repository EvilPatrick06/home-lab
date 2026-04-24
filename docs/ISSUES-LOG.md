# Issues Log

> **Append-only log of bugs, tech debt, future ideas, design gotchas.**
> **Instructions for logging are in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md) — read before appending.**

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

## Critical

*(none currently logged)*

## High

### [2026-04-23] `bmo/pi/requirements.txt` missing 4 runtime imports

- **Category:** config, bug
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** deep cleanup scan — dependency cross-check (imports vs `requirements.txt`)

**Description:** Four third-party packages are imported by BMO runtime code but are NOT declared in `bmo/pi/requirements.txt`. They currently work only because they're transitively installed or were `pip install`ed manually:

| Package | Import name | Files using it |
|---|---|---|
| `python-dotenv` | `dotenv` | 6 |
| `discord.py` | `discord` | 4 (the Discord bots) |
| `edge-tts` | `edge_tts` | 1 |
| `scipy` | `scipy` | 5 (transitive via `resemblyzer`, but directly imported) |

**Impact:** Fresh venv rebuild (`rm -rf venv && pip install -r requirements.txt`) will NOT install these. Discord bots will fail on first import. Re-auth / re-deploy procedures are silently broken.

**Reproduction:**
```bash
cd bmo/pi && rm -rf venv.test && python3.11 -m venv venv.test && ./venv.test/bin/pip install -r requirements.txt
./venv.test/bin/python -c "import dotenv, discord, edge_tts, scipy"  # ModuleNotFoundError
```

**Proposed fix:**
- [ ] Append to `bmo/pi/requirements.txt`: `python-dotenv`, `discord.py[voice]`, `edge-tts`, `scipy`
- [ ] Verify clean install from the fresh requirements works

**Related files:** `bmo/pi/requirements.txt`, `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/services/voice_pipeline.py`

---

### [2026-04-23] BMO venv carries ~4.5 GB of CUDA/torch GPU libraries on a Pi 5 (no GPU)

- **Category:** debt, performance, config
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** venv size audit (`du -sh bmo/pi/venv` = 5.3 GB)

**Description:** `bmo/pi/venv/` totals 5.3 GB, of which ~4.5 GB is unusable GPU-stack weight the Pi 5 cannot use:

- `nvidia/` wheels — 2.8 GB (cublas, cudnn, cusparse, cufft, cusolver, curand, nccl, nvrtc…)
- `torch/` — 917 MB (includes `libtorch_cuda.so` = 397 MB, `libtorch_cpu.so` = 248 MB)
- `triton/` — 601 MB
- `llvmlite/` — 159 MB

`lspci` shows no GPU; `/dev/nvidia*` absent. The Pi 5 is a CPU-only ARM64 host. These libraries load on ARM64 but CUDA calls will error at runtime — they are pure dead weight.

**Root cause:** `Resemblyzer → torch 2.11.0` installed from the default PyTorch index (which bundles GPU runtime for aarch64 now that NVIDIA Jetson builds exist). Needs `--index-url https://download.pytorch.org/whl/cpu` pinning.

**Reclaimable:** ~4.5 GB on `/` (currently 23% used, plenty of headroom, but venv rebuild time is slow on Pi).

**Proposed fix:**
- [ ] Add top-of-file comment in `requirements.txt` pinning CPU wheels, OR
- [ ] Use a constraint: install torch separately first with CPU index, then the rest
- [ ] Rebuild venv: `rm -rf venv && python3.11 -m venv venv && ./venv/bin/pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt`
- [ ] Verify `Resemblyzer` still imports + speaker verification still works

**Related files:** `bmo/pi/requirements.txt`, `bmo/setup-bmo.sh`

---

### [2026-04-23] Google Calendar auth fails with `invalid_grant: Bad Request`

- **Category:** config
- **Severity:** high
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO service restart validation after reorg

**Description:** `journalctl -u bmo` shows `[calendar] Cache refresh failed: ('invalid_grant: Bad Request', ...)`. Calendar events don't load. BMO calendar_agent reports no events.

**Reproduction:**
1. Start BMO: `sudo systemctl start bmo`
2. Wait for init complete
3. `curl http://localhost:5000/api/calendar/events` → returns error
4. Logs show `invalid_grant`

**Expected behavior:** Calendar events load for agents + UI.

**Hypothesis / root cause:** OAuth refresh token invalid (expired or revoked by provider).

**Proposed fix:**
- [ ] Run re-auth flow: `cd bmo/pi && ./venv/bin/python services/authorize_calendar.py`
- [ ] Follow URL, grant permissions, token.json rewritten
- [ ] `sudo systemctl restart bmo`

**Related files:** `bmo/pi/services/calendar_service.py`, `bmo/pi/services/authorize_calendar.py`, `bmo/pi/config/token.json`

---

## Medium

### [2026-04-23] `dnd-app/src/renderer/public/data/5e/equipment/magic-items/` — 13 content-duplicate pairs + ~20 same-name-different-content collisions

- **Category:** bug, debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** deep cleanup scan — content hash pass across source files

**Description:** SHA-256 hashing inside `public/data/5e/` reveals two data-integrity issues in the magic-items subtree:

1. **13 groups of byte-identical JSON files that represent *different* items.** Example: `potion-of-heroism.json` has the exact same bytes as `potions-of-healing.json`. Other examples include `mace-of-smiting.json` = `mace-of-disruption.json`, and a 5-file group covering `robe-of-useful-items.json`, `robe-of-eyes.json`, `robe-of-stars.json`, `robe-of-the-archmagi.json`, `nature-s-mantle.json`. These are almost certainly templating / copy-paste errors — the app will display wrong data for whichever item the "winning" file's content doesn't match.

2. **~20+ same-name, different-content files** across the `magic-items/{permanent/wondrous,legendary,rare,uncommon,common,other}/` subfolders. Examples: `cubic-gate.json`, `apparatus-of-kwalish.json`, `hammer-of-thunderbolts.json`, `belt-of-giant-strength.json`, `enspelled-armor.json`, `enspelled-weapon.json`, `staff-of-flowers.json`, `deck-of-illusions.json`, `headband-of-intellect.json` — each exists in 2 (sometimes 3) locations with divergent content. Which copy is canonical is unclear. Also noticed: `mule.json` exists in 3 places (mount / companion / beast) with 3 different contents, and `shadow-demon.json` exists at both `.../fiends/shadow-demon.json` and `.../fiends/demons/shadow-demon.json`.

**Impact:** Library lookups by slug/name are nondeterministic — depends on which loader path wins. Users can't trust item entries in this subtree.

**Reproduction:**
```bash
cd /home/patrick/home-lab
find dnd-app/src/renderer/public/data/5e/equipment/magic-items -name '*.json' -exec sha256sum {} + \
  | sort | uniq -d -w64 | head
```

**Proposed fix:**
- [ ] Treat each dup group as a data bug: open each file, find the canonical source (the old 5e reference PDFs, or a spell-compendium), re-author each identical file with the correct content.
- [ ] For the name-collision set, pick one canonical path convention (permanent/wondrous/ vs rarity/) and delete or redirect the other. Decide as a design rule.
- [ ] Add a build-time check (`tools/validate-5e-data.ts`?) that errors on duplicate content hashes and duplicate slugs.

**Related files:** `dnd-app/src/renderer/public/data/5e/equipment/magic-items/**`, `dnd-app/src/renderer/src/services/data-provider.ts`, `dnd-app/src/renderer/src/services/library/content-index.ts`

---

### [2026-04-23] dnd-app Biome lint debt: 60 errors + 192 warnings across ~4500 files

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** `pnpm lint` (health pass)

**Description:** `pnpm lint` exits 1 with 60 errors + 192 warnings + 1 info. Top offending rules:

| Count | Rule |
|---|---|
| 89 | `lint/suspicious/noArrayIndexKey` |
| 31 | `lint/correctness/useHookAtTopLevel` |
| 23 | `lint/suspicious/noExplicitAny` |
| 18 | `lint/complexity/noUselessFragments` |
| 11 | `lint/suspicious/noAssignInExpressions` |
| 10 | `lint/correctness/useNotnpmUnusedFunctionParameters` |
| 5 | `lint/correctness/useExhaustiveDependencies` |
| 4 | `lint/suspicious/noImplicitAnyLet` |

Worst files by count: `PlayerHUDOverlay.tsx` (11), `utils/chat-links.ts` (8), `services/io/import-export.ts` (7), `MonsterStatBlockView.tsx` (6).

**Impact:** CI (if wired) would stay red; dev signal-to-noise degraded; `useHookAtTopLevel` in particular is a correctness smell (may cause render bugs).

**Proposed fix:**
- [ ] Sweep `useHookAtTopLevel` and `noAssignInExpressions` first (correctness) — a handful of PRs
- [ ] Convert `useHookAtTopLevel` violations one at a time (many are conditional hook calls that need restructuring)
- [ ] `noArrayIndexKey` is mostly low-risk; a search-and-replace PR with code review
- [ ] `noExplicitAny` — audit each; some may need the `// biome-ignore` with justification per CLAUDE.md policy

**Related files:** `dnd-app/biome.json` (rules config), top offenders listed above

---

### [2026-04-24] dnd-app Vitest: 30 failing tests (633 files / 6137 tests)

- **Category:** test
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Cursor agent
- **During:** post-cleanup `npm test` on Raspberry Pi

**Description:** Full suite ends with **9 failed files**, **30 failed tests** (examples: `token-sprite.test.ts` Pixi container mock; `TokenContextMenu.test.tsx` `selectedTokenIds` undefined in test harness).

**Reproduction:** `cd dnd-app && npm test`

**Expected behavior:** 0 failures.

**Note:** Failures appear unrelated to 2026-04-24 archive moves (no imports of archived paths). Likely pre-existing mock / SSR harness gaps.

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

**Proposed fix:**
- [ ] Verify paths in `bmo/pi/mcp_servers/mcp_settings.json`
- [ ] Run `./venv/bin/python mcp_servers/dnd_data_server.py` manually to see stderr
- [ ] Check for missing Python deps
- [ ] If mcp_settings.json references `~/bmo/mcp_servers/...` update to `~/home-lab/bmo/pi/mcp_servers/...`

**Related files:** `bmo/pi/mcp_servers/dnd_data_server.py`, `bmo/pi/mcp_servers/mcp_settings.json`, `bmo/pi/agents/mcp_manager.py`, `bmo/pi/agents/mcp_client.py`

---

### [2026-04-23] Streaming chat falls back to sync — `name 'text' is not defined`

- **Category:** bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** BMO live usage after restart

**Description:** `[stream] Streaming failed (name 'text' is not defined), falling back to sync`. Streaming path has unbound `text` reference. Fallback works so users don't notice, but streaming UX is lost (response appears all at once instead of incrementally).

**Reproduction:** Send a chat message to BMO → check logs.

**Expected behavior:** Response streams live to caller.

**Hypothesis / root cause:** Likely in `app.py:_chat_stream_callback` or a wrapper. Variable shadowing or scope issue.

**Proposed fix:**
- [ ] grep `'text'` usages near streaming callback in `app.py`
- [ ] Add test case that exercises streaming path
- [ ] Fix NameError

**Related files:** `bmo/pi/app.py` (around streaming callback region), possibly `bmo/pi/services/voice_pipeline.py`

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

### [2026-04-23] `~/.cache/pip/http-v2/` holds ~3.2 GB (pip's own `cache info` misses this)

- **Category:** debt, infra
- **Severity:** low
- **Domain:** infra
- **Discovered by:** Claude Opus
- **During:** home-dir sweep

**Description:** `du -sh ~/.cache/pip/http-v2` = 3.2 GB. `pip cache info` reports only 2.2 MB (`http/`) + 344 KB (`wheels/`) — the `http-v2/` directory (pip's newer HTTP cache format) is not inventoried by the CLI. Also: `~/.cache/electron/` = 111 MB (old Electron download tarball), `~/.npm/_cacache/` = 316 MB (global npm cache).

**Impact:** ~3.6 GB reclaimable across the three caches. Low priority — disk has 86 GB free — but these grow unbounded over time.

**Proposed fix:**
- [ ] `rm -rf ~/.cache/pip/http-v2` — pip will rebuild on next install
- [ ] `npm cache clean --force` (reclaims ~316 MB from `~/.npm`)
- [ ] `rm -rf ~/.cache/electron` — regenerated on next `pnpm install` if needed

---

### [2026-04-23] dnd-app: 111 unused exports + 113 unused exported types (knip)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** `pnpm knip` run (knip.json already configured)

**Description:** Zero fully-unused files, zero unused dependencies, zero unlisted imports — the manifest is clean. But knip flags 111 unused exports across 77 files and 113 unused exported types. Top offenders (exports per file):

```
17  src/renderer/src/network/index.ts
11  src/renderer/src/services/combat/damage-resolver.ts
 6  src/renderer/src/services/combat/attack-resolver.ts
 6  src/renderer/src/network/peer-manager.ts
 5  src/renderer/src/services/combat/combat-resolver.ts
 5  src/renderer/src/pages/library/LibraryFilters.tsx
```

**Impact:** Public API surface drift — `export` declarations that no consumer uses. Adds autocomplete noise; makes refactoring harder (can't tell what's intentional extension API vs. forgotten dead surface).

**Proposed fix:**
- [ ] Sweep per-file: downgrade `export` → local, or delete with a test run after
- [ ] For public facade files like `network/index.ts`, audit whether the facade exists for external consumers (plugin API?) or was just a re-export left over from refactor
- [ ] Run `pnpm knip` in CI after cleanup, fail on new regressions

---

### [2026-04-23] Workspace health scan: Pi dev env incomplete + cleanup scan blocked

- **Category:** config, debt, tooling
- **Severity:** low
- **Domain:** both
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

### [2026-04-23] Pre-commit secret scanner missing

- **Category:** future-idea, security
- **Severity:** low
- **Domain:** tooling
- **Discovered by:** Claude Opus
- **During:** post-reorg .gitignore hardening

**Description:** Despite `.gitignore` hardening, a developer could accidentally commit a `.env` via typo or `git add -f`. A pre-commit / pre-push hook running `gitleaks` or `git-secrets` would catch this before push.

**Proposed fix:**
- [ ] Add `.githooks/pre-commit` running `gitleaks protect --staged --redact`
- [ ] Document in `CONTRIBUTING.md`
- [ ] Set `git config core.hooksPath .githooks` in a bootstrap script / README
- [ ] Optional: add GitHub Actions workflow `gitleaks-action` for post-push safety net

**Effort estimate:** 1-2 hours

**Related files:** `.gitignore`, `SECURITY.md`, future `.githooks/pre-commit`

---

### [2026-04-23] Systemd service hardening minimal

- **Category:** security, future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** systemd service file audit

**Description:** BMO systemd services run with minimal sandboxing. Options like `ProtectSystem=strict`, `PrivateTmp=true`, `NoNewPrivileges=true`, `ReadWritePaths=` could limit blast radius if a service is compromised.

**Proposed fix:**
- [ ] Add hardening directives to `bmo.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`
- [ ] Test each service still works (systemd hardening can break paths unexpectedly)
- [ ] Document chosen settings + rationale in `bmo/docs/SYSTEMD.md`

**Effort estimate:** 2-3 hours (much of it testing)

**Related files:** `/etc/systemd/system/bmo*.service`, `bmo/pi/kiosk/bmo-*.service`, `bmo/setup-bmo.sh`

---

### [2026-04-23] BMO HTTP API has no authentication

- **Category:** security
- **Severity:** low (on trusted LAN) / medium (if ever exposed)
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** architecture review

**Description:** BMO's Flask API on port 5000 accepts any request from any network-reachable client. No API key, no token, no session. Fine for home LAN behind a firewall, but any exposure (Cloudflare Tunnel without Access policy, port-forward, etc.) = open to internet.

**Proposed fix:**
- [ ] Add optional `BMO_API_KEY` env var — if set, require `Authorization: Bearer <key>` header
- [ ] Skip auth for localhost requests (for systemd services talking to themselves)
- [ ] Add middleware + tests

**Effort estimate:** 2 hours

**Related files:** `bmo/pi/app.py` (add before_request handler)

---

### [2026-04-23] 30+ JSON `public/data/5e/` files too large — lazy-load chunks needed

- **Category:** performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Phase22 audit (preexisting, re-flagging post-reorg)
- **During:** structure review

**Description:** `dnd-app/src/renderer/public/data/5e/` has 3096 JSON files. Eagerly loading all of them on character builder / library pages would be bad UX. `resources/chunk-index.json` exists for lazy loading but may be underused.

**Proposed fix:**
- [ ] Audit which pages eagerly import `@data/5e/*` — should use dynamic import + chunk-index
- [ ] Profile library page load time, confirm no regression
- [ ] Add size budget check in CI (alert if bundle exceeds N MB)

**Related files:** `dnd-app/src/renderer/public/data/5e/`, `dnd-app/resources/chunk-index.json`, `dnd-app/src/renderer/src/services/library/`

---

### [2026-04-23] README.md at repo root is sparse (Phase22 flag)

- **Category:** docs
- **Severity:** low (resolved during reorg, keeping entry for history)
- **Domain:** docs
- **Discovered by:** Phase22 audit (historical)
- **Status:** partially resolved — root README added during reorg. May still want CONTRIBUTING expansion, CHANGELOG history population.

**Related files:** `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`

---

### [2026-04-23] Discord bot permissions not audited

- **Category:** security, future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** Claude Opus
- **During:** security review

**Description:** Haven't audited what permissions our DM + social bots request from Discord. Least-privilege principle — bots should only have scopes they need.

**Proposed fix:**
- [ ] Check bot invite URLs used in Discord Dev Portal
- [ ] Trim any `administrator` / broad scopes to specific needed ones (`send_messages`, `embed_links`, `use_slash_commands`, `read_message_history`, `manage_threads` for DM)
- [ ] Document final scope choice in `bmo/docs/SERVICES.md`

**Related files:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/bots/discord_social_bot.py`

---

### [2026-04-23] No dependency audit in CI

- **Category:** security, future-idea
- **Severity:** low
- **Domain:** tooling
- **Discovered by:** Claude Opus
- **During:** tooling review

**Description:** `npm audit` and `pip-audit` aren't run automatically. Security advisories in deps go unnoticed until manual check.

**Proposed fix:**
- [ ] Add GitHub Actions workflow: weekly cron running `npm audit` + `pip-audit`
- [ ] Post results as an issue if new vulnerabilities detected
- [ ] Document process in `CONTRIBUTING.md`

**Related files:** `.github/workflows/` (new file), `dnd-app/package.json`, `bmo/pi/requirements.txt`

---

## Info / Observations

### [2026-04-23] 5 game-data JSONs byte-identical between `dnd-app/` and `bmo/pi/data/5e/`

- **Category:** design-gotcha, docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** Claude Opus
- **During:** workspace duplicate-hash pass

**Description:** The following 5 files have identical SHA-256 between the two domains:

| dnd-app path | bmo/pi path |
|---|---|
| `public/data/5e/hazards/conditions.json` | `data/5e/conditions.json` |
| `public/data/5e/encounters/encounter-presets.json` | `data/5e/encounter-presets.json` |
| `public/data/5e/encounters/random-tables.json` | `data/5e/random-tables.json` |
| `public/data/5e/equipment/magic-items.json` | `data/5e/magic-items.json` |
| `public/data/5e/world/treasure-tables.json` | `data/5e/treasure-tables.json` |

**Why useful to future agents:** This is almost certainly intentional per the "each domain owns its own storage" pattern (see sibling Info entry on data ownership) — the VTT ships the data to the renderer, BMO ships the same data to the DM agent. But if one side changes, the other will silently go stale. Two options: (a) keep the duplicate and document that a **sync script is required** when any of these 5 files changes, or (b) promote to a shared asset directory and have both domains read from one source.

**Related files:** listed above, plus `docs/DATA-FLOW.md` (candidate for a note), `dnd-app/tools/build-index.*` (likely generator if one exists)

---

### [2026-04-23] Data ownership pattern: dnd-app vs bmo

- **Category:** design-gotcha, docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** Claude Opus
- **During:** DATA-FLOW.md drafting

**Description:** Each domain owns its own storage. dnd-app writes to `%APPDATA%/dnd-vtt/` (per-user, per-install). bmo writes to `/home/patrick/home-lab/bmo/pi/data/` (shared, on Pi). No cross-domain filesystem access — they communicate via HTTP only.

**Why useful to future agents:** If adding a feature that "needs data from the other side" — DON'T reach across filesystem. Add HTTP endpoint + use `bmo-bridge.ts` or `vtt_sync.py`.

**Related files:** `docs/DATA-FLOW.md`, `dnd-app/src/main/bmo-bridge.ts`, `bmo/pi/agents/vtt_sync.py`

---

## Design gotchas (warnings for future agents)

### [2026-04-23] DO NOT leave task-list items as `pending` / `in_progress` at session end

- **Category:** design-gotcha, docs
- **Severity:** medium
- **Domain:** tooling

**Why it's tempting:** Once you're deep in execution, updating `TodoWrite` state feels like bookkeeping overhead — "I'll flip them all in the wrap-up message." Or you use `merge: true` and forget that drifted IDs from earlier calls are still accumulating in Cursor's aggregate view.

**Why it's wrong:** Cursor's UI counts status literally. A session that actually finished 43 of 43 tasks but only flipped 24 IDs to `completed` displays as "25/43 completed" — the user can't tell whether 18 tasks were genuinely skipped or just unrecorded. Observed in transcript `39e39f59-584b-4ec9-bbfe-1e1747217aa9` (the DnD→home-lab reorg): 17 items ended `pending`, 2 ended `in_progress`, despite the final summary + commit log showing the work was done (commits `030be55`, `c8909c5`, `6b2fc53`, `a234242` prove it).

**What to do instead:** Follow the Task List Discipline section in `AGENTS.md`. Key points:
- Flip status immediately when a task finishes (don't batch).
- Only ONE `in_progress` at a time.
- Before the final summary, walk every non-`completed` ID and reconcile it: mark `completed` (with evidence), `cancelled` (with reason), or flag as genuine user follow-up.
- When splitting a parent task into sub-phases, mark the parent `cancelled` with "split into Xa-Xf" — don't leave it `pending` alongside its children.

**Related entries:** Noted in session `[Cursor project dir cleanup](11f4ff15-afbc-46ab-aa3e-56a4645775ad)` while cleaning up the old `home-patrick-DnD/` Cursor project dir and investigating the 25/43 count.

**Related files:** `AGENTS.md` (§ Task List Discipline)

---

### [2026-04-23] DO NOT rename `bmo/pi/bots/` to `discord/`

- **Category:** design-gotcha
- **Severity:** high

**Why it's tempting:** Looks inconsistent — `services/`, `hardware/`, `bots/` → some might want to rename to `discord/` to match bot purpose.

**Why it's wrong:** Python imports from `discord.py` library use `import discord`. A local `discord/` subpackage (with `__init__.py`) SHADOWS the library — all Discord bot imports break with `ImportError`.

**What to do instead:** Keep `bots/`. Document purpose clearly in README. If you hate the name, "`discord_bots/`" is also safe.

---

### [2026-04-23] DO NOT rename `services/calendar_service.py` to `services/calendar.py`

- **Category:** design-gotcha
- **Severity:** medium

**Why it's tempting:** `_service` suffix feels redundant when inside `services/`.

**Why it's wrong:** Python stdlib has a `calendar` module. If any part of BMO does `import calendar` (stdlib use), having `services/calendar.py` creates ambiguity depending on sys.path. Even with subpackage disambiguation, it's fragile.

**What to do instead:** Keep the `_service` suffix. Same applies to `list_service.py` (builtin `list`), and avoid renaming to any stdlib module name.

---

### [2026-04-23] DO NOT restructure `dnd-app/src/{main,preload,renderer,shared}/`

- **Category:** design-gotcha
- **Severity:** high

**Why it's tempting:** Internal layout inside each process can be improved (feature-based grouping within `renderer/src/components/`, etc.). That's fine. But the TOP-LEVEL `src/main`, `src/preload`, `src/renderer`, `src/shared` — tempting to merge, split, or rename.

**Why it's wrong:** `electron-vite` (the build tool) hardcodes these directory names. Renaming = instant build breakage.

**What to do instead:** Keep the 4 top-level subdirs. Reorganize FREELY inside each of them.

---

# Resolved Issues

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
- **Domain:** dnd-app, bmo
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
- **Commits:** `8e8af3f` (sound_effects.py + tv_controller.py) + follow-up (discord_bot.py)
- **Date resolved:** 2026-04-23
- **Resolution:** All three confirmed orphan (zero importers in runtime, systemd, setup-bmo.sh, MCP config). Archived to `_archive_system_cleanup/bmo/pi/{bots,services}/`. Updated `bmo/pi/README.md` and `bmo/docs/ARCHITECTURE.md` to drop the `discord_bot.py` "common base" line and replaced with the two live bots (`discord_dm_bot.py`, `discord_social_bot.py`). Post-archive sanity: `py_compile` clean; import resolution for `bots.discord_dm_bot`, `bots.discord_social_bot`, `services.tv_worker`, `services.voice_pipeline` still OK.

---

### [2026-04-23] `bmo/docker/` — obsolete laptop → Pi SSH-deploy path

- **Original severity:** high
- **Category:** config, debt
- **Domain:** bmo, infra
- **Resolved by:** Claude Opus
- **Commit:** follow-up to `8e8af3f`
- **Date resolved:** 2026-04-23
- **Resolution:** The entire `bmo/docker/` directory targeted a pre-monorepo "remote Pi" deploy (laptop `scp`/`ssh` → flat `~/bmo/` layout on Pi) that is no longer the workflow — the Pi (this machine) runs directly from the monorepo via `bmo/setup-bmo.sh`, and the Docker containers (`bmo-ollama`, `bmo-peerjs`, `bmo-coturn`, `bmo-pihole`) are started via plain `docker run` in `setup-bmo.sh`, not via `docker-compose.yml`. The dir's systemd units (`bmo.service`, `bmo-backup.service/timer`) target the old path and are not installed on this Pi. `activate-hdmi-audio.sh` is documented as "runs as a user service" but is not registered under `~/.config/systemd/user/`. Whole dir archived to `_archive_system_cleanup/bmo/docker/`. Live docs updated: `bmo/docs/DEPLOY.md`, `bmo/docs/ARCHITECTURE.md`, `bmo/docs/SYSTEMD.md`, `bmo/docs/TROUBLESHOOTING.md`, `docs/COMMANDS.md`, `docs/BACKUP.md`, `bmo/README.md`. Running containers are unaffected (they outlive the config dir).

---

### [2026-04-23] Stale legacy files loose at `/home/patrick/` (pre-monorepo-reorg leftovers)

- **Original severity:** low
- **Category:** debt
- **Domain:** bmo, infra
- **Resolved by:** Claude Opus
- **Commits:** `8e8af3f` (3 identical dupes) + follow-up (4 differing + 3 WiFi scripts + __pycache__)
- **Date resolved:** 2026-04-23
- **Resolution:** Eleven files sat at `$HOME` from Mar 15–19 (pre-reorg). After comparison: none of the "differs from repo" versions had local hotfixes worth extracting — they were simply older snapshots (e.g., `~/app.py` was 5099 lines vs repo's 5504; `~/bmo-kiosk.service` still referenced the pre-rename `/home/patrick/DnD/BMO-setup/` path). All 10 archived to `_archive_system_cleanup/home-dir-pre-reorg/` (the `index.html` "differs from dnd-app" flag was misleading — it was actually an older copy of `bmo/pi/web/templates/index.html`). `/home/patrick/hide-cursor.py` (root-owned, no repo match) left in place — not verified whether it's a live system hook.
