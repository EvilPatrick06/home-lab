# Changelog

All notable changes to this project.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates in ISO 8601.

## [Unreleased]

### Added
- Comprehensive AI agent instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`)
- Full monorepo documentation: `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, `docs/SETUP.md`, `docs/COMMANDS.md`, `docs/GLOSSARY.md`, `docs/BACKUP.md`, `docs/LOG-INSTRUCTIONS.md`, `docs/ISSUES-LOG.md`
- dnd-app specific docs: `dnd-app/docs/IPC-SURFACE.md`, `dnd-app/docs/PLUGIN-SYSTEM.md`
- BMO-specific docs: `bmo/docs/AGENTS.md`, `bmo/docs/SERVICES.md`, `bmo/docs/TROUBLESHOOTING.md`, `bmo/docs/DEPLOY.md`, `bmo/docs/SYSTEMD.md`
- Process docs: `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, issue + PR templates
- README files at each domain level

### Changed
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
