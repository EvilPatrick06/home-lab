# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-22] Root `.editorconfig` only configures `[*.sh]` — no shared editor baseline for the TS/JS/Py/JSON that dominate the repo

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
The repo-root `.editorconfig` declares `root = true` and exactly one section, `[*.sh]` (charset + final newline — added narrowly to stop a shell-script BOM, per `BMO-RESOLVED-ISSUES.md`). EditorConfig is the one config mechanism that cascades to *every* subdirectory and every editor automatically, so it is the natural place for a monorepo-wide baseline — yet it covers none of the languages that actually make up the tree: by tracked-file count the repo is ~3077 JSON, ~1323 TS, ~731 TSX, ~202 PY, ~190 MD, ~106 JS. That baseline matters more here than in a normal repo because the per-project linting is uneven: `dnd-app` ships `biome.json`, but `dungeon-scholar` and `oracle-worker` have no linter/formatter at all (logged separately), and `bmo` is Python. A shared `.editorconfig` covering indent style/size, `charset = utf-8`, `insert_final_newline`, and `trim_trailing_whitespace` for `[*.{ts,tsx,js,jsx,mjs,json,py,md}]` would give all four projects a consistent floor regardless of which (if any) linter each one runs — and costs nothing to add.

**Hypothesis / root cause:** the file was created reactively for a single shell-script fix and never grown into a real cross-project baseline.

**Proposed fix / improvement:**
- [ ] Add language sections to `.editorconfig` (`[*.{ts,tsx,js,jsx,mjs}]`, `[*.{json}]`, `[*.py]`, `[*.md]`) with indent + charset + final-newline + trim-trailing-whitespace, keeping the existing `[*.sh]` rules.
- [ ] Keep settings aligned with `dnd-app/biome.json` so the two don't fight where they overlap.

**Related files:** `.editorconfig`, `dnd-app/biome.json`

### [2026-06-22] `docs/RULES-RETRIEVAL.md` — a genuinely dual-domain (dnd-app + bmo) reference — is missing from the README "Docs index"

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`docs/RULES-RETRIEVAL.md` is, by its own header, "the authoritative reference for the retrieval stack across **both** engines: the TypeScript one in `dnd-app/src/main/ai/` and its Python twin in `bmo/pi/services/rag_search.py`." That makes it one of the few docs that legitimately belongs at the repo-root `docs/` (it spans two domains, unlike `docs/OLLAMA-TUNING.md` / `docs/PLUGIN-SYSTEM.md`, which are dnd-app-only — those are covered by a separate entry). Yet it appears **nowhere** in the README "Docs index" (neither the "Architecture & deep dives" list at lines ~91-100 nor the project-doc lists), and is referenced only by a completed phase doc (`dnd-app/docs/phases/completed/PHASE-24-rules-rag-hybrid.md`) and by `docs/OLLAMA-TUNING.md`. A contributor or agent browsing the README cannot discover the canonical cross-engine retrieval reference, increasing the odds the TS and Python implementations drift without anyone consulting the shared spec.

**Hypothesis / root cause:** the doc was added in PHASE-24 but never wired into the README index when it landed.

**Proposed fix / improvement:**
- [ ] Add `docs/RULES-RETRIEVAL.md` to the README "Docs index" (it sits naturally alongside `ARCHITECTURE.md` / `DATA-FLOW.md` as a cross-engine architecture doc).
- [ ] While editing the index, sweep `docs/` for any other unlinked cross-project docs so the index stays a complete map of repo-root `docs/`.

**Related files:** `README.md` (Docs index, ~lines 91-100), `docs/RULES-RETRIEVAL.md`
### [2026-06-22] No `.github/dependabot.yml` — version-update coverage is implicit/incomplete despite a documented integrator Dependabot workflow

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
The repo has **no** `.github/dependabot.yml` anywhere (searched repo-wide), yet `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 3.B gives the daily `integrator` a whole Dependabot-PR review/merge process, and merged Dependabot PRs already exist in history (e.g. `dependabot/pip/bmo/pi/...`, PR #17). Without a config file, Dependabot only opens *security* update PRs (enabled via repo settings); scheduled *version* updates require the config. So routine version bumps are not guaranteed across the repo's ecosystems — npm in three dirs (`dnd-app/`, `dungeon-scholar/`, `oracle-worker/`), pip in `bmo/pi/` (which uses pip-tools `requirements*.in/.txt`), and `github-actions` (the workflows pin `actions/setup-node@v6`, `actions/setup-python@v6`, etc.). The result is uneven dependency freshness across all projects and a documented integrator process whose input is only partially configured.

**Hypothesis / root cause:** security updates were turned on in repo settings and have been sufficient so far; nobody added an explicit version-update config as projects multiplied.

**Proposed fix / improvement:**
- [ ] Add `.github/dependabot.yml` with `package-ecosystem` entries for each path: `npm` (`/dnd-app`, `/dungeon-scholar`, `/oracle-worker`), `pip` (`/bmo/pi`), and `github-actions` (`/`), with a sensible schedule and grouping; respect bmo's pip-tools lockfile flow (`requirements.in` is the edit surface).
- [ ] OR, if security-only updates are the deliberate policy, document that in `docs/CONTRIBUTING.md` / the integrator doc so the absence of a config is intentional, not an oversight.

**Related files:** `.github/dependabot.yml` (absent), `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (Rule 3.B), `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `bmo/pi/requirements*.in`

### [2026-06-22] Three CI workflows lack a `concurrency` group while six siblings have one — duplicate/superseded runs waste Actions minutes

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
Of the 9 workflows, 6 define a `concurrency:` group (`bmo-deploy`, `bmo-docker-build`, `bmo-pi-pytest`, `codeql`, `deploy`, `release`) but 3 do **not**: `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`. All three trigger on both `push` and `pull_request`, so when a branch with an open PR is pushed, the heavy gates run **twice in parallel** (the dnd-app CI gate is the expensive one: lint → forbidden-patterns → tsc ×2 → full vitest → build → verify). `dnd-app-ci.yml` additionally has **no branch filter on `push`** (only a path filter), so any branch — including the new per-agent `auto/*` worktree branches — that touches `dnd-app/**` triggers a full run, and without `cancel-in-progress` a rapid second push stacks another full run instead of superseding the first. This is pure CI-minute / queue waste and is inconsistent with the 6 workflows that already guard against it.

**Hypothesis / root cause:** `concurrency` was added to the deploy/release/long-running workflows where overlap is obviously harmful, but the everyday push-gated lint/test workflows were never retrofitted; the cost grew after the move to many per-agent `auto/*` branches.

**Proposed fix / improvement:**
- [ ] Add a `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` block to `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, and `security-audit.yml`, matching the convention the other 6 already use.
- [ ] Consider whether `dnd-app-ci.yml`'s unfiltered-branch `push` trigger should also be scoped (the integrator merges via `master`; per-branch full runs may be redundant with the PR-event run).

**Related files:** `.github/workflows/dnd-app-ci.yml`, `.github/workflows/dnd-app-validate-5e.yml`, `.github/workflows/security-audit.yml`

### [2026-06-22] Root `.editorconfig` is a near-empty `*.sh`-only stub — misses an editor-agnostic baseline for all four code areas

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
The repo-root `.editorconfig` declares `root = true` but contains only a single `[*.sh]` block (`charset = utf-8`, `insert_final_newline = true`) — it was added narrowly to stop a shell-script BOM regression (see `BMO-RESOLVED-ISSUES.md`). EditorConfig is the one editor-agnostic, no-dependency way to enforce baseline whitespace/charset/final-newline rules consistently across the whole monorepo — TS/React (`dnd-app`, `oracle-worker`), React (`dungeon-scholar`, which ships **no** linter or `.editorconfig` of its own — see `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`), Python (`bmo/pi`), plus JSON/Markdown/YAML across all of them. Today only shell files get any shared editor baseline; everything else relies on each project's own (and in dungeon-scholar's case absent) tooling, so indentation/charset/trailing-whitespace drift across projects has nothing catching it before commit.

**Hypothesis / root cause:** the file was created for one narrow shell-BOM fix and never broadened into the cross-project baseline EditorConfig is designed to be.

**Proposed fix / improvement:**
- [ ] Expand root `.editorconfig` with a `[*]` default (`charset = utf-8`, `insert_final_newline = true`, `trim_trailing_whitespace = true`, `end_of_line = lf`) and per-type indent rules (`[*.{ts,tsx,js,jsx,json,yml,yaml}]` 2-space, `[*.py]` 4-space, `[*.md] trim_trailing_whitespace = false`).
- [ ] Keep it advisory/non-blocking — it complements, not replaces, each project's linter; it just gives a shared floor (especially useful for dungeon-scholar, which has none).

**Related files:** `.editorconfig`, `dnd-app/biome.json`, `dungeon-scholar/` (no linter), `bmo/pi/`, `oracle-worker/`

### [2026-06-22] No repo-root task runner and inconsistent npm-script vocabulary across the three JS projects

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI/tooling review.

**Description:**
There is no single entry point to lint/typecheck/test/build the monorepo: no root `Makefile`, `justfile`, `Taskfile`, or root `package.json` (the root `node_modules/` is just a stray Vite cache — see the existing entry). Each area is driven by its own per-project commands, and the npm-script names are inconsistent: `dnd-app` exposes a rich, well-named set (`lint`, `lint:fix`, `format`, `test`, `test:coverage`, `circular`, `check:full`, ...); `dungeon-scholar` exposes only `dev`/`build`/`preview`/`test`/`test:watch` (no `lint`, `format`, or `typecheck`); `oracle-worker` exposes only `test`; bmo runs via `pytest` (`bmo/pi/pytest.ini`). So a contributor (or the integrator, when it wants a quick "is everything green" pass) has to remember a different command surface per project, and there is no one command that runs the whole repo's checks. A tiny root `Makefile`/`justfile` that fans out to each project's existing commands — plus a shared minimum script vocabulary (`lint`, `typecheck`, `test`, `build`) implemented in each JS `package.json` — would give uniform muscle memory and a single CI-mirroring local command, **without** needing a real npm workspace (which the root-`node_modules` entry deliberately avoids).

**Proposed fix / improvement:**
- [ ] Add a root `Makefile` or `justfile` with targets like `test`, `lint`, `build` that delegate to `dnd-app` / `dungeon-scholar` / `oracle-worker` (npm) and `bmo/pi` (pytest).
- [ ] Standardize a common script vocabulary (`lint`, `typecheck`, `test`, `build`) across the three JS `package.json` files so the root targets are uniform (depends on dungeon-scholar gaining a linter — see related entry).
- [ ] Document the root commands in `README.md` / `docs/CONTRIBUTING.md` as the canonical "run everything" entry point.

**Related entries:** root `node_modules/` (no root workspace) entry above; dungeon-scholar missing-linter entry in `docs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`.

**Related files:** `README.md`, `docs/CONTRIBUTING.md`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `bmo/pi/pytest.ini`
