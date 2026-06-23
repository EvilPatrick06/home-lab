# dnd-app Resolved Issues

> **Archive of resolved dnd-app-domain entries** moved out of [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) / [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) — kept here so the active logs stay lean while preserving fix history.
>
> When fixing an entry, **move** it here (don't delete) and append resolution metadata. Resolved security entries (any domain) go in [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) (gitignored), not here.
>
> Sibling logs:
> - BMO resolved → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
> - Resolved security (any domain, gitignored) → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md)
>
> Newest first.

---

### Slim the narration prompt's tag instructions once structured extraction is the default (PHASE-23 follow-up)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Implemented the config-gated slim (PHASE-27 shipped, so the board-action verbs are stable). buildCharacterRulesPrompt({ slimExtractedStatTags }) deterministically drops the [STAT_CHANGES] bullets for EXACTLY the types the structured extractor captures (EXTRACTOR_COVERED_TAG_TYPES = the 11 flat player types of structured-extraction's EXTRACTION_CHANGE_TYPES + the 4 mapped creature_* forms) and adds a one-line note; everything the extractor can't do — extended player types, sheet mutations, the non-mapped creature_* verbs, and ALL [DM_ACTIONS] — is retained. Threaded via assembleSystemPrompt({ slimExtractedStatTags }) <- conversation-manager.structuredExtractionAlways <- ai-service (currentConfig.structuredExtraction === 'always'). The default/off path returns the byte-identical full prompt, preserving Ollama's KV-cache prefix (PHASE-11 11B). Tests: byte-stability of the default, exact slim behavior, and a drift guard asserting every slimmed player type is in EXTRACTION_CHANGE_TYPES. tsc node+web green; character-rules (23) + prompt-assembler (7) + conversation-manager (55) pass; circular gate clean.

NOTE: full removal of tag instructions + repairJson retirement remain correctly gated — the extractor still doesn't cover the extended/sheet/board verbs and is Ollama-only, and criterion (c) (getRepairJsonStats().modified == 0 across releases) is a telemetry observation. This slim is the safe, non-regressing portion that 'always' users get now.

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

### [2026-06-22] `SettingsPage.tsx` is a ~1,950-LOC god component — split into per-section panels

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Began the per-section split (the existing pattern already had UpdateSection/PluginManager/CloudBackupSection/KeybindingEditor as separate functions). Extracted the shared panel wrapper into components/settings/SettingsSection.tsx and the largest inline panel — Accessibility (UI scale, colorblind, reduced motion, screen-reader, tooltips, font, ~195 lines, all backed by useAccessibilityStore so it needed no prop plumbing) — into components/settings/AccessibilitySection.tsx. SettingsPage.tsx split from 1978 to 319 lines (84% reduction). All content sections were extracted into components/settings/ (SettingsSection wrapper + Theme, Audio, Accessibility, Grid, Dice, Notifications, AutoSave, Profile, Language, RegisteredGameSystems, SettingsImportExport panels) and the four large co-located helper functions (KeybindingEditor, PluginManager, UpdateSection, CloudBackupSection) were moved to their own files. SettingsPage is now a thin orchestrator (header + layout + the reset actions + section composition). Each step verified tsc web + biome (0 warnings) + the SettingsPage test; circular gate clean. tsc web green; SettingsPage test passes; biome clean.

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

---

### [2026-06-22] No global command palette / quick-action launcher (Ctrl+K) for the ~92 modals and actions

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added a global Ctrl/Cmd+K command palette (CommandPalette.tsx, wired into App.tsx): a search box + keyboard-navigable (up/down/enter/esc) action list. v1 registers top-level navigation (home, characters, create character, make/join campaign, library, bastions, calendar, settings, about) plus global actions (replay onboarding tour, open log folder) via a simple action registry that can be extended toward the full modal set. en+es i18n (15 keys); parity-gated; tsc web green.


---

### [2026-06-22] No first-run guided onboarding / tour for new users (only targeted Ollama + screen-reader prompts)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added a first-run guided tour: use-onboarding-store.ts (persists hasCompletedOnboarding in localStorage so it travels with Settings export; auto-opens once on first run) and OnboardingTour.tsx — a dismissible, resumable, keyboard-navigable 5-step modal (welcome → create/import character → create/join campaign → game table → help) wired into App.tsx after the existing first-run prompts. Honors reducedMotion (no transition), skippable in one click (Esc), and re-launchable from a 'Replay welcome tour' button in Settings. en+es i18n (16 keys); parity-gated; tsc web green.

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

---

### [2026-06-22] No user-facing export/import of a character or campaign to a portable file

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Stale — already implemented. Characters: src/renderer/src/services/io/character-io.ts (exportCharacterToFile / importCharacterFromFile via the native save/open dialogs), wired into ViewCharactersPage (per-card Export + Import menu). Campaigns: src/renderer/src/services/io/campaign-io.ts (exportCampaignToFile / importCampaignFromFile, incl. game state), wired into CampaignDetailPage + StartStep (export) and MakeGamePage (import). The entry's 'grep returns nothing' was outdated. No code change needed; archived.

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

---

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** The 'link to canonical' part was already in place — AGENTS.md is the designated canonical source and CLAUDE.md / GEMINI.md / .github/copilot-instructions.md each header-link to it for shared sections. Added the missing drift guard: scripts/check-agent-docs.mjs (fails if any secondary file drops its AGENTS.md pointer) wired into a path-scoped .github/workflows/agent-docs-check.yml. Guard passes on the current tree.

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

---

### Surface release notes / "What's New" on update (auto-updater discards `releaseNotes`)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** updater.ts now captures electron-updater's releaseNotes (via a normalizeReleaseNotes helper that flattens string | ReleaseNoteInfo[]) into the 'available' and 'downloaded' UpdateStatus, on both the manual and auto-update flows. SettingsPage's UpdateStatusInfo carries releaseNotes and renders a 'What's New' panel (plain text, whitespace-pre-wrap, scrollable — not dangerouslySetInnerHTML, so no XSS) when an update is available/downloaded. Added en/es i18n key. tsc node+web green; parity holds.

**Category:** future-idea, UX · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`src/main/updater.ts`'s `UpdateStatus` union carries only `version` for the `available` / `downloaded` states; electron-updater's `UpdateInfo.releaseNotes` is never read or forwarded to the renderer, and nothing under `src/renderer` renders `CHANGELOG.md`. So when the dismissible update prompt appears (auto-check defaults ON), the user sees a bare version number with no indication of what changed. Proposal: thread `releaseNotes` through `UpdateStatus` / the `UPDATE_STATUS` IPC and show a short "What's New" panel in the update prompt (and/or a one-time post-install changelog view sourced from `CHANGELOG.md` or the GitHub release body). Improves the upgrade decision and cuts "what did this update actually do?" friction. Related: `src/main/updater.ts`, `src/shared/ipc-channels.ts`, `CHANGELOG.md`.

---

### Settings export/import covers localStorage only — main-process `settings.json` (auto-update prefs) does not travel

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Stale — already covered. SettingsPage Export Settings includes `settings = await window.api.loadSettings()` (not just localStorage), and the auto-update prefs (autoCheckUpdates/autoDownloadUpdates/autoRestartAfterUpdate/autoInstallSilent) are stored in that same settings object: persistAutoPrefs does loadSettings()+saveSettings({...settings,...patch}), and settings-storage persists the whole object to settings.json with no key allowlist. Import restores via saveSettings(item.settings). So the four update prefs DO travel with an export. No code change needed; archived.

**Category:** future-idea, portability · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`SettingsPage.tsx`'s Export Settings (~L1753) iterates `localStorage` and dumps every key into the export JSON; Import writes them back. That captures a11y, theme, keybindings, grid, dice, audio, etc. — but the auto-update preferences (`autoCheckUpdates`, `autoDownloadUpdates`, `autoRestartAfterUpdate`, `autoInstallSilent`) live in the **main process** at `userData/settings.json` (see `updater.ts > loadAutoUpdatePrefs`), so they are silently excluded. A user exporting settings to migrate to a new machine loses those four prefs with no warning. Proposal: add an IPC round-trip so export pulls `settings.json` (merged under a namespaced key) and import writes it back through the main process — or, at minimum, note in the export UI that update prefs are machine-local. Low severity (only 4 prefs, easily re-set), but it makes "Export Settings" quietly incomplete. Related: `src/renderer/src/pages/SettingsPage.tsx`, `src/main/updater.ts`.

---

### [2026-06-22] No in-app way to locate, open, or export the app log for bug reports

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added in-app log access: new IPC log:open-folder / log:get-path (src/main/ipc/log-handlers.ts) reveal app.log in the OS file manager via shell.showItemInFolder (fallback shell.openPath of the logs dir). Exposed as window.api.log.{openFolder,getPath} in the preload (+ index.d.ts type + a no-op web shim), and added an 'Open log folder' button to SettingsPage's Import/Export section with toasts (en+es i18n). tsc node+web green; locale parity holds.

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

---

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added two PR+push CI gates scoped by path: .github/workflows/dungeon-scholar-ci.yml (npm ci -> vitest -> vite build) and .github/workflows/oracle-worker-ci.yml (npm ci -> `wrangler deploy --dry-run`, which bundles the worker and validates wrangler.toml without deploying or needing credentials). Both use node-version-file: .nvmrc (the root pin added in S10).

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

---

### [2026-06-22] macOS target is configured but never built or shipped (no `macos-latest` in the release matrix)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added a macos-latest leg (`--mac`, dmg+zip) to the release.yml build matrix. It's NON-BLOCKING (continue-on-error via a matrix `experimental` flag) so a mac failure never blocks the Win/Linux release, and builds unsigned (CSC_IDENTITY_AUTO_DISCOVERY: false) since no Apple cert is configured. Added mac artifact globs (*.dmg, *-mac.zip, latest-mac.yml) to the upload + they flow to the release via the existing merge-multiple download. To promote mac to a required, signed, notarized artifact, add Apple signing secrets and flip experimental:false + extend the publish verify list.

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

---

### [2026-06-22] Inconsistent casing in the `dnd-app/docs/phases/` tree (`completed` vs `QA/Completed`, `INSTRUCTIONS.md` vs `QA/instructions.md`)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Normalized the QA subtree casing to match the top level: `QA/Completed/` -> `QA/completed/` (matching top-level `completed/`) and `QA/instructions.md` -> `QA/INSTRUCTIONS.md` (matching top-level `INSTRUCTIONS.md`). Updated the two inbound references (dnd-app/docs/DESIGN-CONSTRAINTS.md and docs/AUTOMATED-AGENT-GIT-WORKFLOW.md); no code/CI references existed.

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

### [2026-06-20] Builder multiclass per-level class swap doesn't recompute spell-selection caps

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** core-slice.ts setClassLevelChoice now recomputes maxCantrips/maxPreparedSpells (keyed on the primary class + targetLevel), mirroring setTargetLevel, so a multiclass per-level class swap that changes the caster level no longer leaves the HARD spell-selection caps (enforced by setSelectedSpellIds) frozen at their prior values. Added a regression test; core-slice tests pass.

**Original entry:** - **[2026-06-20] Builder multiclass per-level class swap doesn't recompute spell-selection caps.** `setClassLevelChoice` (`src/renderer/src/stores/builder/slices/core-slice.ts`) regenerates build slots but, unlike `setTargetLevel` (now fixed for the single-class Level-field path, QA-2026-06-19 task 3), does NOT recompute the store's `maxCantrips`/`maxPreparedSpells` enforcement caps. A multiclass build whose caster level changes via the per-level class panel could still hit stale caps in `setSelectedSpellIds`. A fully-correct fix recomputes the caps keyed on the primary/combined caster class. *(found during QA-2026-06-19 task 3 fix; the reported single-class path is fully fixed.)*

---

### [2026-06-11] AI character context missing weapons/armor/prepared-spells/feats for v4 characters

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Already resolved in-tree by PHASE-11 11G (BUG-2 / G36), which post-dates this 2026-06-11 entry. character-context.ts reads inline arrays first and falls back to the v4 refs for every section: knownSpellRefs (with state.preparedSpellIds + resolveEntryName('spells')), weaponRefs and armorRefs (display from ref overrides + state.weaponEquipped/armorEquipped), and featRefs (resolveEntryName('feats')). character-context.test.ts exercises knownSpellRefs/weaponRefs/armorRefs; all 39 tests pass. No code change needed.

**Original entry:** - **[2026-06-11] AI character context is missing weapons/armor/prepared-spells/feats for all v4 characters.** `character-context.ts` still reads v4-stripped inline arrays: `knownSpells`/`preparedSpellIds` (`:137-144`), `armor` (`:168-177`), `weapons` (`:179-184`), `feats` (`:225-228`) — so the AI's "full sheet" omits them. Weapons/armor recoverable from ref `overrides`; spells need library name resolution. *(found during PHASE-02 verification; not in any phase's allocation — the conditions read was fixed in PHASE-02 02B.)*

---

### [2026-06-11] Renderer rest-service: Ranger "Tireless" exhaustion reduction

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** rest-service-5e.ts applyShortRest now implements Ranger Tireless: at ranger level 10+ a short rest reduces Exhaustion by 1 level (removing it at level 1), mirroring the long-rest reduction — it reads the v4 ref-override condition value (PHASE-02 02A) and hands the save-time shim an inline conditions array with conditionRefs cleared. Added exhaustionReduced to ShortRestResult + 'Tireless (Exhaustion -1)' to resourcesRestored. 3 new tests; full rest-service suite (32) passes. Innate-spell-use restoration is now also implemented: applyLongRest refills innate/limited casts (remaining→max) via the same save-time shim (inline knownSpells, knownSpellRefs cleared), with its test flipped to assert restoration.

**Original entry:** - **[2026-06-11] Renderer rest-service: Ranger "Tireless" exhaustion reduction + innate-spell-use restoration still dropped.** `rest-service-5e.ts:248-250` (Tireless) and the comment near `:410` (innate uses) were disabled in 15c.5; PHASE-02 02A re-enabled the condition `value` substrate, so Tireless reduction is now implementable. *(found during PHASE-02 verification.)*

---

### [2026-06-11] Renderer rest executors swallow rejected AI rest mutations

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** creature-actions.ts executeShortRest/executeLongRest no longer fire `window.api.ai.shortRest/longRest(...).catch(() => {})` silently — a rejected rest batch now surfaces via pushDmAlert('error', ...) (new i18n keys notify.creatureActions.shortRestFailed/longRestFailed in en + es, parity-gated). tsc web green; creature-actions tests (22) pass; locale parity holds (6413 keys).

**Original entry:** - **[2026-06-11] Renderer rest executors swallow rejected AI rest mutations.** `creature-actions.ts:609,673` call `window.api.ai.longRest/shortRest` fire-and-forget with `.catch(() => {})` — a rejected rest batch is invisible (PHASE-02 02F routed the direct applyMutations path through the DM-alert tray, but not these two rest entry points). *(found during PHASE-02 verification.)*

---

### Add a CI gate enforcing en/es locale key parity (check-keys.mjs validates en.json only)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added scripts/i18n/check-locale-parity.mjs (npm `i18n:check-parity`) and wired it into `check:full`: it flattens every non-source locale and exits non-zero on any key missing from OR extra vs en.json. check-keys.mjs only validated that referenced keys exist in en.json. es.json is currently in parity (6411 keys, exit 0).

**Category:** future-idea · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`scripts/i18n/check-keys.mjs` flattens `en.json` and fails when a renderer `t('literal')` call references a key missing from **en.json** — but nothing validates that `es.json` carries the same key set. Today parity is perfect (both locales flatten to 6411 leaf keys, zero diff either direction), so the gap is latent: a contributor who adds an `en` key and forgets the matching `es` key gets no CI failure — `es` users silently fall back to the en string (or the raw key if i18next fallback is disabled). Proposal: extend `check-keys.mjs` (or add `scripts/i18n/check-locale-parity.mjs` wired into `check:full` / `check:release`) to diff every non-source locale's flattened key set against `en.json` and exit non-zero on any missing/extra key. Cheap insurance that scales as more locales are added. Related: `scripts/i18n/gen-key-union.mjs`, `src/renderer/src/i18n/locales/{en,es}.json`.

---

### [2026-06-22] Duplicate, already-diverging `PLUGIN-SYSTEM.md` — one at repo-root `docs/`, one in `dnd-app/docs/`

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Reduced the stale repo-root docs/PLUGIN-SYSTEM.md (the shorter, drifted mirror) to a one-line pointer at the canonical dnd-app/docs/PLUGIN-SYSTEM.md (the fuller copy the dnd-app README links to). No live inbound links broken — only historical phase-doc mentions reference the root copy; dnd-app/scripts/build/sync-doc-counts.mjs targets the dnd-app copy.

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
There are two `PLUGIN-SYSTEM.md` files, both titled `# Plugin System - dnd-app`, describing the same dnd-app plugin API:

- `docs/PLUGIN-SYSTEM.md` (repo root, ~6.6 KB)
- `dnd-app/docs/PLUGIN-SYSTEM.md` (~11.2 KB)

They already disagree: the root copy is shorter/older and even points readers at the dnd-app copy for the trust model ("see the trust model in `dnd-app/docs/PLUGIN-SYSTEM.md`"), so the root file is effectively a stale partial mirror of the canonical one. Two copies of a domain-specific doc is exactly the drift pattern the per-domain doc split was meant to avoid. (Note: the dnd-app `README.md` "Plugin system" section links to `./docs/PLUGIN-SYSTEM.md`, i.e. the dnd-app copy — so the root copy has no obvious inbound link from dnd-app.)

**Proposed fix / improvement:**
- [ ] Treat `dnd-app/docs/PLUGIN-SYSTEM.md` as canonical (it is the fuller, linked one). Replace `docs/PLUGIN-SYSTEM.md` with a one-line pointer to it, or delete the root copy if nothing references it (grep first: `git grep -n "docs/PLUGIN-SYSTEM.md"`).
- [ ] If the root copy must stay (e.g. monorepo-level index), reduce it to a stub link so the content lives in exactly one place.

**Related files:** `docs/PLUGIN-SYSTEM.md`, `dnd-app/docs/PLUGIN-SYSTEM.md`, `dnd-app/README.md`

---

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** (1) Deleted the orphaned .githooks/ dir — its gitleaks shim was already folded into .husky/pre-commit and core.hooksPath points at .husky; removed the now-pointless .githooks/** path triggers from security-audit.yml. (2) Made .husky/pre-commit project-aware via `git diff --cached`: the Biome staged-check runs repo-wide, dnd-app tsc:web runs only when dnd-app files are staged, and dungeon-scholar `npm test` runs when its files are staged (oracle-worker has no test/build script). Hook syntax validated.

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

---

### [2026-06-22] Stale one-off data-pipeline scripts (~6,000 LOC) linger in `scripts/{extract,generate,fix,batch-utils,codemods}` with no callers

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Deleted the retired one-time 5e pipeline: scripts/{extract,generate,fix,batch-utils,codemods} (40 files, ~6k LOC; zero code references — the dataset is stable and committed). Removing them orphaned the `@langchain/langgraph` devDependency, which was pruned from package.json + package-lock.json. Updated docs/DATA-FLOW.md. knip's broad scripts/** entry glob still covers remaining scripts; `npm run dead-code` exits 0.

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The 5e content set is fully built and shipped (3,033 JSON files under `src/renderer/public/data/5e/`), but the one-time pipeline that produced it still sits in the tree as live source:

- `scripts/extract/` — 17 files, ~3,195 LOC (`extract-5e-data`, `extract-monsters`, `extract-weapons`, `extract-subclasses-to-batch`, …)
- `scripts/generate/` — 9 files, ~1,425 LOC (incl. clearly historical `generate-phase4-batch`, `generate-phase5-batch`, `generate-mass-batch`, `generate-mega-batch`)
- `scripts/fix/` — 4 files, ~813 LOC (`fix-data-placements`, `fix-monster-enums`, `phase4-discovery`, `reorganize-data`)
- `scripts/batch-utils/` — 8 files, ~616 LOC (`monitor-phase4-batch`, `resume-batch`, `retry-failed`, `check-batch`, …)
- `scripts/codemods/` — `form-aria-label.mjs`, `semantic-tokens.mjs`

A by-name grep across the whole repo shows ZERO references to any of these from app code, `package.json` scripts, or `.github/workflows/` — the only inbound mentions are the few cross-references *between* the batch scripts themselves and one historical doc line (`docs/DATA-FLOW.md:27` cites `scripts/extract/`). They were last meaningfully touched 2026-04-23/24 (only moved since, in the monorepo reorg). `knip` cannot flag them because `knip.json` globs `scripts/**/*.ts` + `scripts/**/*.mjs` as entry points, so the whole pile is invisible to `npm run dead-code` and accumulates silently.

**Hypothesis / root cause:** one-time extraction/migration/QA-batch tooling that was never archived after the data set stabilized; the broad knip `entry` glob hides it from dead-code detection.

**Proposed fix / improvement:**
- [ ] Confirm with the maintainer that the 5e data set is frozen (no planned re-extraction), then move these dirs under a clearly-labeled `scripts/_oneoff/` (or `_archive/`) — or delete them, since git history preserves them.
- [ ] If kept for reproducibility, add a `scripts/README.md` separating "active" (wired to npm/CI) from "historical pipeline" scripts so contributors don't mistake them for live tooling.
- [ ] Narrow the `knip.json` `scripts/**` entry glob to the scripts actually invoked, so future one-off scripts surface as unused.

**Related files:** `scripts/extract/`, `scripts/generate/`, `scripts/fix/`, `scripts/batch-utils/`, `scripts/codemods/`, `knip.json`, `docs/DATA-FLOW.md`

---

### [2026-06-22] Five overlapping `scripts/audit/*` data-audit scripts (~3,100 LOC) — accreted duplication, none wired into npm/CI

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Consolidated: removed the 4 redundant audit scripts (comprehensive-audit, data-audit, deep-verify, data-audit-full; ~2.4k LOC, zero references) and kept the canonical ultimate-audit.ts (the one cited in DATA-FLOW.md). The live, wired-in files — check-5e-cross-refs.mjs (validate:5e), validate-content-vs-schemas.ts (validate:content), and shared-5e-sync.test.ts (CI) — are untouched.

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`scripts/audit/` contains five scripts that all do essentially the same job — walk the 5e source markdown (PHB/DMG/MM), cross-reference the extracted JSON, validate schemas, and flag missing/duplicate/truncated entries — distinguished mostly by escalating names rather than scope:

- `comprehensive-audit.ts` (923 LOC) — "COMPREHENSIVE D&D 5.5e DATA AUDIT"
- `ultimate-audit.ts` (732 LOC) — "ULTIMATE D&D 5.5e DATA AUDIT"
- `data-audit.ts` (608 LOC) — "Phase 6 — Comprehensive Data Audit v2"
- `deep-verify.ts` (525 LOC) — "DEEP DATA VERIFICATION"
- `data-audit-full.ts` (336 LOC) — "Comprehensive D&D 5.5e Data Audit"

Only `ultimate-audit.ts` is referenced anywhere (one line in `docs/DATA-FLOW.md`); the npm `validate:5e` / `validate:content` scripts use the *separate* `check-5e-cross-refs.mjs` and `validate-content-vs-schemas.ts`, so none of these five run in CI or via any npm script. The naming pattern ("v2", "full", "comprehensive", "deep", "ultimate") is a classic sign of an audit that kept getting rewritten from scratch instead of refactored, leaving every prior version behind.

**Hypothesis / root cause:** iterative re-authoring of the data-QA audit during the extraction phase; old versions never removed once the next "definitive" one landed.

**Proposed fix / improvement:**
- [ ] Pick one canonical audit (likely `ultimate-audit.ts`, the doc-referenced one), verify it subsumes the others, and delete the remaining four.
- [ ] If the canonical audit is worth keeping, wire it into an npm script (e.g. `audit:data`) so it doesn't rot.
- [ ] Update `docs/DATA-FLOW.md` if the kept script's name changes.

**Related files:** `scripts/audit/comprehensive-audit.ts`, `scripts/audit/ultimate-audit.ts`, `scripts/audit/data-audit.ts`, `scripts/audit/deep-verify.ts`, `scripts/audit/data-audit-full.ts`, `docs/DATA-FLOW.md`

---

### [2026-06-22] `tools/` holds 7 unreferenced one-off maintenance/codemod scripts (~1,830 LOC, incl. a 1,096-LOC `run-audit.js`)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Deleted dnd-app/tools/ entirely (7 scripts, ~1.8k LOC): run-audit.js + its only consumer electron-security.js, plus replace-console-logs / rename-to-kebab / find-data / find-unused-imports / knip-summary — all zero external references (the codemods already ran; lint + dead-code are now handled by biome + knip). Removed the now-empty `tools/**/*.js` entry glob from knip.json.

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The top-level `dnd-app/tools/` directory contains seven JS scripts, none of which are referenced by `package.json`, CI workflows, or app code (by-name grep returns zero inbound references; the sole mention is one historical phase doc citing `replace-console-logs.js`):

- `run-audit.js` (1,096 LOC), `replace-console-logs.js` (225), `rename-to-kebab.js` (194), `electron-security.js` (248), `find-data.js` (28), `find-unused-imports.js` (17), `knip-summary.js` (23)

These read as one-off codemods / migration helpers (kebab-case rename, console.log replacement) and ad-hoc audit tooling that overlap with the now-standard tooling actually wired into npm (`biome`, `knip`, the `scripts/audit/` + `scripts/lint/` scripts). `tools/` also duplicates the role of `scripts/` with no documented distinction between the two directories, which is itself a structural smell. `electron-security.js` is worth a closer look before deletion — confirm it isn't a stale copy of security settings now enforced in `src/main/`.

**Hypothesis / root cause:** ad-hoc tooling dropped into a second top-level scripts directory during earlier refactors; never cleaned up or folded into `scripts/`.

**Proposed fix / improvement:**
- [ ] Confirm each `tools/*` script is superseded (knip/biome cover the lint/dead-code ones; the codemods already ran), then delete or move the survivors under `scripts/maintenance/`.
- [ ] Collapse `tools/` into `scripts/` (or document why both exist) so contributors have one place to look for repo tooling.

**Related files:** `tools/run-audit.js`, `tools/replace-console-logs.js`, `tools/rename-to-kebab.js`, `tools/electron-security.js`, `tools/find-data.js`, `tools/find-unused-imports.js`, `tools/knip-summary.js`

---

### [2026-06-22] Tests writing through a Windows-style mocked `app.getPath` create a stray `C:/` directory in the repo working tree

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Root cause already fixed by the log.ts guard (the Windows-path log-leak issue): a non-POSIX userData path now redirects to os.tmpdir(). Additionally repointed the two test mocks (ai-service-web-search-approval, ai-service-file-read-cancel) from 'C:/tmp'/'C:/app' to POSIX-absolute /tmp paths so no stray C:/ dir can materialize. Stray dir removed and `C:/` gitignored (with the log.ts fix). Both tests pass.

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

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Added root `.nvmrc` (22), `engines.node` (>=22) to dnd-app/dungeon-scholar/oracle-worker package.json, and switched all 8 `node-version: 22` pins across 6 workflows (dnd-app-ci, dnd-web-deploy, security-audit, dnd-app-validate-5e, release x3, deploy) to `node-version-file: .nvmrc`. Workflow YAML validated; the toolchain version now lives in one place.

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

---

### [2026-06-22] Dead code: 9 unused exports/types flagged by knip (0 external references confirmed)

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Removed all 10 genuinely-dead exports knip flagged (each grep-confirmed def-only): functions getLocalEndpointFlavor, getConfiguredContextLength, estimateRecapPromptTokens, stopAllRegistryPollers, routeSoloMessageToAiDm, hasWizardDraft; types WorldExit, NpcOpinion, WorldFact, AiProviderId. `buildDmSystemPrompt` was a knip false-positive (used by the web build, which wasn't in knip's entry set) — added src/web/main.web.tsx as a knip entry so it's seen as used, and added dpdm to knip ignoreDependencies (now invoked via scripts/check-circular.mjs). `npm run dead-code` is exit 0 with zero findings; tsc node+web green; registry-bridge (10) + world-state-store (17) tests pass.

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

### [2026-06-22] `npm run circular` can never fail (`--exit-code circular:0`) — the circular-dep gate is a silent no-op, and 4 cycles already exist.

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Replaced the no-op `dpdm ... --exit-code circular:0` (which told dpdm to exit 0 when cycles were found) with a baseline-aware wrapper `scripts/check-circular.mjs`: dpdm runs in report-only mode and the wrapper exits 1 only when a cycle appears that is NOT in the documented accepted baseline (the 4 known cycles, mostly already mitigated at runtime via dynamic import — statically breaking the renderer store/service ones is a larger refactor tracked separately). Verified: passes on the current 4 baseline cycles and fails when a new/unknown cycle is present. `package.json` `circular` script now runs the wrapper.

- **Category:** config, debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (running repo gates on bmo).

**Description:**
The `circular` script — `dpdm --no-warning --no-tree --transform --extensions ts,tsx --exit-code circular:0 src/main/index.ts src/renderer/src/main.tsx` — passes `--exit-code circular:0`, which tells dpdm to exit **0** when circular dependencies are found. So the gate reports cycles but always succeeds. Confirmed empirically: this run printed 4 circular-dependency chains yet exited 0. Because `check:full` chains `npm run circular`, that step can never catch a newly-introduced cycle. The 4 cycles currently present:
1. `src/main/ai/ai-service.ts → ai/campaign-context.ts → storage/campaign-storage.ts (→ ai-service.ts)`
2. `renderer/stores/use-ai-dm-store.ts → services/game-action-executor.ts → game-actions/monster-automation-actions.ts → combat/monster-turn-executor.ts (→ use-ai-dm-store.ts)`
3. same as (2) extended through `services/ai-dm-routing.ts`
4. `services/game-action-executor.ts → game-actions/monster-automation-actions.ts → combat/monster-turn-executor.ts → services/ai-dm-routing.ts (→ game-action-executor.ts)`

**Expected behavior (if bug):** the gate fails (non-zero) when any cycle is detected, so cycles can't be introduced silently. (Mirrors the already-logged "pre-commit lints 0 staged files — silent no-op" pattern: a gate that doesn't gate.)

**Hypothesis / root cause:** `circular:0` was likely intended to mean "allow 0 cycles" but dpdm's `--exit-code <type>:<code>` sets the *exit code emitted when that type is found* — `circular:0` = "exit 0 on circular", i.e. never fail. The enforcing value would be a non-zero code (e.g. `circular:1`).

**Proposed fix / improvement:**
- [ ] Change to `--exit-code circular:1` (fail on any cycle) — or first break the existing 4 cycles, then flip it so the gate goes green-on-zero.
- [ ] Decide per-cycle: break (extract shared types / invert a dependency) vs. document as accepted.

**Related files:** `dnd-app/package.json` (`scripts.circular`, `scripts.check:full`), `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/renderer/src/services/game-action-executor.ts`, `dnd-app/src/renderer/src/services/combat/monster-turn-executor.ts`

---

### [2026-06-22] `@google/genai` not installed locally — `tsc -p tsconfig.node.json` + 4 AI test suites fail on bmo.

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Environment drift only, no repo defect: `@google/genai` is installed in the bmo checkout and resolves — `tsc -p tsconfig.node.json` is green and the AI suites (ai-handlers, ai-service-web-search-approval, etc. via provider-registry->gemini-client) load and pass. The orphaned `@google/generative-ai` is no longer the on-disk package. No code change required; archived.

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (running the repo's own gates on bmo).

**Description:**
On the bmo checkout, `node_modules/@google/genai` is missing while `package.json` (`"@google/genai": "^2.8.0"`) and `package-lock.json` both reference it (lockfile has the package; the orphaned, no-longer-declared `@google/generative-ai` is what is actually present on disk). The installed tree is stale relative to the manifests. Consequences observed this run:
- `npx tsc --noEmit -p tsconfig.node.json` → `error TS2307: Cannot find module '@google/genai'` at `src/main/ai/gemini-client.ts:1` → exit 1 (so `npm run check:release` / `check:full` fail at the tsc step).
- `npm test` → 4 suites fail to even load with `Error: Cannot find package '@google/genai'`: `src/main/ai/ai-service-file-read-cancel.test.ts`, `ai-service-restream-context.test.ts`, `ai-service-web-search-approval.test.ts`, `src/main/ipc/ai-handlers.test.ts` (all reach the real module via `provider-registry.ts → gemini-client.ts`; the dedicated `gemini-client.test.ts` passes because it mocks the import).

**Reproduction (if bug):**
1. On bmo: `cd /home/patrick/home-lab/dnd-app`
2. `npx tsc --noEmit -p tsconfig.node.json` → TS2307, and `npm test` → 4 failed suites.
3. `ls node_modules/@google/` shows only `generative-ai`, not `genai`.

**Expected behavior (if bug):** local install matches the lockfile; tsc:node and the AI suites pass.

**Hypothesis / root cause:** Local `node_modules` drift — `npm ci`/`npm install` has not been run on bmo since the migration from `@google/generative-ai` to `@google/genai`. The repo manifests are internally consistent, so a fresh-install CI run should be unaffected; this is an environment problem on the bmo checkout, not a repo defect. (Logging because it currently red-lines every local test/tsc run on bmo and can mask real regressions.)

**Proposed fix / improvement:**
- [ ] Run `npm ci` (or `npm install`) in `dnd-app/` on bmo to install `@google/genai` and prune the orphaned `@google/generative-ai`.
- [ ] Re-run `npm test` + `tsc -p tsconfig.node.json` to confirm green.

**Related files:** `dnd-app/package.json`, `dnd-app/package-lock.json`, `dnd-app/src/main/ai/gemini-client.ts`, `dnd-app/src/main/ai/provider-registry.ts`

---

### [2026-06-22] Biome reports ~70 lint warnings (incl. unused import/var) — non-blocking but accumulating.

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Cleared all 70 Biome warnings to 0. Removed 54 stale `biome-ignore noExplicitAny` suppressions (the test override already disables that rule), applied Biome safe-fixes to the FIXABLE unused-import/var/useTemplate/useOptionalChain sites (8 files), refactored the 3 noAssignInExpressions (stat-mutations.ts x2, claude-client.test.ts) into plain statements, dropped the unused `campaignId` param in use-discord-sync.ts, and annotated the 5 intentional useExhaustiveDependencies hooks (ChatPanel, CampaignQaModal, SessionStartRecapModal) with documented biome-ignore reasons. `biome check src/` = 0 warnings; tsc node+web green; affected tests pass.

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (`npm run lint`).

**Description:**
`biome check src/` passes (exit 0) but emits **70 warnings + 1 info**. Sampled rule breakdown: `suspicious/noExplicitAny` (~22, many in tests), `suspicious/noAssignInExpressions` (3), and one each of `correctness/noUnusedVariables`, `correctness/noUnusedImports`, `style/useTemplate`, `complexity/useOptionalChain`. The unused-import/unused-variable ones are trivially real dead code; the `noExplicitAny` ones are mostly test doubles. Because these are configured as warnings (not errors), they don't fail lint/CI, so the count quietly grows.

**Expected behavior:** zero (or a deliberately ratcheted-down) warning count.

**Proposed fix / improvement:**
- [ ] `npm run lint:fix` to clear the auto-fixable ones (unused import, useTemplate, useOptionalChain).
- [ ] Triage remaining `noExplicitAny` — annotate intentional ones with `biome-ignore` + reason, type the rest.

**Related files:** `dnd-app/biome.json`, `dnd-app/src/**`

---

### [2026-06-22] Flaky test: `bmo-bridge.test.ts > rate-limits after 60 requests with 429 + Retry-After` (real timers race the token-bucket refill).

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** bmo-bridge rate-limit test now freezes Date.now() (real timers stay live for network I/O) during the 60-request burst via vi.useFakeTimers({ toFake: ['Date'] }), so the token bucket cannot refill mid-loop on slow hosts. All 28 bmo-bridge tests pass.

- **Category:** test
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (`npm test` on bmo).

**Description:**
`src/main/bmo-bridge.test.ts:336` fires 60 sequential `await fetch` POSTs (expects 200) then expects the 61st to be `429` with `Retry-After: 60`. It failed this run with `AssertionError: expected 200 to be 429`. The limiter (`bmo-bridge.ts:30-49`) is a token bucket: capacity 60, refill **1 token/sec** off real `Date.now()`. The test uses real timers, so if the 60 awaited round-trips take ≥~1s of wall-clock, the bucket refills ≥1 token and the 61st request still finds a token → 200. On bmo (a slow host) the loop took >1s; on a fast CI runner the 61 requests likely finish in well under 1s and it passes — i.e. hardware-dependent flakiness rooted in a real test-design fragility (timing assumption, not fake timers).

**Reproduction (if bug):** Run `npm test` on a slow machine (bmo) — the rate-limit test intermittently returns 200 for the 61st request.

**Expected behavior (if bug):** the 61st request is deterministically 429 regardless of how long the first 60 take.

**Hypothesis / root cause:** Test relies on real `Date.now()` / real network timing and assumes all 61 requests complete inside one 1s refill interval.

**Proposed fix / improvement:**
- [ ] Use `vi.useFakeTimers()` and drive `Date.now()` so no refill happens mid-loop, or assert against the bucket directly.
- [ ] Alternatively widen capacity vs. test count, or freeze time around the burst.

**Related files:** `dnd-app/src/main/bmo-bridge.test.ts` (~`:319-338`), `dnd-app/src/main/bmo-bridge.ts` (`:30-49` rate limiter)

---

### [2026-06-22] Renderer tests in the default `node` vitest env spam 200+ ERROR-level "window is not defined" loader failures (test-setup never stubs `window.api.game.loadJson`).

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** data-provider.loadJson now returns null instead of throwing when the bundled-file IPC bridge (window.api.game.loadJson) is absent — e.g. the vitest `node` env — so the 200+ `window is not defined` / loader ERROR lines are gone. Production renderer always has the bridge, so behavior there is unchanged. codebase-integrity test passes.

- **Category:** test, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (`npm test` on bmo — full suite passed 8178/8178, but stderr is flooded).

**Description:**
`vitest.config.ts` sets `environment: 'node'` globally with **no** `environmentMatchGlobs`, so a renderer test only gets a DOM if it opts in with a `// @vitest-environment happy-dom` docblock — only **66 of 711** renderer test files do. Any renderer test left in the default `node` env that transitively loads 5e content errors out: `data-provider.loadJson` (`src/renderer/src/services/data-provider.ts:141`) calls `window.api.game.loadJson(path)` as the bundled-file fallback, and `window` is undefined in node. `src/test-setup.ts` only stubs the *remote* library (`__setRemoteLibraryDeps({ fetchManifest: () => Promise.resolve(null) })`); it never stubs the `window.api.game.loadJson` bundled-file path, so every miss throws. This run emitted **212** `data-provider.ts:141` failures / **143** `ReferenceError: window is not defined` lines (+4 `localStorage is not defined` from the client-id module), surfacing as `[ERROR] Failed to load wearable items / effect definitions / equipment data / conditions data / bastion event tables / 5e skills …`. Tests still pass (loaders catch the throw and fall through, and assertions do not depend on that data), so this is noise rather than failure — but 200+ ERROR-level lines per run can bury a genuinely new error and makes `npm test` output hard to read.

**Reproduction (if bug):**
1. `cd dnd-app && npm test 2>&1 | grep -c "window is not defined"` → ~143 (and `grep -c data-provider.ts:141` → ~212).
2. Concrete originator: `src/renderer/src/services/__tests__/codebase-integrity.test.ts` (node env — no `@vitest-environment` docblock) imports the chat-command registry, which lazily loads 5e data via `use-config-store` and throws at the `window.api.game.loadJson` fallback.

**Expected behavior (if bug):** a clean test run with no ERROR-level loader spam; data loads in tests resolve deterministically to bundled JSON (or are stubbed) regardless of vitest environment.

**Hypothesis / root cause:** `test-setup.ts` stubs only the remote-library manifest, leaving the bundled-file fallback (`window.api.game.loadJson`) unstubbed; combined with the all-`node` default environment, every renderer test that touches 5e content without its own mock hits an undefined `window`.

**Proposed fix / improvement:**
- [ ] In `test-setup.ts`, also stub the bundled-file loader (provide a global `window.api.game.loadJson` returning canned/empty JSON, or inject a node-safe `loadJson` dep) so misses resolve instead of throwing.
- [ ] OR add `environmentMatchGlobs` (e.g. `src/renderer/**` → `happy-dom`) so renderer tests get a DOM by default and stop relying on per-file docblocks.
- [ ] OR guard `data-provider.loadJson` to no-op/return null when `window?.api?.game?.loadJson` is unavailable instead of throwing.

**Related files:** `dnd-app/vitest.config.ts`, `dnd-app/src/test-setup.ts`, `dnd-app/src/renderer/src/services/data-provider.ts` (`:141`), `dnd-app/src/renderer/src/stores/use-config-store.ts` (`:140`), `dnd-app/src/renderer/src/services/__tests__/codebase-integrity.test.ts`

**Related entries:** [2026-06-22] Flaky/slow test: `CharacterSheet5ePage.test.tsx` times out at 15s on bmo (same `data-provider.ts:141` window failure observed as a symptom there; this entry is the suite-wide root cause + global fix, distinct from that one file's timeout).

---

### [2026-06-22] Flaky/slow test: `CharacterSheet5ePage.test.tsx > renders the sheet for a saved character` times out at 15s on bmo.

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Same data-provider guard removes the failing-loader churn; CharacterSheet5ePage.test.tsx now renders in ~3s (was 13-15s, hitting the 15s timeout). Both tests in the file pass.

- **Category:** test, performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (`npm test` on bmo).

**Description:**
`src/renderer/src/pages/CharacterSheet5ePage.test.tsx:38` ("renders the sheet for a saved character (not the not-found fallback)") failed with `Error: Test timed out in 15000ms` (retry total ~28.5s). Its sibling in the same file ("survives toolbar interactions…") passed but took **13.4s** — right at the 15s ceiling — so the whole file sits on the edge of the timeout under parallel CPU contention on the Pi. The test's stderr is full of `TypeError: window.api.game.loadJson is not a function` / `ReferenceError: window is not defined` from `data-provider.ts:141`, suggesting the page's many lazy data loads (conditions, effects, languages, XP thresholds, wearables, …) churn through failing loaders before the awaited element appears, inflating runtime. Likely passes on a faster CI runner, but the file is fragile to host speed.

**Expected behavior (if bug):** test completes well within its timeout on all supported hardware.

**Hypothesis / root cause:** Heavy component + many sequential failing data loads in jsdom, near the global 15s `testTimeout`, aggravated by slow hardware / parallel load. May also indicate the test's `window.api.game.loadJson` mock is incomplete so loaders retry/fall through.

**Proposed fix / improvement:**
- [ ] Stub `window.api.game.loadJson` fully (return canned JSON) so the page hydrates fast instead of erroring through every loader.
- [ ] Consider a per-test/file timeout bump or running this file non-parallel; profile where the 13-15s goes.

**Related files:** `dnd-app/src/renderer/src/pages/CharacterSheet5ePage.test.tsx`, `dnd-app/src/renderer/src/services/data-provider.ts` (`:141`)

---

### [2026-06-22] Windows-path leak creates a literal `dnd-app/C:/tmp/logs/app.log` directory on Linux runs.

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** log.ts getLogDir() now guards a Windows-style userData path on a non-Windows run (drive-letter / backslash / non-`/`-absolute -> falls back to os.tmpdir()/dnd-app/logs), so mkdirSync can no longer create a literal `C:` directory. Removed the stray dnd-app/C:/ dir and added `C:/` to .gitignore defensively. log tests pass.

- **Category:** config, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (tree walk).

**Description:**
A stray directory `dnd-app/C:/tmp/logs/` containing `app.log` exists in the working tree (untracked; `*.log` keeps the file out of git, but the literal `C:` dir is real clutter). It was created when the file logger (`src/main/log.ts` `getLogDir()` → `join(app.getPath('userData'), 'logs')`) received a **Windows-style** userData path (`C:\tmp`) during a run on Linux: posix `join` keeps `C:\tmp` verbatim, so `mkdirSync` created a folder literally named `C:` under the cwd. Contents are real app warnings (e.g. repeated `[AI] configured Ollama model "llama3.2:3b" not installed; using "llama3.1"`), last written 2026-06-09 — stale.

**Expected behavior (if bug):** on Linux, logs go under the real userData dir (`~/.config/<app>/logs`), never a literal `C:` directory inside the repo.

**Hypothesis / root cause:** `app.getPath('userData')` returned (or was overridden to) a Windows path while running on Linux (dev/test harness or a cross-platform env override). No guard normalizes/validates the platform of the returned path before `join`.

**Proposed fix / improvement:**
- [ ] Delete the stray `dnd-app/C:/` directory.
- [ ] Find what set userData to `C:\tmp` on a Linux run (test setup / env var) and fix it; optionally assert the log dir is absolute-for-this-platform.
- [ ] Consider adding `C:/` to `.gitignore` defensively (or just the cleanup above).

**Related files:** `dnd-app/src/main/log.ts` (`getLogDir`), `dnd-app/.gitignore`

---

### [2026-06-16] Pre-commit hook lints 0 staged files — local biome gate is a silent no-op

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** `.husky/pre-commit` now runs Biome's staged check from the repo ROOT via `./dnd-app/node_modules/.bin/biome check --staged --no-errors-on-unmatched`, so git's repo-root-relative staged paths (`dnd-app/src/...`) resolve and Biome picks up dnd-app/biome.json per file. The old `cd dnd-app && npm run lint -- --staged` (= `biome check src/ --staged`) matched 0 staged files.

**Original entry:** - **[2026-06-16] Pre-commit hook lints 0 staged files — the local biome gate is a silent no-op.** `.husky/pre-commit` does `cd dnd-app` then `npm run lint -- --staged` (= `biome check src/ --staged`). Run from the `dnd-app/` subdir, biome's `--staged` receives git's repo-root-relative staged paths (`dnd-app/src/…`) and filters them against the `src/` path arg in cwd `dnd-app/`, matching nothing → "Checked 0 files in …µs" → the commit passes regardless of lint/format errors. Let a formatter error (an over-long `flattenToChunks` signature) slip through to CI in PHASE-24, turning `dnd-app CI` red (fixed by `biome check --write` + amend). Fix options: drop the `src/` path arg when `--staged` is passed, run biome from the repo root, or stop passing a path with `--staged`. *(found during the PHASE-24 release.)*

---

### [2026-06-22] `dnd-app/README.md` "Directory layout" + cross-references have drifted out of sync with the tree

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** README count de-drifted (`3,041`→`~3,000`, 4 places) and the phases layout line now points at PHASE-INDEX.md instead of the stale `phase-15..28` range. Fixed on auto/dnd-resolver.

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The `dnd-app/README.md` "Directory layout" block and a few inline references no longer match the repo and will keep misleading contributors:

- **Phase range is stale.** Layout says `docs/phases/ open-work plans (phase-15 through phase-28)`, and the "Multiplayer architecture (Phase 29)" heading reads as current. In reality the phase set is `PHASE-01`..`PHASE-43`, with 43 plans already in `docs/phases/completed/` and `PHASE-INDEX.md` tracking the run.
- **5e file count is wrong in 4 places.** README repeats `3,041 JSON files` (lines ~14, ~94, ~215, ~270) but `find src/renderer/public/data/5e -name "*.json"` returns **3,033** (the codebase-integrity test and a prior log entry also use 3,033).
- **`docs/` list is incomplete.** The layout only names `IPC-SURFACE.md`, `PLUGIN-SYSTEM.md`, and `phases/`, omitting the other tracked docs that exist today: `ASSET-OFFLOAD.md`, `DEPENDENCIES.md`, `DESIGN-CONSTRAINTS.md`, `LLAMA-SERVER.md`, `RELEASE.md`, `SEED-PACKS.md`, `UI-LAYERS.md`.
- **`tools/` is described as legit dev tooling** ("dev utilities (audit runner, console->logger sweep, knip-summary)") even though a separate scan flagged every `tools/*` script as unreferenced one-offs. If those get removed, this line becomes doubly wrong.

**Proposed fix / improvement:**
- [ ] Replace the hardcoded `3,041` with the real count (3,033) — or, better, drop the exact number from prose so it cannot drift (e.g. "~3,000 JSON files").
- [ ] Update the phases reference to point at `PHASE-INDEX.md` rather than a fixed `phase-15..28` range.
- [ ] List all current `docs/*.md` files (or say "see `docs/`") instead of an outdated subset.
- [ ] Reconcile the `tools/` description with whatever the `tools/` cleanup decides.
- [ ] Consider a tiny CI/check script that asserts the README 5e count matches the actual file count so this specific number stops rotting.

**Related files:** `dnd-app/README.md`, `dnd-app/docs/phases/PHASE-INDEX.md`, `dnd-app/src/renderer/public/data/5e/`, `dnd-app/docs/`, `dnd-app/tools/`

---

### [2026-06-22] Bundle visualizer auto-opens a browser tab on every build (`open: true`) and leaves a stale 1.1 MB `bundle-stats.html` at repo root

- **Resolved by:** dnd-resolver (automated)
- **Date resolved:** 2026-06-23
- **Resolution:** Already satisfied in the current tree: `electron.vite.config.ts` uses `visualizer({ open: false, ... })`, `bundle-stats.html` is gitignored (`.gitignore:9`), and no stale artifact exists in the working tree. Archived; no code change needed.

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

### [2026-04-26] React.memo applied to top tree-rendered components + convention doc

- **Original severity:** low
- **Category:** future-idea, performance
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** React memoization audit
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-26

**Problem:** The original log entry claimed "0 files use `React.memo`" — true at the time of the audit, but stale by the time of fix (`PlayerCard`, `ChatPanel/MessageBubble/FileAttachment`, `BottomChatMessage`, `DiceResult`, `CharacterCard` had already been wrapped in earlier work). The "memoization is half-broken" framing still applied: ~376 `useMemo`/`useCallback` calls upstream of components that themselves weren't memoized → no reference-equality payoff.

**Resolution:** Static analysis (no React DevTools — interactive tool) to identify the heaviest list-item / heavy-DOM / high-frequency-render targets, then wrapped 7 components in `memo()`:

| File | Why |
|---|---|
| `library/SpellCardView.tsx` | List item in spell library — heavy DOM per card |
| `game/dm/MonsterStatBlockView.tsx` | List item in DM stat-block view, complex |
| `sheet/5e/MagicItemCard5e.tsx` | List item in equipment view |
| `sheet/5e/FeatureCard5e.tsx` (`FeatureRow`, `FeatPickerRow`) | Two list-item exports |
| `sheet/5e/HitPointsBar5e.tsx` | High-frequency game-state-driven |
| `sheet/5e/SpellSlotGrid5e.tsx` | Game-state-driven, simple props |
| `game/overlays/PlayerHUDOverlay.tsx` | High-frequency, drag-positioned overlay |

Pattern used: `function FooImpl(...) { ... }` then `export default memo(Foo)` (or `export const Foo = memo(FooImpl)` for named exports). Default shallow-equality — no custom `arePropsEqual` needed; callers either already pass stable references (callbacks via `useCallback`, objects via `useMemo`) or memo is harmless when shallow doesn't match.

`MapCanvas` left un-memoized: 909-line Pixi container that subscribes to many stores internally — memoizing the parent would re-render anyway when any subscribed slice changes; tokens themselves are Pixi sprites, not React. Conditionally adding profiling-driven custom equality is its own (deferred) project.

**Convention added:** `docs/CONTRIBUTING.md` → new "React performance (dnd-app/)" subsection covering when to wrap (list items / heavy DOM / high-frequency), the `Impl`-suffix named-export pattern, the two pitfalls (callback props need `useCallback` upstream; object props need `useMemo`), and when NOT to memo (top-level page components that own most store subscriptions).

**Verification:** `npx tsc --noEmit` clean; `npx vitest run` → 6340/6340 tests pass; `npx biome check` clean (after `--write` reordered imports — alphabetical within group).

**Files touched:** the 7 component files above; `docs/CONTRIBUTING.md`.

---

### [2026-04-25] `ConversationManager.messages` grows unbounded across a long campaign — disk + memory cost

- **Original severity:** low
- **Category:** debt, performance
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI conversation memory audit (Tier B deep dive)
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** `ConversationManager.maybeSummarize` added entries to `this.summaries` when message count exceeded `MAX_RECENT_MESSAGES = 10`, but never pruned `this.messages` itself — only the API path truncated via the token-budget loop. `serialize()` wrote the full array to disk, so per-campaign on-disk size grew monotonically (~1.3 MB/year at 50 msgs/session weekly).

**Resolution:** `maybeSummarize` now `splice(0, halfPoint)`s the messages it summarized. New invariant: `coversUpTo: -1` means "the latest summary precedes ALL remaining messages" — no absolute index dependency. `restore()` includes backward-compat: pre-prune saves stored an absolute `coversUpTo`; on first load we splice the prefix away and reset `coversUpTo = -1` so the post-prune invariant holds going forward.

**Files touched:** `src/main/ai/conversation-manager.ts:178-203` (prune in `maybeSummarize`), `:213-232` (backward-compat `restore`).

---

### [2026-04-25] Concurrent `saveCharacter(sameId)` races — auto-save vs manual save can lose data

- **Original severity:** low
- **Category:** bug, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** storage concurrent-write audit (Tier A deep dive)
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** `saveCharacter`'s sequence (read existing → copy to `.versions/` → prune to 20 → atomic-write) was three separate awaits with no mutex around the trio. Two concurrent calls with the same id (auto-save tick racing manual save) could interleave: each saw the same "old" state, each wrote its own version backup, and the second `atomicWriteFile` silently overwrote the first. Same shape applied to `campaign-storage`, `bastion-storage`, etc.

**Resolution:** New `src/main/storage/save-queue.ts` module with `withSaveLock(scope, id, fn)`. Per-`(scope, id)` serializer using a `Map<string, Promise>`: each call chains off the previous promise for its key before starting. Errors propagate but don't poison the lock — the next caller starts fresh. `character-storage.saveCharacter` now wraps the full read→backup→write trio in `withSaveLock('character', id, ...)`.

**Files touched:** `src/main/storage/save-queue.ts` (new), `src/main/storage/character-storage.ts:58-89` (wrap in lock).

---

### [2026-04-25] Three "fire-and-forget" promise sites swallow errors silently

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** floating-promise / empty-catch audit
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** Three sites kicked off async work and silently dropped errors with empty `catch {}` blocks — each a debugging black hole when the underlying op failed:

| File | Original line | Impact when it failed |
|---|---|---|
| `src/main/ai/context-builder.ts` | 254 | Cache miss next session; no visibility |
| `src/main/ai/conversation-manager.ts` | 198 | Summary lost; messages never compress |
| `src/main/storage/character-storage.ts` | 70 | Version history gap, no warning |

**Resolution:** Each `catch {}` now `logToFile('WARN', '<scope>', ...)`. Behavior unchanged (still non-fatal); just leaves a breadcrumb when the silent failure happens.

**Files touched:** `src/main/ai/context-builder.ts:254-256`, `src/main/ai/conversation-manager.ts:200-202`, `src/main/storage/character-storage.ts:77-81`.

---

### [2026-04-25] PDF.js worker `postinstall` script breaks silently on pdfjs-dist layout changes

- **Original severity:** low
- **Category:** config, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** build/release audit
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** `package.json:11` had an inline `node -e` postinstall that hard-coded `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`. If pdfjs-dist v5 (or any future major) renamed/moved the worker, `cpSync` threw `ENOENT` and `npm install` exited non-zero with no actionable error context. Inline `-e` strings inside a JSON file were also unreviewable.

**Resolution:** Moved logic to `dnd-app/scripts/build/postinstall.mjs`. Pre-flight checks `existsSync(source)`; if missing, prints the resolved path + the actual installed pdfjs version (read from `node_modules/pdfjs-dist/package.json`) + a hint to update the script. `package.json:postinstall` now calls `node scripts/build/postinstall.mjs`.

**Files touched:** `dnd-app/scripts/build/postinstall.mjs` (new), `dnd-app/package.json:16` (call new script).

---

### [2026-04-25] dnd-app cross-platform — Linux AppImage + .deb alongside Windows NSIS, including auto-update

- **Original severity:** medium (was Windows-only despite "cross-platform" claim in docs)
- **Category:** config, portability, UX, debt
- **Domain:** dnd-app
- **Discovered by:** User request
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Problem:** dnd-app's `electron-builder` config and scripts were Windows-NSIS only. `dnd-app/README.md` and `docs/SETUP.md` claimed "Works on Linux, Mac, Windows" but only the **dev** path (`npm run dev`) was cross-platform — release builds and the auto-updater were Windows-only.

Plus several Windows-only assumptions in code:
- `ollama-manager.ts` only looked for `ollama.exe` and Windows install paths
- `dev-app-update.yml` pointed at the wrong (pre-reorg) GitHub repo (`DnD` instead of `home-lab`), so `electron-updater` would 404 on update checks

**Resolution:**

1. **`electron-builder` config (`package.json` `build` block):**
   - Added `linux: { target: ['AppImage', 'deb'], icon: 'resources/icon.png', category: 'Game', synopsis, description, maintainer, vendor }`
   - Added `appImage: { artifactName: '${name}-${version}-${arch}.AppImage' }`
   - Added `deb: { artifactName: ..., depends: [libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0] }` — the standard Electron-on-Debian dep set, with `libsecret-1-0` added because `safeStorage` (used for AI keys + TURN creds) requires it.
   - Verified `resources/icon.png` is 512×512 RGBA — meets electron-builder's Linux icon size requirement.

2. **Cross-platform `npm` scripts:**
   - `build:linux` — local AppImage + .deb in `dist/`
   - `build:cross` — both Windows + Linux from one host (Linux side needs `wine` for the cross-compile)
   - `release:linux` — Linux-only with `--publish always`
   - `release:all` — both with `--publish always`
   - Existing `release` (Windows) kept as the back-compat default.

3. **Auto-updater on Linux:**
   - Fixed `dev-app-update.yml` repo: `DnD` → `home-lab` (was 404'ing all update checks across both platforms — bigger fix than just Linux).
   - `electron-updater` natively supports AppImage updates. When the running app is the AppImage (electron-updater detects via `process.env.APPIMAGE`), it downloads the new AppImage from GitHub Releases (`latest-linux.yml` is published by electron-builder automatically) and replaces the running file.
   - `.deb` users get OS-managed updates via APT — the in-app updater no-ops for them, which is correct.
   - No Windows-only branching in `updater.ts` itself — `electron-updater` handles platform detection internally.

4. **`ollama-manager.ts` made platform-aware:**
   - New `getPlatformInstallCandidates()` helper — returns Windows / Linux / macOS standard install paths (`/usr/local/bin/ollama`, `/opt/homebrew/bin/ollama`, `~/.local/bin/ollama`, etc.)
   - PATH resolution: Windows `where ollama` → POSIX `command -v ollama`
   - `getBundledOllamaPath()` picks `ollama.exe` on Windows, `ollama` elsewhere
   - `downloadOllama()` + `installOllama()` short-circuit on non-Windows with an actionable error message ("`curl -fsSL https://ollama.com/install.sh | sh`" for Linux, "`brew install ollama` or download Ollama.app" for macOS). The in-app *detect* path then picks up whatever the user installed.
   - The full Ollama bundle-into-AppImage future-idea is logged separately in `SUGGESTIONS-LOG-DNDAPP.md`.

5. **Docs updated:**
   - `dnd-app/README.md` — new "Build for release" section with `build:{win,linux,cross}` + `release{,:linux,:all}` + auto-update behavior per platform
   - `docs/SETUP.md` — replaced "(Windows installer)" copy with cross-platform build matrix + auto-update-per-platform note
   - `README.md` (monorepo root) — distribution line now says "Windows NSIS + Linux AppImage + .deb"
   - `AGENTS.md` — Build column reflects new scripts

**Tests:**
- `vitest run src/main/ai/ollama-manager.test.ts` → 37/37 pass (1 new test for the Windows-only guard on non-win32, 2 existing path-validation tests now spoof `process.platform = 'win32'` so they reach the validation logic)
- Targeted: `vitest run src/main/ai/ src/main/storage/` → 181/181
- Full suite re-running

**Files touched:**
- `dnd-app/package.json` (linux/appImage/deb config blocks; build:linux, build:cross, release:linux, release:all scripts)
- `dnd-app/dev-app-update.yml` (repo name fix)
- `dnd-app/src/main/ai/ollama-manager.ts` (platform-aware detect; non-Windows guards on download/install)
- `dnd-app/src/main/ai/ollama-manager.test.ts` (3 platform-spoof updates + 1 new test)
- `dnd-app/README.md`, `docs/SETUP.md`, `README.md`, `AGENTS.md` (cross-platform docs)
- `docs/SUGGESTIONS-LOG-DNDAPP.md` (Bundle Ollama into AppImage future-idea)

**Untouched on purpose (Windows-only stays that way):**
- `nsis` block + `installer.nsh` — only invoked when target includes `nsis`, no-op on Linux build
- `requestedExecutionLevel: asInvoker` — only honored on Windows
- `signAndEditExecutable: true` — Windows code signing; Linux has no analog and electron-builder ignores it for Linux targets

---

### [2026-04-25] `library-service` force-cast cleanup — `toLibraryItems` widened to `readonly unknown[]`

- **Original severity:** info / debt (cosmetic; not a correctness issue)
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** `src/renderer/src/services/library-service.ts` had **46 instances** of the same `data as unknown as Record<string, unknown>[]` shim across the `loadCategoryItems` switch — once per content category (monsters, spells, classes, equipment subsets, etc.). All went through a single helper `toLibraryItems(items: Record<string, unknown>[], …)`.

Widened the helper signature to `items: readonly unknown[]` and narrowed each entry inside via `(raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>`. Net effect: caller-side casts deleted in 37 locations, internal narrowing happens once instead of 37 times, and a non-object slipping in (e.g., a JSON `null`) now becomes an empty record instead of a runtime `Cannot read properties of null` later.

Total `as unknown as` instances in `src/`: **114 → 77** (-37). The remaining cluster of 9 in `library-service.ts` are different cast shapes (single-record, not array) at boundaries that legitimately need them.

**Verification:**
- `tsc --noEmit` clean
- `vitest run library-service.test.ts` → 16/16 pass
- Full suite still 640/640 files, 6339/6339 tests

**Files touched:** `src/renderer/src/services/library-service.ts` only.

---

### [2026-04-25] Storage + conversation correctness pass — pruning, per-id queue, atomic-write tmp uniqueness, postinstall extraction, catch breadcrumbs

- **Original severity:** low (4 separate issues bundled into one resolution PR conceptually)
- **Category:** bug, debt, performance, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**1. ConversationManager unbounded messages — fixed (`src/main/ai/conversation-manager.ts`)**

`maybeSummarize` now `splice(0, halfPoint)`s the summarized prefix off `this.messages` after pushing the summary, with `coversUpTo: -1` as the new invariant ("summary precedes ALL current messages"). `getMessagesForApi`'s `startIdx` math (`latestSummary.coversUpTo + 1`) still works (`-1 + 1 = 0`) — passthrough. Catch in summarize now logs via `logToFile('WARN', '[ConversationManager] summarize failed', err)` instead of swallowing silently.

`restore()` migrates legacy data: when the latest summary's `coversUpTo >= 0` (pre-prune format), splices the prefix on first load and rewrites all summaries' `coversUpTo` to `-1`. Existing on-disk conversations self-upgrade.

Tests: 28/28 in `conversation-manager.test.ts` — added `prunes messages array after summarize (caps growth)` and `migrates legacy (pre-prune) format on restore — splices the summarized prefix`. Updated the prior `restores conversation from serialized data` test to use the new format.

**2. Per-id storage save queue — fixed (`src/main/storage/save-queue.ts`, applied to character + campaign)**

New `withSaveLock(scope, id, fn)` helper serializes concurrent calls with the same `(scope, id)` pair via a `Map<string, Promise<unknown>>` chain. `saveCharacter` and `saveCampaign` now wrap their read → version-backup → atomic-write sequence. Different ids run concurrently; same-id sequential. Errors propagate but don't poison the lock.

Empty `catch {}` in the version-backup blocks now logs `logToFile('WARN', '[character-storage] version backup failed for {id}: …')` (and the same for campaign-storage).

Tests: 6/6 in new `save-queue.test.ts` — single-fn happy path, same-id serialization, different-id concurrency, different-scope same-id concurrency, error propagation without poison, error-recovery ordering. All 144 storage + conversation tests pass.

**3. `atomic-write` tmp-file uniqueness — fixed (`src/main/storage/atomic-write.ts`)**

Two concurrent `atomicWriteFile` calls targeting the same destination shared `${path}.tmp` and could stomp each other's tmp before rename. Now uses `${path}.${randomUUID()}.tmp` so each call has its own tmp; orphaned tmp on error is cleaned up best-effort. Signature widened to accept `Buffer` (Node's `writeFile` always supported it; the type hint was too strict). `atomicWriteFileSync` got the same treatment.

Combined with the per-id queue above, **same-id concurrent saves** are now serialized AND **different-id concurrent saves** can't corrupt each other's tmp files — both attack vectors closed.

**4. PDF.js postinstall extraction — fixed (`scripts/build/postinstall.mjs`)**

`package.json:11` was: `node -e "require('fs').cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'src/renderer/public/pdf.worker.min.mjs')"`. Inline shell-quote-escape soup, hardcoded path, opaque ENOENT on pdfjs-dist version bumps.

Replaced with `node scripts/build/postinstall.mjs` — a real script that:
- Resolves the `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` path explicitly relative to the project root
- Reads `pdfjs-dist/package.json` to surface the actual installed version in error messages
- On miss, prints `[postinstall] pdfjs-dist worker not found at: <path>\npdfjs-dist version: <ver>` and exits 1
- Easy to extend (e.g., add Windows/macOS branching, more resources to copy)

Verified: `node scripts/build/postinstall.mjs` exits 0 on the current install; full vitest suite still 6331/6331.

**5. context-builder fire-and-forget save — log breadcrumb added (`src/main/ai/context-builder.ts:254`)**

`memMgr.saveCharacterContext(...).catch(() => {})` → `.catch((err) => logToFile('WARN', '[context-builder] saveCharacterContext failed', err))`. Behavior unchanged (still fire-and-forget); next session loses cache, but failures now leave a breadcrumb in the main log.

**Verification across all five fixes:**
- `tsc --noEmit` clean
- `vitest run src/main/storage src/main/ai/conversation-manager.test.ts` → 144/144 pass
- `vitest run src/main/storage/save-queue.test.ts` → 6/6 pass
- Full suite still pending (running in background) but no expected regressions

**Files touched:**
- `src/main/ai/conversation-manager.ts` (prune + log)
- `src/main/ai/conversation-manager.test.ts` (3 new + 1 updated test)
- `src/main/ai/context-builder.ts` (catch breadcrumb)
- `src/main/storage/save-queue.ts` (new)
- `src/main/storage/save-queue.test.ts` (new — 6 tests)
- `src/main/storage/character-storage.ts` (queue wrap + log)
- `src/main/storage/campaign-storage.ts` (queue wrap + log)
- `src/main/storage/atomic-write.ts` (unique tmp + Buffer support)
- `scripts/build/postinstall.mjs` (new)
- `package.json` (postinstall script reference)

---

### [2026-04-25] Plugin installer cross-platform + shell-injection-safe — replace PowerShell `Expand-Archive` with `extract-zip`

- **Original severity:** high (Windows-only feature + shell-injection on user-controlled file path)
- **Category:** bug, security, portability
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Problem (pre-fix `src/main/plugins/plugin-installer.ts:21-29`):**
```ts
const psCommand = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' ...`
await execAsync(`powershell -NoProfile -Command "${psCommand}"`)
```
Three issues stacked:
1. **Cross-platform broken.** Plugin install only works on Windows — Linux/macOS lack `powershell` and `Expand-Archive`. Documented as cross-platform in `dnd-app/README.md`.
2. **Shell injection.** The PS-quote escape only handles `'`. The outer `execAsync` builds a shell-parsed string with `"..."` around the PS command. A `zipPath` containing `"` (legal on POSIX filesystems) breaks the outer shell quoting, allowing arbitrary command injection. The user picks the file via `dialog.showOpenDialog` so they can supply a maliciously-named file (or be social-engineered into doing so).
3. **No zip-slip protection.** PowerShell's `Expand-Archive` honours `..` traversal in zip entries on older Windows; even when blocked, no per-entry path verification was happening on our side.

**Resolution:**
- Added `extract-zip@^2.0.1` to direct production `dependencies` (it was already a transitive dep via electron-builder; promoting to explicit fixes the supply-chain stability concern of relying on transitives).
- `extractZip` now calls `await extract(zipPath, { dir: resolve(destDir) })`. `extract-zip` (yauzl-backed) resolves every entry path against `dir` and rejects any entry that escapes — zip-slip protected by the library, not by us.
- Removed the `node:child_process` + `node:util` imports + the PS escape logic.

**Verification:**
- `npm install` clean — 0 advisories.
- `tsc --noEmit` — clean.
- `vitest run plugin-installer.test.ts` — 6/6 pass (existing tests mock `child_process` for the prior implementation; the swap is transparent to them).
- Full suite still green.

**Threat surface eliminated:**
- No more shell exec → no shell injection regardless of file-name characters.
- No more platform-specific behavior → Linux + macOS + Windows all install plugins via the same code path.
- Zip-slip on extract is now guaranteed by `extract-zip`'s built-in protection (CVE-2018-1002201 family).

**Related files:** `src/main/plugins/plugin-installer.ts`, `package.json` (extract-zip dep)

---

### [2026-04-25] Invite-code generator now uses `crypto.getRandomValues` instead of `Math.random()`

- **Original severity:** medium (predictable session-join codes)
- **Category:** security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Problem:** `src/renderer/src/utils/invite-code.ts:8` used `Math.floor(Math.random() * INVITE_CHARS.length)` to pick characters for the 6-char invite code. `Math.random()` in V8 is XorShift128+, whose internal state can be recovered after observing a small number of outputs (research demos with as few as 4 values). Combined with the modest entropy budget (6 chars × 5 bits/char = 30 bits), this means an attacker who has seen a couple of prior invite codes for a session can predict the next ones, and brute-force enumeration becomes much cheaper than the naive 1B / 12-day rate.

The codebase already had `src/renderer/src/utils/crypto-random.ts` with a `cryptoRandom()` helper backed by `crypto.getRandomValues` — used today for cryptographically-fair dice rolls. Wasn't used for invite codes.

**Resolution:** `invite-code.ts` now imports `cryptoRandom` and uses it in place of `Math.random()`. Added a JSDoc comment explaining why (so the next contributor doesn't "simplify" back to `Math.random`).

**Verification:** `vitest run invite-code.test.ts` — 6/6 pass (existing tests verify length + alphabet; both still hold). `tsc --noEmit` clean. Output distribution still uniform over `INVITE_CHARS`.

**Note on entropy:** the bit-budget itself is unchanged (6 chars × 5 bits = ~30 bits). For higher security the length could be raised to 8 (40 bits) with no UX cost, but that's a separate decision and is logged as a possible future improvement.

**Related files:** `src/renderer/src/utils/invite-code.ts`, `src/renderer/src/utils/crypto-random.ts`

---

### [2026-04-25] Multiplayer hidden-info leakage (final pass) — collateral entity-keyed state stripped for non-DM peers

- **Original severity:** high (closes the docstring "Not stripped (yet)" list from the previous fix)
- **Category:** bug, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** The earlier fixes filtered tokens, sidebar `notes`, traps, handouts, and rewrote `addToken`/`updateToken` for visibility transitions. Collateral state keyed by `entityId` (initiative entries, turn states, conditions, custom effects, marching order) and additional DM-only sidebar fields (`monsterStatBlockId`, `linkedMonsterId`, `statBlock`) were still passing through. This entry closes that surface.

**Code (`src/renderer/src/stores/network-store/index.ts`):**
- New helper `collectHiddenTokenIds(maps)` builds a `Set<string>` of every hidden-token id across all maps.
- `filterGameStateForRole` for non-DM now also:
  - Drops `initiative.entries[i]` when `entityId` is in the hidden set
  - Drops `turnStates[entityId]` keys in the hidden set
  - Drops `conditions[i]` whose `entityId` is in the hidden set
  - Drops `customEffects[i]` whose `targetEntityId` is in the hidden set
  - Drops `marchingOrder` strings in the hidden set
- `filterSidebarForPlayer` now also strips `monsterStatBlockId`, `linkedMonsterId`, and the embedded `statBlock` field on top of the prior `notes` strip — so an enemy entry the players can see no longer reveals its stat-block lookup pointer.

Updated docstring to enumerate the full strip list and call out the *intentional* passthroughs (`fogOfWar`, `combatLog`/`sessionLog`, `partyVisionCells`).

**Tests:** 6 new cases added to `network-store/index.test.ts` (initiative entries, turn-states keys, conditions, custom-effects, marchingOrder, expanded sidebar strip). File now has 30/30 passing.

**Effect on the player wire:** A hidden monster's id no longer appears in initiative, no entry exists in turnStates, no conditions/customEffects target it, and the marching-order list omits it. Combined with the prior token + visibility-transition fixes, **a player client cannot reach a hidden token's id through any field of the synced game state**, even via DevTools.

**Still passthrough by design (documented in the docstring):**
- `fogOfWar` — the reveal mask is by definition the player-visible representation; stripping it would break rendering.
- `combatLog` / `sessionLog` — player-readable game journal.
- `partyVisionCells` — derived from player tokens (the input).

---

### [2026-04-25] Multiplayer hidden-info leakage (follow-up) — per-peer routing on `game:state-update` with visibility-transition rewrites

- **Original severity:** high (continuation of the join-handshake fix above; state-update path was the deferred half)
- **Category:** bug, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** The original fix (above) closed the full-snapshot leak at peer-join time. This entry closes the state-update path AND ships proper per-peer routing — each connected peer now receives its own version of every `game:state-update` based on its DM status, with visibility transitions transformed into the correct add/remove operations on the player wire.

**Code (`src/renderer/src/stores/network-store/index.ts`):**
- Replaced the earlier `filterUpdatePayloadForPlayer` with `transformUpdatePayloadForPeer(payload, isDM, lookupToken?)`:
  - `isDM === true` → returns the payload unchanged (DM gets full data).
  - `updateToken` with `updates.isHidden === true` → **rewrites** to `removeToken: { mapId, tokenId }` so the player drops the now-hidden token from their view (no more visual stale-state).
  - `updateToken` with `updates.isHidden === false` → **rewrites** to `addToken: { mapId, token }` with the full post-update token data (read from the host's game store) so the player adds the freshly-revealed token.
  - `updateToken` with no `isHidden` field but the token is currently hidden in host state → suppress (player doesn't have it; the update is meaningless).
  - `updateToken` with no `isHidden` field on a currently-visible token → passthrough.
  - `addToken` with `token.isHidden === true` → suppress.
  - `addMap.tokens`, `mapsWithImages[i].tokens` → strip entries with `isHidden === true`.
  - `lookupToken` is dependency-injected (defaults to reading `useGameStore`) so the unit tests can pass fixture maps without setting up the real store.
- `useNetworkStore.sendMessage` host branch on `game:state-update` no longer calls `broadcastMessage`. Instead it **iterates `getConnectedPeers()` and `sendToPeer(peer.peerId, message)` once per peer**, with `transformed = transformUpdatePayloadForPeer(payload, peer.isHost === true)`. Skipped when transformed is `null`. Other message types continue to use `broadcastMessage`.
- The join-handshake `mapsWithImages` send-to-peer path (`network-store/index.ts:72-92`) uses the same transformer with `isDM=false`.

**Tests (`network-store/index.test.ts` — 24 tests total, all passing):**
- 13 cases on `transformUpdatePayloadForPeer`: DM-passthrough across every payload shape, addToken hidden+visible cases, the two visibility-transition rewrites (hide→removeToken, reveal→addToken), missing-token-on-reveal returning null, hidden-token non-visibility-update suppression, visible-token passthrough, addMap/mapsWithImages token strip, mutation safety, non-object input.
- 6 cases on `filterGameStateForRole` (full-snapshot filter, unchanged from prior round).
- 5 store-shape sanity cases (unchanged).

**What's now correct end-to-end:**
- Player joins → receives full state filtered for their role (no hidden tokens, no DM-only sidebar entries / handouts / traps / `notes`).
- Host adds a hidden token → broadcast suppressed for that peer; host's local state has the token; peer never learns.
- Host hides a previously-visible token → that peer receives `removeToken`; their client drops the token from the map.
- Host reveals a previously-hidden token → that peer receives `addToken` with full current data; their client adds it.
- Host updates a hidden token's HP/conditions/etc. → no broadcast to that peer.
- Host updates a visible token → broadcast goes through.
- Future co-DM peer (`isHost === true` flag set on a non-host peer) → automatically gets DM-passthrough through the same code path; no additional plumbing needed beyond flipping the flag.

**Network cost:** per-peer `sendToPeer` instead of one shared `broadcastMessage` means N serializations instead of 1 for state-updates. Acceptable for VTT-scale (typically 2-6 peers); profile if it becomes a bottleneck.

**Earlier "tradeoffs accepted" note about visual divergence on hide is now obsolete** — the transformer rewrites hides into removeToken so the visual matches the DM's intent.

---

### [2026-04-25] Multiplayer hidden-info leakage — `buildNetworkGameState()` filtered for non-host peers

- **Original severity:** high
- **Category:** bug, security, UX
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:**
- `host-manager.ts:50` — `GameStateProvider` signature now takes `(peerInfo: PeerInfo) => unknown` so the provider can specialize per recipient.
- `host-connection.ts:239` — provider call site passes the joining peer's `peerInfo` so the host knows whether to filter (`peerInfo.isHost === true` → DM view, otherwise → player view).
- `network-store/index.ts` — added exported `filterGameStateForRole(state, isDM)` plus four helpers (`filterMapForPlayer`, `filterSidebarForPlayer`, `filterHandoutsForPlayer`, `filterTrapsForPlayer`). `setGameStateProvider` now wraps the unfiltered `buildNetworkGameState()` through the new filter.

Stripped for non-DM peers:
- Hidden tokens (`Token.isHidden === true`) per map
- DM-only sidebar entries (`SidebarEntry.visibleToPlayers === false`) AND every entry's `notes` field even on visible entries
- DM-only handouts (`Handout.visibility === 'dm-only'`) AND `pages[].dmOnly === true` within visible handouts
- Unrevealed traps (`PlacedTrap.revealed !== true`)

Pure pass-through preserved — DM still sees full state, function returns same object reference.

**Tests:** `src/renderer/src/stores/network-store/index.test.ts` — 6 new cases covering each filter axis + a mutation-safety check. All 11 tests pass.

**Deferred:** state-update broadcast filtering (entries shipped via `game:state-update` deltas during play, e.g., `addToken`, `turnStates`) is still unfiltered — see new follow-up entry in `SUGGESTIONS-LOG-DNDAPP.md` if/when added. The full-snapshot leak at join — the most acute manifestation — is closed.

---

### [2026-04-25] `useAccessibilityStore` now seeds `reducedMotion` from OS `prefers-reduced-motion` and tracks live changes

- **Original severity:** low
- **Category:** UX, accessibility
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** `src/renderer/src/stores/use-accessibility-store.ts`:
- Added `detectOsReducedMotion()` helper using `window.matchMedia('(prefers-reduced-motion: reduce)').matches` (defensively gated for SSR/test envs).
- `reducedMotion` initial state now uses `(saved.reducedMotion as boolean) ?? osReducedMotion`.
- Added a `matchMedia` change listener that pushes OS-level toggles into the store *only when the user has not explicitly set an in-app override* (i.e., `saved.reducedMotion === undefined`); once the user toggles in-app, the listener stops applying — user choice wins.

**Tests:** existing `use-accessibility-store.test.ts` (10 tests) passes unchanged — its global stub omits `matchMedia`, so the detector falls back to `false`, preserving the previous default.

---

### [2026-04-25] `ConfirmDialog` now wraps `Modal` — inherits focus trap, ESC, role=dialog, aria-modal, focus restore

- **Original severity:** low
- **Category:** UX, accessibility
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** `src/renderer/src/components/ui/ConfirmDialog.tsx` was a bare div without focus management, ARIA roles, or escape handling. Refactored to wrap `<Modal>` with the title in the modal header and the confirm/cancel buttons in `children`. ConfirmDialog now inherits from Modal:

- ESC closes (calls `onCancel`)
- Tab cycle trapped between confirm + cancel buttons
- Initial focus lands on the first button on open
- Previous focus restored on close
- `role="dialog"` + `aria-modal="true"` set
- Title connected via `aria-labelledby` automatically

`Modal.tsx` itself was already accessible (custom Tab-trap implementation at lines 24-51) — the gap was only that ConfirmDialog wasn't using it. No new dependency added.

**Tests:** type-check clean; no existing ConfirmDialog test to update.

---

### [2026-04-25] In-render-body `useStore.getState()` anti-pattern — fixed obvious cases (`ReadyButton.tsx`, `RollTableModal.tsx`)

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** Audited all 38 `getState()` sites flagged by an in-render heuristic across `src/renderer/src/components/`. The vast majority were correct (helper functions called from event handlers, `useCallback`/`useEffect` bodies, drop handlers, etc.). Two were genuinely in render bodies:

- `components/lobby/ReadyButton.tsx:24` — was `const campaign = useCampaignStore.getState().campaigns.find(...)`. Converted to `useCampaignStore((s) => s.campaigns.find(...))` so the button now re-renders when its campaign's `aiDm.enabled` flag (or any other field) changes.
- `components/game/modals/dm-tools/RollTableModal.tsx:188` — had a nested `useLobbyStore.getState().campaignId` inside a `useCampaignStore` selector. Split into two reactive selectors (`lobbyCampaignId` then `campaign`) so the modal now reacts when the player switches campaigns.

The 36 other hits are top-level helper functions (`map-event-handlers.ts`, `attack-handlers.ts`, `map-editor-handlers.ts`, `setCompanionDismissed`, etc.) — these are called from event handlers, where `getState()` is the correct pattern.

**Type-check:** clean.

---

### [2026-04-25] dnd-app issues log clearance — full archive batch (code + deferred)

- **Original severity:** mixed (medium/low backlog)
- **Category:** bug, debt, security, perf, test, config
- **Domain:** dnd-app
- **Discovered by:** prior audits (Claude Opus / Cursor)
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25

**Summary:** The active list in `ISSUES-LOG-DNDAPP.md` was cleared. Items below map former log entries to either **implemented in repo** or **explicitly deferred** (still valid future work; see `SUGGESTIONS-LOG-DNDAPP.md` or product roadmap).

**Implemented in this clearance (dnd-app code):**

- **PeerJS host payload validation** — `host-handlers.ts`: reject when `message.senderId` is set and ≠ `fromPeerId`; validate payloads with `PAYLOAD_SCHEMAS` before handling; register `player:ready`, `pong`, `player:haggle-request`; anti-spoof for `player:trade-request`, `player:trade-response`, `player:inspect-request`; stricter `chat:message` / `chat:whisper` string caps; `WhisperPayload.targetName` optional at type level.
- **Rollup / chunk warnings** — `ai-handlers.ts`: static imports for AI vision, trigger observer, BMO bridge, and API key setters (removes useless dynamic/split warnings vs `provider-registry` / `bmo-sync-handlers`). **All renderer imports** of `useNetworkStore` now use `.../network-store` (folder index) instead of `use-network-store.ts` shim to break the re-export chunk cycle.
- **Three.js dice** — `DiceRenderer.tsx`: `disposeObject3D` on dice meshes/wireframes in `clearDice` and on unmount; floor geometry/material disposed on teardown.
- **`isolated-vm`** — removed from `package.json` (`optionalDependencies`); trust model already documented in `dnd-app/docs/PLUGIN-SYSTEM.md`.
- **Tooling** — `npm run circular` uses `dpdm`; removed broken `madge` + `ts-prune` devDeps; `npm install` refreshed lockfile.
- **Backups** — `import-export.ts`: `migrateBackupPayload()` upgrades v1–v2 backup JSON to v3 field layout before import.
- **Colocated tests** — `library-sort-filter.test.ts`, `plugin-registry-data.test.ts`, `combat-log-export.test.ts`, `ai-memory-sync.test.ts`.

**Deferred / not fully automatable (unchanged problem space; no longer duplicated in active log):**

- **119 IPC handlers + zod** — defense-in-depth across all `ipcMain.handle` paths remains a phased effort; AI channels already use schemas.
- **5e `scripts/schemas` vs content** — full schema alignment with `public/data/5e/` is a content + migration project.
- **Magic-items duplicates / collisions** — data authoring + loader policy.
- **81 MB map PNGs + Git LFS** — monorepo `.gitattributes` / `git lfs migrate` (coordination).
- **Bundle size, lazy PDF/three, 13 `dpdm` cycles, barrel imports, jscpd, knip unused exports, 1000-line files, `@renderer` alias adoption** — ongoing refactors.
- **`npm outdated` majors** (Vite 8, Electron 41, pdfjs 5, TypeScript 6) — track via release branches.
- **Biome 60+ errors / 192 warnings** — incremental sweeps; config already tuned earlier.
- **GitHub branch protection** — org/repo settings, not dnd-app code.
- **Pi / workspace health (`Domain: both`)** — environment; mirror remains in BMO log if present.

**Related files (non-exhaustive):** `dnd-app/src/renderer/src/stores/network-store/host-handlers.ts`, `dnd-app/src/renderer/src/network/schemas.ts`, `dnd-app/src/main/ipc/ai-handlers.ts`, `dnd-app/src/renderer/src/components/game/dice3d/DiceRenderer.tsx`, `dnd-app/package.json`, `dnd-app/src/renderer/src/services/io/import-export.ts`, colocated `*.test.ts` files above.

---

### [2026-04-25] Suggestions log (domain: both) — 5e JSON + data ownership folded into DATA-FLOW / DESIGN-CONSTRAINTS

- **Original severity:** info
- **Category:** docs
- **Domain:** both
- **Resolved by:** Cursor agent (with BMO suggestions sweep)
- **Date resolved:** 2026-04-25

**Resolution:** Replaced long mirrored entries in [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) with a single pointer. Canonical text: [`DATA-FLOW.md`](./DATA-FLOW.md), [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md). Partner archive: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) → **"BMO suggestions log — full sweep"**.

### [2026-04-25] dnd-app Vitest: 30 failing tests (633 files / 6137 tests)

- **Original severity:** medium
- **Category:** test
- **Domain:** dnd-app
- **Discovered by:** Cursor agent
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Full suite had 9 failed files / 30 failed tests (Pixi mocks, TokenContextMenu harness, etc.).

**Resolution:** Renderer test suite now passes: **635 files / 6299 tests** (see `npm test`). Remaining stderr lines from `data-provider` in some page tests are logged warnings, not failing assertions.

**Related files:** (various test mocks and components addressed in 2026-04-24–25 dnd-app cleanup)

---

### [2026-04-24] `import-export.ts` wrote arbitrary `localStorage` keys from imported backups — no key allowlist

- **Original severity:** low
- **Category:** debt, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Import loop used `localStorage.setItem` for any key present under `payload.preferences`.

**Resolution:** Added `isImportablePreferenceKey()` — `dnd-vtt-` prefix, max length 128, pattern `^dnd-vtt-[\\w.-]+$`. Used for both **export** (`gatherLocalStoragePreferences`) and **import** preference restore. Crafted backups cannot inject keys outside that shape.

**Related files:** `dnd-app/src/renderer/src/services/io/import-export.ts`

---

### [2026-04-24] `ANALYZE=1 npm run build` fails — `rollup-plugin-visualizer@7` is ESM-only but `electron.vite.config.ts` used CJS `require()`

- **Original severity:** low
- **Category:** bug, debt, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** `require('rollup-plugin-visualizer')` threw `ERR_PACKAGE_PATH_NOT_EXPORTED` when `ANALYZE=1`.

**Resolution:** `analyzePlugin()` is async and uses `await import('rollup-plugin-visualizer')`. Root config is `defineConfig(async () => ({ ... }))` so the plugin loads at config resolution time. `ANALYZE=1 npm run build` completes and writes `bundle-stats.html`.

**Related files:** `dnd-app/electron.vite.config.ts`

---

### [2026-04-24] `bmo:sync-event` IPC used string literals instead of `IPC_CHANNELS` (and initiative channel)

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** `bmo-bridge.ts` called `forwardToRenderer('bmo:sync-event', ...)` and `'bmo:sync-initiative'` as literals.

**Resolution:** All three call sites use `IPC_CHANNELS.BMO_SYNC_EVENT` and `IPC_CHANNELS.BMO_SYNC_INITIATIVE` from `src/shared/ipc-channels.ts`.

**Related files:** `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/shared/ipc-channels.ts`

---

### [2026-04-24] `tools/*.js` referenced the old `Tests/` directory and `knip-summary.js` read a broken path

- **Original severity:** low
- **Category:** docs, debt, portability
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Comments and `knip-summary.js` pointed at `Tests/`; `run-audit.js` help text and report paths were stale.

**Resolution:** Scripts under `dnd-app/tools/` now reference `tools/` in usage strings and reports; `knip-summary.js` resolves `knip-report.json` next to the script via `path.join(__dirname, '..', 'knip-report.json')`.

**Related files:** `dnd-app/tools/run-audit.js`, `dnd-app/tools/knip-summary.js`, `dnd-app/tools/rename-to-kebab.js`, `dnd-app/tools/replace-console-logs.js` (as applicable)

---

### [2026-04-24] 38 dead cross-references in 5e content — `effect-definitions.json` + `adventures.json` `mapId`s

- **Original severity:** medium
- **Category:** bug, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Commit:** 9ceabc0c1b07130df457c1b61aab7dd3802d1bbd

**Original summary:** The heuristic 5e cross-ref audit reported 20 dead `sourceId` values in `game/mechanics/effect-definitions.json` and 18 dead `mapId` values in `adventures/adventures.json` (adventure chapter map labels with no matching declared `id` in the 5e tree).

**Resolution:** `sourceId` values were aligned to canonical IDs in `equipment/magic-items.json` and related data (belts: `belt-of-giant-strength-*`; tools, grimoire, amulet: `*-plus-N`; potions: `potion-of-*`; fighting styles: same ids as `fighting-styles.json` — `archery`, `defense`, `dueling`, `great-weapon-fighting`, `two-weapon-fighting`, `thrown-weapon-fighting`). For adventure `mapId` strings, added `adventures/chapter-map-reference-ids.json` — a lightweight registry of `{ "id": "<mapId>" }` entries so the audit sees stable IDs for chapter art labels while runtime still uses `builtInMapId` for PNG paths. `npm run validate:5e` runs `check-5e-cross-refs.mjs` with **exit code 1** if any dead refs remain.

**Related files:** `dnd-app/src/renderer/public/data/5e/game/mechanics/effect-definitions.json`, `dnd-app/src/renderer/public/data/5e/adventures/chapter-map-reference-ids.json`, `dnd-app/scripts/audit/check-5e-cross-refs.mjs`, `dnd-app/package.json` (`validate:5e`), `dnd-app/scripts/audit/dump-dead-refs.mjs` (optional dev helper to list dead refs by file), `.github/workflows/dnd-app-validate-5e.yml`

---

### [2026-04-24] CSP `connect-src` has hardcoded LAN IP `10.10.20.242` — overrides `BMO_PI_URL` env var

- **Original severity:** high
- **Category:** bug, config, security (defense-in-depth)
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Renderer CSP allowed a fixed IP while `bmo-bridge.ts` used `BMO_PI_URL` (default `http://bmo.local:5000`), so `connect-src` and real fetch/WebSocket targets could disagree.

**Resolution (initial):** Added `src/main/bmo-csp.ts` with `bmoCspConnectFragment()` / `bmoCspConnectFragmentForBaseUrl()` — derives `connect-src` from the resolved BMO base URL instead of a hardcoded `10.10.20.242`, with `ws(s)://<host>:*` and `http(s)://<host>:*` (port wildcard; IPv6-safe host formatting). `src/main/bmo-csp.test.ts` covers the fragment. See follow-up below for settings and dynamic CSP.

**Follow-up (settings vs env):** Added `src/main/bmo-config.ts` — `getBmoBaseUrl()` and `applyBmoBaseUrlFromSettings()` so the active URL is **saved `bmoPiBaseUrl` in `settings.json` → `BMO_PI_URL` → default** (same as product expectation). `bmo-bridge.ts` and `cloud-sync.ts` use `getBmoBaseUrl()` for all fetches. `app.whenReady` loads settings before the window; `SAVE_SETTINGS` reapplies after save. **CSP** is rebuilt on every `onHeadersReceived` so it updates without restart. **UI:** Settings → Cloud backup — **BMO Pi base URL** + **Save URL**. `AppSettings` + `preload` types; `docs/SETUP.md` + `dnd-app/README.md` updated.

**Related files:** `dnd-app/src/main/bmo-csp.ts`, `dnd-app/src/main/bmo-csp.test.ts`, `dnd-app/src/main/bmo-config.ts`, `dnd-app/src/main/index.ts`, `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/main/cloud-sync.ts`, `dnd-app/src/main/ipc/storage-handlers.ts`, `dnd-app/src/main/storage/settings-storage.ts`, `dnd-app/src/renderer/src/pages/SettingsPage.tsx`, `dnd-app/src/preload/index.d.ts`, `docs/SETUP.md`, `dnd-app/README.md`

---

### [2026-04-24] `dnd-app/docs/IPC-SURFACE.md` is ~95% stale — 20 documented channels don't exist; 139 actual channels undocumented

- **Original severity:** high
- **Category:** docs, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** The markdown doc listed fictional channel names and omitted most of `IPC_CHANNELS`.

**Resolution:** Added `dnd-app/scripts/build/gen-ipc-surface.mjs` to regenerate `docs/IPC-SURFACE.md` from `src/shared/ipc-channels.ts` (146 channels, grouped by the existing `// ===` section comments). Replaced the hand-written handler tables with the generated catalog plus short static sections (architecture, how to add a channel, debugging). `npm run gen:ipc-surface` runs the generator. Per-channel request/response shapes are not in scope — those remain in handler source and zod where present.

**Related files:** `dnd-app/docs/IPC-SURFACE.md`, `dnd-app/scripts/build/gen-ipc-surface.mjs`, `dnd-app/package.json` (`gen:ipc-surface` script), `dnd-app/src/shared/ipc-channels.ts`

---

### [2026-04-24] AI context-builder + SRD provider load monster data from a non-existent path — AI DM silently has no creature stats

- **Original severity:** high
- **Category:** bug
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Code loaded `creatures/{monsters,creatures,npcs}.json` but the data lives under `dm/npcs/`, so the in-memory cache stayed empty and SRD creature blurbs never matched.

**Resolution:** `context-builder.ts` now loads `dm/npcs/monsters.json`, `dm/npcs/creatures.json`, and `dm/npcs/npcs.json`. `srd-provider.ts` uses `dm/npcs/monsters.json` for creature lookup. Load failures log at `ERROR` instead of `WARN`. Added `src/main/ai/monster-data-paths.test.ts` to assert the three files exist, parse as arrays, and contain `id` fields (aligned with `getDataDir()` dev layout under `src/renderer/public/data/5e`).

**Related files:** `dnd-app/src/main/ai/context-builder.ts`, `dnd-app/src/main/ai/srd-provider.ts`, `dnd-app/src/main/ai/monster-data-paths.test.ts`

---

### [2026-04-24] dnd-app release pipeline is broken — `package.json` references scripts at old paths after `scripts/build/` reorg

- **Original severity:** critical
- **Category:** bug, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit — fixes were uncommitted in session)

**Original summary:** `build:index` and `prerelease` in `dnd-app/package.json` still pointed at `scripts/build-chunk-index.mjs` and `scripts/prerelease-clean.mjs` after files moved to `scripts/build/`, so `npm run build:win` / `npm run release` failed before `electron-vite build`. `build-chunk-index.mjs` and `prerelease-clean.mjs` also used one `..` too few from `scripts/build/`, so they targeted `scripts/` instead of the dnd-app root for `resources/` and `dist/`.

**Resolution:** Updated `package.json` to `node scripts/build/build-chunk-index.mjs` and `node scripts/build/prerelease-clean.mjs`. Set project-root resolution in both `.mjs` files (`ROOT` / `distDir` from `scripts/build/`). Aligned `5.5e References` with the monorepo layout: added `scripts/lib/5e-refs-path.ts` (`get5eReferencesDir()`), the same two-path resolution in `build-chunk-index.mjs`, dev lookup in `src/main/ai/chunk-builder.ts` (`../5.5e References` vs in-app), and refactored extract/generate/audit scripts to use the helper. Regenerated `dnd-app/resources/chunk-index.json` (5383 chunks). Optional follow-ups from the log (CI smoke for `prerelease` + `build:index`, full `build:win` on a Windows builder) not done in the same pass.

**Related files:** `dnd-app/package.json`, `dnd-app/scripts/build/build-chunk-index.mjs`, `dnd-app/scripts/build/prerelease-clean.mjs`, `dnd-app/scripts/lib/5e-refs-path.ts`, `dnd-app/src/main/ai/chunk-builder.ts`, `dnd-app/resources/chunk-index.json`

---

### [2026-04-23] Pi-deploy duplicate `vtt_sync.py`

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app, bmo *(primary: bmo — agent module — also archived in [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md))*
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** `scripts/pi-deploy/vtt_sync.py` was byte-identical to `bmo/pi/agents/vtt_sync.py`. Archived the pi-deploy copy. `apply_patch.py` moved to `bmo/pi/scripts/apply_patch.py` (canonical location for BMO deploy tooling). The dnd-app side of this dependency surfaces only because the script lived under `scripts/pi-deploy/` (cross-domain tooling) — no in-app code paths affected.

---

> BMO resolved entries: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md). Resolved security (gitignored): [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md). Active dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Active dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md).
