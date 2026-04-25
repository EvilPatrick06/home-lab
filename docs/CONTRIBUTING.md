# Contributing

Solo-project conventions — open to PRs if they fit the direction.

## Before you start

1. Read [`../README.md`](../README.md) — project overview
2. Read [`../.cursorrules`](../.cursorrules) — structure map
3. Read [`../AGENTS.md`](../AGENTS.md) — AI + coding conventions
4. Skim the active logs so you don't re-discover tracked bugs:
   - [`./BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) — bmo bugs / debt
   - [`./ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) — dnd-app bugs / debt
   - [`./BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) — bmo gotchas / ideas
   - [`./SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) — dnd-app gotchas / ideas

## Dev setup

See [`./SETUP.md`](./SETUP.md).

## Branches

- `master` — stable, deployable
- `feature/<short-name>` — new features
- `fix/<short-name>` — bug fixes
- `refactor/<short-name>` — no behavior change
- `chore/<short-name>` — tooling, deps, CI
- `docs/<short-name>` — docs only

## Secret scanning (optional)

To reduce the chance of committing `.env` or keys by mistake, install [gitleaks](https://github.com/gitleaks/gitleaks) and enable repo hooks:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

The hook runs `gitleaks protect --staged --redact` when gitleaks is on your `PATH` (it skips if not installed). CI runs `dnd-app`'s `npm run audit:ci` (production dependencies only, moderate and above), plus Python `bandit` on `bmo/pi/ide_app` (see `.github/workflows/security-audit.yml`). For a full tree including devDependencies (e.g. LangChain used only in extract scripts), run `cd dnd-app && npm run audit:all`.

## Commits

Imperative mood. Summary ≤ 72 chars.

Format:
```
<type>: <summary>

<optional multi-line body explaining why (not what)>

<optional refs>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `build`, `ci`

Good:
```
feat: add AI mutation approval panel for DM review
fix: rotate Google OAuth token after history purge
refactor: move Python services into bmo/pi/services/
```

Bad:
```
updates
WIP
some stuff
```

## PRs

1. Branch off latest `master`
2. Make changes + add tests
3. Run full check before pushing:
   ```bash
   cd dnd-app && npm run lint && npx tsc --noEmit && npm test
   cd bmo/pi && ./venv/bin/python -m pytest
   ```
4. Push branch
5. Open PR with template (`../.github/PULL_REQUEST_TEMPLATE.md`)
6. Describe:
   - **What**: one-line summary
   - **Why**: motivation or linked issue
   - **How tested**: manual steps + test coverage
   - **Screenshots** (for UI changes)
   - **Migration notes** (if path/import/schema changes)

## Code style

### TypeScript (dnd-app/)

- **Strict mode on.** No `any` without `// biome-ignore lint/suspicious/noExplicitAny` + reason.
- **Exported functions** have explicit return types.
- **Prefer `const` over `let`**. `var` is forbidden.
- **Named imports** over `import * as X`.
- **No inline imports** — all imports at top of file.
- **Zod** for runtime validation at trust boundaries (IPC, HTTP, file reads).
- **Exhaustive switch** with `never` fallback:
  ```typescript
  switch (type) {
    case 'a': return ...
    case 'b': return ...
    default:
      const _exhaustive: never = type
      throw new Error(`unhandled: ${_exhaustive}`)
  }
  ```
- **File naming:** kebab-case (e.g., `chat-panel.tsx`, not `ChatPanel.tsx` for files — React components inside are PascalCase).
- **Wait — actually our codebase uses PascalCase for component files** (`CharacterSheet5ePage.tsx`). Match what's there. Biome enforces.
- **Tests colocated:** `foo.test.ts` next to `foo.ts`, vitest.

### Python (bmo/)

- **Python 3.11 + type hints.**
- **snake_case** for files, functions, vars. **PascalCase** for classes.
- **Import subpackages explicitly:** `from services.calendar_service import X`
- **No bare `import X`** for moved modules — always use prefix.
- **Tests** in `bmo/pi/tests/`, pytest.
- **Match existing style** — Ruff/Black implied (no explicit config yet).

## Tests

### When to add tests

- Every new public function / class method
- Every bug fix (regression test)
- Every new IPC handler / HTTP endpoint
- Every new agent / service

### What NOT to test

- Trivial getters / pass-through wrappers
- Third-party library behavior (assume libs tested themselves)
- Exact error message strings (brittle)

### Test naming

```typescript
describe('functionName', () => {
  it('returns X when Y', () => {...})
  it('throws when Z is invalid', () => {...})
})
```

```python
class TestFunctionName:
    def test_returns_x_when_y(self): ...
    def test_raises_when_z_invalid(self): ...
```

## Adding docs

- **User-facing?** Add or update `docs/*.md`
- **Internal architecture?** Add or update `dnd-app/docs/*.md` or `bmo/docs/*.md`
- **Bug / idea / debt found?** Read [`./LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md) — it routes you to the right log per **Domain** + category: bugs go to [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) or [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md); ideas + design-gotchas go to [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) or [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md); security (any domain) goes to [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). `Domain: both` mirrors in BOTH issue or BOTH suggestion logs. Log minor items too.
- **AI agent rules?** Update `../AGENTS.md` (applies to all) or tool-specific file (`../CLAUDE.md`, `../GEMINI.md`, `../.cursorrules`, `../.github/copilot-instructions.md`)

## Commit checklist

Before pushing:

- [ ] `git status` shows only intended files
- [ ] No `.env`, `*.pem`, `credentials.json`, `token.json` in diff
- [ ] Tests pass: `npm test` + `pytest`
- [ ] Lint clean: `npm run lint` + (Python: match existing)
- [ ] Types clean: `npx tsc --noEmit`
- [ ] New code in correct subpackage (`services/`, `hardware/`, `bots/`, etc.)
- [ ] If touched systemd service file → test restart on Pi
- [ ] If touched `requirements.txt` or `package.json` → `pip install -r` / `npm install` done locally
- [ ] Related docs updated (`IPC-SURFACE.md`, `SERVICES.md`, `AGENTS.md`, etc.)
- [ ] If resolved an entry in any active log → moved to the matching domain resolved file (`BMO-RESOLVED-ISSUES.md` for bmo entries; `RESOLVED-ISSUES-DNDAPP.md` for dnd-app entries; `RESOLVED-SECURITY-ISSUES.md` for security) with commit SHA + resolution (per `LOG-INSTRUCTIONS.md`)

## Working with AI assistants

This repo is heavily AI-assisted. Whether you're human or AI:

- Read `../AGENTS.md` + `../.cursorrules` first
- Append findings to the right log per `./LOG-INSTRUCTIONS.md`
- Use the TODO tracker for multi-step tasks
- Small focused PRs > mega-commits

## Conduct

Be kind. Be specific. Be willing to be wrong.
