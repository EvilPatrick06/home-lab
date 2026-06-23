# `docs/` index

Repo-wide documentation and the append-only logs live here. This index groups every
file by purpose; the logs further down are machine-appended and split by domain.

## Architecture & data

| Doc | What it covers |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How dnd-app + bmo communicate (full protocol spec). |
| [`DATA-FLOW.md`](./DATA-FLOW.md) | Where data lives and how it moves between components. |
| [`RULES-RETRIEVAL.md`](./RULES-RETRIEVAL.md) | Cross-engine rules-retrieval stack (dnd-app TS + bmo Python). |
| [`GLOSSARY.md`](./GLOSSARY.md) | Beginner-friendly index of project terms. |

## Setup & operations

| Doc | What it covers |
|---|---|
| [`SETUP.md`](./SETUP.md) | Full clone-to-running guide (Pi + laptop). |
| [`COMMANDS.md`](./COMMANDS.md) | Common-commands cheat sheet. |
| [`BACKUP.md`](./BACKUP.md) | Backup strategy (Pi + GitHub LFS + cloud). |
| [`OLLAMA-TUNING.md`](./OLLAMA-TUNING.md) | Local LLM (Ollama) performance tuning. |
| [`SECURITY.md`](./SECURITY.md) | Security posture, reporting, and secret-handling. |

## Contributor process

| Doc | What it covers |
|---|---|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Branch / commit conventions, script vocabulary, PR flow. |
| [`AUTOMATED-AGENT-GIT-WORKFLOW.md`](./AUTOMATED-AGENT-GIT-WORKFLOW.md) | Per-agent branch + worktree + daily integrator workflow. |
| [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md) | Which log to write to, and when not to log. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history. |

## Logs — active issues / debt

Bugs, tech debt, broken config, perf, and test failures, split by domain. `ISSUES-LOG.md`
is a compatibility pointer for cross-cutting (`Domain: both`) entries.

| Log | Domain |
|---|---|
| [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md) | bmo |
| [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) | dnd-app |
| [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md) | dungeon-scholar |
| [`ISSUES-LOG.md`](./ISSUES-LOG.md) | cross-cutting pointer |

## Logs — suggestions / future ideas

Deferred backlog and future ideas, split by domain. `SUGGESTIONS-LOG.md` holds
cross-cutting (`Domain: both`) entries.

| Log | Domain |
|---|---|
| [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md) | bmo |
| [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) | dnd-app |
| [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md) | dungeon-scholar |
| [`SUGGESTIONS-LOG.md`](./SUGGESTIONS-LOG.md) | cross-cutting pointer |

## Logs — resolved archives

Completed entries (issues + suggestions) moved out of the active logs.

| Archive | Domain |
|---|---|
| [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) | bmo |
| [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md) | dnd-app |
| [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md) | dungeon-scholar |
| [`RESOLVED-ISSUES.md`](./RESOLVED-ISSUES.md) | cross-cutting pointer |

## Security logs (gitignored — local only)

Not tracked in git (sensitive); present only on a working checkout.

| Log | What it covers |
|---|---|
| `SECURITY-LOG.md` | Security concerns, hardening backlog, incident notes (any domain). |
| `RESOLVED-SECURITY-ISSUES.md` | Archive of resolved security entries. |

> Process note: durable design knowledge (not work) lives in each project's
> `docs/DESIGN-CONSTRAINTS.md`, not in the suggestions logs. See
> [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).
