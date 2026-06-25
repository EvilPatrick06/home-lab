# Issues log (split by domain)

This file is a **compatibility pointer**. Active bugs and tech debt are logged in three places by domain:

- **BMO** (Pi, Discord bots, voice, agents): [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
- **dnd-app** (Electron VTT, 5e data): [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
- **dungeon-scholar** (Vite/React study app, Supabase): [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)

`Domain: both` items are **mirrored in both** logs — fix once, remove from both.

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

# Cross-cutting issues (logged here by overall-errors scanner)

> Repo-wide / multi-project findings. Per the domain-split triage in `LOG-INSTRUCTIONS.md` these are `Domain: both`; recorded here in the compatibility-pointer log.


### [2026-06-24] Per-domain `DESIGN-CONSTRAINTS.md` files lack the `merge=union` driver despite being designated automated-agent append targets

- **Category:** config, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** Cross-cutting scan of shared logging/merge wiring (`.gitattributes` vs `docs/LOG-INSTRUCTIONS.md`).

**Description:**
`docs/LOG-INSTRUCTIONS.md` routes `design-gotcha` / `info` (durable-knowledge) entries — written by "every AI agent", explicitly including automated/scheduled agents on their `auto/<agent-id>` branches — to the three per-domain `bmo/docs/DESIGN-CONSTRAINTS.md`, `dnd-app/docs/DESIGN-CONSTRAINTS.md`, and `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md` files. But `/.gitattributes` only applies `merge=union` to the `docs/logs/*` log files; the three `DESIGN-CONSTRAINTS.md` files are `merge: unspecified`. So concurrent appends to the same constraints doc from parallel `auto/*` branches will produce a real merge **conflict** at integration time — exactly the failure mode union-merge was introduced to prevent (see `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 2, "Why this exists"). The append-only logs are protected; this sibling class of append-only docs is not.

**Reproduction:**
1. `git check-attr merge bmo/docs/DESIGN-CONSTRAINTS.md` → `merge: unspecified` (logs return `merge: union`).
2. Two `auto/*` branches each append a new entry to the bottom of the same `DESIGN-CONSTRAINTS.md`.
3. Integrator merges both → conflict on that file (no union driver to combine the appends).

**Expected behavior:** Appends to the designated automated-agent knowledge docs auto-merge like the logs do.

**Hypothesis / root cause:** When the union-merge globs were added/migrated (`.gitattributes` "Append-only log docs" block, 2026-06-23), the `DESIGN-CONSTRAINTS.md` files — which `LOG-INSTRUCTIONS.md` only later/separately designated as the home for `design-gotcha`/`info` knowledge — were not added to the glob set.

**Proposed fix / improvement:**
- [ ] Add a `merge=union` glob covering the three constraints docs to `/.gitattributes` (e.g. `**/docs/DESIGN-CONSTRAINTS.md merge=union`, or list each path).
- [ ] Confirm with `git check-attr merge <path>` for all three.
- [ ] Note in `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 2's coverage table that DESIGN-CONSTRAINTS docs are union-merged too.

**Related files:** `.gitattributes`, `bmo/docs/DESIGN-CONSTRAINTS.md`, `dnd-app/docs/DESIGN-CONSTRAINTS.md`, `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`, `docs/LOG-INSTRUCTIONS.md`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

---

### [2026-06-24] Shared husky pre-commit hook gates only 2 of 4 projects (no local pre-flight for `bmo/pi` or `oracle-worker`)

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** Cross-cutting review of shared tooling (`.husky/pre-commit`).

**Description:**
`.husky/pre-commit` runs per-project gates for `dnd-app/` (biome `--staged` + `tsc` web typecheck) and `dungeon-scholar/` (biome `--staged` + vitest), plus a global gitleaks secret scan. It runs **no** local pre-flight for `bmo/pi/` (which has CI gates `ruff check`, the `print()` ratchet, and pytest) or for `oracle-worker/` (which has CI build + test). A staged-only change to those two projects gets no local lint/test feedback and relies entirely on CI. The asymmetry is a shared-tooling consistency gap: two projects get a fast local floor, two don't.

**Hypothesis / root cause:** The hook grew project-by-project (dnd-app first, dungeon-scholar folded in later); `bmo/pi` (ruff/pytest) and `oracle-worker` were never added because "CI is authoritative" (stated in the hook header).

**Proposed fix / improvement:**
- [ ] Add a `bmo/pi/` block: when `bmo/pi/**/*.py` is staged, run `ruff check` on staged files (+ optionally `bmo/pi/scripts/check-no-new-prints.sh`).
- [ ] Add an `oracle-worker/` block: when `oracle-worker/**` is staged, run its `npm test` (fast).
- [ ] Or explicitly document the two-project scope as intentional if local parity is not wanted.

**Related files:** `.husky/pre-commit`, `bmo/pi/ruff.toml`, `bmo/pi/scripts/check-no-new-prints.sh`, `oracle-worker/package.json`

---

### [2026-06-24] Inconsistent `push` branch filters across workflows (`[master, main]` vs `[main, master]` vs `[master]`) — latent default-branch-rename gotcha

- **Category:** config
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** Cross-cutting CI/GitHub-Actions review.

**Description:**
The repo's default branch is `master` (no `main` branch exists). Across the workflows, the `push` branch filter is written three different ways: `branches: [master, main]` (`bmo-docker-build.yml`, `bmo-pi-pytest.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`), `branches: [main, master]` (`deploy.yml`), and `branches: [master]` only (`codeql.yml`, `dnd-web-deploy.yml`). The `main` entries are harmless dead config today, but the inconsistency hides a latent gotcha: if the default branch were ever renamed to `main`, the `[master]`-only workflows (CodeQL security scanning and the dnd-web deploy) would silently stop triggering on push, while the others would keep working — a partial, hard-to-notice CI outage.

**Hypothesis / root cause:** Workflows authored at different times with no shared convention for the push branch list.

**Proposed fix / improvement:**
- [ ] Pick one convention and apply it to every workflow's `push.branches` (recommend `[master]` to match the actual default, or `[master, main]` everywhere if a future rename is anticipated).
- [ ] Optionally add a tiny CI/lint check (or extend `agent-docs-check`-style drift guard) asserting all workflow push branch filters match.

**Related files:** `.github/workflows/codeql.yml`, `.github/workflows/dnd-web-deploy.yml`, `.github/workflows/deploy.yml`, `.github/workflows/bmo-pi-pytest.yml`, `.github/workflows/security-audit.yml`, `.github/workflows/bmo-docker-build.yml`, `.github/workflows/dnd-app-validate-5e.yml`

