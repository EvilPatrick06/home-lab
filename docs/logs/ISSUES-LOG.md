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

### [2026-07-15] Weekly full-history secret-scan sweep is permanently red — gitleaks allowlist covers only the CURRENT vendored-bundle path, not its pre-reorg historical path

- **Category:** config, test
- **Severity:** high
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — CI/Actions health sweep

**Description:**
`.github/workflows/secret-scan.yml` runs a weekly (Mon 06:00 UTC) full-git-history gitleaks sweep as the authoritative secret backstop. It has failed **every scheduled run to date** (2026-07-06 and 2026-07-13, run 29231222976), while the push/PR working-tree scans stay green. Reproduced locally with the same pinned gitleaks 8.28.0: the "leak" is the `generic-api-key` rule false-matching the minified identifier `FourKeyMap` in the vendored **`xterm.min.js`** — at its **pre-reorg historical path `BMO-setup/pi/static/js/xterm.min.js`** (commits `4aa30d38` and `a8982df1`, 2026-03/2026-04; the file no longer exists in the tree). `.gitleaks.toml` already allowlists exactly this false positive, but only at the current path (`bmo/pi/web/static/js/.*\.min\.js$`), so the tree scan passes while the history sweep re-hits the same bundle at its old location every week. Not a real secret — no rotation needed. Compounding it: the scheduled step runs without `-v`, so the red CI log says only `leaks found: 1` with no file/rule/commit — undiagnosable from CI output alone; and the workflow has no `workflow_dispatch`, so a fix cant be re-verified without waiting a week. A permanently-red security gate also trains alarm-fatigue that would mask a REAL historical leak.
### [2026-07-15] Weekly full-history secret-scan sweep is permanently red — gitleaks allowlist covers only the CURRENT vendored-bundle path, not its pre-reorg historical path

- **Category:** config, test
- **Severity:** high
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — CI/Actions health sweep

**Description:**
`.github/workflows/secret-scan.yml` runs a weekly (Mon 06:00 UTC) full-git-history gitleaks sweep as the authoritative secret backstop. It has failed **every scheduled run to date** (2026-07-06 and 2026-07-13, run 29231222976), while the push/PR working-tree scans stay green. Reproduced locally with the same pinned gitleaks 8.28.0: the "leak" is the `generic-api-key` rule false-matching the minified identifier `FourKeyMap` in the vendored **`xterm.min.js`** — at its **pre-reorg historical path `BMO-setup/pi/static/js/xterm.min.js`** (commits `4aa30d38` and `a8982df1`, 2026-03/2026-04; the file no longer exists in the tree). `.gitleaks.toml` already allowlists exactly this false positive, but only at the current path (`bmo/pi/web/static/js/.*\.min\.js$`), so the tree scan passes while the history sweep re-hits the same bundle at its old location every week. Not a real secret — no rotation needed. Compounding it: the scheduled step runs without `-v`, so the red CI log says only `leaks found: 1` with no file/rule/commit — undiagnosable from CI output alone; and the workflow has no `workflow_dispatch`, so a fix can't be re-verified without waiting a week. A permanently-red security gate also trains alarm-fatigue that would mask a REAL historical leak.

**Reproduction (if bug):**
1. `gitleaks detect --config .gitleaks.toml --redact --no-banner -v --source .` on a full-history clone
2. 2 findings, both fingerprint `<commit>:BMO-setup/pi/static/js/xterm.min.js:generic-api-key:7` (commits `4aa30d386628c7aabfcb3893f0ad1711b0912551`, `a8982df135aa289e00f22d2e6843623e96012b21`); CI reported 1 on master-only history — same false positive either way

**Expected behavior (if bug):** weekly sweep green; red only on a genuine finding, with the finding identified in the log.

**Hypothesis / root cause:** the 2026-06 repo reorg moved the bmo web static dir (`BMO-setup/pi/static/` → `bmo/pi/web/static/`); the allowlist was written against the new path only, and since push/PR scans are `--no-git` tree scans, the gap is only reachable by the weekly history sweep.

**Proposed fix / improvement:**
- [ ] Allowlist the historical path in `.gitleaks.toml` (`'''BMO-setup/pi/static/js/.*\.min\.js$'''`) or pin the two fingerprints in a `.gitleaksignore`
- [ ] Add `-v` to both gitleaks steps (`--redact` already masks values) so any future red names its finding
- [ ] Add `workflow_dispatch:` to `secret-scan.yml` so the sweep can be re-run on demand to verify the fix

**Blocked by:** none

**Related files:** `.github/workflows/secret-scan.yml`, `.gitleaks.toml`

**Related entries:** RESOLVED-ISSUES.md entry that introduced the server-side scan as the authoritative backstop (the push/PR + weekly-sweep design)

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

### [2026-07-15] ISSUES-LOG.md carries a truncated duplicate of today's secret-scan entry — a single commit appended the same entry header twice

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** scheduled cross-cutting error scan — log-integrity check

**Description:**
The cross-cutting pointer log `docs/logs/ISSUES-LOG.md` contains the 2026-07-15 entry "Weekly full-history secret-scan sweep is permanently red…" **twice back-to-back**: a truncated copy (header + metadata + Description paragraph only, ending mid-entry with no Reproduction/fix sections) immediately followed by the complete copy. Both copies were introduced by the SAME commit (`71c00b01`, this morning's overall-errors run) — a malformed append by that run, not a union-merge artifact. The stray fragment inflates grep hits for the finding, risks a resolver double-processing or half-reading it, and once the real entry is moved to `RESOLVED-ISSUES.md` the orphaned fragment will linger as a phantom open issue.

**Reproduction (if bug):**
1. `grep -n "^### .2026-07-15. Weekly full-history" docs/logs/ISSUES-LOG.md` → two hits (lines ~19 and ~29)
2. `git show 71c00b01 -- docs/logs/ISSUES-LOG.md | grep -c "^+### .2026-07-15. Weekly full-history"` → `2`

**Expected behavior (if bug):** one canonical entry per finding.

**Hypothesis / root cause:** the 2026-07-15 overall-errors run inserted its drafted entry twice while editing (draft retained above the final paste) and committed without re-reading the section.

**Proposed fix / improvement:**
- [ ] Delete the truncated first copy so exactly one canonical entry remains; when resolving the secret-scan finding itself, verify no fragment is left behind

**Blocked by:** none

**Related files:** `docs/logs/ISSUES-LOG.md`

**Related entries:** [2026-07-15] Weekly full-history secret-scan sweep is permanently red (the duplicated entry itself)

