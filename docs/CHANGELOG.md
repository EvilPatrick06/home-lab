# Changelog

All notable changes to this project.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates in ISO 8601.

> Releases are cut per dnd-app; bmo + dungeon-scholar changes ride along under whichever cut shipped them. See the v2.0.0 reorg section at the bottom for the pre-release history.

## dnd-app v2.1.16 — 2026-05-17

Field-bug bundle from v2.1.14/15 testing.

- **PeerJS forceRelay default → false.** Same-LAN joins were silently failing because `iceTransportPolicy='relay'` blocked direct + STUN candidates and no TURN was reachable. Default now `'all'`; cloud mode flips relay back on when needed.
- **Hardened "Update & Restart" install path.** Closes all BrowserWindows, waits 250 ms for close handlers + storage writes to drain, then `quitAndInstall`. Should land first try across Win10/11.
- **Auto-check for updates on launch** — opt-in via `settings.autoCheckUpdates`. Reads `settings.json` directly so it works before the renderer is alive.
- **Three auto-update setting checkboxes** in Settings → Updates: `autoDownloadUpdates`, `autoRestartAfterUpdate`, `autoInstallSilent` (NSIS `/S`).
- **BMO Pi auto-discovery fallback** — when bonjour-service's `_bmo._tcp` browse misses (Windows Firewall blocks UDP 5353), fires a direct HTTP probe at `bmo.local:5000/health` after 3 s and broadcasts `BMO_RESOLVED_URL` if it responds.

## dnd-app v2.1.15 — 2026-05-17

Phase 14 (DM View) — audit scored 9/10, three small gaps + audio-sync improvement:

- **14a Quick Map Selector** — DM toolbar dropdown that flips the active map without drilling into Places / portals / fullscreen editor.
- **14b Drawing tools DM gate** — wrapped the drawing-toolbar block in `effectiveIsDM`.
- **14c Floating DM panel in Player view** — bottom-right corner panel with Switch-to-DM / Open Initiative / Next Turn / Pause AI when `isDM && viewMode === 'player'`. Plus **F5 toggles DM ↔ Player view** (DM-only).
- **14d Audio sync for late joiners** — `currentAmbient` ships in full state payload; client hydrates via `playAmbientSound` / `stopAmbient`. PlayerBottomBar shows a `♪ <track>` pill while ambient is playing.

Cleanup: removed `fail2.txt`, `react-185-character-view.txt`, `QA-Report-v2.1.11.md`, and phase-13/14 plan files.

## dnd-app v2.1.14 — 2026-05-17

QA Report (v2.1.11) full bundle — 10 items (Suggestions + Accessibility + Performance):

- **S1** Initiative Tracker "+ Add" disabled when previous row's name is empty.
- **S2** `endInitiative` no longer overrides campaign turn mode.
- **S3** AoE Template live preview overlay on the map while the DM tunes shape/size/direction.
- **S4** Magic tab fills out — Spell Reference, Light Source, Summon Creature, Apply Condition.
- **S5** Treasure Generator surfaces the rolled table.
- **S6** Library Recently Viewed Clear button + `clearRecentlyViewed` store action.
- **S7** Invite-code rotation fix — `loadCampaigns` migrates campaigns missing `inviteCode`.
- **S8** Calendar-change toast in `GameLayout`.
- **S9** Reduced Motion ignored by 3D dice — `DiceOverlay` reads `useAccessibilityStore.reducedMotion` and bypasses the Three.js / cannon-es path entirely.
- **P1** New `host-manager-cycle.test.ts` — 50 start/stop cycles + replay-buffer reset checks.

## dnd-app v2.1.13 — 2026-05-17

Three field-bug fixes + zero-config BMO discovery:

- **`SheetHeader5e` React #185 crash** — same `useSyncExternalStore` anti-pattern as the v2.1.11 ReadyButton crash, this time on the inspiration-transfer selector. Switched to raw array + body filter.
- **Hide invite code for public games** — `LobbyPage` only renders the chip when `campaign.settings.isPrivate === true`.
- **Cleaner join-error messages** — `peer-unavailable` → "No game found…"; timeout → "Found that game but couldn't open a data channel…".
- **Visible installer UI** for `quitAndInstall(false, true)` — silent path had a Windows UAC race.
- **Zero-config BMO Pi discovery** — Pi advertises `_bmo._tcp` via avahi; main process browses it via `bonjour-service` and emits `BMO_RESOLVED_URL` to the renderer.
- **CI: Ollama bundle cached** by upstream tag; saves 5–10 min per Windows release.

## dnd-app v2.1.12 — 2026-05-16/17

Phase 13 (Token System) close-out + ticker crash fix:

- **13c** TokenContextMenu's Apply Condition propagates to GameLayout's `QuickConditionModal` handler with the token's `entityId` preselected.
- **13e** Token ownership indicator — soft-blue ring on tokens the local non-host player controls.
- **13g** `buildTokenStubFromCharacter` factory — HP / AC / movement / darkvision / resistances from a Character5e sheet. 7 unit tests.
- **PixiJS Ticker.remove crash** — guarded 6 unguarded `ticker.remove` sites against destroyed Application.

## dnd-app v2.1.11 — 2026-05-16

Three field-bug hotfixes from v2.1.10:

- **`ReadyButton` React #185** — selector returning a fresh array on every call. Swapped for `s.peers.length`.
- **"Update & Restart" crash** — IPC handler now deferred via `setImmediate` so the IPC reply flushes first.
- **CORS headers on Pi `/api/games*`** — `ACAO=*` + `Allow-Methods` + `Allow-Headers` + OPTIONS preflight short-circuit.

## dnd-app v2.1.7 → v2.1.10 — Phase 29 sub-phases (2026-05-16)

Phase 29 (Multiplayer Overhaul):

- **29g (v2.1.7)** LAN mDNS + Pi registry client + GameList browser. `bonjour-service` for `_dndvtt._tcp`; SSE feed from the Pi; merged card grid with filter/search/sort/hide-full.
- **29h (v2.1.8)** Perf Tier 1 — token-move throttle (~15 Hz), initiative/condition deltas, reconnect resync via per-clientId 500-entry replay buffer.
- **29i (v2.1.9)** Perf Tier 2 — tick-batched send queue, per-peer filter cache.
- **29j (v2.1.10)** Perf Tier 3 — msgpack ± gzip wire codec with capability handshake.

## dnd-app v2.1.4 → v2.1.6 (2026-05-16)

Phase 29 sub-phases 29d → 29f:

- **29d (v2.1.4)** Color uniqueness on `player:color-confirm` + Ready button gate.
- **29e (v2.1.5)** Spectator role end-to-end. Per-role filtering, spectator-cap enforcement, host promote/demote.
- **29f (v2.1.6)** BMO Pi `/api/games*` registry — in-memory directory with 30s/60s-TTL GC + SSE subscriber queues. 20 pytests.

## dnd-app v2.1.3 (2026-05-15)

CI hardening + backlog cleanup:

- `cut.mjs` release helper to keep `package.json` + git tag in lockstep.
- `verify-assets` job hard-fails if any of the 6 expected files is missing.
- 424 TS + 60 lint diagnostics cleared.
- Dependabot sweep: python-multipart, ip-address, vite (dungeon-scholar pinned to ^7), urllib3 2.6.3 → 2.7.0.

## dnd-app v2.1.0 → v2.1.2 (2026-05-15)

Phase 29 sub-phases 29a → 29c. Each silently shipped 0–3 of the 6 expected assets because `package.json` and the tag drifted out of sync — `cut.mjs` in v2.1.3 prevents the recurrence.

- **29a** Invite-code length fix (`INVITE_CODE_LENGTH = 6`) + host displayName modal.
- **29b** Persistent client UUID in `localStorage`, wired through `JoinPayload.clientId`.
- **29c** Public/Private campaign toggle + UUID-keyed ban list (legacy `Set<peerId>` migrated on first save).

## dnd-app v2.0.0 — 2026-04-25

Major: monorepo reorg (`dnd-app/` + `bmo/` + `_archive/` top-level split). See the section below for the full file-by-file move log.

---

## Reorg (2026-04-25 → 2026-05-15) — predates the v2.0.0 cut

### Added
- Comprehensive AI agent instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`)
- Full monorepo documentation: `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, `docs/SETUP.md`, `docs/COMMANDS.md`, `docs/GLOSSARY.md`, `docs/BACKUP.md`, `docs/LOG-INSTRUCTIONS.md`, `docs/BMO-ISSUES-LOG.md`, `docs/ISSUES-LOG-DNDAPP.md`, `docs/BMO-SUGGESTIONS-LOG.md`, `docs/SUGGESTIONS-LOG-DNDAPP.md`
- dnd-app specific docs: `dnd-app/docs/IPC-SURFACE.md`, `dnd-app/docs/PLUGIN-SYSTEM.md`
- BMO-specific docs: `bmo/docs/AGENTS.md`, `bmo/docs/SERVICES.md`, `bmo/docs/TROUBLESHOOTING.md`, `bmo/docs/DEPLOY.md`, `bmo/docs/SYSTEMD.md`
- Process docs: `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, issue + PR templates
- README files at each domain level

### Changed
- **Domain-split issue and suggestion logs:** Replaced monolithic `docs/ISSUES-LOG.md` / `docs/SUGGESTIONS-LOG.md` / `docs/RESOLVED-ISSUES.md` with BMO- and dnd-app-specific files (`BMO-ISSUES-LOG.md`, `ISSUES-LOG-DNDAPP.md`, and matching suggestion + resolved archives). The old three filenames stay as short **redirect stubs** so existing links and bookmarks still resolve; see [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).
- **Restructured monorepo into `dnd-app/` + `bmo/` + `_archive/` top-level split**
- Moved all dnd-app files (src/, scripts/, resources/, Tests→tools/, Phase*.md→docs/phases/, package.json + configs) from repo root into `dnd-app/`
- Renamed `BMO-setup/` → `bmo/`
- Restructured `bmo/pi/` into feature subpackages: `services/`, `hardware/`, `bots/`, `dev/`, `wake/`, `web/`
- Renamed `discord/` → `bots/` to avoid shadowing `discord.py` library
- Consolidated `pi/static/` + `pi/templates/` into `pi/web/`
- Moved test files from `pi/` root to `pi/tests/`
- Reorganized `dnd-app/scripts/` into purpose subdirs (`build/`, `extract/`, `generate/`, `submit/`, `audit/`, `batch-utils/`, `fix/`)
- Kebab-case renamed 30 Phase planning docs (e.g., `Phase13_Kimi.md` → `phase-13-kimi.md`)
- Flask app config updated: `template_folder="web/templates"`, `static_folder="web/static"`
- systemd services use module-style exec for bots: `python -m bots.discord_dm_bot`

### Fixed
- Canonicalized BMO data paths: merged `/home/patrick/bmo/data/` (stale standalone) into `/home/patrick/home-lab/bmo/pi/data/` with mtime-aware rsync
- Rewrote 50+ `~/bmo/...` path references in Python to `~/home-lab/bmo/pi/...`
- Rewrote 124 Python imports across 36 files for new subpackage structure
- systemd service paths updated in `/etc/systemd/system/` for renamed locations
- AWS references scrubbed from tracked files (deleted `buildspec.yml`, `AWS_SETUP_GUIDE.md`, `Tests/TestAudit.md`, `Tests/knip-report.json`; stripped vendor-aws chunk from `electron.vite.config.ts`; removed incidental mentions in `Phase22_ClaudeOpus.md` + `BMO-setup/ARCHITECTURE.md`)

### Removed
- `scripts/fedora-migration/` (12 OS-migration files, no longer needed on Pi)
- `Tests/knip-report.json` (regenerable)
- Root junk archived to `_archive/2026-04-reorg/root-junk/`:
  - `fan_control.py` (dup of `bmo/pi/hardware/`)
  - `fix-imports.js`, `replace-keys.js` (one-shot migrations done)
  - `dxdiag.txt`, `lint-*.txt`, `test-results*.txt` (stale logs)
- `scripts/tmp-refactor-atomic.ts`, `scripts/ultimate-audit-v2.ts`, `scripts/ultimate-audit-v3.ts` (superseded)
- `scripts/complete_excel_skill_review.py` (Win32 COM, not usable on Pi)
- `scripts/pi-deploy/` (duplicate of `bmo/pi/agents/vtt_sync.py`)
- Stray `BMO-setup/pi/bmo.js` + `BMO-setup/pi/index.html` (older dups of canonical `web/static/js/bmo.js` + `web/templates/index.html`)
- Stale parallel `/home/patrick/bmo/` directory (preexisting since pre-OS-migration)
- Untracked `__pycache__/*.pyc` (46 files), `.pytest_cache/` (5 files), runtime state JSONs from git

### Security
- Hardened `.gitignore` with broad glob patterns for `*.pem`, `*.key`, `credentials.json`, `token.json`, OAuth files, env files — applied across entire tree
- Deleted stale copilot branches (`copilot/determine-phase-from-plan-files`, `copilot/organize-files-and-address-issues`) and closed PR #6

---

## [1.9.9] - 2026-04-13 (inherited — pre-reorg)

Last version before the monorepo restructure. Functionality preserved; structure changed.

See `dnd-app/docs/phases/phase-*.md` for per-phase development history prior to this changelog being introduced.
