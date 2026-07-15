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


