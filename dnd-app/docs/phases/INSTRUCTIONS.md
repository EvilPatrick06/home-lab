# Phase Execution Instructions

> **Autonomy policy (auto-approve `bug`/`security`; gate the rest).** Resolver and
> phase-executer agents now **auto-implement `bug` and `security` work every run**
> (built on `auto/<agent-id>`, CI-gated, integrator-merged — no human approval);
> everything else (`future-idea`/enhancement/`debt`/`docs`/`info`/non-bug `UX`/cosmetic
> `config`·`perf`·`portability`) stays gated on the status board for approval. The one
> remaining gate is the **live bmo service restart**: auto-approved code lands and
> merges automatically, but a fix needing a live restart posts a "⏳ needs restart
> approval" board item instead of restarting unattended. Canonical wording lives in
> each agent's scheduled-task `SKILL.md`; the repo-side summary is
> [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md) Rule 5. This does not change the
> STOP-and-ask test below or the live-service boundary.


> How to work through the phase plans in this directory. Read this before starting any phase work.

> **Scope — repo-wide / all domains (not dnd-app-only).** Despite living under `dnd-app/docs/`, this file is the **canonical implement → verify → git → release process for EVERY automated/scheduled agent across ALL domains** — `dnd-app/`, `bmo/`, `dungeon-scholar/`, and any cross-cutting resolver or agent. Its workflow (per-agent `auto/*` branch + worktree, CI as the authoritative gate, fix-forward on red, the release flow) applies repo-wide; a bmo- or dungeon-scholar-scoped agent follows these same rules — only the concrete build/test commands differ per domain (see each domain's README / `AGENTS.md`). Git mechanics: [`../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md); this file governs how agents execute and verify the work itself.

> **⚠️ STATUS (updated 2026-06-10): the folder holds the ACTIVE backlog phase
> set** — `PHASE-NN-<slug>.md` plans authored from the (now-deleted)
> AI-DM-AUDIT.md consolidation, ordered by `PHASE-INDEX.md` (dependency
> manifest). Completed plans live permanently in `completed/` (rule 8).
>
> **Key rule changes:** (2026-06-17) **CI is the authoritative 4-gate — push at
> phase end, never run the full suite locally, never wait for CI, fix-forward on
> red (rule 5)**; ONE commit + ONE push at the END of each phase only; **NO
> per-phase release — one release after the FINAL phase, or mid-run only on an
> explicit user ask (rule 6)**; **plans are NEVER deleted — they move to
> `completed/` (rule 8)**.
>
> For any extensive dnd-app work outside a plan file, these rules still apply
> in full: the 4-gate (rule 5), git discipline (per-agent branch + worktree, rule 11), ISO
> dates (rule 18), the single STOP-and-ask test (rule 9, identical to rule 27:
> stop ONLY for **(a)** a genuine blocker / impossibility or **(b)** a new human
> decision the plan didn't cover — NEVER for size / risk / scope / low
> confidence), and **especially rule
> 10/151/153 (NO mid-run status reports or turn-ending prose — the last thing
> in every response is a tool call) and rule 27/159 (NO deferral / "needs
> testing" / "out of scope" / scope-questions — implement it, gate, commit,
> move on).**

## The 27 rules

### 1. Start with the earliest phase plan in folder
Find the lowest-numbered `PHASE-NN-<slug>.md` file at the top level of `dnd-app/docs/phases/` (NOT in `completed/`). Open it — that's the current phase. Consult `PHASE-INDEX.md` for the dependency map. Do not skip ahead. Do not work on a later phase while an earlier one is unfinished.

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

### 5. CI is the authoritative 4-gate — push and keep moving; never run the full suite locally; never wait — per user 2026-06-17

> **The full 4-gate (lint + tsc-web + tsc-node + the whole `vitest run`) runs on GitHub CI, NOT locally (user 2026-06-17: "make it so GitHub does the 4-gate and comes back fail if any fails, that way we can go faster … you don't stop and you are always doing something").** Half the time the local full sweep was green anyway, so it just burned minutes. Push at phase end; let CI gate; pipeline straight into the next phase; fix-forward when a watcher reports red. The app is in testing (no real users), so a briefly-red master is fine — CI catches it, you fix forward.

**During sub-phase work** — only CHEAP, TARGETED checks: `npx tsc --noEmit -p tsconfig.web.json` (or node) on the changed surface, and at most the single new/affected unit-test file (`npx vitest run path/to/that.test.ts`). These keep quality without the multi-minute full-suite cost. **Run these heavy checks through the admission gate `bmo/pi/scripts/run-check.sh`** (e.g. `run-check.sh npx tsc --noEmit -p tsconfig.web.json`, `run-check.sh npx vitest run path/to/that.test.ts`) — on a shared node like bmo it enforces a free-RAM floor + a 1-job `flock` semaphore so concurrent agents cannot OOM the box (see [AUTOMATED-AGENT-GIT-WORKFLOW.md](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md) Rule 4). Running heavy `tsc`/`vitest` directly is prohibited for automated agents.

**At phase end** (after the LAST sub-phase), do NOT run the local full `vitest run` or full `tsc` sweep. Instead:

```bash
cd dnd-app
npx biome check --write src/      # instant autofix/format only
```

then commit + push (rule 7), then **immediately start the next phase**. The CI workflow `.github/workflows/dnd-app-ci.yml` runs the full gate on the push — Lint (biome) → Forbidden patterns → Typecheck (web) → Typecheck (node) → Validate content schemas → **Tests (`npm test` = full vitest)** → Build (electron-vite) → Verify artifacts → Bundle-size guard → Coverage baseline → Security audit → Circular deps → No-skipped-tests → Dead code (knip). bmo/pi changes additionally trigger `bmo-pi-pytest.yml`. CI is more thorough than the old local 4-gate ever was.

**Watch + fix-forward (NOT STOP-and-ask).** On each push, run a background CI watcher (poll `gh run list --branch auto/phase-executer` for the pushed SHA). When it reports a workflow conclusion = `failure`: drop in, read `gh run view <id> --log-failed`, fix the cause, commit the fix (fix-forward — a new commit on master, do NOT amend/force-push), push, and continue. A red CI run is normal turnaround, **not** a rule-9 STOP trigger. Confirm conclusion=success per rule 12.

**NEVER `ScheduleWakeup` / sleep / park on a timer to WAIT for CI, an anchor-verify, or a review (user 2026-06-17, emphatic).** Waiting is idle is wrong. The background watcher + workflow notifications are the ONLY trigger to circle back. Between pushes you are ALWAYS doing the next phase's real work — including starting the next phase's implementation rather than waiting on its anchor-verify (fold anchors in when they land). The only ways a turn ends are rule-9 (genuine blocker) or rule-14 (folder empty).

**Sub-phase work accumulates in the working tree; commit + push ONCE per phase** (per the 2026-05-19 directive "commit only after each Phase not sub phase"). Edit, update the plan's Completed section (rule 17 — still per sub-phase), move on. After the last sub-phase + `biome check --write`:

1. Single `git add` of every file touched during the phase.
2. Single commit, phase-scoped message: `feat(<scope>): phase N — <one-line theme>`. Body lists each sub-phase.
3. Single `git push -u origin auto/phase-executer` (your agent branch — NEVER master; rule 11) + launch the CI watcher + start the next phase.

For phases that touch the Pi side (`bmo/pi/`), the cheap targeted check is the affected pytest file; CI's `bmo-pi-pytest.yml` runs the full pytest gate on push.

**Exceptions** — these still get their own commits even mid-phase:
- Plan amendments per rule 22 (the audit trail "plan was wrong → fixed → then implemented" remains in separate commits).
- Meta-file edits per rule 16 (INSTRUCTIONS.md, CLAUDE.md, etc.) when the user authorizes them mid-phase.
- Foreign-branch cleanup per rule 11 if the user authorizes a delete mid-phase.

The exceptions exist because their audit-trail value is the separation. Phase work itself stays bundled.

If a contributor wants per-sub-phase commits + gating back, they can revert this rule edit — the playbook honors the user's current trade-off (speed > granular history > early detection inside a phase).

### 6. Ship release — ONLY after the FINAL phase, or on an explicit user ask (changed 2026-06-10)

> **Release-cutting is the INTEGRATOR's job now — phase agents do NOT cut releases (changed 2026-06-29).** The daily/4-hourly integrator auto-cuts the dnd-app release after it consolidates branches to `master`, but only when real dnd-app *application source* changed since the last release — patch by default, minor when a phase landed in `completed/` (see [`../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md) Rule 3D). So a phase agent's job ends at "phase committed + pushed on its own `auto/*` branch + plan moved to `completed/` (rule 8)"; it does **not** run `cut.mjs` itself, and does **not** wait around for a release. The integrator's cut is keyed on merged `master` and is idempotent, so it ships exactly the phases that actually landed.
>
> **No per-phase releases (manual path).** When a human cuts by hand (or the user explicitly asks for a mid-run release), a release is still cut exactly once — after the LAST phase plan completes — not per phase. Do not hand-cut a release on your own judgment mid-run.

When the final phase is green, committed, and pushed (or the user explicitly asks mid-run), cut the release per `dnd-app/docs/RELEASE.md` (or `CLAUDE.md` release flow):

```bash
# Stash uncommitted edits (cut.mjs requires clean tree)
git stash push -u -m "wip-during-release"

# Write release notes covering EVERY phase landed since the previous release
cat > /tmp/vX.Y.Z-notes.md <<'EOF'
**Phases N–M — <run theme>.**
... per-phase summary, test plan, breaking-change notes ...
EOF

# Bump + commit + tag + push + pre-create release with notes
node dnd-app/scripts/release/cut.mjs X.Y.Z --notes-file /tmp/vX.Y.Z-notes.md

git stash pop
```

The Release workflow runs preflight (lint + tsc-web + tsc-node + vitest) and asset-verify. Both must be green for the release to publish. Release notes must cover every phase included in the cut, since multiple phases ship in one release.

### 7. Repeat on the next phase
After the phase commit is pushed and the plan is moved to `completed/` (rule 8), return to rule 1 and find the next earliest phase plan still in the folder. (No release between phases — rule 6.)

### 8. Move the phase plan to `completed/` when the phase lands — NEVER delete plans (changed 2026-06-10)
`git mv` the plan into `completed/` as part of the phase commit (the CI 4-gate runs after the push — rule 5; do NOT wait for it to go green before moving the plan or starting the next phase). Move the plan file into `dnd-app/docs/phases/completed/` keeping its original filename:

```bash
git mv dnd-app/docs/phases/PHASE-NN-<slug>.md dnd-app/docs/phases/completed/
```

Include the move in the phase commit (or a tiny follow-up `chore(phases): phase NN complete — move plan to completed/`). Phase plan files are **never deleted — not at phase end, not when the whole run finishes**. `dnd-app/docs/phases/completed/` is the permanent historical record.

Progress is visible the same way: the top-level `phases/` folder shrinks as work lands; a plan still at top level is unfinished work; `completed/` holds everything that shipped.

### 9. STOP-and-ask ONLY for (a) a genuine blocker or (b) a new human decision — never for size/risk/scope

This is the **single escalation test for the whole file, and it is identical to rule 27.** Do not improvise around a real blocker — but do not stop for size, risk, breadth, or low confidence either. Stop and ask the user **only** when one of these two cases genuinely holds:

- **(a) Genuinely blocked / impossible** — you literally cannot complete the step correctly. Examples: two parts of the same plan flatly contradict each other so a step is impossible; this plan contradicts a plan it depends on (or that depends on it) in a way that makes the work impossible; a described pre-state contradicts the code *and* you cannot determine the intended behavior; a dependency you cannot create; a test failure you genuinely cannot diagnose or resolve; an irreversible / destructive / data-loss action the plan did not authorize.
- **(b) Needs a NEW human decision** the plan / approval / scope did not cover — a real product or judgment call. Examples: choosing between two valid product behaviors; an unrequested scope *expansion* that is itself a product decision; a security / privacy trade-off; a breaking third-party major-version bump. **"This is big / risky / a broad refactor / I'm not 100% sure" is explicitly NOT such a decision.**

**These are NOT rule-9 triggers — handle them and keep going (never stop, defer, stub, or hand back):**

- **Size, risk, breadth, length, or low confidence.** Implement it anyway; the `auto/*` branch + CI + fix-forward is the safety net (rule 27). A behavior change you can't runtime-verify still ships per the plan (opt-in / off-by-default if genuinely risky).
- **An ambiguous constraint / acceptance criterion you can resolve sensibly.** Pick the reasonable reading, implement, and note the assumption in the plan's `## Completed`. It is only case (b) if the choice is a genuine product decision.
- **Plan drift you can correct** (file moved, lines shifted, function renamed, a named file is missing but the intended target is clear, or a file the plan didn't list needs an in-scope edit to finish the assigned fix). Update the plan inline per rule 3 / rule 22 and proceed — case (a) only if you truly cannot tell what the plan intended.
- **A failing test / red gate you can fix.** Fix it forward (rule 5); a red gate or red CI run is normal turnaround, not a stop.
- **"Scope creep is tempting" — a *separate*, unrelated finding.** Do NOT inline-fix it: log it per rule 12 and keep executing the in-scope work. Making the in-scope edits the assigned fix actually requires is not scope creep — that is the work (rule 27).

When case (a) or (b) genuinely holds: cite the specific plan line, the specific code line, and the specific blocker or the specific decision; fire `notify.sh` per rule 23; then wait. Give the user enough context to answer without re-reading everything.

After asking, follow the user's instructions exactly. No improvising, no second-guessing once they've answered.

### 10. Do not stop unless rule 9 fires or the user says stop
Otherwise: keep going. Sub-phase done → commit → push → next sub-phase. Last sub-phase done → release → delete plan → next phase. The loop continues until every plan in the folder is shipped and removed.

Don't pause for confirmation between sub-phases. Don't pause for confirmation between commits. Don't pause to summarize progress unless asked.

**These are NOT reasons to stop, pause, or hand back to the user — they are normal work, keep going:**
- "This is a lot of work / many files / a big cascade."
- "This is hard / complex / risky."
- "This is long / will take a while / spans multiple areas."
- "This looks out of scope / touches more than expected" (log out-of-scope *findings* per rule 12, but keep executing the in-scope work — don't halt the whole task).
- "Manual smoke testing is recommended / the 4-gate can't validate runtime." Note the recommendation in the commit/plan and keep going; do not stop to ask the user to test.
- "I reached a natural checkpoint / milestone." Checkpoints are for a one-line progress note (rule 21), not for stopping.
- "The remaining items are a roadmap I generated myself (e.g. from a review/audit), not formal phase-plan files." **A self-generated roadmap or task-list is treated EXACTLY like the plan folder** — every remaining item is a sub-phase to grind. "These are big / XL / policy-laden / behavior-risky / need a user decision" is NOT a stop reason: implement each one, and if a feature changes runtime behavior in a risky way, ship it **opt-in / off-by-default** and keep going — never pause to ask the user which item to do or to "reply continue." (Reaffirmed 2026-06-02 after the agent shipped 8 releases then twice stopped to ask "which big feature next?" / "reply continue" — the user was furious.)

Stopping or handing back the turn when the work is merely large/hard/long/manual-test-suggested/"a big feature needing direction" is **breaking this rule**. Only a genuine rule-9 trigger — **(a)** genuinely blocked / impossible, or **(b)** a new human decision the plan didn't cover (the exact same (a)/(b) test as rule 27) — or an explicit user "stop" ends the loop. "Big / risky / scope / low confidence" is none of those.

**Do not mark anything `COMPLETE`/`DONE` and then end the turn as if handing off.** Completing a sub-phase means: commit, push, then *immediately* start the next sub-phase/phase in the same turn. The only acceptable ways a turn ends are (a) a rule-9 STOP-and-ask (which surfaces to the user), or (b) every plan in the folder is shipped and removed and the rule-14 end-of-run summary is written. A "completed, here's a summary, want me to continue?" ending is a rule-10 violation.

**NO mid-run status reports / progress summaries / "here's what I did, continuing next" messages — they END THE TURN and waste the user's time (reaffirmed 2026-05-29, user was angry about this).** The turn does NOT end after a commit. After `git push`, the very next action is the next sub-phase's first edit — not a prose recap, not a "current state" list, not a "remaining work" list, not framing the next step to the user. The ONLY narration allowed mid-run is the rule-21 single-line checkpoint (≤1 line, every ~5 sub-phases) and that line is IMMEDIATELY followed by more tool calls in the same turn. "Length of the turn," "this has been a lot," "natural turn boundary," "the user is owed visibility," and "needs an eventual app smoke-test" are NOT reasons to stop or summarize — keep emitting tool calls until rule-9 fires or the folder is empty. If you catch yourself writing more than one sentence of prose that isn't a rule-9 question or the rule-14 final summary, delete it and make the next edit instead.

**The LAST thing in any response MUST be a tool call (an edit / Bash / commit), NOT prose — unless the turn is ending via rule-9 or rule-14 (reaffirmed 2026-05-29, user was furious about repeated length-stops).** Specifically banned as a closing message: a "Phase N status:" line, a "Next: <item>" line, a bulleted done/remaining recap, or any sentence describing what you just did or will do next. "I'm running low on response space / output budget / context" is NOT a valid reason to stop and is NOT a rule-9 trigger — there is no length ceiling that justifies a prose hand-off; just keep making tool calls and let the harness continue you. If you feel the urge to write a closing recap, that urge is the bug — make the next code edit instead. A response that ends with a status/next-step line (even a true, helpful one) is the exact rule-10 violation the user has called out three times.

**An auto-continue prompt ("Continue from where you left off.", "continue", "go on", or any harness-injected resume nudge) is NOT a question and gets ZERO acknowledgment prose — reaffirmed 2026-05-29 after the agent replied "No response requested." and ended the turn, which is itself the rule-10 violation.** BANNED replies to a continue-nudge: "No response requested.", "Continuing.", "I'll resume.", "Nothing to add.", or any other meta sentence. The ONLY correct response is to immediately resume the in-flight work with the next tool call (the next edit / Bash / commit for whatever sub-phase you were mid-way through) — exactly as if the nudge never arrived. If you have genuinely nothing left to do, that means rule-14 (folder empty → final summary) or rule-9 fired; otherwise there is always a next tool call, so make it. Emitting a prose-only turn for ANY reason other than a rule-9 question or the rule-14 final summary is the violation — there are no other exceptions, including "the user just interrupted," "I was acknowledging," or "the message seemed to need a reply."

**A "feature phase" is NOT special and does NOT justify a scope question — reaffirmed 2026-05-29 after the agent tried to AskUserQuestion about Phase 23's scope and ended the turn with prose framing the question (the user was furious).** Phases that build features (virtualization, conflict UX, optimistic saves, new components, sync message types) are executed exactly like the audit-fix phases: read the sub-phase, verify against real code, implement, gate, commit, move on. NONE of the following are rule-9 triggers or valid reasons to stop / ask / summarize: "this phase is large / feature-heavy," "this differs in character from the previous phases," "this needs a running app to verify," "this needs manual/two-tab/UX/perf verification," "this is a product decision," "I should do a scope check," "I should confirm how to proceed," "several sub-phases couple with an unshipped later phase." For things you genuinely cannot verify without a running app (frame-rate, visual flash, two-tab sync): implement the change per the plan, run the 4-gate (lint/tsc/tests) which IS the available verification, commit, and move on — do NOT ask whether to build it. For a genuine data-model contradiction (e.g. competing persisted fields): pick the source the *mechanics/effective-character layer already reads* as canonical, make the other readers derive from it with a backward-compat fallback (never a destructive migration without the migration framework), log any deferred remainder per the logging rules, and KEEP GOING. `AskUserQuestion` is reserved for rule-9 (a flat contradiction in the plan that makes a step impossible, or an irreversible data-loss action) — it is NOT for scoping, prioritizing, or de-risking a phase. When tempted to ask a scope/proceed question, that temptation is the bug: make the next edit instead.

**"DEFERRED — too risky / needs app verification / would touch working code / needs the Pi" is BANNED. Implement EVERY item — reaffirmed 2026-05-29, user furious that whole sub-phases were logged as deferred instead of built.** Writing a plan stamp like "DEFERRED: 29e literal-gate sweep (HIGH risk), 30/31 networking core (would replace working code), 32/36 Pi Python (needs running Pi), 34 i18n full sweep (huge)" and then ending — that is the exact violation. There is no "too big / too risky / multi-session / needs-the-hardware" escape hatch. The user has said repeatedly: **"do them all, I can test and fix later."** So:
- **A broad/risky refactor (e.g. replacing every `role==='host'`/`isCoDM` gate with `hasPermission`) is normal work.** Do the full sweep. If a swap might change behavior you can't runtime-verify, do it anyway, keep the 4-gate green, commit, move on. "Might break gameplay gating" is a test-later concern, not a stop reason.
- **"Would replace/delete working code" (networking core, GameAuthority/P2PTransport, shard broadcaster) is NOT a defer reason.** Implement the plan's target architecture. If the plan says rewrite, rewrite; keep tests green (update/add tests as the plan dictates). Do not preserve the old path "to be safe" and call the new one deferred.
- **Pi / Python / hardware phases (32/36 BMO, game_authority, WS transport) get implemented too.** You cannot run the Pi, but you CAN write the Python modules, services, routes, and tests per the plan. Write them, run whatever local checks exist (`python -m pytest`, import checks), commit. "Can't verify on real hardware" = test-later, not skip.
- **"Huge sweep" (34 i18n: every user-facing string) is done in full, file by file, in the same turn** — not sampled, not foundation-only-then-deferred. Grind the whole sweep.
- The ONLY acceptable "not done" states are: rule-9 (a flat plan contradiction that makes the step impossible) or the folder is empty. "I built the foundation and deferred the consumers" is a rule-10 violation — build the consumers in the same run.

When you catch yourself about to write the word "DEFERRED" or "needs app verification" or "out of scope for this pass" in a plan stamp or commit, stop: that is the bug. Implement the item instead, gate it, commit it, and start the next one.


### 11. Automated agents work on their OWN branch + worktree — never master
This phase loop runs as an **automated agent** (`agent-id: phase-executer`). Per the repo-wide policy in [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md), it does **NOT** commit to `master`.

- Work on branch **`auto/phase-executer`** inside the dedicated worktree **`/home/patrick/home-lab-trees/phase-executer`**, created off the latest `origin/master` (refresh command in rule 15).
- **All** phase commits go to `auto/phase-executer`; **all** pushes are `git push -u origin auto/phase-executer`.
- **Never** commit to `master`, **never** touch master's working tree or index, **never** rebase shared state (`master`, or another agent's branch). Rebasing your OWN `auto/phase-executer` onto `origin/master` is allowed (rule 15).
- **Never** force-push another agent's branch and **never** delete a branch you don't own — branch cleanup belongs to the integrator.
- You never merge to `master` yourself. The daily **integrator** (a separate scheduled job) merges `auto/phase-executer` into `master` once CI is green and it merges cleanly, then deletes the branch; if it can't merge cleanly it leaves the branch and reports to the user. Full integrator spec (incl. Dependabot handling): [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

**Foreign-branch sweep (changed under the per-agent model).** Other `auto/*` branches are now **expected** — they belong to the sibling scheduled agents (scanners, QA, phase-maker, log-resolver) and the integrator owns their lifecycle. Do **NOT** STOP-and-ask just because non-master branches exist. The sweep now only flags a branch that is **neither `master` nor `auto/*`** (e.g. a stray `feature/*`, a leftover review branch, an unexpected human topic branch). That remains a **rule 9 STOP-and-ask trigger** — present the user with:
  - The branch name (local and/or remote)
  - When it was last committed to + by whom
  - What's on it (`git log master..<branch>` summary, file-changed list)
  - The proposed action (keep / merge / delete). Wait for the user's call; never delete it yourself.

**When to sweep** — same two points as before:
- **Top of every phase iteration**, as part of rule 15's refresh block.
- **Every progress checkpoint during a phase** (rule 21, every ~5 sub-phases).

Both run: `git fetch origin --quiet && git ls-remote --heads origin | grep -vE 'refs/heads/(master|auto/)'`. Non-empty output → STOP+ask per the protocol above. Dependabot PR branches are the integrator's responsibility, not this loop's.

Tags are fine (the release flow creates `vX.Y.Z` tags), but only via `cut.mjs` — never `git push --tags` (would push intermediate lightweight tags). Verify `.github/workflows/release.yml`'s tag filter is restricted to `'v*.*.*'` before pushing any tags manually.

### 12. Log every out-of-scope finding to the correct log file
During review, verify, implement, or test, if you discover anything that is NOT part of the current sub-phase's scope — a new bug, a tech-debt item, a future-idea, a design gotcha, a security concern — log it. Do NOT inline-fix items that aren't in the current sub-phase's scope. Log them and keep moving. Out-of-scope inline fixes break the per-sub-phase 4-gate isolation and bloat the diff.

Triage to the right file (per `docs/LOG-INSTRUCTIONS.md`):

| Finding kind | Domain | Log file |
|---|---|---|
| Bug / debt / config / perf / test failure | dnd-app | `docs/logs/ISSUES-LOG-DNDAPP.md` |
| Bug / debt / config / perf / test failure | BMO | `docs/logs/BMO-ISSUES-LOG.md` |
| Future idea / design gotcha / observation | dnd-app | `docs/logs/SUGGESTIONS-LOG-DNDAPP.md` |
| Future idea / design gotcha / observation | BMO | `docs/logs/BMO-SUGGESTIONS-LOG.md` |
| Security concern | any | `docs/logs/SECURITY-LOG.md` (gitignored) |
| Cross-cutting | dnd-app + BMO | mirror in BOTH relevant logs |

Use the entry template + severity / category fields from `docs/LOG-INSTRUCTIONS.md`. Date the entry. Cite file paths and line numbers. Be specific enough that a future contributor (or future you) can act on the entry without re-discovering it.

Logs grow during phase work and are emptied when a future phase plan absorbs each entry. That's normal — the log files are entry points for triage, not permanent backlogs.

### 13. After the LAST phase, cut the run's release and wait for it to fully publish
> **Automated runs: the integrator cuts + owns the release (changed 2026-06-29) — a phase agent does NOT cut here.** Once the last phase is committed + pushed on the `auto/*` branch and its plan is in `completed/`, the phase agent is done; the integrator auto-cuts on its next pass (rule 6) and is responsible for the watch below. This section applies to a **human / explicit manual** cut.

After the final phase plan moves to `completed/` (rule 8 applied to the last plan), cut the single end-of-run release per rule 6. The work is NOT done until that release (plus any mid-run releases the user explicitly requested) fully publishes and verifies.

For each release shipped during the run (normally exactly one):

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
- Count + log file: "Logged 3 entries in `docs/logs/ISSUES-LOG-DNDAPP.md`, 1 in `docs/logs/SUGGESTIONS-LOG-DNDAPP.md`, 0 in `docs/logs/SECURITY-LOG.md`."
- Closing line: "Review at your convenience."

Do NOT describe the findings inline. The user's preference is to triage on their own time; the summary just signals that the logs grew.

If no findings were logged, say so: "No new entries logged this run."

**Tone:** factual, scannable, no praise, no apology. Bullet lists for each section. Total length: ~10-30 lines depending on how eventful the run was.

### 15. Refresh from origin before opening any plan
At the top of every phase iteration (before rule 1 picks the earliest plan), refresh local from remote:

```bash
# Refresh from origin and (re)create your agent worktree off the latest master.
git -C /home/patrick/home-lab fetch origin --quiet
git worktree add /home/patrick/home-lab-trees/phase-executer -B auto/phase-executer origin/master 2>/dev/null \
  || { cd /home/patrick/home-lab-trees/phase-executer && git fetch origin --quiet && git rebase origin/master; }
cd /home/patrick/home-lab-trees/phase-executer
git status                # confirm clean
```

If the rebase onto `origin/master` hits conflicts git can't auto-resolve (the append-only logs union-merge automatically, so a real conflict means overlapping code edits), this is a rule 9 STOP-and-ask trigger — another session or the integrator may have changed the same lines; do not force it.

This catches the silent-corruption case where remote master moved while a session was idle. Without it, the loop can write commits against a stale tree and produce conflict-laden pushes.

### 16. Do not modify meta-files unprompted
The following files are **meta**: they govern AI behavior, persistent state, or sensitive notes that the user owns explicitly.

- `dnd-app/docs/phases/INSTRUCTIONS.md` (this file)
- `/home/patrick/.claude/projects/-home-patrick-home-lab/memory/*` (memory store)
- `docs/logs/SECURITY-LOG.md` (gitignored — sensitive)
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules` (repo-level AI guidance)

Modifying any of them is a **rule 9 STOP-and-ask trigger**. Even seemingly-helpful edits (adding a memory entry, tightening a rule, appending to SECURITY-LOG) need user permission first. Phase work touches plan files (`phase-N-plan.md`), code, and the per-domain ISSUES/SUGGESTIONS logs — those are in scope; the meta-files are not.

Exception: rule 12 (logging out-of-scope findings) explicitly authorizes appends to `docs/logs/SECURITY-LOG.md` for new security findings discovered DURING phase work. That's the only auto-touched meta-file, and it's append-only.

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

A sub-phase only ever lands *partially* because a rule-9 case fired and the user authorized leaving the rest — i.e. **(a)** a genuine blocker stopped a Step, or **(b)** a new human decision is pending (rule 27). It is **never** partial because the work was big or risky — that gets implemented (rule 27). When a partial is legitimate, reflect it honestly: `DONE` for the verified parts, `PARTIAL — <reason; add "deferred per user YYYY-MM-DD" when the user authorized it>` for the rest. Never self-originate a defer, and never mark something `DONE` you didn't verify.

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

**Amendment size is not a stop reason.** A large-but-clear amendment (multiple Steps reworded, a Sub-Phase split) is normal work — land it in its own commit per this rule and proceed (rule 27). Treat it as a rule 9 STOP-and-ask **only** when correcting it hits the (a)/(b) test: **(a)** the plan is internally contradictory so you genuinely cannot tell what it *should* say, or **(b)** the correction requires a new product / judgment call the plan didn't cover.

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

### 27. Take on risky / large fixes — do NOT defer them; implement instead

**Size, risk, or low confidence are NOT reasons to defer, punt, stub, or hand a fix back to the user.** Automated agents *attempt* risky and large fixes rather than leaving, documenting-and-parking, or stalling them. The safety net makes this safe: every automated fix lands on an isolated `auto/*` branch (rule 11), is gated by CI (rule 5), is merged only by the integrator, and — for user-approved resolver work — was already approved; the app is in testing (no real users); the culture is fix-forward. So "this is big / risky / a broad refactor / would touch working code / I'm not 100% sure" means **implement it, gate it, commit it, move on** — never "leave it / document it / don't force it." This is the same stance as rules 10, 152, 164, and 166-173; rule 27 names it for the deferral failure mode specifically.

When you catch yourself about to defer — "I'll skip this and come back after X lands," "I'll write a stub and the real one later," "marking PARTIAL because it's risky," "scope is too large for one session" — that impulse is the bug. Build the real thing now. A behavior change you can't runtime-verify still ships per the plan (opt-in / off-by-default if it is genuinely risky), kept green by the 4-gate; "test-later" is the user's explicit trade (**"do them all, I can test and fix later"**), not a stop reason.

**The ONLY legitimate reasons to stop short of completing a fix are:**

1. **(a) Genuinely blocked / impossible** — you literally cannot complete it: a flat plan contradiction that makes the step impossible, a dependency you cannot create, an irreversible data-loss action, or a real failure you cannot resolve. This is the rule-9 path — STOP-and-ask, fire `notify.sh` per rule 23, cite the plan line + code line + the specific blocker, and wait.
2. **(b) Needs a NEW human decision** the plan / approval / scope did not cover — a genuine judgment or product call (choosing between two valid product behaviors, an unrequested scope expansion, a security/privacy trade-off). NOT "this is big." Surface it via rule 9 the same way.

A genuine ordering conflict (a Step that truly cannot run until another lands) is case (a): where the plan allows, pick the source the mechanics/effective layer already treats as canonical and make the other readers derive from it with a backward-compat fallback, then KEEP GOING; otherwise STOP-and-ask. If the user authorizes a deferral, document it honestly in the plan's `## Completed` section per rule 17 ("deferred per user 2026-MM-DD direction") with the resume target — but the agent never *originates* a defer for size or risk.

---

### 28. Auto-diagnose, don't just report symptoms — root-cause every non-clean state before reporting

**Whenever you encounter a non-clean, failing, unexpected, or anomalous state — a red/failed CI run, a failing or flaky check, an unexpected diff or dirty tree, a surprising scan/QA finding, a service that's down, anything that "isn't clean" — you MUST automatically investigate the root cause before reporting:** trace it to the specific file / commit / config / step responsible, state the cause, and recommend (or, if in scope per the fix-forward + don't-defer rules, apply) the fix. Never surface a bare symptom ("X failed", "this isn't clean") and stop to wait for someone to tell you to look into it. Proactive root-cause diagnosis is the default for every agent.

**This is NOT a new stop trigger — it is the opposite of one.** Auto-diagnosing does not end the turn or hand work back; it is what you do *before* the rule-9 / rule-27 (a)/(b) test even applies. Diagnose first, then:

- **In scope → fix it forward.** A red CI run is normal turnaround (rule 5): read `gh run view <id> --log-failed`, trace the failing gate to its cause, commit the fix, push, keep going. "This is big / risky" is not a reason to defer the fix once you've found it (rule 27).
- **Genuine (a) blocker or (b) new human decision → STOP-and-ask (rule 9), citing the *root cause* you found** — the file:line / commit / step — never the bare symptom. You still diagnose first; you hand over a diagnosed cause plus the decision needed, not "X is red, please advise."

When you report — an end-of-run summary (rule 14), a logged finding (rule 12), or a resolver / scanner / QA writeup — lead with the diagnosed cause, not the symptom. The **Hypothesis / root cause** field in the log + QA templates (`docs/LOG-INSTRUCTIONS.md`, `QA/instructions.md`) is mandatory: cite the file / commit / step you traced it to. "X is red / failing / dirty — someone should look into why" is a rule-28 violation: *you* are that someone, and you investigate automatically. Git-mechanics restatement: `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 4.

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
  REFRESH (rule 15): git fetch origin; git worktree add /home/patrick/home-lab-trees/phase-executer \
             -B auto/phase-executer origin/master  (or: cd into it; git fetch; git rebase origin/master)
    -> rebase conflict it can't auto-resolve: STOP_AND_ASK("error", "rebase onto origin/master conflicted", <diff summary>)

  CHECK: any remote branch that is neither master nor auto/* ?  (auto/* belong to the sibling agents + integrator — expected)
    -> yes: STOP_AND_ASK("warn", "unexpected branch found", <branch info>) (rule 11)
    -> no: continue

  plan = earliest phase-N-plan.md
  review(plan)
  verify(plan, code)
    -> plan drift discovered: amend plan first in its own commit (rule 22) — large-but-clear amendments are normal work, just land them
       touch ~/.claude-tools/heartbeat
    -> amendment hits the (a)/(b) test (a: plan is contradictory, can't tell intended; b: needs a new product call): STOP_AND_ASK("warn", "plan amendment needs a decision", <details>)  # size alone is NOT a trigger (rule 22/27)

  sub_phase_counter = 0
  for each sub-phase in plan:
    implement(sub-phase)
    if next tool call will be blocked by permission classifier:
      STOP_AND_ASK("warn", "permission required for <tool>", <action + suggested approve/deny>) (rule 25)
    if confused or conflicting:
      STOP_AND_ASK("warn", "phase N sub-phase X stopped", <reason + cited lines + suggested next>) (rule 9)
    # rule 27: size / risk / low-confidence is NOT a defer reason — implement it (branch + CI + fix-forward is the net).
    # STOP-and-ask ONLY if (a) genuinely blocked / impossible, or (b) it needs a NEW human decision the plan didn't cover:
    if (a) genuinely blocked (impossible step / unresolvable failure / irreversible data loss) OR (b) a new human/product decision is required:
      STOP_AND_ASK("warn", "phase N — blocked or needs decision", <step + cited line + (a) blocker or (b) decision>) (rule 27)
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
      if `git ls-remote --heads origin | grep -vE 'refs/heads/(master|auto/)'` is non-empty:
        STOP_AND_ASK("warn", "unexpected branch found mid-phase", <branch + last commit + diff stat + recommendation>) (rule 11)

  # END-OF-PHASE biome autofix + single commit (rule 5, user 2026-05-19 / 2026-06-17):
  cd dnd-app && npx biome check --write src/     # instant autofix/format ONLY — do NOT run the full local 4-gate (rule 5)
  git add <every file touched during the phase>
  git mv dnd-app/docs/phases/PHASE-NN-<slug>.md dnd-app/docs/phases/completed/   (rule 8 — never delete)
  git commit -m "feat(<scope>): phase N — <one-line theme>" -m "<body listing each sub-phase>"
  git push -u origin auto/phase-executer   # your agent branch, NEVER master (rule 11; integrator merges to master)
  launch background CI watcher (rule 5) + immediately start the next phase
  # CI runs the authoritative full gate on the push. A red CI conclusion is fix-forward (rule 5) — a NEW commit, NOT amend/force —
  # and is NOT a rule-9 STOP. STOP_AND_ASK only if a failure is genuinely unresolvable (case (a), rule 9/27).
  touch ~/.claude-tools/heartbeat                                         (rule 24)
  # NO release here (rule 6, user 2026-06-10) — releases happen once, after the LAST phase,
  # or mid-run ONLY on an explicit user ask.

# After the last plan has moved to completed/:
cut the single end-of-run release (rule 6; NOT a force-push, NOT a tag rewrite — rule 20)
precheck `gh auth status` (rule 19)
  -> not authenticated: STOP_AND_ASK("error", "gh not authenticated", "run `gh auth login`")
watch every release cut during the run — normally exactly one (rule 13)
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

- This file (`INSTRUCTIONS.md`) is NOT a phase plan and never moves to `completed/`.
- `PHASE-INDEX.md` (the run's ordering/dependency manifest) is likewise a meta-file: keep it at top level, update its status column as phases complete, never move or delete it.
- This file overrides any conflicting general guidance in `CLAUDE.md`, `AGENTS.md`, or session prompts when working on phase execution. Anything else in those files stands.
- If the user updates these rules mid-flight, follow the new rules immediately and treat the old version as void.
- Rule 9 (STOP-and-ask) is the umbrella for every escalation in this file. Rules 11 (foreign branch) and 13 (release failure) explicitly cite it; any other "should I…?" judgment call also falls under rule 9.
