# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-24] Deploy-workflow filenames don't follow the `<project>-deploy.yml` convention (`deploy.yml` is dungeon-scholar's Pages deploy)

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Cross-cutting scan of `.github/workflows/` filename conventions.

**Description:**
Three of the four deploy workflows are named `<project>-deploy.yml` — `bmo-deploy.yml`, `dnd-web-deploy.yml`, `oracle-worker-deploy.yml` — but dungeon-scholar's GitHub Pages deploy is the unprefixed `deploy.yml` (workflow `name: Deploy Dungeon Scholar to GitHub Pages`; `paths: ['dungeon-scholar/**', '.github/workflows/deploy.yml']`). This breaks the convention two ways: (1) the generic `deploy.yml` name falsely implies a repo-wide deploy when it is dungeon-scholar-specific, and (2) dungeon-scholar already has a correctly-prefixed CI workflow (`dungeon-scholar-ci.yml`), so its deploy counterpart is the only per-project workflow that doesn't share its project prefix — a maintainer scanning the workflow list (or the integrator reasoning about which gate maps to which project) can't tell at a glance that `deploy.yml` is dungeon-scholar's. Secondary, minor: `dnd-web-deploy.yml` uses the `dnd-web` prefix while the project directory and its CI workflow use `dnd-app` (`dnd-app-ci.yml`); defensible since it deploys the dnd-app *web* build specifically, but worth a deliberate decision rather than drift.

**Hypothesis / root cause:** `deploy.yml` predates the per-project workflow-naming convention (it is the GitHub Pages starter filename) and was never renamed when the `<project>-*` convention solidified across the other workflows.

**Proposed fix / improvement:**
- [ ] Rename `.github/workflows/deploy.yml` → `.github/workflows/dungeon-scholar-deploy.yml` (or `dungeon-scholar-pages-deploy.yml`); update its own `paths:` self-reference and any docs/comments naming `deploy.yml`.
- [ ] Decide whether `dnd-web-deploy.yml` should become `dnd-app-web-deploy.yml` for prefix parity, or keep `dnd-web` and document it as intentional.
- [ ] Optional: add a short "workflow naming convention" note to `docs/CONTRIBUTING.md` (or a header comment in `.github/workflows/`) stating per-project workflows use the `<project>-<purpose>.yml` form.

**Related files:** `.github/workflows/deploy.yml`, `.github/workflows/dnd-web-deploy.yml`, `.github/workflows/bmo-deploy.yml`, `.github/workflows/oracle-worker-deploy.yml`, `.github/workflows/dungeon-scholar-ci.yml`, `docs/CONTRIBUTING.md`

**Related entries:** ISSUES-LOG.md [2026-06-24] "Inconsistent `push` branch filters across workflows" — a separate `.github/workflows/` consistency item (branch filters, not filenames).
### [2026-06-24] No `.python-version` analog to `.nvmrc`; Python is pinned inline in CI and the two pins disagree (3.11 vs 3.12)

- **Category:** config, portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting scan of shared CI/toolchain version pinning (compared Node `.nvmrc` wiring against Python pinning).

**Description:**
Node is pinned repo-wide by a single source of truth: `.nvmrc` (`22`), and **every** Node workflow reads it via `actions/setup-node` `node-version-file: .nvmrc` (dnd-app-ci, dungeon-scholar-ci, oracle-worker-ci/-deploy, security-audit, release, deploy, dnd-web-deploy, dnd-app-validate-5e). Python has no equivalent. The Python version is hardcoded inline in each workflow, and the two pins **disagree**: `bmo-pi-pytest.yml` sets `python-version: '3.11'` while `security-audit.yml` sets `python-version: "3.12"`. There is no `.python-version` (root, `bmo/`, or `bmo/pi/`) and no `pyproject.toml`/`requires-python` to anchor the version, so the local dev Python, the pytest CI Python, and the security-audit Python can all drift independently. bmo/pi is therefore unit-tested on 3.11 but dependency-audited on 3.12, and nothing enforces that either matches what a contributor runs locally.

**Hypothesis / root cause:** Node pinning was centralized onto `.nvmrc` but the equivalent step for Python was never taken; the two workflows that need Python each grew their own literal, and they were edited at different times to different values.

**Proposed fix / improvement:**
- [ ] Add a single source of truth for the Python version (`.python-version` at `bmo/pi/`, or `requires-python` in a `bmo/pi/pyproject.toml`).
- [ ] Point both `bmo-pi-pytest.yml` and `security-audit.yml` at it via `setup-python`'s `python-version-file:` so they can't disagree.
- [ ] Decide the one canonical version (3.11 vs 3.12) and reconcile — confirm `bmo/pi` actually runs on it (a prior note in `BMO-RESOLVED-ISSUES.md` states the tracked sources compile cleanly under 3.11).

**Related files:** `.github/workflows/bmo-pi-pytest.yml`, `.github/workflows/security-audit.yml`, `.nvmrc` (the pattern to mirror), `bmo/pi/` (no `pyproject.toml`/`.python-version` today)

---

### [2026-06-24] Repo-wide pre-commit hook (incl. the gitleaks secret scan) is only bootstrapped by installing `dnd-app/` deps — contributors who only touch bmo / dungeon-scholar / oracle-worker get no hook at all

- **Category:** portability, UX
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting scan of the shared `.husky/pre-commit` hook and how it gets installed across the four projects.

**Description:**
The single repo-root `.husky/pre-commit` hook is shared infrastructure — besides the dnd-app/dungeon-scholar Biome+test steps it also runs a repo-wide **gitleaks secret scan** over the whole staged set. But the only thing that installs the hook is `dnd-app/package.json`'s `"prepare": "cd .. && husky .husky"`; `dungeon-scholar`, `oracle-worker`, and `bmo` have no `prepare`/husky wiring. `docs/CONTRIBUTING.md` confirms this by design ("Running `npm install` in `dnd-app/` wires a Husky pre-commit hook"). Consequence: a contributor who clones the repo and only ever installs/works in **bmo** (Python), **dungeon-scholar**, or **oracle-worker** — never running `npm install` inside `dnd-app/` — gets **no pre-commit hook installed at all**, including the repo-wide secret scan. The secret-scan gap is security-adjacent (a resolver may want to route that aspect to the security log). Secondary, smaller gap: even when the hook *is* installed, its body only gates `dnd-app/` and `dungeon-scholar/` staged paths — a bmo-only (ruff/pytest) or oracle-worker-only staged commit gets only the global gitleaks step, no project lint/test pre-flight.

**Hypothesis / root cause:** Husky bootstrapping was added when dnd-app was the primary/only JS project, so the `prepare` script naturally lived there; as bmo, dungeon-scholar, and oracle-worker were added, the hook body was extended but the *install trigger* was never made project-independent.

**Proposed fix / improvement:**
- [ ] Make hook installation independent of which project you install — e.g. a `make install`/`make hooks` step (or a tiny root-level `prepare`) that runs `husky .husky` / sets `core.hooksPath .husky` regardless of which subproject a contributor bootstraps, and document it in `CONTRIBUTING.md` / `SETUP.md`.
- [ ] Optionally extend the hook body to also pre-flight `bmo/pi` (ruff) and `oracle-worker` staged changes for parity with the dnd-app/dungeon-scholar blocks.
- [ ] Consider whether the gitleaks secret scan deserves a guaranteed install path (security-adjacent) rather than riding on a dnd-app `npm install`.

**Related files:** `.husky/pre-commit`, `dnd-app/package.json` (`prepare` script), `dungeon-scholar/package.json` + `oracle-worker/package.json` (no `prepare`), `docs/CONTRIBUTING.md`, `Makefile`

---

_No open cross-cutting suggestions other than those listed above._
