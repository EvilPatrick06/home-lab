# Resolved issues (split by domain)

This file is a **compatibility pointer**. Fixed issues and suggestions are archived in three places:

- **BMO:** [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
- **dnd-app:** [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
- **dungeon-scholar:** [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting resolved (overall-resolver)

> Resolved cross-cutting / `Domain: both` entries moved out of `ISSUES-LOG.md` + `SUGGESTIONS-LOG.md`. Newest first.

### [2026-07-02] `workflow_run` trigger lists are coupled to workflow `name:` strings with no drift guard — a rename silently disables the bmo auto-deploy (and the incoming CI-failure triage)

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added check-ci-hygiene.sh GUARD 6: every workflow_run.workflows reference must resolve to a declared workflow name:, so a rename fails CI instead of silently severing the trigger. Noted in CONTRIBUTING.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] CI concurrency convention has gaps: dungeon-scholar-ci + four mechanical-guard workflows have no `concurrency:` group, so push bursts pile up redundant runs

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added concurrency: blocks to dungeon-scholar-ci, agent-docs-check, bmo-no-new-prints, ci-hygiene, dnd-e2e (cancel:true) and secret-scan (false). GUARD 7 now requires every push-triggered workflow to declare one.
- **Branch:** auto/xcut-hygiene

### [2026-07-02] The repo-wide canonical process doc lives at `dnd-app/docs/phases/INSTRUCTIONS.md` — every referencing doc needs a "despite its path" disclaimer

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added top-level pointer docs/PHASE-EXECUTION.md (indexed in docs/README.md + root README) to the canonical dnd-app/docs/phases/INSTRUCTIONS.md; did NOT relocate (out-of-repo SKILL.md task defs cite the path).
- **Branch:** auto/xcut-hygiene

### [2026-07-02] `.husky/pre-commit`: dungeon-scholar gate is split into two non-adjacent blocks, and the second mislabels dungeon-scholar as "(VTT)"

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Merged the dungeon-scholar vitest pre-flight into the single staged() biome block; removed the duplicate and the wrong '(VTT)' label + stale note.
- **Branch:** auto/xcut-hygiene

### [2026-07-02] `.gitattributes` QA-screenshot LFS rules are copy-pasted per project × extension (15 lines); a fourth phases dir or new image extension silently bypasses LFS

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Collapsed the per-project QA-screenshot LFS lines into generic **/docs/phases/QA/screenshots + completed/screenshots globs (verified existing LFS-tracked shots still match).
- **Branch:** auto/xcut-hygiene

### [2026-07-02] Node-version floor is declared in `.nvmrc` + three `engines` fields, but `dnd-app/mobile/package.json` has no `engines` — the one lockfile without the guard

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added engines.node>=22 to dnd-app/mobile/package.json; convention noted in CONTRIBUTING.
- **Branch:** auto/xcut-hygiene

### [2026-07-02] Root `README.md` "Each project's own README" pointer list omits `oracle-worker/README.md` (3 of 4 projects listed)

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added oracle-worker/README.md to the root README per-project pointer list.
- **Branch:** auto/xcut-hygiene

### [2026-07-02] No markdown link-integrity check across the ~283 tracked docs, while the docs ARE the agent-coordination fabric and files are regularly relocated to `_archive/`

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added scripts/check-md-links.sh (offline relative-link checker) + a warn-only md-links job in ci-hygiene.yml (pre-existing ~180-link backlog reported, not failing).
- **Branch:** auto/xcut-hygiene

### [2026-07-02] Biome version has no single source across the three biome projects + root husky hook — and has already drifted (dnd-app ^2.5.1 vs mobile ^2.5.0 vs dungeon-scholar/hook inline 2.5.0)

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Aligned all biome pins to 2.5.1 (mobile devDep, dungeon-scholar scripts); repointed husky mobile block at local binary; GUARD 10 asserts versions match.
- **Branch:** auto/xcut-hygiene

### [2026-07-02] `dnd-app/mobile` is the only JS project without an `engines.node` pin — the unswept tail of the resolved 2026-06-22 Node single-sourcing entry

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added engines.node>=22 to dnd-app/mobile/package.json.
- **Branch:** auto/xcut-hygiene

### [2026-07-02] No in-repo registry of the scheduled-agent fleet — agent ids, scopes, branches, and log targets are only discoverable by cross-reading the workflow doc and log bylines

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added docs/AGENT-FLEET.md (id/domain/kind/branch/log per agent); indexed in docs/README.md + root README.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] Supply-chain pinning is uneven: GitHub Actions are SHA-pinned + Dependabot-tracked, but the bmo Docker base image is tag-floated and has NO `docker` Dependabot ecosystem

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Digest-pinned the bmo Docker base image and added a docker Dependabot ecosystem for /bmo/docker.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] CI hygiene convention gap: 15 of 19 workflows declare no job `timeout-minutes`, so a hung step can burn the 6-hour default-runner ceiling under the high-churn agent model

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added timeout-minutes to every workflow job lacking one; GUARD 8 now requires each job to declare a timeout.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] dnd-app/mobile shares dnd-app src/shared via tsconfig path-mapping; TS project references evaluated and rejected

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Documented the chosen long-term approach (keep the tsconfig @shared/* path alias) in CONTRIBUTING mobile-shared-src note; no restructuring.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] No shared `tsconfig.base.json` parallel to `biome.base.json` — TS compiler defaults are defined independently per project

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added root tsconfig.base.json with shared compiler defaults; wired dnd-app web/node, dungeon-scholar, oracle-worker to extend it (mobile keeps expo base, documented).
- **Branch:** auto/xcut-hygiene

### [2026-06-29] `dnd-app` is the only JS project missing the canonical `typecheck` npm script that CONTRIBUTING documents and the other three define

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added typecheck script to dnd-app/package.json and repointed the Makefile typecheck recipe at npm run typecheck.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] `_archive/README.md` "What's inside" tree is stale — three of the five batch dirs are undocumented in the index

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added the three missing batch dirs to _archive/README.md tree and noted the index-tracks-batches convention.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] `audit:ci` vulnerability threshold diverges across projects — the security-sensitive oracle-worker uses the *loosest* level (`high`) while the rest use `moderate`

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Tightened oracle-worker audit:ci from high to --omit=dev --audit-level=moderate (did not loosen anything); switched its security-audit.yml job to npm run audit:ci.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] Audit-coverage parity gap: `dnd-app/mobile` has no `npm audit` gate (no `audit:ci` script, absent from `security-audit.yml`); `make audit` also omits mobile + bmo

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added audit:ci to dnd-app/mobile, a mobile-npm-audit job to security-audit.yml, and extended make audit to include mobile.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] `dnd-app/mobile` has no local pre-commit floor — the husky hook's `^dnd-app/` block runs dnd-app's web checks, not mobile's own biome/tsc

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added a dedicated dnd-app/mobile block to .husky/pre-commit running mobile's own biome + tsc.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] CI hygiene lints workflows for *security* (zizmor) but not *correctness* — no `actionlint` job to catch shell/expression bugs

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added an actionlint job to ci-hygiene.yml (pinned, SHA-256-verified binary) alongside zizmor; updated the check-ci-hygiene.sh header.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] Repo-root `scripts/` has no README — the only shared-tooling dir without an index, while bmo/pi/scripts and dnd-app/scripts both already have one logged

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added scripts/README.md (one-line-per-script index) and recorded the every-scripts-dir-has-an-index convention in CONTRIBUTING.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] Build/tooling config file-extension convention diverges across the two Vite projects: dnd-app uses `.ts`, dungeon-scholar uses `.js`

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Recorded the TS-tooling-config convention in CONTRIBUTING; dungeon-scholar .js configs may migrate when touched (documented, not bulk-renamed).
- **Branch:** auto/xcut-hygiene

### [2026-06-29] `docs/README.md` index mislabels `CHANGELOG.md` as "Release history" and omits the living-changelog + per-project CHANGELOG convention

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Reworded docs/README.md + root README CHANGELOG rows to 'frozen archive (<= v2.1.16); current notes on GitHub Releases' and noted per-project CHANGELOGs.
- **Branch:** auto/xcut-hygiene

### [2026-06-29] Five byte-identical `LICENSE` files (root + each package) with no single source or drift guard

- **Resolved by:** overall-resolver (automated, cross-cutting hygiene sweep)
- **Date resolved:** 2026-07-03
- **Resolution:** Added check-ci-hygiene.sh GUARD 9 asserting every */LICENSE matches root LICENSE; documented the per-package-copy convention in CONTRIBUTING.
- **Branch:** auto/xcut-hygiene


### [2026-07-02] Gitignored `SECURITY-LOG.md` is incompatible with the per-agent-worktree model: worktree appends are silently lost, main-checkout writes race unserialized

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-07-02
- **Resolution:** Adopted convention (a) — the smallest change: automated agents append security entries directly to the MAIN checkout's gitignored `docs/logs/SECURITY-LOG.md` / `RESOLVED-SECURITY-ISSUES.md`, serialized via `flock /home/patrick/home-lab-locks/security-log.lock` (the lock host tooling already used, now documented). Documented in `docs/LOG-INSTRUCTIONS.md` (security section: new worktree-agents guidance incl. the dedup-grep caveat and the read-modify-write-under-flock rule), added a Rule 2 exception paragraph to `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, and corrected the `AGENTS.md` sentence that overstated union-merge protection for `SECURITY-LOG`.
- **Branch:** auto/overall-resolver

- **Category:** config, debt
- **Original severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting scan of the automated-agent git workflow vs. the logging conventions

**Description:**
`docs/logs/SECURITY-LOG.md` is gitignored (`.gitignore:140`) and exists only in the main checkout working tree (`/home/patrick/home-lab/docs/logs/SECURITY-LOG.md`, actively written — mtime today). But since the 2026-06-22 incident every automated agent works in its own worktree at `/home/patrick/home-lab-trees/<agent-id>` (Rule 1, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`), where the gitignored file does NOT exist. `docs/LOG-INSTRUCTIONS.md` directs ALL security entries (any domain) to `SECURITY-LOG.md` with no worktree guidance, which leaves two failure modes: (1) an agent that follows the instructions literally appends to `docs/logs/SECURITY-LOG.md` **inside its worktree** — the file is untracked, never rides the `auto/*` branch, is never merged by the integrator, and is deleted with the worktree: the security finding is **silently lost**; (2) an agent that instead writes directly to the main checkout's copy bypasses every safety mechanism that the worktree model added — no branch isolation, no union merge (the `.gitattributes` `SECURITY-LOG*` union rule is inert on an untracked file, as the workflow doc itself notes), and only an out-of-repo, undocumented lock (`/home/patrick/home-lab-locks/security-log.lock` exists on the host, so some agent tooling does flock the file — but no repo doc mentions it, so nothing guarantees every writer uses it) — so a security-logging agent that skips the undocumented lock can interleave with or clobber another (exactly the lost-update class the 2026-06-22 fix eliminated for the tracked logs). `AGENTS.md` (the "append-only logs … use a merge=union driver" sentence) even lists `SECURITY-LOG` among the union-protected logs, overstating the protection.

**Expected behavior:** one documented, race-safe convention for security logging from automated agents — e.g. (a) each agent appends via a small helper that flocks the main-checkout file, or (b) agents write per-agent security fragments that a single consumer consolidates, or (c) the log is split like the other logs and tracked with entries kept value-free (the "never log the secret value" rule already targets this) so it rides branches + union merge like everything else.

**Hypothesis / root cause:** the worktree/branch model (2026-06-22) was retrofitted onto the logging conventions, and `SECURITY-LOG.md` — the only *gitignored* active log — was overlooked because git-based protections (branch isolation + union merge) simply don't apply to it. Verified: `.gitignore:140`; file absent from a fresh worktree; present + recently modified in the main checkout; no guidance in `LOG-INSTRUCTIONS.md` / `AUTOMATED-AGENT-GIT-WORKFLOW.md` on which path a worktree agent should write.

**Proposed fix / improvement:**
- [ ] Decide the convention (flock-guarded append to the main-checkout file is the smallest change; the notify/board tooling already lives outside the repo similarly).
- [ ] Document it in `docs/LOG-INSTRUCTIONS.md` (security section) and `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 2 caveat.
- [ ] Correct the `AGENTS.md` sentence that implies `SECURITY-LOG` gets union-merge protection.

**Related files:** `.gitignore`, `docs/logs/SECURITY-LOG.md` (untracked), `docs/LOG-INSTRUCTIONS.md`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `AGENTS.md`

**Related entries:** `RESOLVED-ISSUES.md` -> 2026-06-22/23 worktree-model entries (this is the one log the model doesn't cover).

### [2026-07-02] `LOG-INSTRUCTIONS.md` grep-first dup-check + resolved-routing are stale: they omit the cross-cutting pointer logs (`ISSUES-LOG.md`, `SUGGESTIONS-LOG.md`) and `RESOLVED-ISSUES.md`

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-07-02
- **Resolution:** Added the two cross-cutting pointer logs (`ISSUES-LOG.md`, `SUGGESTIONS-LOG.md`) to the grep-first dedup command; fixed the Quick-reference count (five → seven tracked active logs); amended the after-fix routing so repo-wide `Domain: both` pointer-log entries archive to `RESOLVED-ISSUES.md`'s `## Cross-cutting resolved` section (mirrored multi-project entries keep the per-domain routing) and added the matching line to the Quick reference; added a `RESOLVED-ISSUES.md` row to the 'Which log goes where' table. Also closes the duplicate SUGGESTIONS-LOG entry (2026-07-02, resolved-cross-cutting routing) via the same change — archived just below.
- **Branch:** auto/overall-resolver

- **Category:** config, docs
- **Original severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting scan; followed the doc's own grep-first procedure and noticed it cannot find this log's entries

**Description:**
`docs/LOG-INSTRUCTIONS.md` predates (in three spots) the cross-cutting pointer-log model it elsewhere describes. (1) The canonical grep-first dedup command ("How to append", line ~210) enumerates seven logs but omits `docs/logs/ISSUES-LOG.md` and `docs/logs/SUGGESTIONS-LOG.md` — the exact logs the `overall-*` scanners write to. An agent following it verbatim will never see an already-logged cross-cutting entry and will re-log duplicates (the anti-dup rule defeats itself for the cross-cutting domain). (2) The Quick-reference says "grep all five tracked active logs" — there are seven tracked active logs. (3) The "After fixing a logged issue" routing lists only the three per-domain resolved archives (+ security) and says `Domain: both` entries file under the domain the fix touched — but actual practice (and `RESOLVED-ISSUES.md` itself, which carries a "## Cross-cutting resolved (overall-resolver)" section with entries since 2026-06-29) is to archive resolved pointer-log entries in `RESOLVED-ISSUES.md`. The doc never names `RESOLVED-ISSUES.md` as a valid destination, so doc and practice diverge; the "Which log goes where" table likewise omits it (and `RESOLVED-ISSUES-DNDAPP.md`'s cross-cutting sibling role).

**Expected behavior:** the dedup grep covers all active tracked logs including both pointer logs; the Quick-reference count matches; the resolved-routing table names `RESOLVED-ISSUES.md` (cross-cutting section) as the archive for pointer-log entries, matching what `overall-resolver` already does.

**Hypothesis / root cause:** the pointer-log `# Cross-cutting` sections were introduced (~2026-06-29, per the routing paragraphs added to `ISSUES-LOG.md`/`SUGGESTIONS-LOG.md` headers) after `LOG-INSTRUCTIONS.md`'s procedural sections were last swept; only the triage table was updated, not the grep command / quick-reference / resolved-routing.

**Proposed fix / improvement:**
- [ ] Add `docs/logs/ISSUES-LOG.md docs/logs/SUGGESTIONS-LOG.md` to the grep-first command.
- [ ] Fix the "five tracked active logs" count and add `RESOLVED-ISSUES.md` to the after-fix routing (cross-cutting entries -> its `## Cross-cutting resolved` section).
- [ ] While there, add `RESOLVED-ISSUES.md` to the "Which log goes where" table for completeness.

**Related files:** `docs/LOG-INSTRUCTIONS.md`, `docs/logs/ISSUES-LOG.md`, `docs/logs/SUGGESTIONS-LOG.md`, `docs/logs/RESOLVED-ISSUES.md`

**Related entries:** none (checked both pointer logs + per-domain logs for prior mentions).

### [2026-06-29] Master/PR-scoped CI gates (bmo-pytest, validate-5e, security-audit, codeql, docker) never run on `auto/*` branch pushes, so the integrator's "merge only green branches" check is blind to them

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-07-02
- **Resolution:** Implemented a split of proposed options (c)+(a). (c): dropped the `branches: [master]` push filter on the two cheap correctness gates `bmo-pi-pytest.yml` and `dnd-app-validate-5e.yml` — their path filters and cancel-in-progress concurrency bound per-branch cost — so bmo and 5e-data changes on `auto/*` branches now produce a real pre-merge red/green signal for the integrator. (a, documented): the expensive/scanner gates (`security-audit`, `codeql`, `bmo-docker-build`, deploys) stay master+PR-scoped, and the workflow doc's Release-flow section now states explicitly that a never-ran master-scoped gate is *unknown* (not green) for branches touching its paths and re-runs authoritatively on the master merge. This closes the asymmetry for the correctness gates while keeping scanner/build cost off every branch push.
- **Branch:** auto/overall-resolver

- **Category:** config, bug
- **Original severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting CI/deploy scan of `.github/workflows/` + the integrator gating model in `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

**Description:**
The repo's CI gates split into two trigger classes, and the split breaks the integrator's pre-merge safety check for several domains. The per-project *gates* `dnd-app-ci`, `dungeon-scholar-ci`, `oracle-worker-ci`, `dnd-app-mobile-ci` (plus `secret-scan`, `bmo-no-new-prints`, `agent-docs-check`, `ci-hygiene`) trigger on **unfiltered `push:`**, so they run on every `auto/<agent-id>` branch push and genuinely gate that branch. But the heavy correctness/security gates `bmo-pi-pytest.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`, `codeql.yml`, and `bmo-docker-build.yml` are scoped to **`push: branches: [master]`** (verified by enumerating all workflows). They therefore run only on a master push or on `pull_request` — **never on an `auto/*` branch push**. Per `AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 1, automated agents push their branch with `git push -u origin auto/<agent-id>` and do **not** open a PR. So for a branch-only push, none of those five gates ever execute. The integrator (Rule 3A) green-checks a non-PR branch with `gh run list --branch <branch>` — which can only show workflows that actually ran (the unfiltered set). A bmo-resolver branch that breaks `pytest`, or a 5e-data change that breaks `validate:5e`, or a dependency that trips `security-audit`, shows **no red signal on the branch** because the relevant gate never ran; the integrator reads the visible runs as green and merges. The master-scoped gates then fire **post-merge** on `master` and can go red. The doc explicitly accepts this ("the merge to master re-runs the master-scoped gates as the final authority"; a red consolidated push is "normal fix-forward"), so it is a documented tradeoff — but the consequence is a real **asymmetry**: pre-merge protection is strong for dnd-app/dungeon-scholar/oracle-worker/mobile changes and effectively **absent** for bmo, 5e-validation, npm/pip-audit, CodeQL, and docker changes, even though the code-changing resolver agents (`bmo-resolver`, `dnd-resolver`, `overall-resolver`, phase-executers) rely on this gate. Low blast radius today (app in testing; fix-forward culture), but it means "the integrator only merges branches whose CI is green" overstates the guarantee for ~5 of the repo's gates.

**Expected behavior:** Either (a) the integrator's branch green-check should treat a *never-ran* required gate as "not green / unknown" (not silently green) — e.g. confirm each path-relevant master-scoped workflow actually produced a run for the branch's HEAD before merging; or (b) the automated-agent flow should open a draft PR per `auto/*` branch (which triggers the `pull_request`-scoped gates) so all gates run pre-merge; or (c) drop the `branches: [master]` filter on the correctness gates that are cheap enough to run per-branch (mirroring `dnd-app-ci`). Whichever is chosen, the "merge only green" invariant and the gate trigger-scopes should be made consistent and documented together.

**Hypothesis / root cause:** The gates were authored at different times with two different trigger idioms (unfiltered `push` vs. `push: branches:[master]` + `pull_request`) and the integrator's `gh run list --branch` check implicitly assumes every required gate leaves a run on the branch. Because the automated agents never open PRs, the `pull_request` half of the master-scoped gates' triggers is never exercised either, so those gates only ever see master (post-merge). Confirmed by: trigger enumeration across `.github/workflows/` (5 gates master-scoped on push, 8 unfiltered); `gh run list --branch auto/bmo-errors` showing only `Secret scan` + `CI hygiene guards` ran, not `bmo / pi pytest` or `Security audit`; and Rule 1 of the workflow doc showing a branch-push-only agent setup with no PR step.

**Proposed fix / improvement:**
- [ ] Decide between (a) integrator treats a missing required-gate run as non-green, (b) auto-open a draft PR per `auto/*` branch, or (c) per-branch-run the cheap correctness gates.
- [ ] If (a): have the integrator assert, for each master-scoped gate whose paths the branch touched, that a completed run exists for the branch HEAD before merging — otherwise leave + report (Rule 3A).
- [ ] Reconcile the two trigger idioms so the gate set that protects a branch matches the gate set that runs on master, and document the chosen model alongside the Release-flow/CI section.

**Related files:** `.github/workflows/bmo-pi-pytest.yml`, `.github/workflows/dnd-app-validate-5e.yml`, `.github/workflows/security-audit.yml`, `.github/workflows/codeql.yml`, `.github/workflows/bmo-docker-build.yml`, `.github/workflows/dnd-app-ci.yml`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

**Related entries:** `ISSUES-LOG.md` -> [2026-06-29] dnd-web-deploy missing test gate (same "deploys/gates gated inconsistently" theme); `SUGGESTIONS-LOG-DNDAPP.md` -> mobile-has-no-CI (a stronger form of the same gating-blind-spot for Dependabot Rule 3B); `RESOLVED-ISSUES.md` -> subprojects-ci redundancy (touches the integrator CI-green check).

### [2026-07-02] `docs/LOG-INSTRUCTIONS.md` never documents where resolved *cross-cutting* entries go — the archive that actually receives them (`RESOLVED-ISSUES.md` "Cross-cutting resolved") is absent from its tables

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-07-02
- **Resolution:** Duplicate of the ISSUES-LOG 2026-07-02 `LOG-INSTRUCTIONS.md` staleness entry (its item 3); fixed by that entry's change (after-fix routing + 'Which log goes where' table + Quick reference now name `RESOLVED-ISSUES.md`'s Cross-cutting resolved section as the archive for pointer-log entries). See the resolution recorded on that entry above.
- **Branch:** auto/overall-resolver

- **Category:** docs
- **Original severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting docs-consistency scan of the logging docs vs. actual log-file layout

**Description:**
`docs/logs/RESOLVED-ISSUES.md` opens as a "compatibility pointer" but in practice carries a live `## Cross-cutting resolved (overall-resolver)` section where resolved `Domain: both` entries from the pointer logs are archived (e.g. the 2026-06-29 dnd-web-deploy gate fix), and `docs/README.md` lists it as the "cross-cutting pointer" archive. `docs/LOG-INSTRUCTIONS.md` — the canonical triage doc — disagrees on both counts: its "Which log goes where" table omits `RESOLVED-ISSUES.md` entirely, and its "After fixing a logged issue" section instructs that `Domain: both` entries be filed "under the domain whose codebase the fix actually touched" in a per-domain archive. So the doc that agents are told to read BEFORE logging describes a resolution flow the overall-resolver does not follow, and a resolver following LOG-INSTRUCTIONS to the letter would scatter cross-cutting resolutions across per-domain archives while the existing convention concentrates them in RESOLVED-ISSUES.md.

**Hypothesis / root cause:** the cross-cutting section was added to RESOLVED-ISSUES.md when the overall-* scanner/resolver family was introduced, and LOG-INSTRUCTIONS.md's after-fix table predates it and was never updated.

**Proposed fix / improvement:**
- [ ] Add `RESOLVED-ISSUES.md` (cross-cutting resolved archive) to LOG-INSTRUCTIONS.md's "Which log goes where" table.
- [ ] Amend the "After fixing" routing: repo-wide/structural `Domain: both` entries from the pointer logs → `RESOLVED-ISSUES.md` "Cross-cutting resolved"; mirrored multi-project entries → the per-domain archive of the codebase the fix touched (current wording), so both flavors are covered.

**Related files:** `docs/LOG-INSTRUCTIONS.md`, `docs/logs/RESOLVED-ISSUES.md`, `docs/README.md`

**Related entries:** none found (grepped for "Cross-cutting resolved" / "resolved archive" in the pointer logs).


### [2026-06-29] dnd-web-deploy shipped to the Pi with no test/lint/typecheck gate (could rsync test-failing code live)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Added an inline CI gate to `.github/workflows/dnd-web-deploy.yml`: the `deploy` job now runs `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, and `npm test` (in `dnd-app`) BEFORE `npm run build:web` and the rsync to `/home/patrick/web-apps/DungeonTableOnline`. So a commit that compiles yet fails lint / typecheck / vitest now fails the deploy job before anything reaches the Pi-served web SPA. Chose the inline-gate approach (option b in the original entry, mirroring `dungeon-scholar-deploy.yml`) over re-triggering via `workflow_run` on a green "dnd-app CI" run (option a, mirroring `bmo-deploy.yml`): the inline gate is self-contained, leaves the existing push-on-master trigger model untouched, and is verifiable here with cheap checks (YAML parse + check-ci-hygiene all-pass; actionlint not installed in this env). The duplicate compute vs. the concurrent dnd-app-ci run is acceptable — the deploy job is dormant-by-design without the TS_OAUTH secrets and only runs on master. Restores the repo-wide "live deploys are gated on green CI" convention so all three app deploys (bmo via workflow_run, dungeon-scholar inline, dnd-web inline) now gate on tests.
- **Branch:** auto/overall-resolver

- **Category:** config, bug
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting CI/deploy scan of `.github/workflows/`

**Description:**
The three app-deploy workflows gate on test results inconsistently. `bmo-deploy.yml` is health-gated: it triggers via `workflow_run` on a *successful* "bmo / pi pytest" run, so a red test suite blocks the deploy. `dungeon-scholar-deploy.yml` runs `npm run test` inline (step at line 33) *before* `npm run build` + Pages upload, so a failing test fails the deploy. `dnd-web-deploy.yml` does **neither** — its only steps are checkout, `setup-node-project`, `npm run build:web`, the Tailscale join, and the rsync to `/home/patrick/web-apps/DungeonTableOnline`. It triggers directly on every `push` to `master` touching `dnd-app/**` and runs *concurrently with* `dnd-app-ci.yml` (the real gate) rather than waiting for it. So a commit that compiles but fails lint / typecheck / vitest is still rsynced live to the Pi-served web SPA (`https://bmo.mybmoai.work/DungeonTableOnline/`). dnd-app is the only one of the three apps whose live deploy can ship test-failing code. Low blast radius today (app in testing, no real users), but it is a real gap in the repo-wide "deploys are gated on green CI" convention.

**Expected behavior:** dnd-web-deploy should only deploy a commit whose dnd-app CI is green — e.g. trigger via `workflow_run` on a successful "dnd-app CI" run (mirroring bmo-deploy), or add the test/typecheck steps inline before the rsync (mirroring dungeon-scholar-deploy).

**Hypothesis / root cause:** dnd-web-deploy was written as a pure build-and-rsync job; the test-gate convention was added to bmo-deploy (workflow_run) and dungeon-scholar-deploy (inline `npm run test`) but never back-filled onto dnd-web-deploy. Verified by reading all three workflow files; the absence of any test/lint/typecheck/tsc/vitest step in dnd-web-deploy is confirmed (grep returned none).

**Proposed fix / improvement:**
- [ ] Gate dnd-web-deploy on a green "dnd-app CI" run (`workflow_run` trigger like bmo-deploy) OR add `npm test` + the two `tsc --noEmit` typechecks before `build:web`.
- [ ] Once chosen, document the deploy-gating convention alongside the bmo-deploy/dungeon-scholar-deploy patterns so the three stay consistent.

**Related files:** `.github/workflows/dnd-web-deploy.yml`, `.github/workflows/bmo-deploy.yml`, `.github/workflows/dungeon-scholar-deploy.yml`, `.github/workflows/dnd-app-ci.yml`

### [2026-06-29] Deferred CI hardening guards implemented (node-pin, action SHA-pin, docs-index parity, superpowers orphan, permissions)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Added `scripts/check-ci-hygiene.sh` + `.github/workflows/ci-hygiene.yml`, mechanically enforcing the conventions prior resolutions left as optional hand-checked follow-ups: (1) no literal `node-version:` in workflows (must use `node-version-file: .nvmrc`); (2) every non-local GitHub Action pinned to a full 40-char commit SHA; (3) `docs/README.md` indexes every `docs/*.md`; (4) no tracked file under `docs/superpowers/` unreferenced by the README (recurrence guard for the archived design specs); (5) every workflow declares a top-level `permissions:` block. All five pass on the current tree. The repo default workflow-permission was found ALREADY set to `read`, so the SEC defense-in-depth item needed no change. A deeper actions linter (actionlint / zizmor) is left as a future enhancement, deliberately NOT added as a `curl | bash` install to avoid re-introducing the unverified-download pattern the gitleaks-checksum fix closed.
- **Branch:** auto/overall-resolver

- **Category:** config, security, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-resolver

**Original deferrals closed:** the `ISSUES-LOG` dnd-e2e CI-conventions entry (deferred grep-guard for literal node pins / mutable tags), the `SUGGESTIONS-LOG` superpowers-orphan + README-index entries (optional CI parity / recurrence checks), and the `SECURITY-LOG` dnd-e2e + gitleaks entries (mechanical pin / permissions lint).

### [2026-06-28] TypeScript type-checking coverage is uneven across the three TS projects — only dnd-app has a `tsc` gate

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Implemented per user request (2026-06-29). NOTE the original premise was wrong: dungeon-scholar and oracle-worker are JavaScript, not TypeScript, so this ADDS checkJs-based type-checking rather than gating existing TS. oracle-worker: added tsconfig.json (allowJs+checkJs, non-strict, @cloudflare/workers-types) + typecheck script + a BLOCKING Typecheck step in oracle-worker-ci.yml + Makefile entry — 0 errors, fully gated. dungeon-scholar: added tsconfig.json (allowJs+checkJs, non-strict, jsx react-jsx, scoped to src, sw.js excluded) + src/vite-env.d.ts + typecheck script; wired a NON-BLOCKING (continue-on-error) Typecheck step into dungeon-scholar-ci.yml and a leading-`-` Makefile entry, because checkJs surfaces 167 pre-existing untyped-JS errors (tracked in ISSUES-LOG-DUNGEON-SCHOLAR.md for burndown; flip to blocking once green). Installed typescript + @types/react/react-dom/node (dungeon-scholar) and typescript + @cloudflare/workers-types (oracle-worker). Makefile typecheck now fans out to all four areas (dnd-app + oracle-worker enforced; dnd-app/mobile + dungeon-scholar non-blocking). dnd-app/mobile, the one genuinely-TS surface, was wired in the companion mobile entry.
- **Branch:** auto/overall-resolver

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI/tooling review

**Description:**
Three of the repo's code areas are TypeScript, but only `dnd-app` is ever type-checked. `dnd-app` runs `tsc --noEmit` (Makefile `typecheck` + `dnd-app-ci`). `dungeon-scholar` has **no `tsconfig*.json` and no typecheck/`check` script at all** — Vite/esbuild transpiles by stripping types without checking them, so a type error there only ever surfaces at runtime. `oracle-worker` has only `check: wrangler deploy --dry-run` (an esbuild bundle, not a full project type-check). So two production TS surfaces ship with zero compiler-enforced type safety, while a third is fully gated — an inconsistency that mirrors the (now-resolved) lint/audit-coverage gaps overall-suggestor previously closed for these same two projects. The Makefile documents the omission ("dungeon-scholar has no tsconfig/tsc step … Revisit if either gains a tsconfig") but it is not tracked as an improvement.

**Hypothesis / root cause:** Both projects were bootstrapped from Vite/Wrangler templates that rely on the bundler for transpile and never added a standalone `tsc` config; the bundler-transpiles-so-no-typecheck assumption was accepted as permanent rather than as debt.

**Proposed fix / improvement:**
- [ ] Add a `tsconfig.json` (strict) + `"typecheck": "tsc --noEmit"` script to `dungeon-scholar`, and a `"typecheck": "tsc --noEmit"` (or `wrangler types` + tsc) to `oracle-worker`.
- [ ] Extend Makefile `typecheck` to fan out to all three TS projects (today it covers dnd-app only, by design-note).
- [ ] Wire the new typecheck step into `dungeon-scholar-ci` / `oracle-worker-ci`.
- [ ] Optionally add a shared `tsconfig.base.json` at repo root (parallel to the existing `biome.base.json`) so the three projects share compiler-strictness defaults.

**Related files:** `dungeon-scholar/package.json`, `oracle-worker/package.json`, `Makefile`, `.github/workflows/dungeon-scholar-ci.yml`, `.github/workflows/oracle-worker-ci.yml`, `biome.base.json`

### [2026-06-28] New `dnd-e2e.yml` workflow violates two established repo-wide CI conventions (literal Node pin + unpinned/mutable action tags)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** In `.github/workflows/dnd-e2e.yml` replaced the mutable `actions/checkout` / `actions/setup-node` tags with the repo SHA-pinned refs (checkout SHA-pinned directly; node bootstrap via the new `./.github/actions/setup-node-project` composite which SHA-pins setup-node) and switched the literal `node-version: 22` to the shared `.nvmrc` (+ npm cache), so it no longer drifts from the monorepo Node pin; also added `permissions: contents: read` (paired security fix). At fix time the file had already drifted to `@v7`/`@v6` (not `@v4` as logged) — fixed against the real file. The optional CI grep-guard for literal pins / mutable tags is left as a future enhancement; actionlint was adopted as the validation tool. Resolves jointly with the SECURITY-LOG `dnd-e2e.yml missed by both hardening passes` entry.
- **Branch:** auto/overall-resolver

- **Category:** config
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** Automated cross-cutting scan of `.github/workflows/` for action-pinning and Node-version-pinning consistency across the monorepo.

**Description:**
`.github/workflows/dnd-e2e.yml` (added 2026-06-28 in `71859ade`, the Playwright e2e smoke harness) was authored without the two CI conventions the rest of the repo standardized days earlier, making it the lone holdout on both:

1. **Mutable, unpinned action tags.** It uses `actions/checkout@v4` and `actions/setup-node@v4`. Every other workflow in `.github/workflows/` pins third-party/first-party actions to a full commit SHA with a trailing `# vN` comment (e.g. `actions/checkout@9c091bb… # v7`, `actions/setup-node@48b55a… # v6`, `tailscale/github-action@306e68a… # v4`). dnd-e2e is the only workflow using a floating major-version tag, so it (a) is the single supply-chain-hardening gap — a mutable tag can be repointed upstream, which SHA-pinning exists to prevent — and (b) is not managed consistently by the `github-actions` Dependabot ecosystem the way the SHA-pinned `# vN` comments are.
2. **Literal Node pin instead of `.nvmrc`.** It hardcodes `node-version: 22` rather than `node-version-file: .nvmrc`. This re-introduces exactly the drift the 2026-06-22 `.nvmrc` consolidation and the 2026-06-24 follow-up ("Monorepo Node pin incomplete — 4 CI jobs still hardcode node-version") eliminated repo-wide. It is now the ONLY `node-version:` literal in the repo (every other setup-node step reads `.nvmrc`). Harmless while `.nvmrc` is `22`, but a future bump silently strands the e2e job on Node 22. It also falsifies the standing claim in `docs/logs/SUGGESTIONS-LOG.md` (2026-06-24 Python-pin entry) that "**every** Node workflow reads it via `node-version-file: .nvmrc`."

**Hypothesis / root cause:** New workflow authored from memory/an old template rather than by copying a current sibling workflow. The 2026-06-24 node-pin resolution explicitly **deferred** the optional CI grep-guard that would forbid re-introducing a literal `node-version:` pin ("left as a future enhancement"), and there is no guard forbidding mutable action tags either — so nothing caught the regression at commit time. (dnd-e2e is non-blocking / PR+dispatch-only, which is why no required gate flagged it.)

**Proposed fix / improvement:**
- [ ] In `dnd-e2e.yml`, replace `actions/checkout@v4` / `actions/setup-node@v4` with the same SHA-pinned `# vN` references the sibling workflows use.
- [ ] Replace `node-version: 22` with `node-version-file: .nvmrc` (and add `cache: npm` / `cache-dependency-path: dnd-app/package-lock.json` to match siblings).
- [ ] Land the deferred CI grep-guard(s) so re-introducing a literal `node-version:` pin or a mutable (non-SHA) action tag fails CI, preventing the next instance of this drift.

**Related files:** `.github/workflows/dnd-e2e.yml`, `.nvmrc`, `.github/dependabot.yml` (github-actions ecosystem)

**Related entries:** RESOLVED-ISSUES.md [2026-06-24] "Monorepo Node pin incomplete — 4 CI jobs still hardcode node-version"; SUGGESTIONS-LOG.md [2026-06-24] "No `.python-version` analog to `.nvmrc`" (asserts every Node workflow reads `.nvmrc`).

### [2026-06-28] LOG-INSTRUCTIONS.md triage table never names the cross-cutting pointer logs as the home for `Domain: both` items — three docs disagree

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Reconciled `Domain: both` routing across all three docs. `LOG-INSTRUCTIONS.md`: added rows for the two cross-cutting pointer logs to the Which-log-goes-where table; split the `Domain: both` triage cells to `repo-wide/structural -> pointer log; else mirror per domain`; replaced the deliberately-duplicates bullet with an explicit repo-wide-vs-multi-project routing rule. Aligned the `ISSUES-LOG.md` and `SUGGESTIONS-LOG.md` headers to the same wording. A reader following LOG-INSTRUCTIONS now discovers the pointer logs and routes repo-wide items there instead of triplicating across domain logs.
- **Branch:** auto/overall-resolver

- **Category:** docs
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Automated cross-cutting scan of `docs/` organization and repo-wide logging conventions.

**Description:**
Three places describe where a repo-wide `Domain: both` entry should be logged, and they disagree:

1. `docs/LOG-INSTRUCTIONS.md` (the canonical "how to log" doc) — its triage table and Quick-reference say `Domain: both` items are **"mirror[ed] in each relevant log"** (i.e. duplicated across the per-domain `BMO-*` / `*-DNDAPP` / `*-DUNGEON-SCHOLAR` logs). It **never mentions** `ISSUES-LOG.md` or `SUGGESTIONS-LOG.md` as a destination at all.
2. `docs/logs/ISSUES-LOG.md` header — also says *"`Domain: both` items are **mirrored in both** logs — fix once, remove from both."*
3. `docs/README.md` index and the actual files — describe `ISSUES-LOG.md` / `SUGGESTIONS-LOG.md` as the **"cross-cutting pointer"** logs, and both files carry a dedicated `# Cross-cutting issues` / `## Cross-cutting / repo-wide suggestions` section. In practice the cross-cutting scanners write there directly: the `overall-errors` scanner's repo-wide finding sits inline in `ISSUES-LOG.md`, and the `overall-cleanup` scanner (this one) is instructed to append repo-wide suggestions to `SUGGESTIONS-LOG.md`.

So the de-facto convention is "repo-wide `Domain: both` -> the pointer log," but the document that's supposed to teach logging (`LOG-INSTRUCTIONS.md`) tells a reader to mirror into the three domain logs instead, and never surfaces the pointer logs. A future agent following `LOG-INSTRUCTIONS.md` literally will either triplicate a repo-wide item across domain logs or fail to discover the pointer logs entirely.

**Hypothesis / root cause:** The cross-cutting pointer-log pattern (`ISSUES-LOG.md` / `SUGGESTIONS-LOG.md` with explicit cross-cutting sections, fed by the `overall-*` scanners) was introduced after `LOG-INSTRUCTIONS.md`'s domain-split triage table was written, and the triage table / Quick-reference were never updated to add the "repo-wide `Domain: both` -> pointer log" row. The `merge=union` `.gitattributes` globs already cover `ISSUES-LOG*` and `SUGGESTIONS-LOG*`, so the mechanism is wired — only the documentation lags.

**Proposed fix / improvement:**
- [ ] Add a `Domain: both` (repo-wide / cross-cutting) row to the `LOG-INSTRUCTIONS.md` triage table and Quick-reference pointing at `docs/logs/ISSUES-LOG.md` (bugs/debt) and `docs/logs/SUGGESTIONS-LOG.md` (future ideas), describing them as the single home for whole-repo structural/convention items.
- [ ] Reconcile the wording: decide whether genuinely multi-domain (but per-project) items mirror into the domain logs while *repo-wide structural* items go in the pointer logs, and state that distinction once, consistently, in all three places (`LOG-INSTRUCTIONS.md`, `ISSUES-LOG.md` header, `SUGGESTIONS-LOG.md` header).

**Related files:** `docs/LOG-INSTRUCTIONS.md`, `docs/logs/ISSUES-LOG.md`, `docs/logs/SUGGESTIONS-LOG.md`, `docs/README.md`

### [2026-06-28] `docs/superpowers/` orphan recurred — a new implemented design spec re-populated the just-archived dir and is again absent from the docs index

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** `git mv`d the IMPLEMENTED spec `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md` into `_archive/2026-06-29-completed-docs/superpowers/specs/` per the `_archive/` convention, with a provenance note in `_archive/README.md` (sibling of the 2026-06-22 superpowers batch). The recurrence guard (redirect the `superpowers` skill output to an indexed dir, or a CI docs-parity check) overlaps SUGG-3 and is left as an optional follow-up.
- **Branch:** auto/overall-resolver

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Automated cross-cutting scan of `docs/` organization (orphaned / unindexed files).

**Description:**
On 2026-06-22 a cleanup moved the six stale `docs/superpowers/{plans,specs}` design docs into `_archive/2026-06-22-completed-docs/superpowers/` (see RESOLVED-ISSUES.md "[2026-06-22] `docs/superpowers/` is an undocumented, opaquely-named plans/specs dir orphaned from the docs index"). One day later (2026-06-23) the **same** directory was re-created with a single new file, `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md`. It reproduces the exact condition the prior cleanup resolved:
- It is referenced by **no** markdown file in the repo (grep for "superpowers" outside `_archive/` and `docs/logs/` returns nothing).
- It is **absent from the `docs/README.md` index** (added 2026-06-23, the same day).
- The dir name "superpowers" names the authoring agent skill, not the content — undiscoverable by a new reader.
- Its own header marks it **"Status: IMPLEMENTED — code complete + verified … pending deploy + cross-device E2E,"** i.e. a completed design doc — exactly the class the `_archive/` convention exists for, the same as its six now-archived siblings.

**Hypothesis / root cause:** The `superpowers` agent skill writes design specs to `docs/superpowers/specs/` by default; the 2026-06-22 archival cleaned out the contents but did not remove/redirect the directory or add a guard, so the next spec landed back in the same orphaned location a day later. This is a recurrence of a just-resolved cleanup, so a one-time move alone won't prevent the next instance.

**Proposed fix / improvement:**
- [ ] Move `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md` into a dated `_archive/.../superpowers/specs/` batch per the `_archive/` convention (it is marked IMPLEMENTED), with a provenance note — OR, if still treated as live design, add it to the `docs/README.md` index and give the dir a self-describing home (e.g. `docs/design-specs/`).
- [ ] Prevent recurrence: either point the `superpowers` skill's spec output at a documented, indexed location, or add a tiny CI/docs check that flags any file under `docs/superpowers/` not referenced by `docs/README.md`.

**Related files:** `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md`, `docs/README.md`, `_archive/2026-06-22-completed-docs/superpowers/`, `_archive/README.md`

**Related entries:** RESOLVED-ISSUES.md "[2026-06-22] `docs/superpowers/` is an undocumented, opaquely-named plans/specs dir orphaned from the docs index"

### [2026-06-28] `docs/README.md` index omits `BMO-DEPLOY.md` (and the whole `docs/superpowers/` subtree)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Added a `BMO-DEPLOY.md` row under Setup & operations in `docs/README.md`. The `docs/superpowers/` subtree is no longer present to index (its sole file was archived — companion entry). The optional CI index<->file parity check is left as a future enhancement.
- **Branch:** auto/overall-resolver

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Automated cross-cutting scan comparing `docs/*.md` on disk against the `docs/README.md` index.

**Description:**
The `docs/README.md` index (added 2026-06-23 to make the flat `docs/` dir navigable) is already incomplete. Diffing the files present against the index shows `docs/BMO-DEPLOY.md` is **not listed** anywhere in the index, even though it is a tracked, current doc that other docs link to (e.g. `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` references it for the decoupled-deploy checkout). The `docs/superpowers/` subtree is likewise absent (see the companion orphan entry above). The index's value is being the one place to find a doc; an unlisted doc is effectively invisible, and the gap will widen each time a new doc lands without an index row.

**Hypothesis / root cause:** `BMO-DEPLOY.md` existed before the index was authored but was missed when the index was assembled (the "Setup & operations" group lists BACKUP/SETUP/COMMANDS/OLLAMA-TUNING/SECURITY but not the deploy doc). No check enforces index<->file parity, so omissions are silent.

**Proposed fix / improvement:**
- [ ] Add a row for `BMO-DEPLOY.md` to the `docs/README.md` index (likely under "Setup & operations" with a one-line description).
- [ ] Index or relocate the `docs/superpowers/` content (tracked separately above).
- [ ] Optional: add a lightweight CI/docs check that fails when a `docs/*.md` file (excluding `README.md` itself) is not referenced by `docs/README.md`, so the index stays complete automatically.

**Related files:** `docs/README.md`, `docs/BMO-DEPLOY.md`, `docs/superpowers/`

### [2026-06-28] CI workflows duplicate the `setup-node` + `npm ci` block ~10× — extract a composite action

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Added `.github/actions/setup-node-project/action.yml` (composite: SHA-pinned setup-node + `.nvmrc` + npm cache + `npm ci`, with an `install-args` input for release flags). Migrated the duplicated bootstrap in `dnd-app-ci`, `dungeon-scholar-ci`, `dungeon-scholar-deploy`, `dnd-web-deploy`, `oracle-worker-ci`, `oracle-worker-deploy`, `dnd-app-validate-5e`, the 3 `security-audit.yml` npm-audit jobs, `dnd-e2e.yml`, and `release.yml` checks-fast + test. `release.yml` build job left un-migrated on purpose: it interleaves an Electron-cache restore between setup-node and `npm ci`; folding it in would reorder `npm ci` ahead of the cache and defeat it. SHA pin + `# vN` now live in one place for Dependabot. All workflows validated with actionlint.
- **Branch:** auto/overall-resolver

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI review
- **Effort estimate:** 1–2 hours

**Description:**
The identical four-line Node bootstrap — `actions/setup-node@48b55a…# v6` with `node-version-file: .nvmrc` + `cache: npm`, followed by `npm ci` — is copy-pasted across ~10 workflow jobs (`dnd-app-ci`, `dungeon-scholar-ci`, `dungeon-scholar-deploy`, `dnd-web-deploy`, `oracle-worker-ci`, `oracle-worker-deploy`, `dnd-app-validate-5e`, three jobs in `security-audit.yml`, three in `release.yml`). Today every routine change to that bootstrap (e.g. the resolved 2026-06-24 node-pin sweep, or a future `setup-node` SHA bump) has to touch every file, and a single missed copy is exactly how `dnd-e2e.yml` drifted (see `ISSUES-LOG.md` 2026-06-28 dnd-e2e entry). There is no `.github/actions/` dir yet.

**Hypothesis / root cause:** Workflows were authored independently before a shared-step convention existed; no composite/reusable action has ever been introduced.

**Proposed fix / improvement:**
- [ ] Add `.github/actions/setup-node-project/action.yml` (composite) wrapping `actions/checkout` (optional) + SHA-pinned `setup-node` (`.nvmrc` + `cache: npm`) + `npm ci`, taking `working-directory` as an input.
- [ ] Migrate the JS-project workflows to `uses: ./.github/actions/setup-node-project`.
- [ ] Keep the SHA pin + `# vN` comment inside the composite so the `github-actions` Dependabot ecosystem still bumps it in one place.

**Related files:** `.github/workflows/*.yml`, `.nvmrc`, `.github/dependabot.yml`

**Related entries:** This was previously listed only as an unchecked optional follow-up inside resolved CI entries (`RESOLVED-ISSUES-DNDAPP.md`, `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`, `BMO-RESOLVED-ISSUES.md`: "Optionally factor the shared setup-node / npm-ci steps into a composite action") and was never tracked as an open item. Also relates to `ISSUES-LOG.md` 2026-06-28 dnd-e2e convention-drift entry (a composite action would have prevented that drift).

### [2026-06-28] `dnd-app/mobile` is excluded from both the root Makefile fan-out and all CI despite having `lint` + `typecheck` scripts

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** Wired `dnd-app/mobile` into the fan-out. Root `Makefile`: added it to `install` (`npm ci`), `lint`, and `typecheck`, and corrected the help text + typecheck comment. Added `.github/workflows/dnd-app-mobile-ci.yml` — a `permissions: contents: read` job path-filtered to `dnd-app/mobile/**` running the composite bootstrap + `biome check` + `tsc --noEmit`; path-filtering avoids gating unrelated dnd-app work. Validated with actionlint + `make -n`.
- **Branch:** auto/overall-resolver

- **Category:** future-idea, portability
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI/tooling review

**Description:**
The React Native / Expo subproject `dnd-app/mobile` has its own lockfile (Dependabot was given a dedicated `/dnd-app/mobile` npm entry after its Expo/EAS toolchain accumulated unremediated security alerts) and defines `"lint": "biome check src/"` and `"typecheck": "tsc --noEmit"`. But **no workflow under `.github/workflows/` references `mobile`** (`grep mobile` → nothing), and the **root `Makefile` never touches it** — `install`/`lint`/`test`/`build` fan out to `dnd-app`, `dungeon-scholar`, `oracle-worker`, and `bmo/pi`, but not `dnd-app/mobile`. So it is the only code area in the repo with declared lint+typecheck scripts that no `make` target and no CI gate ever runs — its quality bar is enforced by nobody, even though its dependencies are kept fresh by Dependabot. This breaks the repo-wide "every subproject is covered by `make` + CI" invariant the resolved oracle-worker CI-wiring and Makefile-fan-out entries established.

**Hypothesis / root cause:** Mobile was added as a nested package under `dnd-app/` after the Makefile fan-out and the per-project CI workflows were written; Dependabot coverage was retrofitted (the dependabot.yml comment confirms this) but the build/CI fan-out was not.

**Proposed fix / improvement:**
- [ ] Add `dnd-app/mobile` to the root Makefile `install` (`npm ci`), `lint`, and `typecheck` targets.
- [ ] Add a `mobile` CI job (or extend `dnd-app-ci`, path-filtered to `dnd-app/mobile/**`) running `npm ci` + `biome check` + `tsc --noEmit`, using the same SHA-pinned `setup-node` + `.nvmrc` convention as its siblings (or the composite action proposed in the 2026-06-28 composite-action entry above).
- [ ] Decide whether mobile gets a `security-audit` job like the other npm projects.

**Related files:** `dnd-app/mobile/package.json`, `Makefile`, `.github/workflows/dnd-app-ci.yml`, `.github/dependabot.yml`

**Related entries:** Same coverage-parity theme as the resolved cross-cutting entries "oracle-worker is a production component with ZERO CI wiring", "security-audit never runs for dungeon-scholar or oracle-worker", and "Root Makefile lint/typecheck only cover dnd-app".

### [2026-06-24] Deploy-workflow filenames don't follow the `<project>-deploy.yml` convention (`deploy.yml` is dungeon-scholar's Pages deploy)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-28
- **Resolution:** `git mv .github/workflows/deploy.yml .github/workflows/dungeon-scholar-deploy.yml` and updated the workflow's own `paths:` self-reference. Updated every active doc/comment naming the file (`docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `dungeon-scholar/README.md`, `dungeon-scholar/docs/oracle-setup.md`, `dungeon-scholar/docs/phases/INSTRUCTIONS.md`, `dungeon-scholar/docs/phases/QA/INSTRUCTIONS.md`, `dungeon-scholar/docs/phases/PHASE-INDEX.md`, `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`); historical records (completed phase plans, RESOLVED archives, `_archive/`) left untouched. The workflow `name:` ("Deploy Dungeon Scholar to GitHub Pages") is unchanged, so required-check names are unaffected. **Decision:** `dnd-web-deploy.yml` kept as-is (it deploys the dnd-app *web* build specifically) and documented as intentional; added a "CI workflow naming convention" section to `docs/CONTRIBUTING.md`. Verified no active reference to a bare `deploy.yml` remains.
- **Branch:** auto/overall-resolver

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup

**Original problem:** Three of four deploy workflows followed `<project>-deploy.yml` (`bmo-deploy.yml`, `dnd-web-deploy.yml`, `oracle-worker-deploy.yml`) but dungeon-scholar's Pages deploy was the unprefixed `deploy.yml` — falsely implying a repo-wide deploy, and the only per-project workflow not sharing its project prefix.

### [2026-06-24] No `.python-version` analog to `.nvmrc`; Python is pinned inline in CI and the two pins disagree (3.11 vs 3.12)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-28
- **Resolution:** Added `bmo/pi/.python-version` (`3.11`) as the single source of truth and pointed both Python workflows at it via `setup-python`'s `python-version-file:` — `bmo-pi-pytest.yml` (was `'3.11'`) and `security-audit.yml`'s bandit/pip-audit job (was `"3.12"`). Canonical version chosen as **3.11** to match the pytest gate that actually validates the code (prior `BMO-RESOLVED-ISSUES.md` note: tracked sources compile cleanly under 3.11). The two pins can no longer drift. Verified the file is tracked (not gitignored) and both workflows resolve to it.
- **Branch:** auto/overall-resolver

- **Category:** config, portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor

**Original problem:** Node was pinned repo-wide via `.nvmrc` + `node-version-file:`, but Python had no equivalent: `bmo-pi-pytest.yml` pinned `3.11` while `security-audit.yml` pinned `3.12`, so the pytest Python and the audit Python could drift independently with nothing anchoring either to local dev.

### [2026-06-24] Repo-wide pre-commit hook (incl. the gitleaks secret scan) is only bootstrapped by installing `dnd-app/` deps — contributors who only touch bmo / dungeon-scholar / oracle-worker get no hook at all

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-28
- **Resolution:** Added a project-independent `hooks` target to the root `Makefile` (`git config core.hooksPath .husky` — pure git, no npm/husky needed) and made `make install` depend on it, so bootstrapping any subproject wires the repo-root hook and its repo-wide gitleaks secret scan — not just `npm install` inside `dnd-app/`. Documented `make hooks` as the project-independent install path in `docs/CONTRIBUTING.md` and refreshed the hook's step list. The hook body already pre-flights `bmo/pi` (ruff) and `oracle-worker` (the secondary gap the entry noted), so only the install trigger needed fixing. Verified `make -n hooks` / `make -n install` and that `.husky/pre-commit` is executable.
- **Branch:** auto/overall-resolver

- **Category:** portability, UX
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor

**Original problem:** The shared repo-root `.husky/pre-commit` (which includes a repo-wide gitleaks secret scan) was installed only by `dnd-app/package.json`'s `prepare` script, so a contributor who only worked in bmo / dungeon-scholar / oracle-worker and never ran `npm install` in `dnd-app/` got no hook at all — including no local secret scan.

### [2026-06-28] Per-domain `DESIGN-CONSTRAINTS.md` files lack the `merge=union` driver despite being designated automated-agent append targets

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-28
- **Resolution:** Added a `**/docs/DESIGN-CONSTRAINTS.md   merge=union` glob to `/.gitattributes` (in the "Append-only log docs" union-merge block, with a comment pointing at AUTOMATED-AGENT-GIT-WORKFLOW.md Rule 2). Verified `git check-attr merge` now returns `union` for all three (`bmo/docs/`, `dnd-app/docs/`, `dungeon-scholar/docs/`) `DESIGN-CONSTRAINTS.md` files; the existing `docs/logs/*` log globs are unchanged and still `union`. Concurrent appends to the constraints docs from parallel `auto/*` branches now auto-merge instead of conflicting at integration.
- **Branch:** auto/overall-resolver

- **Category:** config, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors

**Original problem:** `.gitattributes` applied `merge=union` only to `docs/logs/*`, while the three per-domain `DESIGN-CONSTRAINTS.md` files — designated automated-agent append targets by `LOG-INSTRUCTIONS.md` — were `merge: unspecified`, so concurrent appends would produce real merge conflicts at integration.

### [2026-06-28] Shared husky pre-commit hook gates only 2 of 4 projects (no local pre-flight for `bmo/pi` or `oracle-worker`)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-28
- **Resolution:** Added two pre-flight blocks to `.husky/pre-commit`. **bmo/pi:** when `bmo/pi/**/*.py` is staged, runs `ruff check` on the staged Python files (loud warning if `ruff` is absent rather than a silent skip) plus the `bmo/pi/scripts/check-no-new-prints.sh` ratchet when present. **oracle-worker:** when `oracle-worker/**` is staged, runs its `npm test`. CI (`bmo-pi-pytest.yml` / `oracle-worker-ci.yml`) remains authoritative; these are fast local floors matching the dnd-app + dungeon-scholar blocks. Verified `sh -n` and `shellcheck -S error` clean.
- **Branch:** auto/overall-resolver

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors

**Original problem:** The hook ran local gates for `dnd-app/` and `dungeon-scholar/` but no pre-flight for `bmo/pi/` (ruff/print-ratchet/pytest) or `oracle-worker/`, an asymmetric local-tooling floor across the four projects.

### [2026-06-28] Inconsistent `push` branch filters across workflows (`[master, main]` vs `[main, master]` vs `[master]`) — latent default-branch-rename gotcha

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-28
- **Resolution:** Standardised every workflow's `push.branches` to `[master]` (the repo's actual default branch). Changed `[master, main]` (`bmo-docker-build.yml`, `bmo-pi-pytest.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`) and `[main, master]` (`deploy.yml`) to `[master]`; `codeql.yml` and `dnd-web-deploy.yml` were already `[master]`. All push triggers now share one convention, removing the latent partial-CI-outage risk if the default branch were ever renamed.
- **Branch:** auto/overall-resolver

- **Category:** config
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-errors

**Original problem:** The `push.branches` filter was written three different ways across workflows; the `main` entries were dead config today but masked a latent gotcha where a future rename to `main` would silently stop the `[master]`-only workflows (CodeQL, dnd-web deploy) from triggering.

### [2026-06-24] Monorepo subproject metadata inconsistent — oracle-worker README/description + per-subproject LICENSE

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Added `oracle-worker/README.md` and filled its empty `package.json` `description`. Standardised licensing **per subproject** (user decision): copied the repo's ISC `LICENSE` verbatim into `dungeon-scholar/`, `bmo/`, and `oracle-worker/` (root + dnd-app already had one), added the missing `"license": "ISC"` to `dungeon-scholar/package.json` (dnd-app + oracle-worker already declared ISC), and pointed the bmo + dungeon-scholar README License sections at their own `LICENSE` instead of "inherited from parent repo". All five (root + four subprojects) now carry a LICENSE and declare ISC consistently.
- **Branch:** auto/overall-resolver

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup

**Original problem:** Subproject top-level metadata was inconsistent: oracle-worker had no README and an empty package `description`; a LICENSE existed only at root + dnd-app (two of five) with no stated convention. README/description were fixed first; the LICENSE convention was held for a human decision, which the user resolved as per-subproject.

### [2026-06-24] Monorepo Node pin incomplete — 4 CI jobs still hardcode `node-version: "22"` instead of `.nvmrc`

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Replaced the 4 remaining literal `node-version: "22"` pins with `node-version-file: .nvmrc` in `.github/workflows/oracle-worker-ci.yml`, `oracle-worker-deploy.yml`, and the `oracle-worker-npm-audit` + `dungeon-scholar-npm-audit` jobs in `security-audit.yml`. Every setup-node step in the repo now reads the root `.nvmrc`, so a future `.nvmrc` bump propagates uniformly. The optional CI grep-guard against re-introducing a literal pin was left as a future enhancement.
- **Branch:** auto/overall-resolver

- **Category:** config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors

**Original problem:** The 2026-06-22 ".nvmrc consolidation" claimed all 8 pins across 6 workflows were switched to `node-version-file`, but 4 literal `node-version: "22"` pins remained (both `oracle-worker-*` workflows, never enumerated, plus two jobs in `security-audit.yml`). Harmless while `.nvmrc` was `22`, but a future bump would silently strand those jobs on Node 22 — the drift the consolidation aimed to remove.

### [2026-06-24] Orphaned `scripts/check-agent-docs.mjs` — superseded duplicate of the drift guard, wired to nothing

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Deleted `scripts/check-agent-docs.mjs`. Confirmed no live references (no workflow, package.json script, Makefile, or hook). The CI-wired `scripts/check-agent-instructions.sh` — a strict superset that also enforces the `SYNC:agents` block — remains the single drift guard.
- **Branch:** auto/overall-resolver

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor / overall-cleanup

**Original problem:** Two agent-instruction drift checkers existed (`check-agent-docs.mjs` Node + `check-agent-instructions.sh` bash) doing the same job; the `.sh` superseded the `.mjs` (and is the only one in CI), leaving the `.mjs` as dead, weaker, duplicate code.

### [2026-06-24] Agent-instruction drift guard omits `.cursorrules`, and `.cursorrules` title/tree is stale

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Added `.cursorrules` to the `secondary` array in `scripts/check-agent-instructions.sh` and to both the `push`/`pull_request` `paths:` lists in `.github/workflows/agent-docs-check.yml` (comment "four"→"five"); the guard now covers it and passes (`.cursorrules` references `AGENTS.md` 3×). Also fixed the stale `.cursorrules` header — now names all four subprojects (dnd-app + bmo + dungeon-scholar + oracle-worker) — and added the missing `oracle-worker/` entry to its repo-structure tree.
- **Branch:** auto/overall-resolver

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup / overall-suggestor

**Original problem:** `.cursorrules` (a fifth peer AI-instruction file the workflow doc lists alongside AGENTS/CLAUDE/GEMINI/copilot) was absent from the guard's `secondary` list and the workflow `paths:`, so it could silently drop its `AGENTS.md` pointer with CI green; its title (`dnd-app + bmo`) and tree predated dungeon-scholar and oracle-worker.

### [2026-06-23] Biome engine version drift across the JS projects despite the shared base config

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Unified the Biome engine version to 2.5.0 repo-wide: bumped the `$schema` in `biome.base.json`, `dnd-app/biome.json`, and `dungeon-scholar/biome.json` to 2.5.0, and bumped the `npx @biomejs/biome@2.4.16` pins in `dungeon-scholar/package.json` (lint/lint:fix/format) and `.husky/pre-commit` to 2.5.0. `dnd-app` already resolves 2.5.0, so no lockfile change was needed. Converting dungeon-scholar's `npx` call to a local binary and tightening dnd-app's `^2.5.0` to an exact pin are optional follow-ups; the version drift itself is resolved.
- **Branch:** auto/overall-resolver

- **Category:** debt, config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor

**Original problem:** `dnd-app` ran Biome `^2.5.0` (local) while `dungeon-scholar` ran `npx @biomejs/biome@2.4.16`, and `biome.base.json`'s `$schema` was pinned to 2.4.16 — two engine versions linting one shared config, undercutting the "one shared lint config" guarantee.

### [2026-06-23] `ruff` is a declared bmo/pi dependency but unwired — repo-wide `make lint` skips Python

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Added `bmo/pi/ruff.toml` with a deliberately lenient "real errors only" rule set (`select = ["E9","F63","F7","F82"]`, `target-version py311`, `line-length 100`, venv/data excluded) so the gate is green today. Wired `ruff check` into the repo-root `make lint` target (and updated `help` to list bmo/pi) and added a "Ruff (lint)" step to `bmo-pi-pytest.yml` (ruff already ships via `requirements-test.txt`). Fixed one ruff parse error by splitting semicolon-joined statements in `bmo/pi/tests/test_dm_bot_control.py`. `ruff check` passes; the next ratchet rungs (F401/F841/F811, then E4/E7) are documented in the config.
- **Branch:** auto/overall-resolver

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor

**Original problem:** `bmo/pi/requirements-test.txt` pinned `ruff==0.15.15` but ruff was never invoked (not in CI, `make lint`, husky, or any script) and had no config, so the repo-wide `make lint` gave incomplete confidence by silently omitting the Python project.

### [2026-06-23] Stale `subprojects-ci.yml` reference in `.husky/pre-commit` (that workflow was deleted)

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Updated the `.husky/pre-commit` comment to name `.github/workflows/dungeon-scholar-ci.yml` (the current authoritative gate) instead of the deleted `subprojects-ci.yml`. Confirmed via grep that no other live (non-resolved-log) `subprojects-ci` references remain.
- **Branch:** auto/overall-resolver

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor

**Original problem:** `.husky/pre-commit` told contributors the deleted `subprojects-ci.yml` was authoritative for the dungeon-scholar pre-flight — a dangling pointer the `subprojects-ci` deletion should have swept up.

### [2026-06-23] Consider grouping the append-only log files under `docs/logs/`

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-24
- **Resolution:** Already implemented in `master` — all append-only logs (`ISSUES-LOG*`, `SUGGESTIONS-LOG*`, `RESOLVED-*`, `SECURITY-LOG`, `BMO-*`) now live under `docs/logs/`, and the hardcoded references (README, `LOG-INSTRUCTIONS.md`, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `AUTOMATED-AGENT-GIT-WORKFLOW.md`, and the scheduled-agent task files including this resolver's) were updated to match. The `.gitattributes` union-merge globs are path-agnostic and still cover the moved files. The out-of-repo scheduler-coordination blocker from the 2026-06-23 note has been handled; closing as done.
- **Branch:** auto/overall-resolver (record only — the move already landed on master)

- **Category:** docs, debt
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup

**Original problem:** The 12+ append-only logs sat at the top level of `docs/` alongside conceptual docs; relocating to `docs/logs/` separates machine-appended churn from human guidance. Previously user-approved but deferred pending out-of-repo scheduler-task updates.

### [2026-06-23] Biome formatting style diverges between dnd-app and dungeon-scholar

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added root `biome.base.json` holding the genuinely-shared Biome settings (schema, vcs, formatter indent/width/lineWidth, JS quoteStyle, css tailwindDirectives); `dnd-app/biome.json` and `dungeon-scholar/biome.json` now `extends` it and keep only their deliberately-divergent JS formatter rules. The style divergence (dnd-app asNeeded/none vs dungeon-scholar always/all + jsx-double) is kept intentionally and is now documented as house style in `docs/CONTRIBUTING.md`. Behaviour-preserving: formatter output is byte-identical to the prior standalone configs (verified with biome 2.4.16, 0 new format diffs).

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

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Extended the root `Makefile`: `make lint` now fans out to dnd-app + dungeon-scholar (biome) + oracle-worker (no-op stub), and `make audit` calls each project's `npm run audit:ci` (added an `audit:ci` script to oracle-worker). `typecheck` stays dnd-app-only with an in-recipe comment explaining dungeon-scholar/oracle-worker have no standalone tsc step (vite/wrangler transpile); `help` text updated to state real per-target coverage so `make all` no longer implies a repo-wide lint/typecheck it didn't run. Note: dungeon-scholar has pre-existing, never-enforced biome violations (~120 format diffs) that `make lint` will now surface — that cleanup is separate per-domain dungeon-scholar work.

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

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Standardized the script vocabulary: dungeon-scholar `format` now runs `biome format --write` (formatting only) and a new `lint:fix` runs `biome check --write`, matching dnd-app. Documented the canonical vocabulary (`lint`, `lint:fix`, `format`, `typecheck`, `test`, `build`, `audit:ci`) in `docs/CONTRIBUTING.md`.

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

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added `docs/README.md` — a table-of-contents grouping every doc + log by purpose (architecture/data, setup/ops, contributor process, the issue/suggestion/resolved log sets, and the gitignored security logs) — and linked it from the root README docs index. No files were moved.

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

### [2026-06-23] `make lint` / `make typecheck` only cover dnd-app — `make all` gives false repo-wide confidence

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Extended the root `Makefile`: `make lint` now fans out to dnd-app + dungeon-scholar (biome) + oracle-worker (no-op stub), and `make audit` calls each project's `npm run audit:ci` (added an `audit:ci` script to oracle-worker). `typecheck` stays dnd-app-only with an in-recipe comment explaining dungeon-scholar/oracle-worker have no standalone tsc step (vite/wrangler transpile); `help` text updated to state real per-target coverage so `make all` no longer implies a repo-wide lint/typecheck it didn't run. Note: dungeon-scholar has pre-existing, never-enforced biome violations (~120 format diffs) that `make lint` will now surface — that cleanup is separate per-domain dungeon-scholar work.

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

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Deleted `.github/workflows/subprojects-ci.yml`; the dedicated `dungeon-scholar-ci.yml` / `oracle-worker-ci.yml` are a superset (dungeon-scholar keeps the `VITE_BASE=/home-lab/` build arg, oracle-worker keeps its test step). Bumped `dungeon-scholar-ci.yml` `actions/checkout@v6`->`@v7`, and removed the oracle-worker-ci push branch filter so `auto/*` branch pushes still hit that gate (parity with the removed workflow).

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

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added root `biome.base.json` holding the genuinely-shared Biome settings (schema, vcs, formatter indent/width/lineWidth, JS quoteStyle, css tailwindDirectives); `dnd-app/biome.json` and `dungeon-scholar/biome.json` now `extends` it and keep only their deliberately-divergent JS formatter rules. The style divergence (dnd-app asNeeded/none vs dungeon-scholar always/all + jsx-double) is kept intentionally and is now documented as house style in `docs/CONTRIBUTING.md`. Behaviour-preserving: formatter output is byte-identical to the prior standalone configs (verified with biome 2.4.16, 0 new format diffs).

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

### [2026-06-22] No tracked `.github/dependabot.yml` — dependency-update policy lives only in GitHub UI settings; only security updates flow, no scheduled version updates for any ecosystem

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added `.github/dependabot.yml` declaring pip (`/bmo/pi`) + npm (`/dnd-app`, `/dungeon-scholar`, `/oracle-worker`) + github-actions, each weekly and grouped, so the dependency-update policy is version-controlled and produces the scheduled version-update PRs the integrator workflow consumes.

- **Category:** config
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of monorepo CI + dependency tooling.

**Description:**
The repo has **no `.github/dependabot.yml`** (or `.yaml`) anywhere — `find . -iname '*dependabot*'` returns nothing, and `git log --all --full-history -- '**dependabot*'` shows the file was **never committed** (it is not gitignored either). Despite this, Dependabot is actively opening PRs (e.g. PRs #8–#17: grouped `pip` bumps in `bmo/pi`, grouped `npm_and_yarn` bumps across `dnd-app`/`dungeon-scholar`). The only Dependabot mechanism that runs without a tracked `dependabot.yml` is **security updates** — confirmed enabled via repo settings (`GET /repos/:owner/:repo/automated-security-fixes` → `{"enabled":true,"paused":false}`; vulnerability-alerts → 204). Net effect: (1) the entire dependency-update policy (ecosystems, schedule, grouping, ignore rules, target directories) lives only in GitHub UI settings and is **not reproducible from version control** — a repo re-clone or settings reset silently loses it; (2) **scheduled non-security version updates are not configured for any ecosystem** (pip in `bmo/pi`, npm in `dnd-app`/`dungeon-scholar`/`oracle-worker`), so routine maintenance bumps only land when a CVE advisory forces a security update. This directly under-serves the integrator's documented "Review Dependabot PRs … merge patch/minor version bumps" job (`docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` §3B), which assumes a steady stream of version-update PRs that this config does not actually produce.

**Reproduction (if bug):**
1. `find . -iname '*dependabot*'` → no results.
2. `git log --all --full-history -- '**dependabot*'` → empty (never tracked).
3. `gh api repos/:owner/:repo/automated-security-fixes` → `{"enabled":true,...}` (security updates on).
4. Observed: Dependabot PRs exist (security/grouped-security), but no version-update schedule is declared in-repo.

**Expected behavior (if bug):** dependency-update configuration (at least `package-ecosystem` + `schedule` for each of pip + the three npm projects, plus any grouping/ignore policy) should be a tracked `.github/dependabot.yml`, so the policy is version-controlled, reviewable, and produces the scheduled version-update PRs the integrator workflow is written to consume.

**Hypothesis / root cause:** Security updates were enabled via the GitHub UI and that was treated as "Dependabot is set up", so a `dependabot.yml` for scheduled version updates was never added. Speculative on intent; the file-absence + settings-state facts above are verified.

**Proposed fix / improvement:**
- [ ] Add `.github/dependabot.yml` declaring `pip` (`/bmo/pi`) and `npm` (`/dnd-app`, `/dungeon-scholar`, `/oracle-worker`) ecosystems with an explicit `schedule` and the same grouping currently relied on, so version updates are scheduled and the policy is tracked.
- [ ] Confirm whether scheduled version updates (not just security) are actually wanted; if intentionally security-only, document that decision (e.g. in `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`) so the integrator's "merge patch/minor version bumps" expectation matches reality.

**Blocked by:** nothing.

**Related files:** `.github/` (no dependabot config), `.github/workflows/security-audit.yml`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (§3B Dependabot review), `bmo/pi/requirements*.txt`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`.

### [2026-06-22] CodeQL workflow header comment is stale — claims the workflow is "INERT … running both produces duplicate scans," but advanced setup is now the SOLE active CodeQL and runs on every push/PR

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Rewrote the `.github/workflows/codeql.yml` header to state advanced setup is the active/sole CodeQL config and that default setup must stay OFF to avoid duplicate scans.

- **Category:** config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of CI workflows.

**Description:**
`.github/workflows/codeql.yml`'s header comment states it is *"INERT until the owner switches the repo from default setup to advanced setup … running both produces duplicate scans. Owner-action."* That is no longer true and is now actively misleading. The advanced workflow is live and is the **only** CodeQL source: the last 30 code-scanning analyses all carry `analysis_key: ".github/workflows/codeql.yml:analyze"` (categories `/language:python`, `/language:javascript-typescript`, `/language:actions`) — there are **no** default-setup analyses, so there is no duplicate scanning. The workflow runs on every push to `master`, every PR, and the weekly cron. A maintainer reading the header would wrongly conclude the workflow is dormant / awaiting an owner action, and might disable it or re-enable default setup (which would *re-introduce* the duplicate-scan hazard the comment warns about).

**Expected behavior (if bug):** the header comment should reflect that advanced setup is active and is the authoritative CodeQL configuration (default setup is off), not describe the workflow as inert.

**Hypothesis / root cause:** the comment was written while the workflow was staged but not yet switched on; the owner later switched from default to advanced setup but the now-stale header was never updated.

**Proposed fix / improvement:**
- [ ] Rewrite the `codeql.yml` header to state that advanced setup is the active/sole CodeQL config and that default setup must stay OFF to avoid duplicate scans.

**Blocked by:** nothing.

**Related files:** `.github/workflows/codeql.yml` (header comment), `.github/codeql/codeql-config.yml`.

### [2026-06-22] CodeQL `cancel-in-progress: true` cancels per-commit security scans during automated push bursts — only the last commit in a burst gets a completed scan

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Set `cancel-in-progress: false` on `codeql.yml` so in-flight security scans complete during master push bursts — each merged commit now gets a completed analysis instead of only the last commit in a burst.

- **Category:** config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of CI cadence vs. the new many-automated-agent commit model.

**Description:**
`.github/workflows/codeql.yml` uses `concurrency: { group: codeql-${{ github.ref }}, cancel-in-progress: true }`. With the newly-adopted high-churn model (many `auto/*` scanner branches consolidated by the daily integrator → bursts of rapid `master` pushes), each new `master` push cancels the previous commit's in-flight CodeQL run. Observed: 13 of the last 40 CodeQL runs ended `cancelled` (the rest success, 1 failure). The practical consequence is that intermediate commits in a burst do **not** get a completed CodeQL security analysis — only the final commit's run survives. Latest-state coverage and the weekly `schedule:` cron mitigate this, so the baseline is still scanned, but per-commit security-scan completeness is unreliable exactly when commit volume is highest. This is a deliberate concurrency choice, but it interacts poorly with the automated-commit cadence and is worth a conscious decision rather than an accident.

**Expected behavior (if bug):** either accept-and-document that CodeQL intentionally scans only the latest state of a push burst, or let in-flight security scans complete (e.g. `cancel-in-progress: false` for CodeQL, accepting longer queues) so each merged commit is analyzed.

**Hypothesis / root cause:** `cancel-in-progress: true` is a sensible default for fast feedback workflows, but CodeQL is a security scanner where dropping intermediate runs has a coverage cost; the setting predates the high-churn integrator model.

**Proposed fix / improvement:**
- [ ] Decide CodeQL's desired semantics under burst pushes; if per-commit coverage matters, set `cancel-in-progress: false` for `codeql.yml` (queue instead of cancel), or document the latest-state-only behavior as intentional.

**Blocked by:** nothing.

**Related files:** `.github/workflows/codeql.yml` (concurrency block), `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (the integrator/burst model that drives the churn).

### [2026-06-22] Repo-wide pre-commit hook is a permanent no-op — `core.hooksPath` resolves to a non-existent dispatch target, so lint + typecheck + gitleaks never run on any commit

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Fixed `dnd-app/package.json` `prepare` to install husky against the repo-root `.husky` (`cd .. && husky .husky`), matching CONTRIBUTING.md so `core.hooksPath` points at the dir holding the real `pre-commit`. Re-wired the live bmo checkout and verified the dispatcher resolves to `.husky/pre-commit`. gitleaks still absent from bmo PATH (hook skips it gracefully) — installing it left as a host follow-up.

- **Category:** bug, config
- **Severity:** high
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of monorepo tooling (git hooks, CI, root configs).

**Description:**
The local pre-commit gate does not execute for ANY committer in the repo, in any of the three projects (dnd-app / dungeon-scholar / bmo). The real gate script lives at the repo root in `.husky/pre-commit` (it does `cd dnd-app`, runs `npm run lint -- --staged`, `tsc --noEmit -p tsconfig.web.json`, and an optional `gitleaks protect --staged`). But git is configured with `core.hooksPath = dnd-app/.husky/_` (set by `dnd-app/package.json`'s `"prepare": "cd .. && husky dnd-app/.husky"`). The husky v9 dispatcher `dnd-app/.husky/_/h` computes the real hook path as `$(dirname $(dirname $0))/<hookname>` = `dnd-app/.husky/pre-commit` and then runs `[ ! -f "$s" ] && exit 0`. That file does NOT exist (only `dnd-app/.husky/_/` exists under `dnd-app/.husky/`), so every invocation hits the `exit 0` early-out and the hook is a silent no-op. Net effect: biome lint, the renderer typecheck, and the gitleaks staged-secret scan are all skipped on every `git commit` — CI is the only thing catching lint/type regressions, and there is NO local secret-scan defense-in-depth at all.

**Reproduction (if bug):**
1. `git config --get core.hooksPath` -> `dnd-app/.husky/_`.
2. `ls dnd-app/.husky/` -> only the `_/` shim dir; there is no `dnd-app/.husky/pre-commit`.
3. Stage a file with a lint/format error (or a fake secret) and `git commit`.
4. Observed: the commit succeeds with no lint/typecheck/gitleaks output. The root `.husky/pre-commit` gate is never run.

**Expected behavior (if bug):** committing staged lint/format errors (or a staged secret) should be blocked locally by the pre-commit gate before reaching CI.

**Hypothesis / root cause:** The `prepare` script points husky at `dnd-app/.husky`, but the actual hook script is authored at the repo-root `.husky/pre-commit`. Husky v9 expects the real hook files to live in the SAME directory passed to the `husky <dir>` install command (here `dnd-app/.husky/`), so the dispatcher looks for `dnd-app/.husky/pre-commit` and finds nothing. The root `.husky/` dir and the `dnd-app/.husky/` install dir are mismatched. (Speculative on intent, but the file-existence checks above are concrete and verified.)

**Proposed fix / improvement:**
- [ ] Either move the real gate to `dnd-app/.husky/pre-commit` (where the dispatcher looks), or
- [ ] change the `prepare` script to install husky against the repo-root `.husky` so `core.hooksPath` points at the dir that actually contains `pre-commit`, then verify `git config core.hooksPath` matches the dir holding the hook.
- [ ] Add a smoke check (CI or a `prepare` postcheck) that asserts the configured hooks dir actually contains the expected hook files, so a future mis-wire fails loudly.

**Blocked by:** nothing.

**Related files:** `dnd-app/package.json` (`prepare` script, ~line 14), `.husky/pre-commit` (root, the real but unreachable gate), `dnd-app/.husky/_/h` (dispatcher), `.githooks/pre-commit` (older gitleaks-only shim, also unused).

**Related entries:** ISSUES-LOG-DNDAPP.md -> "[2026-06-16] Pre-commit hook lints 0 staged files". That entry diagnoses a biome `--staged` path-matching bug WITHIN the gate script; this entry is a distinct, upstream problem — the gate script is never invoked at all, so that biome symptom cannot even manifest. Re-wiring the hook should address both together.

### [2026-06-22] Orphaned duplicate `docs/PLUGIN-SYSTEM.md` diverges from canonical `dnd-app/docs/PLUGIN-SYSTEM.md`

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Deleted the orphaned root `docs/PLUGIN-SYSTEM.md`; the canonical, README-linked copy at `dnd-app/docs/PLUGIN-SYSTEM.md` remains. (Optional `OLLAMA-TUNING.md` relocation left for a future reorg.)

- **Category:** docs, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
Two files are titled "Plugin System — dnd-app": the canonical one at `dnd-app/docs/PLUGIN-SYSTEM.md` (~11 KB, last touched 2026-06-19 — the file the README "Docs index" links and that `dnd-app/docs/phases/completed/PHASE-38-plugin-platform.md` documents) and an older, shorter copy at the repo root `docs/PLUGIN-SYSTEM.md` (~6.6 KB, 2026-06-18). The root copy is **not** linked from the README docs index, and its own body (line ~16) points readers to the dnd-app copy as authoritative — so it is effectively an orphaned, partial duplicate of a project-specific doc parked at repo root. Two divergent copies of the same API doc will drift; a contributor who opens the root copy gets stale/incomplete info.

**Hypothesis / root cause:** the root copy predates moving the plugin doc into `dnd-app/docs/` and was never removed.

**Proposed fix / improvement:**
- [ ] Delete `docs/PLUGIN-SYSTEM.md` (canonical content lives in `dnd-app/docs/PLUGIN-SYSTEM.md`), or reduce it to a one-line pointer if an at-root stub is wanted.
- [ ] While here, audit other dnd-app-only docs parked at repo-root `docs/` (e.g. `docs/OLLAMA-TUNING.md` — "Ollama tuning (dnd-app AI DM)") and consider relocating them under `dnd-app/docs/`, reserving repo-root `docs/` for genuinely cross-project material (`ARCHITECTURE.md`, `DATA-FLOW.md`, `RULES-RETRIEVAL.md` which spans dnd-app+bmo, the logs).

**Related files:** `docs/PLUGIN-SYSTEM.md`, `dnd-app/docs/PLUGIN-SYSTEM.md`, `docs/OLLAMA-TUNING.md`, `README.md`

### [2026-06-22] `docs/superpowers/` is an undocumented, opaquely-named plans/specs dir orphaned from the docs index

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Moved `docs/superpowers/{plans,specs}` (6 stale 2026-04 dungeon-scholar planning artifacts) into `_archive/2026-06-22-completed-docs/superpowers/` per the `_archive/` convention, with a batch README noting provenance and how to restore any still-active plan.

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`docs/superpowers/{plans,specs}/` holds six dated design docs from 2026-04-29/30 (dungeon-scholar accounts & cloud-save sync, tutorial overhaul, tome-creation prompt overhaul). The directory is referenced by **no** markdown file in the repo, is absent from the README "Docs index", and its name ("superpowers") refers to the agent skill that authored the plans, not their content — so a new reader cannot discover it or guess what it holds. Several plans appear already implemented (e.g. the accounts/cloud-save plan — dungeon-scholar now ships Supabase auth per the README), making them stale planning artifacts. The repo already has an established convention for finished design docs: `_archive/` (e.g. the existing `_archive/2026-06-10-completed-docs/` batch).

**Proposed fix / improvement:**
- [ ] Confirm implementation status of each plan/spec; move completed ones into a dated `_archive/<date>-completed-docs/` batch per the `_archive/README.md` convention.
- [ ] For any still-active plans, give them a documented home: add the directory to the README "Docs index" and/or rename it to something self-describing (e.g. `docs/plans/`).

**Related files:** `docs/superpowers/`, `README.md` (Docs index), `_archive/README.md`

### [2026-06-22] `oracle-worker/` is a live deployed project absent from the documented project list + logging triage

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added oracle-worker to the README Projects table (reframed 'three projects' → 'three apps plus one edge worker'), to the AGENTS/CLAUDE/GEMINI repo-at-a-glance, and folded it under the dungeon-scholar logs in `LOG-INSTRUCTIONS.md`.

- **Category:** debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`oracle-worker/` is a real, deployed sub-project at the repo root (a Cloudflare Worker — `wrangler.toml`, `src/`, `package.json` with a `wrangler` devDep). It backs `dungeon-scholar`s Oracle proxy (AI grading/chat) and is wired into `.github/workflows/deploy.yml` via `VITE_ORACLE_ENDPOINT`. Yet it is missing from every "what projects live here" surface:
- `README.md` § Projects says "**Three** loosely coupled projects" and lists only dnd-app / bmo / dungeon-scholar.
- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` repo-at-a-glance lists do not include it.
- `docs/LOG-INSTRUCTIONS.md` triage table has no `oracle-worker` row and there is no oracle-worker issues/suggestions log — discoveries about it currently have no documented home (they get filed under bmo/dnd-app by convention, e.g. the existing CI-gate entry).

A new contributor (or agent) reading the canonical docs would not know oracle-worker exists or that it ships to production.

**Hypothesis / root cause:** oracle-worker was added after the "three projects" framing and the docs/triage scaffolding were written; nobody retrofitted the project inventory.

**Proposed fix / improvement:**
- [ ] Add oracle-worker to README § Projects (and bump "Three" → "Four", or reframe as "three apps + one edge worker").
- [ ] Mention it in AGENTS.md / CLAUDE.md / GEMINI.md repo-at-a-glance.
- [ ] Decide its logging home: either add an `oracle-worker` domain (own logs + triage row) or explicitly fold it under dungeon-scholar in `docs/LOG-INSTRUCTIONS.md` (it is dungeon-scholars backend).

**Related files:** `oracle-worker/`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/LOG-INSTRUCTIONS.md`, `.github/workflows/deploy.yml`

### [2026-06-22] `AGENTS.md` (designated canonical AI guide) describes only TWO domains while the repo has 3-4

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Updated the AGENTS.md intro from 'two domains' to three project domains (dnd-app + bmo + dungeon-scholar) plus the oracle-worker edge worker, matching README/CLAUDE/GEMINI.

- **Category:** docs
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`AGENTS.md` opens with "**home-lab** is a monorepo with **two domains** that communicate via HTTP" and then enumerates only `dnd-app/` and `bmo/`. But `README.md`, `CLAUDE.md`, and `GEMINI.md` all describe **three** domains (they include `dungeon-scholar/`), and `oracle-worker/` makes four code areas. AGENTS.md is explicitly labelled the **canonical** AI-agent instructions file ("read by Cursor, Codex, Claude Code, most AI tools"), so the most-trusted guide is the most stale: any agent that reads only AGENTS.md is unaware dungeon-scholar (and oracle-worker) exist. This is a concrete factual error, distinct from the general "four guides drift" observation already logged in the domain suggestion logs — here the canonical file omits an entire shipped project.

**Hypothesis / root cause:** dungeon-scholar was added to the monorepo after AGENTS.md was written; CLAUDE.md/GEMINI.md/README were updated but AGENTS.md was missed.

**Proposed fix / improvement:**
- [ ] Update AGENTS.md "two domains" intro to cover dnd-app + bmo + dungeon-scholar (+ oracle-worker), matching CLAUDE.md/GEMINI.md/README.
- [ ] Consider the already-suggested sync-check so the canonical file cannot silently diverge again.

**Related entries:** see "four overlapping AI-assistant guides" entry in `docs/BMO-SUGGESTIONS-LOG.md` / `docs/SUGGESTIONS-LOG-DNDAPP.md` (general drift).

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`

### [2026-06-22] Compatibility-pointer stubs say logs split "in two places" — omit the dungeon-scholar logs that already exist

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Updated the `docs/ISSUES-LOG.md`, `docs/SUGGESTIONS-LOG.md`, and `docs/RESOLVED-ISSUES.md` pointer stubs to list all three domain logs (added the dungeon-scholar set).

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
Three legacy pointer stubs in `docs/` are now stale relative to the actual log layout:
- `docs/ISSUES-LOG.md`: "logged in **two places** by domain" → lists only BMO + dnd-app.
- `docs/SUGGESTIONS-LOG.md`: same, lists only BMO + dnd-app.
- `docs/RESOLVED-ISSUES.md`: same, lists only BMO + dnd-app.

But `docs/` already contains the dungeon-scholar logs (`ISSUES-LOG-DUNGEON-SCHOLAR.md`, `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`, `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`) and `LOG-INSTRUCTIONS.md`s triage table is fully three-way domain-split. So the three back-compat pointers under-document the real structure (a reader following a stub would never discover the dungeon-scholar logs). They also predate oracle-worker.

**Hypothesis / root cause:** the pointers were written during the original two-domain (bmo/dnd-app) split and never updated when dungeon-scholar got its own log set.

**Proposed fix / improvement:**
- [ ] Update the three stub pointers to list all current domain logs (or replace them with a single redirect to `LOG-INSTRUCTIONS.md`s triage table, the actual source of truth).

**Related files:** `docs/ISSUES-LOG.md`, `docs/SUGGESTIONS-LOG.md`, `docs/RESOLVED-ISSUES.md`, `docs/LOG-INSTRUCTIONS.md`

### [2026-06-22] Orphaned `node_modules/` (vite cache) at repo root with no root `package.json`

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Removed the stray repo-root `node_modules/` (gitignored, regenerable Vite cache with no root `package.json`) from the live bmo checkout.

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
The repo root has a `node_modules/` directory containing only `.vite/` and `.vite-temp/` (a stray Vite optimize cache) but there is **no** root `package.json` or `package-lock.json` — this is a monorepo of independently-installed sub-projects (dnd-app, dungeon-scholar, oracle-worker each have their own). The root `node_modules/` is gitignored so it is not committed, but its presence is misleading: it implies a root-level npm workspace that does not exist, and the cache can go stale. Likely created by running a Vite/electron-vite command from the repo root by mistake.

**Proposed fix / improvement:**
- [ ] Delete the root `node_modules/` (regenerable) and confirm no tooling expects a root install.
- [ ] If a root-level install is ever intended (e.g. shared dev tooling / a real workspace), add a root `package.json` to make it explicit; otherwise leave none.

**Related files:** `node_modules/` (repo root), `.gitignore`

### [2026-06-22] `security-audit.yml` never runs for `dungeon-scholar` or `oracle-worker` — their npm dependency trees get no CI vulnerability audit at all

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added `dungeon-scholar/**` + `oracle-worker/**` to security-audit.yml push/PR paths and two new npm-audit jobs (dungeon-scholar production-deps moderate+, oracle-worker high+), so every tracked npm project is covered by the CI dependency-audit gate.

- **Category:** config
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of CI dependency/security coverage across all four projects.

**Description:**
`.github/workflows/security-audit.yml` is the repo's dependency-vulnerability gate (npm `audit:ci` for dnd-app, bandit + pip-audit for bmo). Its `push`/`pull_request` `paths:` filters are limited to `dnd-app/**`, `bmo/**`, `.github/workflows/security-audit.yml`, and `.githooks/**`, and its only two jobs are `dnd-npm-audit` (working-directory `dnd-app`) and `bmo-bandit-ide`. There is **no job and no trigger path for `dungeon-scholar/**` or `oracle-worker/**`.** Both are tracked npm projects with their own `package-lock.json`: `dungeon-scholar` ships the Supabase-auth study app (security-sensitive auth wiring) and `oracle-worker` is the Cloudflare Worker proxy that performs AI grading/chat for dungeon-scholar. Editing either project's `package.json`/lockfile to pull in a vulnerable transitive dep would **never** trigger an `npm audit` in CI. The weekly `schedule:` cron in the same file also only runs the existing two jobs, so there is no out-of-band catch either. dungeon-scholar's `deploy.yml` runs `npm run test` + `npm run build` but no audit, so the Pages deploy path does not compensate. Net: 2 of the 4 projects (one of them the auth-bearing one) have zero CI dependency-vulnerability scanning.

**Reproduction (if bug):**
1. `grep -n "paths\|working-directory\|dungeon-scholar\|oracle-worker" .github/workflows/security-audit.yml` → paths are `dnd-app/**`, `bmo/**`, the workflow, `.githooks/**`; jobs are `dnd-app` + `bmo` only.
2. `grep -rl dungeon-scholar .github/workflows/` → `deploy.yml` only (no audit step); `grep -rl oracle-worker .github/workflows/` → nothing.
3. Add a known-vulnerable dep to `dungeon-scholar/package.json` (or `oracle-worker/`), push.
4. Observed: `Security audit` workflow does not run for that change; no `npm audit` failure surfaces.

**Expected behavior (if bug):** every tracked npm project (dnd-app, dungeon-scholar, oracle-worker) and the pip project (bmo) should be covered by the dependency-audit gate, with trigger paths and jobs to match.

**Hypothesis / root cause:** `security-audit.yml` was authored when only dnd-app + bmo existed (or were the only projects deemed in-scope); dungeon-scholar and oracle-worker were added later and never wired into the audit workflow's paths/jobs. Speculative on history; the path/job omissions are verified above.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar/**` and `oracle-worker/**` to the `push`/`pull_request` `paths:` filters.
- [ ] Add a `dungeon-scholar` npm-audit job (and an `oracle-worker` one, or fold the Worker into a shared npm-audit matrix) mirroring the `dnd-npm-audit` job.
- [ ] Decide whether dungeon-scholar's auth-bearing deps warrant a stricter audit threshold than `moderate+`.

**Blocked by:** nothing.

**Related files:** `.github/workflows/security-audit.yml` (paths + jobs), `.github/workflows/deploy.yml` (dungeon-scholar build, no audit), `dungeon-scholar/package.json`, `dungeon-scholar/package-lock.json`, `oracle-worker/package.json`, `oracle-worker/package-lock.json`.

**Related entries:** ISSUES-LOG.md → "[2026-06-22] No tracked `.github/dependabot.yml`" (the other half of the dependency-hygiene gap — Dependabot security updates are the *only* thing currently auditing dungeon-scholar/oracle-worker deps, and even those produce no scheduled version bumps).

### [2026-06-22] `oracle-worker` is a production component with ZERO CI wiring — no lint/test/typecheck/deploy workflow, and its `npm test` is the failing default stub

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added `.github/workflows/oracle-worker-ci.yml` (push/PR on oracle-worker/**: npm ci + `wrangler deploy --dry-run` build validation + test) and a manual `oracle-worker-deploy.yml` (workflow_dispatch, `wrangler deploy` via CLOUDFLARE_API_TOKEN). Replaced the failing default `test` stub with an explicit `exit 0` no-op and added `check`/`deploy` scripts.

- **Category:** config, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of monorepo CI wiring vs. tracked projects.

**Description:**
`oracle-worker/` is a tracked, real production component: it is the Cloudflare Worker (`wrangler.toml` → `name = "dungeon-scholar-oracle"`, `src/worker.js`) that dungeon-scholar calls for AI grading + chat (`deploy.yml` injects `VITE_ORACLE_ENDPOINT` pointing at it). Yet **no GitHub Actions workflow references `oracle-worker` at all** (`grep -rl oracle-worker .github/workflows/` → empty). Consequences: (1) no CI lint/typecheck/test gate runs on changes to `oracle-worker/src/worker.js`; (2) its `package.json` `test` script is the npm scaffold default `echo "Error: no test specified" && exit 1`, so there is not even a local test entrypoint; (3) there is no `wrangler deploy` workflow, so the Worker is presumably deployed by hand — the deploy step is undocumented in CI and not reproducible/auditable. The only automated coverage it receives is incidental: CodeQL's `javascript-typescript` analysis scans `worker.js` (it is not in `codeql-config.yml`'s `paths-ignore`). So a regression in the Worker that breaks dungeon-scholar's AI grading/chat would pass all CI and only surface in production.

**Reproduction (if bug):**
1. `grep -rl oracle-worker .github/workflows/` → no results.
2. `cat oracle-worker/package.json` → `"test": "echo \"Error: no test specified\" && exit 1"`, no lint/build/deploy scripts.
3. Edit `oracle-worker/src/worker.js`, push to any branch.
4. Observed: no oracle-worker-specific workflow runs; nothing gates the change.

**Expected behavior (if bug):** the Worker should have at minimum a CI lint/typecheck (and ideally a smoke test) gate, a real `test` script (or an explicit no-op that exits 0 with a comment), and a tracked deploy path (e.g. a `wrangler deploy` workflow gated on a green check) so its release is reproducible.

**Hypothesis / root cause:** `oracle-worker` was added as a small auxiliary Worker and never folded into the monorepo's CI conventions; the default `package.json` from `npm init` was committed unmodified. Speculative on history; the absence of workflow references and the stub test script are verified.

**Proposed fix / improvement:**
- [ ] Add a CI job (lint + typecheck/`wrangler deploy --dry-run` or `wrangler check`) triggered on `oracle-worker/**`.
- [ ] Replace the failing default `test` stub with a real test or an intentional `exit 0` no-op (so a future generic `npm test` loop over projects does not spuriously fail).
- [ ] Add a tracked `wrangler deploy` workflow (or document that deploys are manual) so the Worker release is reproducible/auditable.

**Blocked by:** nothing.

**Related files:** `oracle-worker/package.json` (stub test, no lint/build/deploy), `oracle-worker/src/worker.js`, `oracle-worker/wrangler.toml`, `.github/workflows/deploy.yml` (consumes the Worker via `VITE_ORACLE_ENDPOINT`), `.github/codeql/codeql-config.yml` (only incidental coverage).

### [2026-06-22] Inconsistent CI concurrency policy — `dnd-app-ci`, `dnd-app-validate-5e`, and `security-audit` have NO `concurrency:` group, so integrator/agent push bursts spawn piled-up redundant runs

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added `concurrency` groups to dnd-app-ci.yml + dnd-app-validate-5e.yml (cancel-in-progress: true, fast-feedback) and security-audit.yml (cancel-in-progress: false, security scanner), plus the new oracle-worker-ci.yml — uniform convention (cancel for gates, no-cancel for scanners).

- **Category:** config, performance
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of CI cadence vs. the many-automated-agent commit model.

**Description:**
Concurrency control is applied inconsistently across the monorepo's workflows. The bmo workflows each declare a `concurrency:` group with `cancel-in-progress: true` (`bmo-pi-pytest.yml`, `bmo-docker-build.yml`), `deploy.yml` has `group: pages`, and `codeql.yml` has one too. But `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, and `security-audit.yml` have **no `concurrency:` block at all.** `dnd-app-ci.yml` is the heaviest gate in the repo (lint → forbidden-patterns → 2× tsc → content-validate → full vitest → build → coverage → audit → circular → knip) and it triggers on **every push with no branch filter**. Under the newly-adopted high-churn model (many `auto/*` scanner branches + a daily integrator producing bursts of rapid `master` pushes — the very model `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` was written to enable), each push to each branch starts a fresh full dnd-app-ci run and **none supersede each other**, so superseded commits keep burning a full expensive run to completion. This is the mirror-image of the already-logged CodeQL concurrency finding (CodeQL *does* cancel and thereby drops scans); here the absence of any group means wasted parallel compute and longer queues instead. The inconsistency itself (some workflows guarded, the heaviest ones not) is the cross-cutting smell.

**Expected behavior (if bug):** a deliberate, consistent concurrency policy across the CI suite — at minimum the heavy push-triggered gates (`dnd-app-ci`) should have a `concurrency: { group: <wf>-${{ github.ref }}, cancel-in-progress: true }` so superseded in-flight runs on the same ref are cancelled, matching the bmo workflows.

**Hypothesis / root cause:** concurrency groups were added to the bmo workflows (and CodeQL/deploy) but never back-filled onto the dnd-app + security-audit workflows; the omission was harmless under the old low-churn single-branch model and only became a cost/queue issue once the many-agent integrator model multiplied push volume. Speculative on history; the presence/absence of `concurrency:` per workflow is verified.

**Proposed fix / improvement:**
- [ ] Add a `concurrency:` group (keyed on `github.workflow` + `github.ref`, `cancel-in-progress: true`) to `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, and `security-audit.yml`, matching the bmo workflows.
- [ ] Decide one repo-wide convention (cancel-in-progress for fast-feedback gates; `false` for security scanners per the CodeQL entry) and apply it uniformly, so concurrency policy is intentional rather than per-file accident.

**Blocked by:** nothing.

**Related files:** `.github/workflows/dnd-app-ci.yml` (no concurrency, runs on every push), `.github/workflows/dnd-app-validate-5e.yml` (no concurrency), `.github/workflows/security-audit.yml` (no concurrency), `.github/workflows/bmo-pi-pytest.yml` / `bmo-docker-build.yml` (have concurrency, for contrast).

**Related entries:** ISSUES-LOG.md → "[2026-06-22] CodeQL `cancel-in-progress: true` cancels per-commit security scans" (same burst-cadence root cause, opposite symptom — that one cancels too much, these cancel nothing).

### [2026-06-22] Root `.editorconfig` only configures `[*.sh]` — no shared editor baseline for the TS/JS/Py/JSON that dominate the repo

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Expanded root `.editorconfig` with a `[*]` baseline (utf-8, lf, final newline, trim trailing) plus per-type indent (`[*.{ts,tsx,js,jsx,mjs,cjs,json,yml,yaml}]` 2-space aligned with biome, `[*.py]` 4-space, `[*.md]` no-trim), keeping the original `[*.sh]` rule.

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
The repo-root `.editorconfig` declares `root = true` and exactly one section, `[*.sh]` (charset + final newline — added narrowly to stop a shell-script BOM, per `BMO-RESOLVED-ISSUES.md`). EditorConfig is the one config mechanism that cascades to *every* subdirectory and every editor automatically, so it is the natural place for a monorepo-wide baseline — yet it covers none of the languages that actually make up the tree: by tracked-file count the repo is ~3077 JSON, ~1323 TS, ~731 TSX, ~202 PY, ~190 MD, ~106 JS. That baseline matters more here than in a normal repo because the per-project linting is uneven: `dnd-app` ships `biome.json`, but `dungeon-scholar` and `oracle-worker` have no linter/formatter at all (logged separately), and `bmo` is Python. A shared `.editorconfig` covering indent style/size, `charset = utf-8`, `insert_final_newline`, and `trim_trailing_whitespace` for `[*.{ts,tsx,js,jsx,mjs,json,py,md}]` would give all four projects a consistent floor regardless of which (if any) linter each one runs — and costs nothing to add.

**Hypothesis / root cause:** the file was created reactively for a single shell-script fix and never grown into a real cross-project baseline.

**Proposed fix / improvement:**
- [ ] Add language sections to `.editorconfig` (`[*.{ts,tsx,js,jsx,mjs}]`, `[*.{json}]`, `[*.py]`, `[*.md]`) with indent + charset + final-newline + trim-trailing-whitespace, keeping the existing `[*.sh]` rules.
- [ ] Keep settings aligned with `dnd-app/biome.json` so the two don't fight where they overlap.

**Related files:** `.editorconfig`, `dnd-app/biome.json`

### [2026-06-22] `docs/RULES-RETRIEVAL.md` — a genuinely dual-domain (dnd-app + bmo) reference — is missing from the README "Docs index"

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added `docs/RULES-RETRIEVAL.md` to the README cross-cutting Docs index alongside ARCHITECTURE/DATA-FLOW.

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`docs/RULES-RETRIEVAL.md` is, by its own header, "the authoritative reference for the retrieval stack across **both** engines: the TypeScript one in `dnd-app/src/main/ai/` and its Python twin in `bmo/pi/services/rag_search.py`." That makes it one of the few docs that legitimately belongs at the repo-root `docs/` (it spans two domains, unlike `docs/OLLAMA-TUNING.md` / `docs/PLUGIN-SYSTEM.md`, which are dnd-app-only — those are covered by a separate entry). Yet it appears **nowhere** in the README "Docs index" (neither the "Architecture & deep dives" list at lines ~91-100 nor the project-doc lists), and is referenced only by a completed phase doc (`dnd-app/docs/phases/completed/PHASE-24-rules-rag-hybrid.md`) and by `docs/OLLAMA-TUNING.md`. A contributor or agent browsing the README cannot discover the canonical cross-engine retrieval reference, increasing the odds the TS and Python implementations drift without anyone consulting the shared spec.

**Hypothesis / root cause:** the doc was added in PHASE-24 but never wired into the README index when it landed.

**Proposed fix / improvement:**
- [ ] Add `docs/RULES-RETRIEVAL.md` to the README "Docs index" (it sits naturally alongside `ARCHITECTURE.md` / `DATA-FLOW.md` as a cross-engine architecture doc).
- [ ] While editing the index, sweep `docs/` for any other unlinked cross-project docs so the index stays a complete map of repo-root `docs/`.

**Related files:** `README.md` (Docs index, ~lines 91-100), `docs/RULES-RETRIEVAL.md`

### [2026-06-22] No `.github/dependabot.yml` — version-update coverage is implicit/incomplete despite a documented integrator Dependabot workflow

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Resolved by the `.github/dependabot.yml` added earlier this run (pip `/bmo/pi`; npm `/dnd-app`,`/dungeon-scholar`,`/oracle-worker`; github-actions `/`), giving scheduled grouped version updates across every ecosystem. Duplicate of the issues-log dependabot entry.

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
The repo has **no** `.github/dependabot.yml` anywhere (searched repo-wide), yet `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 3.B gives the daily `integrator` a whole Dependabot-PR review/merge process, and merged Dependabot PRs already exist in history (e.g. `dependabot/pip/bmo/pi/...`, PR #17). Without a config file, Dependabot only opens *security* update PRs (enabled via repo settings); scheduled *version* updates require the config. So routine version bumps are not guaranteed across the repo's ecosystems — npm in three dirs (`dnd-app/`, `dungeon-scholar/`, `oracle-worker/`), pip in `bmo/pi/` (which uses pip-tools `requirements*.in/.txt`), and `github-actions` (the workflows pin `actions/setup-node@v6`, `actions/setup-python@v6`, etc.). The result is uneven dependency freshness across all projects and a documented integrator process whose input is only partially configured.

**Hypothesis / root cause:** security updates were turned on in repo settings and have been sufficient so far; nobody added an explicit version-update config as projects multiplied.

**Proposed fix / improvement:**
- [ ] Add `.github/dependabot.yml` with `package-ecosystem` entries for each path: `npm` (`/dnd-app`, `/dungeon-scholar`, `/oracle-worker`), `pip` (`/bmo/pi`), and `github-actions` (`/`), with a sensible schedule and grouping; respect bmo's pip-tools lockfile flow (`requirements.in` is the edit surface).
- [ ] OR, if security-only updates are the deliberate policy, document that in `docs/CONTRIBUTING.md` / the integrator doc so the absence of a config is intentional, not an oversight.

**Related files:** `.github/dependabot.yml` (absent), `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (Rule 3.B), `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `bmo/pi/requirements*.in`

### [2026-06-22] Three CI workflows lack a `concurrency` group while six siblings have one — duplicate/superseded runs waste Actions minutes

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Resolved with the issues-log concurrency entry: added `concurrency` groups to dnd-app-ci.yml, dnd-app-validate-5e.yml, and security-audit.yml matching the other workflows.

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
Of the 9 workflows, 6 define a `concurrency:` group (`bmo-deploy`, `bmo-docker-build`, `bmo-pi-pytest`, `codeql`, `deploy`, `release`) but 3 do **not**: `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`. All three trigger on both `push` and `pull_request`, so when a branch with an open PR is pushed, the heavy gates run **twice in parallel** (the dnd-app CI gate is the expensive one: lint → forbidden-patterns → tsc ×2 → full vitest → build → verify). `dnd-app-ci.yml` additionally has **no branch filter on `push`** (only a path filter), so any branch — including the new per-agent `auto/*` worktree branches — that touches `dnd-app/**` triggers a full run, and without `cancel-in-progress` a rapid second push stacks another full run instead of superseding the first. This is pure CI-minute / queue waste and is inconsistent with the 6 workflows that already guard against it.

**Hypothesis / root cause:** `concurrency` was added to the deploy/release/long-running workflows where overlap is obviously harmful, but the everyday push-gated lint/test workflows were never retrofitted; the cost grew after the move to many per-agent `auto/*` branches.

**Proposed fix / improvement:**
- [ ] Add a `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` block to `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, and `security-audit.yml`, matching the convention the other 6 already use.
- [ ] Consider whether `dnd-app-ci.yml`'s unfiltered-branch `push` trigger should also be scoped (the integrator merges via `master`; per-branch full runs may be redundant with the PR-event run).

**Related files:** `.github/workflows/dnd-app-ci.yml`, `.github/workflows/dnd-app-validate-5e.yml`, `.github/workflows/security-audit.yml`

### [2026-06-22] Root `.editorconfig` is a near-empty `*.sh`-only stub — misses an editor-agnostic baseline for all four code areas

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Resolved with the other editorconfig entry: root `.editorconfig` now carries a `[*]` baseline + per-type indent rules covering all four code areas.

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
The repo-root `.editorconfig` declares `root = true` but contains only a single `[*.sh]` block (`charset = utf-8`, `insert_final_newline = true`) — it was added narrowly to stop a shell-script BOM regression (see `BMO-RESOLVED-ISSUES.md`). EditorConfig is the one editor-agnostic, no-dependency way to enforce baseline whitespace/charset/final-newline rules consistently across the whole monorepo — TS/React (`dnd-app`, `oracle-worker`), React (`dungeon-scholar`, which ships **no** linter or `.editorconfig` of its own — see `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`), Python (`bmo/pi`), plus JSON/Markdown/YAML across all of them. Today only shell files get any shared editor baseline; everything else relies on each project's own (and in dungeon-scholar's case absent) tooling, so indentation/charset/trailing-whitespace drift across projects has nothing catching it before commit.

**Hypothesis / root cause:** the file was created for one narrow shell-BOM fix and never broadened into the cross-project baseline EditorConfig is designed to be.

**Proposed fix / improvement:**
- [ ] Expand root `.editorconfig` with a `[*]` default (`charset = utf-8`, `insert_final_newline = true`, `trim_trailing_whitespace = true`, `end_of_line = lf`) and per-type indent rules (`[*.{ts,tsx,js,jsx,json,yml,yaml}]` 2-space, `[*.py]` 4-space, `[*.md] trim_trailing_whitespace = false`).
- [ ] Keep it advisory/non-blocking — it complements, not replaces, each project's linter; it just gives a shared floor (especially useful for dungeon-scholar, which has none).

**Related files:** `.editorconfig`, `dnd-app/biome.json`, `dungeon-scholar/` (no linter), `bmo/pi/`, `oracle-worker/`

### [2026-06-22] No repo-root task runner and inconsistent npm-script vocabulary across the three JS projects

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-22
- **Resolution:** Added a root `Makefile` (install/lint/typecheck/test/build/audit/all) fanning out to dnd-app + dungeon-scholar + oracle-worker (npm) and bmo/pi (pytest), documented in `docs/CONTRIBUTING.md`; gave oracle-worker a real script vocabulary. Full lint/typecheck parity for dungeon-scholar depends on it gaining a linter, tracked separately in the dungeon-scholar suggestions log.

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI/tooling review.

**Description:**
There is no single entry point to lint/typecheck/test/build the monorepo: no root `Makefile`, `justfile`, `Taskfile`, or root `package.json` (the root `node_modules/` is just a stray Vite cache — see the existing entry). Each area is driven by its own per-project commands, and the npm-script names are inconsistent: `dnd-app` exposes a rich, well-named set (`lint`, `lint:fix`, `format`, `test`, `test:coverage`, `circular`, `check:full`, ...); `dungeon-scholar` exposes only `dev`/`build`/`preview`/`test`/`test:watch` (no `lint`, `format`, or `typecheck`); `oracle-worker` exposes only `test`; bmo runs via `pytest` (`bmo/pi/pytest.ini`). So a contributor (or the integrator, when it wants a quick "is everything green" pass) has to remember a different command surface per project, and there is no one command that runs the whole repo's checks. A tiny root `Makefile`/`justfile` that fans out to each project's existing commands — plus a shared minimum script vocabulary (`lint`, `typecheck`, `test`, `build`) implemented in each JS `package.json` — would give uniform muscle memory and a single CI-mirroring local command, **without** needing a real npm workspace (which the root-`node_modules` entry deliberately avoids).

**Proposed fix / improvement:**
- [ ] Add a root `Makefile` or `justfile` with targets like `test`, `lint`, `build` that delegate to `dnd-app` / `dungeon-scholar` / `oracle-worker` (npm) and `bmo/pi` (pytest).
- [ ] Standardize a common script vocabulary (`lint`, `typecheck`, `test`, `build`) across the three JS `package.json` files so the root targets are uniform (depends on dungeon-scholar gaining a linter — see related entry).
- [ ] Document the root commands in `README.md` / `docs/CONTRIBUTING.md` as the canonical "run everything" entry point.

**Related entries:** root `node_modules/` (no root workspace) entry above; dungeon-scholar missing-linter entry in `docs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`.

**Related files:** `README.md`, `docs/CONTRIBUTING.md`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `bmo/pi/pytest.ini`
