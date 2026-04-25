# Logging Instructions

How to log discoveries. Read this file BEFORE logging.

> **Instructions file — no actual log entries here.** Entries are split across active logs by topic + domain.

---

## Which log goes where

Active logs are **fully domain-split** for issues + suggestions. Security stays global (single log, gitignored).

| Log | Tracked? | What goes in it |
|---|---|---|
| [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) | git | **BMO-domain bugs, debt, broken config, perf, test failures.** Pi voice assistant + Discord bots + DM engine (Python/Flask/agents/services/wake/MCP). Also Pi-side infra/tooling that BMO depends on. |
| [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) | git | **dnd-app-domain bugs, debt, broken config, perf, test failures.** Electron VTT (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set). |
| [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) | git | **BMO-domain future ideas, design gotchas (`DO NOT X`), info observations.** |
| [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) | git | **dnd-app-domain future ideas, design gotchas, info observations.** |
| [`SECURITY-LOG.md`](./SECURITY-LOG.md) | **gitignored** | **Security concerns, hardening backlog, incident notes — any domain (global).** Sensitive — kept local. Never put raw secret values here. |
| [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) | git | Archive of completed BMO entries (issues + suggestions). |
| [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md) | git | Archive of completed dnd-app entries (issues + suggestions). |
| [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) | **gitignored** | Archive of completed entries moved out of `SECURITY-LOG.md`. |

**Triage rule:**
1. `security` (even if also `future-idea`) → `SECURITY-LOG.md` (any domain).
2. By **Category** + **Domain**:

   |  | Domain `bmo` | Domain `dnd-app` | Domain `both` |
   |---|---|---|---|
   | `bug` / `debt` / `config` / `perf` / `test` | `BMO-ISSUES-LOG.md` | `ISSUES-LOG-DNDAPP.md` | **mirror in BOTH** |
   | `future-idea` / `design-gotcha` / `info` | `BMO-SUGGESTIONS-LOG.md` | `SUGGESTIONS-LOG-DNDAPP.md` | **mirror in BOTH** |

3. Edge-cases:
   - `Domain: tooling` → file under whichever domain it most affects (most commit hooks / CI / lint configs touch one domain primarily). If genuinely both, mirror.
   - `Domain: infra` → BMO log (the Pi is BMO's host; pip/npm caches, systemd, host packages, etc.).
   - `Domain: docs` for repo-root docs (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, etc.) → BMO log by default; if it's domain-specific docs, file under that domain.
   - **`Domain: both` deliberately duplicates** — small cost, big benefit (single grep finds it from either side; one fix removes both copies).

---

## Purpose

These logs are a living record that survives across AI sessions + human work. They hold:

- Bugs (confirmed + suspected) → issue log per domain (see triage rule)
- Tech debt → issue log per domain
- Future improvements / ideas → suggestions log per domain (or `SECURITY-LOG.md` if security-related)
- Design gotchas (warnings for future contributors) → suggestions log per domain
- Security items (incidents, observations, improvement ideas) → `SECURITY-LOG.md` (global)
- Config drift → issue log per domain
- Info / observations → suggestions log per domain
- Minor / optional stuff (log it anyway — patterns emerge)

**Log EVERYTHING you find worth remembering.** Better to over-log than miss something. Future grep-ability > concise "nice-to-look-at" log.

---

## Who writes entries

- **Every AI agent** (Cursor, Claude Code, Gemini, GitHub Copilot, etc.) — you are expected to append as you discover things
- **Every human contributor** — same
- **Automated tools** (future: npm audit output, Lighthouse reports) — can be scripted to append

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
- **Domain:** dnd-app | bmo | both | tooling | docs | infra
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
| `UX` | User interface or interaction flow issues (dnd-app UI, BMO voice UX, CLI messages). |
| `future-idea` | A feature / capability not yet built. |
| `design-gotcha` | Warning for future contributors. "Don't do X because Y." |
| `docs` | Documentation missing, wrong, or confusing. |

Multiple categories allowed: `Category: bug, security` is fine.

---

## How to append (practical)

1. **Grep first** — is this already logged in any of the active logs?
   ```bash
   grep -i "<keyword>" docs/BMO-ISSUES-LOG.md docs/ISSUES-LOG-DNDAPP.md docs/BMO-SUGGESTIONS-LOG.md docs/SUGGESTIONS-LOG-DNDAPP.md docs/SECURITY-LOG.md
   ```
   If found, don't duplicate. Add a dated comment under the existing entry OR just read and move on.

2. **Pick the right log** per the triage rule above:
   - Bug / debt / broken config / perf, **Domain: bmo** → `BMO-ISSUES-LOG.md`
   - Bug / debt / broken config / perf, **Domain: dnd-app** → `ISSUES-LOG-DNDAPP.md`
   - Bug / debt / broken config / perf, **Domain: both** → mirror in BOTH issue logs
   - Future-idea / design-gotcha / info, **Domain: bmo** → `BMO-SUGGESTIONS-LOG.md`
   - Future-idea / design-gotcha / info, **Domain: dnd-app** → `SUGGESTIONS-LOG-DNDAPP.md`
   - Future-idea / design-gotcha / info, **Domain: both** → mirror in BOTH suggestions logs
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
   - For `Domain: both` entries, file under the domain whose codebase the fix actually touched (and reference the sibling resolved log in the entry).
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

**These go in the matching domain's suggestions log** ([`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) or [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md), or both for `Domain: both`). For things that LOOK like they should be changed but shouldn't. Save future agents from tempting but broken refactors. Examples:
- "Don't rename `bmo/pi/bots/` to `discord/` — shadows `discord.py` library" → `BMO-SUGGESTIONS-LOG.md`
- "Don't restructure `dnd-app/src/{main,preload,renderer,shared}/` — electron-vite hardcodes those" → `SUGGESTIONS-LOG-DNDAPP.md`

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
- bug / debt / config / perf — `Domain: bmo` → `docs/BMO-ISSUES-LOG.md`
- bug / debt / config / perf — `Domain: dnd-app` → `docs/ISSUES-LOG-DNDAPP.md`
- bug / debt / config / perf — `Domain: both` → mirror in BOTH issue logs
- future-idea / design-gotcha / info — `Domain: bmo` → `docs/BMO-SUGGESTIONS-LOG.md`
- future-idea / design-gotcha / info — `Domain: dnd-app` → `docs/SUGGESTIONS-LOG-DNDAPP.md`
- future-idea / design-gotcha / info — `Domain: both` → mirror in BOTH suggestions logs
- security (any flavor, any domain) → `docs/SECURITY-LOG.md` *(gitignored)*

**Before fix:** grep all five tracked active logs (above) + `SECURITY-LOG.md`; log if not already present.

**After fix:** move entry → matching resolved log:
- BMO entries (issues + suggestions) → `BMO-RESOLVED-ISSUES.md`
- dnd-app entries (issues + suggestions) → `RESOLVED-ISSUES-DNDAPP.md`
- security entries → `RESOLVED-SECURITY-ISSUES.md` (gitignored)
- Always add commit SHA + resolution.

**Minor stuff:** still log

**Secrets:** log incident in `SECURITY-LOG.md`, never log the secret value itself
