# GitHub Copilot Instructions

> Read automatically by GitHub Copilot (in-editor + PR review).
> See also: `AGENTS.md`, `.cursorrules`.

## Monorepo Layout

```
dnd-app/   Electron VTT (TypeScript, React 19, Vite, biome)
bmo/       Raspberry Pi voice assistant (Python 3.11, Flask, pytest)
_archive/  Quarantined dead code
docs/      Monorepo-wide documentation
```

Two domains. **They never import each other.** They communicate via HTTP (BMO on port 5000, VTT sync receiver on 5001) and Electron IPC (within dnd-app).

## When Completing Code

### TypeScript / React (dnd-app/)

- **Strict TypeScript** — no `any` without comment explaining why
- **Zod schemas** for runtime validation, especially IPC payloads
- **Zustand** for state — stores in `src/renderer/src/stores/`, registered in `register-stores.ts`
- **Colocated tests** — `.test.ts(x)` next to source, vitest
- **Biome** for lint/format — run `npm run lint` before suggesting done
- **No inline imports** — all imports at top of file
- **Exhaustive switch** — `never` fallback for TypeScript discriminated unions
- **Path aliases**: `@renderer/...` for `src/renderer/src/...`, `@data/...` for `src/renderer/public/data/...`

### Python (bmo/)

- **Python 3.11 + type hints** required
- **Subpackage imports**: `from services.calendar_service import X` (never bare `from calendar_service import X`)
- **Never rename `bots/` to `discord/`** — shadows `discord.py` library
- **Pytest** — fixtures in `tests/conftest.py` mock Pi hardware so tests run anywhere
- **Canonical paths** — `/home/patrick/home-lab/bmo/pi/...` always. NEVER `~/bmo/...`

## PR Review Focus

When reviewing PRs, check:

1. **Domain purity** — no `import bmo.*` in dnd-app code, no cross-domain file dependencies
2. **Secrets** — no `.env`, `*.pem`, `credentials.json`, `token.json`, or API key literals
3. **Path hygiene** — all paths are canonical (`/home/patrick/home-lab/bmo/pi/...` or relative to domain root)
4. **Tests added** — new logic has a colocated test (`.test.ts` or `tests/test_*.py`)
5. **Structure respected** — new files placed in correct subpackage/feature folder
6. **Import style** — Python uses subpackage prefix, TS uses path aliases or correct relative
7. **Runtime impact** — does this require systemd restart? Data migration? Schema change?
8. **Docs updated** — if adding a service/agent/channel, update `bmo/docs/SERVICES.md`, `bmo/docs/AGENTS.md`, or `dnd-app/docs/IPC-SURFACE.md` as applicable

## Issue / PR Templates

Issues should reference `docs/ISSUES-LOG.md` if logging a bug. PRs should:
- Link related issue
- Describe what/why (not just what)
- Note any `ISSUES-LOG.md` entries resolved

## Forbidden Patterns

- `from X import Y` where `X` is a BMO submodule (use `from services.X import Y`)
- `os.path.expanduser("~/bmo/...")` — paths go through `~/home-lab/bmo/pi/...`
- Committing files matching `**/.env`, `**/credentials.json`, `**/token.json`, `**/*.pem`
- `import * as X` in TypeScript (prefer named imports)
- `let` where `const` works (biome rule)
- New files at `bmo/pi/` root without justification — they go in a subpackage
- New files at `dnd-app/` root without justification — configs only

## Encouraged Patterns

- Small focused PRs (`<500` line diff when possible)
- Explicit return types on exported functions
- Zod runtime validation at trust boundaries (IPC, HTTP, file reads)
- Log **unfixed or deferred** work to `docs/ISSUES-LOG.md` (read `docs/LOG-INSTRUCTIONS.md` for the template + "log vs fix inline" decision rule). Rule of thumb: if you're fixing it in this PR, don't log it — the commit is the record. If it's out of scope, log it even if minor.
- Add a pytest/vitest case for each bug fix (regression prevention)
- Use conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`

## Reference

Full guidance: `AGENTS.md` and `CLAUDE.md`.
Structure detail: `.cursorrules`.
Protocol: `docs/ARCHITECTURE.md`.
