# Phase Execution Instructions — dungeon-scholar

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


> How to work through the phase plans in **this** directory (`dungeon-scholar/docs/phases/`). Read this before starting any phase work.

> **Scope — dungeon-scholar.** This file is the **self-contained, authoritative implement → verify → commit → release loop for the dungeon-scholar–scoped phase-executer** (`agent-id: ds-phase-executer`). It is the dungeon-scholar analogue of the repo-wide process doc at [`../../../dnd-app/docs/phases/INSTRUCTIONS.md`](../../../dnd-app/docs/phases/INSTRUCTIONS.md): the rules, the STOP-and-ask test, the fix-forward stance, and the branch/worktree model are identical across domains — **only the concrete build/test/release commands differ**, and the domain-specific ones are spelled out here so an executer reading **only this file** knows how to implement, verify, and release within dungeon-scholar. Git mechanics (per-agent branch + worktree + the daily integrator) are the repo-wide [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md); that file governs how agents reach `master`, this one governs how they execute and verify the work.

> **STATUS:** the top level of `dungeon-scholar/docs/phases/` holds the **active backlog** of `PHASE-NN-<slug>.md` plans, ordered by [`PHASE-INDEX.md`](./PHASE-INDEX.md) (the dependency manifest). Completed plans move permanently to `completed/` (rule 8) — they are **never deleted**.

---

## Domain facts every ds-phase-executer must know

**App:** `dungeon-scholar/` — a client-side **React 19 + Vite** SPA (Tailwind, Vitest, `vite-plugin-pwa`), hash-routed, deployed to **GitHub Pages**. Optional backends: **Supabase** (cloud sync) and the **Oracle Cloudflare Worker** (`dungeon-scholar-oracle.gknotts.workers.dev`, AI grading/chat) — both degrade to a `localStorage` + local-grading fallback when unset.

**Build / test / lint (run from `dungeon-scholar/`):**

| Action | Command | Notes |
|---|---|---|
| Install | `npm ci` | uses `dungeon-scholar/package-lock.json` + `.nvmrc` |
| **Test** | `npm run test` | `vitest run` (the full suite) |
| Single test (cheap, targeted) | `npx vitest run src/path/to/that.test.jsx` | use during sub-phase work |
| **Build** | `npm run build` | `vite build`; **must pass `VITE_BASE=/home-lab/`** (the monorepo Pages base). Optional: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ORACLE_ENDPOINT` |
| Lint / format | `npm run lint` / `npm run lint:fix` | Biome (`@biomejs/biome@2.4.16 check src`) |
| Security audit | `npm run audit:ci` | `npm audit --omit=dev --audit-level=moderate` |

**CI (authoritative gate):**
- `.github/workflows/dungeon-scholar-ci.yml` — triggers on **every push** (and PR) touching `dungeon-scholar/**`. Runs `npm ci → npm run test → npm run build` (`VITE_BASE=/home-lab/`). This is the gate your `auto/ds-phase-executer` push runs through.
- `.github/workflows/dungeon-scholar-deploy.yml` — **"Deploy Dungeon Scholar to GitHub Pages."** Triggers on push to `main`/`master` touching `dungeon-scholar/**`: builds with the production secrets + `VITE_BASE=/home-lab/` and publishes to GitHub Pages.

**Release mechanics — there is no version-tag/installer release for dungeon-scholar.** Unlike dnd-app (electron `cut.mjs` / `vX.Y.Z` tags / 6 assets / `release.yml`), dungeon-scholar **"releases" by deploying**: when the daily **integrator** merges a clean, CI-green `auto/ds-phase-executer` into `master`, `dungeon-scholar-deploy.yml` rebuilds and republishes the live GitHub-Pages site automatically. So the executer's job ends at **commit + push of the agent branch**; there is **no `cut.mjs`, no tag, no manual release step, and no "after the last phase, cut a release" action.** Live URL: `https://evilpatrick06.github.io/home-lab/#/home`.

**Logs (per `docs/LOG-INSTRUCTIONS.md`):** out-of-scope findings go to `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (bug/debt/config/perf) or `docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` (future-idea/observation); resolved entries move to `docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`. Durable design gotchas → `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md` (not the suggestions log).

---

## The loop (the rules)

### 1. Start with the earliest phase plan in this folder
Find the lowest-numbered `PHASE-NN-<slug>.md` at the top level of `dungeon-scholar/docs/phases/` (NOT in `completed/`). That's the current phase. Consult [`PHASE-INDEX.md`](./PHASE-INDEX.md) for the dependency map. Do not skip ahead; do not work a later phase while an earlier one is unfinished.

### 2. Review
Read the full plan top to bottom before touching code: **Context**, **Depends on / blocks**, **Files touched**, **Sub-phase summary**, **Sub-phase details + acceptance**, **Constraints & edge cases**, **Completed**.

### 3. Verify against real code
Open the cited files and confirm the described pre-state matches reality. If the codebase drifted (file moved, lines shifted, function renamed), **amend the plan inline first, in its own commit** (`docs(phase-N): correct ... — file moved`), then implement against the corrected plan. Don't implement against stale assumptions. A large-but-clear amendment is normal work; it is only a STOP (rule 9) if the plan is internally contradictory or the correction needs a new product decision.

### 4. Implement
Work the sub-phases in order. Follow the Steps exactly, touch only the listed Files, honor the Constraints, don't expand scope mid-sub-phase.

### 5. CI is the authoritative gate — push and keep moving; cheap checks only locally
**During sub-phase work**, run only **cheap, targeted** checks: a single affected test (`npx vitest run src/.../that.test.jsx`) and, where useful, a quick `npm run lint` on the changed files. **Do NOT run the full `npm run test` + `npm run build` sweep locally at phase end** — that is what CI (`dungeon-scholar-ci.yml`) is for. At phase end, run `npm run lint:fix` (instant Biome autofix) only, then commit + push, then **immediately start the next phase**.

**Watch + fix-forward (NOT STOP-and-ask).** On each push, watch CI (`gh run list --branch auto/ds-phase-executer`). When a run concludes `failure`: read `gh run view <id> --log-failed`, trace the failing step (test or build) to its cause, fix it forward (a **new** commit — never amend/force-push a pushed branch), push, continue. A red CI run is normal turnaround, not a rule-9 STOP. **Never sleep/park on a timer to wait for CI** — between pushes you are always doing the next phase's real work.

**Commit cadence:** sub-phase work accumulates in the worktree; commit + push **ONCE per phase** (not per sub-phase). After the last sub-phase + `npm run lint:fix`:
1. Single `git add` of every file touched during the phase.
2. `git mv dungeon-scholar/docs/phases/PHASE-NN-<slug>.md dungeon-scholar/docs/phases/completed/` (rule 8).
3. Single commit: `feat(ds): phase N — <one-line theme>` (body lists each sub-phase). **No "Claude"/"AI" in commit messages.**
4. `git push -u origin auto/ds-phase-executer` (your agent branch — **NEVER `master`**) + launch the CI watcher + start the next phase.

### 6. Release = the integrator's merge → Pages auto-deploy (no manual step)
There is **no** per-phase release and **no** end-of-run `cut.mjs`/tag for dungeon-scholar. The executer never cuts a release. When the integrator merges your green branch to `master`, `dungeon-scholar-deploy.yml` redeploys the live site. If you ever need to confirm a deploy, watch `gh run list --workflow=dungeon-scholar-deploy.yml` — but that is the integrator's/owner's concern, not a step the executer performs.

### 7. Repeat on the next phase
After the phase commit is pushed and the plan moved to `completed/` (rule 8), return to rule 1 and pick the next earliest plan.

### 8. Move finished plans to `completed/` — never delete
`git mv` the plan into `completed/` as part of the phase commit. Plan files are **never deleted**. `dungeon-scholar/docs/phases/completed/` is the permanent record; the shrinking top-level folder is the visible backlog.

### 9. STOP-and-ask ONLY for (a) a genuine blocker or (b) a new human decision — never for size/risk/scope
This is the single escalation test. Stop and ask the user **only** when:
- **(a) Genuinely blocked / impossible** — a flat plan contradiction that makes a step impossible, a described pre-state that contradicts the code with no determinable intent, a dependency you cannot create, an unresolvable test failure, an irreversible/data-loss action the plan didn't authorize.
- **(b) Needs a NEW human decision** the plan/scope didn't cover — a real product/judgment call (two valid product behaviors, an unrequested scope expansion, a security/privacy trade-off).

**NOT triggers — handle them and keep going:** size, risk, breadth, low confidence; an ambiguous-but-resolvable constraint (pick the reasonable reading, note it in `## Completed`); plan drift you can correct; a failing test/red gate you can fix (fix forward); a separate out-of-scope finding (log it per rule 12, don't inline-fix). When (a)/(b) genuinely holds: fire `~/.claude-tools/notify.sh "<warn|error>" "<subject>" "<body>"` (rule 23) citing the plan line + code line + the blocker/decision, then wait.

### 10. Don't stop unless rule 9 fires or the user says stop
Keep going: sub-phase done → next sub-phase; last sub-phase → commit → push → next phase. **No mid-run status reports / progress summaries / "here's what I did" prose** — those end the turn. The **last thing in any response must be a tool call**, not a recap, unless the turn is ending via rule 9 (blocker) or rule 14 (folder empty). An auto-continue nudge gets zero acknowledgment prose — just resume with the next tool call. "DEFERRED / too risky / needs app verification / out of scope for this pass" is banned — implement every item (rule 27); a runtime-unverifiable change still ships per the plan (opt-in / off-by-default if genuinely risky), kept green by CI.

### 11. Work on your OWN branch + worktree — never master
`agent-id: ds-phase-executer`, branch **`auto/ds-phase-executer`**, worktree **`/home/patrick/home-lab-trees/ds-phase-executer`** (off latest `origin/master`). All commits/pushes go to that branch. Never commit to `master`, never touch master's working tree/index, never rebase shared state (rebasing your **own** branch onto `origin/master` is fine), never force-push or delete a branch you don't own. The daily integrator merges your green branch to `master` and deletes it. Other `auto/*` branches are expected (sibling agents); only a branch that is **neither `master` nor `auto/*`** is a rule-9 STOP-and-ask.

### 12. Log every out-of-scope finding to the correct file
If during review/verify/implement you discover something outside the current sub-phase's scope, **log it — don't inline-fix it.** dungeon-scholar bug/debt/config/perf → `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md`; future-idea/observation → `docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`; durable design gotcha → `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`; security → `docs/logs/SECURITY-LOG.md` (gitignored). Use the entry template + severity/category fields from `docs/LOG-INSTRUCTIONS.md`; ISO-date it; cite file:line.

### 13–14. End of run
There is no release to watch (rule 6). When the top level of `dungeon-scholar/docs/phases/` holds no more `PHASE-NN-*.md` plans, write the end-of-run summary: (1) phases completed (count + list), (2) problems & friction with suggested follow-ups, (3) logged-finding count per file (no inline content). Factual, scannable, no praise.

### 15. Refresh from origin before opening any plan
At the top of every phase iteration:
```bash
git -C /home/patrick/home-lab fetch origin --quiet
git worktree add /home/patrick/home-lab-trees/ds-phase-executer -B auto/ds-phase-executer origin/master 2>/dev/null \
  || { cd /home/patrick/home-lab-trees/ds-phase-executer && git fetch origin --quiet && git rebase origin/master; }
cd /home/patrick/home-lab-trees/ds-phase-executer && git status
```
A rebase conflict git can't auto-resolve is a rule-9 STOP-and-ask.

### 16. Do not modify meta-files unprompted
Meta-files (rule-9 STOP to touch): this `INSTRUCTIONS.md`, [`PHASE-INDEX.md`](./PHASE-INDEX.md), the repo-level `CLAUDE.md`/`AGENTS.md`, `docs/logs/SECURITY-LOG.md` (the one append-exception is logging a new security finding per rule 12), and the memory store. Phase work touches plan files, code, and the per-domain ISSUES/SUGGESTIONS logs — those are in scope.

### 17. Update the plan's `## Completed` after every sub-phase
4-gate green isn't enough: after each sub-phase, add a precise `file:line` citation + one-line summary to the plan's `## Completed` section (working tree only — committed with the phase commit, no separate commit). A sub-phase only lands *partially* when a genuine rule-9 case fired and the user authorized leaving the rest — never because the work was big/risky.

### 18. ISO-date every stamp
Use `date -u +%Y-%m-%d` for every date written (log entries, `Completed` lines, commit dates, summaries). Never hardcode or carry over a stale date.

### 19. `gh` auth, notify, heartbeat
Before relying on `gh`, run `gh auth status` (not authenticated → rule-9 STOP). Fire `~/.claude-tools/notify.sh` on every STOP-and-ask (rule 23); maintain the `~/.claude-tools/session-active` + `heartbeat` files for the watchdog (touch at session start, after each commit, at each checkpoint; remove `session-active` at clean end). If the `~/.claude-tools/*` scripts don't exist, log a warning and proceed.

### 20. Never amend/force-push shared state
Fix forward with new commits. Never `git push --force` a branch the integrator may have picked up; never rewrite a merged branch.

### 21. Progress checkpoints
For phases with many sub-phases, emit a single-line checkpoint every ~5 sub-phases (then keep going — don't pause), and run the rule-11 foreign-branch sweep (`git ls-remote --heads origin | grep -vE 'refs/heads/(master|auto/)'` → non-empty = STOP-and-ask).

### 27. Take on risky / large fixes — implement, don't defer
Size, risk, or low confidence are **not** reasons to defer, stub, or hand back. The `auto/*` branch + CI + fix-forward + integrator is the safety net; the app is in testing (no real users). Implement the real thing now; ship a genuinely risky behavior change opt-in / off-by-default and keep going. The only legitimate stops are (a) genuinely blocked / impossible or (b) a new human decision — the same test as rule 9.

### 28. Auto-diagnose, don't just report symptoms
On any non-clean state (red CI, failing/flaky test, unexpected diff, surprising finding), **investigate the root cause before reporting**: trace it to the file/commit/config/step, state the cause, then fix it forward (in scope) or STOP-and-ask citing the *root cause* (genuine (a)/(b)). Never surface a bare "X failed" and wait.

---

## Quick reference — the loop

```
while PHASE-NN-*.md plans remain at top level of dungeon-scholar/docs/phases/:
  refresh (rule 15): fetch; worktree add -B auto/ds-phase-executer origin/master  (or rebase your branch)
  foreign-branch sweep (rule 11): any origin branch not master/auto/* -> STOP-and-ask
  plan = earliest PHASE-NN; review (rule 2); verify vs code (rule 3, amend-first if drifted)
  for each sub-phase:
    implement (rule 4); cheap check only: npx vitest run <one file> (rule 5)
    out-of-scope finding -> log it (rule 12), don't inline-fix
    update plan ## Completed (rule 17); (a)/(b) blocker -> STOP-and-ask (rule 9/27)
  cd dungeon-scholar && npm run lint:fix          # autofix only — NOT the full test/build sweep
  git add <touched files>; git mv PHASE-NN -> completed/ (rule 8)
  git commit -m "feat(ds): phase N — <theme>"     # no Claude/AI in the message
  git push -u origin auto/ds-phase-executer        # NEVER master (rule 11)
  watch CI (dungeon-scholar-ci.yml); red -> fix-forward new commit (rule 5/28); keep going
  # NO release step — integrator's merge to master auto-deploys via dungeon-scholar-deploy.yml (rule 6)
folder empty -> end-of-run summary (rule 14)
```

---

## Notes
- This file is NOT a phase plan and never moves to `completed/`.
- [`PHASE-INDEX.md`](./PHASE-INDEX.md) is a meta-file: keep it at top level, update its Status column as phases complete, never move/delete it.
- Keep [`PHASE-INDEX.md`](./PHASE-INDEX.md) a lean dependency-manifest table. Per-run provenance prose (the `Source (NN)` blocks — which QA report a plan came from, what was folded vs. re-authored) goes in the sibling [`PHASE-PROVENANCE.md`](./PHASE-PROVENANCE.md), **not** in the index. Before authoring a plan from a QA report, check the index table for an existing plan consolidated from that same report to avoid duplicate-number races.
- This file is authoritative for dungeon-scholar phase execution; the repo-wide [`../../../dnd-app/docs/phases/INSTRUCTIONS.md`](../../../dnd-app/docs/phases/INSTRUCTIONS.md) and [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md) are the canonical cross-domain sources if anything here is silent — but the **dungeon-scholar build/test/release commands above override** any dnd-app-specific mechanics (cut.mjs, electron, tags) that do not apply here.
