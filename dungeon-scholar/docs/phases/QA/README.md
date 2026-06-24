# QA

Output folder for autonomous QA passes on **dungeon-scholar** (the D&D-themed exam-prep study SPA, deployed to GitHub Pages at `https://evilpatrick06.github.io/home-lab/`).

## What's here

| File / dir | What it is |
|---|---|
| [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) | The QA agent's full instructions — how to set up, what to test (every screen/study-mode/modal/setting), the matrices (cloud-sync on/off, Oracle on/off, Dark/Light, the three viewports, tome/sealed states), and the report format. Start here. |
| `QA-report-YYYY-MM-DD.md` | One report per run. Findings organized by test phase, then by severity within each phase, preceded by a "Top findings" (Critical/High) index. Actionable items only. |
| `screenshots/` | Finding-evidence screenshots referenced from the reports (tracked via Git LFS). |
| `completed/` | Older reports, moved here once superseded. |

## How reports get here

The QA agent runs against the **latest deployed GitHub-Pages build** (the live SPA at `https://evilpatrick06.github.io/home-lab/#/home`), writes its report incrementally to this folder, saves evidence screenshots under `screenshots/`, then commits **only this folder** on its own branch `auto/ds-qa` (never `master`) and pushes that branch; the daily integrator merges it into `master`. The agent is otherwise read-only on the repo and the Pi — it never edits source or the issue/suggestion logs. See [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

## Note for editing agents / triage

These reports are **not** the tracked issue logs. Findings here still need triaging into the real logs (`docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` / `docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`) per `docs/LOG-INSTRUCTIONS.md`. Each finding uses a template that mirrors those logs' fields to make that hand-off easy. A finding may be marked `already in <log>` (already tracked), `intentional per DESIGN-CONSTRAINTS`, or `unverified — <why>`.

## Conventions

- One report file per run, dated: `QA-report-YYYY-MM-DD.md` (add a `-2`, `-3` suffix for multiple runs on the same day).
- Screenshots: descriptive names under `screenshots/`, referenced by relative link from the report.
- Severity vocabulary matches `docs/LOG-INSTRUCTIONS.md`.
