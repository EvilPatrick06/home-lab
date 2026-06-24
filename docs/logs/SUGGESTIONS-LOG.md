# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-23] Biome engine version drift across the JS projects despite the shared base config

- **Category:** debt, config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled overall-suggestor cross-cutting scan (2026-06-23)

**Description:**
The earlier "shared base Biome config" work created `biome.base.json` (both `dnd-app/biome.json` and `dungeon-scholar/biome.json` now `extends` it), which unified the *config* — but the Biome *engine version* still differs per project. `dnd-app` pins a local `@biomejs/biome: "^2.5.0"` and runs the bare `biome` binary; `dungeon-scholar` has no local Biome dependency and instead invokes `npx --yes @biomejs/biome@2.4.16` in its `lint`/`format` scripts (and the husky hook does the same). Meanwhile `biome.base.json` declares `"$schema": ".../2.4.16/schema.json"`. So two different engine versions lint a single shared config, and the `^2.5.0` engine reads a base file whose schema is pinned to 2.4.16. Biome's lint defaults and rule behavior can change between minor versions, so a file can pass on one project's engine and warn/fail on the other's, and a `^2.5.0` resolution can silently pick up 2.5.x/2.6.x changes the 2.4.16 schema doesn't describe. Low severity (both are recent 2.x), but it quietly undercuts the "one shared lint config" guarantee the base file was meant to provide.

**Hypothesis / root cause:** The base config was extracted (unifying rules) without also unifying the toolchain version; the two projects adopted Biome independently (local dep vs `npx`-pinned) and were never reconciled.

**Proposed fix / improvement:**
- [ ] Pick one Biome version for the repo and use it everywhere (e.g. add `@biomejs/biome` as a local devDependency in `dungeon-scholar` pinned to the same version `dnd-app` resolves, or pin `dnd-app` to the exact `2.4.16` the base schema/`dungeon-scholar` use).
- [ ] Keep `biome.base.json`'s `$schema` version in lockstep with whatever engine is chosen.
- [ ] Replace `npx --yes @biomejs/biome@<v>` in `dungeon-scholar`'s scripts + the husky hook with the local binary once the dep exists (faster, offline-safe, version-locked).

**Blocked by:** None — mechanical, but touches both projects' `package.json` + lockfiles, so worth one deliberate commit.

**Related files:** `biome.base.json`, `dnd-app/package.json`, `dnd-app/biome.json`, `dungeon-scholar/package.json`, `dungeon-scholar/biome.json`, `.husky/pre-commit`

### [2026-06-23] `ruff` is a declared bmo/pi dependency but unwired — repo-wide `make lint` skips Python entirely

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled overall-suggestor cross-cutting scan (2026-06-23)

**Description:**
`bmo/pi/requirements-test.txt` pins `ruff==0.15.15`, but ruff is never actually invoked: not in `bmo-pi-pytest.yml` (pytest only), not in the `Makefile` `lint` target, not in `.husky/pre-commit`, and not in any `scripts/` helper. There is also no ruff config (no `pyproject.toml` / `ruff.toml` / `setup.cfg` under `bmo/pi/` — only `pytest.ini`). The cross-cutting angle: the repo-root `make lint` is the uniform lint entry point, and it fans out to `dnd-app` + `dungeon-scholar` (Biome) + `oracle-worker` (no-op) — but silently omits the Python project altogether, so `make lint` gives incomplete repo-wide confidence in the same spirit as the earlier "`make lint`/`typecheck` only cover dnd-app" finding. A linter is already a declared dependency; it's just not connected to anything.

**Hypothesis / root cause:** ruff was added to the test requirements (likely pulled in transitively or in anticipation) but the wiring into CI / `make lint` / a config file was never completed; `make lint`'s fan-out was written around the JS projects only.

**Proposed fix / improvement:**
- [ ] Add a minimal `bmo/pi/pyproject.toml` (or `ruff.toml`) with the project's ruff rule selection + line length.
- [ ] Add a `ruff check` (and optionally `ruff format --check`) step — either a `bmo/pi` lint command surfaced through the `Makefile` `lint` target, or a job/step in `bmo-pi-pytest.yml` so the master-scoped gate enforces it.
- [ ] Update the `Makefile` `help` text so `lint` honestly lists Python coverage.

**Blocked by:** A first `ruff check` will likely surface existing lint findings to triage; budget for that (or start with a lenient rule set + ratchet).

**Related files:** `bmo/pi/requirements-test.txt`, `bmo/pi/pytest.ini`, `Makefile`, `.github/workflows/bmo-pi-pytest.yml`

### [2026-06-23] Stale `subprojects-ci.yml` reference in `.husky/pre-commit` (that workflow was deleted)

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled overall-suggestor cross-cutting scan (2026-06-23)

**Description:**
`.husky/pre-commit` (line ~36) still tells contributors that "CI (.github/workflows/subprojects-ci.yml) is authoritative" for the dungeon-scholar pre-flight. But `subprojects-ci.yml` was deleted on 2026-06-23 (resolved entry: "Duplicate CI: `subprojects-ci.yml` overlaps the dedicated `dungeon-scholar-ci.yml` / `oracle-worker-ci.yml`"); the dedicated `dungeon-scholar-ci.yml` is now the authoritative gate. The hook still works, but the comment points at a file that no longer exists, which misleads anyone reading the hook to understand the gating model. (The same resolved-log addendum in `BMO-RESOLVED-ISSUES.md` also references it, but that's historical record and fine to leave.) This is the kind of dangling pointer that the `subprojects-ci` deletion should have swept up.

**Hypothesis / root cause:** When `subprojects-ci.yml` was removed, the live cross-reference inside `.husky/pre-commit` was missed (only the workflow file + its CI sibling settings were updated).

**Proposed fix / improvement:**
- [ ] Update the `.husky/pre-commit` comment to name `.github/workflows/dungeon-scholar-ci.yml` (the current authoritative gate) instead of the deleted `subprojects-ci.yml`.
- [ ] Quick `grep -rn "subprojects-ci" --include=*.md --include=*.sh --include=*.yml` to confirm no other live (non-resolved-log) references remain.

**Blocked by:** None — one-line comment fix.

**Related files:** `.husky/pre-commit`, `.github/workflows/dungeon-scholar-ci.yml`


### [2026-06-23] Consider grouping the append-only log files under `docs/logs/`

- **Category:** docs, debt
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-23)

**Description:**
The 12+ append-only log files (`BMO-ISSUES-LOG.md`, `ISSUES-LOG-DNDAPP.md`, `ISSUES-LOG-DUNGEON-SCHOLAR.md`, `ISSUES-LOG.md`, the `SUGGESTIONS-LOG*` set, and the large `RESOLVED-*` archives) sit at the same level as conceptual docs in `docs/`. Relocating them to a `docs/logs/` subdir would visually separate machine-appended churn from human-authored guidance and shrink the top-level `docs/` listing. The union-merge driver is keyed by filename glob "any directory" (see `.gitattributes`), so a move does NOT break auto-merge. The real cost is updating the many cross-references (root `README.md`, `LOG-INSTRUCTIONS.md`, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `AUTOMATED-AGENT-GIT-WORKFLOW.md`, and every scheduled-agent task file that hardcodes `docs/<LOG>.md`) — so this is a deliberate, all-at-once reorg, not a quick move. Logged as a low-priority structural option, not an urgent fix.

**Hypothesis / root cause:** Logs were created in `docs/` root before the set grew large enough to warrant its own subdir.

**Proposed fix / improvement:**
- [ ] If pursued: `git mv docs/*ISSUES-LOG*.md docs/*SUGGESTIONS-LOG*.md docs/RESOLVED-*.md docs/logs/` in one commit.
- [ ] Update all hardcoded `docs/<LOG>.md` references (README, instruction files, workflow doc, scheduled task files) in the same commit.
- [ ] Verify `.gitattributes` union-merge globs still match (they are path-agnostic, so they should).

**Blocked by:** Needs a human go/no-go — high reference-churn for modest benefit.

**Related files:** `docs/`, `.gitattributes`, `README.md`, `docs/LOG-INSTRUCTIONS.md`, `AGENTS.md`

> **2026-06-23 (overall-resolver):** User-approved, but left UNIMPLEMENTED this run. The move requires updating scheduled-agent task files that hardcode `docs/<LOG>.md` and live OUTSIDE this repo (the other resolvers/scanners and the integrator); moving the logs would break those agents on their next run until each task definition is updated in the scheduler. That out-of-repo coordination is a new step the approval couldn't cover — do it first, then this move is a quick `git mv` + reference sweep.
