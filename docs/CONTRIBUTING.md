# Contributing

Solo-project conventions — open to PRs if they fit the direction.

## Before you start

1. Read [`../README.md`](../README.md) — project overview
2. Read [`../.cursorrules`](../.cursorrules) — structure map
3. Read [`../AGENTS.md`](../AGENTS.md) — AI + coding conventions
4. Skim the active logs so you don't re-discover tracked bugs:
   - [`./BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) — bmo bugs / debt
   - [`./ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) — dnd-app bugs / debt
   - [`./ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md) — dungeon-scholar bugs / debt
   - [`./BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) — bmo gotchas / ideas
   - [`./SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) — dnd-app gotchas / ideas
   - [`./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md) — dungeon-scholar gotchas / ideas

## Dev setup

See [`./SETUP.md`](./SETUP.md).

## Branches

- `master` — stable, deployable
- `feature/<short-name>` — new features
- `fix/<short-name>` — bug fixes
- `refactor/<short-name>` — no behavior change
- `chore/<short-name>` — tooling, deps, CI
- `docs/<short-name>` — docs only

**Automated / scheduled agents** (scanners, QA, the phase-maker / phase-executer, the log-resolver, and any other unattended worker) do **not** commit to `master` and do **not** use the `feature/*`-style branches above. Each works on its own `auto/<agent-id>` branch in its own git worktree, pushes that branch, and a single daily **integrator** merges the clean branches into `master` (and reviews Dependabot PRs). See [`./AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md).

## Pre-commit hook (Husky)

The repo-root [Husky](https://typicode.github.io/husky/) pre-commit hook lives at `.husky/pre-commit` and is shared by every project (besides the per-project lint/test steps it runs a repo-wide `gitleaks` secret scan over the whole staged set). Wire it up with a **project-independent** step so it works no matter which subproject you bootstrap:

```sh
make hooks      # points core.hooksPath at .husky (pure git, no npm/husky needed)
```

`make install` runs `make hooks` first, so installing any project wires the hook too. Running `npm install` in `dnd-app/` also wires it (via that project's `prepare` script) — but if you only ever work in `bmo/`, `dungeon-scholar/`, or `oracle-worker/` and never run `npm install` inside `dnd-app/`, run `make hooks` so you still get the hook (including the repo-wide secret scan). The hook (`.husky/pre-commit`):

1. runs Biome on **staged** files for `dnd-app/` and `dungeon-scholar/`, plus the dnd-app renderer typecheck (`tsc --noEmit -p tsconfig.web.json`),
2. pre-flights staged `bmo/pi/` Python (ruff + the no-new-print ratchet) and `oracle-worker/` (npm test), and runs the dungeon-scholar vitest suite when its files are staged,
3. runs `gitleaks protect --staged --redact` if [gitleaks](https://github.com/gitleaks/gitleaks) is on your `PATH` (warns loudly otherwise; the `secret-scan` CI workflow is the authoritative backstop).

Escape hatch: `git commit --no-verify`. CI (`.github/workflows/ci.yml`) is the authoritative gate; the hook is just a fast local pre-flight.

**Note:** Husky's `.husky/` supersedes the older opt-in `.githooks/` gitleaks shim — the gitleaks step is now folded into the Husky hook, so a single `core.hooksPath` (`.husky`) covers everything. Don't also set `core.hooksPath .githooks` (only one can be active). If the typecheck step feels slow, move it to a `pre-push` hook.

CI runs `dnd-app`'s `npm run audit:ci` (production dependencies only, moderate and above), plus Python `bandit` on `bmo/pi/ide_app` (see `.github/workflows/security-audit.yml`). For a full tree including devDependencies (e.g. LangChain used only in extract scripts), run `cd dnd-app && npm run audit:all`.

## Script vocabulary

Each JS project installs independently (no npm workspace); the root `Makefile` fans
out to per-project npm scripts, so the script **names must mean the same thing** in
every `package.json`. Canonical vocabulary:

| Script | Meaning | Must not |
|---|---|---|
| `lint` | Report problems only — no writes (`biome check`). | mutate files |
| `lint:fix` | Lint **and autofix** (`biome check --write`). | — |
| `format` | **Formatting only**, autofixed (`biome format --write`). | apply lint fixes |
| `typecheck` | `tsc --noEmit` for the project (where a tsconfig exists). | emit build output |
| `test` | Run the test suite once, non-watch. | — |
| `build` | Produce the project's build artifact (or a dry-run validation). | — |
| `audit:ci` | Dependency audit at the project's CI threshold. | — |

The key distinction: `format` **never** applies lint autofixes, and `lint:fix` is the
only script that both lints and writes. Previously `dungeon-scholar`'s `format` ran
`biome check --write` (lint + format), so `npm run format` meant something different
there than in `dnd-app`; it has been split into `format` + `lint:fix` to match.
Projects without a surface for a given verb (e.g. `oracle-worker` has no linter) ship a
no-op stub so the Makefile fan-out stays uniform.

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
   cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npm test
   cd bmo/pi && ./venv/bin/python -m pytest
   cd dungeon-scholar && npm test   # only if you touched dungeon-scholar
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
- **File naming:** React component files are **PascalCase** (`CharacterSheet5ePage.tsx`, `ChatPanel.tsx`); non-component files (services, hooks, utils, stores) are **kebab-case** (`use-library-entry.ts`, `combat-resolver.ts`). Match the surrounding directory; biome enforces.
- **Tests colocated:** `foo.test.ts` next to `foo.ts`, vitest.

### React performance (dnd-app/)

`React.memo` is the cheap default for components that meet **any** of these:
- **List items** rendered via `.map()` (e.g., `<SpellCardView>`, `<MagicItemCard5e>`, `<MessageBubble>`). One sibling change re-renders all without memo.
- **Heavy DOM / many children** (`<MonsterStatBlockView>`, `<PlayerHUDOverlay>`).
- **High-frequency render paths** — anything inside the game canvas, character sheet, or chat panel that re-renders on every game-state tick or cursor move.

Wrap with the named-function form so React DevTools still shows the right name:

```ts
import { memo } from 'react'

function MyCard({ item }: Props): JSX.Element { /* ... */ }
export default memo(MyCard)
```

For named exports, keep the `Impl` suffix on the inner function so the memoized name owns the public export:

```ts
function MyRowImpl({ row }: Props): JSX.Element { /* ... */ }
export const MyRow = memo(MyRowImpl)
```

**Pitfall — callback props need `useCallback` upstream.** If a parent passes a fresh closure every render (`onClick={() => doX(id)}`), shallow equality fails and the memo is a no-op. Stabilize callbacks with `useCallback` in the parent OR pass a stable handler keyed on the row id.

**Pitfall — object props need stable references.** If the parent constructs `{...spread, foo: bar}` each render, shallow equality fails. Either memoize the object with `useMemo` upstream or hoist it.

**When NOT to memo:** top-level page components that own most of the store subscriptions — they re-render anyway when the subscribed slices change, and memo just adds equality-check overhead. Memoize their **children**, not the page.

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
- **Running as an automated/scheduled agent?** Follow [`./AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md) — branch `auto/<agent-id>` + worktree, never `master`

## Conduct

Be kind. Be specific. Be willing to be wrong.

## Repo task runner (`make`)

A root `Makefile` provides one uniform entry point that fans out to each
project's own commands (there is no npm workspace — each project installs
independently):

- `make install` — `npm ci` in dnd-app, dungeon-scholar, oracle-worker
- `make lint` / `make typecheck` — dnd-app (biome / tsc)
- `make test` — all three npm projects + `bmo/pi` pytest
- `make build` — dnd-app + dungeon-scholar builds + oracle-worker `wrangler --dry-run`
- `make audit` — npm audit across the JS projects
- `make all` — lint + typecheck + test + build

CI remains the authoritative gate; `make` is a local convenience mirror.

## CI workflow naming convention

Per-project GitHub Actions workflows are named `<project>-<purpose>.yml` so the
workflow list reads as a map of which gate covers which project:

- `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, `dnd-web-deploy.yml`
- `dungeon-scholar-ci.yml`, `dungeon-scholar-deploy.yml`
- `bmo-pi-pytest.yml`, `bmo-docker-build.yml`, `bmo-deploy.yml`
- `oracle-worker-ci.yml`, `oracle-worker-deploy.yml`

Repo-wide workflows that are not scoped to a single project keep a plain,
purpose-only name (`release.yml`, `security-audit.yml`, `codeql.yml`,
`secret-scan.yml`, `agent-docs-check.yml`).

Two intentional spellings worth calling out so they are not "fixed" by drift:

- **`dungeon-scholar-deploy.yml`** is dungeon-scholar's GitHub Pages deploy. It
  was renamed from the GitHub starter filename `deploy.yml` (which falsely
  implied a repo-wide deploy); when adding a Pages deploy elsewhere, do not
  reintroduce a bare `deploy.yml`.
- **`dnd-web-deploy.yml`** keeps the `dnd-web` prefix (not `dnd-app`) on purpose:
  it deploys the dnd-app **web** build specifically, distinct from the Electron
  desktop release cut by `release.yml`. The project directory and its CI
  workflow use the `dnd-app` prefix; this one deliberately does not.

Workflow **`name:` strings are load-bearing**: `workflow_run` consumers
(`bmo-deploy.yml`, `ci-failure-triage.yml`) match against another workflow's
display `name:`, not its filename. Renaming a referenced workflow silently
severs the trigger — GitHub raises no error. `scripts/check-ci-hygiene.sh`
(GUARD 6) now fails CI if a `workflow_run.workflows` entry does not resolve to a
declared `name:`, but keep the coupling in mind when renaming.


## Repo-wide tooling conventions

Shared-tooling decisions that apply across the four code areas. Most are
mechanically guarded by `scripts/check-ci-hygiene.sh` so they cannot drift.

- **Shared config bases.** Lint/format defaults live in root `biome.base.json`
  (every project's `biome.json` extends it); TS compiler defaults live in root
  `tsconfig.base.json` (each project tsconfig extends it and overrides only
  project-specific options — lib/jsx/allowJs/checkJs/strict/types/paths).
  `dnd-app/mobile/tsconfig.json` extends `expo/tsconfig.base` instead, since it
  is the only React Native / Expo project (see mobile-shared-src below).
- **Biome tool version is single-sourced.** The three biome projects pin the
  same `@biomejs/biome` version; the husky hook uses each project's local binary
  rather than a hook-embedded version literal. GUARD 10 asserts the versions
  match, so local pre-commit and CI never lint the same diff with different
  binaries. `biome.base.json` changes must be valid for that pinned version.
- **Node floor.** Root `.nvmrc` is authoritative; every `package.json` (incl.
  `dnd-app/mobile`) declares `"engines": { "node": ">=22" }` matching it.
- **`audit:ci` threshold.** All npm projects — including the internet-facing
  `oracle-worker` and `dnd-app/mobile` — run `npm audit --omit=dev
  --audit-level=moderate`. Do not loosen a project below `moderate`.
- **Tooling-config file extension.** Build/test config files (Vite, Vitest,
  Playwright, PostCSS) are authored in **TypeScript (`.ts`)** — the flagship
  `dnd-app` convention (typed plugin options). `dungeon-scholar` historically
  authored `vite.config.js` / `postcss.config.js` in plain JS; new tooling
  configs should be `.ts`, and the dungeon-scholar configs may be migrated to
  `.ts` when touched. (Decision recorded here rather than doing a bulk rename,
  which would ride along unrelated config churn.)
- **LICENSE copies.** Each package keeps its own `LICENSE` (they are
  independently cloneable). GUARD 9 asserts every `*/LICENSE` is byte-identical
  to the root `LICENSE`; a license/holder change must edit all copies in
  lockstep.

### `dnd-app/mobile` shared-source reuse (long-term approach)

`dnd-app/mobile` type-checks against `dnd-app/src/shared/*` (the bridge
protocol/types) via a **tsconfig path alias** (`@shared/*` → `../src/shared/*`),
not TS project references or a workspace package. This is the deliberate
long-term approach for the current layout: `src/shared` is physically part of
the dnd-app project (compiled by its web/node tsconfigs), and both TS project
references (require a standalone-buildable `composite` project + resolvable
`@msgpack/msgpack` from dnd-app's node_modules, which the mobile CI job does not
install) and a workspace-package extraction (135 relative importers, a
`shared/` name collision with renderer UI components, and no root workspace
tooling) are higher-blast-radius migrations that must be validated by a full
dnd-app build + vitest run. Until that larger migration is undertaken
interactively, the path-mapping is the standard, correct choice — keep it.
