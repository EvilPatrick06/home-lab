# BMO Issues Log

> **Active BMO bugs / tech debt / broken config / perf — domain-scoped to the Pi voice assistant + DM engine + Discord bots (`bmo/`).** Includes Pi-side infra/tooling that BMO depends on (the venv, pip caches, Pi systemd, etc.) since this is the Pi's primary domain.
>
> Sibling logs:
>
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - BMO future ideas / design gotchas / observations → `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`
> - Security concerns (any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule (BMO-domain entries):** Bug / debt / config / perf issues whose **Domain: bmo** (or Pi-side infra/tooling) → here. dnd-app entries → `ISSUES-LOG-DNDAPP.md`. `Domain: both` → mirror in both issue logs (small duplication is fine; one fix removes both). Security (any domain) → `SECURITY-LOG.md`. Design-gotcha / future-idea / info → `BMO-SUGGESTIONS-LOG.md`.

New entries go at the TOP of their severity section (newest first within each section).

**Process (read this):** This log is the **deferred** backlog, not a duplicate of every commit. Per `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`: if a bug is fixed in the same session / PR, we **do not** add a new entry here (the commit + moved archive entry are the record). That can make it look like the log "stopped" — it did not; it only tracks **outstanding** work. When an item is done, it moves to `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)` and is removed from here.

---

# Active BMO Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new BMO items below as they appear.

## Critical

*(none currently logged)*

## High

### [2026-06-23] `bmo / deploy` red on master — health-gated deploy aborts on dirty live checkout (Gate 3) due to concurrent dev-tree writes

- **Category:** infra / CI (deploy reliability)
- **Severity:** high
- **Domain:** bmo (Pi infra/tooling)
- **Discovered by:** ci-failure-triage (2026-06-23 ~08:30Z run)
- **Failed runs:** `28012173813` (target `a349ea7b`, 08:14Z) and `28012662356` (target `dfdc76e2`, 08:23Z) — both `bmo / deploy` on master.

**Root cause:**
`bmo/pi/scripts/deploy.sh` Gate 3 (`git status --porcelain` non-empty → `fail "working tree is dirty; commit/clean before deploying (never auto-stashed)"`, line 157) aborted before any mutation. The Pi's deploy target `/home/patrick/home-lab` is also the shared **dev tree** (deploy.sh explicitly never stashes/clobbers it). At deploy time the tree was dirty from in-flight automation: the `docs/logs/` migration (commit `dfdc76e2`) was still mid-flight — staged deletions of the old-path bridge files `docs/*-LOG.md` / `docs/RESOLVED-*.md` plus unstaged edits to `.gitattributes`, `.gitignore`, and `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`. Confirmed live during triage: the tree flipped clean→dirty within minutes, so it is an **ongoing race**, not a one-off. Not a code defect in deploy.sh — a contention problem between the health-gated deploy and concurrent agents editing the live checkout. Last successful deploy was `88c5f7e5` (07:58Z); master HEAD `717f07a6` is currently **undeployed**.

**Proposed fix:**
- [ ] **Immediate:** once the in-flight `docs/logs` migration is committed and `git status --porcelain` on the Pi is empty, re-dispatch `bmo / deploy` (`gh workflow run "bmo / deploy"`, default target = `origin/master` HEAD) so master lands green and `717f07a6` actually deploys. (Not done by triage: committing/cleaning the tree would have clobbered another agent's half-staged migration.)
- [ ] **Structural:** make deploy independent of the shared dev tree — deploy from a clean ephemeral checkout (dedicated `git worktree` / fresh clone to a deploy-only path), OR have the deploy gate retry/back-off on a *transient* dirty tree (re-poll `status --porcelain` for N seconds before failing) so concurrent agent edits can no longer turn the deploy red.
- [ ] Optionally serialize live-tree-mutating agents against deploys via the existing `home-lab-locks/` lock convention.

**Note (benign, no action):** cancelled run `28012396581` (dnd-app CI, `91096a31`) was a concurrency supersede — the next master push `dfdc76e2` ran dnd-app CI green (`28012454736`).


## Medium

## Low

---

> dnd-app issues: `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`. BMO future ideas / design gotchas / observations: `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`. Security (any domain): `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO issues: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
