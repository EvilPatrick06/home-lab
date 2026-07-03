# Issues log (split by domain)

This file is a **compatibility pointer**. Active bugs and tech debt are logged in three places by domain:

- **BMO** (Pi, Discord bots, voice, agents): [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
- **dnd-app** (Electron VTT, 5e data): [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
- **dungeon-scholar** (Vite/React study app, Supabase): [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)

`Domain: both` **routing** (see `LOG-INSTRUCTIONS.md`): *repo-wide / structural* cross-cutting items live **here** (this pointer log’s `# Cross-cutting issues` section) — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are instead **mirrored** into the relevant per-domain logs — fix once, remove from each.

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

# Cross-cutting issues (logged here by overall-errors scanner)

> Repo-wide / multi-project findings. Per the domain-split triage in `LOG-INSTRUCTIONS.md` these are `Domain: both`; recorded here in the compatibility-pointer log.

### [2026-07-02] `workflow_run` trigger lists are coupled to workflow `name:` strings with no drift guard — a rename silently disables the bmo auto-deploy (and the incoming CI-failure triage)

- **Category:** config, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting CI scan of `.github/workflows/` trigger wiring

**Description:**
`bmo-deploy.yml` fires via `on: workflow_run: workflows: ["bmo / pi pytest"]` — a match against the display `name:` of `bmo-pi-pytest.yml`, guarded today only by an inline comment ("MUST match the `name:` … exactly"). If anyone renames that workflow (exactly the kind of consistency sweep this repo does — cf. the resolved 2026-06-24 "deploy-workflow filenames" and 2026-06-28 "branch filters" convention entries), the coupling breaks **silently**: GitHub raises no error, `bmo / deploy` simply never triggers again, and nothing goes red — the auto-deploy just stops. The failure mode is invisible until someone notices the Pi is stale. The blast surface is about to grow ~15×: the in-flight `auto/gha-monitor-migration` branch adds `ci-failure-triage.yml` with a `workflow_run` list of **14** workflow names (every CI gate); one renamed gate silently drops out of failure triage the same way. `scripts/check-ci-hygiene.sh` (the mechanical-convention guard) has guards for node-pin / SHA-pin / docs-index / permissions but nothing that cross-checks `workflow_run.workflows` entries against the actual `name:` fields in `.github/workflows/*.yml`, so this cannot be caught before merge.

**Expected behavior:** renaming a workflow that another workflow references via `workflow_run` should fail CI (hygiene guard), not silently sever the trigger.

**Hypothesis / root cause:** GitHub's `workflow_run` API couples by display-name string with no referential integrity; the repo's convention guard predates any `workflow_run` consumer beyond the single bmo-deploy reference, so no guard was written. Verified: `bmo-deploy.yml` is the only `workflow_run` consumer on master; the 14-name list exists on `origin/auto/gha-monitor-migration`; `check-ci-hygiene.sh` contains no such check.

**Proposed fix / improvement:**
- [ ] Add a guard to `scripts/check-ci-hygiene.sh`: extract every `workflow_run.workflows` entry across `.github/workflows/*.yml` and assert each matches a `name:` declared by some workflow file in the same tree; fail with the offending reference otherwise.
- [ ] Optionally note the convention (workflow `name:` strings are load-bearing for `workflow_run` consumers) in the CI section of `docs/CONTRIBUTING.md` or the workflow-doc Release-flow section.

**Related files:** `.github/workflows/bmo-deploy.yml`, `.github/workflows/bmo-pi-pytest.yml`, `scripts/check-ci-hygiene.sh`, (branch) `.github/workflows/ci-failure-triage.yml`

**Related entries:** `RESOLVED-ISSUES.md` -> [2026-06-24] deploy-workflow filename convention, [2026-06-28] inconsistent push branch filters (same "convention swept later" hazard class).

### [2026-07-02] Gitignored `SECURITY-LOG.md` is incompatible with the per-agent-worktree model: worktree appends are silently lost, main-checkout writes race unserialized

- **Category:** config, debt
- **Severity:** medium
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

- **Category:** config, docs
- **Severity:** low
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

### [2026-06-29] CI concurrency convention has gaps: dungeon-scholar-ci + four mechanical-guard workflows have no `concurrency:` group, so push bursts pile up redundant runs

- **Category:** config, performance, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting CI/deploy scan of `.github/workflows/`

**Description:**
The 2026-06-22 concurrency sweep (see `RESOLVED-ISSUES.md`) added `concurrency: { group: <wf>-${ref}, cancel-in-progress: true }` to `dnd-app-ci`, `dnd-app-validate-5e`, `oracle-worker-ci`, and `cancel-in-progress: false` to the security scanners (`security-audit`, `codeql`). But five push-triggered workflows were never given a `concurrency:` block and still pile up redundant runs under the high-churn integrator/`auto/*` model: `dungeon-scholar-ci.yml` (a full lint -> typecheck -> test -> build gate — the dungeon-scholar analogue of dnd-app-ci, and the only heavy gate still unguarded), plus the mechanical guards `agent-docs-check.yml`, `bmo-no-new-prints.yml`, `ci-hygiene.yml`, and the authoritative `secret-scan.yml`. All five trigger on `push` (most also on `pull_request` with no branch filter), so a branch with an open PR double-triggers and a rapid second push stacks another full run instead of superseding the first. Observed live: `gh run list` shows two parallel "Dungeon Scholar CI" runs and duplicate "Secret scan" runs on `auto/scholar-qa-tester`. Pure Actions-minute / queue waste; `dungeon-scholar-ci` is the one with real cost. The inconsistency itself (the dnd-app gate guarded, the dungeon-scholar gate not) is the cross-cutting smell.

**Expected behavior:** one repo-wide concurrency convention applied uniformly — `cancel-in-progress: true` on the fast-feedback gates (`dungeon-scholar-ci` at minimum, plus the cheap guards), `cancel-in-progress: false` on the security scanners (already done). Ideally enforced by `check-ci-hygiene.sh` so it cannot drift again.

**Hypothesis / root cause:** the 2026-06-22 sweep enumerated the then-known dnd-app/security workflows and missed `dungeon-scholar-ci` and the guard workflows; `check-ci-hygiene.sh` checks node-pin / SHA-pin / docs-index / permissions but not concurrency, so the gap is not mechanically caught. Presence/absence of `concurrency:` per workflow verified by grep; the duplicate runs are confirmed in `gh run list`.

**Proposed fix / improvement:**
- [ ] Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` to `dungeon-scholar-ci.yml`, `agent-docs-check.yml`, `bmo-no-new-prints.yml`, `ci-hygiene.yml`.
- [ ] Decide secret-scan semantics (cancel vs. complete) and set its block explicitly.
- [ ] Add a guard to `scripts/check-ci-hygiene.sh` requiring every push-triggered workflow to declare a `concurrency:` block, so this cannot drift again.

**Related files:** `.github/workflows/dungeon-scholar-ci.yml`, `.github/workflows/agent-docs-check.yml`, `.github/workflows/bmo-no-new-prints.yml`, `.github/workflows/ci-hygiene.yml`, `.github/workflows/secret-scan.yml`, `scripts/check-ci-hygiene.sh`

**Related entries:** `RESOLVED-ISSUES.md` -> 2026-06-22 concurrency entries (this is the unswept tail; same burst-cadence root cause).

### [2026-06-29] Master/PR-scoped CI gates (bmo-pytest, validate-5e, security-audit, codeql, docker) never run on `auto/*` branch pushes, so the integrator's "merge only green branches" check is blind to them

- **Category:** config, bug
- **Severity:** low
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
