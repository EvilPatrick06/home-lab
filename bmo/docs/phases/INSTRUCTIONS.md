# Phase Execution Instructions — bmo

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


> How to work through the phase plans in **this** directory (`bmo/docs/phases/`). Read this before starting any phase work.

> **Scope — bmo.** This file is the **self-contained, authoritative implement → verify → commit → release loop for the bmo-scoped phase-executer** (`agent-id: bmo-phase-executer`). It is the bmo analogue of the repo-wide process doc at [`../../../dnd-app/docs/phases/INSTRUCTIONS.md`](../../../dnd-app/docs/phases/INSTRUCTIONS.md): the rules, the STOP-and-ask test, the fix-forward stance, and the branch/worktree model are identical across domains — **only the concrete build/test/release commands differ**, and the bmo-specific ones are spelled out here so an executer reading **only this file** knows how to implement, verify, and release within bmo. Git mechanics (per-agent branch + worktree + the daily integrator) are the repo-wide [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

> **Scope boundary:** the **AI DM engine is `dnd-app`, not `bmo`.** bmo phases cover bmo's own surface — the Pi Flask app (`bmo/pi/`), the dashboard, the services, the bots' *infrastructure*, deploy. A bmo phase that touches Discord-DM *plumbing* (session control endpoints, narration relay transport) is bmo's; the DM *brain/quality* is dnd-app's. When in doubt, the test/CI that gates it tells you the domain.

> **STATUS:** the top level of `bmo/docs/phases/` holds the **active backlog** of `PHASE-NN-<slug>.md` plans, ordered by [`PHASE-INDEX.md`](./PHASE-INDEX.md). Completed plans move permanently to `completed/` (rule 8) — **never deleted**.

---

## Domain facts every bmo-phase-executer must know

**App:** `bmo/pi/` — a **Python / Flask** app (Alpine.js + Tailwind dashboard, socket.io realtime, xterm web IDE) running on a Raspberry Pi as **systemd user services**, listening on **`:5000`**. Hardware integrations: camera/vision, mic/speaker, LEDs, OLED face. Optional cloud surface via a Cloudflare tunnel (`bmo.mybmoai.work`) behind Cloudflare Access. Also hosts the dnd-app **web build** under `/DungeonTableOnline/` (that build is dnd-app's; bmo just serves it).

**Build / test / lint (run from `bmo/pi/` unless noted):**

| Action | Command | Notes |
|---|---|---|
| Python deps | `pip install -r requirements.txt` (+ `requirements-test.txt` for tests) | a venv lives at `bmo/pi/venv` |
| **Test** | `python -m pytest` | the full pytest suite (config in `bmo/pi/pytest.ini` / `.coveragerc`) |
| Single test (cheap, targeted) | `python -m pytest tests/test_<x>.py -q` | use during sub-phase work |
| Lint / style | `ruff check` (config in `bmo/pi/.ruff_cache`/repo) | plus the repo's `no-new-prints` guard (`bmo-no-new-prints.yml`) — don't add bare `print()`s |
| Frontend (dashboard CSS) | Tailwind via `bmo/pi/tailwind.config.js` | static assets under `bmo/pi/web/static`; the app cache-busts by file mtime |
| Docker build (CI-mirrored) | per `bmo/docker/` | gated by `bmo-docker-build.yml` |

**CI (authoritative gate):**
- `.github/workflows/bmo-pi-pytest.yml` — runs the bmo pytest suite on push/PR touching `bmo/pi/**`. This is the gate your `auto/bmo-phase-executer` push runs through.
- `.github/workflows/bmo-no-new-prints.yml` — fails if new bare `print()` statements are added (use the logger).
- `.github/workflows/bmo-docker-build.yml` — builds the bmo Docker image (push to master + PR).
- `.github/workflows/codeql.yml`, `security-audit.yml` — cross-cutting security gates.

**Release / deploy mechanics — bmo deploys via a Pi-side script, not a version-tag release.** There is **no** electron `cut.mjs` / `vX.Y.Z` tag / GitHub-release flow (that's dnd-app). bmo "releases" by **deploying to the Pi**:
- `bmo/pi/scripts/deploy.sh` (driven by `.github/workflows/bmo-deploy.yml`) — a **flock-locked** (`/tmp/bmo-deploy.lock`), 13-gate deploy that runs **on the Pi**: repo-root + clean-tree + `branch=master` checks → resolve/ancestor-validate the target SHA (idempotent "already deployed") → **ff-only merge** → conditional `pip install` → `compileall` → **canary on :5002 `/health`** → **selective systemd restart** (only the services whose paths changed: bots/fan/bmo) → **:5000 health gate** → automatic **rollback** (reset to the old SHA + reinstall + restart + re-poll) on failure. A `--dry-run` flag makes it fully side-effect-free.
- **The bmo-phase-executer does NOT run `deploy.sh` itself.** Deploys mutate the live Pi (restart services) and are the integrator's / owner's action after the green branch is merged to `master`. The executer's job ends at **commit + push of `auto/bmo-phase-executer`** (CI green). If a phase changes deploy mechanics, edit `deploy.sh` / the workflow as the plan directs and let the gate cover it — but never trigger a live deploy/restart from inside phase execution (that's a rule-6/rule-9 boundary; see "Never mutate the live Pi" below).

**Never mutate the live Pi during phase execution.** No `systemctl restart`, no `deploy.sh` run (except `--dry-run` for a test), no editing `pi/.env`, no touching live service data. Write code + tests; let CI (and the owner-run deploy) handle the rest. A change you can't runtime-verify without a live restart still ships per the plan, kept green by pytest (rule 27).

**Logs (per `docs/LOG-INSTRUCTIONS.md`):** out-of-scope findings → `docs/logs/BMO-ISSUES-LOG.md` (bug/debt/config/perf) or `docs/logs/BMO-SUGGESTIONS-LOG.md` (future-idea/observation); resolved → `docs/logs/BMO-RESOLVED-ISSUES.md`. Durable design gotchas → `bmo/docs/DESIGN-CONSTRAINTS.md`. These logs union-merge (`.gitattributes`).

---

## The loop (the rules)

### 1. Start with the earliest phase plan in this folder
Lowest-numbered `PHASE-NN-<slug>.md` at the top level of `bmo/docs/phases/` (NOT in `completed/`). Consult [`PHASE-INDEX.md`](./PHASE-INDEX.md). Don't skip ahead.

### 2. Review
Read the full plan: Context, Depends on / blocks, Files touched, Sub-phase summary, Sub-phase details + acceptance, Constraints & edge cases, Completed.

### 3. Verify against real code
Open the cited files, confirm the pre-state matches. If drifted, **amend the plan inline first in its own commit** (`docs(phase-N): correct ...`), then implement. A large-but-clear amendment is normal work; only a contradiction / new-decision is a STOP (rule 9).

### 4. Implement
Sub-phases in order; follow Steps exactly, touch only listed Files, honor Constraints, don't expand scope mid-sub-phase.

### 5. CI is the authoritative gate — push and keep moving; cheap checks only locally
**During sub-phase work**, only cheap targeted checks: the single affected pytest file (`python -m pytest tests/test_<x>.py -q`) and `ruff check` on the changed files. **Do NOT run the full `python -m pytest` sweep locally at phase end** — that's what `bmo-pi-pytest.yml` is for. At phase end, run `ruff check --fix` (or the repo's format step) on the touched files only, then commit + push, then **immediately start the next phase**.

**Watch + fix-forward (NOT STOP-and-ask).** On each push, watch CI (`gh run list --branch auto/bmo-phase-executer`). A `failure` conclusion → `gh run view <id> --log-failed`, trace the failing gate (pytest / no-new-prints / docker / codeql) to its cause, fix forward with a **new** commit (never amend/force-push a pushed branch), push, continue. Red CI is normal turnaround, not a rule-9 STOP. **Never sleep/park to wait for CI.**

**Commit cadence:** accumulate sub-phase work; commit + push **ONCE per phase**. After the last sub-phase + lint-fix:
1. Single `git add` of every file touched.
2. `git mv bmo/docs/phases/PHASE-NN-<slug>.md bmo/docs/phases/completed/` (rule 8).
3. Single commit: `feat(bmo): phase N — <one-line theme>` (body lists sub-phases). **No "Claude"/"AI" in commit messages.**
4. `git push -u origin auto/bmo-phase-executer` (your agent branch — **NEVER `master`**) + launch the CI watcher + start the next phase.

### 6. Release = deploy via `deploy.sh`, owner-/integrator-run after merge (executer never deploys)
The executer never deploys or restarts services. When the integrator merges your green branch to `master`, the owner (or the `bmo-deploy.yml` flow) runs `bmo/pi/scripts/deploy.sh` on the Pi to ship it (ff-only merge + canary + selective restart + rollback). There is no per-phase deploy and no end-of-run `cut.mjs`/tag for bmo.

### 7. Repeat on the next phase
After push + `git mv` to `completed/`, return to rule 1.

### 8. Move finished plans to `completed/` — never delete
`git mv` into `completed/` as part of the phase commit. Plan files are never deleted; `bmo/docs/phases/completed/` is the permanent record.

### 9. STOP-and-ask ONLY for (a) a genuine blocker or (b) a new human decision — never for size/risk/scope
- **(a) Genuinely blocked / impossible** — flat plan contradiction, undeterminable pre-state, uncreatable dependency, unresolvable test failure, an irreversible/destructive action the plan didn't authorize (e.g. **anything that would mutate the live Pi / restart a service** — that's never in an executer's scope; surface it).
- **(b) Needs a NEW human decision** — a real product/judgment call (two valid behaviors, unrequested scope expansion, a security/privacy trade-off, a breaking dependency major-bump).

**NOT triggers — handle and keep going:** size, risk, breadth, low confidence; a resolvable ambiguity (pick the reasonable reading, note in `## Completed`); correctable plan drift; a fixable red gate (fix forward); a separate out-of-scope finding (log per rule 12). When (a)/(b) holds: fire `~/.claude-tools/notify.sh "<warn|error>" "<subject>" "<body>"` (rule 23; this now posts to the BMO status board, not SMS) citing plan line + code line + blocker/decision, then wait.

### 10. Don't stop unless rule 9 fires or the user says stop
Keep going; no mid-run status prose; the **last thing in any response is a tool call** unless ending via rule 9 or rule 14. Auto-continue nudges get zero acknowledgment. "DEFERRED / too risky / needs a live Pi / out of scope for this pass" is banned — implement every item (rule 27); write the Python + tests even for hardware/service code you can't run live, kept green by pytest, ship opt-in/off-by-default if genuinely risky.

### 11. Work on your OWN branch + worktree — never master
`agent-id: bmo-phase-executer`, branch **`auto/bmo-phase-executer`**, worktree **`/home/patrick/home-lab-trees/bmo-phase-executer`** (off latest `origin/master`). Never commit to `master`, touch master's tree/index, rebase shared state (your own branch onto `origin/master` is fine), force-push, or delete a branch you don't own. The integrator merges + deletes your green branch. Other `auto/*` branches are expected; a branch that is **neither `master` nor `auto/*`** is a rule-9 STOP. **Courtesy lock:** because bmo work can touch the live-deploy surface, serialize against a running deploy via the `home-lab-locks/` convention if your change is deploy-sensitive — but the executer still never deploys.

### 12. Log every out-of-scope finding to the correct file
Out-of-scope discovery → **log it, don't inline-fix.** bmo bug/debt/config/perf → `docs/logs/BMO-ISSUES-LOG.md`; future-idea/observation → `docs/logs/BMO-SUGGESTIONS-LOG.md`; durable gotcha → `bmo/docs/DESIGN-CONSTRAINTS.md`; security → `docs/logs/SECURITY-LOG.md` (gitignored). Template + severity/category from `docs/LOG-INSTRUCTIONS.md`; ISO-date; cite file:line.

### 13–14. End of run
No release to watch (rule 6). When no `PHASE-NN-*.md` plans remain at top level, write the end-of-run summary: (1) phases completed (count + list), (2) problems & friction + suggested follow-ups, (3) logged-finding count per file. Factual, scannable, no praise.

### 15. Refresh from origin before opening any plan
```bash
git -C /home/patrick/home-lab fetch origin --quiet
git worktree add /home/patrick/home-lab-trees/bmo-phase-executer -B auto/bmo-phase-executer origin/master 2>/dev/null \
  || { cd /home/patrick/home-lab-trees/bmo-phase-executer && git fetch origin --quiet && git rebase origin/master; }
cd /home/patrick/home-lab-trees/bmo-phase-executer && git status
```
A non-auto-resolvable rebase conflict is a rule-9 STOP-and-ask.

### 16. Do not modify meta-files unprompted
Meta-files (rule-9 STOP to touch): this `INSTRUCTIONS.md`, [`PHASE-INDEX.md`](./PHASE-INDEX.md), repo `CLAUDE.md`/`AGENTS.md` (and `bmo/docs/AGENTS.md`), `docs/logs/SECURITY-LOG.md` (append-exception for new security findings per rule 12), the memory store. Phase work touches plan files, code, and the per-domain ISSUES/SUGGESTIONS logs.

### 17. Update the plan's `## Completed` after every sub-phase
Add a `file:line` citation + one-line summary per sub-phase (working tree only; committed with the phase commit). Partial landings only for a genuine rule-9 case the user authorized — never for size/risk.

### 18. ISO-date every stamp
`date -u +%Y-%m-%d` for every date written. Never hardcode/carry a stale date.

### 19. `gh` auth, notify, heartbeat
`gh auth status` before relying on `gh` (unauth → rule-9 STOP). Fire `~/.claude-tools/notify.sh` on every STOP-and-ask (it routes to the BMO status board; SMS only as failsafe); maintain `~/.claude-tools/session-active` + `heartbeat` for the watchdog. Missing scripts → warn + proceed.

### 20. Never amend/force-push shared state
Fix forward with new commits; never force-push a branch the integrator may have picked up.

### 21. Progress checkpoints
Single-line checkpoint every ~5 sub-phases (then keep going); run the rule-11 foreign-branch sweep (`git ls-remote --heads origin | grep -vE 'refs/heads/(master|auto/)'` non-empty = STOP).

### 27. Take on risky / large fixes — implement, don't defer
Size/risk/low-confidence are not defer reasons. The `auto/*` branch + CI + fix-forward + integrator + the deploy canary/rollback are the safety net. Implement the real thing; ship a genuinely risky behavior change opt-in/off-by-default; write hardware/service code + tests even when you can't run it live. Only (a) genuinely blocked or (b) a new human decision stops you.

### 28. Auto-diagnose, don't just report symptoms
On any non-clean state (red CI, failing/flaky pytest, unexpected diff, a service-down report, a surprising finding), trace the root cause to the file/route/config/step before reporting; then fix forward (in scope) or STOP-and-ask citing the root cause. Never surface a bare "X failed" and wait.

---

## Quick reference — the loop

```
while PHASE-NN-*.md plans remain at top level of bmo/docs/phases/:
  refresh (rule 15): fetch; worktree add -B auto/bmo-phase-executer origin/master  (or rebase your branch)
  foreign-branch sweep (rule 11): any origin branch not master/auto/* -> STOP-and-ask
  plan = earliest PHASE-NN; review (rule 2); verify vs code (rule 3, amend-first if drifted)
  for each sub-phase:
    implement (rule 4); cheap check only: python -m pytest tests/test_<x>.py -q  (rule 5)
    out-of-scope finding -> log it (rule 12), don't inline-fix
    update plan ## Completed (rule 17); (a)/(b) blocker -> STOP-and-ask (rule 9/27)
  ruff check --fix <touched files>                 # lint-fix only — NOT the full pytest sweep
  git add <touched files>; git mv PHASE-NN -> completed/ (rule 8)
  git commit -m "feat(bmo): phase N — <theme>"     # no Claude/AI in the message
  git push -u origin auto/bmo-phase-executer        # NEVER master (rule 11)
  watch CI (bmo-pi-pytest.yml + guards); red -> fix-forward new commit (rule 5/28); keep going
  # NO deploy step — executer never restarts the live Pi; integrator/owner runs deploy.sh after merge (rule 6)
folder empty -> end-of-run summary (rule 14)
```

---

## Notes
- This file is NOT a phase plan and never moves to `completed/`.
- [`PHASE-INDEX.md`](./PHASE-INDEX.md) is a meta-file: keep it at top level, update its Status column, never move/delete it.
- This file is authoritative for bmo phase execution; the repo-wide [`../../../dnd-app/docs/phases/INSTRUCTIONS.md`](../../../dnd-app/docs/phases/INSTRUCTIONS.md) and [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md) are the canonical cross-domain sources if anything here is silent — but the **bmo build/test/deploy commands above override** any dnd-app-specific mechanics (cut.mjs, electron, tags, GitHub-release) that do not apply to bmo.
