# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-24] Two overlapping agent-instruction drift-guard scripts; `check-agent-docs.mjs` is dead code
### [2026-06-24] `.nvmrc` consolidation is incomplete — 4 workflows still hardcode `node-version: "22"`

- **Category:** debt, config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled overall-suggestor cross-cutting scan (2026-06-24)

**Description:**
The 2026-06-22 "Pin one Node version for the whole monorepo (.nvmrc / engines)" work (resolved in all three RESOLVED logs) added a root `.nvmrc` (`22`) + `engines.node` and claimed it "switched all 8 `node-version: 22` pins across 6 workflows … to `node-version-file: .nvmrc`". That resolution missed four occurrences that still hardcode the version literally:
- `.github/workflows/oracle-worker-ci.yml` (setup-node `node-version: "22"`)
- `.github/workflows/oracle-worker-deploy.yml` (setup-node `node-version: "22"`)
- `.github/workflows/security-audit.yml` line ~75 (the dungeon-scholar / auth-bearing-app audit job)
- `.github/workflows/security-audit.yml` line ~91 (the oracle-worker audit job)

`security-audit.yml` uses `node-version-file: .nvmrc` in its first job (line ~39) but the other two setup-node steps in the same file were left on the literal pin, and the two `oracle-worker-*` workflows were never part of the resolved entry's enumerated list at all. Net effect: bumping `.nvmrc` to a future Node (the whole point of the consolidation) would silently leave these four CI/deploy steps on 22 — re-introducing exactly the toolchain drift that issue set out to eliminate. Harmless today (all are 22), but it is latent single-source-of-truth drift across the oracle-worker (dungeon-scholar's backend) and the repo-wide security gate.

**Hypothesis / root cause:** The consolidation pass enumerated workflows by hand and (a) only converted the first setup-node step in `security-audit.yml`, missing its two later jobs, and (b) never included the two `oracle-worker-*` workflows in its list.

**Proposed fix / improvement:**
- [ ] Replace `node-version: "22"` with `node-version-file: .nvmrc` in `oracle-worker-ci.yml`, `oracle-worker-deploy.yml`, and both later setup-node steps in `security-audit.yml`.
- [ ] Add a guard so this cannot silently recur: e.g. a grep step / CI check failing on any `node-version:` literal in `.github/workflows/` (everything should use `node-version-file`).

**Blocked by:** None — mechanical 4-line change; worth a guard so the "one source of truth" invariant is actually enforced.

**Related files:** `.github/workflows/oracle-worker-ci.yml`, `.github/workflows/oracle-worker-deploy.yml`, `.github/workflows/security-audit.yml`, `.nvmrc`

**Related entries:** RESOLVED-ISSUES-DNDAPP.md / BMO-RESOLVED-ISSUES.md / RESOLVED-ISSUES-DUNGEON-SCHOLAR.md "[2026-06-22] Pin one Node version for the whole monorepo".

### [2026-06-24] Agent-instruction drift guard omits `.cursorrules` (the fifth peer instruction file)

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-24)

**Description:**
`scripts/` contains two scripts that guard the same thing — that the secondary AI-assistant instruction files keep their pointer to the canonical `AGENTS.md`: `scripts/check-agent-instructions.sh` and `scripts/check-agent-docs.mjs`. They were added by two different resolver runs (see `BMO-RESOLVED-ISSUES.md:752` for the `.sh`, `RESOLVED-ISSUES-DNDAPP.md:177` for the `.mjs`) and never reconciled. The `.sh` is a strict superset: it does the same `AGENTS.md`-pointer check AND a byte-for-byte `SYNC:agents` block comparison. Only the `.sh` is wired into CI (`.github/workflows/agent-docs-check.yml` runs `bash scripts/check-agent-instructions.sh`); `check-agent-docs.mjs` is referenced nowhere outside its own resolved-log entry — it is orphaned/dead. Two scripts for one job invites the classic drift-of-the-drift-guards problem (someone updates one, not the other). Separately: `grep -c "SYNC:agents"` returns 0 across `AGENTS.md` and all secondaries, so the `.sh` script''s byte-comparison half is currently inert — the SYNC-marker mechanism is coded + documented but no markers are actually deployed in the files.

**Hypothesis / root cause:** Two resolvers independently solved "guard the agent-instruction pointer" without grepping for an existing guard; the later `.sh` superseded the `.mjs` but the `.mjs` was never deleted.

**Proposed fix / improvement:**
- [ ] Delete `scripts/check-agent-docs.mjs` (the CI-wired `check-agent-instructions.sh` already covers it).
- [ ] Confirm nothing references the `.mjs` first: `grep -rn "check-agent-docs" . --include=*.yml --include=*.json --include=*.sh --include=Makefile` (current result: nothing live).
- [ ] Optional: either deploy real `<!-- SYNC:agents START/END -->` markers around the shared block in `AGENTS.md` + each secondary so the byte-comparison half does something, or trim that half of the `.sh` + its comment to match reality.

**Blocked by:** None — a file deletion + optional follow-up.

**Related files:** `scripts/check-agent-docs.mjs`, `scripts/check-agent-instructions.sh`, `.github/workflows/agent-docs-check.yml`, `AGENTS.md`

### [2026-06-24] `.cursorrules` is excluded from the agent-instruction drift guard and its title is stale

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-24)

**Description:**
`AUTOMATED-AGENT-GIT-WORKFLOW.md` lists `.cursorrules` as one of the hand-maintained agent-instruction files alongside `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.github/copilot-instructions.md`. But the drift guard (`scripts/check-agent-instructions.sh`, and the dead `check-agent-docs.mjs`) only validates `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` — `.cursorrules` is not in either script''s `secondary` list. So `.cursorrules` can silently drop its `AGENTS.md` pointer or drift from the canonical guidance and CI will stay green. Evidence it is already drifting: `.cursorrules`''s very first line reads `# Cursor Rules — home-lab Monorepo (dnd-app + bmo)`, which predates dungeon-scholar and oracle-worker — it names only two of the four subprojects, so the canonical "this is a 4-project monorepo" framing every other instruction file carries is already stale here. `.cursorrules` does still reference `AGENTS.md` (3x), so adding it to the guard would pass on the pointer check today; the stale title is a separate content fix.

**Hypothesis / root cause:** The guard was written around the three "tool" files that live next to `AGENTS.md`; `.cursorrules` (a dotfile at repo root) was overlooked. The title line was written when the repo was `dnd-app + bmo` only and never updated as the monorepo grew.

**Proposed fix / improvement:**
- [ ] Add `.cursorrules` to the `secondary` list in `scripts/check-agent-instructions.sh` (and to the SYNC-block loop if markers get deployed).
- [ ] Update the `.cursorrules` header to name all four subprojects (dnd-app, dungeon-scholar, bmo, oracle-worker), matching the framing in `AGENTS.md` / `README.md`.
- [ ] Sweep `.cursorrules` for other `dnd-app + bmo`-era staleness while there.

**Blocked by:** None.

**Related files:** `.cursorrules`, `scripts/check-agent-instructions.sh`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `AGENTS.md`

### [2026-06-24] Monorepo subproject metadata is inconsistent — oracle-worker has no README + empty package description; LICENSE only at root + dnd-app

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-24)

**Description:**
The four subprojects scaffold their top-level metadata inconsistently, which makes the monorepo read unevenly and weakens per-project discoverability:
- **README:** `dnd-app`, `dungeon-scholar`, and `bmo` each have a top-level `README.md`; `oracle-worker` has none — yet the root `README.md` lists oracle-worker as a first-class subproject (dungeon-scholar''s Oracle proxy backend). It is the only subproject a contributor can''t orient to from its own folder.
- **package.json `description`:** `oracle-worker/package.json` has `"description": ""` (empty), while `dnd-app` and `dungeon-scholar` carry real descriptions.
- **LICENSE:** a `LICENSE` sits at the repo root AND is duplicated verbatim in `dnd-app/LICENSE`, but `dungeon-scholar`, `bmo`, and `oracle-worker` have none — so license coverage is asserted in two of five places with no stated convention (is the root LICENSE meant to cover all subprojects, or is each expected to carry its own?).

None of these is a bug; together they''re low-grade structural drift worth one consistency pass.

**Hypothesis / root cause:** Subprojects were created at different times by different efforts; oracle-worker was scaffolded minimally as a small Cloudflare Worker (just `package.json` + `src` + `wrangler.toml`) and never got the README/description the older projects have. The dnd-app LICENSE is likely a leftover from when it was a standalone repo before being folded into the monorepo.

**Proposed fix / improvement:**
- [ ] Add a short `oracle-worker/README.md` (what it is — the Oracle proxy Worker for dungeon-scholar — how to dev/deploy via wrangler, link back to dungeon-scholar).
- [ ] Fill `oracle-worker/package.json`''s `description`.
- [ ] Decide the LICENSE convention: either keep a single root `LICENSE` and drop the duplicate `dnd-app/LICENSE` (documenting in the root README that it covers all subprojects), or add `LICENSE` to every subproject. One or the other, not the current two-of-five.

**Blocked by:** The LICENSE half is a (small) human/licensing decision — note it, don''t guess.

**Related files:** `oracle-worker/`, `oracle-worker/package.json`, `LICENSE`, `dnd-app/LICENSE`, `README.md`

- **Discovered by:** overall-suggestor
- **During:** scheduled overall-suggestor cross-cutting scan (2026-06-24)

**Description:**
The agent-instruction drift guard (`scripts/check-agent-instructions.sh`, run by `.github/workflows/agent-docs-check.yml`) enforces that the tool-specific AI guides keep pointing at the canonical `AGENTS.md` (and byte-match any `SYNC:agents` block). Its `secondary` set is exactly `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` — three files. But `.cursorrules` (a 15 KB hand-maintained AI-assistant instruction file at the repo root) is a fifth peer guide and is NOT covered: it is absent from the script's `secondary` array AND from the workflow's `paths:` triggers, so editing `.cursorrules` doesn't even run the check. `AUTOMATED-AGENT-GIT-WORKFLOW.md`'s own header explicitly lists `.cursorrules` alongside `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`copilot-instructions.md` as the agent-instruction files that reference the canonical workflow — so the guard's scope is narrower than the documented set it is meant to protect. `.cursorrules` currently does reference `AGENTS.md` (3×), so it passes today by luck, not by enforcement; it could silently drop the pointer or drift and nothing would fail.

**Hypothesis / root cause:** The guard was built (2026-06-22, RESOLVED-ISSUES-DNDAPP.md) around the four files known at the time; `.cursorrules` was either added later or simply not enumerated, and the workflow `paths:` filter was copied from the same four-file list.

**Proposed fix / improvement:**
- [ ] Add `.cursorrules` to the `secondary` array in `scripts/check-agent-instructions.sh` (it already handles "file missing" and "no AGENTS.md reference").
- [ ] Add `.cursorrules` to both the `push` and `pull_request` `paths:` lists in `.github/workflows/agent-docs-check.yml`.
- [ ] (Optional) If `SYNC:agents` blocks are ever introduced, decide whether `.cursorrules` carries one.

**Blocked by:** None.

**Related files:** `scripts/check-agent-instructions.sh`, `.github/workflows/agent-docs-check.yml`, `.cursorrules`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

**Related entries:** see sibling entry "[2026-06-24] Orphaned `scripts/check-agent-docs.mjs`" below — same drift-guard area.

### [2026-06-24] Orphaned `scripts/check-agent-docs.mjs` — superseded duplicate of the drift guard, wired to nothing

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled overall-suggestor cross-cutting scan (2026-06-24)

**Description:**
There are TWO agent-instruction drift checkers in the repo doing the same job: `scripts/check-agent-docs.mjs` (Node) and `scripts/check-agent-instructions.sh` (bash). The `.mjs` was the original (it is the one named in the resolved entry that created the guard, RESOLVED-ISSUES-DNDAPP.md:177), but `.github/workflows/agent-docs-check.yml` now invokes only `bash scripts/check-agent-instructions.sh`. A repo-wide grep finds NO reference to `check-agent-docs.mjs` anywhere (no workflow, no package.json script, no Makefile, no husky hook) — it is dead code. It is also a strictly weaker check than the `.sh` that replaced it: the `.sh` additionally enforces the `SYNC:agents` byte-for-byte block, which the `.mjs` does not. Leaving it in `scripts/` invites a future contributor to "fix"/run the wrong one, or to update one checker's file list and not the other (e.g. when adding `.cursorrules` per the sibling entry).

**Hypothesis / root cause:** The bash version superseded the Node version when the `SYNC:agents` block check was added, and the now-redundant `.mjs` was never deleted.

**Proposed fix / improvement:**
- [ ] Delete `scripts/check-agent-docs.mjs` (the `.sh` + its workflow are the live guard), OR
- [ ] If a Node implementation is preferred, consolidate onto ONE checker and point the workflow at it — but do not keep both.
- [ ] Whichever survives, make it the single place the agent-instruction file list (incl. `.cursorrules`) is maintained.

**Blocked by:** None — confirm no out-of-repo caller references the `.mjs` first (grep of this repo finds none).

**Related files:** `scripts/check-agent-docs.mjs`, `scripts/check-agent-instructions.sh`, `.github/workflows/agent-docs-check.yml`

**Related entries:** sibling entry "[2026-06-24] Agent-instruction drift guard omits `.cursorrules`".

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
