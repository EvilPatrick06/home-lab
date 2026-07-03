# Agent fleet registry

In-repo index of the scheduled agents that operate on `home-lab`. The canonical
per-agent definitions (each agent's `SKILL.md`) live orchestrator-side, outside
the repo; this table records only the stable **coordination facts** — id, scope,
kind, branch, and which log(s) each writes or resolves — so "which agent covers
what" is answerable from inside the repo. Adding a scheduled agent adds a row.

Every automated agent works on its own `auto/<id>` branch in its own worktree and
never commits to `master`; the **integrator** consolidates clean branches. See
[`AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md) (Rule 1, Rule 5)
and [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md) (which log to write to).

## Scanners (log-only — never write code)

| Agent id | Domain | Kind | Writes to |
|---|---|---|---|
| `dnd-errors` | dnd-app | errors/bugs/perf | `logs/ISSUES-LOG-DNDAPP.md` |
| `scholar-errors` | dungeon-scholar | errors/bugs/perf | `logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` |
| `bmo-errors` | bmo | errors/bugs/perf | `logs/BMO-ISSUES-LOG.md` |
| `overall-errors` | cross-cutting | errors/bugs/perf | `logs/ISSUES-LOG.md` |
| `dnd-cleanup` | dnd-app | cleanup/reorg | `logs/SUGGESTIONS-LOG-DNDAPP.md` |
| `scholar-cleanup` | dungeon-scholar | cleanup/reorg | `logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` |
| `bmo-cleanup` | bmo | cleanup/reorg | `logs/BMO-SUGGESTIONS-LOG.md` |
| `overall-cleanup` | cross-cutting | cleanup/reorg | `logs/SUGGESTIONS-LOG.md` |
| `dnd-suggestor` | dnd-app | improvement ideas | `logs/SUGGESTIONS-LOG-DNDAPP.md` |
| `scholar-suggestor` | dungeon-scholar | improvement ideas | `logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` |
| `bmo-suggestor` | bmo | improvement ideas | `logs/BMO-SUGGESTIONS-LOG.md` |
| `overall-suggestor` | cross-cutting | improvement ideas | `logs/SUGGESTIONS-LOG.md` |
| `dnd-security` | dnd-app | security scan | `logs/SECURITY-LOG.md` (gitignored, local) |
| `scholar-security` | dungeon-scholar | security scan | `logs/SECURITY-LOG.md` (gitignored, local) |
| `bmo-security` | bmo | security scan | `logs/SECURITY-LOG.md` (gitignored, local) |
| `overall-security` | cross-cutting | security scan | `logs/SECURITY-LOG.md` (gitignored, local) |

## Resolvers (auto-implement bug/security fixes; board-gate the rest)

| Agent id | Domain | Branch | Archives to |
|---|---|---|---|
| `dnd-resolver` | dnd-app | `auto/dnd-resolver` | `logs/RESOLVED-ISSUES-DNDAPP.md` |
| `scholar-resolver` | dungeon-scholar | `auto/scholar-resolver` | `logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md` |
| `bmo-resolver` | bmo | `auto/bmo-resolver` | `logs/BMO-RESOLVED-ISSUES.md` |
| `overall-resolver` | cross-cutting | `auto/overall-resolver` | `logs/RESOLVED-ISSUES.md` |

## Phase agents (planning + execution)

| Agent id | Domain | Kind | Branch |
|---|---|---|---|
| `dnd-phase-maker` | dnd-app | authors phase docs from QA reports | (planning only) |
| `scholar-phase-maker` | dungeon-scholar | authors phase docs from QA reports | (planning only) |
| `bmo-phase-maker` | bmo | authors phase docs from QA reports | (planning only) |
| `dnd-phase-executer` | dnd-app | implements phase docs | `auto/dnd-phase-executer` |
| `scholar-phase-executer` | dungeon-scholar | implements phase docs | `auto/scholar-phase-executer` |
| `bmo-phase-executer` | bmo | implements phase docs | `auto/bmo-phase-executer` |

## QA testers

| Agent id | Domain | Kind |
|---|---|---|
| `app-qa-tester` | dnd-app (desktop) | computer-use QA of the desktop release |
| `web-qa-tester` | dnd-app (web) | browser QA of the web build |
| `scholar-qa-tester` | dungeon-scholar | browser QA |
| `bmo-qa-tester` | bmo | browser QA of the dashboard |

## Integrator + housekeeping

| Agent id | Kind |
|---|---|
| `integrator` | merges clean `auto/*` branches into `master`, reviews Dependabot PRs, auto-cuts dnd-app releases |
| `stale-branch-pruner` | prunes merged `auto/*` branches, stale worktrees, old locks |
| `ci-failure-triage` | surfaces new CI failures to the status board |
| `weekly-shipped-digest` | weekly "what shipped" summary to the status board |

> Non-home-lab personal-assistant agents (morning brief, email triage, calendar
> watch, weather, uptime/health monitors) are out of scope for this registry —
> they do not write to the repo or its logs.
