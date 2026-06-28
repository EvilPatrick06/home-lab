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
