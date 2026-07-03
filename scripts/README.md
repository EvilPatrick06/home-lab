# `scripts/` — repo-root shared tooling

Cross-cutting scripts wired into CI, the git hooks, or cron. One line per script:
what it does and where it runs. (Per-project script dirs — `bmo/pi/scripts/`,
`dnd-app/scripts/` — have their own READMEs; `.github/scripts/` holds the
workflow-invoked shell.)

| Script | Purpose | Where it runs |
|---|---|---|
| `check-ci-hygiene.sh` | Mechanical repo-convention guards: node-pin, action SHA-pin, docs-index parity, permissions blocks, `workflow_run` name integrity, per-workflow concurrency + job timeouts, LICENSE drift, biome-version single-source. | CI: `.github/workflows/ci-hygiene.yml` (`guards` job) |
| `check-md-links.sh` | Offline markdown link-integrity: every relative link in a tracked `*.md` (excluding `_archive/`) resolves. Warn-only while the backlog is triaged. | CI: `.github/workflows/ci-hygiene.yml` (`md-links` job) |
| `check-agent-instructions.sh` | Agent-instruction drift guard: each secondary instruction file references `AGENTS.md`; `SYNC:agents`-marked blocks match byte-for-byte. | CI: `.github/workflows/agent-docs-check.yml` |
| `claude-tools/watchdog.sh` | Scheduled-agent watchdog helper (session/lock health). | cron (host) |

**Convention:** every `scripts/` dir (root + per-project) carries a one-line-per-script
index README; any shell script wired into CI, a hook, or cron belongs in the table
above with its trigger.
