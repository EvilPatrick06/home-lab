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

> **2026-06-23 (dnd-resolver) — integration note.** Six entries below are ALREADY
> IMPLEMENTED by a prior `dnd-resolver` run, but that code is stranded on the
> **local, unpushed** branch `auto/dnd-resolver-salvage` (last commit `6f4d6a9b`,
> 2026-06-23): it was never pushed to origin, so the integrator never merged it —
> yet that run's resolution notes DID reach master's `RESOLVED-*.md` (via the
> union-merge driver). So master's resolved logs are AHEAD of master's code for:
> command palette (Ctrl+K), first-run onboarding tour, character/campaign
> export-import, in-app log open/export, update "What's New" release notes, and
> settings.json (main-process prefs) export. They are kept here as still-open
> w.r.t. master. **Fix = push + integrate `auto/dnd-resolver-salvage`** (a human /
> integrator call) — NOT re-implement, which would duplicate and conflict with the
> stranded branch. The other entries here (src/main/ai reorg, ai-service.ts
> decompose, helper-suffix, e2e + a11y harness) are genuinely open and untouched
> by that branch.

---

### [2026-06-24] README "Directory layout" is stale — references a non-existent `tools/` dir and wrong `scripts/` subfolders

- **Category:** docs
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The `## Directory layout` block in `dnd-app/README.md` (the canonical onboarding map for the repo) has drifted out of sync with the tree it documents. Concretely:

- It lists a top-level **`tools/`** directory (“dev utilities (audit runner, console→logger sweep, knip-summary)”) that **does not exist** — `ls dnd-app/tools` is a no-such-file. (The `knip.json` at the root and `scripts/audit/` suggest those utilities now live under `scripts/`.)
- Under `scripts/` it lists **`extract/`, `generate/`, `batch-utils/`, `fix/`** — **none of which exist**.
- It **omits six** `scripts/` subfolders that **do** exist: `dev/`, `i18n/`, `lib/`, `lint/`, `maintenance/`, `smoke/`.
- The `docs/` portion lists only 3 files (`IPC-SURFACE.md`, `PLUGIN-SYSTEM.md`, `phases/`) while `dnd-app/docs/` actually holds 10 top-level docs (also `ASSET-OFFLOAD.md`, `DEPENDENCIES.md`, `DESIGN-CONSTRAINTS.md`, `LLAMA-SERVER.md`, `RELEASE.md`, `SEED-PACKS.md`, `UI-LAYERS.md`, `WEB-VERSION-PLAN.md`).

A stale directory map is actively misleading for new contributors and agents — it sends them looking for folders that were renamed/removed and hides the ones in use.

**Proposed fix / improvement:**
- [ ] Rewrite the `scripts/` portion to match the real subdirs: `audit/ build/ dev/ i18n/ lib/ lint/ maintenance/ release/ schemas/ smoke/ submit/`.
- [ ] Remove the `tools/` entry (or, if those utilities still exist somewhere, point the entry at their real path).
- [ ] List the full `docs/` set (or generalize to “see `docs/` — IPC, plugin, release, design-constraints, etc.” so it stops bit-rotting per-file).
- [ ] Consider a tiny CI check (or a `scripts/` doc-lint) that diffs the documented top-level layout against the actual tree to catch future drift.

**Related files:** `dnd-app/README.md` (§ Directory layout, ~L185–240), `dnd-app/scripts/`, `dnd-app/docs/`

---

### [2026-06-24] Two near-identical `MapSelector.tsx` components (plus several duplicate component basenames) invite import confusion

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
There are **two** components both named `MapSelector.tsx`, both rendering an active-map `<select>` dropdown over the same `GameMap[]` / `activeMapId` data, living one directory apart:

- `src/renderer/src/components/game/dm/MapSelector.tsx` (47 LOC, props `maps/activeMapId/onSelectMap/onAddMap`)
- `src/renderer/src/components/game/game-layout/MapSelector.tsx` (36 LOC, props `maps/activeMapId/onSelect`; its own doc-comment says it was “Extracted from GameLayout”)

They are not identical (one has an Add-map affordance, different Tailwind classes), but they overlap enough that the identical name is a trap: an import auto-complete or a future refactor can easily grab the wrong one, and a reader grepping `MapSelector` gets two hits with no way to tell which is the DM-toolbar one. This is part of a broader pattern — the scan found same-basename component collisions for `ChatPanel.tsx` (`components/lobby/` vs `components/game/bottom/`) and `NPCManager.tsx` (`components/game/dm/` vs `pages/campaign-detail/`) as well.

**Proposed fix / improvement:**
- [ ] Decide whether the two `MapSelector`s should be unified into one parameterized component (variant prop for the Add-map button + class set) or kept separate but **renamed** to disambiguate (e.g. `DmMapSelector` / `MapToolbarSelector`).
- [ ] Apply the same disambiguation judgment to `ChatPanel` (LobbyChatPanel vs GameChatPanel) and `NPCManager` (campaign vs in-game) — rename or consolidate.
- [ ] No behavior change intended; this is naming/structure clarity (use `git mv` + import updates so history is preserved).

**Related files:** `src/renderer/src/components/game/dm/MapSelector.tsx`, `src/renderer/src/components/game/game-layout/MapSelector.tsx`, `src/renderer/src/components/lobby/ChatPanel.tsx`, `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/components/game/dm/NPCManager.tsx`, `src/renderer/src/pages/campaign-detail/NPCManager.tsx`

---

### [2026-06-24] Lone `services/__tests__/` directory breaks the otherwise-universal co-located test convention

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
The suite co-locates tests next to source essentially everywhere — ~849 `*.test.ts(x)` files sit beside the module they cover, and there is exactly **one** `__tests__/` directory in the whole tree: `src/renderer/src/services/__tests__/`, containing a single file `codebase-integrity.test.ts`. A reader (or a test-glob/coverage config) now has to account for two layouts for one outlier. The file itself is plausibly a deliberately cross-cutting test (it asserts something about the codebase as a whole rather than one module), which is a legitimate reason not to co-locate — but if so, the *convention* is undocumented, so the directory just looks like an inconsistency.

**Proposed fix / improvement:**
- [ ] If `codebase-integrity.test.ts` is a per-module test in disguise, move it next to its subject and delete the empty `__tests__/` dir to make the tree 100% co-located.
- [ ] If it is genuinely repo-wide, either relocate it to a clearly named home for cross-cutting checks (e.g. `src/renderer/src/test/` or a top-level `meta`/integrity test area) **and** add a one-line note to `dnd-app/docs/DESIGN-CONSTRAINTS.md` documenting that non-co-located tests live there — so the exception is intentional and discoverable rather than a stray `__tests__/`.

**Related files:** `src/renderer/src/services/__tests__/codebase-integrity.test.ts`, `dnd-app/vitest.config.ts`, `dnd-app/docs/DESIGN-CONSTRAINTS.md`

---

### [2026-06-23] `src/main/ai/` is a flat directory of 57 source modules — group into subfolders

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`src/main/ai/` holds ~57 non-test `.ts` modules (114 files counting co-located tests) flat in a single directory, with only `image/` and `prompt-sections/` broken out into subfolders. Several clear logical clusters are obvious from the filenames and would read far better grouped:

- **Provider clients** — `claude-client.ts`, `gemini-client.ts`, `openai-client.ts`, `ollama-client.ts`, `embedding-client.ts` (+ `provider-registry.ts`, `llm-provider.ts`, `model-routing.ts`) → a `clients/` subfolder.
- **Memory / retrieval** — `memory-manager.ts`, `vector-store.ts`, `embedding-index.ts`, `hybrid-search.ts`, `search-engine.ts`, `keyword-extractor.ts`, `entity-store.ts`, `entity-extraction.ts` → a `memory/` subfolder.
- **Context assembly** — `context-builder.ts`, `campaign-context.ts`, `character-context.ts`, `recap-context.ts`, `ollama-context.ts`, `chunk-builder.ts`, `token-budget.ts` → a `context/` subfolder.

Flat dirs this large make it hard to see module boundaries and inflate the cost of every `ls`/grep. Grouping is purely organizational (no behavior change).

**Proposed fix / improvement:**
- [ ] Agree on a small set of subfolders (`clients/`, `memory/`, `context/`, plus the existing `image/`, `prompt-sections/`).
- [ ] `git mv` modules + their co-located `*.test.ts` together so history is preserved.
- [ ] Update imports (TS path updates) and re-run `npm run circular` + `npm run dead-code` to confirm nothing broke.

**Related files:** `dnd-app/src/main/ai/` (whole tree)

**Related entries:** [2026-06-23] `ai-service.ts` god file; circular-dependency entry in `ISSUES-LOG-DNDAPP.md` (ai-service.ts ↔ campaign-context.ts ↔ campaign-storage.ts)

---

### [2026-06-23] `ai-service.ts` is a ~1,740-LOC (71 KB) god file — decompose into focused modules

- **Category:** debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
`src/main/ai/ai-service.ts` is the single largest hand-written module in the codebase at ~1,739 LOC / 71 KB (its co-located `ai-service.test.ts` is ~46 KB, and there are three additional split-out test files: `ai-service-file-read-cancel`, `ai-service-restream-context`, `ai-service-web-search-approval`). It is the main-process counterpart to the already-logged `SettingsPage.tsx` god component, but on the backend side. A file this size is hard to navigate, concentrates merge conflicts, and is implicated in the existing circular-dependency entry (`ai-service.ts → campaign-context.ts → campaign-storage.ts → ai-service.ts`) — decomposition is the natural way to break that cycle.

**Proposed fix / improvement:**
- [ ] Identify cohesive responsibilities inside `ai-service.ts` (e.g. request orchestration, streaming/restream handling, file-read/cancel, web-search approval — the test split already hints at the seams) and extract each into its own module under `src/main/ai/`.
- [ ] Keep `ai-service.ts` as a thin orchestrator that wires the extracted pieces together.
- [ ] Re-run `npm run circular` to confirm the extraction also resolves the ai-service ↔ campaign-context cycle.

**Related files:** `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/main/ai/ai-service.test.ts`

**Related entries:** [2026-06-22] `SettingsPage.tsx` is a ~1,950-LOC god component; circular-dependency entry in `ISSUES-LOG-DNDAPP.md`

---

### [2026-06-23] Inconsistent helper-module filename suffix: `-utils` vs `-helpers` vs `-utility/-utilities`

- **Category:** docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-cleanup
- **During:** automated cleanup/reorg scan of `dnd-app/`

**Description:**
Modules holding the same kind of "miscellaneous helper functions" are named with three different conventions across `src/`: `*-utils.ts` (9 files, e.g. `map-utils.ts`, `attack-utils.ts`, `dice-utils.ts`), `*-helpers.ts` (5 files, e.g. `attack-helpers.ts`, `dice-helpers.ts`, `broadcast-helpers.ts`), a bare `helpers.ts` (1), and `*-utility/-utilities.ts` (3, e.g. `equipment-utilities.ts`, `commands-utility.ts`, `commands-player-utility.ts`). The inconsistency is most visible in the combat code, which has BOTH `services/combat/attack-helpers.ts` and `components/game/modals/combat/attack-utils.ts`, and in chat-commands (`commands-utility.ts` + `commands-player-utility.ts` + `helpers.ts`). Picking one suffix (e.g. `-utils`) and renaming the others would make the codebase easier to grep and reason about.

**Proposed fix / improvement:**
- [ ] Decide on a single convention (suggest `-utils.ts`) and document it in `CONTRIBUTING.md` / `dnd-app/docs/DESIGN-CONSTRAINTS.md`.
- [ ] `git mv` the `-helpers.ts` / `-utility.ts` / `-utilities.ts` files to the chosen suffix (and their co-located tests) and update imports.
- [ ] Optionally add a `forbidden-patterns` lint check for new files using a non-canonical suffix.

**Related files:** `dnd-app/src/renderer/src/services/combat/attack-helpers.ts`, `dnd-app/src/renderer/src/components/game/modals/combat/attack-utils.ts`, `dnd-app/src/renderer/src/services/character/equipment-utilities.ts`, `dnd-app/src/renderer/src/services/chat-commands/{commands-utility,commands-player-utility,helpers}.ts`

---
### [2026-06-23] No end-to-end / full-app test harness despite a CI-built browser target ideal for it

- **Category:** future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (test tooling + web-target survey)

**Description:**
The suite is large and healthy at the unit/component layer — 841 `*.test.ts(x)` files run under vitest + `@testing-library/react` + happy-dom — but there is **no end-to-end / integration layer**: no Playwright, Spectron, or WebdriverIO anywhere in `package.json`, and no `e2e/` directory. So nothing exercises a full user journey across module boundaries (launch → create/import a character → create or join a campaign → land on the game table → roll dice / open the map). This is the class of regression unit tests structurally cannot catch (store-to-IPC-to-renderer wiring, route transitions, real DOM focus/keyboard flow). The app is unusually well-positioned to add this cheaply: `npm run build:web` already produces a real browser build that CI builds (`dnd-app-ci.yml`) and deploys (`dnd-web-deploy.yml`), and `docs/WEB-VERSION-PLAN.md` explicitly designs the web target to be "drivable by Claude-for-Chrome for automated QA." A Playwright smoke suite driving the deployed/served web build would close the integration gap without needing to automate Electron.

**Proposed fix / improvement:**
- [ ] Add Playwright (or similar) with a handful of smoke specs against the `build:web` output (serve via `preview:web`), covering the primary loop end-to-end.
- [ ] Wire it as a separate, possibly non-blocking CI job at first (it already builds the web bundle), promoting to required once stable.
- [ ] Keep the suite small + deterministic (seed data, no network to live BMO Pi) so it stays fast and is not flaky.

**Related files:** `package.json` (scripts `build:web`/`preview:web`), `.github/workflows/dnd-app-ci.yml`, `.github/workflows/dnd-web-deploy.yml`, `dnd-app/docs/WEB-VERSION-PLAN.md`, `vitest.config.ts`

---

### [2026-06-23] Rich, hand-built accessibility feature set has no automated a11y regression guard

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (accessibility store + test tooling survey)

**Description:**
The app carries a deliberately broad accessibility investment: `use-accessibility-store.ts` models `uiScale` (75-150% text scaling applied to `documentElement.fontSize`), `colorblindMode` (deuteranopia/protanopia/tritanopia via `ColorblindFilters` + `applyColorblindFilter`), `reducedMotion` (auto-seeded from `prefers-reduced-motion`), `screenReaderMode`, `tooltipsEnabled`, and full `customKeybindings`, plus a dedicated `high-contrast` theme. None of it is protected by an **automated a11y regression check** — there is no `axe-core` / `jest-axe` in `package.json` and no a11y assertions in the component tests (biome lint covers some static JSX-a11y rules, but not rendered-DOM contrast, roles, names, or focus order). With ~92 modals and a steady stream of new UI, a missing `aria-label`, an unlabeled control, or a contrast regression in a new component would ship silently and quietly erode the investment the a11y store represents.

**Proposed fix / improvement:**
- [ ] Add `jest-axe` (vitest-compatible) and assert zero violations in the existing render tests for high-traffic components (modals, the game table, character sheet, settings panels).
- [ ] Optionally run an `axe` pass over the deployed/served `build:web` output as a CI step (pairs naturally with the e2e harness suggested 2026-06-23).
- [ ] Start non-blocking to triage the existing baseline, then gate on *new* violations once clean.

**Related files:** `src/renderer/src/stores/use-accessibility-store.ts`, `src/renderer/src/components/ui/ColorblindFilters.tsx`, `src/renderer/src/services/theme-manager.ts`, `src/renderer/src/components/game/modals/*`, `package.json`

**Related entries:** see "No end-to-end / full-app test harness…" (2026-06-23) — an axe-over-web-build pass would share that harness.

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

### Surface release notes / "What's New" on update (auto-updater discards `releaseNotes`)

**Category:** future-idea, UX · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`src/main/updater.ts`'s `UpdateStatus` union carries only `version` for the `available` / `downloaded` states; electron-updater's `UpdateInfo.releaseNotes` is never read or forwarded to the renderer, and nothing under `src/renderer` renders `CHANGELOG.md`. So when the dismissible update prompt appears (auto-check defaults ON), the user sees a bare version number with no indication of what changed. Proposal: thread `releaseNotes` through `UpdateStatus` / the `UPDATE_STATUS` IPC and show a short "What's New" panel in the update prompt (and/or a one-time post-install changelog view sourced from `CHANGELOG.md` or the GitHub release body). Improves the upgrade decision and cuts "what did this update actually do?" friction. Related: `src/main/updater.ts`, `src/shared/ipc-channels.ts`, `CHANGELOG.md`.

### Settings export/import covers localStorage only — main-process `settings.json` (auto-update prefs) does not travel

**Category:** future-idea, portability · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`SettingsPage.tsx`'s Export Settings (~L1753) iterates `localStorage` and dumps every key into the export JSON; Import writes them back. That captures a11y, theme, keybindings, grid, dice, audio, etc. — but the auto-update preferences (`autoCheckUpdates`, `autoDownloadUpdates`, `autoRestartAfterUpdate`, `autoInstallSilent`) live in the **main process** at `userData/settings.json` (see `updater.ts > loadAutoUpdatePrefs`), so they are silently excluded. A user exporting settings to migrate to a new machine loses those four prefs with no warning. Proposal: add an IPC round-trip so export pulls `settings.json` (merged under a namespaced key) and import writes it back through the main process — or, at minimum, note in the export UI that update prefs are machine-local. Low severity (only 4 prefs, easily re-set), but it makes "Export Settings" quietly incomplete. Related: `src/renderer/src/pages/SettingsPage.tsx`, `src/main/updater.ts`.


