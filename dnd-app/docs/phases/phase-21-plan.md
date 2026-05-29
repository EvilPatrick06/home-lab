# Phase 21 — GitHub & Version Control

## Context

Phase 21 hardens the repo-level workflow surface: `.gitignore`, CI validation, README accuracy, pre-commit hooks, branching convention, and workspace tidiness. The original audit found `.gitignore` solid, commit history clean (Conventional Commits), and a working release workflow, but flagged: no CI gate on PRs/pushes to master, a barebones/inaccurate README, no pre-commit automation, no documented branching strategy, and phase research files cluttering the repo root.

Since the audit, the README has been fully overhauled (269 lines, accurate), phase research files have been relocated to `dnd-app/docs/phases/`, a `docs/CONTRIBUTING.md` was added covering branches + commit style + PR flow, and a `.githooks/pre-commit` shim exists for optional `gitleaks` secret scanning. The remaining live work is the CI validation pipeline (lint + typecheck + test on every push/PR, not only on `v*` tags) and a real lint/typecheck pre-commit hook.

Cross-phase note: any CI gate added here must cover the new test files landing in Phases 29 (permission helper specs), 30 (`game-authority.test.ts`, `p2p-transport.test.ts`, `host-transfer.test.ts`), 31 (shard / diff / applier specs), and 32 (`game_server.py` pytest + Python shard tests).

## Depends on / blocks
- Depends on: none
- Blocks: none (informational coupling with Phases 29-32 for CI coverage)

## Files touched
| Path | Role |
|------|------|
| `.github/workflows/ci.yml` | New PR/push validation workflow (lint + typecheck + test + build smoke) |
| `.github/workflows/release.yml` | Reference only — already runs preflight gates on tag push |
| `dnd-app/package.json` | Add `husky` + (optional) `lint-staged` devDeps, `prepare` script |
| `.husky/pre-commit` | Real lint/typecheck pre-commit hook |
| `.githooks/pre-commit` | Existing gitleaks shim — keep, or fold into `.husky/` flow |
| `dnd-app/README.md` | Reference only — already comprehensive |
| `docs/CONTRIBUTING.md` | Reference only — already documents branches + commit style |

## Sub-phase summary
| # | Sub-phase | Theme |
|---|-----------|-------|
| 21a | CI validation pipeline | Add `.github/workflows/ci.yml` running lint + typecheck + tests on PRs and master pushes |
| 21b | CI build smoke | Extend ci.yml with `electron-vite build` + artifact existence check |
| 21c | Pre-commit hook (Husky) | Install husky + wire `.husky/pre-commit` to run biome + tsc |
| 21d | lint-staged (optional perf) | Scope biome to staged files for sub-3s commits |
| 21e | Verification & cleanup | Confirm completed items still hold; close out |

## Sub-phase details

### 21a — CI validation pipeline
**Files:** `.github/workflows/ci.yml` (new)
**Steps:**
1. Create `.github/workflows/ci.yml` triggered on `push: branches: [master]` and `pull_request: branches: [master]`, scoped to `paths: ['dnd-app/**', '.github/workflows/ci.yml']`. Mirror `.github/workflows/dnd-app-validate-5e.yml:4-17` (working-directory `dnd-app`, Node 22 with `cache: npm` keyed on `dnd-app/package-lock.json`).
2. Add steps: `npm ci`, then `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npm test`. Reuse `check:release` script (`dnd-app/package.json:23`) if convenient.
3. Use `ubuntu-latest`. Windows is reserved for release builds where electron-builder needs it.
**Acceptance:** `.github/workflows/ci.yml` exists; opening a PR or pushing to master triggers a `CI` workflow run; the workflow fails if any gate fails; `bmo/` or `dungeon-scholar/` paths do not trigger this workflow.

### 21b — CI build smoke
**Files:** `.github/workflows/ci.yml`
**Steps:**
1. Append a `Build` step running `npx electron-vite build` after the test step. Catches Vite config/lazy-route/missing-import failures that pure tsc + vitest misses.
2. Append a `Verify build artifacts` step that fails if `out/main/index.js` or `out/renderer/index.html` is missing.
3. Do NOT invoke `electron-builder` here — that's release-only.
**Acceptance:** A PR that breaks the Vite build fails the `CI` workflow at the `Build` step; a PR that deletes `src/main/index.ts` fails at `Verify build artifacts`.

### 21c — Pre-commit hook (Husky)
**Files:** `dnd-app/package.json`, `.husky/pre-commit` (new)
**Steps:**
1. From `dnd-app/`, run `npm install --save-dev husky` and add `"prepare": "husky"` to `dnd-app/package.json` scripts.
2. Create `.husky/pre-commit` at the repo root (git's `.git/` is at the repo root). Content: cd into `dnd-app/`, run `npm run lint -- --staged --no-errors-on-unmatched`, then `npx tsc --noEmit -p tsconfig.web.json`.
3. Decide on `.githooks/pre-commit` (gitleaks shim): either keep both via `git config core.hooksPath` chaining, or merge gitleaks into `.husky/pre-commit`. Document the choice in `docs/CONTRIBUTING.md`.
**Acceptance:** `git commit` on a file with a biome violation aborts; `git commit` on a TS error aborts; `git commit --no-verify` still works as an escape hatch; `npm install` in a fresh clone wires the hook automatically.

### 21d — lint-staged (optional perf)
**Files:** `dnd-app/package.json`, `.husky/pre-commit`
**Steps:**
1. Only undertake if 21c's `tsc --noEmit -p tsconfig.web.json` exceeds ~5s on the dev machine.
2. `npm install --save-dev lint-staged` in `dnd-app/`. Add `"lint-staged": { "src/**/*.{ts,tsx}": ["biome check --write --no-errors-on-unmatched"] }` to `dnd-app/package.json`.
3. Replace the biome step in `.husky/pre-commit` with `cd dnd-app && npx lint-staged`. Keep the `tsc --noEmit` step.
**Acceptance:** A staged file with a biome violation is auto-fixed and re-staged on commit; the pre-commit hook completes faster than the 21c baseline.

### 21e — Verification & cleanup
**Files:** repo-wide
**Steps:**
1. Re-run `ls /home/user/home-lab/` and confirm no `Phase*_*.md` files remain at the repo root or under `dnd-app/`.
2. Re-check `dnd-app/README.md` reflects the current `package.json` scripts.
3. Re-check `docs/CONTRIBUTING.md` covers branches, commit format, PR flow.
4. Open a no-op PR to confirm the new `ci.yml` runs and passes against current `master`.
**Acceptance:** Repo root + `dnd-app/` root are free of `Phase*_*.md`; a clean PR run shows green CI + 5e validate + security audit checks.

## Constraints & edge cases
- **Runner choice:** use `ubuntu-latest`. The two other dnd-app-scoped workflows both run on Ubuntu. Windows is reserved for `electron-builder` packaging.
- **`npm ci`, not `npm install`** in CI for reproducible builds.
- **Path filter:** scope ci.yml to `paths: ['dnd-app/**', '.github/workflows/ci.yml']`.
- **Pre-commit performance:** `tsc --noEmit -p tsconfig.web.json` is the slowest gate (~5-15s). If commits feel sluggish, move typecheck to a `pre-push` hook.
- **Husky lives at the repo root**, not under `dnd-app/`. `.git/` is at `/home/user/home-lab/.git/`. Install husky from `dnd-app/` and point it up, or install at the root and shell into `dnd-app/` from the hook.
- **`.githooks/` collision:** `.githooks/pre-commit` and `.husky/pre-commit` cannot both be active via `core.hooksPath` — pick one chain.
- **`--no-verify` escape hatch:** leave intentionally available. CI is the authoritative gate.
- **Branch protection:** out of scope (GitHub settings change, not code).
- **README "Networking" prose:** defer any rewrite of `dnd-app/README.md:155-179` until Phases 30-32 land.

## Verification
- `ls /home/user/home-lab/.github/workflows/ci.yml` — file exists after 21a.
- Open a draft PR; the `CI` check appears and runs lint/typecheck/test/build.
- Break a TS file locally, try to commit — pre-commit hook blocks (21c).
- Run `git commit --no-verify` on the same file — succeeds (escape hatch intact).
- `ls /home/user/home-lab/.husky/pre-commit` exists and is executable.
- `grep husky /home/user/home-lab/dnd-app/package.json` shows the dep + `prepare` script.

## Completed

> **PHASE 21 COMPLETE (21a–21e) — 2026-05-29.** Full 4-gate green (lint 0, tsc web+node 0, vitest 6491/6491).
> - **21a/21b** — new `.github/workflows/ci.yml`: push/PR to master scoped to `dnd-app/**`, ubuntu-latest, `npm ci` → biome lint → tsc web+node → vitest → `electron-vite build` smoke → artifact existence check (out/main/index.js, out/renderer/index.html). electron-builder stays release-only.
> - **21c** — `husky` devDep + `"prepare": "cd .. && husky dnd-app/.husky"` (monorepo: `.git` is one level above `dnd-app/`). `.husky/pre-commit` runs biome `--staged` + `tsc -p tsconfig.web.json` + optional gitleaks (folded in from the old `.githooks/` shim so a single `core.hooksPath` covers all). `--no-verify` escape hatch intact; CONTRIBUTING documents the hook + .githooks supersession. Installed with `--ignore-scripts` so this session's git config was untouched; a fresh `npm install` wires it.
> - **21d** — intentionally SKIPPED: biome `--staged` already scopes to staged files, and tsc can't be staged-scoped, so lint-staged adds a devDep for marginal auto-fix-and-restage value. Move tsc to a pre-push hook if commits feel slow (documented in CONTRIBUTING).
> - **21e** — verified: no `Phase*_*.md` at repo root or under `dnd-app/`; README script references all resolve to package.json; CONTRIBUTING covers branches + commit format + PR flow + hooks. Step 4 (no-op PR to exercise ci.yml) NOT performed — PRs are out of scope for this cloud session (no PR unless explicitly requested); ci.yml will run on the next real push/PR.

### Pre-existing (earlier-session) stamps
- 21 Step 3 (README rewrite) — DONE (`dnd-app/README.md:1-269`) — comprehensive README covering install, usage, build, test, multiplayer architecture, directory layout, plugin system.
- 21 Step 7 (Branching strategy doc) — DONE (`docs/CONTRIBUTING.md:22-29,42-69,71-89`) — documents branches, conventional commit format, and PR flow.
- 21 Step 8 (Phase research clutter) — DONE — no `Phase*_*.md` at repo root or under `dnd-app/`; all phase docs live under `dnd-app/docs/phases/phase-*.md`.
- 21 Step 9 (Release workflow) — DONE (`.github/workflows/release.yml:1-230`) — full pipeline: preflight, matrix build, electron-builder publish, verify-assets job.
- 21 (.gitignore audit) — DONE (`.gitignore:1-136`) — covers build artifacts, env files, broad secret globs, BMO runtime files, PDF rulebooks, gitignored `docs/SECURITY-LOG.md`.
- 21 (Conventional commits audit) — DONE — commit history follows the documented format.
- 21 (Optional gitleaks pre-commit shim) — DONE (`.githooks/pre-commit:1-8`) — opt-in via `git config core.hooksPath .githooks`; gracefully skips when gitleaks is not installed.
