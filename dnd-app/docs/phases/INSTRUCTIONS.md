# Phase Execution Instructions

> How to work through the phase plans in this directory. Read this before starting any phase work.

## The 11 rules

### 1. Start with the earliest phase plan in folder
Find the lowest-numbered `phase-N-plan.md` file in `dnd-app/docs/phases/` that still exists. Open it. That's the current phase. Do not skip ahead. Do not work on a later phase while an earlier one is unshipped.

### 2. Review
Read the full plan top to bottom before touching code. Pay attention to:
- **Context** — why this phase exists and what it changes
- **Depends on / blocks** — confirm dependencies have shipped; confirm downstream plans expect this work
- **Files touched** — full file list scoped to the phase
- **Sub-phase summary** — the work units inside the phase
- **Sub-phase details** — exact steps + acceptance per sub-phase
- **Constraints & edge cases** — limits and traps
- **Completed** — anything already done; do not redo

### 3. Verify
Before implementing, verify each step against the actual code. Open the cited files and confirm the described pre-state matches reality. If the codebase has drifted since the plan was written (file moved, line numbers shifted, function renamed), update the plan inline before starting work. Do not implement against stale assumptions.

### 4. Implement
Work through the sub-phases in their stated order. For each sub-phase:
- Follow the Steps exactly
- Touch only the listed Files
- Honor the Constraints
- Don't expand scope mid-sub-phase

If a step turns out to be wrong or missing context, see rule 9.

### 5. 4-gate test between each sub-phase
After every sub-phase finishes (before moving to the next one or committing):

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

All four gates must be green. A red gate means stop and fix in place — do not advance to the next sub-phase with a failing gate.

For phases that touch the Pi side (32, 36, anything under `bmo/pi/`), also run `pytest bmo/pi/tests/` from `bmo/pi/`.

Once the 4-gate is green, commit the sub-phase with a clear message (`feat(<scope>): <phase>X — <theme>`), push, and move to the next sub-phase.

### 6. Ship release
When the last sub-phase of a phase is green and committed, cut the release per `dnd-app/docs/RELEASE.md` (or `CLAUDE.md` release flow):

```bash
# Stash uncommitted edits (cut.mjs requires clean tree)
git stash push -u -m "wip-during-release"

# Write release notes
cat > /tmp/vX.Y.Z-notes.md <<'EOF'
**Phase N — <theme>.**
... per-sub-phase summary, test plan, breaking-change notes ...
EOF

# Bump + commit + tag + push + pre-create release with notes
node dnd-app/scripts/release/cut.mjs X.Y.Z --notes-file /tmp/vX.Y.Z-notes.md

git stash pop
```

The Release workflow runs preflight (lint + tsc-web + tsc-node + vitest) and asset-verify. Both must be green for the release to publish.

One release per phase. Not per sub-phase.

### 7. Repeat on the next phase
After the release publishes successfully, return to rule 1 and find the next earliest phase plan still in the folder.

### 8. Delete the phase file once the release has shipped
After a release is live on GitHub and verified (all assets present, smoke-tested locally), delete the phase's plan file from `dnd-app/docs/phases/`. Commit the deletion with `chore(phases): phase N shipped as vX.Y.Z — remove plan`.

This is how progress is visible: the folder shrinks as work lands. A plan that's still on disk is unfinished work.

### 9. If something is confusing or seems conflicting, STOP and ask
If you encounter any of the following, do NOT improvise. Stop and ask the user:
- A step's described pre-state doesn't match the actual code, and the right fix isn't obvious
- Two parts of the same plan contradict each other
- The plan conflicts with another phase plan that depends on it or is depended on by it
- A constraint or acceptance criterion is ambiguous
- A test fails for a reason the plan doesn't address
- Scope creep is tempting ("while I'm in here, should I also...")
- A file the plan says to touch doesn't exist, OR a file the plan doesn't mention needs changes

When asking: cite the specific plan line, the specific code line, and the specific concern. Give the user enough context to answer without re-reading everything.

After asking, follow the user's instructions exactly. No improvising, no second-guessing once they've answered.

### 10. Do not stop unless rule 9 fires or the user says stop
Otherwise: keep going. Sub-phase done → commit → push → next sub-phase. Last sub-phase done → release → delete plan → next phase. The loop continues until every plan in the folder is shipped and removed.

Don't pause for confirmation between sub-phases. Don't pause for confirmation between commits. Don't pause to summarize progress unless asked.

### 11. Always work on master
- No feature branches.
- No new branches at all.
- All commits go straight to `master`.
- All pushes go to `origin master`.
- If a remote branch other than `master` exists (e.g., from a previous AI session), delete it: `git push origin :<branch>` + `git branch -D <branch>`.
- Keep the local branch list and the GitHub branch list both equal to `[master]`.

Tags are fine (the release flow creates `vX.Y.Z` tags), but only via `cut.mjs` — never `git push --tags` (would push intermediate lightweight tags). Verify `.github/workflows/release.yml`'s tag filter is restricted to `'v*.*.*'` before pushing any tags manually.

---

## Quick reference — the loop

```
while plans remain in dnd-app/docs/phases/:
  plan = earliest phase-N-plan.md
  review(plan)
  verify(plan, code)
  for each sub-phase in plan:
    implement(sub-phase)
    if confused or conflicting:
      STOP -> ask user -> follow answer
    run 4-gate
    if 4-gate green:
      commit + push to master
      continue
    else:
      fix in place, re-run 4-gate
  cut release
  verify release published with all assets
  delete plan file
  commit deletion to master
  push
```

---

## Notes

- This file (`INSTRUCTIONS.md`) is NOT a phase plan and is NOT deleted by rule 8.
- This file overrides any conflicting general guidance in `CLAUDE.md`, `AGENTS.md`, or session prompts when working on phase execution. Anything else in those files stands.
- If the user updates these rules mid-flight, follow the new rules immediately and treat the old version as void.
