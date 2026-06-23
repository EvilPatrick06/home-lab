# GEMINI.md

> Read automatically by Gemini CLI / Gemini Code Assist.
> General project instructions: `AGENTS.md`. Structure map: `.cursorrules`.

## Project Summary

Monorepo containing:

- **`dnd-app/`** — Electron VTT for D&D 5e games (TypeScript + React 19 + Vite). Runs on player/DM laptops.
- **`bmo/`** — Raspberry Pi voice assistant (Python 3.11 Flask, 5 AI agents, Discord bots, smart home). Runs 24/7 on the Pi 5.
- **`dungeon-scholar/`** — Web study app (Vite + React + Vitest), deployed to GitHub Pages. Independent of the other two.
- **`oracle-worker/`** — Cloudflare Worker backing dungeon-scholar’s Oracle (AI grading/chat) proxy. Deployed to the Cloudflare edge.

`dnd-app` and `bmo` communicate via HTTP (`bmo:5000`, `vtt:5001`).

## Gemini-Specific Notes

### Context window strategy

Gemini has a large context window. Use it:
- Read `.cursorrules` + `AGENTS.md` + relevant domain READMEs in one batch at start
- Pull in up to 10 related files when investigating a change
- Keep the consolidated backlog + active logs in context for multi-step work — `dnd-app/docs/phases/PHASE-INDEX.md` (backlog phase set, all domains, 2026-06-11), `docs/BMO-ISSUES-LOG.md` (bmo), `docs/ISSUES-LOG-DNDAPP.md` (dnd-app), `docs/BMO-SUGGESTIONS-LOG.md`, `docs/SUGGESTIONS-LOG-DNDAPP.md`, `docs/SECURITY-LOG.md` (global, gitignored)

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

### Automated-agent git workflow

If you are running as an **automated/scheduled agent** (scanner, QA, phase-maker, phase-executer, log-resolver, etc.), do **not** commit to `master`. Work on `auto/<agent-id>` in your own git worktree (`git worktree add /home/patrick/home-lab-trees/<agent-id> -B auto/<agent-id> origin/master`), commit there, and `git push -u origin auto/<agent-id>`. Never touch master's working tree, never rebase shared state, never force-push another agent's branch. A daily integrator merges clean branches into `master` and reviews Dependabot PRs. Humans / interactive sessions may still use `master` directly. Full spec: [`docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`](docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

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
- **Out of scope / can't fix now?** → APPEND to the right log per **Domain**:
  - dnd-app bug/debt → `docs/ISSUES-LOG-DNDAPP.md`
  - bmo bug/debt → `docs/BMO-ISSUES-LOG.md`
  - both-domain bug/debt → mirror in BOTH `docs/BMO-ISSUES-LOG.md` AND `docs/ISSUES-LOG-DNDAPP.md`
  - bmo idea / design-gotcha / info → `docs/BMO-SUGGESTIONS-LOG.md`
  - dnd-app idea / design-gotcha / info → `docs/SUGGESTIONS-LOG-DNDAPP.md`
  - both-domain idea / design-gotcha / info → mirror in BOTH suggestions logs
  - security (any domain) → `docs/SECURITY-LOG.md` (gitignored)
  Log even minor out-of-scope items.
- **Unsure?** → See "The decision rule" at the top of `docs/LOG-INSTRUCTIONS.md`.

Read `docs/LOG-INSTRUCTIONS.md` before your first log append for the template + "log vs fix inline" examples. Don't silently fix outside scope — but also don't log what you're fixing right now.

### Key files to reference often

| When working on... | Read first |
|---|---|
| Repo structure | `.cursorrules` |
| Open backlog (all domains) | `dnd-app/docs/phases/PHASE-INDEX.md` |
| Cross-domain protocol | `docs/ARCHITECTURE.md` |
| IPC channels | `dnd-app/docs/IPC-SURFACE.md` |
| BMO services | `bmo/docs/SERVICES.md` |
| BMO agents | `bmo/docs/AGENTS.md` |
| Bugs / debt — bmo | `docs/BMO-ISSUES-LOG.md` |
| Bugs / debt — dnd-app | `docs/ISSUES-LOG-DNDAPP.md` |
| Future ideas / design gotchas — bmo | `docs/BMO-SUGGESTIONS-LOG.md` |
| Future ideas / design gotchas — dnd-app | `docs/SUGGESTIONS-LOG-DNDAPP.md` |
| Security concerns / incidents (any domain) | `docs/SECURITY-LOG.md` *(gitignored)* |
| Resolved bmo entries | `docs/BMO-RESOLVED-ISSUES.md` |
| Resolved dnd-app entries | `docs/RESOLVED-ISSUES-DNDAPP.md` |
| Where-to-log triage | `docs/LOG-INSTRUCTIONS.md` |
| Automated-agent git workflow | `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` |
| BMO troubleshooting | `bmo/docs/TROUBLESHOOTING.md` |
| Running the app | `docs/COMMANDS.md` |
| Terms (beginner) | `docs/GLOSSARY.md` |
