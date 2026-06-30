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

### [2026-06-29] dnd-app web deploy ships to the Pi with no test/lint/typecheck gate, unlike the other two app deploys

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
