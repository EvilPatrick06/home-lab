# Phase execution (pointer)

The repo-wide **implement → verify → commit → release loop** that EVERY
automated/scheduled agent follows — across `dnd-app/`, `bmo/`,
`dungeon-scholar/`, and cross-cutting work — is canonically documented at:

> **[`dnd-app/docs/phases/INSTRUCTIONS.md`](../dnd-app/docs/phases/INSTRUCTIONS.md)**

Despite its path under `dnd-app/`, that file is **repo-wide, not dnd-app-only**:
it governs how agents execute and verify work in any domain (only the per-domain
build/test commands differ). The git mechanics (branch + worktree + integrator)
live in [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md).

This top-level pointer exists so a bmo- or dungeon-scholar-scoped agent (or a
human) can find the canonical process from `docs/` without knowing to look
inside `dnd-app/`. The full doc was **not relocated**: its path is cited by
out-of-repo scheduled-task `SKILL.md` definitions and ~5 in-repo docs, so a move
is a wide, higher-risk change better done deliberately; this stub is the
low-disruption alternative. The per-domain analogues
([`bmo/docs/phases/INSTRUCTIONS.md`](../bmo/docs/phases/INSTRUCTIONS.md),
[`dungeon-scholar/docs/phases/INSTRUCTIONS.md`](../dungeon-scholar/docs/phases/INSTRUCTIONS.md))
carry domain facts + concrete commands and point back to the canonical doc.
