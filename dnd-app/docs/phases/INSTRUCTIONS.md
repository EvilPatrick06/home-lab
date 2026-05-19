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
- Keep the local branch list and the GitHub branch list both equal to `[master]`.
- **If a remote branch other than `master` exists** (e.g., from a previous AI session, a dependabot PR, a stale review branch), this is a **rule 9 STOP-and-ask trigger**. Do NOT delete it without explicit user permission. Present the user with:
  - The branch name (local and/or remote)
  - When it was last committed to + by whom
  - What's on it (`git log master..<branch>` summary, file-changed list)
  - The proposed action (delete via `git push origin :<branch>` + `git branch -D <branch>`, or keep, or merge)
  - Wait for the user's call. Then follow exactly.

Tags are fine (the release flow creates `vX.Y.Z` tags), but only via `cut.mjs` — never `git push --tags` (would push intermediate lightweight tags). Verify `.github/workflows/release.yml`'s tag filter is restricted to `'v*.*.*'` before pushing any tags manually.

### 12. Log every out-of-scope finding to the correct log file
During review, verify, implement, or test, if you discover anything that is NOT part of the current sub-phase's scope — a new bug, a tech-debt item, a future-idea, a design gotcha, a security concern — log it. Do NOT inline-fix items that aren't in the current sub-phase's scope. Log them and keep moving. Out-of-scope inline fixes break the per-sub-phase 4-gate isolation and bloat the diff.

Triage to the right file (per `docs/LOG-INSTRUCTIONS.md`):

| Finding kind | Domain | Log file |
|---|---|---|
| Bug / debt / config / perf / test failure | dnd-app | `docs/ISSUES-LOG-DNDAPP.md` |
| Bug / debt / config / perf / test failure | BMO | `docs/BMO-ISSUES-LOG.md` |
| Future idea / design gotcha / observation | dnd-app | `docs/SUGGESTIONS-LOG-DNDAPP.md` |
| Future idea / design gotcha / observation | BMO | `docs/BMO-SUGGESTIONS-LOG.md` |
| Security concern | any | `docs/SECURITY-LOG.md` (gitignored) |
| Cross-cutting | dnd-app + BMO | mirror in BOTH relevant logs |

Use the entry template + severity / category fields from `docs/LOG-INSTRUCTIONS.md`. Date the entry. Cite file paths and line numbers. Be specific enough that a future contributor (or future you) can act on the entry without re-discovering it.

Logs grow during phase work and are emptied when a future phase plan absorbs each entry. That's normal — the log files are entry points for triage, not permanent backlogs.

### 13. After the LAST phase, wait for every release to fully publish
After deleting the final phase plan file (rule 8 applied to the last plan), the work is NOT done yet. Wait for every release cut during the run to fully publish and verify.

For each release shipped during the run:

```bash
# Watch the most recent release workflow run
gh run watch

# Or list recent runs and inspect any that aren't completed
gh run list --workflow=release.yml --limit 20

# Inspect a specific run's logs if anything is suspicious
gh run view <run-id> --log
```

Confirm for each release:
- Preflight job: green (lint + tsc-web + tsc-node + vitest all passed)
- Build matrix: Windows + Linux jobs both completed
- `verify-assets` job: green (all 6 expected files present on the GitHub release page)
- `electron-updater` can see the new version (browse the release page, confirm `latest.yml` / `latest-linux.yml` are present and parseable)

**If any release fails or any check is red:** this is a **rule 9 STOP-and-ask trigger**. Alert the user with:
- Which release (`vX.Y.Z`) failed
- Which workflow step / job failed
- The error excerpt from the logs (last ~30 lines)
- The recommended next action (re-run job, tag a fix release, manual rollback, etc.)

Do NOT attempt to fix a failed release automatically. Releases affect users and need the user's judgment.

If every release is fully green, summarize for the user: "All N releases shipped (`vA.B.C`, `vD.E.F`, …). Every preflight + build + verify-assets job green. Phase work complete." Then move to rule 14.

### 14. End-of-run summary
After rule 13 confirms every release shipped (or you've alerted the user about failures), produce one final summary message before the session ends. Three sections:

**1. Phases completed.** Exact count + list. Examples:
- "Completed 4 phases this run: 15, 16, 17, 19."
- "Completed 1 phase: 15." (single-phase run is fine)
- "Completed 0 phases — stopped at Phase 15 Sub-Phase B on user direction." (when work was halted mid-stream)

If the run halted mid-phase, state which sub-phase was the last to land green and which sub-phase is next so the user can pick up cleanly.

**2. Problems & friction encountered.** For each non-trivial issue that came up during the run, give:
- What went wrong (one sentence)
- How it was resolved (or marked unresolved)
- Suggested follow-up if any (test file to add, doc to update, memory entry to write, refactor candidate)

Include both code-level problems (a failing test, a plan step that didn't match reality) and process-level friction (a sub-phase took multiple attempts, a 4-gate gate kept flaking). Be concise — one or two lines per item.

If new test files / docs / memory entries / phase-plan amendments were created during the run, list them with file paths so the user can find them. Do NOT re-paste their contents.

**3. Logged-finding count.** If rule 12 fired (out-of-scope finding logged to one of the triage files), report:
- Count + log file: "Logged 3 entries in `docs/ISSUES-LOG-DNDAPP.md`, 1 in `docs/SUGGESTIONS-LOG-DNDAPP.md`, 0 in `docs/SECURITY-LOG.md`."
- Closing line: "Review at your convenience."

Do NOT describe the findings inline. The user's preference is to triage on their own time; the summary just signals that the logs grew.

If no findings were logged, say so: "No new entries logged this run."

**Tone:** factual, scannable, no praise, no apology. Bullet lists for each section. Total length: ~10-30 lines depending on how eventful the run was.

### 15. Refresh from origin before opening any plan
At the top of every phase iteration (before rule 1 picks the earliest plan), refresh local from remote:

```bash
git fetch origin
git status                # confirm clean
git pull origin master --ff-only
```

If `--ff-only` fails (divergence), this is a rule 9 STOP-and-ask trigger. The user may have pushed a fix-up or another session's work; do not force-merge.

This catches the silent-corruption case where remote master moved while a session was idle. Without it, the loop can write commits against a stale tree and produce conflict-laden pushes.

### 16. Do not modify meta-files unprompted
The following files are **meta**: they govern AI behavior, persistent state, or sensitive notes that the user owns explicitly.

- `dnd-app/docs/phases/INSTRUCTIONS.md` (this file)
- `/home/patrick/.claude/projects/-home-patrick-home-lab/memory/*` (memory store)
- `docs/SECURITY-LOG.md` (gitignored — sensitive)
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules` (repo-level AI guidance)

Modifying any of them is a **rule 9 STOP-and-ask trigger**. Even seemingly-helpful edits (adding a memory entry, tightening a rule, appending to SECURITY-LOG) need user permission first. Phase work touches plan files (`phase-N-plan.md`), code, and the per-domain ISSUES/SUGGESTIONS logs — those are in scope; the meta-files are not.

Exception: rule 12 (logging out-of-scope findings) explicitly authorizes appends to `docs/SECURITY-LOG.md` for new security findings discovered DURING phase work. That's the only auto-touched meta-file, and it's append-only.

### 17. Update the plan's `Completed` section after every sub-phase
4-gate green is not enough on its own. As part of the per-sub-phase exit criteria, also update the phase plan's `## Completed` section with a precise file:line citation and a one-line summary of what landed.

Example after sub-phase `15a` ships:

```markdown
## Completed
- 15a Step 1 — DONE (`src/renderer/src/types/library.ts:23`) — `EntryRef<T>` interface + `DeepPartial<T>` recursive helper + `LibraryEntry<T>` per-category mapped type.
- 15a Step 2 — DONE (`src/renderer/src/services/library/schemas/registry.ts:1`) — `SCHEMA_REGISTRY` + `validateEntry` + `safeValidateEntry` exports.
- 15a Step 5 — DONE (`src/renderer/src/services/library/schemas/registry.test.ts:1`) — snapshot test walks all of `public/data/5e/**`; passes.
```

Commit the doc edit in the SAME commit as the code (or as a follow-up commit before pushing). The Completed section is the progress tracker; if it stays empty after sub-phases land, future sessions can't tell what's done without re-running verification.

If a sub-phase lands partially (some Steps green, others deferred), reflect that honestly: `DONE` for the green parts, `PARTIAL — <reason>` for the rest. Never mark something `DONE` you didn't verify.

### 18. ISO-date every stamp
Anywhere the loop writes a date — log entries (rule 12), summary timestamps (rule 14), `Completed` "verified <date>" lines (rule 17), commit message dates, memory entries — use ISO format `YYYY-MM-DD` and pull the value from the system:

```bash
date -u +%Y-%m-%d
```

Never hardcode a guess, never carry over a stale date from another file, never invent. Drift in the audit trail compounds across sessions.

### 19. Precheck `gh` auth before rule 13
Rule 13 leans on `gh run watch`, `gh run list`, and `gh run view`. Before entering the wait loop, run:

```bash
gh auth status
```

If `gh` is not authenticated (or the token is expired): this is a **rule 9 STOP-and-ask trigger**. Tell the user to run `gh auth login` and wait for confirmation before proceeding. Do not improvise (no curl-against-the-API workaround unless the user explicitly directs it).

### 20. Do NOT amend, force-push, or rewrite released tags
Released tags (`v2.1.38`, `v3.0.0`, etc.) are immutable in the wild — `electron-updater` clients have them pinned. Never:

- `git tag -f <existing-tag>`
- `git push --force <existing-tag>`
- `git push --force-with-lease <existing-tag>`
- `gh release edit <tag>` to change the underlying ref

A bad release gets a **new** tag (a hotfix bump: `v2.1.38` → `v2.1.39`), not a rewrite. If the user explicitly directs a rewrite, treat it as a rule 9 escalation and confirm twice — once that they want the rewrite, once with the impact ("This will break auto-updaters on every client that received the old tag").

### 21. Emit a progress checkpoint every ~5 sub-phases
For phases with many sub-phases (Phase 17 has 32, Phase 28 has 9 clusters with multiple items each, Phase 34 has 12, Phase 36 has 10), the loop can run in radio silence for an hour or more. Avoid this.

After every ~5 sub-phases (or every ~30 minutes of wall time, whichever first), emit a single-line progress note before continuing:

```
Phase 17 progress: 17a/17b/17c/17d/17e green. Next: 17f. Logged 1 ISSUES, 0 SECURITY entry.
```

Then continue (rule 10 still applies — don't pause for confirmation; just emit + move on). The user can interrupt cleanly if they want to redirect. Without the checkpoint, interruption requires either trusting the radio silence or breaking the flow.

### 22. Phase-plan amendments land BEFORE implementation, in their own commit
During rule 3 (verify), if you discover the plan needs editing — a file path drifted, a Step is wrong, a Constraint is now stale — DO NOT mix the plan edit with the implementation. Land the plan amendment in its own commit FIRST:

```
docs(phase-N): correct file path in NX step Y — file moved during Phase M
```

THEN start implementation against the corrected plan. The implementation commit cites the corrected line.

Rationale: mixing plan edits with implementation hides the "the plan was wrong" signal in the diff. Future contributors reading `git log` should see a clear sequence: "plan amended → work done against amended plan." Not: "everything changed at once, good luck."

If the amendment is large (multiple Steps need rewording, a Sub-Phase needs splitting), treat it as a rule 9 STOP-and-ask trigger — the plan may need user input before you can sensibly correct it.

---

---

## Quick reference — the loop

```
while plans remain in dnd-app/docs/phases/ (excluding INSTRUCTIONS.md):
  REFRESH: git fetch origin && git pull origin master --ff-only (rule 15)
    -> ff-only fails: STOP, ask user (rule 9)

  CHECK: any remote branch other than master?
    -> yes: STOP, ask user (rule 11)
    -> no: continue

  plan = earliest phase-N-plan.md
  review(plan)
  verify(plan, code)
    -> plan drift discovered: amend plan first in its own commit (rule 22)
    -> amendment is large/ambiguous: STOP, ask user (rule 9)

  sub_phase_counter = 0
  for each sub-phase in plan:
    implement(sub-phase)
    if confused or conflicting:
      STOP -> ask user -> follow answer (rule 9)
    if would-modify any meta-file:
      STOP, ask user (rule 16)
    if out-of-scope finding discovered:
      LOG to correct file (rule 12), do not inline-fix
    run 4-gate
    if 4-gate green:
      update plan's `## Completed` section with file:line citations (rule 17)
      commit (code + Completed edits together) + push to master
      sub_phase_counter += 1
      if sub_phase_counter % 5 == 0:
        emit progress checkpoint (rule 21)
      continue
    else:
      fix in place, re-run 4-gate

  cut release (NOT a force-push, NOT a tag rewrite — rule 20)
  verify release workflow + assets
  delete plan file
  commit deletion to master + push

# After the last plan is gone:
precheck `gh auth status` (rule 19)
  -> not authenticated: STOP, ask user
watch every release cut during the run (rule 13)
if any release failed:
  STOP, alert user with diagnosis
else:
  summarize success
emit end-of-run summary (rule 14):
  1. phases completed (count + list)
  2. problems & friction (with suggested follow-ups)
  3. logged-finding count (file + count; NO inline content)
stop

# All dates written anywhere during the loop use ISO YYYY-MM-DD from system clock (rule 18).
```

---

## Notes

- This file (`INSTRUCTIONS.md`) is NOT a phase plan and is NOT deleted by rule 8.
- This file overrides any conflicting general guidance in `CLAUDE.md`, `AGENTS.md`, or session prompts when working on phase execution. Anything else in those files stands.
- If the user updates these rules mid-flight, follow the new rules immediately and treat the old version as void.
- Rule 9 (STOP-and-ask) is the umbrella for every escalation in this file. Rules 11 (foreign branch) and 13 (release failure) explicitly cite it; any other "should I…?" judgment call also falls under rule 9.
