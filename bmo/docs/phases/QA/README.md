# QA

Output folder for autonomous QA passes on **bmo** (the Raspberry-Pi voice-assistant + home dashboard — the Flask app + Alpine.js dashboard served at `/bmo`).

> **Scope:** bmo's **own** dashboard and services (home, chat agent, music, TV, controls, calendar, timers/alarms, IDE, voice, camera, LEDs). **The AI Dungeon Master engine is `dnd-app`, not `bmo`** — DM/VTT testing is out of scope here (the bare root `/` redirect to `/DungeonTableOnline/` is the dnd-app web build). See [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) §scope-boundary.

## What's here

| File / dir | What it is |
|---|---|
| [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) | The QA agent's full instructions — how to set up, what to test (every dashboard tab/panel/control + bmo's services), the matrices (connection state, kiosk vs normal, hardware present/absent, viewports), the real-world side-effect etiquette, and the report format. Start here. |
| `QA-report-YYYY-MM-DD.md` | One report per run. Findings organized by test phase, then by severity within each phase, preceded by a "Top findings" (Critical/High) index. Actionable items only. |
| `screenshots/` | Finding-evidence screenshots referenced from the reports (tracked via Git LFS). |
| `completed/` | Older reports, moved here once superseded. |

## How reports get here

The QA agent runs against the **live bmo dashboard** (`http://bmo.local:5000/bmo` on the LAN, or `https://bmo.mybmoai.work/bmo` behind Cloudflare Access off-LAN), writes its report incrementally to this folder, saves evidence screenshots under `screenshots/`, then commits **only this folder** on its own branch `auto/bmo-qa` (never `master`) and pushes that branch; the daily integrator merges it into `master`. The agent is otherwise read-only on the repo and the Pi — it never edits source, restarts services, or touches the issue/suggestion logs. See [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](../../../../docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

## Note for editing agents / triage

These reports are **not** the tracked issue logs. Findings here still need triaging into the real logs (`docs/logs/BMO-ISSUES-LOG.md` / `docs/logs/BMO-SUGGESTIONS-LOG.md`) per `docs/LOG-INSTRUCTIONS.md`. Each finding uses a template that mirrors those logs' fields to make that hand-off easy. A finding may be marked `already in <log>` (already tracked), `intentional per DESIGN-CONSTRAINTS`, or `unverified — <why>`.

## Conventions

- One report file per run, dated: `QA-report-YYYY-MM-DD.md` (add a `-2`, `-3` suffix for multiple runs on the same day).
- Screenshots: descriptive names under `screenshots/`, referenced by relative link from the report.
- Severity vocabulary matches `docs/LOG-INSTRUCTIONS.md`.
