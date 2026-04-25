# CLAUDE.md

> Read automatically by Claude Code.
> General project instructions: `AGENTS.md`. Structure map: `.cursorrules`.

## Repo at a Glance

Monorepo on a Raspberry Pi 5. Two domains in one git repo:

- **`dnd-app/`** — Electron VTT (TypeScript + React + Vite). Runs on player/DM laptops.
- **`bmo/`** — Pi voice assistant + Discord bots + D&D DM engine (Python Flask). Runs 24/7 on the Pi.

They communicate via HTTP: VTT → BMO on port 5000, BMO callbacks → VTT on port 5001.

Full protocol: `docs/ARCHITECTURE.md`

## Claude-Specific Usage Notes

### Before touching code

Read in order:
1. `.cursorrules` — structure map with every directory explained
2. `AGENTS.md` — standard AI rules (framework, conventions, tests)
3. Active logs (preexisting items so you don't "re-discover" them):
   - `docs/BMO-ISSUES-LOG.md` — BMO-domain bugs + debt
   - `docs/ISSUES-LOG-DNDAPP.md` — dnd-app-domain bugs + debt
   - `docs/BMO-SUGGESTIONS-LOG.md` — BMO-domain ideas + design gotchas + info
   - `docs/SUGGESTIONS-LOG-DNDAPP.md` — dnd-app-domain ideas + design gotchas + info
   - `docs/SECURITY-LOG.md` — security (global, gitignored)
4. Domain doc: `dnd-app/README.md` or `bmo/README.md`

### Tool preferences (Claude Code)

- **Use `Grep` for exact matches**, `SemanticSearch` for concept exploration
- **Use `Read` for files ≤ 2000 lines, chunk-read beyond** (offset+limit)
- **Prefer `Edit`/`StrReplace` over `Write`** when file exists (avoids losing other edits)
- **Parallel tool calls** when independent — speeds up exploration

### Commit style

Format (always imperative, summary ≤ 72 chars):
```
<type>: <one-line summary>

<optional multi-line body with what/why>
<blank line>
<optional refs>
```

Types: `feat, fix, refactor, chore, docs, test, perf, build, ci`

Body optional for trivial changes. For multi-file refactors, describe:
- What changed (high-level)
- Why (if non-obvious)
- Migration notes (if paths/imports affected)

### Safety rules (Claude-specific)

- **Never** `sudo rm -rf` without confirming the path twice
- **Never** `git push --force` without `--with-lease` unless user explicitly confirmed force
- **Never** create commits mentioning "Claude" / "Claude Code" / "AI assistant" in authorship or message
- **Never** delete files from `_archive/` without user confirmation
- **Always** warn before rewriting `/etc/systemd/system/*` or restarting BMO services

### When adding new BMO Python files

1. Pick correct subpackage (`services/`, `hardware/`, `bots/`, `dev/`, `wake/`, `agents/`, `mcp_servers/`)
2. Import via prefix: `from services.X import Y` — never bare `from X import Y`
3. Add `__init__.py` if creating new subpackage
4. Update `bmo/docs/SERVICES.md` if adding a service
5. Add test in `bmo/pi/tests/`
6. If adds systemd integration, update `bmo/setup-bmo.sh` + reinstall

### When adding new dnd-app files

1. Don't restructure `src/{main,preload,renderer,shared}` — electron-vite enforces
2. Feature-group inside `components/`, `services/`, `stores/`
3. TS strict — no `any` without `// biome-ignore lint/suspicious/noExplicitAny` + reason
4. Add colocated `.test.ts(x)` — vitest
5. Register IPC channels in `src/shared/ipc-channels.ts` + schema in `ipc-schemas.ts`

### Logging discoveries

The log is for **unfixed or deferred** work — things that cross session boundaries.

Before appending, decide:

- **Fixing in this session?** → Just fix it. Commit body is the record. Do NOT log.
- **Out of scope / deferred?** → Log it (even if minor).

Then:

1. Read `docs/LOG-INSTRUCTIONS.md` first — triage table (which log), template, severity/category guide, "log vs fix inline" examples
2. Append to the right log (full domain-split):
   - bug / debt / config / perf, **Domain: bmo** → `BMO-ISSUES-LOG.md`
   - bug / debt / config / perf, **Domain: dnd-app** → `ISSUES-LOG-DNDAPP.md`
   - bug / debt / config / perf, **Domain: both** → mirror in BOTH issue logs
   - future-idea / design-gotcha / info, **Domain: bmo** → `BMO-SUGGESTIONS-LOG.md`
   - future-idea / design-gotcha / info, **Domain: dnd-app** → `SUGGESTIONS-LOG-DNDAPP.md`
   - future-idea / design-gotcha / info, **Domain: both** → mirror in BOTH suggestions logs
   - security (any domain) → `SECURITY-LOG.md` (gitignored, global)

**Log even minor/optional out-of-scope items.** Patterns across "small" entries often reveal larger problems. Future Claude sessions grep the log for context; don't rely on commit messages alone. But minor items you're fixing right now don't belong in the log — just fix them.

### Working with the running BMO

BMO runs 24/7 as systemd services. Python changes require restart:

```bash
sudo systemctl restart bmo                        # main app
sudo systemctl restart bmo-dm-bot bmo-social-bot  # if bot code changed
sudo systemctl restart bmo-fan                    # if hardware/fan_control.py changed
journalctl -u bmo -f                              # tail
```

Don't leave BMO in failed state. If a restart fails, check logs + revert OR disable the service (`systemctl disable bmo`) and report to user.

### Multi-step tasks

Use the TODO tracker extensively — user wants visibility into progress on long reorgs/refactors. Follow the **Task List Discipline** rules in `AGENTS.md`:

- Flip status the moment a task finishes (don't batch to the end)
- Only ONE `in_progress` at a time
- Before writing your final summary, reconcile every non-completed ID (evidence for `completed`, reason for `cancelled`, explicit callout for user-action `pending`)
- When splitting a parent task into sub-phases, mark the parent `cancelled` with "split into Xa-Xf" — don't leave it dangling

Tasks left as `pending`/`in_progress` at session end are reported as incomplete by the UI, wasting user attention debugging phantom gaps.

### When stuck

Try in order:
1. Grep all active logs — has this been seen before?
   ```bash
   grep -i "<keyword>" docs/BMO-ISSUES-LOG.md docs/ISSUES-LOG-DNDAPP.md docs/BMO-SUGGESTIONS-LOG.md docs/SUGGESTIONS-LOG-DNDAPP.md docs/SECURITY-LOG.md
   ```
2. `bmo/docs/TROUBLESHOOTING.md` — BMO-specific patterns
3. `git log --oneline -20` — recent changes may give context
4. Ask the user a focused question (don't flail)

### Known gotchas

- **discord.py library** — our BMO Discord bots live in `bots/` package. NEVER rename to `discord/` (shadows library, breaks imports).
- **Python `calendar` stdlib** — our module is `services.calendar_service` (with `_service` suffix) to avoid shadowing. Don't rename to `services.calendar`.
- **Electron main process** is Node, renderer is browser. Can't share runtime. Use IPC + shared types.
- **Flask template path** — our Flask is configured for `web/templates/` + `web/static/` (not default `templates/`). If adding new routes that render templates, verify the path.
- **LFS files** — `5.5e References/*.pdf` are LFS. Skip-smudge is enabled; pull with `git lfs pull` if needed.

### Caveman mode

The user prefers dense, low-filler communication in chat. Mirror that tone:
- Cut articles/pleasantries
- Use symbols (→, =, vs)
- Fragments OK
- Code/technical terms stay exact

Do NOT apply caveman mode to code comments, commit messages, or documentation — those stay professional prose.
