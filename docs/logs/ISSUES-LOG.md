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
