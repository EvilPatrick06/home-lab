# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.


### [2026-06-23] Biome formatting style diverges between dnd-app and dungeon-scholar

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-23)

**Description:**
Both `dnd-app/biome.json` and `dungeon-scholar/biome.json` pin the same Biome (`2.4.16`) and share the same formatter base (2-space, lineWidth 120, single quotes), but their JS formatter rules are deliberately opposite styles: dnd-app uses `semicolons: "asNeeded"` + `trailingCommas: "none"` and no `jsxQuoteStyle`; dungeon-scholar uses `semicolons: "always"` + `trailingCommas: "all"` + `jsxQuoteStyle: "double"`. Two TS/React projects in one monorepo therefore enforce contradictory code styles, so muscle memory and copy-pasted snippets don't carry between them, and there is no single source of truth for "house style".

**Hypothesis / root cause:** The two configs were authored independently at different times rather than extended from a shared base; Biome's `extends` was not used.

**Proposed fix / improvement:**
- [ ] Decide one house JS style (semicolons / trailing commas / jsx quotes) for the repo.
- [ ] Factor the shared rules into a root `biome.base.json` and have each project's `biome.json` use `extends` so only genuinely project-specific overrides differ.
- [ ] Or, minimally, align the three diverging keys across the two files even without a shared base.

**Blocked by:** none — but reformatting will touch many files, so do it as its own commit per project.

**Related files:** `dnd-app/biome.json`, `dungeon-scholar/biome.json`

### [2026-06-23] Root Makefile `lint`/`typecheck` still only cover dnd-app although dungeon-scholar now has Biome

- **Category:** config, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-23)

**Description:**
The root `Makefile` header states it "fans out to each project's own commands", but `lint:` runs only `cd dnd-app && npm run lint` and `typecheck:` runs only the dnd-app tsconfig. `dungeon-scholar` now ships a Biome config and a `lint` script (`biome check src`), yet `make lint` never invokes it, and `oracle-worker` (TS) is also skipped. So `make lint` / `make all` give false "whole-repo is clean" confidence while silently checking one of three JS projects. The original task-runner entry (RESOLVED-ISSUES.md 2026-06-22) explicitly deferred dungeon-scholar lint/typecheck parity "until it gains a linter" — that blocker is now cleared, so this is the unblocked follow-up.

**Hypothesis / root cause:** Makefile was written when dungeon-scholar had no linter; it was never revisited after the linter landed.

**Proposed fix / improvement:**
- [ ] Extend `make lint` to also run `cd dungeon-scholar && npm run lint` (and oracle-worker once it has a lint surface).
- [ ] Add a `typecheck` path for dungeon-scholar/oracle-worker (or document why they're excluded).
- [ ] Make `audit:` call each project's `npm run audit:ci` instead of inlining the audit command (add an `audit:ci` script to oracle-worker so the vocabulary is uniform).

**Blocked by:** none.

**Related files:** `Makefile`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `docs/CONTRIBUTING.md`

### [2026-06-23] `format` npm script means different things in dnd-app vs dungeon-scholar

- **Category:** design-gotcha, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-23)

**Description:**
In `dnd-app`, `format` = `biome format --write src/` (formatting only) and there is a separate `lint:fix` = `biome check --write src/`. In `dungeon-scholar`, `format` = `biome check --write src` (i.e. lint + autofix + format) and there is no `lint:fix`. The same script name does materially different things across the two projects, so `npm run format` is safe to run mindlessly in one repo but rewrites lint fixes in the other. This is a naming collision the 2026-06-22 task-runner work (which added the root Makefile / minimum vocabulary) did not reconcile.

**Hypothesis / root cause:** Scripts grew per-project without a shared naming convention for format vs lint:fix.

**Proposed fix / improvement:**
- [ ] Standardize: `format` = formatting only, `lint:fix` = lint autofix, in every JS `package.json`.
- [ ] Document the canonical script vocabulary (`lint`, `lint:fix`, `format`, `typecheck`, `test`, `build`, `audit:ci`) in `docs/CONTRIBUTING.md`.

**Blocked by:** none.

**Related files:** `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `docs/CONTRIBUTING.md`

### [2026-06-23] No index for the flat `docs/` directory; add `docs/README.md`

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-23)

**Description:**
The root `docs/` holds ~28 files at one flat level mixing conceptual/guidance docs (`ARCHITECTURE.md`, `DATA-FLOW.md`, `GLOSSARY.md`, `SETUP.md`, `COMMANDS.md`, `BACKUP.md`, `SECURITY.md`, `OLLAMA-TUNING.md`, `RULES-RETRIEVAL.md`, `CONTRIBUTING.md`, `AUTOMATED-AGENT-GIT-WORKFLOW.md`, `LOG-INSTRUCTIONS.md`) with the many append-only log files (`*-ISSUES-LOG*`, `*-SUGGESTIONS-LOG*`, `RESOLVED-*`). There is no `docs/README.md` index, so finding the right doc means scanning the whole listing; the root `README.md` links only a handful. A short `docs/README.md` table-of-contents (grouping by purpose: architecture/data, setup/ops, contributor process, logs) would make the directory navigable without any file moves.

**Hypothesis / root cause:** Docs accreted file-by-file; no index was ever introduced.

**Proposed fix / improvement:**
- [ ] Add `docs/README.md` listing each doc grouped by purpose with one-line descriptions.
- [ ] Link it from the root `README.md` contributor section.

**Blocked by:** none.

**Related files:** `docs/`, `README.md`

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
### [2026-06-23] `make lint` / `make typecheck` only cover dnd-app — `make all` gives false repo-wide confidence

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting review of the root `Makefile` fan-out vs per-project npm scripts

**Description:**
The root `Makefile` advertises itself as "a uniform entry point that fans out to each project's own commands", and `test` / `build` / `audit` do fan out to all projects (dnd-app + dungeon-scholar + oracle-worker + bmo/pi). But `lint` and `typecheck` only touch dnd-app:

```
lint:      cd dnd-app && npm run lint
typecheck: cd dnd-app && npx tsc --noEmit -p tsconfig.web.json
all:       lint typecheck test build
```

`dungeon-scholar` ships a `lint` script (`biome check src`) that `make lint` never invokes, and `oracle-worker` has no lint at all. So `make all` runs dnd-app lint/typecheck but silently skips dungeon-scholar's linter — a contributor running `make all` before pushing gets the impression the whole repo is lint-clean when only one project was checked. (CI does lint dnd-app via `dnd-app-ci.yml`, but no workflow runs `biome check` on dungeon-scholar — only its tests + build — so this gap is not caught downstream either.)

**Hypothesis / root cause:** The Makefile predates dungeon-scholar/oracle-worker gaining their own biome configs; the fan-out was extended for test/build/audit but lint/typecheck were never updated.

**Proposed fix / improvement:**
- [ ] Make `make lint` fan out: `cd dnd-app && npm run lint` then `cd dungeon-scholar && npm run lint`.
- [ ] Consider a dungeon-scholar typecheck step (it has no `tsconfig` / `tsc` step today; vite handles transpile but there is no standalone typecheck — confirm before adding).
- [ ] Optionally add a `lint` no-op (or real check) to oracle-worker so the fan-out is uniform.
- [ ] Update the `help` text if the coverage stays intentionally partial, so `make all` does not over-promise.

**Related files:** `Makefile`, `dungeon-scholar/package.json`, `dungeon-scholar/biome.json`, `.github/workflows/dungeon-scholar-ci.yml`

### [2026-06-23] Duplicate CI: `subprojects-ci.yml` overlaps the dedicated `dungeon-scholar-ci.yml` / `oracle-worker-ci.yml`

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting review of `.github/workflows/`

**Description:**
Three workflows gate the same two subprojects on the same triggers, so every push/PR touching them runs the same work twice:

- `dungeon-scholar/**` push+PR triggers BOTH `dungeon-scholar-ci.yml` (npm ci → test → build) AND the `dungeon-scholar` job in `subprojects-ci.yml` (npm ci → test → build). Near-identical; the only difference is `dungeon-scholar-ci.yml` sets `VITE_BASE=/home-lab/` on the build.
- `oracle-worker/**` push+PR triggers BOTH `oracle-worker-ci.yml` (npm ci → wrangler dry-run → test) AND the `oracle-worker` job in `subprojects-ci.yml` (npm ci → wrangler dry-run). Overlapping.

`subprojects-ci.yml`'s own header says it was added "for the two internet-facing subprojects that previously had no CI" — but dedicated per-project workflows now exist too, making it redundant. Cost: doubled CI minutes on each change, two near-identical status checks (confusing for branch-protection / the integrator's CI-green check), and drift risk (the two dungeon-scholar builds already differ on `VITE_BASE`, and `dungeon-scholar-ci.yml` pins `actions/checkout@v6` while every other workflow in the repo uses `@v7`).

**Hypothesis / root cause:** `subprojects-ci.yml` and the dedicated workflows were introduced independently (different dates / suggestions) without retiring the overlap.

**Proposed fix / improvement:**
- [ ] Pick one home per subproject: either keep the dedicated `dungeon-scholar-ci.yml` + `oracle-worker-ci.yml` and delete `subprojects-ci.yml`, or fold the dedicated ones into `subprojects-ci.yml` and delete those.
- [ ] Preserve the `VITE_BASE=/home-lab/` build arg whichever survives.
- [ ] While here, bump `dungeon-scholar-ci.yml` `actions/checkout@v6` → `@v7` to match the rest of the repo.

**Related files:** `.github/workflows/subprojects-ci.yml`, `.github/workflows/dungeon-scholar-ci.yml`, `.github/workflows/oracle-worker-ci.yml`

### [2026-06-23] No shared base Biome config — dnd-app and dungeon-scholar enforce conflicting JS style

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting review of code-style configs across the TS/React projects

**Description:**
Both `dnd-app/biome.json` and `dungeon-scholar/biome.json` pin the same Biome version (2.4.16) and the same formatter basics (space indent, width 2, lineWidth 120, single quotes) — but their JavaScript formatter rules actively conflict:

| | dnd-app | dungeon-scholar |
|---|---|---|
| `semicolons` | `asNeeded` | `always` |
| `trailingCommas` | `none` | `all` |
| `jsxQuoteStyle` | (default) | `double` |

A contributor (or agent) moving between the two projects gets opposite auto-format-on-save behavior, and a copied snippet reformats differently depending on directory. There is no root/base Biome config that both `extends`, so the shared parts (version, indent, width, quoteStyle) are also duplicated and can silently drift on the next version bump.

**Hypothesis / root cause:** Each project's biome.json was authored independently; Biome's `extends` (shared base config) was never adopted.

**Proposed fix / improvement:**
- [ ] Add a root `biome.base.json` with the genuinely-shared settings (schema version, indentStyle/width, lineWidth, quoteStyle, vcs) and have both projects `"extends": ["../biome.base.json"]`, overriding only the deliberately-divergent rules.
- [ ] OR, if the semicolon/trailing-comma divergence is intentional, document *why* in each project's `docs/DESIGN-CONSTRAINTS.md` so future agents don't "unify" them by mistake.
- [ ] Keep oracle-worker in mind (no biome.json today) if a shared base is adopted.

**Related files:** `dnd-app/biome.json`, `dungeon-scholar/biome.json`
