# GEMINI.md

> Read automatically by Gemini CLI / Gemini Code Assist.
> General project instructions: `AGENTS.md`. Structure map: `.cursorrules`.

## Project Summary

Monorepo containing:

- **`dnd-app/`** — Electron VTT for D&D 5e games (TypeScript + React 19 + Vite).
- **`bmo/`** — Raspberry Pi voice assistant (Python 3.11 Flask, 41 modular AI agents, Discord bots, smart home).

Both run on the same Pi 5 currently, communicate via HTTP (`bmo:5000`, `vtt:5001`).

## Gemini-Specific Notes

### Context window strategy

Gemini has a large context window. Use it:
- Read `.cursorrules` + `AGENTS.md` + relevant domain READMEs in one batch at start
- Pull in up to 10 related files when investigating a change
- Keep `docs/ISSUES-LOG.md` in context for multi-step work

### When generating code

- **TypeScript** — strict mode on. Don't use `any`. Prefer zod for runtime validation.
- **Python** — type hints required. Match existing file style (Ruff/Black implied).
- **Match naming**: kebab-case for TS/TSX files, snake_case for Python, kebab-case for CLI scripts.
- **Co-locate tests**: `.test.ts(x)` next to source for TS, pytest in `bmo/pi/tests/` for Python.

### Code review focus

When reviewing proposed changes, prioritize:
1. Does it respect domain boundaries? (`dnd-app/` ↛ `bmo/` imports, communicate only via HTTP)
2. Does it add secrets? Check `.gitignore` catches everything sensitive.
3. Does it break running BMO services? (paths, imports, systemd integration)
4. Does it respect the feature-based structure? (new files in right subpackage)
5. Is there a test? (especially for new logic)

### Structure enforcement

Before suggesting file creation, verify:
- dnd-app TS/TSX files go in `dnd-app/src/renderer/src/{components,services,stores,...}/<feature>/`
- dnd-app main process files go in `dnd-app/src/main/{ai,ipc,storage,plugins,...}/`
- BMO Python service files go in `bmo/pi/services/`
- BMO agents go in `bmo/pi/agents/` (one file = one agent)
- BMO hardware drivers go in `bmo/pi/hardware/`
- BMO Discord bots go in `bmo/pi/bots/` (NOT `discord/`)
- BMO tests go in `bmo/pi/tests/`

### Known naming conflicts

- `discord` → use `bots/` for our code (shadows `discord.py` library otherwise)
- `calendar` → keep `services/calendar_service.py` (shadows Python stdlib `calendar` otherwise)
- `list` → avoid as module name (Python builtin)

### Commit conventions

Imperative mood, 72-char summary:
```
refactor: consolidate BMO data to canonical path
fix: re-authorize Google OAuth after token expiration
feat: add AI mutation approval panel to dnd-app
chore: harden .gitignore patterns
```

Types: `feat, fix, refactor, chore, docs, test, perf, build, ci`

### If you find bugs / ideas / debt

The log is for **unfixed or deferred** work:

- **Fixing it in this session?** → Just fix it. The commit is the record. Do NOT log.
- **Out of scope / can't fix now?** → APPEND to `docs/ISSUES-LOG.md`. Log even minor out-of-scope items.
- **Unsure?** → See "The decision rule" at the top of `docs/LOG-INSTRUCTIONS.md`.

Read `docs/LOG-INSTRUCTIONS.md` before your first log append for the template + "log vs fix inline" examples. Don't silently fix outside scope — but also don't log what you're fixing right now.

### Key files to reference often

| When working on... | Read first |
|---|---|
| Repo structure | `.cursorrules` |
| Cross-domain protocol | `docs/ARCHITECTURE.md` |
| IPC channels | `dnd-app/docs/IPC-SURFACE.md` |
| BMO services | `bmo/docs/SERVICES.md` |
| BMO agents | `bmo/docs/AGENTS.md` |
| Bugs / debt | `docs/ISSUES-LOG.md` |
| BMO troubleshooting | `bmo/docs/TROUBLESHOOTING.md` |
| Running the app | `docs/COMMANDS.md` |
| Terms (beginner) | `docs/GLOSSARY.md` |
