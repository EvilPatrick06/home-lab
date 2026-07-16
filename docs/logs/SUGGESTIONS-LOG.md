# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions


### [2026-07-15] Agent-worktree garbage collection never fires — 57 worktrees / ~16 GB of merged branches accumulate because `stale-local-cleanup.sh` keys on deleted *local* branches that nothing in the pipeline ever deletes

- **Category:** future-idea, config, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled cross-cutting repo scan (2026-07-15); noticed 57 entries in `git worktree list` vs only 12 remote branches.

**Description:**
The fleet's local garbage collection is a no-op for the dominant staleness case. Today `/home/patrick/home-lab-trees` holds **57 worktrees totaling ~16 GB** (disk at 65%), of which ~50 sit on `auto/*` branches that are already **merged into `origin/master` and deleted on origin**. The weekly cron (`bmo/pi/scripts/stale-local-cleanup.sh`, Sun 04:00) removes a worktree dir only when (a) git no longer tracks it as a live worktree AND (b) the **local** branch `refs/heads/auto/<name>` is gone. Neither ever becomes true: the integrator deletes only the **remote** branch (`git push origin :<branch>` per AUTOMATED-AGENT-GIT-WORKFLOW.md Rule 3A — local `-D`/worktree-remove is "if applicable" and the integrator runs in the main checkout where these branches aren't visible as its own), and a local branch checked out in its worktree cannot be deleted anyway. `bmo/pi/data/logs/cron-cleanup.log` confirms: every run prints only "worktrees pruned / local cleanup done" — zero removals ever. Two additional worktrees are invisible to the cleaner entirely because they live outside `$TREES`: `/home/patrick/wt-dnd-phase-maker` (`auto/dnd-phase-maker`) and `/home/patrick/home-lab/.claude/worktrees/ai-p6-roadmap`; the `docfix` worktree (`tmp/docfix`, merged) also escapes the cleaner's hardcoded `br="auto/$(basename "$d")"` naming assumption. On the shared 8 GB Pi that also hosts run-check.sh-gated heavy jobs, unbounded checkout growth is a real resource risk (each worktree is a ~6,600-file full checkout).

**Hypothesis / root cause:** the cleanup script's staleness predicate ("local branch deleted") models a branch-deletion step that no actor performs; the integrator's cleanup contract and the cron's predicate were written independently and never reconciled. Verified empirically: `git merge-base --is-ancestor` shows ~50 worktree branches merged into `origin/master` with no matching `origin/` ref, yet all survive every weekly cleanup.

**Proposed fix / improvement:**
- [ ] Change `stale-local-cleanup.sh` staleness test to: branch is an ancestor of `origin/master` (merged) AND has no `refs/remotes/origin/<branch>` counterpart AND worktree is clean (no uncommitted/unpushed work) AND dir mtime > N days — then `git worktree remove --force` + `git branch -D`. Keep the never-touch-master guarantee.
- [ ] Drop the `auto/$(basename)` naming assumption — read the actual checked-out branch via `git -C "$d" branch --show-current` (also covers `tmp/*` and future prefixes).
- [ ] Either scan known out-of-convention locations (or better: log a warning when `git worktree list` reports a worktree outside `$TREES`, so path-convention drift like `~/wt-dnd-phase-maker` surfaces instead of silently escaping GC).
- [ ] Add a test to `bmo/pi/tests/` (the script is currently exercised only by shellcheck/`bash -n`, not behaviorally).

**Blocked by:** none.

**Related files:** `bmo/pi/scripts/stale-local-cleanup.sh`, `.github/workflows/stale-branch-pruner.yml`, `.github/scripts/prune-merged-branches.sh`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

**Related entries:** RESOLVED-ISSUES.md [2026-06-29] "CI hygiene convention gap…" (same fleet-hygiene family); docs/SCHEDULED-TASK-MIGRATION.md documents the local/remote pruner split this entry closes the gap in.

### [2026-07-15] `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` has TWO "Rule 4" sections — numbering forked, so every "Rule 4" cross-reference in the canonical agent-process doc is ambiguous

- **Category:** future-idea, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled cross-cutting repo scan (2026-07-15); reading the workflow doc end-to-end.

**Description:**
The canonical git-mechanics doc every automated agent is required to follow contains duplicate rule numbering: `## Rule 4 — Auto-diagnose, don't just report symptoms` (line ~279) and `## Rule 4 — Heavy local checks go through the admission gate (run-check.sh)` (line ~389), with Rules 5 and 6 sitting between them (order on the page: 1, 2, 3, 4, 5, 6, 4). Any doc, scheduled-task SKILL.md, board note, or commit message that cites "workflow doc Rule 4" is now ambiguous between root-cause diagnosis and the run-check admission gate — in a repo whose coordination fabric is precisely these cross-referenced rule numbers (e.g. INSTRUCTIONS.md rules are cited by number throughout). Likely cause: the two sections landed on parallel `auto/*` branches that each appended "the next rule number" and union-style integration kept both.

**Proposed fix / improvement:**
- [ ] Renumber the second "Rule 4" (admission gate) to "Rule 7" (or fold it under Rule 4 as 4b) and sweep referencing docs/SKILL definitions for citations that relied on the old number (`grep -rn "Rule 4" docs/ */docs .github` and the scheduled-task definitions).
- [ ] Consider a one-line check in `scripts/check-ci-hygiene.sh` or `agent-docs-check.yml`: duplicate `^## Rule <n>` headings in the workflow doc fail CI, so parallel-append numbering collisions get caught at integration time.

**Blocked by:** none.

**Related files:** `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `scripts/check-agent-instructions.sh`, `.github/workflows/agent-docs-check.yml`

**Related entries:** RESOLVED-ISSUES.md [2026-07-02] "The repo-wide canonical process doc lives at dnd-app/docs/phases/INSTRUCTIONS.md…" (same doc-fabric family).

### [2026-07-15] Shared JS dev-toolchain versions drift between the independently-Dependabot'd projects (vitest ^4.0.18 in dnd-app vs ^4.1.9 in dungeon-scholar today) — add a cross-project version-skew report instead of more one-time fixes

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** scheduled cross-cutting repo scan (2026-07-15); comparing shared devDependencies across the four package.json roots.

**Description:**
The repo has four independent npm roots (dnd-app, dnd-app/mobile, dungeon-scholar, oracle-worker) sharing a common toolchain (biome, typescript, vitest, vite). Each root gets its own Dependabot bumps that merge on their own schedule, so shared-tool versions drift *structurally*, not accidentally. Current skew: **vitest `^4.0.18` (dnd-app) vs `^4.1.9` (dungeon-scholar)**; typescript ranges also differ in style (`^6.0.3` ×3 vs `~6.0.3` in mobile — tilde will pin mobile to 6.0.x while the others float to 6.x). This is the same class as the twice-fixed biome drift (RESOLVED-ISSUES.md 2026-06-23 "Biome engine version drift…", re-logged and re-resolved 2026-07-02 "Biome version has no single source…") — one-time alignment fixes decay within weeks because nothing watches for recurrence. The projects deliberately have no npm workspace (Makefile header), so a mechanical single source is off the table; a *report* is the portable alternative.

**Proposed fix / improvement:**
- [ ] Add a small script (e.g. `scripts/check-toolchain-skew.sh` or a step in `ci-hygiene.yml`) that extracts an allowlist of shared dev deps (biome, typescript, vitest, vite) from the four package.json files and warns (non-blocking) when specifiers diverge beyond patch range — surfacing skew at PR time instead of via periodic rediscovery.
- [ ] Optionally add Dependabot `groups` per root for these packages so their bumps travel together and converge faster.
- [ ] Decide intentionally whether mobile's `~6.0.3` typescript tilde is deliberate (Expo constraint) and comment it if so — otherwise normalize to the repo's `^` convention.

**Blocked by:** none.

**Related files:** `dnd-app/package.json`, `dnd-app/mobile/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `.github/dependabot.yml`, `.github/workflows/ci-hygiene.yml`

**Related entries:** RESOLVED-ISSUES.md [2026-06-23] biome engine drift; [2026-07-02] biome single-source; [2026-07-02 resolved] node-version single-sourcing (same "shared toolchain, many roots" family).

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


### [2026-07-15] Repo-wide onboarding/architecture docs never absorbed oracle-worker (or dnd-app/mobile) — ARCHITECTURE, DATA-FLOW, SETUP, COMMANDS, GLOSSARY, and copilot-instructions still describe a three-project repo

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled cross-cutting cleanup scan (2026-07-15); comparing the repo-wide `docs/` set and the five agent-instruction files against the actual project set.

**Description:**
The mechanical surfaces fully absorbed the fourth project: `Makefile` fans out to oracle-worker for install/lint/typecheck/test/build/audit, `.github/dependabot.yml` and `oracle-worker-ci.yml`/`oracle-worker-deploy.yml` cover it, `.husky/pre-commit` has an oracle-worker pre-flight block, and `docs/LOG-INSTRUCTIONS.md` has an explicit oracle-worker triage edge-case. The *human-facing repo-wide docs* did not: `docs/ARCHITECTURE.md` is titled "dnd-app + bmo + dungeon-scholar", opens with "How the three projects relate", and its Project-boundaries table has exactly three rows (no oracle-worker, no mobile); `docs/DATA-FLOW.md` has zero oracle-worker mentions; `docs/SETUP.md` ("Full clone-to-running guide") has no oracle-worker or dnd-app/mobile setup section (zero "mobile" hits); `docs/COMMANDS.md` has per-directory sections for dnd-app/bmo/dungeon-scholar but none for oracle-worker or mobile; `docs/GLOSSARY.md` has no Oracle/oracle-worker entry. Worst is `.github/copilot-instructions.md`: its "Monorepo Layout" block lists only three projects (plus `_archive`/`docs`), asserts "Three domains.", and is the ONLY one of the five agent-instruction files with zero oracle-worker mentions — so Copilot PR review is working from a project map that predates the fourth project. The root `README.md` got the equivalent fix on 2026-07-02 (RESOLVED-ISSUES.md: "Root README pointer list omits oracle-worker"), but the sweep stopped at README; the rest of the doc set kept the three-project worldview.

**Hypothesis / root cause:** oracle-worker (and the mobile npm root) were added after the repo-wide docs were written; each integration touchpoint (CI, Makefile, dependabot, hooks, log triage) was updated when it broke or was scanned, but nothing forces the prose docs to enumerate the project set, so they silently aged. Same convention-without-mechanism family as the dormant SYNC:agents guard.

**Proposed fix / improvement:**
- [ ] Add an oracle-worker row (runtime: Cloudflare Worker, wrangler; talks to: dungeon-scholar Oracle proxy) and a dnd-app/mobile note to `docs/ARCHITECTURE.md`'s boundaries table, and retitle/reword the "three projects" framing.
- [ ] Add oracle-worker + mobile sections (or one-line pointers to their READMEs) to `docs/SETUP.md` and `docs/COMMANDS.md`; add Oracle / oracle-worker to `docs/GLOSSARY.md`; mention the oracle-worker hop in `docs/DATA-FLOW.md` where dungeon-scholar's Oracle flow appears.
- [ ] Update `.github/copilot-instructions.md`'s Monorepo Layout + "Three domains" claim to the real project set (four projects + mobile), and fold this file into whichever SYNC-marker/pointer fix the 2026-07-02 drift-guard entry lands on so it cannot silently age again.

**Blocked by:** none.

**Related files:** `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, `docs/SETUP.md`, `docs/COMMANDS.md`, `docs/GLOSSARY.md`, `.github/copilot-instructions.md`, `oracle-worker/README.md`

**Related entries:** RESOLVED-ISSUES.md -> [2026-07-02] "Root README.md pointer list omits oracle-worker/README.md" (this is the rest of that sweep); SUGGESTIONS-LOG.md -> [2026-07-02] SYNC:agents drift-guard entry (copilot-instructions is its worst live instance).

### [2026-07-15] Two contradictory bmo deploy runbooks — `bmo/docs/DEPLOY.md` still teaches the pre-decoupling "pull the shared dev tree" model that `docs/BMO-DEPLOY.md` was written to replace, with no cross-links and `docs/COMMANDS.md` deep-linking only the stale one

- **Category:** docs
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled cross-cutting cleanup scan (2026-07-15); reviewing `docs/` organization for duplicated/contradictory runbooks spanning repo-wide docs and per-project docs.

**Description:**
The repo has two deploy runbooks for the same process that describe different models. `docs/BMO-DEPLOY.md` (canonical per its own header and per `AUTOMATED-AGENT-GIT-WORKFLOW.md`'s deploy note) documents the decoupled model: `deploy.sh` fetch+`reset --hard`s a dedicated deploy-owned checkout at `/home/patrick/home-lab-deploy`, precisely so the shared dev/integrator tree can never pollute a deploy. `bmo/docs/DEPLOY.md` (263 lines, zero mentions of `home-lab-deploy` or BMO-DEPLOY.md) still describes deploys as operating on the shared dev tree: "fetches, ff-only merges" in `~/home-lab`, a "raw fallback" of `ssh … "cd ~/home-lab && git pull && sudo systemctl restart bmo"` (mutating the tree ~16 scheduled agents and the integrator coordinate on — exactly the failure mode the decoupling exists to prevent), and dependency updates via `cd ~/home-lab/bmo/pi && ./venv/bin/pip install …` (the dev tree's venv, no longer necessarily what the live services run). Neither doc links the other, so a reader landing on either has no signal a second, disagreeing runbook exists — and the repo-wide cheat sheet `docs/COMMANDS.md` deep-links ONLY the stale one ("BMO deploy: ../bmo/docs/DEPLOY.md"). The offline link checker (`check-md-links.sh`) can't catch this: every link resolves; the drift is semantic. This is a one-process-two-homes docs-organization failure spanning `docs/` and `bmo/docs/`.

**Hypothesis / root cause:** PHASE-42 introduced `deploy.sh` and partially updated `bmo/docs/DEPLOY.md` (it does recommend the script), but the later deploy-decoupling work (`/home/patrick/home-lab-deploy`, documented in the new top-level `docs/BMO-DEPLOY.md`) never swept the older per-project runbook, and no "one home per runbook" convention exists to force the merge.

**Proposed fix / improvement:**
- [ ] Make `docs/BMO-DEPLOY.md` the single deploy runbook. Rewrite `bmo/docs/DEPLOY.md` as a short pointer to it, keeping only the genuinely bmo-local dev ergonomics (partial-restart table, hot-reload loop) — updated to state they apply to on-Pi *development*, not deploys, and that live services run from the deploy checkout.
- [ ] Delete/replace the "raw fallback" `git pull` in `~/home-lab` guidance (the shared dev tree must not be a deploy path) and fix the pip-update section to target the checkout the services actually run from.
- [ ] Point `docs/COMMANDS.md`'s "BMO deploy" link at `docs/BMO-DEPLOY.md`, and cross-link the two docs.
- [ ] Optionally note the convention in `docs/CONTRIBUTING.md`: a process gets ONE canonical runbook; per-project docs point, they do not restate.

**Blocked by:** none.

**Related files:** `bmo/docs/DEPLOY.md`, `docs/BMO-DEPLOY.md`, `docs/COMMANDS.md`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `bmo/pi/scripts/deploy.sh`

**Related entries:** BMO-ISSUES-LOG.md -> [2026-07-15] deploy-isolation violation (live MCP child spawned from the dev tree — the runtime cousin of this docs split); RESOLVED-ISSUES.md -> the deploy-decoupling introduction entry.
