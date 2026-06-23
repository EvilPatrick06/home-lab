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

### C. Report

At the end of its run the integrator reports to the user:

- Branches merged + deleted (with the agent ids).
- Branches **left behind** because they did not merge cleanly or CI was
  red/missing — with the branch name, the agent id, and the conflict/CI reason.
- Dependabot PRs merged.
- Dependabot PRs **left for manual review** — with the PR number, the bump
  (e.g. `major: 4.x → 5.x`), and why.

If `~/.claude-tools/notify.sh` exists, a left-behind branch or a skipped
risky/major Dependabot PR is a warn-level notification (see the STOP-and-ask
notification convention in `dnd-app/docs/phases/INSTRUCTIONS.md`).

---

## Rule 4 — Auto-diagnose, don't just report symptoms

**Whenever you hit a non-clean, failing, unexpected, or anomalous state — a red/failed CI run, a failing or flaky check, an unexpected diff or dirty tree, a surprising scan/QA finding, a service that's down, anything that "isn't clean" — you MUST automatically investigate the root cause before reporting:** trace it to the specific file / commit / config / step responsible, state the cause, and recommend (or, if in scope per the fix-forward + don't-defer rules, apply) the fix. Never surface a bare symptom ("X failed", "this isn't clean") and stop to wait for someone to tell you to look into it. Proactive root-cause diagnosis is the default for every agent.

This is the diagnosis half of the **fix-forward, attempt-risky stance** above — applied to git mechanics:

- **A red CI run on your `auto/*` branch** → read `gh run view <id> --log-failed`, find the failing gate and the commit/file that broke it, and fix it forward (INSTRUCTIONS.md rule 5). Do not push a known-red branch and walk away calling it "CI is red."
- **The integrator leaving a branch behind** (Rule 3A — won't merge cleanly, or red/missing CI) **or skipping a Dependabot bump** (Rule 3B — major / breaking) → the report still names the *cause*: the conflicting files, or the red gate + its failing step, or the specific major-version breaking change. These are the (a)/(b) exceptions — a genuine blocker or a new human decision — so they are correctly left for the user, but they are left **diagnosed**, never as a bare symptom.

Auto-diagnosis is never itself a reason to stop: you diagnose, then either fix forward (in scope) or — only for a real (a) blocker / (b) decision — STOP-and-ask citing the root cause. Canonical statement: INSTRUCTIONS.md rule 28.

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

## Release flow & CI (unchanged)

- The dnd-app release helper (`dnd-app/scripts/release/cut.mjs` /
  `npm run release:cut`) and the tag-driven `release.yml` workflow are
  **unchanged**. Releases are still cut from `master`.
- The CI 4-gate is still authoritative. Relevant for branches:
  - `dnd-app-ci.yml` triggers on **every push** (no branch filter) — so a push
    to `auto/<agent-id>` runs the dnd-app lint → forbidden-patterns → typecheck
    (web+node) → schema-validate → full vitest → build → verify → guards gate.
  - The other gates (`bmo-pi-pytest.yml`, `security-audit.yml`, `codeql.yml`,
    `dnd-app-validate-5e.yml`, `bmo-docker-build.yml`, `deploy.yml`) trigger
    push only on `master`/`main`, **plus** on `pull_request`. So to get the full
    gate on an `auto/*` branch before integration, open a PR for it; otherwise
    the master-scoped gates run when the integrator pushes the merge to
    `master`.
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

## TODO (temporary) — remove the docs/logs migration bridge symlinks

On 2026-06-23 the active/archive logs moved from `docs/` into `docs/logs/`.
To avoid breaking scheduled agents whose prompts still write to the old
`docs/<LOG>.md` paths, each old path is now a symlink into `docs/logs/`:

    docs/ISSUES-LOG.md -> logs/ISSUES-LOG.md   (and the other 13 logs)

These symlinks are a TEMPORARY compatibility bridge. Once every scheduled-task
prompt has been updated to target `docs/logs/<LOG>.md` directly:
  1. Delete the 14 `docs/<LOG>.md` bridge symlinks (12 tracked + the 2 gitignored
     security ones: SECURITY-LOG.md, RESOLVED-SECURITY-ISSUES.md).
  2. Remove the "TEMPORARY transition bridge" bare-glob block in `.gitattributes`.
  3. Remove the old `docs/SECURITY-LOG.md` / `docs/RESOLVED-SECURITY-ISSUES.md`
     bridge lines from `.gitignore`.
