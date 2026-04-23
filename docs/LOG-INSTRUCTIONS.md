# Logging Instructions

How to log discoveries into [`ISSUES-LOG.md`](./ISSUES-LOG.md). Read this file BEFORE logging.

> **Instructions file — no actual log entries here.**
> Entries go in [`ISSUES-LOG.md`](./ISSUES-LOG.md).

---

## Purpose

`ISSUES-LOG.md` is a living record that survives across AI sessions + human work. It holds:

- Bugs (confirmed + suspected)
- Tech debt
- Future improvements / ideas
- Design gotchas (warnings for future contributors)
- Security items (incidents, observations, improvement ideas)
- Config drift
- Minor / optional stuff (log it anyway — patterns emerge)

**Log EVERYTHING you find worth remembering.** Better to over-log than miss something. Future grep-ability > concise "nice-to-look-at" log.

---

## Who writes entries

- **Every AI agent** (Cursor, Claude Code, Gemini, GitHub Copilot, etc.) — you are expected to append as you discover things
- **Every human contributor** — same
- **Automated tools** (future: npm audit output, Lighthouse reports) — can be scripted to append

---

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

- Things you're fixing in this PR/session (just fix them)
- Trivial personal observations unrelated to the codebase
- Duplicates (grep first — if already logged, add a comment to existing entry instead of creating new)

### When minor/optional = still append

User directive: **log even minor / optional things.** Threshold is low. If you notice something and think "meh, probably not worth logging" — log it anyway with `severity: low` or `info`. Patterns across 20 "minor" entries often reveal larger problems.

---

## Entry template (copy + fill)

Copy this into `ISSUES-LOG.md` under the appropriate severity section:

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

**Related entries:** <link to other ISSUES-LOG entries by date+title if applicable>
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

1. **Grep first** — is this already logged?
   ```bash
   grep -i "<keyword>" docs/ISSUES-LOG.md
   ```
   If found, don't duplicate. Add a dated comment under the existing entry OR just read and move on.

2. **Pick severity + section** in `ISSUES-LOG.md` (entries are grouped by severity under `# Active Issues`).

3. **Insert** the filled template at the top of that severity section (newest first within section).

4. **Also mention** in your PR / commit message: "Logged in ISSUES-LOG.md: <title>". This makes the log entry discoverable from git history too.

---

## After fixing a logged issue

1. Move the entry from "Active Issues" → "Resolved" at the bottom of `ISSUES-LOG.md`
2. Add fix details:
   ```markdown
   - **Resolved by:** <name / agent>
   - **Commit:** `<SHA>`
   - **Resolution:** <what the fix actually did>
   - **Date resolved:** YYYY-MM-DD
   ```
3. Do NOT delete the entry — the history is the value.

---

## Special categories — deeper guidance

### Security entries

Log items like:
- Missing input validation
- Dependency with known CVE
- Weak default configs
- Missing rate limiting / auth
- Exposed endpoints that shouldn't be public
- Hardcoded values that should be config
- Secrets-handling improvements

**For accidental secret commits (future incidents):**
Follow the rotation + purge procedure in [`../SECURITY.md`](../SECURITY.md). Then log the INCIDENT here with:
- What class of secret (not the secret itself)
- How it got in
- What preventive measure was added

**Do not write secret values (API keys, tokens, passwords) into the log.** Reference by kind only (e.g., "API key for provider X") not by value.

### Design-gotcha entries

For things that LOOK like they should be changed but shouldn't. Save future agents from tempting but broken refactors. Examples:
- "Don't rename `bmo/pi/bots/` to `discord/` — shadows `discord.py` library"
- "Don't use `any` to silence the TS error in X — it hides a real validation bug"

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

For nice-to-haves. Tag with rough effort if known:

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

Tracked as a recurring improvement in `ISSUES-LOG.md` itself.

---

## Why this file + log file are separate

Keeping instructions here (stable, low-churn) and the log separate (frequently-appended) means:
- You can safely grep the log for "bug" without hitting template examples
- Edits to instructions don't create meaningless diffs in the log
- AI agents can read instructions once and then only touch the log
- The log stays chronological / organized; the instructions stay didactic

---

## Quick reference

**Log entry:** append to `docs/ISSUES-LOG.md`

**Before fix:** grep + log

**After fix:** move to Resolved + add commit SHA

**Minor stuff:** still log

**Secrets:** log incident, never log the secret value itself
