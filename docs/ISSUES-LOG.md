# Issues log (split by domain)

This file is a **compatibility pointer**. Active bugs and tech debt are logged in three places by domain:

- **BMO** (Pi, Discord bots, voice, agents): [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
- **dnd-app** (Electron VTT, 5e data): [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
- **dungeon-scholar** (Vite/React study app, Supabase): [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)

`Domain: both` items are **mirrored in both** logs — fix once, remove from both.

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

# Cross-cutting issues (logged here by overall-errors scanner)

> Repo-wide / multi-project findings. Per the domain-split triage in `LOG-INSTRUCTIONS.md` these are `Domain: both`; recorded here in the compatibility-pointer log.

### [2026-06-22] `security-audit.yml` never runs for `dungeon-scholar` or `oracle-worker` — their npm dependency trees get no CI vulnerability audit at all

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


