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


### [2026-07-17] Integrator merged `auto/bmo-resolver` while its branch CI was red — master `bmo / pi pytest` red >24h, bmo deploys skipped (Rule 3A check races late pushes)

- **Category:** bug
- **Severity:** high
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — CI/integrator machinery check

**Description:**
The 2026-07-16 integrator run merged `origin/auto/bmo-resolver` (merge commit `87f25757`) even though the branch tip `18b822fe` had a **red** `bmo / pi pytest` run: the branch was pushed 05:54:34Z, its pytest run 29475160732 concluded **failure at 05:58:15Z**, and the integrator batch landed on master at ~06:09:50Z — ≥11 minutes after the failure was final. Result: master run 29475949981 red (`test_env_template_drift` — `BMO_RELAY_MAX_ROOMS`/`BMO_RELAY_MAX_PEERS_PER_ROOM` read in `game_relay.py` but absent from `.env.template`/allowlist), every subsequent `bmo / deploy` skipped, and 73 bmo files stranded undeployed >24h. The *symptom* (red gate + blocked deploy) is logged in BMO-ISSUES-LOG [2026-07-17] and a fix branch (`auto/bot-commands-fix`, `5faa5c22`) is in flight; THIS entry is the repo-wide process hole: `AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 3A says red or missing CI → leave the branch behind + report, but the integrator merged it anyway.

**Reproduction (if bug):**
1. `gh run view 29475160732 --json createdAt,updatedAt,conclusion` → failure, final 05:58:15Z, branch `auto/bmo-resolver`, sha `18b822fe`
2. `git log -1 --format=%ci bbb766a3` (integrator batch tip) → 2026-07-16 00:09:50 -0600 (06:09:50Z)
3. `gh run list --workflow bmo-pi-pytest.yml --branch master` → 29475949981 failure on `bbb766a3`; all later `bmo-deploy.yml` runs `skipped`

**Expected behavior (if bug):** the integrator verifies the branch **tip sha** has a green, completed CI conclusion at merge time; red or still-pending → branch left behind + reported.

**Hypothesis / root cause:** TOCTOU between the integrator CI check and late agent pushes — plausibly the integrator snapshotted CI status before/while the `18b822fe` run was executing (05:54–05:58Z) and matched runs by *branch* (latest completed run = the previous commit green) instead of pinning to the branch **head sha**, then merged the newer tip. Speculation as to mechanism; the merged-while-red fact is confirmed by timestamps.

**Proposed fix / improvement:**
- [ ] In the integrator check, resolve `origin/<branch>` to a sha first, then require green via `gh run list --commit <sha>` (or `gh api .../commits/<sha>/check-runs`) — treat pending/missing as NOT clean (per Rule 3A) and re-check the sha immediately before `git merge`
- [ ] Optionally: ignore branches pushed within the last N minutes (settling window) to avoid racing in-flight CI
- [ ] Update the integrator SKILL.md wording to require sha-pinned, completed-conclusion checks

**Blocked by:** none (integrator logic lives in its scheduled-task definition, orchestrator-side)

**Related files:** `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `.github/workflows/bmo-pi-pytest.yml`, `.github/workflows/bmo-deploy.yml`

**Related entries:** BMO-ISSUES-LOG [2026-07-17] master pytest red / env-template drift (the domain symptom + code fix); ISSUES-LOG-DUNGEON-SCHOLAR unmergeable `auto/scholar-phase-executer` branch (other integrator edge)


### [2026-07-17] Orphaned agent stashes accumulate in the shared repo — 7 stashes back to 2026-06-22, incl. crashed-run WIP and "parked" deploy-unblock edits nothing ever un-parks

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — shared git-state check

**Description:**
`git stash list` in `/home/patrick/home-lab` shows 7 stashes spanning 2026-06-22 → 2026-07-17, created by different agents on different branches (`WIP on master` ×3, `WIP on auto/dnd-errors`, `WIP on auto/bmo-resolver`, `On auto/scholar-resolver: stale-apkg-wip-from-crashed-run-1782339939`, `On master: deploy-unblock: local mobile-dep edits parked 2026-06-28…`). The stash stack is repo-global (shared by the main checkout and all ~57 worktrees), so this is unowned cross-agent state: nobody knows which stashes are safe to drop, at least one is explicitly from a **crashed run**, and one "parked" stash from the 2026-06-28 deploy-unblock has sat 19 days with no owner or expiry. Risks: silently lost work (an agent stashes, crashes, never pops), and an agent popping another agent WIP into the wrong tree. Neither `AUTOMATED-AGENT-GIT-WORKFLOW.md` nor any janitor (cron `stale-local-cleanup.sh`) addresses stashes.

**Hypothesis / root cause:** agents use `git stash` as a crash-safe park mechanism, but the workflow doc defines no stash convention (never-stash / pop-before-exit / label-with-agent-id), and no cleanup covers the stash reflog — same "2026-06 redesign left-over" class as the worktree/lock-glob entries.

**Proposed fix / improvement:**
- [ ] Add a stash rule to `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (prefer commit-on-own-branch over stash; if stashing, label `<agent-id>: …` and pop/drop before run end)
- [ ] One-time triage of the 7 current stashes (inspect `git stash show -p`; salvage or drop), ideally by the resolver after user approval
- [ ] Extend the weekly cleanup to warn (board/notify) when stashes older than N days exist

**Blocked by:** none

**Related files:** `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`, `bmo/pi/scripts/stale-local-cleanup.sh`

**Related entries:** ISSUES-LOG [2026-07-15] worktree accumulation; SUGGESTIONS-LOG [2026-07-16] stale-local-cleanup no-op (same unowned-shared-state family)


### [2026-07-17] Dead-relative-link backlog has no active tracking entry and is growing (≈180 → 190) — md-links CI job is warn-only with no path to enforcing; `completed/` phase-archive moves keep minting new dead links

- **Category:** debt, docs
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — ran `scripts/check-md-links.sh` on master tip

**Description:**
`bash scripts/check-md-links.sh` on master tip reports **190 dead relative links** (48 dungeon-scholar/docs, 43 bmo/docs, 41 docs/logs, 21 docs/LOG-INSTRUCTIONS.md, 12 docs/README.md, plus others). The original tracking entry ([2026-07-02] md-link-check) was moved to `RESOLVED-ISSUES.md` when the warn-only `md-links` job shipped in `ci-hygiene.yml` — but the resolution only added the *reporter*; the "~180-link backlog triage, then flip to enforcing" half now has **no active log entry anywhere**, so it is invisible to the resolver fleet, and the backlog has grown ~10 links since. Dominant generator: phase docs moved into `docs/phases/completed/` keep links written relative to their original location (`./PHASE-INDEX.md`, `./INSTRUCTIONS.md`, `./QA/completed/QA-report-*.md`), so every phase-archive step mints several new dead links — warn-only CI never pushes back. The script header calls these docs "the agent-coordination fabric"; 190 rotten links degrade agent navigation, not just human reading.

**Reproduction (if bug):**
1. `bash scripts/check-md-links.sh` → `FAILED — 190 dead relative link(s)`
2. `grep -n "warn-only" .github/workflows/ci-hygiene.yml` → the CI job passes `--warn-only`

**Expected behavior (if bug):** backlog shrinks toward 0 under an owned triage item, then the CI job drops `--warn-only`; archive moves rewrite (or avoid) location-relative links.

**Hypothesis / root cause:** resolution of the 2026-07-02 entry closed the tracking item at "reporter shipped" instead of splitting off the triage/enforce half; and the phase-completion workflow (all three projects) moves files without fixing their relative links.

**Proposed fix / improvement:**
- [ ] Triage the 190-link backlog (bulk is mechanical: `completed/` files needing `../` prefixes), then flip the ci-hygiene md-links job to enforcing
- [ ] Fix the generator: phase-archive instructions (per-project INSTRUCTIONS.md) should require re-running `check-md-links.sh` after moving a file, or the mover should rewrite `./`-relative links
- [ ] Until enforcing, have the job fail only on *newly added* dead links (baseline count), so the backlog cannot grow silently again

**Blocked by:** none

**Related files:** `scripts/check-md-links.sh`, `.github/workflows/ci-hygiene.yml`, `docs/logs/RESOLVED-ISSUES.md` (line ~78), `dungeon-scholar/docs/phases/completed/`, `bmo/docs/phases/`

**Related entries:** RESOLVED-ISSUES [2026-07-02] md-link-check (reporter shipped, triage half dropped); SUGGESTIONS-LOG [2026-07-15] guards-not-in-Makefile (same guard-visibility family)
