# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-23] Consider grouping the append-only log files under `docs/logs/`

- **Category:** docs, debt
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-23)

**Description:**
The 12+ append-only log files (`BMO-ISSUES-LOG.md`, `ISSUES-LOG-DNDAPP.md`, `ISSUES-LOG-DUNGEON-SCHOLAR.md`, `ISSUES-LOG.md`, the `SUGGESTIONS-LOG*` set, and the large `RESOLVED-*` archives) sit at the same level as conceptual docs in `docs/`. Relocating them to a `docs/logs/` subdir would visually separate machine-appended churn from human-authored guidance and shrink the top-level `docs/` listing. The union-merge driver is keyed by filename glob "any directory" (see `.gitattributes`), so a move does NOT break auto-merge. The real cost is updating the many cross-references (root `README.md`, `LOG-INSTRUCTIONS.md`, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `AUTOMATED-AGENT-GIT-WORKFLOW.md`, and every scheduled-agent task file that hardcodes `docs/<LOG>.md`) — so this is a deliberate, all-at-once reorg, not a quick move. Logged as a low-priority structural option, not an urgent fix.

**Hypothesis / root cause:** Logs were created in `docs/` root before the set grew large enough to warrant its own subdir.

**Proposed fix / improvement:**
- [ ] If pursued: `git mv docs/*ISSUES-LOG*.md docs/*SUGGESTIONS-LOG*.md docs/RESOLVED-*.md docs/logs/` in one commit.
- [ ] Update all hardcoded `docs/<LOG>.md` references (README, instruction files, workflow doc, scheduled task files) in the same commit.
- [ ] Verify `.gitattributes` union-merge globs still match (they are path-agnostic, so they should).

**Blocked by:** Needs a human go/no-go — high reference-churn for modest benefit.

**Related files:** `docs/`, `.gitattributes`, `README.md`, `docs/LOG-INSTRUCTIONS.md`, `AGENTS.md`

> **2026-06-23 (overall-resolver):** User-approved, but left UNIMPLEMENTED this run. The move requires updating scheduled-agent task files that hardcode `docs/<LOG>.md` and live OUTSIDE this repo (the other resolvers/scanners and the integrator); moving the logs would break those agents on their next run until each task definition is updated in the scheduler. That out-of-repo coordination is a new step the approval couldn't cover — do it first, then this move is a quick `git mv` + reference sweep.
