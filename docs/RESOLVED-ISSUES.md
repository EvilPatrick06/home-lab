# Resolved issues (split by domain)

This file is a **compatibility pointer**. Fixed issues and suggestions are archived in three places:

- **BMO:** [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
- **dnd-app:** [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
- **dungeon-scholar:** [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting resolved (overall-resolver)

> Resolved cross-cutting / `Domain: both` entries moved out of `ISSUES-LOG.md` + `SUGGESTIONS-LOG.md`. Newest first.

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
