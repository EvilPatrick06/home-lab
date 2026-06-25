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

> **2026-06-24 (dnd-resolver) - approved-but-deferred this run.** The entries below
> were APPROVED (approve-all) but NOT implemented in this run: the two MapSelector /
> ChatPanel / NPCManager rename, the `.dndvtt` open-file handler, the Report-a-bug
> path, Settings search, the `src/main/ai` 57-module reorg, the `ai-service.ts`
> decompose, the helper-suffix rename, the e2e (Playwright) harness, the a11y (jest-axe)
> guard, and the settings.json main-process-prefs export. Each is a large refactor, a
> new test harness, or a UI feature needing interactive/visual verification; committing
> them unverified onto the shared `auto/dnd-resolver` branch would risk blocking the
> integrator from merging the verified fixes already pushed there (commit 21fc4bec).
> They are left diagnosed for a dedicated focused run, not abandoned.

> **2026-06-24 (dnd-resolver) - integration note (updated).** The prior salvage
> branch `auto/dnd-resolver-salvage` (tip `6f4d6a9b`) is now fully contained in
> `origin/master` (rev-list count origin/master..salvage = 0). Five of its six
> features are verified present on master and have been MOVED to
> `RESOLVED-ISSUES-DNDAPP.md`: command palette `CommandPalette.tsx`, first-run
> onboarding tour `use-onboarding-store.ts` + `OnboardingTour.tsx`, character and
> campaign export-import `services/io/character-io.ts` + `campaign-io.ts`, in-app log
> open/export `ipc/log-handlers.ts` `LOG_OPEN_FOLDER`, and the update release-notes
> panel `updater.ts` + `UpdateSection.tsx`. The SIXTH - settings.json main-process
> prefs export - is still genuinely open (no settings.json in the export path) and is
> kept as its own entry below. The other entries here - `src/main/ai` reorg,
> `ai-service.ts` decompose, helper-suffix, e2e + a11y harness - remain open.

---

### [2026-06-24] Campaign on-disk `.versions/` backups are write-only — no list/restore IPC or UI (asymmetric with characters)

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (storage layer + version-history survey)

**Description:**
`campaign-storage.ts` (saveCampaign, ~L55-75) writes a timestamped versioned backup to `<campaignsDir>/.versions/<id>/<id>_<ts>.json` before every overwrite and prunes to the latest 20 — a real, working safety net. But unlike characters, **none of it is reachable by the user.** Characters get the full path: on-disk `.versions/` PLUS `listCharacterVersions` / `restoreCharacterVersion` in `character-storage.ts`, the `CHARACTER_VERSIONS` + `CHARACTER_RESTORE_VERSION` IPC channels, and a restore UI in `CharacterSheet5ePage.tsx`. For campaigns there is **no `listCampaignVersions` / `restoreCampaignVersion`, no `CAMPAIGN_VERSIONS` / `CAMPAIGN_RESTORE_VERSION` IPC channel, and no UI** (grep confirms only the character variants exist). So the 20 campaign backups silently accumulate on disk and the user has no way to see or roll back to them when a campaign gets corrupted or a bad AI/DM action mangles state — the exact scenario the backups were written for. This also overlaps confusingly with the *separate* renderer-side autosave system (`services/io/auto-save.ts`) that keeps its own campaign "versions" in localStorage with its own UI — two parallel, non-interoperating version stores for the same object.

**Proposed fix / improvement:**
- [ ] Add `listCampaignVersions(id)` / `restoreCampaignVersion(id, fileName)` to `campaign-storage.ts` mirroring the character API (including the same path-traversal guard the character restore handler already applies to `fileName`).
- [ ] Expose them via new `CAMPAIGN_VERSIONS` / `CAMPAIGN_RESTORE_VERSION` IPC channels and a restore-from-history UI (campaign detail / load screen), reusing the character version-list component if practical.
- [ ] Decide how the on-disk `.versions/` store and the renderer localStorage autosave store should relate — ideally unify them so the user sees one coherent version history rather than two.

**Related files:** `dnd-app/src/main/storage/campaign-storage.ts` (`.versions/` write ~L55-75), `dnd-app/src/main/storage/character-storage.ts` (`listCharacterVersions`/`restoreCharacterVersion`), `dnd-app/src/main/ipc/storage-handlers.ts` (`CHARACTER_VERSIONS`/`CHARACTER_RESTORE_VERSION`), `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/renderer/src/services/io/auto-save.ts`, `dnd-app/src/renderer/src/pages/CharacterSheet5ePage.tsx`

---

### [2026-06-24] Renderer autosave stores full game-state snapshots in `localStorage` — quota-bound + synchronous, fragile on large campaigns and on the web target

- **Category:** future-idea, portability, performance
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (autosave service + web-persistence survey)

**Description:**
`services/io/auto-save.ts` periodically (default every 5 min, `maxVersions` 10) serializes the **entire game state** to JSON and stores each version under its own `localStorage` key (`autosave:<campaignId>:<versionId>`), plus a per-campaign manifest. `localStorage` has a hard ~5-10 MB per-origin quota, is **synchronous** (each `setItem` blocks the main thread), and throws `QuotaExceededError` on overflow. A large campaign (many tokens, maps, fog/lighting, drawings, NPC memory) serialized × up to 10 versions can realistically approach or exceed that quota, at which point `setItem` throws and autosaves are silently lost — or, worse, the throw cascades into other `localStorage`-backed settings writes. This is most acute on the **web target** (`build:web`), where there is no Electron file-system fallback at all, so localStorage is the only persistence the autosave path has. IndexedDB (async, hundreds of MB+ quota, structured-clone instead of JSON-stringify) is the standard home for blobs this size; in the Electron build the main-process file store (which already has the campaign `.versions/` mechanism) is an even better home.

**Proposed fix / improvement:**
- [ ] Move autosave snapshot bodies off `localStorage` to IndexedDB (keep only the small manifest in localStorage if convenient), or in the Electron build route them through a main-process IPC into the existing on-disk version store.
- [ ] Wrap the current `setItem` writes in `QuotaExceededError` handling as an immediate safeguard (evict oldest version + retry, and surface a toast) so autosave fails loud, not silent.
- [ ] Make the write async / chunked so a large snapshot doesn't jank the frame during a session.

**Related files:** `dnd-app/src/renderer/src/services/io/auto-save.ts`, `dnd-app/src/renderer/src/constants/settings-keys.ts` (`autosaveVersions`/`autosaveVersion` key builders), `dnd-app/docs/WEB-VERSION-PLAN.md`

**Related entries:** [2026-06-24] "Campaign on-disk `.versions/` backups are write-only…" (the two version systems should be reconciled).

---

### [2026-06-24] i18n has no RTL / document-`dir` infrastructure — adding any right-to-left locale would need layout work first

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (i18n config + locale survey)

**Description:**
The i18n stack (`src/renderer/src/i18n/`) ships two locales, `en` and `es`, both left-to-right, and the parity test (`locale-parity.test.ts`) is nicely set up to cover any future locale automatically. But there is **no right-to-left support anywhere**: `grep` finds no `documentElement.dir` / `dir=` management, `setLocale()` in `i18n/index.ts` only calls `changeLanguage` + persists the choice — it never sets the document direction — and the Tailwind/CSS is written with physical properties (`ml-*`, `pl-*`, `left-*`) rather than logical ones (`ms-*`, `ps-*`, `start-*`). So the moment someone adds an RTL locale (Arabic, Hebrew, Persian) — which the parity infrastructure otherwise invites — the entire UI would render mirrored-wrong (text right-aligned but layout still left-anchored). Logging now so the gap is known before a translator contributes an RTL `*.json` and is surprised the app doesn't flip.

**Proposed fix / improvement:**
- [ ] Add a per-locale `dir` ('ltr' | 'rtl') field and have `setLocale()` set `document.documentElement.dir` (and `lang`) on switch and on initial load.
- [ ] Audit high-traffic components for physical-direction Tailwind classes and migrate to logical properties (`ms/me`, `ps/pe`, `start/end`) where feasible; add a lint note for new code.
- [ ] Only then accept an RTL locale into `SUPPORTED_LOCALES` (the parity guard already handles the key-set side).

**Related files:** `dnd-app/src/renderer/src/i18n/index.ts` (`setLocale`), `dnd-app/src/renderer/src/i18n/config.ts` (`SUPPORTED_LOCALES`/`LOCALE_LABELS`), `dnd-app/src/renderer/src/i18n/locales/`, `dnd-app/src/renderer/src/main.tsx` (init path)

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

### [2026-06-24] OS file association `.dndvtt` is declared in the build config but has no open-file / argv handler

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (Electron main-process launch + build-config survey)

**Description:**
`package.json > build.fileAssociations` registers the `.dndvtt` extension ("D&D VTT Export", role `Editor`) so the OS installer associates that file type with the app — but **nothing in the main process handles being launched with a file path.** The `second-instance` handler in `src/main/index.ts` (~L335) only restores/focuses the existing window and never inspects `argv`; there is **no** `app.on('open-file', …)` handler anywhere (`grep "open-file" src/` → none), and no parsing of `process.argv` for a `.dndvtt` path on first launch. Net effect: a user who double-clicks a `.dndvtt` file (or "Open with → D&D VTT") just lands on the Main Menu with the file silently ignored on every platform — Windows/Linux pass the path as an argv to the first or second instance, macOS delivers it via the `open-file` event, and none of those paths are wired up. This is the OS-handler half of the (currently stranded — see the dnd-resolver integration note above) character/campaign export-import feature: even once export ships, double-click-to-open won't work until a handler is added.

**Proposed fix / improvement:**
- [ ] Add an `app.on('open-file', (e, path) => …)` handler (macOS) and parse `process.argv` for a trailing `*.dndvtt` path on first launch and inside the existing `second-instance` handler (Windows/Linux).
- [ ] Forward the resolved path to the renderer via a new IPC (e.g. `FILE_OPEN_REQUEST`) and route it into the import pipeline once character/campaign import lands.
- [ ] Until import exists, at minimum surface a friendly "Importing from file isn't available yet" toast instead of silently dropping the file — or hold the path and replay it after import ships.

**Related files:** `dnd-app/package.json` (`build.fileAssociations`), `src/main/index.ts` (`second-instance` handler ~L335), `src/shared/ipc-channels.ts`

**Related entries:** [2026-06-22] "No user-facing export/import of a character or campaign to a portable file" (this is the open-side handler for the file that entry's exporter would produce); dnd-resolver integration note at top of this section.

---

### [2026-06-24] No in-app "Report a bug" / feedback path to the GitHub issue tracker

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (renderer help/feedback-affordance survey)

**Description:**
The project has a public homepage + issue tracker (`package.json > homepage`/`repository` → `github.com/EvilPatrick06/home-lab`), writes a diagnostic log, and ships an auto-updater — but there is **no in-app affordance to report a bug or send feedback** (`grep -i "report.*bug|feedback|issues"` across `src/renderer` finds only code comments, no UI). A non-technical user who hits a problem has no in-app path to the issue tracker and no guided way to file a useful report. A small "Report a bug" / "Send feedback" entry (Settings → About/Help, or the Help menu) that opens the GitHub new-issue URL via `shell.openExternal` — ideally pre-filling app version, OS/arch, and electron version into the issue template — would convert silent frustration into actionable reports, and pairs naturally with the log-export and crash-capture ideas (attach the log/minidump the report needs).

**Proposed fix / improvement:**
- [ ] Add a "Report a bug" / "Send feedback" affordance (Settings About/Help section and/or the application Help menu) that `shell.openExternal`s the repo's new-issue URL with a query-string-prefilled template (version, `process.platform`/`arch`, electron version).
- [ ] Co-locate it with the proposed "Open log folder" / crash-dump affordances so a reporter can grab the artifacts in one place.
- [ ] Keep it offline-safe: if the user is offline, fall back to copying the prefilled report text + log path to the clipboard.

**Related files:** `dnd-app/package.json` (`homepage`/`repository`), `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/components/settings/*`

**Related entries:** [2026-06-22] "No in-app way to locate, open, or export the app log…"; [2026-06-24] crash-capture entry above.

---

### [2026-06-24] Settings is an ~18-section single-scroll page with no search or section navigation

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (SettingsPage composition survey)

**Description:**
`SettingsPage.tsx` renders ~18 distinct sections in one long vertical scroll — Profile, Language, Theme, Audio, Accessibility, Grid, Dice, Notifications, AutoSave, Settings Import/Export, Content Packs/Plugins, Registered Game Systems, Updates, Account, Cloud Backup, Ollama AI, Multiplayer Status (and the keybinding editor) — with **no search box, no tab/left-nav, and no section jump list**. Finding a specific toggle (say "reduced motion" or "auto-download updates") means scrolling and visually scanning the whole page. The page was already (healthily) decomposed into per-section components under `components/settings/`, so each section is a clean unit to index — a filter-as-you-type box that hides non-matching sections/rows, or a sticky left-rail of section anchors, would cut the time-to-setting sharply and scales as more sections are added. A settings search also composes with the proposed global command palette (Ctrl/Cmd-K could deep-link to a setting).

**Proposed fix / improvement:**
- [ ] Add a search/filter input at the top of `SettingsPage` that filters visible sections (and ideally individual labeled controls) by a label/keyword index derived from the section components.
- [ ] Or add a sticky section-nav rail (the section titles already exist via the `Section`/`title` prop) with scroll-spy highlighting; both can coexist.
- [ ] Ensure the filter is keyboard-operable and screen-reader friendly (announce result counts), consistent with the existing a11y investment.

**Related files:** `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/components/settings/*` (per-section components + `SettingsSection.tsx`)

**Related entries:** [2026-06-22] "No global command palette / quick-action launcher (Ctrl+K)…" (a settings search and a command palette reinforce each other).

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

### Settings export/import covers localStorage only — main-process `settings.json` (auto-update prefs) does not travel

**Category:** future-idea, portability · **Severity:** low · **Domain:** dnd-app · **Discovered by:** dnd-suggestor · **Added:** 2026-06-22

`SettingsPage.tsx`'s Export Settings (~L1753) iterates `localStorage` and dumps every key into the export JSON; Import writes them back. That captures a11y, theme, keybindings, grid, dice, audio, etc. — but the auto-update preferences (`autoCheckUpdates`, `autoDownloadUpdates`, `autoRestartAfterUpdate`, `autoInstallSilent`) live in the **main process** at `userData/settings.json` (see `updater.ts > loadAutoUpdatePrefs`), so they are silently excluded. A user exporting settings to migrate to a new machine loses those four prefs with no warning. Proposal: add an IPC round-trip so export pulls `settings.json` (merged under a namespaced key) and import writes it back through the main process — or, at minimum, note in the export UI that update prefs are machine-local. Low severity (only 4 prefs, easily re-set), but it makes "Export Settings" quietly incomplete. Related: `src/renderer/src/pages/SettingsPage.tsx`, `src/main/updater.ts`.

