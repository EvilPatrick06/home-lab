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

