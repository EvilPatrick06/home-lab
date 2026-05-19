# Phase Execution Instructions

> How to work through the phase plans in this directory. Read this before starting any phase work.

## The 27 rules

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

### 5. 4-gate test + commit at the END of each PHASE (not sub-phase) — per user 2026-05-19
After the LAST sub-phase of a phase finishes, before cutting the release in rule 6:

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

All four gates must be green. A red gate is a STOP-and-ask trigger:

1. Fire notify.sh per rule 23:
   ```bash
   ~/.claude-tools/notify.sh "warn" "Phase N — 4-gate red at end-of-phase" \
     "<which gate(s) failed + cited file:line if any + suggested fix path>"
   ```
2. Fix in place. Do NOT cut the release in rule 6. Do NOT advance to the next phase.
3. Re-run the 4-gate. Repeat until green, then continue to rule 6.

For phases that touch the Pi side (32, 36, anything under `bmo/pi/`), also run `pytest bmo/pi/tests/` from `bmo/pi/`.

**Sub-phase work accumulates in the working tree; commit + push ONCE per phase.** Per the user's 2026-05-19 directive ("doing tests after every step is exhausting and not necessary; speed this up" + follow-up: "commit only after each Phase not sub phase"), per-sub-phase commits are NOT created. Edit, update the plan's Completed section (rule 17 — still applies per sub-phase), move to the next sub-phase. After the LAST sub-phase + the end-of-phase 4-gate is green:

1. Single `git add` of every file touched during the phase.
2. Single commit with a phase-scoped message: `feat(<scope>): phase N — <one-line theme>`. Body lists each sub-phase that landed inside.
3. Single `git push origin master`.

Lighter checks during sub-phase work are still encouraged (and cheap): `npx tsc --noEmit -p tsconfig.web.json` after a non-trivial edit takes seconds and catches the obvious type breakage. But the full lint + tsc + vitest sweep is reserved for end-of-phase, and so is the commit.

**Exceptions** — these still get their own commits even mid-phase:
- Plan amendments per rule 22 (the audit trail "plan was wrong → fixed → then implemented" remains in separate commits).
- Meta-file edits per rule 16 (INSTRUCTIONS.md, CLAUDE.md, etc.) when the user authorizes them mid-phase.
- Foreign-branch cleanup per rule 11 if the user authorizes a delete mid-phase.

The exceptions exist because their audit-trail value is the separation. Phase work itself stays bundled.

If a contributor wants per-sub-phase commits + gating back, they can revert this rule edit — the playbook honors the user's current trade-off (speed > granular history > early detection inside a phase).

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

**When to sweep** — the foreign-branch check fires at TWO points, not just one:
- **Top of every phase iteration**, as part of rule 15's `git fetch` block (the entry-gate check).
- **Every progress checkpoint during a phase** (rule 21, every ~5 sub-phases), so branches that appear mid-phase (a dependabot PR opened mid-run, a side branch from another contributor, a stray push from another AI session) get caught within ~5 sub-phases instead of sitting unnoticed until the next phase starts.

Both points run the same one-liner: `git fetch origin --quiet && git ls-remote --heads origin | grep -v 'refs/heads/master$'`. Non-empty output → STOP+ask per the protocol above. Cost per mid-phase sweep is one `git fetch` against origin (negligible).

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

The checkpoint also doubles as a **foreign-branch sweep** — see rule 11's "When to sweep" section. A single `git fetch origin --quiet` + branch-listing runs alongside the progress note; if anything other than `master` exists on origin, STOP+ask via rule 23. Catches branches that appear mid-phase without waiting for the next phase iteration.

### 22. Phase-plan amendments land BEFORE implementation, in their own commit
During rule 3 (verify), if you discover the plan needs editing — a file path drifted, a Step is wrong, a Constraint is now stale — DO NOT mix the plan edit with the implementation. Land the plan amendment in its own commit FIRST:

```
docs(phase-N): correct file path in NX step Y — file moved during Phase M
```

THEN start implementation against the corrected plan. The implementation commit cites the corrected line.

Rationale: mixing plan edits with implementation hides the "the plan was wrong" signal in the diff. Future contributors reading `git log` should see a clear sequence: "plan amended → work done against amended plan." Not: "everything changed at once, good luck."

If the amendment is large (multiple Steps need rewording, a Sub-Phase needs splitting), treat it as a rule 9 STOP-and-ask trigger — the plan may need user input before you can sensibly correct it.

### 23. SMS the user on every STOP-and-ask trigger
Any time rule 9 fires — or any rule that cites it (10, 11, 15, 16, 19, 22) — call the notification script BEFORE waiting on the user. The user is not at the terminal during long runs; silent STOPs waste hours.

```bash
~/.claude-tools/notify.sh "<severity>" "<subject>" "<body>"
```

- `<severity>` is one of `info`, `warn`, `error`. STOPs use `warn` for confusion / scope questions; `error` for release failures / branch ambiguity / auth failures.
- `<subject>` is a one-line title (`Phase 17 Sub-Phase 17c stopped`).
- `<body>` is the detail block: which phase, which sub-phase, why the stop fired, the cited line numbers if any, and the suggested next step (or "awaiting direction" if none is obvious).

The script lives at `~/.claude-tools/notify.sh` and sends an SMS to `+1-304-621-7418` via the user's configured provider (Twilio, email-to-SMS gateway, ntfy.sh push, etc.). Provider choice + credentials are local config (the script + `~/.claude-tools/.credentials` file). The agent only calls the script — it does not pick the provider or store the secret.

If `~/.claude-tools/notify.sh` does not exist, log a warning and continue the STOP without notification — but flag this in the next end-of-run summary (rule 14) as "Notify script missing; alerts were not sent." Do NOT silently skip without surfacing it.

Rate limit: at most one SMS per ~5 minutes. If a second STOP fires within that window, append the body to a pending-batch file (`~/.claude-tools/pending.txt`) and send a single combined message on the next eligible send. Prevents spamming the user's phone when a bad plan triggers many STOPs in a row.

### 24. Maintain the session-active heartbeat for the failsafe watchdog
The active alert in rule 23 only fires if the agent is alive enough to call the script. If the session crashes, the network drops, or the host reboots, the agent can't notify anyone — by design, that's what the external watchdog catches.

The agent's job is to maintain the heartbeat file the watchdog reads:

- **At session start** (before rule 1's first iteration): `touch ~/.claude-tools/session-active && touch ~/.claude-tools/heartbeat`.
- **After every successful commit** (per rule 5 / rule 17 exit) AND **at every progress checkpoint** (rule 21): `touch ~/.claude-tools/heartbeat`.
- **At end-of-run** (after rule 14's summary): `rm -f ~/.claude-tools/session-active`. The watchdog reads this absence as "session ended cleanly; do not alert."
- **On clean STOP-and-ask** (rule 9 triggers that the user is actively responding to): keep `session-active` present; keep heartbeat fresh until the user responds. The watchdog's threshold should be long enough (~15 min) that a quick back-and-forth doesn't trigger a false alert.

If the script paths under `~/.claude-tools/` don't exist when the agent starts (fresh setup, never configured), log a warning and proceed without the heartbeat. Surface this in the rule 14 summary as "Failsafe heartbeat not configured."

The watchdog itself lives at `~/.claude-tools/watchdog.sh` and is invoked by a host-level scheduler (systemd user timer on the Pi, cron, etc. — set up out-of-band by the user). It reads `~/.claude-tools/session-active` + `~/.claude-tools/heartbeat`, decides whether to fire, and (if firing) calls `~/.claude-tools/notify.sh`. The rules above are what the agent does; the watchdog is what the host does when the agent can't.

### 25. Permission-classifier blocks count as STOP-and-ask
The agent runs under a permission classifier that auto-approves some tool calls and prompts for others. In an unattended run, a prompt-required tool call blocks the agent indefinitely — there's no signal to the user until they next look at the terminal. Hours of wall time can vanish into a single waiting prompt.

When the agent is **about to** call a tool the classifier will block, OR has just received an "awaiting permission" / "permission denied" response from the harness, treat it identically to a rule 9 STOP-and-ask:

```bash
~/.claude-tools/notify.sh "warn" "Phase N — permission prompt blocking" \
  "<tool> on <target> requires approval. Action: <one-line description>. \
   Suggested next: approve / deny / redirect."
```

Then keep `~/.claude-tools/session-active` present (do **not** clear it) so the watchdog stays quiet while the user is responding, and keep heartbeating per rule 24 so a long human-response delay doesn't trigger a false crash alert.

Common triggers in this repo:
- `Bash` calls outside the auto-allow set: most `sudo` invocations, touching `/etc`, `/usr`, `/var`, `systemctl --system`, `chmod` on files outside `$HOME`
- `Write` to paths outside the project tree (the `~/.claude-tools/*` setup itself qualifies — every file create there will block)
- Network operations to hosts not in the allow list
- Destructive git operations (`git push --force*`, `git reset --hard`, `git branch -D` on non-current branches) — even when they'd succeed, the harness may still gate them

If the agent isn't sure whether a particular call will block, **assume it might** and send the SMS preemptively. A redundant alert is far better than a silent block.

This rule does **not** mean "stop trying" — once the user approves (or redirects), continue per rule 10. The SMS exists so the wait isn't silent, not to abandon the task.

### 26. SMS / email replies satisfy the STOP wait
When rule 9 (or any of its derivatives — 11, 15, 16, 19, 22, 25) STOPs the agent and rule 23 fires the SMS + email, the user can respond from anywhere:

a. **Typing into the terminal** — the existing path.
b. **Replying to the SMS on the phone** — Google Fi forwards the reply back to Gmail as email from `+1<10digits>@msg.fi.google.com`; the reply-watcher picks it up.
c. **Replying to the email in Gmail** — direct path; reply-watcher picks it up.

Paths (b) and (c) are handled by the `claude-reply-watcher` systemd user service (installed + verified end-to-end on the Pi). The watcher:

- IMAP-polls `datdude365d@gmail.com` every ~12s while `~/.claude-tools/session-active` is present (drops to 30s when idle).
- Searches `ALL` UIDs and only acts on UIDs above its `seen_max` watermark — Gmail's monotonic UIDs guarantee mail above that line is new; this avoids UNSEEN / SINCE edge cases (Gmail auto-flags, date-tz parsing) and never replays history.
- Processes newest UIDs first so a fresh reply lands ahead of any backlog.
- Allowlist sender regexes:
  - `^datdude365d@gmail\.com$`
  - `^\+?\d+@msg\.fi\.google\.com$` — Fi forwards as `+1<digits>@msg.fi.google.com`; the `+` matters.
- Skips our own outbound by matching `X-Mailer: claude-code-notify/1.0`.
- Verifies Gmail-from-Gmail mail against `Authentication-Results` (rejects spoofs with `spf=fail` / `dkim=fail`).
- Strips quoted previous message, signatures, and our own notify-script chrome (severity emoji header, `━━` divider, `🤖 Claude Code` footer).
- Injects cleaned body into the named tmux session: `tmux send-keys -l "<body>" ; tmux send-keys Enter`.

For this to work the agent must run inside a tmux session whose name is recorded in `~/.claude-tools/session-meta`. The `~/.claude-tools/claude-tmux` wrapper handles both — it writes `session-meta` then `exec tmux new-session -A -s "${SESSION}" claude "$@"`. Alias `claude='$HOME/.claude-tools/claude-tmux'` lives in `~/.bashrc`; takes effect on the next new shell or after `source ~/.bashrc`.

The agent doesn't change its STOP wait behavior — the reply lands on stdin as if typed locally. Existing `STOP_AND_ASK` paths unblock when the line arrives.

**Verified end-to-end latency:** ~55s (Fi MMS-to-email forwarding 30–45s + IMAP poll up to 12s + processing). A reply that arrives while `session-active` is absent OR the tmux session is dead is **logged but NOT injected** — the user has to go to the terminal directly.

**Health checks:**

```bash
systemctl --user is-active claude-reply-watcher.service        # must be 'active'
tail ~/.claude-tools/reply-watcher.log                          # recent activity / INJECTED lines
tmux list-sessions                                              # the named session must be alive
grep -E '(skip|inject-failed)' ~/.claude-tools/reply-watcher.log | tail   # diagnose missed injections
```

**Limitations:**
- Single-session: all replies route to the tmux session named in `session-meta`. Multi-session routing needs Message-ID-tagged session IDs (future work).
- Security: anyone with access to the user's Gmail OR the ability to compose an SMS to the user's number can inject input. The permission classifier still gates dangerous tool calls (rule 25 SMSes back to confirm), so injection alone can't trigger destructive commands without an additional approval round-trip.

### 27. Deferral is a rule-9 STOP-and-ask trigger
Never silently defer a Step / Sub-Phase / log-finding because it appears to depend on later work, conflicts with the current type system, or otherwise looks out of reach in this session. The moment you catch yourself thinking *"I'll skip this and come back after X lands"* or *"I'll write a stub and the real one later"*, treat it identically to rule 9:

1. Stop before editing or skipping. Do NOT mark the Step `PARTIAL` or `DEFERRED` on your own.
2. Fire notify.sh per rule 23:
   ```bash
   ~/.claude-tools/notify.sh "warn" "Phase N — deferral candidate" \
     "<sub-phase + step + cited line + apparent dependency + proposed defer path>"
   ```
3. Wait for the user's call: continue against the conflict, defer with their authorization, re-order, drop, or amend the plan.

Common signals that you are about to silently defer (all are triggers, not permissions):
- "Needs the Character5e v4 shape first" / "needs Step X to land first."
- "I'll write a stub for now and the real one later."
- "Marking PARTIAL — <some reason that wasn't on the plan>."
- "Skipping this case because the data shape doesn't match."
- "This depends on Phase M's work; deferring."
- "Scope is too large for one session; I'll do part now and part later."

The user owns ordering decisions. The agent's job is to surface the conflict, cite specifics (plan line + code line + the apparent dep), and wait. Rule 9's umbrella covers this; rule 27 names it explicitly because the failure mode is recurring.

If the user authorizes the deferral, document it honestly in the plan's `## Completed` section per rule 17: cite the user's directive ("deferred per user 2026-MM-DD direction") and what the deferral target is so future sessions know where to resume.

---

## Quick reference — the loop

```
# SESSION START (rule 24):
touch ~/.claude-tools/session-active
touch ~/.claude-tools/heartbeat

# Helper: STOP_AND_ASK(severity, subject, body):
#   ~/.claude-tools/notify.sh "<severity>" "<subject>" "<body>"   (rule 23, rate-limited inside script)
#   keep session-active present so the watchdog stays quiet while user is responding
#   touch ~/.claude-tools/heartbeat                                (rule 24, prevent false alert)
#   wait for user

while plans remain in dnd-app/docs/phases/ (excluding INSTRUCTIONS.md):
  REFRESH: git fetch origin && git pull origin master --ff-only (rule 15)
    -> ff-only fails: STOP_AND_ASK("error", "ff-only failed", <diff summary>)

  CHECK: any remote branch other than master?
    -> yes: STOP_AND_ASK("warn", "foreign branch found", <branch info>) (rule 11)
    -> no: continue

  plan = earliest phase-N-plan.md
  review(plan)
  verify(plan, code)
    -> plan drift discovered: amend plan first in its own commit (rule 22)
       touch ~/.claude-tools/heartbeat
    -> amendment is large/ambiguous: STOP_AND_ASK("warn", "plan amendment too large", <details>)

  sub_phase_counter = 0
  for each sub-phase in plan:
    implement(sub-phase)
    if next tool call will be blocked by permission classifier:
      STOP_AND_ASK("warn", "permission required for <tool>", <action + suggested approve/deny>) (rule 25)
    if confused or conflicting:
      STOP_AND_ASK("warn", "phase N sub-phase X stopped", <reason + cited lines + suggested next>) (rule 9)
    if about to defer / skip / stub / PARTIAL-mark a Step on your own:
      STOP_AND_ASK("warn", "phase N — deferral candidate", <step + cited dep + proposed path>) (rule 27)
    if would-modify any meta-file:
      STOP_AND_ASK("warn", "meta-file edit requested", <which file + why>) (rule 16)
    if out-of-scope finding discovered:
      LOG to correct file (rule 12), do not inline-fix
    update plan's `## Completed` section with file:line citations (rule 17) — working tree only, NO commit yet
    touch ~/.claude-tools/heartbeat                                       (rule 24)
    sub_phase_counter += 1
    if sub_phase_counter % 5 == 0:
      emit progress checkpoint (rule 21)
      touch ~/.claude-tools/heartbeat                                     (rule 24)
      git fetch origin --quiet                                            (rule 11 mid-phase sweep)
      if `git ls-remote --heads origin | grep -v 'refs/heads/master$'` is non-empty:
        STOP_AND_ASK("warn", "foreign branch found mid-phase", <branch + last commit + diff stat + recommendation>) (rule 11)

  # END-OF-PHASE 4-gate + single commit (rule 5, user 2026-05-19):
  run 4-gate (lint + tsc-web + tsc-node + vitest; pytest if Pi-side)
  if 4-gate red:
    STOP_AND_ASK("warn", "phase N — 4-gate red at end-of-phase", <which gate + cited line + fix path>) (rule 5)
    fix in place + re-run until green; do NOT cut release, do NOT advance phase
  git add <every file touched during the phase>
  git commit -m "feat(<scope>): phase N — <one-line theme>" -m "<body listing each sub-phase>"
  git push origin master
  touch ~/.claude-tools/heartbeat                                         (rule 24)

  cut release (NOT a force-push, NOT a tag rewrite — rule 20)
  verify release workflow + assets
  delete plan file
  commit deletion to master + push
  touch ~/.claude-tools/heartbeat                                      (rule 24)

# After the last plan is gone:
precheck `gh auth status` (rule 19)
  -> not authenticated: STOP_AND_ASK("error", "gh not authenticated", "run `gh auth login`")
watch every release cut during the run (rule 13)
  -> touch heartbeat between each `gh run watch` to prevent watchdog false alert
if any release failed:
  STOP_AND_ASK("error", "release vX.Y.Z failed", <which job + last 30 lines + suggested next>)
else:
  summarize success
emit end-of-run summary (rule 14):
  1. phases completed (count + list)
  2. problems & friction (with suggested follow-ups)
  3. logged-finding count (file + count; NO inline content)

# SESSION END (rule 24): clean shutdown signal to the watchdog.
rm -f ~/.claude-tools/session-active
stop

# All dates written anywhere during the loop use ISO YYYY-MM-DD from system clock (rule 18).
```

---

## Notes

- This file (`INSTRUCTIONS.md`) is NOT a phase plan and is NOT deleted by rule 8.
- This file overrides any conflicting general guidance in `CLAUDE.md`, `AGENTS.md`, or session prompts when working on phase execution. Anything else in those files stands.
- If the user updates these rules mid-flight, follow the new rules immediately and treat the old version as void.
- Rule 9 (STOP-and-ask) is the umbrella for every escalation in this file. Rules 11 (foreign branch) and 13 (release failure) explicitly cite it; any other "should I…?" judgment call also falls under rule 9.
