# dnd-app Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dnd-app domain only.**
>
> Sibling logs:
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dnd-app` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dnd-app behavior → mirrored here AND in `BMO-SUGGESTIONS-LOG.md`. Cross-tooling rules that touch dnd-app contributors → here (and mirror in BMO file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (incl. the
> still-open residuals of the 2026-05-18 phase-plan absorption: Phase 33a backup
> migration framework, 33c ModalScaffold, 33d bundle-size CI guard — and the
> Phase 15 library-invariant observation) became the numbered phase plans under [`../dnd-app/docs/phases/`](../dnd-app/docs/phases/) (start at [`PHASE-INDEX.md`](../dnd-app/docs/phases/PHASE-INDEX.md)); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new
> dnd-app ideas below as they appear.

### Add a CI gate enforcing en/es locale key parity (check-keys.mjs validates en.json only)

**Category:** future-idea · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`scripts/i18n/check-keys.mjs` flattens `en.json` and fails when a renderer `t('literal')` call references a key missing from **en.json** — but nothing validates that `es.json` carries the same key set. Today parity is perfect (both locales flatten to 6411 leaf keys, zero diff either direction), so the gap is latent: a contributor who adds an `en` key and forgets the matching `es` key gets no CI failure — `es` users silently fall back to the en string (or the raw key if i18next fallback is disabled). Proposal: extend `check-keys.mjs` (or add `scripts/i18n/check-locale-parity.mjs` wired into `check:full` / `check:release`) to diff every non-source locale's flattened key set against `en.json` and exit non-zero on any missing/extra key. Cheap insurance that scales as more locales are added. Related: `scripts/i18n/gen-key-union.mjs`, `src/renderer/src/i18n/locales/{en,es}.json`.

### Surface release notes / "What's New" on update (auto-updater discards `releaseNotes`)

**Category:** future-idea, UX · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`src/main/updater.ts`'s `UpdateStatus` union carries only `version` for the `available` / `downloaded` states; electron-updater's `UpdateInfo.releaseNotes` is never read or forwarded to the renderer, and nothing under `src/renderer` renders `CHANGELOG.md`. So when the dismissible update prompt appears (auto-check defaults ON), the user sees a bare version number with no indication of what changed. Proposal: thread `releaseNotes` through `UpdateStatus` / the `UPDATE_STATUS` IPC and show a short "What's New" panel in the update prompt (and/or a one-time post-install changelog view sourced from `CHANGELOG.md` or the GitHub release body). Improves the upgrade decision and cuts "what did this update actually do?" friction. Related: `src/main/updater.ts`, `src/shared/ipc-channels.ts`, `CHANGELOG.md`.

### Settings export/import covers localStorage only — main-process `settings.json` (auto-update prefs) does not travel

**Category:** future-idea, portability · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`SettingsPage.tsx`'s Export Settings (~L1753) iterates `localStorage` and dumps every key into the export JSON; Import writes them back. That captures a11y, theme, keybindings, grid, dice, audio, etc. — but the auto-update preferences (`autoCheckUpdates`, `autoDownloadUpdates`, `autoRestartAfterUpdate`, `autoInstallSilent`) live in the **main process** at `userData/settings.json` (see `updater.ts > loadAutoUpdatePrefs`), so they are silently excluded. A user exporting settings to migrate to a new machine loses those four prefs with no warning. Proposal: add an IPC round-trip so export pulls `settings.json` (merged under a namespaced key) and import writes it back through the main process — or, at minimum, note in the export UI that update prefs are machine-local. Low severity (only 4 prefs, easily re-set), but it makes "Export Settings" quietly incomplete. Related: `src/renderer/src/pages/SettingsPage.tsx`, `src/main/updater.ts`.


### Slim the narration prompt's tag instructions once structured extraction is the default (PHASE-23 follow-up)

**Type:** future-idea · **Domain:** dnd-app · **Added:** 2026-06-16

PHASE-23 added opt-in two-call structured extraction (`aiDm.structuredExtraction`), but
the narration prompt keeps its `[STAT_CHANGES]`/`[DM_ACTIONS]` instructions in ALL modes
(forking the system prompt by config + regressing DM board actions, which extraction
doesn't cover, was not worth it now). Once `structuredExtraction: 'always'` is the
default AND `getRepairJsonStats().modified` stays at zero across releases, removing the
tag-emission instructions from `prompt-sections/*` + retiring `repairJson` becomes
worthwhile (retirement criteria live in `src/main/ai/AI_ACTION_CONTRACT.md`). Depends on
PHASE-27 extending the extraction verb set to cover board actions first.

*(none active)*

---

# Design gotchas (warnings for future agents)

### CSP "blocks the use of eval" DevTools Issue on map load is a harmless Pixi probe — do NOT add `'unsafe-eval'`

**Type:** design-gotcha · **Domain:** dnd-app · **Added:** 2026-06-20

The prod CSP (`src/main/index.ts`) sets `script-src 'self' plugin:` with no `'unsafe-eval'` (dev adds it; prod doesn't). On first map render PixiJS v8 runs a feature-detection probe (`unsafeEvalSupported()` in `pixi.js/lib/utils/browser/unsafeEval`) that calls `eval`, which CSP blocks — surfacing one DevTools → Issues entry in prod builds. This is expected and harmless: Pixi detects the block and falls back to its eval-free path (`pixi.js/unsafe-eval`), and the map renders fine. **Do not "fix" it by adding `'unsafe-eval'` to the prod `script-src`** — that materially weakens CSP for zero functional gain. *(QA-2026-06-19 task 16: confirmed working, no code change.)*

### Manual fog has no "disable" affordance — once "Hide All" / fog-hide enables fog, only revealing every cell hides it again

**Type:** design-gotcha · **Domain:** dnd-app · **Added:** 2026-06-20

QA-2026-06-19 task 8 fixed manual fog by flipping `fogOfWar.enabled = true` inside the `hideFog` action (the chokepoint for "Hide All" + the fog-hide brush) — new maps default to `enabled: false` and `drawFogOfWar` bails when disabled. Follow-up: there is no symmetric "Disable Fog" control. `Reveal All` reveals every cell but does NOT set `enabled = false`, so once fog is on the only way to fully clear it is to reveal the whole grid. Consider a Fog-tab toggle that surfaces/clears `fogOfWar.enabled`.

*(none other active)*

---

# Info / Observations

### [2026-06-22] Tests writing through a Windows-style mocked `app.getPath` create a stray `C:/` directory in the repo working tree

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
A literal directory named `C:` exists at `dnd-app/C:/tmp/logs/app.log` (~3.2 KB, last written 2026-06-09) — a leftover test artifact, not real source. `src/main/log.ts` builds its log path via `join(app.getPath('userData'), 'logs', 'app.log')`. Two main-process tests mock `app.getPath` to the Windows-style string `'C:/tmp'` (`src/main/ai/ai-service-web-search-approval.test.ts`, `src/main/ai/ai-service-file-read-cancel.test.ts`). On Linux, `join('C:/tmp', 'logs', 'app.log')` is treated as RELATIVE, so any log write during those tests materializes `./C:/tmp/logs/app.log` under the `dnd-app/` cwd. `C:` is NOT gitignored, so it appears as an untracked path and risks accidental commit. (`ai-handlers.test.ts:57` already notes that `'C:/tmp'` is relative on Linux.)

**Hypothesis / root cause:** test mock returns a path that is absolute on Windows but relative on POSIX; the file-logging side effect isn't redirected to a temp dir.

**Proposed fix / improvement:**
- [ ] Delete the stray `dnd-app/C:/` directory.
- [ ] Add `C:/` to `dnd-app/.gitignore` as a guard against re-committing the artifact.
- [ ] Mock `app.getPath` to an `os.tmpdir()`-based path (or stub the file logger) so test FS writes never leak into the repo.

**Related files:** `src/main/log.ts`, `src/main/ai/ai-service-web-search-approval.test.ts`, `src/main/ai/ai-service-file-read-cancel.test.ts`, `dnd-app/.gitignore`

---

### [2026-06-22] Dead code: 9 unused exports/types flagged by knip (0 external references confirmed)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/` (`npx knip`)

**Description:**
`npm run dead-code` (knip) reports the following exports as unused; each was re-verified with a repo-wide grep (including `*.test.ts(x)`) and has ZERO external references:

Functions:
- `getLocalEndpointFlavor` — `src/main/ai/ollama-client.ts:26`
- `getConfiguredContextLength` — `src/main/ai/ollama-context.ts:106`
- `estimateRecapPromptTokens` — `src/main/ai/recap-context.ts:68`
- `stopAllRegistryPollers` — `src/main/registry-bridge.ts:290`
- `routeSoloMessageToAiDm` — `src/renderer/src/services/ai-dm-routing.ts:192`
- `hasWizardDraft` — `src/renderer/src/services/campaign-wizard-draft.ts:43`

Exported types:
- `WorldExit`, `NpcOpinion`, `WorldFact` — `src/main/ai/world-state-store.ts:60/62/64`
- `AiProviderId` — `src/shared/ai-defaults.ts:16`

Each should be removed (if truly dead) or down-scoped to a non-exported local / wired into its intended caller. A couple (`routeSoloMessageToAiDm`, `stopAllRegistryPollers`) read like partially-wired features worth a check before deletion. `check:full` runs `dead-code` but does not fail on findings, so these accumulate silently.

**Proposed fix / improvement:**
- [ ] For each symbol, confirm it isn't reserved for an in-flight feature, then delete or un-export.
- [ ] Consider making `npm run dead-code` fail CI on new findings once the backlog is clear.

**Related files:** `src/main/ai/ollama-client.ts`, `src/main/ai/ollama-context.ts`, `src/main/ai/recap-context.ts`, `src/main/registry-bridge.ts`, `src/renderer/src/services/ai-dm-routing.ts`, `src/renderer/src/services/campaign-wizard-draft.ts`, `src/main/ai/world-state-store.ts`, `src/shared/ai-defaults.ts`

---

### [2026-06-22] Bundle visualizer auto-opens a browser tab on every build (`open: true`) and leaves a stale 1.1 MB `bundle-stats.html` at repo root

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`electron.vite.config.ts:17` configures rollup-plugin-visualizer as `visualizer({ open: true, filename: 'bundle-stats.html', gzipSize: true })`. `open: true` pops open a browser tab on builds that include the visualizer — noisy for CI/headless/automated builds. The generated `bundle-stats.html` (~1.1 MB, last built 2026-04-24) sits at the `dnd-app/` root; it is correctly gitignored (`.gitignore:9`) so it won't be committed, but it is a stale leftover artifact in the working tree. Consider gating the visualizer behind an env flag (e.g. only when `ANALYZE=1`) and/or `open: false`, and writing the report under a build/output dir rather than the project root.

**Proposed fix / improvement:**
- [ ] Set `open: false` (or gate the whole visualizer behind `process.env.ANALYZE`).
- [ ] Optionally relocate the report out of the project root.

**Related files:** `electron.vite.config.ts`, `dnd-app/.gitignore`

---

### `/calendar` route (real-world session-scheduling calendar) is orphaned — no main-menu entry or in-app navigation

**Type:** observation · **Domain:** dnd-app · **Added:** 2026-06-20

`CalendarPage` (route `/calendar`) is a real-world session scheduler distinct from the in-game fantasy calendar (which lives in the campaign wizard + in-game DM modal). Nothing in the app navigates to `/calendar` and the main menu has no Calendar item, so it is reachable only by typing the URL. Wiring it into the menu is a product decision (the page has no obvious backend scheduling wiring), so it was left as-is and the QA spec (`dnd-app/docs/phases/QA/instructions.md` §4.1/§4.3b) was reconciled to note the orphaned state. *(QA-2026-06-19 task 18.)*

*(none active)*

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
