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

### [2026-07-15] Agent/task worktrees accumulate unbounded on the Pi — 58 registered (~16 GB), nothing prunes them

- **Category:** debt, config
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — agent-fleet git machinery check

**Description:**
`/home/patrick/home-lab-trees/` holds 53 directories / 58 registered worktrees totaling ~16 GB (root disk now 65% used, 40 G free). The worktree model in `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` expects agents to remove their worktree at run end and the integrator to delete merged branches — but most surviving trees are one-off task checkouts (`expo-sdk56`, `docfix`, `mc-ping-button`, `location-fix`, `bmo-py-bump`, ~40 more) whose branches were merged and deleted long ago. Remote branch cleanup exists (`stale-branch-pruner.yml`), but **no mechanism prunes the local working trees**, so growth is unbounded on the 8 GB-RAM / 117 GB-disk Pi that also hosts the live services; each new checkout adds hundreds of MB (multi-GB once a project installs node_modules).

**Hypothesis / root cause:** the 2026-06 worktree redesign specified per-run cleanup for scheduled agents, but interactive/one-off sessions adopting the worktree model have no cleanup step, and no periodic janitor covers the directory as a whole.

**Proposed fix / improvement:**
- [ ] Add a scheduled janitor (Pi cron or an existing cleanup agent) that runs `git -C /home/patrick/home-lab worktree prune` and removes trees whose branch no longer exists on origin, tree is clean, and mtime > N days
- [ ] Document the retention rule in `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` so interactive sessions know worktrees are disposable

**Blocked by:** none

**Related files:** `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `.github/workflows/stale-branch-pruner.yml`

**Related entries:** [2026-07-02] `.gitignore` agent-lock globs entry (SUGGESTIONS-LOG.md) — same 2026-06 redesign left-over class


### [2026-07-15] Fallback-identity agent commits are all misattributed to `dnd-e2e-harness` — the main checkout's repo-local `user.name`/`user.email` is the shared default for every agent worktree

- **Category:** config, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — agent-fleet git machinery check

**Description:**
`/home/patrick/home-lab/.git/config` sets `user.name = dnd-e2e-harness` / `user.email = dnd-e2e-harness@automated.local` (repo-local; no `--global` identity exists on the Pi). Every agent worktree under `/home/patrick/home-lab-trees/` shares the main repo's `.git/config`, so any automated agent that does not set an explicit per-commit identity commits as **dnd-e2e-harness** — 177 commits on `master` since 2026-06-20 carry that identity, including integrator consolidation merges (`integrator: merge auto/…`), the `chore(release): bump dnd-app to v2.8.3` release commit, dnd-resolver fixes, a Dependabot fix-forward, and an overall-errors log append (`71c00b01`). `git log` provenance no longer answers "which agent did this" — exactly the audit trail the agent-id convention in `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` exists to provide (and what a postmortem like the 2026-06-22 worktree incident needs). Compounding: the agents that DO set an identity use at least six inconsistent email domains (`@bmo.local`, `@home-lab.local`, `@local`, `@auto.local`, `@automated.local`, `@agents.local`), so per-agent history greps are unreliable even for the well-behaved ones.

**Reproduction (if bug):**
1. `cd /home/patrick/home-lab && git config --show-origin --get-all user.name` → `file:.git/config  dnd-e2e-harness`
2. `git log --format="%ae" --since=2026-06-20 origin/master | sort | uniq -c | sort -rn` → 177× `dnd-e2e-harness@automated.local` spanning integrator/release/resolver/scanner commits

**Expected behavior (if bug):** each automated commit is attributed to the agent-id that made it (one canonical email domain); the shared fallback is neutral, not another agent's name.

**Hypothesis / root cause:** an earlier dnd-e2e harness setup ran `git config user.name/user.email` in the main checkout (repo-local, not `--worktree` or per-command `-c`); since worktrees inherit `.git/config`, that identity became the silent fleet-wide fallback.

**Proposed fix / improvement:**
- [ ] Replace the main checkout's repo-local identity with a neutral one (e.g. `home-lab-automation <automation@home-lab.local>`) — or remove it and let commits fail loudly when no identity is set
- [ ] Add to `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` setup: agents commit with `git -c user.name=<agent-id> -c user.email=<agent-id>@home-lab.local commit …` (pick ONE canonical domain) or set `--worktree` config at worktree creation
- [ ] Optional drift guard: flag new `master` commits carrying the fallback identity

**Blocked by:** none

**Related files:** `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

**Related entries:** none
