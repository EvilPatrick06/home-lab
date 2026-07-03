# Logging Instructions

How to log discoveries. Read this file BEFORE logging.

> **Instructions file — no actual log entries here.** Entries are split across active logs by topic + domain.

> **Process pointer.** This file is *where to log* out-of-scope / future work. *How* automated agents execute, verify, branch, and release — repo-wide across `dnd-app/`, `bmo/`, and `dungeon-scholar/` — is [`../dnd-app/docs/phases/INSTRUCTIONS.md`](../dnd-app/docs/phases/INSTRUCTIONS.md) (canonical for all domains, not dnd-app-only), with git mechanics in [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md). Logging a *future-idea / deferred-backlog* item here is for work genuinely **out of the current task's scope** — it is NOT a license to defer an in-scope fix for being risky or large (those get implemented; see INSTRUCTIONS.md rule 27). And whenever something *isn't clean* — a red CI run, a failing/flaky check, an unexpected diff, a surprising finding, a down service — diagnose the **root cause** before reporting and fill the **Hypothesis / root cause** field below with the file/commit/step you traced it to, rather than logging a bare symptom (INSTRUCTIONS.md rule 28).

---

## Which log goes where

Active logs are **fully domain-split** for issues + suggestions. Security stays global (single log, gitignored).

| Log | Tracked? | What goes in it |
|---|---|---|
| [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) | git | **BMO-domain bugs, debt, broken config, perf, test failures.** Pi voice assistant + Discord bots + DM engine (Python/Flask/agents/services/wake/MCP). Also Pi-side infra/tooling that BMO depends on. |
| [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) | git | **dnd-app-domain bugs, debt, broken config, perf, test failures.** Electron VTT (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set). |
| [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md) | git | **dungeon-scholar-domain bugs, debt, broken config, perf, test failures.** Vite/React D&D-themed study app, the per-tome run/quiz/lab content set, the Supabase auth wiring. |
| [`ISSUES-LOG.md`](./ISSUES-LOG.md) | git | **Cross-cutting / repo-wide bugs, debt, config (`Domain: both`, repo-wide structural).** The cross-cutting *pointer* log: its `# Cross-cutting issues` section is the single home for whole-repo / monorepo-tooling / multi-project findings (fed by the `overall-*` scanners). NOT for items that belong to one domain. |
| [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) | git | **BMO-domain future ideas / deferred backlog only.** Design gotchas + durable info now live in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md). |
| [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) | git | **BMO-domain design gotchas + durable info/observations** (knowledge, not work). |
| [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) | git | **dnd-app-domain future ideas / deferred backlog only.** Design gotchas + durable info now live in [`dnd-app/docs/DESIGN-CONSTRAINTS.md`](../dnd-app/docs/DESIGN-CONSTRAINTS.md). |
| [`dnd-app/docs/DESIGN-CONSTRAINTS.md`](../dnd-app/docs/DESIGN-CONSTRAINTS.md) | git | **dnd-app-domain design gotchas + durable info/observations** (knowledge, not work). |
| [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md) | git | **dungeon-scholar-domain future ideas / deferred backlog only.** Design gotchas + durable info now live in [`dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`](../dungeon-scholar/docs/DESIGN-CONSTRAINTS.md). |
| [`dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`](../dungeon-scholar/docs/DESIGN-CONSTRAINTS.md) | git | **dungeon-scholar-domain design gotchas + durable info/observations** (knowledge, not work). |
| [`SUGGESTIONS-LOG.md`](./SUGGESTIONS-LOG.md) | git | **Cross-cutting / repo-wide future ideas (`Domain: both`, repo-wide structural).** The cross-cutting *pointer* log: its `## Cross-cutting / repo-wide suggestions` section is the single home for whole-repo structural/convention ideas (fed by the `overall-*` scanners). |
| [`SECURITY-LOG.md`](./SECURITY-LOG.md) | **gitignored** | **Security concerns, hardening backlog, incident notes — any domain (global).** Sensitive — kept local. Never put raw secret values here. |
| [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) | git | Archive of completed BMO entries (issues + suggestions). |
| [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md) | git | Archive of completed dnd-app entries (issues + suggestions). |
| [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md) | git | Archive of completed dungeon-scholar entries (issues + suggestions). |
| [`RESOLVED-ISSUES.md`](./RESOLVED-ISSUES.md) | git | **Archive of completed cross-cutting / repo-wide entries** moved out of the pointer logs (`ISSUES-LOG.md` / `SUGGESTIONS-LOG.md`) — see its `## Cross-cutting resolved` section. |
| [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) | **gitignored** | Archive of completed entries moved out of `SECURITY-LOG.md`. |

**Triage rule:**
1. `security` (even if also `future-idea`) → `SECURITY-LOG.md` (any domain).
2. By **Category** + **Domain**:

   |  | Domain `bmo` | Domain `dnd-app` | Domain `dungeon-scholar` | Domain `both` (or three-way) |
   |---|---|---|---|---|
   | `bug` / `debt` / `config` / `perf` / `test` | `BMO-ISSUES-LOG.md` | `ISSUES-LOG-DNDAPP.md` | `ISSUES-LOG-DUNGEON-SCHOLAR.md` | **repo-wide/structural -> `ISSUES-LOG.md` (pointer); else mirror per domain** |
   | `future-idea` (deferred work) | `BMO-SUGGESTIONS-LOG.md` | `SUGGESTIONS-LOG-DNDAPP.md` | `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` | **repo-wide/structural -> `SUGGESTIONS-LOG.md` (pointer); else mirror per domain** |
   | `design-gotcha` / `info` (durable knowledge, not work) | `bmo/docs/DESIGN-CONSTRAINTS.md` | `dnd-app/docs/DESIGN-CONSTRAINTS.md` | `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md` | **document in each relevant constraints doc** |

3. Edge-cases:
   - `Domain: tooling` → file under whichever domain it most affects (most commit hooks / CI / lint configs touch one domain primarily). If genuinely multi-domain, mirror.
   - `Domain: infra` → BMO log (the Pi is BMO's host; pip/npm caches, systemd, host packages, etc.).
   - `oracle-worker/` (Cloudflare Worker backing dungeon-scholar's Oracle proxy) → file under the **dungeon-scholar** logs; it is dungeon-scholar's backend.
   - `Domain: docs` for repo-root docs (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, etc.) → BMO log by default; if it's domain-specific docs, file under that domain.
   - **`Domain: both` routing (repo-wide vs. multi-project).** *Repo-wide / structural* items — whole-repo conventions, CI/Actions, monorepo tooling, cross-project docs — go in the cross-cutting **pointer logs** (`ISSUES-LOG.md` for bugs/debt/config, `SUGGESTIONS-LOG.md` for future ideas), which carry dedicated `# Cross-cutting` sections fed by the `overall-*` scanners (one entry, one home; fix once, remove once). Items that genuinely affect several **specific** projects but are not repo-wide structure are instead **mirrored** into each relevant per-domain log (single grep finds it from either side; one fix removes every copy). When unsure, prefer the pointer log for anything that is about the repo as a whole.

---

## Purpose

These logs are a living record that survives across AI sessions + human work. They hold:

- Bugs (confirmed + suspected) → issue log per domain (see triage rule)
- Tech debt → issue log per domain
- Future improvements / ideas → suggestions log per domain (or `SECURITY-LOG.md` if security-related)
- Design gotchas (warnings for future contributors) → per-domain `docs/DESIGN-CONSTRAINTS.md` (NOT the suggestions log)
- Security items (incidents, observations, improvement ideas) → `SECURITY-LOG.md` (global)
- Config drift → issue log per domain
- Info / observations (durable knowledge) → per-domain `docs/DESIGN-CONSTRAINTS.md` (NOT the suggestions log)
- Minor / optional stuff (log it anyway — patterns emerge)

**Log EVERYTHING you find worth remembering.** Better to over-log than miss something. Future grep-ability > concise "nice-to-look-at" log.

---

## Who writes entries

- **Every AI agent** (Cursor, Claude Code, Gemini, GitHub Copilot, etc.) — you are expected to append as you discover things
- **Every human contributor** — same
- **Automated tools** (future: npm audit output, Lighthouse reports) — can be scripted to append

---

## Automated agents: append on your own branch

If you are an automated/scheduled agent, you do **not** append to these logs on `master`. You append on your `auto/<agent-id>` branch in your own git worktree; the append-only logs use a `merge=union` driver (see [`/.gitattributes`](../.gitattributes)) so concurrent appends from parallel agents auto-merge when the daily integrator consolidates the branches. Full workflow: [`./AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md).

---

## The decision rule (read this first)

Before appending an entry, ask: **Am I fixing this in the current session / PR?**

| Answer | Action |
|---|---|
| **Yes, fixing now** | DO NOT append. Just fix it. Mention in commit message if non-trivial. Logging something you're fixing in the same commit clutters the log with entries that are stale on arrival. |
| **No, out of scope / deferred / can't fix now** | APPEND. Even if minor. Even if "meh, probably not worth it" — log anyway. |
| **Unsure** | If you'd have to stop current work to fix it → APPEND. If it's a two-line fix you can do in this session → just fix. |

The log is for work that crosses session boundaries. Things finished inside one session don't need an entry.

## When to append

### ALWAYS append when you find:

1. A bug outside your current task's scope (don't silently fix — log it)
2. Tech debt (code that works but smells)
3. A performance issue (measured or suspected)
4. A security concern (missing validation, weak default, hardcoded value that should be config, etc.)
5. A config that's wrong, unclear, or drifting
6. A future improvement idea
7. A pattern worth warning future agents about (e.g., "don't rename this subdir because…")
8. A preexisting minor issue someone should know about

### DON'T append for:

- **Things you're fixing in this PR/session** — just fix them. The commit + diff is the record.
- **Things you just fixed in a prior commit of this same session** — same rule. The log is for unfixed or deferred work.
- Trivial personal observations unrelated to the codebase
- Duplicates (grep first — if already logged, add a comment to existing entry instead of creating new)

### Examples — when to log vs fix inline

| Scenario | Log? | Reason |
|---|---|---|
| User asks "move X", you notice Y is also broken, but Y is a 10-minute fix in the same area | No — fix Y too, mention in commit body | In scope + trivial |
| User asks "move X", you notice Y is broken and would need 2 hours + design decisions | Yes — log Y, finish X | Out of scope |
| You're writing a docs change and spot a typo two paragraphs up | No — fix the typo inline | Trivial, in scope |
| You're refactoring service A, notice service B has an unrelated bug | Yes — log, stay on A | Out of scope |
| You're adding feature F, discover F's new code triggers a latent bug in module M | Depends — if fixable in same PR, fix and document in commit body; if large, log + file follow-up | Judgment call |
| You write a buggy version of your own code, catch it, fix it before committing | No | This is normal development, not a "found bug" |

### When minor/optional = still append

User directive: **log even minor / optional things** *(provided they fall in the "APPEND" column above)*. Threshold for OUT-OF-SCOPE items is low — if you notice something you're not fixing and think "meh, probably not worth logging", log it anyway with `severity: low` or `info`. Patterns across 20 "minor" entries often reveal larger problems.

The low threshold applies to things you're NOT fixing. It does not override the "don't log what you're fixing now" rule above.

---

## Entry template (copy + fill)

Copy this into the right log per the triage rule above (issues + suggestions are split by domain) under the appropriate severity section:

```markdown
### [YYYY-MM-DD] <short title — what the issue / idea is>

- **Category:** bug | debt | config | security | performance | portability | UX | future-idea | design-gotcha | docs
- **Severity:** critical | high | medium | low | info
- **Domain:** dnd-app | bmo | dungeon-scholar | both | tooling | docs | infra
- **Discovered by:** <name or "Claude Code" / "Cursor" / "Gemini" / "Copilot">
- **During:** <brief context of task that surfaced this>

**Description:**
<What's wrong, or what could be better. Concrete. Reproducible language.>

**Reproduction (if bug):**
1. Step
2. Step
3. Observed behavior

**Expected behavior (if bug):** <what should happen>

**Hypothesis / root cause:** <your best guess — may be wrong, clearly flag speculation>

**Proposed fix / improvement:**
- [ ] Step 1
- [ ] Step 2

**Blocked by:** <dependency, if any>

**Related files:** `path/to/file.ts`, `other/file.py`

**Related entries:** <link to other active-log entries by date+title if applicable>
```

---

## Severity guidelines

| Severity | Meaning |
|---|---|
| `critical` | Blocks normal operation. Data loss risk. Security breach. Active crash. Fix ASAP. |
| `high` | Partial functionality broken, workaround exists. OR significant tech debt slowing future work. |
| `medium` | Feature degraded / UX rough, but system usable. Most real bugs live here. |
| `low` | Annoyance. Code smell. Easily worked-around. |
| `info` | Observation, pattern worth noting, idea. Not strictly a "problem". |

Be honest — over-rating severity devalues the scale.

---

## Category guide

| Category | When to use |
|---|---|
| `bug` | Code behaves wrong or crashes |
| `debt` | Code works but design is worsening (repeated pattern, God-object, brittle, etc.) |
| `config` | Setup/env issue. Service misconfigured. Path wrong. Dep missing. |
| `security` | Anything affecting confidentiality, integrity, availability. Also: defense-in-depth ideas. |
| `performance` | Slow. Inefficient. Resource-hungry. |
| `portability` | Runs on X but not Y. Platform-specific assumption. |
| `UX` | User interface or interaction flow issues (dnd-app UI, BMO voice UX, dungeon-scholar UI, CLI messages). |
| `future-idea` | A feature / capability not yet built. |
| `design-gotcha` | Warning for future contributors. "Don't do X because Y." |
| `docs` | Documentation missing, wrong, or confusing. |

Multiple categories allowed: `Category: bug, security` is fine.

---

## How to append (practical)

1. **Grep first** — is this already logged in any of the active logs?
   ```bash
   grep -i "<keyword>" docs/logs/BMO-ISSUES-LOG.md docs/logs/ISSUES-LOG-DNDAPP.md docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md docs/logs/ISSUES-LOG.md docs/logs/BMO-SUGGESTIONS-LOG.md docs/logs/SUGGESTIONS-LOG-DNDAPP.md docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md docs/logs/SUGGESTIONS-LOG.md docs/logs/SECURITY-LOG.md
   ```
   If found, don't duplicate. Add a dated comment under the existing entry OR just read and move on.

2. **Pick the right log** per the triage rule above:
   - Bug / debt / broken config / perf, **Domain: bmo** → `BMO-ISSUES-LOG.md`
   - Bug / debt / broken config / perf, **Domain: dnd-app** → `ISSUES-LOG-DNDAPP.md`
   - Bug / debt / broken config / perf, **Domain: dungeon-scholar** → `ISSUES-LOG-DUNGEON-SCHOLAR.md`
   - Bug / debt / broken config / perf, **Domain: both** (or three-way) → mirror in each relevant issue log
   - Future-idea (deferred work), **Domain: bmo** → `BMO-SUGGESTIONS-LOG.md`
   - Future-idea (deferred work), **Domain: dnd-app** → `SUGGESTIONS-LOG-DNDAPP.md`
   - Future-idea (deferred work), **Domain: dungeon-scholar** → `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`
   - Future-idea (deferred work), **Domain: both** (or three-way) → mirror in each relevant suggestions log
   - Design-gotcha / durable info (knowledge, not work), any domain → that domain's `docs/DESIGN-CONSTRAINTS.md` (NOT a suggestions log)
   - Security (any flavor, any domain) → `SECURITY-LOG.md` (gitignored)

3. **Pick severity + section** within that log (issues are grouped by severity; suggestions are grouped by category — Future ideas / Design gotchas / Info).

4. **Insert** the filled template at the top of that section (newest first).

5. **Also mention** in your PR / commit message: "Logged in <LOG_NAME>: <title>". This makes the entry discoverable from git history too. (Skip this step for `SECURITY-LOG.md` entries — that file isn't tracked, so don't reference it in commit bodies that get pushed.)

---

## After fixing a logged issue

1. **Cut** the entry from its active log (don't leave it behind — keeping resolved entries in the active log clutters grep results and obscures what's still open). For `Domain: both` entries that are mirrored, cut from BOTH active logs.
2. **Paste** it at the TOP of the matching resolved file (newest first):
   - From `BMO-ISSUES-LOG.md` / `BMO-SUGGESTIONS-LOG.md` → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) *(tracked)*
   - From `ISSUES-LOG-DNDAPP.md` / `SUGGESTIONS-LOG-DNDAPP.md` → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md) *(tracked)*
   - From `ISSUES-LOG-DUNGEON-SCHOLAR.md` / `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md) *(tracked)*
   - From the cross-cutting pointer logs `ISSUES-LOG.md` / `SUGGESTIONS-LOG.md` (repo-wide/structural `Domain: both` entries) → [`RESOLVED-ISSUES.md`](./RESOLVED-ISSUES.md), its `## Cross-cutting resolved (overall-resolver)` section *(tracked)*.
   - For `Domain: both` entries that were **mirrored** into per-domain logs, file under the domain whose codebase the fix actually touched (and reference the sibling resolved log in the entry).
   - From `SECURITY-LOG.md` → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) *(gitignored — same privacy reason as the active security log)*
3. Append fix details to the entry:
   ```markdown
   - **Resolved by:** <name / agent>
   - **Commit:** `<SHA>`
   - **Resolution:** <what the fix actually did>
   - **Date resolved:** YYYY-MM-DD
   ```
4. Rename the original `**Severity:**` line to `**Original severity:**` so the resolved entry doesn't compete with active severity grep.

The active logs stay lean; the resolved files preserve history for postmortems and pattern-spotting.

---

## Special categories — deeper guidance

### Security entries

**All security entries go in [`SECURITY-LOG.md`](./SECURITY-LOG.md), regardless of domain.** That file is gitignored so concerns and incident details stay local. Security is the only category that's NOT split by domain — keeping a single security log makes it easier to audit attack-surface across the whole repo at once.

**Worktree agents: write security entries to the MAIN checkout, under the lock.** Because `SECURITY-LOG.md` (and `RESOLVED-SECURITY-ISSUES.md`) are gitignored, they exist ONLY in the main checkout's working tree (`/home/patrick/home-lab/docs/logs/`). They are absent from the per-agent worktrees under `/home/patrick/home-lab-trees/<agent-id>`, never ride `auto/*` branches, and are never merged by the integrator — the `.gitattributes` `SECURITY-LOG*` union rule is inert on an untracked file. An automated agent must therefore NEVER append a security entry inside its worktree (it would be silently lost when the worktree is reset). Instead, append directly to the main checkout's file, serialized through the shared lock so concurrent writers cannot interleave or clobber each other:

```bash
flock /home/patrick/home-lab-locks/security-log.lock \
  bash -c 'cat >> /home/patrick/home-lab/docs/logs/SECURITY-LOG.md <<EOF
<your entry>
EOF'
```

(Any read-modify-write of the file — including moving a resolved entry into `RESOLVED-SECURITY-ISSUES.md` — must happen under the same flock.) The dedup grep in "How to append" should likewise target the main-checkout path for the security logs when run from a worktree.

Log items like:
- Missing input validation
- Dependency with known CVE
- Weak default configs
- Missing rate limiting / auth
- Exposed endpoints that shouldn't be public
- Hardcoded values that should be config
- Secrets-handling improvements

**For accidental secret commits (future incidents):**
Follow the rotation + purge procedure in [`./SECURITY.md`](./SECURITY.md). Then log the INCIDENT in `SECURITY-LOG.md` (under `# Incidents`) with:
- What class of secret (not the secret itself)
- How it got in
- What preventive measure was added

**Do not write secret values (API keys, tokens, passwords) into the log.** Reference by kind only (e.g., "API key for provider X") not by value. Even though `SECURITY-LOG.md` is gitignored, treat it as if it could leak — local backups, accidental copy-paste, etc.

### Design-gotcha entries

**These go in the matching domain's [`docs/DESIGN-CONSTRAINTS.md`]** ([`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md), [`dnd-app/docs/DESIGN-CONSTRAINTS.md`](../dnd-app/docs/DESIGN-CONSTRAINTS.md), or [`dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`](../dungeon-scholar/docs/DESIGN-CONSTRAINTS.md); mirror for `Domain: both`). Design gotchas are durable knowledge, not backlog — keep them out of the action/suggestion logs. For things that LOOK like they should be changed but shouldn't. Save future agents from tempting but broken refactors. Examples:
- "Don't rename `bmo/pi/bots/` to `discord/` — shadows `discord.py` library" → `bmo/docs/DESIGN-CONSTRAINTS.md`
- "Don't restructure `dnd-app/src/{main,preload,renderer,shared}/` — electron-vite hardcodes those" → `dnd-app/docs/DESIGN-CONSTRAINTS.md`

Format as a warning, high visibility:

```markdown
### [YYYY-MM-DD] DO NOT <thing>

- **Category:** design-gotcha
- **Severity:** high (they're often critical-to-know but low-to-fix)
- **Domain:** <where>

**Why it's tempting:** <what someone might think to do>

**Why it's wrong:** <concrete consequence>

**What to do instead:** <correct approach>
```

### Future-idea entries

**Non-security future ideas go in the matching domain's suggestions log.** Security-flavored ones (`Category: future-idea, security`) go in [`SECURITY-LOG.md`](./SECURITY-LOG.md). For nice-to-haves. Tag with rough effort if known:

```markdown
### [YYYY-MM-DD] Add pre-commit secret scanner

- **Category:** future-idea, security
- **Severity:** low
- **Domain:** tooling
- **Effort estimate:** 1 hour
```

---

## Housekeeping (periodic)

Roughly every month or major session, someone (human or AI) should:

1. Grep for stale entries (`Last updated:` > 6 months ago with no movement)
2. Demote or close entries that are no longer relevant
3. Collapse duplicates
4. Promote frequently-referenced issues to be fixed

Tracked as a recurring improvement in the relevant log itself.

---

## Why instructions and logs are separate files

Keeping instructions here (stable, low-churn) and the logs separate (frequently-appended) means:
- You can safely grep a log for "bug" without hitting template examples
- Edits to instructions don't create meaningless diffs in the logs
- AI agents can read instructions once and then only touch the logs
- Each log stays chronological / organized within its topic; the instructions stay didactic

---

## Quick reference

**Log entry:** append to the right log per the triage table at top:
- bug / debt / config / perf — `Domain: bmo` → `docs/logs/BMO-ISSUES-LOG.md`
- bug / debt / config / perf — `Domain: dnd-app` → `docs/logs/ISSUES-LOG-DNDAPP.md`
- bug / debt / config / perf — `Domain: both` → mirror in BOTH issue logs
- future-idea (deferred work) — `Domain: bmo` → `docs/logs/BMO-SUGGESTIONS-LOG.md`; dnd-app → `docs/logs/SUGGESTIONS-LOG-DNDAPP.md`; dungeon-scholar → `docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`; both → mirror
- design-gotcha / durable info (knowledge) — any domain → that domain's `docs/DESIGN-CONSTRAINTS.md` (NOT a suggestions log)
- security (any flavor, any domain) → `docs/logs/SECURITY-LOG.md` *(gitignored)*

**Before fix:** grep all seven tracked active logs (above — incl. the two cross-cutting pointer logs) + `SECURITY-LOG.md`; log if not already present.

**After fix:** move entry → matching resolved log:
- BMO entries (issues + suggestions) → `BMO-RESOLVED-ISSUES.md`
- dnd-app entries (issues + suggestions) → `RESOLVED-ISSUES-DNDAPP.md`
- dungeon-scholar entries (issues + suggestions) → `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`
- cross-cutting pointer-log entries → `RESOLVED-ISSUES.md` (its Cross-cutting resolved section)
- security entries → `RESOLVED-SECURITY-ISSUES.md` (gitignored)
- Always add commit SHA + resolution.

**Minor stuff:** still log

**Secrets:** log incident in `SECURITY-LOG.md`, never log the secret value itself
