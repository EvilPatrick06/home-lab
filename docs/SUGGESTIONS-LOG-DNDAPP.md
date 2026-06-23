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

### [2026-06-22] Inconsistent casing in the `dnd-app/docs/phases/` tree (`completed` vs `QA/Completed`, `INSTRUCTIONS.md` vs `QA/instructions.md`)

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
Parallel concepts in the same phases doc tree are named with different casing, which is a small but real organization smell (and a portability hazard on case-insensitive filesystems if a sibling dir is ever added):

- `dnd-app/docs/phases/completed/` (lowercase `c`) vs `dnd-app/docs/phases/QA/Completed/` (capital `C`) — the two "completed archive" folders disagree.
- `dnd-app/docs/phases/INSTRUCTIONS.md` (uppercase) vs `dnd-app/docs/phases/QA/instructions.md` (lowercase) — the two instruction files disagree.

Pick one convention and apply it to both. Lowercase-kebab (`completed/`, `instructions.md`) is the more common choice in this repo; whichever is picked, the `INSTRUCTIONS.md` references and `PHASE-INDEX.md` "move to `completed/`" wording should match.

**Proposed fix / improvement:**
- [ ] Rename `docs/phases/QA/Completed/` -> `docs/phases/QA/completed/` (or rename the top-level one to match — pick one).
- [ ] Rename `docs/phases/QA/instructions.md` -> `INSTRUCTIONS.md` (or the top-level one to lowercase — pick one) and update any references.
- [ ] Use `git mv` so history is preserved; grep the phases docs for the old paths afterward.

**Related files:** `dnd-app/docs/phases/completed/`, `dnd-app/docs/phases/QA/Completed/`, `dnd-app/docs/phases/INSTRUCTIONS.md`, `dnd-app/docs/phases/QA/instructions.md`, `dnd-app/docs/phases/PHASE-INDEX.md`

---

### [2026-06-22] No user-facing export/import of a character or campaign to a portable file

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (storage + renderer survey for data-portability features)

**Description:**
The app can persist characters/campaigns locally (`src/main/storage/*`), sync via cloud (`cloud:sync-backup`), and import books (`book:import`), and `SettingsPage.tsx` already has an Export/Import Settings flow — but there is no equivalent "export this character (or campaign) to a `.json` file" / "import character from file" action. A user who wants to share a built character with a friend, move one character between machines without enabling cloud sync, or keep a manual off-app backup of a single character has no supported path. Grep for `exportCharacter` / `downloadJson` / `exportToJson` / a save-file dialog around character data returns nothing in the renderer or `src/main` (only the JS `export` keyword and the settings exporter).

**Proposed fix / improvement:**
- [ ] Add a main-process IPC (`character:export-file` / `character:import-file`) that serializes the stored character (already a JSON-shaped, schema-versioned object — reuse `migrations.ts` on import) through a `showSaveDialog` / `showOpenDialog`.
- [ ] Add an "Export…" / "Import…" affordance in the character list / sheet toolbar (and optionally the campaign list).
- [ ] On import, run the existing migration pipeline so older-schema files upgrade cleanly, and validate against the 5e schema before committing.

**Related files:** `src/main/storage/character-storage.ts`, `src/main/storage/migrations.ts`, `src/main/ipc/index.ts`, `src/renderer/src/pages/SettingsPage.tsx` (existing settings-export pattern to mirror)

**Related entries:** see "Settings export/import covers localStorage only…" (same file) — a character/campaign exporter is a different, additive feature.

### [2026-06-22] No global command palette / quick-action launcher (Ctrl+K) for the ~92 modals and actions
### [2026-06-22] No in-app way to locate, open, or export the app log for bug reports

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (renderer UX/navigation survey)

**Description:**
There are ~92 modal components under `components/game/modals/` plus many overlays, DM tools, and a `ShortcutReferenceModal`, but no fuzzy command-palette / quick-action launcher (no `cmdk`, no `palette`/`action launcher`/`quick-switch` handler anywhere in the renderer). Reaching a given tool means knowing its menu/toolbar location or its specific hotkey. A single Ctrl/Cmd-K palette that fuzzy-searches "open X modal / run Y action / jump to Z" would cut navigation depth dramatically for both DMs and players and would pair naturally with the existing keybinding system (`use-accessibility-store` already models `customKeybindings`).

**Proposed fix / improvement:**
- [ ] Add a palette component (own modal) registered on a global Ctrl/Cmd-K, listing actions sourced from the same registry that drives the existing shortcut/keybinding map so the two stay in sync.
- [ ] Seed it with "open modal" entries (derive from the modal-group registries) plus high-frequency actions (roll, end turn, open compendium, search library).
- [ ] Respect `customKeybindings` and screen-reader mode; ensure full keyboard operability and focus return on close.

**Related files:** `src/renderer/src/components/game/modals/utility/ShortcutReferenceModal.tsx`, `src/renderer/src/components/game/modal-groups/*`, `src/renderer/src/stores/use-accessibility-store.ts`

### [2026-06-22] No first-run guided onboarding / tour for new users (only targeted Ollama + screen-reader prompts)

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (first-run / onboarding survey)

**Description:**
First-run UX is limited to two narrow, single-purpose prompts wired into `App.tsx`: `OllamaFirstRunPrompt` (local-LLM setup) and `ScreenReaderPrompt` (a11y mode). There is no general guided tour or "getting started" flow introducing the core loop (create/import a character → create or join a campaign → the game-table layout, dice, map, hotbar). A new user lands in a feature-dense Electron VTT with no orientation. Grep finds no `onboarding` / `tutorial` / `walkthrough` / `hasSeenWelcome` flag.

**Proposed fix / improvement:**
- [ ] Add a dismissible, resumable first-run tour (persist a `hasCompletedOnboarding` flag alongside the other a11y/settings keys) that highlights the 4-5 primary entry points.
- [ ] Make it re-launchable from Settings/Help so it is not a one-shot, and skippable in one click for returning users.
- [ ] Honor `reducedMotion` (no auto-advancing animated spotlights when set) and keep every step keyboard-navigable.

**Related files:** `src/renderer/src/App.tsx`, `src/renderer/src/components/ui/OllamaFirstRunPrompt.tsx`, `src/renderer/src/components/ui/ScreenReaderPrompt.tsx`, `src/renderer/src/stores/use-accessibility-store.ts`
- **During:** dnd-app tree review (main-process logging + crash handling)

**Description:**
`src/main/log.ts` writes a rotating log to `userData/logs/app.log` (5 MB × 3), and the fatal-error handler in `src/main/index.ts` (`handleFatal`) shows a `dialog.showErrorBox` that says only "A crash log was written" — with no path and no button (`showErrorBox` supports title + message only). A by-name grep across `src/` finds **zero** uses of `shell.openPath` / `shell.showItemInFolder`, and `SettingsPage.tsx` has no logs section, so there is no affordance anywhere — neither in the crash dialog nor in Settings — for a user to find, open, or export the log file. When a non-technical user hits a crash or a weird bug, they cannot produce the one artifact that would let a maintainer diagnose it without knowing the per-OS `userData` path by heart.

**Proposed fix / improvement:**
- [ ] Add an IPC (e.g. `LOG_OPEN_FOLDER`) that calls `shell.showItemInFolder(logPath)` / `shell.openPath(getLogDir())`, surfaced as an "Open log folder" button in a Settings > Diagnostics/About section.
- [ ] Optionally add "Export logs" (zip `app.log*` to a user-chosen path) for easy bug-report attachment.
- [ ] Include the resolved log path text in the fatal `showErrorBox` message so a crashed user at least knows where to look.

**Related files:** `src/main/log.ts`, `src/main/index.ts`, `src/renderer/src/pages/SettingsPage.tsx`, `src/shared/ipc-channels.ts`

### [2026-06-22] macOS target is configured but never built or shipped (no `macos-latest` in the release matrix)

- **Category:** portability, future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (release workflow vs package.json build config)

**Description:**
`package.json` defines a full mac build path (`build:mac`, `release:mac`, and a `build.mac` electron-builder block producing DMG + ZIP) and the README documents macOS as a supported-in-principle target, but `.github/workflows/release.yml`'s build matrix is only `windows-latest` + `ubuntu-latest` — zero `macos`/`dmg` references in the workflow. So the mac config is dormant: it is never exercised in CI and no macOS artifact is ever published. The result is config that can silently rot (electron-builder mac options drift untested) and a documented platform users cannot actually download. electron-builder cannot produce signed/notarized mac artifacts off a non-mac runner, so closing this needs a `macos-latest` matrix leg, not just a flag.

**Proposed fix / improvement:**
- [ ] Add a `macos-latest` leg to the `build` matrix in `release.yml` (even unsigned, to start) so the mac config is at least built and smoke-tested each release.
- [ ] Decide on signing/notarization (Developer ID + notarytool) before publishing mac artifacts, or clearly mark mac builds as unsigned in the release notes.
- [ ] If macOS support is deferred indefinitely, note that explicitly next to the `build.mac` config so contributors know it is intentionally dormant.

**Related files:** `.github/workflows/release.yml`, `dnd-app/package.json`, `dnd-app/README.md`

### [2026-06-22] `SettingsPage.tsx` is a ~1,950-LOC god component — split into per-section panels

- **Category:** debt, future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (largest hand-written source files)

**Description:**
`src/renderer/src/pages/SettingsPage.tsx` is 1,946 LOC — the single largest hand-authored source file in the app (excluding the generated `i18n/generated-keys.ts`). It bundles every settings domain into one component: accessibility, theme, keybindings, grid, dice, audio, auto-update prefs, and the export/import logic (see the separate export-prefs entry below). A file this size is hard to review, easy to merge-conflict on (every settings tweak touches the same file), and obscures which state each section owns. The app already presents a per-section UI; extracting each section into its own `settings/<Section>Panel.tsx` (driven by a small tab registry) would shrink the parent to a router shell and make each panel independently testable.

**Proposed fix / improvement:**
- [ ] Extract each settings section into `pages/settings/<Section>Panel.tsx`, leaving `SettingsPage.tsx` as a tab host.
- [ ] Co-locate each panel's local state/handlers with its panel; share only cross-cutting state via the existing stores.
- [ ] Add focused unit tests per panel (a 1,946-LOC component is effectively untestable in isolation today).

**Related files:** `src/renderer/src/pages/SettingsPage.tsx`

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

*(Design gotchas + standing observations are now documented in [`dnd-app/docs/DESIGN-CONSTRAINTS.md`](../dnd-app/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

---

# Info / Observations

---

---

---

---

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
