# Issues log (split by domain)

This file is a **compatibility pointer**. Active bugs and tech debt are logged in two places by domain:

- **BMO** (Pi, Discord bots, voice, agents): [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
- **dnd-app** (Electron VTT, 5e data): [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)

`Domain: both` items are **mirrored in both** logs — fix once, remove from both.

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

# Cross-cutting issues (logged here by overall-errors scanner)

> Repo-wide / multi-project findings. Per the domain-split triage in `LOG-INSTRUCTIONS.md` these are `Domain: both`; recorded here in the compatibility-pointer log.

### [2026-06-22] No tracked `.github/dependabot.yml` — dependency-update policy lives only in GitHub UI settings; only security updates flow, no scheduled version updates for any ecosystem

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
