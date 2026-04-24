# Phase 22 — Claude Opus: Comprehensive Codebase Analysis

**Date:** 2026-03-09
**Scope:** Performance, architecture, documentation, dependencies, accessibility, i18n, and general observations

---

## 1. Performance Concerns

### 1.1 Oversized Files (God Objects)

Several files have grown well past maintainable size. These increase parse time, complicate testing, and resist comprehension:

| File | Lines | Concern |
|------|-------|---------|
| `src/renderer/src/components/library/PdfViewer.tsx` | ~1,833 | Largest component; mixes rendering, ToC parsing, drawing overlay, search, and page navigation |
| `src/renderer/src/services/data-provider.ts` | ~1,162 | 60+ export functions, 79 `DATA_PATHS` entries, cache logic, homebrew merge, CDN fallback — all in one module |
| `src/renderer/src/components/game/modals/mechanics/DowntimeModal.tsx` | ~1,131 | Single modal handling 8+ downtime activity types with inline logic |
| `src/renderer/src/services/library-service.ts` | ~1,095 | Search indexing, filtering, PDF metadata, mixed concerns |
| `src/renderer/src/components/game/GameLayout.tsx` | ~1,030 | Layout, sidebar logic, modal orchestration, keyboard shortcuts, and state subscriptions combined |
| `src/renderer/src/services/combat/combat-resolver.ts` | ~955 | Core combat resolution; many branching code paths |
| `src/renderer/src/stores/network-store/client-handlers.ts` | ~879 | Handles every message type from host in one file |
| `src/renderer/src/components/game/map/MapCanvas.tsx` | ~838 | PixiJS initialization, event wiring, resize handling, and rendering logic |
| `src/renderer/src/services/io/import-dnd-beyond.ts` | ~727 | D&D Beyond JSON transformation — deeply nested conversion logic |
| `src/renderer/src/stores/builder/slices/build-character-5e.ts` | ~664 | Character builder orchestration — builds the full character object |

**Recommendation:** Extract sub-concerns (e.g., PdfViewer drawing into a separate component, data-provider into domain-specific loader modules, DowntimeModal into per-activity components).

### 1.2 Timer and Listener Leaks

Several `setTimeout`/`setInterval` calls lack cleanup, risking stale closures and memory leaks:

| File | Lines | Issue |
|------|-------|-------|
| `components/game/dice3d/DiceRenderer.tsx` | 230–238 | `setTimeout` in `onSettled` callback fires after 1,500ms with no `clearTimeout` on unmount or `rollRequest` change |
| `components/sheet/5e/ArmorManager5e.tsx` | 62, 158 | `setTimeout` for buy-warning auto-dismiss (3–4s); no cleanup ref |
| `components/sheet/5e/EquipmentListPanel5e.tsx` | 170 | Same pattern — `setTimeout(() => setBuyWarning(null), 3000)` |
| `components/game/player/ShopView.tsx` | 215 | `setTimeout` for haggle auto-resolve; no cleanup |
| `hooks/use-toast.ts` | 39 | `setTimeout` for toast auto-dismiss; not cleared if toast is manually dismissed first |
| `src/main/ai/ai-service.ts` | 115–125 | Top-level `setInterval` (60s) for stream TTL cleanup; never cleared on `app.on('will-quit')` |

**Event listener leaks:**

| File | Lines | Issue |
|------|-------|-------|
| `components/library/AudioPlayerItem.tsx` | 43–46 | `loadedmetadata` and `ended` listeners on `<audio>` element are never removed on unmount or `path` change |
| `components/game/overlays/PlayerHUDOverlay.tsx` | 73–74 | `mousemove`/`mouseup` added on `handleMouseDown`; if component unmounts during drag, listeners stay on `document` |

### 1.3 Inline Style Objects in JSX

Many components create new `style` objects on every render, defeating `React.memo` and `shouldComponentUpdate`:

- `components/game/bottom/ChatPanel.tsx` — lines 276–290, 311–318
- `components/library/PdfViewer.tsx` — lines 1606, 1713, 1735, 1756
- `components/game/GameLayout.tsx` — lines 565, 590, 604
- `components/library/LibraryItemList.tsx` — lines 82, 92 (virtualizer)
- `components/builder/5e/EquipmentShop5e.tsx` — lines 121, 129

Dynamic values (position, size from state) require inline styles. Static values like `fontSize: '8pt'` or `padding: '0.5rem'` should use CSS classes or extracted constants.

### 1.4 Static JSON Bundled Eagerly

14+ JSON files are statically imported at the top of component files, meaning they are parsed at module load time and included in the initial bundle chunk:

| Component | JSON Import |
|-----------|------------|
| `StatBlockEditor.tsx` | `creature-types.json` |
| `DMToolsTabContent.tsx` | `lighting-travel.json` |
| `DMAudioPanel.tsx` | `ambient-tracks.json` |
| `MapConfigStep.tsx` | `built-in-maps.json` |
| `AdventureWizard.tsx` | `adventure-seeds.json` |
| `SessionZeroStep.tsx` | `session-zero-config.json` |
| `dice-meshes.ts` | `dice-colors.json` |
| `DiceRoller.tsx` | `dice-types.json` |
| `DMTabPanel.tsx` | `dm-tabs.json` |
| `LanguagesTab5e.tsx` | `language-d12-table.json` |
| `SelectionFilterBar.tsx` | `rarity-options.json` |
| `AbilityScoreModal.tsx` | `ability-score-config.json` |
| `SkillsModal.tsx` | `skills.json` |
| `gear-tab-types.ts` | `currency-config.json` |

**Recommendation:** Prefer lazy loading via `data-provider.ts` / IPC, especially for data shown in modals that may never open.

### 1.5 Limited Use of React.memo

Only 5 components use `React.memo`:

- `ChatPanel.tsx` → `BottomChatMessage` (line 20)
- `lobby/ChatPanel.tsx` → `FileAttachment` (line 11), `MessageBubble` (line 71)
- `PlayerCard.tsx` (line 20)
- `CharacterCard.tsx` (line 14)
- `DiceResult.tsx` (line 12)

Lists rendering many items (initiative tracker entries, equipment lists, spell lists, token overlays) would benefit from memoized row components to avoid full-list re-renders on single-item state changes.

### 1.6 No Throttling on Rapid-Fire Events

Custom debounce implementations exist for auto-save (2–5s) and vision recompute, but there is no throttle utility in the codebase. Events like window resize, scroll, and rapid token drag rely on `requestAnimationFrame` alone. A shared `throttle` utility would standardize rate-limiting across interaction handlers.

### 1.7 Large Data Files in Public Directory

`src/renderer/public/data/5e/dm/npcs/monsters.json` is extremely large (~32k+ lines). 130+ MP3 sound files live in `src/renderer/public/sounds/`. These are loaded lazily via IPC, which is correct, but they inflate the app bundle size on disk. Consider lazy-downloading non-essential audio or using a CDN for sound assets.

---

## 2. Code Organization and Architecture Issues

### 2.1 Inconsistent Error Handling Across Layers

Four different error-handling patterns coexist without clear guidance on which to use where:

| Pattern | Used In | Example |
|---------|---------|---------|
| **Throw** | Game actions, IPC handlers | `token-actions.ts` lines 35, 38, 76, 78, etc. |
| **Return `null`** | Data loading, combat helpers | `data-provider.ts` lines 495, 548, 1024; `attack-resolver.ts` lines 100, 108 |
| **`StorageResult<T>`** | Main process storage | `map-library-storage.ts`, `homebrew-storage.ts`, `types.ts` |
| **Silent catch** | Fire-and-forget operations | `ai-handlers.ts` line 269: `.catch(() => {})` |

Services that throw force callers to wrap in try/catch, but callers that expect `null` don't catch. This creates inconsistency at integration boundaries. `use-character-store.ts` (lines 48–74) is a specific example where `saveCharacter` catches errors internally but doesn't propagate failure to callers, so the UI shows success even when save fails.

**Recommendation:** Establish a convention — e.g., storage always uses `StorageResult<T>`, services return `Result<T, E>` or throw domain errors, components catch at boundaries.

### 2.2 Components Bypassing the Service Layer

Several components call `window.api.*` (IPC) directly instead of going through `data-provider.ts` or domain services, which provide caching and centralized error handling:

| Component | Direct IPC Call | Should Use |
|-----------|----------------|------------|
| `game/sidebar/EquipmentTab.tsx` | `window.api.game.loadEquipment()` | `data-provider.load5eEquipment()` |
| `game/sidebar/SpellsTab.tsx` | `window.api.game.loadSpells()` | `data-provider.load5eSpells()` |
| `game/bottom/DMAudioPanel.tsx` | `window.api.audioListCustom()` | A dedicated audio service |
| `library/PdfViewer.tsx` | `window.api.books.readFile()`, `loadData()`, `saveData()` | `library-service` |
| `library/CoreBooksGrid.tsx` | `window.api.books.loadConfig()`, `showOpenDialog()` | `library-service` |
| `pages/SettingsPage.tsx` | `window.api.loadSettings()`, `saveSettings()` | A settings service |

Bypassing `data-provider` means these components miss the in-memory cache, duplicate fetch logic, and can't benefit from centralized error handling or homebrew merge.

### 2.3 Unused Code (Dead Exports and Files)

Knip analysis identifies significant dead code:

**10 unused files:**
- `src/renderer/src/constants/index.ts` (barrel file; consumers import sub-files directly)
- `src/renderer/src/network/index.ts` (barrel file)
- `src/renderer/src/types/index.ts` (barrel file)
- `src/renderer/src/types/user.ts` (`UserProfile` type defined but never used)
- 5+ files under `components/library/` including `HomebrewCreateModal`, `LibraryCategoryGrid` (WIP features)

**~138 unused exports** across the codebase, including:
- `getSearchEngine`, `describeChange`, `isNegativeChange` in AI service
- Bastion tables: `ALL_IS_WELL_FLAVORS`, `GUEST_TABLE`, etc.
- Network: `setSignalingServer`, `resetSignalingServer`, `PAYLOAD_SCHEMAS`
- Systems: `unregisterSystem`, `getAllSystems`
- Many `load5e*` functions in `data-provider.ts`

Some are intentional API surface for plugins or future features, but many are genuinely unused and increase bundle size.

### 2.4 Scattered Magic Numbers

Timeout values, layout dimensions, and configuration numbers appear as numeric literals rather than named constants:

| File | Values | Context |
|------|--------|---------|
| `components/game/GameLayout.tsx` | 320, 280, 200, 500 | Sidebar width and bottom bar height (px) |
| `services/io/ai-memory-sync.ts` | 2000, 1500 | Debounce delays in ms |
| `stores/use-ai-dm-store.ts` | 59000, 60000 | Typing timeout |
| `hooks/use-game-effects.ts` | 500, 1000, 60000, 1500 | Various poll and scene timeouts |
| `components/ui/UpdatePrompt.tsx` | 3000 | Auto-hide delay |
| `network/client-manager.ts` | 5000 | Chat length limit |
| `components/library/PdfViewer.tsx` | 2000 | `requestIdleCallback` timeout |
| `components/lobby/PlayerList.tsx` | 300000 | Mute duration (5 min) |

`app-constants.ts` already centralizes network constants. The remaining values should migrate there or to domain-specific constant files.

### 2.5 Repeated CRUD Modal Pattern

Many modals share the exact same pattern: `title`, `content`, `editingId` state, `handleSave`, `handleEdit`, `handleDelete`, `resetForm`. Examples:
- `SharedJournalModal.tsx`, `HandoutModal.tsx`
- `RuleManager.tsx`, `LoreManager.tsx`, `NPCManager.tsx`

A generic `CRUDModal<T>` component or custom hook (`useCrudModal`) could eliminate significant duplication.

### 2.6 Repeated Async Data Loading Pattern

Many components independently implement:
```typescript
useEffect(() => {
  let cancelled = false
  window.api.X().then(data => { if (!cancelled) setState(data) })
  return () => { cancelled = true }
}, [dep])
```

A shared `useAsyncData<T>(loader: () => Promise<T>, deps)` hook would standardize loading, error, and cancellation states.

### 2.7 ConversationManager Memory Accumulation

`src/main/ai/conversation-manager.ts` maintains a `conversations` Map keyed by campaign ID. When campaigns are deleted (via `campaign-storage.ts`), the corresponding conversation entries are not cleaned up, leading to gradual memory growth in long-running sessions.

### 2.8 IPC Channel-to-Schema Mapping Gap

IPC channels are centralized in `src/shared/ipc-channels.ts` (~220 lines), but only 3 Zod schemas exist in `ipc-schemas.ts` (AI-related). Most channels have no formal payload schema, relying on implicit contracts between the preload bridge and main process handlers. This makes it easy to introduce type mismatches.

---

## 3. Missing or Outdated Documentation

### 3.1 README.md Is Minimal

`README.md` contains boilerplate (Synopsis, Description, Example, Install, Test, License) and does not reflect the actual project. Missing:
- Build and dev commands (`npx electron-vite dev`, etc.)
- Architecture overview
- Contribution workflow
- System requirements (Node version, OS support)

`CLAUDE.md` serves as the actual internal reference but is agent-specific, not user-facing.

### 3.2 No CONTRIBUTING.md

No contribution guide exists. For an open-source or team project, this should cover:
- Development setup
- Branch naming and PR conventions
- Code style (Biome configuration)
- Test requirements
- IPC channel registration process

### 3.3 No CHANGELOG

No `CHANGELOG.md` or release notes file. The project is at version 1.9.9 with a GitHub release workflow but no structured change tracking.

### 3.4 No API Documentation

No TypeDoc, Storybook, or other generated documentation. Key public interfaces (`GameSystemPlugin`, `ContentPackManifest`, `StorageResult<T>`, the full IPC surface) lack centralized reference documentation. JSDoc coverage in `services/` is partial and uneven.

### 3.5 IPC Surface Not Documented

`ipc-channels.ts` has ~100 channel constants organized by domain (Storage, AI, Plugins, etc.), but there is no document mapping each channel to its request parameters, response shape, and error behavior. The preload script (`src/preload/index.ts`) exposes the bridge, and `index.d.ts` declares types, but a developer has to read both files plus the main-process handler to understand a single IPC call.

### 3.6 Game System Plugin API Undocumented

`GameSystemPlugin` in `src/renderer/src/systems/types.ts` defines the extension interface, but there is no developer guide on how to create a new game system. The D&D 5e implementation in `systems/dnd5e/` serves as the only reference.

---

## 4. Dependency Issues

### 4.1 Likely Unused Production Dependencies

| Package | Evidence |
|---------|----------|
| **`immer`** (v11.1.4) | No imports of `immer` in `src/`. Only incidental text matches ("glimmer", "shimmering") in JSON data files. Listed in `dependencies` but never used. |
| **`@pixi/react`** (v8.0.5) | No imports of `@pixi/react` or `PixiComponent`. PixiJS is used directly via `pixi.js` with imperative API in `map-pixi-setup.ts`. |
| **`@tiptap/extension-image`** (v3.20.0) | `JournalPanel.tsx` imports Link, Placeholder, and StarterKit — no Image extension. |

### 4.2 Script-Only Dependencies in `dependencies`

| Package | Evidence |
|---------|----------|
| **`@langchain/anthropic`** (v1.3.21) | Only used indirectly via `@langchain/langgraph` in `scripts/extract-5e-data.ts` (a build script, not runtime code). Should be in `devDependencies`. |
| **`@langchain/core`** (v1.1.29) | Same — transitive for `@langchain/langgraph`. |
| **`@langchain/langgraph`** (v1.2.0) | Used in `scripts/extract-5e-data.ts`, a data extraction script, not the app runtime. Should be in `devDependencies`. |

Moving these to `devDependencies` would reduce the production install footprint.

### 4.3 Package Override Proliferation

`package.json` contains 7 `overrides` entries:
```json
"overrides": {
  "minimatch": ">=10.2.1",
  "scheduler": "0.27.0",
  "fs-extra": "11.3.3",
  "commander": "12.1.0",
  "chalk": "4.1.2",
  "semver": "7.7.4",
  "entities": "4.5.0"
}
```

Each override indicates a transitive dependency conflict that npm cannot resolve automatically. This is a maintenance burden — when upgrading packages, these overrides may silently break or mask genuine incompatibilities. The `scheduler: "0.27.0"` override is particularly notable as it pins React's internal scheduler, which could break with future React updates.

### 4.4 Transitive Vulnerability: fast-xml-parser

`npm audit` reports **GHSA-fj3w-jwp8-x2g3** (stack overflow in XMLBuilder) in `fast-xml-parser` 5.0.0–5.3.7, pulled in via:
- `@aws-sdk/xml-builder` → `@aws-sdk/core` → `@aws-sdk/client-s3` (likely from `electron-updater`)

The AWS SDK chain is chunked separately (`vendor-aws` in `electron.vite.config.ts` line 67), limiting blast radius, but the vulnerability should be tracked.

### 4.5 Electron EOL Timeline

Electron 40.x reaches end-of-life on **June 30, 2026** (< 4 months from now). Planning the upgrade to Electron 41+ should begin soon to avoid running on an unsupported runtime.

### 4.6 No LICENSE File

`package.json` declares `"license": "ISC"` but there is no `LICENSE` or `LICENSE.md` file in the repository root. This creates legal ambiguity for contributors and users.

---

## 5. Accessibility Gaps

### 5.1 Accessibility Infrastructure (What Exists)

The project has a solid foundation:
- **`use-accessibility-store.ts`**: Zustand store with `uiScale`, `colorblindMode`, `reducedMotion`, `screenReaderMode`, `tooltipsEnabled`, custom keybindings — all persisted to localStorage.
- **`ColorblindFilters.tsx`**: SVG filters for deuteranopia, protanopia, tritanopia.
- **`ScreenReaderAnnouncer.tsx`**: `role="status"`, `aria-live="polite"`, `aria-atomic="true"` — centralized announcements.
- **`SkipToContent.tsx`**: Skip link targeting `#main-content`.
- **Shared `Modal.tsx`**: Focus trap, Escape to close, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus restore on close.
- **`use-reduced-motion.ts`**: Hook that reads both store setting and `prefers-reduced-motion` media query.

### 5.2 `useReducedMotion` Hook Is Never Used

Despite being defined in `src/renderer/src/hooks/use-reduced-motion.ts`, no component imports or calls `useReducedMotion()`. All animations (`transition-colors`, `transition-all`, `animate-spin`, custom CSS animations in `globals.css`) run unconditionally. The `reducedMotion` setting in the accessibility store has no effect on the UI.

### 5.3 50+ Modals Bypass the Shared Modal Component

Many modals use a hand-rolled backdrop-and-panel layout instead of the shared `Modal` component. These custom modals typically lack:
- Focus trap (Tab cycles to page elements behind the modal)
- `role="dialog"` and `aria-modal="true"`
- Automatic focus on open
- Focus restore on close
- Escape key handling (relying only on backdrop click)

Affected modals include: `CreatureModal`, `EncounterBuilderModal`, `TreasureGeneratorModal`, `ChaseTrackerModal`, `MobCalculatorModal`, `StudyActionModal`, `GroupRollModal`, `FamiliarSelectorModal`, `SteedSelectorModal`, `WildShapeBrowserModal`, `DowntimeModal`, `ShortcutReferenceModal`, `CustomEffectModal`, `AoETemplateModal`, `NarrowModalShell`, `RestModal`, `DMNotesModal`, `MagicItemTrackerModal`, and many more.

### 5.4 50+ Buttons Without Accessible Names

Many toolbar and icon-only buttons have no `aria-label`, no visible text, and rely solely on an icon (SVG or emoji) for meaning. The worst offender is `DMTabPanel.tsx`, with 30+ unlabeled buttons for DM tools. Other examples:

- `DMToolsTabContent.tsx` — 8 tool buttons (lines 53–74)
- `NPCManager.tsx` — edit/delete buttons (lines 189, 193, 268)
- `FeatureFilter5e.tsx` — filter toggles (lines 45, 119)
- `AiDmCard.tsx` — config buttons (lines 64, 71)
- `HelpModal.tsx` — section toggles (lines 224, 285, 324)

### 5.5 200+ Inputs Without Proper Labels

While the shared `Input` component supports `htmlFor`/`id` and `aria-invalid`/`aria-describedby`, most forms use raw `<input>` elements without:
- `id` paired with `<label htmlFor="...">`
- `aria-label` fallback
- `aria-describedby` for validation errors

`StatBlockEditor.tsx` alone has 30+ unlabeled inputs for creature stat editing.

### 5.6 50+ Backdrop Divs as Interactive Elements

Nearly every custom modal uses `<div onClick={onClose}>` as a backdrop dismiss target. These are non-interactive elements with click handlers but:
- No `role="button"` or `role="presentation"`
- No keyboard activation (Enter/Space)
- Not in the tab order

While Escape key handling (when present) mitigates this for keyboard users, `CharacterSummaryBar5e.tsx` (line 72) uses `<div onClick>` as a primary control for HP editing, which has no keyboard equivalent.

### 5.7 Color-Only State Indicators

Several components use color alone to convey state:
- `MainMenuPage.tsx` (lines 95–107): Red vs amber for disconnect reasons
- `HigherLevelEquipment5e.tsx` (lines 70, 86): Rarity indicated by color (green, blue, etc.)
- `RuleManager.tsx` (lines 6–7): Combat vs exploration via `bg-red-900` vs `bg-green-900`
- `TurnEventsTab.tsx` (lines 33, 49–50): Completed state and gold costs/gains via green/red
- `MacroBar.tsx` (line 61): Error state via color only

These lack text labels, icons, or `aria-label` attributes that would make the state perceivable without color vision.

### 5.8 Mouse-Only Interactions

| Component | Interaction | Keyboard Alternative |
|-----------|------------|---------------------|
| `PdfDrawingOverlay.tsx` | Draw with mouse | None |
| `HandoutViewerModal.tsx` | Drag handout | None |
| `ResizeHandle.tsx` | Resize panel by drag | None |
| `DiceTray.tsx` | Pick up dice by mouse | None |
| `PlayerHUDOverlay.tsx` | Drag HUD position | None |
| `LanguagesTab5e.tsx` | Hover for description | No `onFocus`/`onBlur` equivalent |

### 5.9 Form Validation Announcements Incomplete

The shared `Input` component uses `aria-invalid` and `aria-describedby` with `role="alert"` on error text, but most inline forms use custom error markup without these attributes. Screen reader users would miss validation feedback in:
- `StatBlockEditor.tsx` (all creature stat fields)
- `DiseaseCurseTracker.tsx` (disease/curse inputs)
- `AiProviderSetup.tsx` (API key fields)
- Most in-game modal forms

---

## 6. Localization / i18n Considerations

### 6.1 No i18n Framework

The project has no internationalization framework. No `react-intl`, `react-i18next`, `formatjs`, or equivalent is installed or configured. All UI text is hardcoded English strings.

### 6.2 Hardcoded English Strings Are Pervasive

Every component contains English string literals for:
- Button labels: `"Save"`, `"Cancel"`, `"Delete"`, `"Add"`, `"Close"`
- Status messages: `"Loading..."`, `"Error"`, `"Not enough funds"`, `"NPC import failed"`
- Placeholders: `"Search..."`, `"Enter name..."`, `"Type a message..."`
- Section headers: `"Ability Scores"`, `"Equipment"`, `"Spells"`
- Game terms: `"Hit Points"`, `"Armor Class"`, `"Initiative"`, `"Saving Throw"`

Extracting these to a string table would be the first step toward localization, even before adding multiple languages.

### 6.3 Date and Number Formatting Relies on Browser Locale

Dates and numbers are formatted via `toLocaleDateString()`, `toLocaleString()`, and `toLocaleString(undefined, {...})` throughout the app. The `undefined` locale parameter means output depends on the user's OS locale setting. There is no app-level locale preference.

Files using locale-dependent formatting include:
- `CloudSyncPanel.tsx`, `OverviewCard.tsx`, `StartStep.tsx`, `CampaignDetailPage.tsx`
- `CharacterSheet5ePage.tsx`, `MetricsCard.tsx`, `JournalPanel.tsx`, `DMNotepad.tsx`
- `EncounterBuilderModal.tsx`, `TreasureGeneratorModal.tsx`, `DowntimeModal.tsx`
- `DMTabPanel.tsx`, `UnifiedStatBlock.tsx`, `ChatPanel.tsx`

### 6.4 D&D Currency Uses Hardcoded Labels

Currency is displayed as `"25 gp"`, `"10 sp"`, etc. throughout the codebase with hardcoded abbreviations. While D&D currency is domain-specific, a localization layer could still map these for translated game systems.

### 6.5 No RTL Support

No `dir="rtl"`, `direction: rtl`, or bidirectional text handling exists. Layout assumes LTR exclusively. Supporting Arabic, Hebrew, or other RTL languages would require significant layout work.

---

## 7. Other Observations

### 7.1 Production Console Statements

Five `console.warn`/`console.error` calls bypass the logger's dev guard and run in production:

| File | Line | Statement |
|------|------|-----------|
| `components/library/PdfViewer.tsx` | 15 | `console.warn('[PdfViewer] Failed to load worker...')` |
| `services/combat/combat-resolver.ts` | 883–885 | `console.warn('[CombatResolver] applyDamageToToken: no active map...')` |
| `events/system-chat-bridge.ts` | 32 | `console.error('[SystemChatBridge] Handler error:', e)` |
| `stores/network-store/host-handlers.ts` | 132 | `console.warn('[host-handlers] Invalid buy-item payload...')` |
| `stores/network-store/host-handlers.ts` | 161 | `console.warn('[host-handlers] Invalid sell-item payload...')` |

These should use the project's `logger` utility (in `utils/logger.ts`) which is gated behind `import.meta.env.DEV`.

### 7.2 Security: Hardcoded Local Network IP in CSP

`src/main/index.ts` (line 62) hardcodes `10.10.20.242` in the Content Security Policy for the BMO Pi device:

```
piConnect = ' ws://10.10.20.242:* http://10.10.20.242:*'
```

This should be configurable via environment variable or settings to support different network configurations.

### 7.3 Security: Plugin Installer Uses PowerShell Exec

`src/main/plugins/plugin-installer.ts` (lines 27–28) uses PowerShell `Expand-Archive` with string interpolation:

```typescript
`Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`
```

While single quotes mitigate basic injection, a file path containing `'` could break out. Consider using Node's built-in `zlib` or a library like `adm-zip` instead of shelling out.

### 7.4 Security: JSON.parse Without Try/Catch

`src/main/ipc/game-data-handlers.ts` (line 28) calls `JSON.parse(content)` outside a try/catch block. Malformed JSON files in the data directory would throw an unhandled exception, crashing the IPC handler.

### 7.5 Security: Plugin ID Not Validated

`src/main/ipc/plugin-handlers.ts` accepts `pluginId` strings without format validation (length, allowed characters). A malicious or malformed plugin ID could create unexpected file paths or bloat the plugin-storage namespace.

### 7.6 Test Coverage Gaps

While 605+ tests across 29 files is solid, notable gaps exist:

| Area | Coverage |
|------|----------|
| `systems/dnd5e/` | Only `registry.test.ts`; no tests for the D&D 5e plugin implementation itself |
| `components/` (integration) | Component tests exist but don't cover modal interactions, form validation flows, or keyboard navigation |
| `src/main/` | 5 test files for AI, IPC, storage, and plugins — limited coverage of storage handlers and error paths |
| `network/` WebRTC integration | Schema validation is tested; actual connection/reconnection flows are not |
| Accessibility | No tests verify ARIA attributes, focus management, or screen reader announcements |

Coverage configuration (`vitest.config.ts`) only measures `services/` and `data/` — stores, components, hooks, and main process are excluded from coverage reports.

### 7.7 CI/CD Pipeline Is Minimal

`.github/workflows/release.yml` only runs on tag push (`v*`) and performs `npm ci` → `npm run release`. There is no:
- PR check workflow (lint, type-check, test on every push/PR)
- Matrix testing across multiple Node versions or OS targets
- Security scanning (npm audit, Snyk, etc.)
- Bundle size tracking
- E2E or integration testing in CI

### 7.8 Electron Security Model Is Well-Configured

The project follows Electron security best practices:
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- `contextBridge` with explicit API surface
- No `eval()` or `new Function()` in app code
- No `dangerouslySetInnerHTML`
- CSP configured (with `'unsafe-eval'` only in dev mode for HMR)
- Path traversal checks in file access handlers
- Zod validation on network messages
- File extension and MIME type allowlists for file sharing

### 7.9 Good Architectural Patterns Worth Noting

- **Circular dependency prevention**: Deliberate mitigations with lazy imports (`network-store`), extracted types (`dice-types.ts`, `bastion-modal-types.ts`), and store bootstrap ordering (`store-accessors.ts`, `register-stores.ts`). Knip confirms zero circular dependencies.
- **Network message validation**: Zod schemas for every message type, runtime validation on both host and client, chat moderation, blocked-extension checks with magic-byte verification.
- **Lazy route loading**: All 15 pages use `React.lazy()` with `Suspense` boundaries.
- **Virtualized lists**: `@tanstack/react-virtual` used for chat messages, library items, and equipment shops.
- **Manual chunk splitting**: `electron.vite.config.ts` defines 12 manual chunks (react, router, state, three, physics, pixi, tiptap, langchain, aws, anthropic, peerjs, pdfjs) for optimal code splitting.

### 7.10 `.env` Contains Live API Key

`c:\Users\evilp\dnd\.env` contains a live Anthropic API key (`sk-ant-api03-...`). While `.env` is properly listed in `.gitignore` (lines 8–10), this key should be rotated if it has ever been exposed (e.g., in logs, screenshots, or error reports).

### 7.11 Multi-Floor / Elevation Is State Without Effect

`FloorSelector.tsx` exists and `currentFloor` state is tracked in the game store, but it is never used for token visibility, layer filtering, or rendering. This is a half-implemented feature that could confuse users who see floor controls but experience no behavioral change.

### 7.12 Positional Audio Emitters Never Updated

`audio-emitter-overlay.ts` creates an `AudioEmitterLayer` with `updateEmitters()`, but this method is never called. The positional audio system is wired up at the rendering layer but has no driver.

### 7.13 TypeScript Discipline Is Excellent

- Zero `@ts-ignore` or `@ts-expect-error` comments in the entire codebase.
- Zero `as any` or `: any` annotations outside test files.
- Tests use `as any` for mock convenience (~150+ occurrences across test files), which is acceptable.
- TypeScript strict mode is enabled.

---

## Summary: Priority Matrix

### Critical (Address Soon)
1. **50+ modals bypass shared Modal** — missing focus traps, keyboard handling, and ARIA roles
2. **Timer leaks** in DiceRenderer, ArmorManager, ShopView — can fire after unmount
3. **Event listener leaks** in AudioPlayerItem and PlayerHUDOverlay
4. **`useReducedMotion` hook defined but never used** — accessibility setting has no effect
5. **CI pipeline has no PR checks** — no lint, type-check, or test validation on pull requests

### High (Plan for Next Sprint)
6. **Inconsistent error handling** — 4 patterns with no convention
7. **Components bypassing service layer** — EquipmentTab, SpellsTab miss caching
8. **200+ inputs without proper labels** — screen reader users cannot navigate forms
9. **50+ buttons without accessible names** — toolbar icons unidentifiable without sight
10. **Unused dependencies** (`immer`, `@pixi/react`, `@tiptap/extension-image`) inflate install

### Medium (Track and Resolve)
11. **God object files** (PdfViewer 1,833 lines, data-provider 1,162 lines) — split into sub-modules
12. **~138 unused exports** — prune or mark as intentional plugin API
13. **Magic numbers scattered** — centralize in constants
14. **No i18n framework** — all strings hardcoded in English
15. **Electron 40 EOL June 2026** — begin upgrade planning
16. **No CHANGELOG, CONTRIBUTING, or LICENSE file**
17. **Production console statements** — route through logger

### Low (Nice to Have)
18. **Static JSON imports in components** — prefer lazy loading
19. **Inline style objects** — extract static values to CSS
20. **Repeated CRUD modal pattern** — abstract to shared component/hook
21. **No RTL language support**
22. **No API documentation generator**
