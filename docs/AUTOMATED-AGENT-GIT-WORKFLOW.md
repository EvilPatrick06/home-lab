# Automated-agent git workflow

> **Canonical source of truth for how automated/scheduled agents use git in this repo.**
> Every agent-instruction file (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
> `.cursorrules`, `.github/copilot-instructions.md`), `docs/CONTRIBUTING.md`,
> `docs/LOG-INSTRUCTIONS.md`, `dnd-app/docs/phases/INSTRUCTIONS.md`, and
> `dnd-app/docs/phases/QA/INSTRUCTIONS.md` reference THIS file rather than
> restating the rules. If the workflow changes, change it here.

## Scope & stance (read first)

**This file = git mechanics. [`dnd-app/docs/phases/INSTRUCTIONS.md`](../dnd-app/docs/phases/INSTRUCTIONS.md) = the execution process.** INSTRUCTIONS.md is the **canonical implement → verify → commit → release loop for EVERY automated/scheduled agent across ALL domains** — `dnd-app/`, `bmo/`, `dungeon-scholar/`, and any cross-cutting resolver. Despite its path under `dnd-app/docs/`, it is **repo-wide, not dnd-app-only**; a bmo- or dungeon-scholar-scoped agent follows the same branch/CI/fix-forward/release workflow (only the per-domain build/test commands differ). This file governs *how agents reach `master`* (branch + worktree + integrator); INSTRUCTIONS.md governs *how agents execute and verify the work itself*.

**Fix-forward, attempt-risky stance.** Automated agents **take on risky and large fixes — they implement them rather than deferring, leaving, or documenting-and-punting.** Size or risk alone is never a reason to hand work back. The safety net is exactly the machinery in this file: every automated fix is isolated on an `auto/*` branch, gated by CI, merged only by the integrator, and — for user-approved resolver work — already approved; the app is in testing (no real users); the culture is fix-forward on red. An agent stops short only when **(a)** it is genuinely blocked / the work is impossible, or **(b)** the work needs a NEW human decision the approval/scope did not cover (a judgment / product call — not "this is big"). Full statement: INSTRUCTIONS.md rule 27.

> The integrator's "leave it for the user" cases below (a non-clean branch in Rule 3A, a major / breaking Dependabot bump in Rule 3B) are exactly those (a)/(b) exceptions — a red or conflicting merge is a genuine blocker, and a major-version dependency bump is a new human decision about a third-party breaking change. They are **not** an agent deferring its own fix for being risky or large.

## Why this exists

Around 2026-06-22, ~16 scheduled scanner/QA/phase agents all committed to the
single shared `master` working tree at the same time. They clobbered each
other's uncommitted edits and corrupted the working tree into a stuck rebase /
detached-HEAD state. The root cause was **many automated writers sharing one
working tree, one index, and one branch.**

The fix has three parts:

1. **Isolation** — each automated agent works on its **own branch** in its
   **own git worktree**. No two agents ever share a working tree or index.
2. **Auto-mergeable logs** — the append-only log docs use a **union merge**
   driver, so concurrent appends from different branches combine instead of
   conflicting.
3. **A single daily integrator** — one scheduled job consolidates the clean
   per-agent branches into `master`, and reports anything that does not merge
   cleanly (plus reviews Dependabot PRs).

Humans and interactive sessions are unaffected — they may still commit to
`master` directly (see "Humans / interactive sessions" below).

---

## Rule 1 — Automated agents never commit directly to `master`

This applies to **every automated or scheduled agent**: scanners, the QA agent,
the phase-maker, the phase-executer, the log-resolver, and any future scheduled
worker. None of them touch `master`'s working tree, index, or branch ref.

Each automated agent has a stable **agent id** (kebab-case, e.g. `qa`,
`phase-executer`, `phase-maker`, `log-resolver`, `scanner-security`,
`scanner-dnd-app`). It works on branch **`auto/<agent-id>`** inside a dedicated
worktree at **`/home/patrick/home-lab-trees/<agent-id>`**.

### Setup at the start of every run

```bash
# Always create/refresh the worktree from the latest pushed master.
# -B resets auto/<agent-id> to origin/master, so each run starts from a clean,
# up-to-date base. (The integrator deletes the branch after merging it, so a
# fresh branch off origin/master is the normal starting state — see Rule 3.)
git -C /home/patrick/home-lab fetch origin --quiet
git worktree add /home/patrick/home-lab-trees/<agent-id> -B auto/<agent-id> origin/master 2>/dev/null \
  || git -C /home/patrick/home-lab-trees/<agent-id> fetch origin --quiet
```

If the worktree already exists from a previous run, `git worktree add` fails
harmlessly; the agent just `cd`s into it and works there. Reset onto the latest
`origin/master` only when the previous run's branch was already integrated
(the integrator deletes merged branches, so this is the common case):

```bash
cd /home/patrick/home-lab-trees/<agent-id>
git fetch origin --quiet
git rebase origin/master      # your OWN branch onto master — allowed (see "never rebase shared state")
```

> **JS toolchain note (2026-07-15):** run `npm ci` in YOUR worktree before any
> JS checks, and invoke tools via `npm run <script>` or `./node_modules/.bin/…`
> — never bare `npx biome` / `npx tsc`. When the local install is missing, bare
> `npx` silently downloads the same-named REGISTRY packages (the deprecated
> `biome` squatter, the joke `tsc` package) and reports garbage instead of
> failing loudly. (Observed 2026-07-15 when the main checkout drifted to a
> prod-only install.)

### Work, commit, push — only on your own branch

```bash
cd /home/patrick/home-lab-trees/<agent-id>
# ... make changes ...
git add <only the files you changed>
git commit -m "<type>: <summary>"        # commit conventions unchanged (see CONTRIBUTING.md)
git push -u origin auto/<agent-id>        # push YOUR branch, never master
```

### Hard prohibitions for automated agents

- **Never** `git commit` / `git push` on `master`.
- **Never** touch `master`'s working tree or index (no `cd /home/patrick/home-lab && git add`).
- **Never** rebase, reset, or otherwise rewrite **shared** state (`master`, or
  another agent's `auto/*` branch). Rebasing **your own** `auto/<agent-id>`
  branch onto `origin/master` is fine — it is not shared.
- **Never** force-push another agent's branch. Force-pushing your own
  `auto/<agent-id>` is allowed only when you alone own it and the integrator
  has not picked it up; prefer a plain push.
- **Never** delete branches you do not own. The integrator owns branch cleanup.

This replaces the old "always work on master / no branches" rule for automated
agents. The release flow and the CI 4-gate are otherwise unchanged (see
"Release flow & CI" below).

---

## Rule 2 — Active log files union-merge

The append-only log docs are configured with `merge=union` in
[`/.gitattributes`](../.gitattributes). When two branches both append to the
same log, git's union driver keeps **both** sets of new lines instead of raising
a conflict. This is what makes parallel scanners safe: each appends its findings
on its own branch, and the integrator's merge combines them automatically.

Union-merge covers (by filename glob, any directory):

| Glob | Files it covers |
|---|---|
| `ISSUES-LOG*` | `docs/logs/ISSUES-LOG.md`, `docs/logs/ISSUES-LOG-DNDAPP.md`, `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` |
| `BMO-ISSUES-LOG*` | `docs/logs/BMO-ISSUES-LOG.md` |
| `SUGGESTIONS-LOG*` | `docs/logs/SUGGESTIONS-LOG.md`, `docs/logs/SUGGESTIONS-LOG-DNDAPP.md`, `docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` |
| `BMO-SUGGESTIONS-LOG*` | `docs/logs/BMO-SUGGESTIONS-LOG.md` |
| `SECURITY-LOG*` | `docs/logs/SECURITY-LOG.md` *(gitignored — rule is inert but kept for the day it is tracked)* |
| `RESOLVED-*` | `docs/logs/RESOLVED-ISSUES.md`, `docs/logs/RESOLVED-ISSUES-DNDAPP.md`, `docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`, `docs/logs/RESOLVED-SECURITY-ISSUES.md` |
| `BMO-RESOLVED-*` | `docs/logs/BMO-RESOLVED-ISSUES.md` |

**Caveat — union merge concatenates; it does not reason.** It is ideal for
*append-at-bottom* (or append-at-top) log entries. It can produce odd ordering
or duplicate section headers if two branches edit the **same** region (e.g. both
rewrite the same severity header, or both move an entry to a resolved file). For
ordinary "add a new dated entry" appends it is exactly right. When an agent does
a structural edit (cutting a resolved entry and pasting it into a resolved log),
keep the edit small and let the integrator flag anything that looks off.

**Exception — the gitignored security logs never ride branches at all.**
`docs/logs/SECURITY-LOG.md` and `docs/logs/RESOLVED-SECURITY-ISSUES.md` are
gitignored, so they exist only in the **main checkout's** working tree — a
per-agent worktree does not contain them, and an append made inside a worktree
is silently lost when the worktree is reset. The `SECURITY-LOG*` union rule in
the table above is inert (as noted). Automated agents write security entries
directly to the main checkout's files, serialized via
`flock /home/patrick/home-lab-locks/security-log.lock`; see the security
section of [`docs/LOG-INSTRUCTIONS.md`](LOG-INSTRUCTIONS.md).

---

## Rule 3 — The daily integrator

A single scheduled **integrator** job (agent id `integrator`, branch
`auto/integrator` / worktree `/home/patrick/home-lab-trees/integrator` if it
needs to stage anything) runs once per day and consolidates everything. It is
the **only** automated actor allowed to write to `master`.

### A. Consolidate `auto/*` (and any other non-master) branches

```bash
cd /home/patrick/home-lab
git fetch origin --prune
git checkout master
git pull --ff-only origin master
```

For each remote branch other than `master` (iterate
`git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v '^origin/master$'`):

1. **Check CI.** Confirm the branch's latest commit has a green CI conclusion
   (`gh run list --branch <branch>`; for branches with an open PR,
   `gh pr checks <pr>`). A branch with red or missing required CI is **not**
   clean — skip it and report.
2. **Test the merge.** Attempt a no-commit merge into `master`
   (`git merge --no-commit --no-ff origin/<branch>`), or merge for real on a
   throwaway temp branch. The union-merge driver resolves concurrent log appends
   automatically.
3. **Decide:**
   - **Clean** (fast-forward, or a clean union/auto merge with no conflict) **and
     CI green** → complete the merge, `git push origin master`, then delete the
     branch: `git push origin :<branch>` (and `git branch -D <branch>` / 
     `git worktree remove` locally if applicable).
   - **Not clean** (real conflict, or CI red/missing) → abort the merge
     (`git merge --abort`), **leave the branch in place**, and add it to the
     report for the user. Do **not** force it, do **not** rebase it, do **not**
     delete it.

After each successful merge to `master`, the push re-triggers the
master-scoped CI workflows (the authoritative gate). If a consolidated push goes
red, that is a normal fix-forward situation for the next interactive session —
report it.

### B. Review Dependabot PRs

```bash
gh pr list --search "author:app/dependabot" --state open
```

For each open Dependabot PR:

- **Merge it** when **all** hold: it is a **patch or minor** version bump, CI is
  **green** (`gh pr checks <n>` all passing), and it is not flagged as a known
  breaking change. Use `gh pr merge <n> --squash` (or the repo's preferred merge
  mode).
- **Leave it for manual review** when **any** hold: it is a **major** version
  bump, CI is red/pending, the changelog mentions breaking changes, or it
  touches a security-sensitive dependency where the maintainer wants eyes on it.
  Add it to the report with the reason.

The integrator never force-merges a red or major Dependabot PR.

### D. Auto-cut a dnd-app release when application source changed (after consolidation)

After the A-merges land on `master`, the integrator decides whether to cut a
dnd-app **desktop** release for the work it just integrated. This is the
automated form of the old manual release step — release-cutting now lives here,
not in the phase agents (see `../dnd-app/docs/phases/INSTRUCTIONS.md` rules 6 & 13).

```bash
# Run from the main checkout on a clean master, AFTER the A-merges are pushed.
node dnd-app/scripts/release/auto-release.mjs      # == npm --prefix dnd-app run release:auto
```

`auto-release.mjs` **reuses the existing helper** (`cut.mjs`) for the actual
bump → commit → tag → push → draft-release path — it never reinvents the
tag/publish path. Its decision rules:

- **Trigger** — release **only** when real dnd-app *application source* changed
  since the last published `v*` tag. Release-worthy globs: `dnd-app/src/**`,
  `dnd-app/package.json` / `package-lock.json`, `dnd-app/resources/**`,
  `dnd-app/index.html`, `dnd-app/electron.vite.config.ts`,
  `dnd-app/scripts/build/**` — **minus** tests, `**/*.md`, `dnd-app/docs/**`, and
  `dnd-app/mobile/**` (the mobile line versions separately). A run that
  integrated only docs / logs / QA reports / suggestion churn cuts **no** release.
- **Bump** — semver **patch** by default; **minor** when the integrated range
  added a completed phase plan under `dnd-app/docs/phases/completed/` (a phase
  landing == a shipped feature, rule 8). Base = `max(latest tag, package.json)`.
- **Cadence** — at most **one** release per integrator run with app changes
  (not batched across runs).
- **Idempotent** — keyed on the latest tag: if `master` HEAD is already the
  tagged release commit, or nothing release-worthy changed since the tag, it
  no-ops. The same commit is never released twice, so the 4-hourly cadence
  **cannot release-storm**; docs-only runs are silent.
- **Notes / changelog** — it writes the GitHub Release body via
  `cut.mjs --notes-file` (completed phases + app-commit summary). Per
  `CHANGELOG.md`, the GitHub Releases page *is* the living changelog, so the
  Release notes are the changelog update; `docs/CHANGELOG.md` stays the frozen
  ≤ v2.1.16 archive.

The cut only ever happens on `master` in the main checkout (the integrator is the
sole automated writer to `master`), and the tag push hands off to `release.yml`
exactly as a manual cut would. A new published release correctly drives
`app-qa-tester` to ask for a fresh desktop QA pass — that interaction is intended.

### C. Report

At the end of its run the integrator reports to the user:

- Branches merged + deleted (with the agent ids).
- Branches **left behind** because they did not merge cleanly or CI was
  red/missing — with the branch name, the agent id, and the conflict/CI reason.
- Dependabot PRs merged.
- Dependabot PRs **left for manual review** — with the PR number, the bump
  (e.g. `major: 4.x → 5.x`), and why.
- The dnd-app release cut this run (`vX.Y.Z` + patch/minor and why), or — if
  no release-worthy app source changed — that **no** release was cut (a
  docs/log/QA-only run is silent here). See Rule 3D.

If `~/.claude-tools/notify.sh` exists, a left-behind branch or a skipped
risky/major Dependabot PR is a warn-level notification (surfaced on the BMO
status board, not SMS) (see the STOP-and-ask
notification convention in `dnd-app/docs/phases/INSTRUCTIONS.md`).

---

> **Deploys are decoupled from this tree.** The bmo Pi deploy
> (`bmo/pi/scripts/deploy.sh`) no longer reads `/home/patrick/home-lab`. It
> deploys from a dedicated, deploy-owned checkout
> (`/home/patrick/home-lab-deploy`) that nothing edits by hand, so a dirty
> master working tree — including an **interrupted integrator merge**, staged
> human edits, or agent churn — can no longer block or pollute a deploy. The
> integrator merging on `master` in the main checkout has zero effect on the
> live services until the merge is pushed and a deploy fetch+resets the
> separate checkout to it. See [`BMO-DEPLOY.md`](BMO-DEPLOY.md).

## Rule 4 — Auto-diagnose, don't just report symptoms

**Whenever you hit a non-clean, failing, unexpected, or anomalous state — a red/failed CI run, a failing or flaky check, an unexpected diff or dirty tree, a surprising scan/QA finding, a service that's down, anything that "isn't clean" — you MUST automatically investigate the root cause before reporting:** trace it to the specific file / commit / config / step responsible, state the cause, and recommend (or, if in scope per the fix-forward + don't-defer rules, apply) the fix. Never surface a bare symptom ("X failed", "this isn't clean") and stop to wait for someone to tell you to look into it. Proactive root-cause diagnosis is the default for every agent.

This is the diagnosis half of the **fix-forward, attempt-risky stance** above — applied to git mechanics:

- **A red CI run on your `auto/*` branch** → read `gh run view <id> --log-failed`, find the failing gate and the commit/file that broke it, and fix it forward (INSTRUCTIONS.md rule 5). Do not push a known-red branch and walk away calling it "CI is red."
- **The integrator leaving a branch behind** (Rule 3A — won't merge cleanly, or red/missing CI) **or skipping a Dependabot bump** (Rule 3B — major / breaking) → the report still names the *cause*: the conflicting files, or the red gate + its failing step, or the specific major-version breaking change. These are the (a)/(b) exceptions — a genuine blocker or a new human decision — so they are correctly left for the user, but they are left **diagnosed**, never as a bare symptom.

Auto-diagnosis is never itself a reason to stop: you diagnose, then either fix forward (in scope) or — only for a real (a) blocker / (b) decision — STOP-and-ask citing the root cause. Canonical statement: INSTRUCTIONS.md rule 28.

---

## Rule 5 — Resolver & phase-executer autonomy: auto-approve `bug`/`security`, gate the rest, restart stays gated

The seven resolver / phase-executer agents (`dnd-resolver`, `scholar-resolver`,
`bmo-resolver`, `overall-resolver`, `dnd-phase-executer`, `scholar-phase-executer`,
`bmo-phase-executer`) run a two-class autonomy policy. **The canonical wording
lives in each agent's scheduled-task definition (its `SKILL.md`); this rule is
the repo-side summary so the workflow doc and the per-domain `INSTRUCTIONS.md`
agree.**

- **AUTO-APPROVE class — `bug` and `security`.** Log entries tagged `bug` or
  `security` (and, for the phase-executers, phases whose primary purpose is
  fixing broken behavior or closing a vulnerability) are **implemented
  automatically every run** — built on the agent's `auto/<agent-id>` branch,
  CI-gated, merged by the daily integrator (Rule 3). **No human approval, and
  they are NOT posted to the status board for approval.**
- **WAIT class — everything else.** `future-idea`, suggestion, enhancement,
  `debt`, `docs`, `info`, `design-gotcha`, non-bug `UX`, and cosmetic
  `config`/`performance`/`portability` keep the prior gated behavior: posted to
  the BMO status board (🤖 Agents) as "awaiting your approval," **not
  implemented until the user approves.**
- **Ambiguous tags resolve toward "bug."** A `debt`/`performance`/`config`/
  `portability`/`UX`/`test` entry that actually describes broken or incorrect
  behavior is treated as a `bug` (auto-approve). A `security`-tagged item that is
  only a hardening *future-idea* (no actual vulnerability) stays WAIT. When
  genuinely unsure, the item stays WAIT and the board note says why.
- **Runs never block.** Each run implements the auto-approve class, posts the
  wait class, then finishes — it never stalls waiting on a gated item.

### The one gate that remains — live bmo service restart

Auto-approving `bug`/`security` fixes means the *code* now lands and merges
unattended. **The live-service restart path does not.** A fix's code is
implemented + merged automatically, but **if it needs a live bmo service restart
(or a release) to take effect, the agent does NOT restart/release unattended** —
it posts a distinct **"⏳ needs restart approval"** status-board item naming the
service + fix and leaves the restart for a human / approved follow-up. **Code
lands automatically; only the live restart waits.**

This gate is only reachable by the agents that ever touch live bmo services —
`dnd-resolver`, `bmo-resolver`, `overall-resolver`, and `dnd-phase-executer`.
The other three never restart bmo at all: `scholar-resolver` and
`scholar-phase-executer` redeploy to GitHub Pages on merge (unchanged automatic
behavior, not a bmo restart), and `bmo-phase-executer` keeps its absolute
"never mutate the live Pi" boundary (the owner / `bmo-deploy.yml` runs
`deploy.sh` after merge). The deploy itself stays decoupled from this tree (see
the deploy note under Rule 3).

### Board notice reflects the split

The consolidated 🤖 Agents summary each agent posts now reports three buckets:
**what was auto-fixed this run**, **what awaits approval** (WAIT class), and
**any awaiting-restart items** — still one consolidated line per agent,
re-synced at the start of every run.

### Every awaiting item carries a one-line description

Each item the board lists as **awaiting your approve/deny** — in both the
consolidated 🤖 Agents summary detail and the in-app needs-action message — must
carry a concise **one-line plain-English description of what it actually does**, not
just its phase number / title (e.g. `PHASE-09 — make Shop and exam dates use one
consistent format`), so the board is decision-ready at a glance. Awaiting-restart
items likewise name the service plus what the restart enables. The canonical wording
lives in each agent’s scheduled-task `SKILL.md`; this is the repo-side note so the
workflow doc and the per-agent definitions agree.

---

## Rule 6 — Board Approve/Deny decisions relay to the ORIGINATING session

The seven resolver / phase-executer agents post WAIT-class items to the BMO status
board (🤖 Agents) as "awaiting your approve/deny" (Rule 5). Each such item can carry
**✅ Approve / ✖️ Deny** buttons whose click is relayed back to the **session that
posted the item** — the same dispatch/cowork session (`local_<uuid>` / `cse_<…>`),
resumed with its full context — which then implements (approve) or closes out (deny)
the item. **Not a new agent, not the next scheduled run.**

- **Stamp the session id.** When a resolver / phase-executer posts a gated item it
  passes its own session id: `notify-board set <agent> <id> agent "<title>" …
  --session-id "$CLAUDE_SESSION_ID"` (or a `session_id` field in a `sync` payload).
  Only items needing a decision carry a session id; FYIs / in-app asks omit it and
  render without buttons.
- **A click writes an outbox record, not a direct call.** The Pi can't `send_message`
  into a session (that's orchestrator-side), so a click appends one JSON line to
  `bmo/pi/data/board_decisions_outbox.jsonl` (item, decision, session id, ts),
  removes the board entry, and ephemerally confirms. A double-click is idempotency-
  guarded (`BOARD_DECISION_COOLDOWN_S`, default 30 s).
- **A dispatch-side poller (orchestrator) consumes the outbox** and `send_message`s
  the decision into the originating session. This poller and the per-agent session-id
  stamping are **orchestrator-side work**, outside this repo.
- **The in-chat path is preserved.** Deciding in chat still has the agents remove the
  entry and act; the buttons are an additional fast path.

Full contract (outbox format, fields, poller spec, what's implemented vs. pending):
[`BOARD-APPROVAL-BRIDGE.md`](BOARD-APPROVAL-BRIDGE.md).

---

## Rule 4 — Heavy local checks go through the admission gate (`run-check.sh`)

Around 2026-07, `bmo` (the 8 GB Pi that hosts several scheduled agents) OOM-crashed
when multiple agents each launched a full-project `npx tsc --noEmit` / `npx vitest` /
build at the same time. Nothing bounded how many heavy jobs ran at once, and nothing
checked whether there was enough free RAM to start one.

The fix is an **admission gate**:
[`bmo/pi/scripts/run-check.sh`](../bmo/pi/scripts/run-check.sh). Automated agents call
heavy checks **through** it instead of invoking them directly:

```bash
bmo/pi/scripts/run-check.sh npx tsc --noEmit -p tsconfig.web.json
bmo/pi/scripts/run-check.sh npx vitest run src/foo.test.ts
```

The wrapper:

1. **Free-RAM floor** — reads admissible RAM from `free -m` (the `available` column,
   which counts reclaimable cache) and refuses to launch while it is below a floor
   (`RUN_CHECK_RAM_FLOOR_MB`, default 2500 MB); it waits and re-checks rather than
   starting a job that would OOM.
2. **Per-node semaphore of 1** — an `flock` lock file admits only
   `RUN_CHECK_MAX_CONCURRENCY` heavy jobs (default 1) at a time, so concurrent agents
   serialize instead of all running full-project `tsc`/`vitest` at once (exactly what
   OOM'd the Pi).
3. **Queue with jitter** — when saturated it waits with small randomized back-off up
   to `RUN_CHECK_TIMEOUT_S` (default 900 s); on timeout it exits `75` (`EX_TEMPFAIL`)
   without launching.
4. **Pass-through** — on admission it runs the wrapped command and exits with the
   command's own exit code.

Everything is env-override-able: `RUN_CHECK_RAM_FLOOR_MB`, `RUN_CHECK_MAX_CONCURRENCY`,
`RUN_CHECK_TIMEOUT_S`, `RUN_CHECK_POLL_INTERVAL_S`, `RUN_CHECK_JITTER_S`,
`RUN_CHECK_LOCK_DIR`, plus a `RUN_CHECK_DISABLE=1` escape hatch for humans. Tests:
`bmo/pi/tests/test_run_check.py` (semaphore serialization + RAM-floor gate) and the
shellcheck / `bash -n` coverage in `bmo/pi/tests/test_shell_scripts.py`.

**The rule:** the "cheap, targeted checks" step in the phase loop
([`dnd-app/docs/phases/INSTRUCTIONS.md`](../dnd-app/docs/phases/INSTRUCTIONS.md) rule 5)
— any heavy local `npx tsc --noEmit` / `npx vitest` / build an automated agent runs on
a shared node — **MUST** go through `run-check.sh`. This applies to every scheduled
resolver and phase-executer. CI remains the authoritative gate; the wrapper only governs
how heavy checks are *launched locally* so they cannot OOM the box.

---

## Humans / interactive sessions

Humans and interactive (non-scheduled) AI sessions **may still commit to
`master` directly** — the contention problem only arises from many *unattended,
concurrent* writers. A human (or a single interactive session) doing focused
work on `master`, or on a topic branch per `docs/CONTRIBUTING.md`
(`feature/…`, `fix/…`, `docs/…`, `chore/…`), is fine.

If you are an interactive session doing the kind of bulk, parallelizable work a
scanner does (e.g. sweeping every file for one class of fix), prefer the
worktree model above so you do not collide with the scheduled agents.

---

## Release flow & CI

- The dnd-app release helper (`dnd-app/scripts/release/cut.mjs` /
  `npm run release:cut`) and the tag-driven `release.yml` workflow are unchanged
  in *mechanism* — what changed is **who drives them**: the integrator now
  **auto-cuts** the release after consolidating branches (Rule 3D /
  `release:auto`), instead of a human or the phase agents cutting it manually.
  Releases are still cut from `master`, still only via `cut.mjs`, and a human can
  still cut one by hand at any time.
- The CI 4-gate is still authoritative. Relevant for branches:
  - `dnd-app-ci.yml` triggers on **every push** (no branch filter) — so a push
    to `auto/<agent-id>` runs the dnd-app lint → forbidden-patterns → typecheck
    (web+node) → schema-validate → full vitest → build → verify → guards gate.
  - The correctness gates `bmo-pi-pytest.yml` and `dnd-app-validate-5e.yml`
    also trigger on **every push** (path-filtered), so bmo and 5e-data changes
    on an `auto/<agent-id>` branch produce a real pre-merge red/green signal.
  - The remaining master-scoped gates (`security-audit.yml`, `codeql.yml`,
    `bmo-docker-build.yml`, plus the deploy workflows) trigger push only on
    `master`/`main`, **plus** on `pull_request`. A branch-only push leaves NO
    run for them — the integrator must treat a never-ran gate as *unknown*
    (not green) for branches touching their paths, not silently green; they
    re-run as the final authority when the merge lands on `master`. Open a PR
    for an `auto/*` branch if a pre-merge run of these is needed.
  - Either way, **the merge to `master` re-runs the master-scoped gates as the
    final authority.** The integrator only merges branches whose CI is green.

The only thing that changed: automated agents reach `master` **via their own
branch + the integrator**, not by pushing `master` themselves.

---

## Quick reference

```
Automated agent:                         Integrator (daily):
  fetch origin                             fetch --prune; checkout master; pull --ff-only
  git worktree add \                       for each origin/<branch> != master:
    /home/patrick/home-lab-trees/<id> \      CI green? merges clean?
    -B auto/<id> origin/master               yes -> merge + push master + delete branch
  cd into it; edit; commit                   no  -> leave + report
  git push -u origin auto/<id>             review Dependabot PRs:
  (never touch master)                       patch/minor + green -> merge
                                             major / red       -> leave + report
                                           report merged / left-behind / PRs
```
