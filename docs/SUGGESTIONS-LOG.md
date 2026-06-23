# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.


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
