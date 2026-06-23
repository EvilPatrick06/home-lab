# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (F2–F6,
> code-splitting, QA16 full light theme, QA-Bestiary badges, the L1–L18 polish
> set, and the Phase 30 QA coverage-gap list) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar ideas below as they appear.

*(none active)*

---

# Low-severity polish / info

### [2026-06-22] Three unreferenced root-level tome JSON files (~700 KB) committed as dead artifacts

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/tome-aws-clf-c02.json` (~202 KB), `tome-ccst-cybersecurity.json` (~182 KB), and `tome-security-plus-sy0-701.json` (~313 KB) sit at the repo root, are tracked in git, but are referenced NOWHERE — no import, fetch, build glob, HTML, or doc points at them (grep across `src`, `public`, `index.html`, `vite.config.js`, `*.md` returns nothing). They are not in `public/` so they are not even served by the dev server or bundled. Git history shows they arrived via the GitHub web UI (Add files via upload, commit ce0d660e, Apr 30) and have not been touched since. They appear to be sample/seed exam content that predates the current Oracle/prompt-driven tome system and now just bloats the repo root and clones.

**Hypothesis / root cause:** Leftover manual upload of sample decks from an early iteration; the app moved to generating/importing tomes at runtime and these static files were never removed.

**Proposed fix / improvement:**
- [ ] Confirm with the owner that no external workflow consumes them.
- [ ] If genuinely unused, `git rm` all three (history preserves them); otherwise move into a clearly-named `samples/` or `fixtures/` dir and document their purpose.

**Related files:** `dungeon-scholar/tome-aws-clf-c02.json`, `dungeon-scholar/tome-ccst-cybersecurity.json`, `dungeon-scholar/tome-security-plus-sy0-701.json`

### [2026-06-22] No linter/formatter config in dungeon-scholar (sibling dnd-app has biome)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/` has no ESLint, Prettier, Biome, or `.editorconfig`, and `package.json` exposes no `lint`/`format` script (only `dev`/`build`/`preview`/`test`/`test:watch`). The sibling project `dnd-app/` in the same monorepo ships a `biome.json`. This is a consistency/structure gap: dungeon-scholar relies entirely on convention with no automated style or correctness gate, so formatting drift and easy-to-catch issues (unused vars/imports, accidental globals) can accumulate unchecked across the ~24 K lines of source.

**Hypothesis / root cause:** dungeon-scholar started as a single-file prototype (the former 11 K-line App.jsx) and a linter was never retrofitted as it grew.

**Proposed fix / improvement:**
- [ ] Add Biome (mirror `dnd-app/biome.json`) or ESLint+Prettier to dungeon-scholar.
- [ ] Add a `lint` script to `package.json` and wire it into CI alongside `test`.

**Related files:** `dungeon-scholar/package.json`, `dnd-app/biome.json` (reference config)

### [2026-06-22] DungeonExplore.jsx is a 4,536-line God-file mixing canvas rendering, map-gen, and the React component

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/DungeonExplore.jsx` is 4,536 lines — by far the largest source file (next is App.jsx at 1,665). It bundles three distinct concerns under one `components/` file: (1) ~60 pure canvas tile/sprite drawing functions (`drawWall`, `drawFloor`, `drawNightshade`, … starting ~line 714), (2) pure procedural map-generation + game data (`generateMap`, `generateStarterMap`, `makeSeededRng`, `BIOMES`, `ROOMS_BY_DIFFICULTY`, `BIOME_BOSS_POOL`, etc.), and (3) the actual React component, which only begins at line 2617 — meaning ~57% of a file living under `components/` is non-component logic. The pure exports are already imported outside the component (`features/player/usePlayerActions.js`, `features/progression/StableScreen.jsx`), so they are effectively a misplaced module. This is inconsistent with the PHASE-39 architecture split that moved data/helpers into `src/game/` and primitives into `src/components/ui/`; DungeonExplore was left as an un-split monolith.

**Hypothesis / root cause:** PHASE-39 split App.jsx but did not touch DungeonExplore, so its map-gen + canvas helpers never migrated to `src/game/` / a dedicated rendering module.

**Proposed fix / improvement:**
- [ ] Extract map-gen + game-data exports into `src/game/dungeonMap.js` (consistent with PHASE-39's `src/game/`).
- [ ] Extract the ~60 canvas `draw*` functions into `src/components/dungeon/tileRenderer.js` (or similar).
- [ ] Leave `DungeonExplore.jsx` as the React component only; re-point the existing `DungeonExplore.test.js` imports.

**Related files:** `dungeon-scholar/src/components/DungeonExplore.jsx`, `dungeon-scholar/src/components/DungeonExplore.test.js`, `dungeon-scholar/src/features/player/usePlayerActions.js`, `dungeon-scholar/src/features/progression/StableScreen.jsx`

### [2026-06-22] docs/PHASE-24-POLISH.md is fully completed (all items struck through) — stale tracking doc

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/docs/PHASE-24-POLISH.md` is a deferred-work tracker whose every line item is now struck through (`~~…~~`) and annotated Done / Resolved in PHASE-39 / Done in Phase 24. It tracks no remaining open work. It lingers as a stale doc that a future contributor must read in full to discover it is empty of actionable content. Either archive it (the resolved-items pattern used by the SUGGESTIONS/ISSUES logs) or delete it, since its closing instruction (prepend a one-line summary…) suggests it was meant to be a living backlog that has since been fully drained.

**Hypothesis / root cause:** Phase-24 polish backlog was completed but the tracking file was never archived/removed afterward.

**Proposed fix / improvement:**
- [ ] Delete `docs/PHASE-24-POLISH.md`, or move its completed record into the dungeon-scholar resolved log / a phases/completed archive for history.

**Related files:** `dungeon-scholar/docs/PHASE-24-POLISH.md`

---

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
