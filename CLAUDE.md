# CLAUDE.md

> Read automatically by Claude Code.

> **Canonical source:** shared conventions (repo layout, git workflow, logging
> rules) live in [`AGENTS.md`](./AGENTS.md). This file covers tool-specific notes;
> when they overlap, AGENTS.md wins. Keep shared sections in sync (S11).

> General project instructions: `AGENTS.md`. Structure map: `.cursorrules`.

## Repo at a Glance

Monorepo on a Raspberry Pi 5. Three app domains (plus the `oracle-worker/` edge worker) in one git repo:

- **`dnd-app/`** — Electron VTT (TypeScript + React + Vite). Runs on player/DM laptops.
- **`bmo/`** — Pi voice assistant + Discord bots + D&D DM engine (Python Flask). Runs 24/7 on the Pi.
- **`dungeon-scholar/`** — Web study app (Vite + React + Vitest). Cybersecurity / IT / CS exam prep with a D&D-themed dungeon delve loop. Deployed to GitHub Pages.
- **`oracle-worker/`** — Cloudflare Worker backing dungeon-scholar’s Oracle (AI grading/chat) proxy. Deployed to the Cloudflare edge.

`dnd-app` and `bmo` communicate via HTTP: VTT → BMO on port 5000, BMO callbacks → VTT on port 5001. `dungeon-scholar` is independent.

Full protocol: `docs/ARCHITECTURE.md`

## Claude-Specific Usage Notes

### Before touching code

Read in order:
1. `.cursorrules` — structure map with every directory explained
2. `AGENTS.md` — standard AI rules (framework, conventions, tests)
3. `dnd-app/docs/phases/PHASE-INDEX.md` — the backlog phase set for ALL three
   domains (2026-06-11 — every open log entry became a numbered phase plan; the
   consolidating audit was deleted once the set was authored)
4. Active logs (new items since the consolidation land here first):
   - `docs/BMO-ISSUES-LOG.md` — BMO-domain bugs + debt
   - `docs/ISSUES-LOG-DNDAPP.md` — dnd-app-domain bugs + debt
   - `docs/ISSUES-LOG-DUNGEON-SCHOLAR.md` — dungeon-scholar-domain bugs + debt
   - `docs/BMO-SUGGESTIONS-LOG.md` — BMO-domain ideas + design gotchas + info
   - `docs/SUGGESTIONS-LOG-DNDAPP.md` — dnd-app-domain ideas + design gotchas + info
   - `docs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` — dungeon-scholar-domain ideas + design gotchas + info
   - `docs/SECURITY-LOG.md` — security (global, gitignored)
5. Domain doc: `dnd-app/README.md`, `bmo/README.md`, or `dungeon-scholar/README.md`

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

### Automated-agent git workflow

If this session runs as an **automated/scheduled agent** (scanner, QA, phase-maker, phase-executer, log-resolver, etc.), do **not** commit to `master`. Work on `auto/<agent-id>` in your own git worktree (`git worktree add /home/patrick/home-lab-trees/<agent-id> -B auto/<agent-id> origin/master`), commit there, and `git push -u origin auto/<agent-id>`. Never touch master's working tree, never rebase shared state, never force-push another agent's branch. A daily integrator merges clean branches into `master` and reviews Dependabot PRs. An interactive Claude Code chat may still use `master` directly. Full spec: [`docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`](docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

The repo-wide implement → verify → commit → release process for automated agents (ALL domains — dnd-app, bmo, dungeon-scholar) is [`dnd-app/docs/phases/INSTRUCTIONS.md`](dnd-app/docs/phases/INSTRUCTIONS.md) (canonical, not dnd-app-only). Per that process, automated agents **attempt risky / large fixes rather than deferring them** — the `auto/*` branch + CI gate + (for resolver work) the user's approval + fix-forward is the safety net; size or risk alone is never a reason to leave or hand a fix back. Stop short only if (a) genuinely blocked, or (b) a new human decision the scope didn't cover is needed (INSTRUCTIONS.md rule 27). And whenever something **isn't clean** — a red/failed CI run, a failing or flaky check, an unexpected diff or dirty tree, a surprising scan/QA finding, a down service — **automatically diagnose the root cause before reporting**: trace it to the responsible file / commit / config / step, state the cause, and fix it forward if in scope. Never surface a bare symptom and wait to be told to investigate — proactive root-cause diagnosis is the default for every agent (INSTRUCTIONS.md rule 28; git mechanics in `AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 4).

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
6. **All D&D content data lives in the library (single source of truth).** Consumers reference entries by `EntryRef` and hydrate via `services/library/use-library-entry.ts` hooks (`useLibraryEntry` / `useLibraryEntries` / `useHydratedRef`) — never inline-duplicate library data. See `src/renderer/src/services/library/README.md`. The boundary test (`services/library/library-boundary.test.ts`) fails CI on raw `public/data` imports / `/data/5e` fetches outside the allowlist; opt out only with an inline `// boundary-allow: <reason>`.

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
   - bug / debt / config / perf, **Domain: dungeon-scholar** → `ISSUES-LOG-DUNGEON-SCHOLAR.md`
   - bug / debt / config / perf, **Domain: both** (or three-way) → mirror in each relevant issue log
   - future-idea / design-gotcha / info, **Domain: bmo** → `BMO-SUGGESTIONS-LOG.md`
   - future-idea / design-gotcha / info, **Domain: dnd-app** → `SUGGESTIONS-LOG-DNDAPP.md`
   - future-idea / design-gotcha / info, **Domain: dungeon-scholar** → `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`
   - future-idea / design-gotcha / info, **Domain: both** (or three-way) → mirror in each relevant suggestions log
   - security (any domain) → `SECURITY-LOG.md` (gitignored, global)

**Log even minor/optional out-of-scope items.** Patterns across "small" entries often reveal larger problems. Future Claude sessions grep the log for context; don't rely on commit messages alone. But minor items you're fixing right now don't belong in the log — just fix them.

### Cutting a dnd-app release

`dnd-app` releases are gated and versioned via a helper. **Don't tag manually** — version drift between `package.json` and the tag causes electron-builder to publish to the wrong release (this caused v2.0.1/v2.0.2/v2.1.0/v2.1.1/v2.1.2 to silently ship 0-3 of 8 expected assets before the helper landed).

```bash
# Write release notes to a temp file
cat > /tmp/vX.Y.Z-notes.md <<'EOF'
**Release summary.**
... sub-phase scope, test plan, etc ...
EOF

# Stash any uncommitted edits (cut.mjs requires clean tree)
git stash push -u -m "wip-during-release"

# Bump + commit + tag + push + pre-create release as a DRAFT with notes
node dnd-app/scripts/release/cut.mjs X.Y.Z --notes-file /tmp/vX.Y.Z-notes.md
#   or: cd dnd-app && npm run release:cut X.Y.Z --notes-file ...

# Restore your WIP
git stash pop
```

The Release workflow (`.github/workflows/release.yml`) runs on tag push:
1. **preflight** — verifies `package.json` version matches the tag, runs `npm run lint`, `tsc --noEmit` (both web + node configs), `npm test`. Fails the whole release if anything is off.
2. **build** matrix — Windows + Linux electron-builder uploads to the pre-created (draft) release.
3. **verify-assets** — fetches the release's assets, fails if any of the 6 expected files is missing (`dnd-vtt-${ver}-setup.exe`, `.blockmap`, `dnd-vtt-${ver}-x86_64.AppImage`, `latest.yml`, `latest-linux.yml`, `install-linux.sh`).
4. **publish** — `gh release edit --draft=false --latest`, run ONLY after verify-assets passes. The release is a **draft** until here (cut.mjs creates it with `--draft`), so electron-updater — which ignores drafts — keeps the prior fully-built release as "latest" during the build window. This prevents an asset-less in-progress (or failed) release from becoming "latest" and breaking auto-update; a failed build just leaves an unpublished draft. **Wait for the build (~8-10 min) before "Check for Updates"** — but a draft won't show as an update, so the old "checked too early → up to date forever" trap is gone.

Auto-**check**-for-updates on launch defaults **ON** (`updater.ts`; check-only, never auto-downloads). Manual check: Settings → Updates / About page.

Local pre-tag sanity check: `cd dnd-app && npm run check:release` (same gates as the CI preflight). Headless boot smoke-test: `node dnd-app/scripts/smoke/headless-boot.mjs` (Linux+xvfb; verifies the built app launches without crashing).

Release titles are the bare version (`2.1.3`, no `v`); detailed notes go in `--notes-file`.

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
