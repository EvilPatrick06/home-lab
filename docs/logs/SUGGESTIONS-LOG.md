# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

### [2026-07-02] Agent-instruction drift guard's byte-for-byte SYNC mechanism is dormant — no file carries `SYNC:agents` markers, so the guard reduces to a substring check while five instruction files restate the project map independently

- **Category:** debt, config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of repo-root agent-instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`) and their drift guard.

**Description:**
`scripts/check-agent-instructions.sh` (run by `agent-docs-check.yml`) has two layers: (1) each secondary file must contain the substring `AGENTS.md`, and (2) if `AGENTS.md` wraps a block in `<!-- SYNC:agents START/END -->` markers, every other file carrying the same markers must match it byte for byte. Layer 2 — the actual drift protection — is **dormant**: `grep -c "SYNC:agents" AGENTS.md CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md` returns 0 for all five files. No markers were ever added, so the guard the repo relies on (and that other log entries cite as "guards the AGENTS.md sync block") only verifies each file *mentions* AGENTS.md somewhere. Meanwhile the duplication the guard was built to catch is live: AGENTS.md and CLAUDE.md each restate the four-project map, port topology, and coupling notes in their own words (~16.5K + 14K, plus 16K `.cursorrules`), and CLAUDE.md even says "Keep shared sections in sync (S11)" — a manual convention with no mechanical backing. A change to the project set (e.g. the oracle-worker addition, or a fifth project) must be hand-propagated to five files with nothing catching a miss.

**Hypothesis / root cause:** the guard script and the SYNC-marker convention landed together (BMO-SUGGESTIONS 2026-06-22 per the script header), but the follow-up step of actually wrapping a shared block in markers across the five files was never done; the substring check passes, so the gap is invisible in CI.

**Proposed fix / improvement:**
- [ ] Pick the genuinely shared block (project map + domain descriptions + canonical-doc pointers), wrap it in `<!-- SYNC:agents START/END -->` in AGENTS.md, and mirror the marked block verbatim into the four secondary files — activating the byte-for-byte layer that already exists in the guard.
- [ ] Alternatively (lighter): drop the restated project maps from the secondary files entirely and replace with a one-line pointer to AGENTS.md, then simplify the guard to match. Either way, make the guard's advertised protection real.
- [ ] Add a guard failure mode for "markers exist in a secondary file but not AGENTS.md" (currently silently ignored).

**Related files:** `scripts/check-agent-instructions.sh`, `.github/workflows/agent-docs-check.yml`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`

**Related entries:** RESOLVED-ISSUES.md -> [2026-06-24] Agent-instruction drift guard omits `.cursorrules` (extended the file list, but layer 2 stayed dormant); SUGGESTIONS-LOG.md -> [2026-07-02] markdown link-integrity entry (cites this guard as the only docs-content gate).

### [2026-07-02] CI/hook-wired shell scripts outside `bmo/pi` have no syntax/lint gate — `scripts/*.sh`, the five `.github/scripts/*.sh`, and `.husky/pre-commit` are entirely unchecked, while `bmo/pi/scripts` gets `bash -n` + shellcheck via pytest

- **Category:** future-idea, config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of shared shell tooling and its verification coverage.

**Description:**
The repo now has three clusters of operationally-load-bearing shell outside `bmo/pi`: `scripts/` (`check-ci-hygiene.sh`, `check-agent-instructions.sh`, `claude-tools/watchdog.sh` — wired into `ci-hygiene.yml` / `agent-docs-check.yml` / cron), `.github/scripts/` (`board-ssh.sh`, `ci-failure-board.sh`, `prune-merged-branches.sh`, `shipped-digest.sh`, `uptime-check.sh` — each invoked by a scheduled workflow: `ci-failure-triage.yml`, `stale-branch-pruner.yml`, `weekly-shipped-digest.yml`, `external-uptime-check.yml`), and the repo-root `.husky/pre-commit` (the local gate for every project). None of these ~9 scripts is covered by any `bash -n`, shellcheck, or test (`grep -rn "bash -n\|shellcheck" .github/ scripts/ Makefile` → 0 hits outside bmo). By contrast `bmo/pi/scripts/*.sh` is systematically syntax-checked and shellcheck'd by `bmo/pi/tests/test_shell_scripts.py`, which even auto-discovers new `.sh` files. So the shell that runs *unattended on schedules* (uptime probe, branch pruner, digest, CI-failure triage) and the hook every commit passes through are the least-verified scripts in the repo — a quoting or syntax regression only surfaces when the scheduled run breaks in production. The proposed actionlint gate (SUGGESTIONS-LOG.md 2026-06-29) shellchecks inline workflow `run:` steps but does NOT reach these standalone script files. Also noted in passing: `.github/scripts/` has no README — a fourth instance of the missing-scripts-index pattern (SUGGESTIONS-LOG.md 2026-06-29 scripts/ README entry covers root + per-project dirs but never names `.github/scripts/`).

**Hypothesis / root cause:** the bmo shell-test harness was built for the Pi's deploy/health scripts; the root and `.github/scripts` clusters accreted later via CI workflows and inherited no equivalent, and no repo-wide "all tracked `*.sh` get shellcheck" convention exists.

**Proposed fix / improvement:**
- [ ] Add a shellcheck step to `ci-hygiene.yml` (SHA-pinned action or apt binary) over tracked `*.sh` outside `bmo/pi` (which already has coverage) plus `.husky/pre-commit`, warn-only first run, then enforcing.
- [ ] State the convention once in `docs/CONTRIBUTING.md`: any shell script wired into CI, hooks, or cron must pass shellcheck.
- [ ] Fold `.github/scripts/` into the scripts-README convention when the 2026-06-29 entry is implemented (one-line index: script → workflow that calls it).

**Related files:** `scripts/check-ci-hygiene.sh`, `scripts/check-agent-instructions.sh`, `scripts/claude-tools/watchdog.sh`, `.github/scripts/`, `.husky/pre-commit`, `.github/workflows/ci-hygiene.yml`, `bmo/pi/tests/test_shell_scripts.py`

**Related entries:** SUGGESTIONS-LOG.md -> [2026-06-29] actionlint gate (complementary: covers inline `run:` steps, not standalone scripts); SUGGESTIONS-LOG.md -> [2026-06-29] repo-root `scripts/` has no README (the `.github/scripts/` index gap extends that entry's convention).

### [2026-07-02] `.gitignore` agent-lock globs (`.*-resolver.lock`, `*-agent.lock`) codify an obsolete in-repo lock convention — locks now live outside the repo, and the globs would not match current lock names anyway

- **Category:** config, debt
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting review of repo-root configs (`.gitignore`) against the current agent-coordination conventions.

**Description:**
`.gitignore` carries a block "Scheduled/automated-agent runtime lock files (not source — see docs/AUTOMATED-AGENT-GIT-WORKFLOW.md)" with three globs: `.*-resolver.lock`, `**/.*-resolver.lock`, `*-agent.lock`. But the convention that doc (and every agent SKILL.md) actually specifies is locks **outside the repo** at `/home/patrick/home-lab-locks/<agent-id>.lock` — precisely so lock churn never touches any working tree. So the globs are doubly stale: (a) they guard against a placement that no longer happens, and (b) if an agent ever did drop a lock in-repo under the current naming (`overall-cleanup.lock`, `qa.lock`, `integrator.lock` — no `-resolver`/`-agent` suffix, no leading dot), these patterns would NOT match it, so the stale rules also fail as a safety net. The comment pointing readers at the workflow doc for an in-repo lock convention the doc contradicts is a small but real documentation trap.

**Hypothesis / root cause:** the globs date from an earlier iteration where resolver agents kept dotfile locks in the checkout; the 2026-06 worktree/lock redesign moved locks to `/home/patrick/home-lab-locks/` but the ignore rules were never swept.

**Proposed fix / improvement:**
- [ ] Delete the three stale globs and the block comment, OR replace with a single honest safety net (e.g. `*.lock` scoped to root, or `**/<agent-pattern>.lock` matching real agent ids) if belt-and-suspenders coverage is wanted.
- [ ] If a net is kept, make the comment state the real convention: locks belong in `/home/patrick/home-lab-locks/`, the ignore rule is only a guard against accidents.

**Related files:** `.gitignore`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

**Related entries:** none found (grepped all active logs for `resolver.lock` / `agent.lock` / gitignore lock rules).


### [2026-07-15] Biome engine version has re-drifted four ways after the 2026-06 repo-wide unification — schema pins say 2.5.0, package pins say 2.5.1, the husky hook pins 2.5.1, and the mobile lockfile resolves 2.5.2 — with no drift guard to stop the next recurrence

- **Category:** debt, config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of shared tooling configs (biome.base.json + the three project biome.json files, package pins, `.husky/pre-commit`).

**Description:**
The resolved 2026-06 entry "Biome engine version drift" (RESOLVED-ISSUES.md) unified everything to 2.5.0 — and it has already re-drifted, in four directions at once: (1) all four `$schema` pins (`biome.base.json`, `dnd-app/biome.json`, `dungeon-scholar/biome.json`, `dnd-app/mobile/biome.json`) still say **2.5.0**; (2) the package pins moved to **2.5.1** (`dnd-app` `^2.5.1`, `dnd-app/mobile` `^2.5.1`, `dungeon-scholar` exact `2.5.1`); (3) `.husky/pre-commit` hardcodes `npx --yes @biomejs/biome@2.5.1` for the dungeon-scholar block; (4) the caret pins let lockfiles diverge — `dnd-app/package-lock.json` resolves **2.5.1** while `dnd-app/mobile/package-lock.json` resolves **2.5.2**, so the hook, CI, and the two projects can format/lint under three different engine versions. Each individual delta is harmless today, but this is the exact class of drift the earlier fix closed, and it returned within ~3 weeks because nothing mechanical asserts "one Biome version repo-wide" — the version lives in 8+ places (4 schema URLs, 3 package pins, 1 husky pin, 2 lockfile resolutions) with only convention holding them together.

**Hypothesis / root cause:** Dependabot / manual bumps updated the package pins (2.5.0 → 2.5.1) and someone consistently updated the husky pin, but the `$schema` URLs were missed (they don't show up in dependency-bump tooling), and the caret ranges re-opened the lockfile divergence the exact-pin discussion in the original resolution flagged as an optional follow-up and never did.

**Proposed fix / improvement:**
- [ ] Re-sync now: bump the four `$schema` URLs to the resolved version, align mobile's lockfile with dnd-app's (or accept caret and stop pinning exact anywhere), and make `.husky/pre-commit`'s dungeon-scholar pin read the version from `dungeon-scholar/package.json` instead of hardcoding it.
- [ ] Add a guard to `scripts/check-ci-hygiene.sh` (the repo's existing convention-enforcement home, cf. GUARD 9 for LICENSE files): extract the Biome version from each `$schema` URL, each `package.json` pin, and the husky hook, and fail if they disagree — turning the "one Biome version" convention into a mechanical check so this entry is the last one of its kind.
- [ ] Document the single-source rule in `docs/CONTRIBUTING.md` next to the existing house-style note.

**Related files:** `biome.base.json`, `dnd-app/biome.json`, `dnd-app/mobile/biome.json`, `dungeon-scholar/biome.json`, `dnd-app/package.json`, `dnd-app/mobile/package.json`, `dungeon-scholar/package.json`, `.husky/pre-commit`, `scripts/check-ci-hygiene.sh`

**Related entries:** RESOLVED-ISSUES.md -> [2026-06-23] "Biome formatting style diverges" + the Biome-version unification resolution (this is its recurrence); SUGGESTIONS-LOG.md -> [2026-07-02] SYNC-marker entry (same pattern: convention without mechanical backing).

### [2026-07-15] LOG-INSTRUCTIONS' canonical "grep first" dedup command no longer covers where design-gotcha/info entries live — the three `docs/DESIGN-CONSTRAINTS.md` files are outside the grep, so duplicate knowledge entries can't be caught

- **Category:** docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting review of `docs/LOG-INSTRUCTIONS.md` against the current triage table.

**Description:**
`docs/LOG-INSTRUCTIONS.md` § "How to append (practical)" step 1 gives the canonical dedup command every agent is told to run before logging: a `grep -i` over nine files — the eight active logs plus `SECURITY-LOG.md`. But the same doc's triage table (updated when design-gotchas/info moved out of the suggestions logs) now routes `design-gotcha` and `info` entries to `bmo/docs/DESIGN-CONSTRAINTS.md`, `dnd-app/docs/DESIGN-CONSTRAINTS.md`, and `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md` — none of which appear in the grep command. An agent following the instructions to the letter will dedup-check a design-gotcha against the logs (where it no longer lives) and miss an identical entry sitting in the constraints doc it is about to append to. The `.gitattributes` union-merge rule for `**/docs/DESIGN-CONSTRAINTS.md` makes concurrent appends merge silently, so duplicates concatenate rather than conflict — the grep is the only dedup line of defense, and it doesn't look there.

**Hypothesis / root cause:** the grep-first command predates the design-gotcha/info relocation into per-domain DESIGN-CONSTRAINTS.md files; the triage table was updated but the practical command a few sections below was not swept.

**Proposed fix / improvement:**
- [ ] Add the three `*/docs/DESIGN-CONSTRAINTS.md` paths to the grep-first command in `docs/LOG-INSTRUCTIONS.md` (or restate it as `grep -i "<keyword>" docs/logs/*.md */docs/DESIGN-CONSTRAINTS.md` so future log/constraint additions are covered without editing the command again).
- [ ] While editing: note in step 1 that resolved archives (`RESOLVED-*`) are also worth a glance so a "new" finding isn't a regression of something already fixed once (the recurring-entry pattern this run itself hit).

**Related files:** `docs/LOG-INSTRUCTIONS.md`, `bmo/docs/DESIGN-CONSTRAINTS.md`, `dnd-app/docs/DESIGN-CONSTRAINTS.md`, `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`, `.gitattributes`

**Related entries:** RESOLVED-ISSUES.md -> the LOG-INSTRUCTIONS/RESOLVED-ISSUES routing-disagreement entry (same doc, same "table updated, prose not swept" failure mode).

### [2026-07-15] `make install` bootstraps only the four npm projects — the bmo/pi Python toolchain (4 requirements files, ruff, pytest) that `make lint` / `make test` immediately require is not installed by any root target

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting review of the repo-root Makefile as the advertised "uniform entry point" across projects.

**Description:**
The root `Makefile` presents itself as the uniform fan-out for the whole monorepo, and `lint`/`test` do fan out to bmo/pi (`ruff check .`, `python -m pytest -q`). But `install` — the target a fresh clone runs first — only wires hooks and runs `npm ci` in the four npm projects. Nothing installs `bmo/pi`'s Python side: the project carries four requirements files (`requirements.txt`, `requirements-test.txt`, `requirements-ci.txt`, `requirements-audit.txt`) plus ruff, none referenced by any Makefile target. So the documented flow `make install && make all` fails on a fresh machine at the bmo/pi steps with missing-tool errors, and the fix is undiscoverable from the Makefile itself (you must know to go read `bmo/` setup docs). The asymmetry also shows in `audit`: it fans out to the four npm projects but not to `requirements-audit.txt`'s pip-audit equivalent, so "make audit = repo audit" quietly excludes the Python surface. Related nit while here: the `help` text still describes oracle-worker lint as "(no-op)" — accurate in effect but the recipe now runs a real `npm run lint` stub script, so help and recipe describe the same thing two different ways.

**Hypothesis / root cause:** the Makefile grew npm-first (it was created to unify the JS projects) and bmo/pi was added to the *check* targets later without anyone adding the corresponding bootstrap; Python installs are less uniform (venv vs system vs pipx) so the author likely deferred the decision and it was never revisited.

**Proposed fix / improvement:**
- [ ] Add a `make install` step (or a separate `install-py` target that `install` calls) for bmo/pi: `pip install -r bmo/pi/requirements.txt -r bmo/pi/requirements-test.txt` plus ruff — or, if venv policy is the blocker, at minimum echo a pointer to the bmo setup doc so the gap is visible instead of silent.
- [ ] Extend `audit` to cover the Python surface via `requirements-audit.txt` (pip-audit or the mechanism bmo already uses), or state in `help` that audit is npm-only.
- [ ] Sync the `help` text with the real recipes (oracle-worker lint stub).

**Related files:** `Makefile`, `bmo/pi/requirements.txt`, `bmo/pi/requirements-test.txt`, `bmo/pi/requirements-ci.txt`, `bmo/pi/requirements-audit.txt`, `docs/SETUP.md`, `docs/COMMANDS.md`

**Related entries:** RESOLVED-ISSUES.md -> [2026-06] Makefile lint/audit fan-out extension (this is the bootstrap-side gap that extension left open).

### [2026-07-15] `docs/SCHEDULED-TASK-MIGRATION.md` is a one-time migration tracker with no per-row status and no completion/archival criterion — once the owner finishes the activation steps it will silently linger as a stale top-level doc

- **Category:** docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting review of `docs/` organization for stale or lifecycle-less documents.

**Description:**
`docs/SCHEDULED-TASK-MIGRATION.md` tracks migrating recurring Claude scheduled tasks onto GitHub Actions / bmo cron. It is inherently a *transitional* document: its phases list replacements to install and Claude tasks to retire, ending in a 4-step "What the owner must do to activate" checklist. But nothing in the doc records state — no per-row done/pending column, no checkboxes on the owner steps, no "migration complete as of <date>" criterion. From inside the repo it is unanswerable whether the Tailscale secrets exist, the crons are installed, or the old tasks are retired; the doc reads identically at 0% and 100% done. The repo has an established endpoint for exactly this situation — completed transitional docs move to `_archive/<date>-completed-docs/` with a provenance note (three such batches exist) — but this doc defines no trigger for taking that step, so the likely outcome is the familiar one prior cleanups kept correcting: a finished plan sitting in `docs/` indefinitely, indexed as if current.

**Hypothesis / root cause:** the doc was written as a plan/handoff at migration time; trackers written before execution routinely omit the status dimension because at authoring time everything is uniformly "pending".

**Proposed fix / improvement:**
- [ ] Add a status column to the Phase 1–3 tables (replacement live? Claude task retired?) and checkboxes to the owner-activation steps, so the doc reflects reality as steps complete.
- [ ] Add an explicit lifecycle note at the top: "when every row is live+retired and the owner steps are checked, move this file to `_archive/<date>-completed-docs/` and drop it from `docs/README.md`."
- [ ] If the migration is in fact already complete, skip the above and archive it now per the `_archive/` convention.

**Related files:** `docs/SCHEDULED-TASK-MIGRATION.md`, `docs/README.md`, `_archive/README.md`

**Related entries:** RESOLVED-ISSUES.md -> [2026-06-29] `_archive/README.md` stale-tree entry and the docs/superpowers archive entries (same completed-doc-lingering pattern).

