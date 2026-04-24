# Phase 7 — About & Data Analysis

**Agent:** Claude Opus 4.6 Max  
**Date:** 2026-03-09  
**Scope:** About page, versioning, data persistence, export/import/backup, data integrity risks, schema gaps

---

## 1. About Page

### 1.1 Presence and Route

The About page exists and is fully functional.

| Item | Detail |
|------|--------|
| Component | `src/renderer/src/pages/AboutPage.tsx` (381 lines) |
| Route | `/about` — defined in `App.tsx` line 222 |
| Lazy-loaded | `App.tsx` line 25: `const AboutPage = lazy(() => import('./pages/AboutPage'))` |
| Menu entry | `MainMenuPage.tsx` lines 68–88 — label: "About & Data", description: "App info, updates, and backup/restore your data" |
| Test | `src/renderer/src/pages/AboutPage.test.tsx` — import-only smoke test, does not verify content or behavior |

### 1.2 Page Content

The About page (`AboutPage.tsx`) is well-populated with seven distinct sections:

1. **Hero (lines 135–221):** App title "D&D Virtual Tabletop", sword icon, version display, and update controls (check/download/install).
2. **Description (lines 223–226):** One-paragraph summary of the app.
3. **Data Management (lines 229–254):** "Export All Data" and "Import Data" buttons with confirmation dialog.
4. **Supported Systems (lines 257–263):** D&D 5th Edition shown as "Full Support".
5. **Features (lines 266–276):** 24-item `FEATURES` array (lines 8–32) covering character builder, maps, dice, multiplayer, AI DM, etc.
6. **Tech Stack (lines 279–289):** 11-item `TECH_STACK` array (lines 34–46) — Electron 40, React 19, TypeScript 5.9, Tailwind v4, Zustand v5, PeerJS, PixiJS 8, Three.js, TipTap, Vitest, electron-vite.
7. **Credits (lines 292–304):** Created by Gavin Knotts; Built with Cursor AI.
8. **Legal & Licensing (lines 307–361):** SRD 5.2 CC-BY-4.0 attribution, Fan Content Policy, Trademark Notice, Open Source Libraries.
9. **Footer (lines 363–366):** © 2025-2026 Gavin Knotts.

### 1.3 Accuracy Assessment

| Claim | Accurate? | Notes |
|-------|-----------|-------|
| "Electron 40" | Yes | `package.json` devDependency: `electron@^40` |
| "React 19" | Yes | `package.json` dependency: `react@^19` |
| "TypeScript 5.9" | Yes | `package.json` devDependency: `typescript@^5.9` |
| "Tailwind CSS v4" | Yes | Uses `@tailwindcss/vite` plugin, CSS-first config |
| "Zustand v5" | Yes | `package.json` dependency: `zustand@^5` |
| "PeerJS" | Yes | WebRTC P2P networking in `src/renderer/src/network/` |
| "PixiJS 8" | Yes | Map rendering in `src/renderer/src/components/game/map/` |
| "Three.js" | Yes | 3D dice in `src/renderer/src/components/game/dice3d/` |
| "TipTap" | Yes | Rich text journal editor |
| "D&D 5e Full Support" | Yes | Pluggable system in `src/renderer/src/systems/dnd5e/` |
| "167+ chat commands" | Plausible | 26 command modules in `src/renderer/src/services/chat-commands/` |
| "AI Dungeon Master (Ollama)" | Partially | Page says "Ollama" but codebase also supports Claude API (`@anthropic-ai/sdk`); About page does not mention Claude |

### 1.4 Issues Found

| ID | Severity | Description |
|----|----------|-------------|
| ABOUT-1 | Low | `/version` chat command (aliases: `ver`, `about`) in `commands-utility.ts` lines 150–163 returns hardcoded text `"D&D VTT — 5e 2024 Edition | Electron + React 19 + PixiJS"` without the actual version number. Should include `__APP_VERSION__`. |
| ABOUT-2 | Low | About page lists "AI Dungeon Master (Ollama)" in features but the app also supports Claude via `@anthropic-ai/sdk` in `src/main/ai/`. The feature description is incomplete. |
| ABOUT-3 | Low | `AboutPage.test.tsx` only tests that the module imports; no assertions on rendered content, version display, or update flow. |
| ABOUT-4 | Info | No separate About modal — About is a full-page route only. Not a bug, but modals are common in desktop apps for quick info access. |

---

## 2. App Versioning

### 2.1 Version Source

Single source of truth: `package.json` line 3 — `"version": "1.9.9"`.

### 2.2 Build-Time Injection

| File | Line(s) | What Happens |
|------|---------|--------------|
| `electron.vite.config.ts` | 8–9 | Loads `package.json`, reads `version` field |
| `electron.vite.config.ts` | 45–46 | Injects into renderer: `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` |
| `src/renderer/src/global.d.ts` | 4 | TypeScript declaration: `const __APP_VERSION__: string` |

The `__APP_VERSION__` constant is only injected into the **renderer** process. Main and preload processes do not receive it (they use `app.getVersion()` directly).

### 2.3 Runtime Access

| Context | Mechanism | File | Line(s) |
|---------|-----------|------|---------|
| Main process | `app.getVersion()` (reads `package.json`) | `src/main/updater.ts` | 61–63 |
| Preload bridge | `ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION)` | `src/preload/index.ts` | 214 |
| IPC channel | `'app:version'` | `src/shared/ipc-channels.ts` | 156 |
| Renderer (compile-time) | `__APP_VERSION__` global | `electron.vite.config.ts` | 46 |
| Renderer (runtime) | `window.api.getVersion()` → IPC → `app.getVersion()` | `AboutPage.tsx` | 62–64 |

### 2.4 Where Version is Displayed

| Location | File | Line(s) | Method |
|----------|------|---------|--------|
| Main menu footer | `MainMenuPage.tsx` | 148–149 | `__APP_VERSION__` with `'dev'` fallback |
| About page hero | `AboutPage.tsx` | 53, 138 | `window.api.getVersion()` with `__APP_VERSION__` fallback, then `'1.0.0'` fallback |
| Update prompt | `UpdatePrompt.tsx` | 66–67, 80, 115 | `status.version` from updater (target version, not current) |

### 2.5 Auto-Updater

| File | Purpose |
|------|---------|
| `src/main/updater.ts` | Registers IPC handlers, wraps `electron-updater` |
| `package.json` lines 70–75 | Publish config: GitHub releases provider, `owner: gavink97`, `repo: dnd` |
| `src/renderer/src/components/ui/UpdatePrompt.tsx` | Floating update banner in UI |
| `AboutPage.tsx` lines 139–220 | Full update flow: check → download (progress bar) → install & restart |

### 2.6 Version Flow

```
package.json "version"
  ├── app.getVersion()          → main process, auto-updater, IPC handler
  ├── __APP_VERSION__           → renderer compile-time (Vite define)
  └── electron-updater          → compares against GitHub release tags
```

### 2.7 Issues Found

| ID | Severity | Description |
|----|----------|-------------|
| VER-1 | Low | `/version` chat command does not include the actual version number (see ABOUT-1). |
| VER-2 | Low | `UpdatePrompt.tsx` line 44–46: `removeStatusListener` uses `removeAllListeners(IPC_CHANNELS.UPDATE_STATUS)`, meaning one component can clear listeners set by another (e.g., AboutPage and UpdatePrompt). Brittle shared-listener design. |
| VER-3 | Info | Both `MainMenuPage` and `AboutPage` have fallback guards for `__APP_VERSION__` — appropriate for dev mode safety. |

---

## 3. User Data Persistence

### 3.1 Storage Architecture Overview

Data is persisted through two parallel systems:

1. **Main-process file storage** — JSON files under Electron's `userData` directory (`app.getPath('userData')`), accessed via IPC.
2. **Renderer localStorage** — Browser-local `localStorage` for preferences, auto-save snapshots, and session state.

All main-process storage modules follow the `StorageResult<T>` pattern defined in `src/main/storage/types.ts`:

```typescript
export type StorageResult<T> = {
  success: boolean
  data?: T
  error?: string
}
```

**Exception:** `settings-storage.ts` and `ai-conversation-storage.ts` do not use `StorageResult` — they return raw data or throw.

### 3.2 File Storage Layout

| Storage Module | Directory | File Pattern | Migration? |
|----------------|-----------|--------------|------------|
| `character-storage.ts` | `{userData}/characters/` | `{id}.json` | Yes (v1→v3) |
| `campaign-storage.ts` | `{userData}/campaigns/` | `{id}.json` | Yes (v1→v3, on single-load only) |
| `game-state-storage.ts` | `{userData}/game-states/` | `{campaignId}.json` | **No** |
| `settings-storage.ts` | `{userData}/` | `settings.json` | **No** |
| `bastion-storage.ts` | `{userData}/bastions/` | `{id}.json` | Yes (v1→v3) |
| `homebrew-storage.ts` | `{userData}/homebrew/` | `{type}/{id}.json` | **No** |
| `custom-creature-storage.ts` | `{userData}/custom-creatures/` | `{id}.json` | **No** |
| `map-library-storage.ts` | `{userData}/map-library/` | `{id}.json` | **No** |
| `image-library-storage.ts` | `{userData}/image-library/` | `{id}{ext}` + `{id}.meta.json` | **No** |
| `shop-storage.ts` | `{userData}/shop-templates/` | `{id}.json` | **No** |
| `book-storage.ts` | `{userData}/` | `book-config.json` | **No** |
| `book-storage.ts` | `{userData}/books/` | `{bookId}-data.json` + PDFs | **No** |
| `ai-conversation-storage.ts` | `{userData}/ai-conversations/` | `{campaignId}.json` | **No** |
| Bans (inline in `ipc/index.ts`) | `{userData}/bans/` | `{campaignId}.json` | **No** |

### 3.3 Character Persistence

**Store:** `src/renderer/src/stores/use-character-store.ts` (lines 22–186)

**Flow:** Renderer store → IPC (`storage:save-character`) → `character-storage.saveCharacter()` → `{userData}/characters/{id}.json`

**Key details:**
- Characters are validated for `id` (UUID format) before save (`character-storage.ts` lines 46–51).
- Schema version is stamped on every save (`character-storage.ts` line 52).
- **Versioned backups:** Before overwrite, existing file is copied to `characters/.versions/{id}/{id}_{timestamp}.json` — last 20 versions kept (`character-storage.ts` lines 55–71).
- **Type definition:** `Character5e` in `src/renderer/src/types/character-5e.ts` — comprehensive type covering id, gameSystem, name, species, classes, abilityScores, hitPoints, spells, equipment, features, proficiencies, etc.
- **Multiple save points:** Character saves happen from CharacterSheet, CombatStatsBar, DeathSaves, FeaturesSection, NotesSection, HitPointsBar, ClassResources, ItemModal, RestModal, LevelUpPage, and game handlers.

**Builder auto-save:** `src/renderer/src/services/io/builder-auto-save.ts` saves drafts to localStorage under `builder-draft-{characterId}` or `builder-draft-new`, debounced at 2 seconds.

### 3.4 Campaign Persistence

**Store:** `src/renderer/src/stores/use-campaign-store.ts` (lines 26–128)

**Flow:** Renderer store → IPC (`storage:save-campaign`) → `campaign-storage.saveCampaign()` → `{userData}/campaigns/{id}.json`

**Key details:**
- UUID validation on save (`campaign-storage.ts` lines 42–44).
- Schema version stamped on every save (line 45).
- **No versioned backups** — unlike characters, campaigns have no version history.
- **Cascade delete** on campaign removal: deletes game-states, ai-conversations, bans, and campaign subdirs (`campaign-storage.ts` lines 104–115).
- **Type definition:** `Campaign` in `src/renderer/src/types/campaign.ts` (lines 72–118) — id, name, maps, npcs, lore, journal, aiDm config, calendar, etc.

**Game state is split:**
- **Campaign document** (`campaigns/{id}.json`): metadata, journal, NPCs, lore, settings.
- **Live game state** (`game-states/{campaignId}.json`): maps, initiative, conditions, combat state, weather, handouts, shop — saved by `game-auto-save.ts`.
- `game-state-saver.ts` merges game state back into the campaign document when the DM explicitly saves.

### 3.5 Settings Persistence

**Main-process settings:** `{userData}/settings.json` via `settings-storage.ts`
- Interface: `AppSettings` = `{ turnServers?: RTCIceServerConfig[], userProfile?: UserProfile }`
- `UserProfile` = `{ id, displayName, avatarPath?, createdAt }`
- Does **not** use `StorageResult` — returns `{}` on load failure, throws on save failure.

**Renderer localStorage keys:**

| Key | Store/Service | Data Stored |
|-----|---------------|-------------|
| `dnd-vtt-accessibility` | `useAccessibilityStore` | uiScale, colorblindMode, reducedMotion, screenReaderMode, tooltipsEnabled, customKeybindings |
| `dnd-vtt-theme` | `theme-manager` | Theme name (dark, parchment, etc.) |
| `dnd-vtt-dice-mode` | `SettingsPage` | '3d' or '2d' |
| `dnd-vtt-grid-opacity` | `SettingsPage` | Number string |
| `dnd-vtt-grid-color` | `SettingsPage` | Color string |
| `dnd-vtt-ai-narration-tts` | `useNarrationTtsStore` | 'true' / 'false' |
| `lobby-dice-colors` | `useLobbyStore` | DiceColors JSON |
| `lobby-chat-{campaignId}` | `useLobbyStore` | Chat history (max 100, excludes file messages) |
| `dnd-vtt-macros-{characterId}` | `useMacroStore` | Macro hotbar + library |
| `notification-config` | `notification-service` | enabled, enabledEvents, soundEnabled, onlyWhenBlurred |
| `autosave:config` | `auto-save.ts` | enabled, intervalMs, maxVersions |
| `autosave:{campaignId}:versions` | `auto-save.ts` | Version manifest |
| `autosave:{campaignId}:{versionId}` | `auto-save.ts` | Snapshot data |
| `builder-draft-{characterId}` | `builder-auto-save.ts` | Builder state draft |
| `DISPLAY_NAME_KEY` | `SettingsPage` | User display name |

### 3.6 Zustand Store Persistence

**No `zustand/middleware/persist` is used anywhere in the codebase.** All stores implement custom persistence:

| Store | Mechanism |
|-------|-----------|
| `useAccessibilityStore` | Manual `localStorage.setItem` on each setter; `loadPersistedState()` on init |
| `useLobbyStore` | `persistDiceColors()`, `persistChatHistory()` on change; load on demand |
| `useMacroStore` | `debouncedSave()` → localStorage; `loadForCharacter()` on demand |
| `useNarrationTtsStore` | `persistEnabled()` on change; `loadPersistedEnabled()` on init |
| `useCharacterStore` | IPC to main-process file storage only |
| `useCampaignStore` | IPC to main-process file storage only |
| `useGameStore` | Game state via IPC auto-save; no direct localStorage |

---

## 4. Data Export/Import/Backup

### 4.1 Full Backup System

**File:** `src/renderer/src/services/io/import-export.ts`

| Function | Lines | Format | Description |
|----------|-------|--------|-------------|
| `exportAllData()` | 173–217 | `.dndbackup` | Gathers characters, campaigns, bastions, custom creatures, homebrew, settings, and `dnd-vtt-*` localStorage preferences into a single JSON file |
| `importAllData()` | 223–292 | `.dndbackup` | Restores all data from backup; overwrites existing items with same IDs |

**Backup format:** `BackupPayload` (lines 138–148) with `BACKUP_VERSION = 2`.

**Size limits:**
- Export write limit: 10 MB (`MAX_WRITE_CONTENT_SIZE` from `src/shared/constants.ts`)
- Import read limit: 50 MB (`MAX_READ_FILE_SIZE` from `src/shared/constants.ts`)

**Version compatibility:** v1 backups (missing `customCreatures` and `homebrew`) are handled gracefully (lines 251–253).

**UI:** Export and Import buttons on the About page (lines 229–254), with a confirmation dialog before import (lines 369–377).

### 4.2 Character Export/Import

| Function | File | Format | Notes |
|----------|------|--------|-------|
| `exportCharacterToFile()` | `character-io.ts` | `.dndchar` | Native character file via save dialog |
| `serializeCharacter()` | `character-io.ts` | JSON string | In-memory serialization |
| `exportCharacter()` | `import-export.ts` | `.json` | Generic JSON export |
| `exportCharacterToPdf()` | `pdf-export.ts` | `.pdf` | Character sheet via jsPDF |
| `importCharacterFromFile()` | `character-io.ts` | `.dndchar` | Native character import |
| `importCharacter()` | `import-export.ts` | `.json` | Generic JSON import; validates id, name, gameSystem |
| `importDndBeyondCharacter()` | `import-dnd-beyond.ts` | `.json` | D&D Beyond character JSON → `Character5e` |
| `importFoundryCharacter()` | `import-foundry.ts` | `.json` | Foundry VTT 5e actor export → `Character5e` |

### 4.3 Campaign Export/Import

| Function | File | Format |
|----------|------|--------|
| `exportCampaign()` / `exportCampaignToFile()` | `campaign-io.ts` | `.dndcamp` |
| `importCampaign()` / `importCampaignFromFile()` | `campaign-io.ts` | `.dndcamp` |

### 4.4 Entity Export/Import

**File:** `src/renderer/src/services/io/entity-io.ts`

Unified system with versioned envelope format: `{ version: 1, type, exportedAt, count, data }`

**Supported entity types:** monster, npc, encounter, map, lore, bastion, companion, mount, journal, ai, settings, adventure — each with its own file extension (`.dndmonster`, `.dndnpc`, `.dndencounter`, `.dndmap`, etc.)

**Functions:** `exportEntities()` (lines 93–130), `exportSingleEntity()` (lines 132–134), `importEntities()` (lines 151–202).

**Import handling:** Accepts both envelope format and bare object/array. `reIdItems()` (lines 218–224) assigns new UUIDs on import.

### 4.5 Adventure Export/Import

**File:** `src/renderer/src/services/io/adventure-io.ts` — format `.dndadv` with `{ adventure, encounters?, npcs? }`.

### 4.6 Character Version History

**Main process:** `character-storage.ts` lines 55–71 — before every save, copies the current file to `.versions/{id}/{id}_{timestamp}.json`. Keeps last 20 versions.

**API:** `listCharacterVersions(id)` (lines 87–118), `restoreCharacterVersion(id, fileName)` (lines 120–145).

**UI:** `CharacterSheet5ePage` — "History" button opens version history modal with restore capability.

### 4.7 Cloud Backup (Google Drive via Rclone)

**File:** `src/main/cloud-sync.ts` — uses Rclone on a Raspberry Pi bridge (`BMO_PI_URL` / `bmo.local:5000`).

| Function | Purpose |
|----------|---------|
| `backupCampaignToCloud()` | Syncs campaign data to Google Drive via Rclone |
| `checkCloudSyncStatus()` | Checks Rclone configuration status |
| `listCloudCampaigns()` | Lists campaigns stored in the cloud |

**UI:** `CloudSyncButton.tsx`, `CloudSyncPanel.tsx` in renderer.

**Note:** This requires a specific Raspberry Pi infrastructure — not portable to arbitrary user environments.

### 4.8 Combat Log Export

**File:** `src/renderer/src/services/io/combat-log-export.ts` — provides `exportCombatLogText()`, `exportCombatLogJSON()`, `exportCombatLogCSV()`. However, these functions return strings only and have **no file dialog integration** — they are not wired to any UI for saving to disk.

### 4.9 What's NOT Backed Up

The full backup (`exportAllData`) does **not** include:
- Game states (`game-states/{campaignId}.json`) — live combat state, maps, initiative
- AI conversation history (`ai-conversations/{campaignId}.json`)
- Ban lists (`bans/{campaignId}.json`)
- Image library files (binary images + metadata)
- Map library entries
- Shop templates
- Book configurations and data
- Auto-save snapshots (localStorage)

### 4.10 Issues Found

| ID | Severity | Description |
|----|----------|-------------|
| EXP-1 | **High** | Full backup (`exportAllData`) does not include game states, meaning active combat state, map positions, initiative order, conditions, weather, handouts, and shop inventory would be lost on restore. |
| EXP-2 | **Medium** | Full backup does not include AI conversation history, image library, map library, or shop templates — these are silently lost on restore. |
| EXP-3 | Low | Combat log export functions exist but have no UI integration — users cannot save combat logs to files. |
| EXP-4 | Low | Cloud sync is hardcoded to a specific Raspberry Pi endpoint (`bmo.local:5000`); not usable by other users. |
| EXP-5 | Low | Campaign export does not include the associated game state file — exported campaigns lose all live game data. |

---

## 5. Data Loss and Corruption Risks

### 5.1 Non-Atomic File Writes (HIGH RISK)

**All storage modules** use direct `writeFile()` without atomic write patterns (write-to-temp-then-rename). If the app crashes or power is lost during a write, the target file can be left truncated or corrupted.

**Affected files:**
- `character-storage.ts` line 74: `await writeFile(path, JSON.stringify(character, null, 2), 'utf-8')`
- `campaign-storage.ts` line 47: `await writeFile(path, JSON.stringify(campaign, null, 2), 'utf-8')`
- `game-state-storage.ts` line 44: `await writeFile(path, JSON.stringify(state, null, 2), 'utf-8')`
- `settings-storage.ts` line 39: `await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')`
- All other storage modules follow the same pattern.

**Mitigation present:** Character storage creates a versioned backup *before* overwriting (line 56–61), so the previous version survives. But if the write itself corrupts the file, the current save is lost.

**Recommended fix:** Write to `{filename}.tmp`, then `rename()` (atomic on most filesystems) to the final path.

### 5.2 No Validation on Load (MEDIUM RISK)

Several storage modules load JSON and trust the file contents without runtime schema validation:

| File | Line | Issue |
|------|------|-------|
| `game-state-storage.ts` | 61 | `return { success: true, data: JSON.parse(data) }` — no validation |
| `settings-storage.ts` | 30 | `return JSON.parse(content) as AppSettings` — type assertion only |
| `auto-save.ts` | 229 | `return JSON.parse(raw) as unknown` — localStorage data unvalidated |
| `builder-auto-save.ts` | 43–47 | Minimal check (`parsed.state` exists); `state` is `Record<string, unknown>` |

If a file is manually edited, partially written, or corrupted, the app will load invalid data into the store, potentially causing runtime crashes or silent data loss.

### 5.3 Campaign Migration Inconsistency (MEDIUM RISK)

**File:** `campaign-storage.ts`

- `loadCampaigns()` (line 54–76): Does **NOT** call `migrateData()` — returns raw `JSON.parse(data)` for all campaigns.
- `loadCampaign(id)` (line 78–92): **DOES** call `migrateData()`.

This means the campaign list view can display un-migrated data. If any code relies on migrated fields (e.g., `conditions` array added in v2), it could encounter `undefined` when iterating the list.

### 5.4 Race Conditions in Auto-Save

**File:** `src/renderer/src/services/io/game-auto-save.ts`

- Debounced save with `setTimeout` (line 52–59). Rapid state changes can result in overlapping save calls if the previous write hasn't completed.
- `buildSavePayload()` reads state at the time the timeout fires — concurrent state mutations between the trigger and the save can produce inconsistent snapshots.
- `flushAutoSave()` (line 110) and `scheduleSave()` (line 49) can both trigger saves for the same campaign without coordination.

**File:** `src/renderer/src/services/io/auto-save.ts` (localStorage snapshots)

- Same debounce pattern. localStorage writes are synchronous so less risky, but `localStorage.setItem` can silently fail if storage is full (handled — lines 147–166).

### 5.5 Network State Injection (MEDIUM RISK)

**File:** `src/renderer/src/stores/network-store/client-handlers.ts`

- `applyGameState(data)` (line 63–65) passes `Record<string, unknown>` directly to `loadGameState` — a malicious or buggy host can push arbitrary data into the client's game store.
- `handleGameStateUpdate` (lines 71–94) assumes specific payload shapes (`addToken`, `removeToken`, `updateToken`, `addMap`, `wallSegments`) via direct property access and type casts — no Zod validation.

**File:** `src/renderer/src/network/schemas.ts`

- `StateUpdatePayloadSchema` uses `value: z.unknown()` (line 78) — any value accepted.
- `CharacterSelectPayloadSchema`: `characterData: z.unknown().optional()` (line 99).
- `CharacterUpdatePayloadSchema`: `characterData: z.unknown()` (line ~131).

### 5.6 IPC Save Without Schema Validation (MEDIUM RISK)

**File:** `src/main/ipc/storage-handlers.ts`

All save handlers accept data from the renderer without Zod or runtime validation:

| Line | Handler | What's Accepted |
|------|---------|-----------------|
| 58 | `SAVE_CHARACTER` | `character` — untyped |
| 97 | `SAVE_CAMPAIGN` | `campaign` — untyped |
| 128 | `SAVE_BASTION` | `bastion` — untyped |
| 159 | `SAVE_CUSTOM_CREATURE` | `creature` — untyped |
| 190 | `SAVE_GAME_STATE` | `state: Record<string, unknown>` — no validation |
| 251 | `MAP_LIBRARY_SAVE` | `data: Record<string, unknown>` — no validation |
| 272 | `SHOP_TEMPLATE_SAVE` | `inventory: unknown[]` — no validation |

Only `id` and UUID format are checked in the storage layer. The data shape is not validated.

### 5.7 Hardcoded Book Paths (LOW RISK)

**File:** `src/main/storage/book-storage.ts` lines 187–203

`CORE_BOOK_DEFS` contains absolute paths specific to the developer's machine:

```
C:\Users\evilp\dnd\5.5e References\PHB2024\PlayersHandbook2024.pdf
C:\Users\evilp\dnd\5.5e References\DMG2024\Dungeon_Masters_Guide_2024.pdf
C:\Users\evilp\dnd\5.5e References\MM2025\Monster Manual 2024.pdf
```

These will silently fail on other machines (handled gracefully — `registerCoreBooks` skips missing files), but represent non-portable code.

### 5.8 localStorage Quota Risk (LOW RISK)

Auto-save snapshots are stored in localStorage (`auto-save.ts`), which has a typical 5–10 MB browser limit. Each game state snapshot can be large (maps, tokens, initiative data). The service handles quota errors (lines 147–166) by evicting the oldest version, but if a single snapshot exceeds available space, it fails silently.

### 5.9 Summary of Risk Levels

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|--------|
| Non-atomic writes | **High** | Medium (crash during save) | Data corruption, loss of character/campaign |
| No load validation | Medium | Low (manual edit, partial write) | Runtime errors, silent bad data |
| Campaign migration gap | Medium | Medium (any schema change) | Incorrect data in list views |
| Network state injection | Medium | Low (requires malicious host) | Client state corruption |
| IPC save without validation | Medium | Low (requires compromised renderer) | Garbage data persisted to disk |
| Auto-save race conditions | Low | Low (very rapid saves) | Inconsistent save snapshots |
| localStorage quota | Low | Medium (large campaigns) | Silent loss of auto-save versions |

---

## 6. Data Models and Schema Issues

### 6.1 Type Coverage

The codebase has comprehensive TypeScript types for all major data entities:

| Entity | Location | Type Name | Completeness |
|--------|----------|-----------|-------------|
| Characters | `types/character-5e.ts` | `Character5e` | Comprehensive — covers all 5e character fields |
| Character commons | `types/character-common.ts` | `AbilityScoreSet`, `Currency`, `SpellEntry`, etc. | Good |
| Campaigns | `types/campaign.ts` | `Campaign`, `CampaignSettings`, `SessionJournal`, etc. | Good |
| Maps/Tokens | `types/map.ts` | `GameMap`, `MapToken`, `WallSegment`, `FogOfWarData`, etc. | Good |
| Game State | `types/game-state.ts` | `GameState`, `InitiativeState`, `InitiativeEntry`, etc. | Good |
| Game Store Slices | `stores/game/types.ts` | Slice interfaces | Good |
| Settings | `storage/settings-storage.ts` | `AppSettings`, `UserProfile` | Minimal — only TURN/profile |

### 6.2 Zod Schema Coverage

**Present and well-defined:**
- Network message envelope: `NetworkMessageEnvelopeSchema` (`network/schemas.ts`)
- Network payloads: ~30+ payload schemas for chat, dice, initiative, shop, journal, etc.
- AI schemas: `AiConfigSchema`, `AiChatRequestSchema`, etc. (`src/main/ai/ai-schemas.ts`)
- IPC schemas: `src/shared/ipc-schemas.ts`

**Using `z.unknown()` (weak validation):**

| Schema | Field | File | Line |
|--------|-------|------|------|
| `NetworkMessageEnvelopeSchema` | `payload` | `network/schemas.ts` | 23 |
| `StateUpdatePayloadSchema` | `value` | `network/schemas.ts` | 78 |
| `CharacterSelectPayloadSchema` | `characterData` | `network/schemas.ts` | 99 |
| `CharacterUpdatePayloadSchema` | `characterData` | `network/schemas.ts` | ~131 |
| `InspectResponsePayloadSchema` | `characterData` | `network/schemas.ts` | ~420 |

**Completely absent:**
- No Zod schemas for IPC save operations (character, campaign, bastion, game state, homebrew, creatures)
- No Zod schemas for file import validation (import-export.ts does manual field checks only)
- No Zod schemas for localStorage data loading

### 6.3 Schema Migration

**File:** `src/main/storage/migrations.ts`

| Version | Changes |
|---------|---------|
| 1 → 2 | Adds `schemaVersion: 2`, adds `conditions: []` for dnd5e entities |
| 2 → 3 | No-op (hitDiceRemaining migration removed — all data already migrated) |

**Current:** `CURRENT_SCHEMA_VERSION = 3`

**Applied to:** characters, campaigns (single-load only), bastions.

**NOT applied to:** game states, settings, custom creatures, homebrew, maps, images, shops, books, AI conversations.

### 6.4 Missing Schemas / Models

| Gap | Description |
|-----|-------------|
| Game state migration | `game-state-storage.ts` has no schema version or migration path. Schema changes to `GameState` (e.g., new fields for combat timer, weather presets) cannot be migrated on existing saves. |
| Homebrew schema | `homebrew-storage.ts` stores arbitrary `Record<string, unknown>` with no type definition or validation for homebrew entries. |
| Custom creature schema | `custom-creature-storage.ts` stores `Record<string, unknown>` — no creature-specific type validation. |
| Ban list type | Bans are managed inline in `ipc/index.ts` (lines 62–118) without a storage module or `StorageResult` pattern. |
| AI conversation type | `ai-conversation-storage.ts` uses `ConversationData` but doesn't use `StorageResult` and throws on invalid IDs instead of returning error results. |
| Settings schema | `AppSettings` only covers `turnServers` and `userProfile` — no types for the many localStorage-based preferences. |

### 6.5 `any` Usage

Core application code avoids explicit `any` (biome lint rule `noExplicitAny: warn`). Usage is primarily in test files. However, extensive use of `Record<string, unknown>` and `z.unknown()` achieves a similar effect — data passes through type boundaries without structure validation.

### 6.6 Optional Field Concerns

In `types/character-5e.ts`, many fields are optional (`subspecies?`, `size?`, `creatureType?`, `appearance?`, `personality?`, etc.). While reasonable for a flexible character model, this means consuming code must handle `undefined` at every access point. No defaults are applied at the type level.

---

## 7. Consolidated Recommendations

### Critical Priority

| # | Recommendation | Affected Files |
|---|----------------|----------------|
| 1 | **Implement atomic writes** (write to `.tmp` → `rename`) across all storage modules to prevent data corruption on crash | All files in `src/main/storage/` |
| 2 | **Include game states in full backup** — active combat, maps, initiative, conditions are critical user data | `import-export.ts` |

### High Priority

| # | Recommendation | Affected Files |
|---|----------------|----------------|
| 3 | Add migration support to `game-state-storage.ts` — game state currently has no versioning | `game-state-storage.ts`, `migrations.ts` |
| 4 | Fix campaign `loadCampaigns()` to run `migrateData()` like `loadCampaign()` does | `campaign-storage.ts` line 61 |
| 5 | Add Zod validation to IPC save handlers for character, campaign, and game state data | `storage-handlers.ts` |
| 6 | Expand full backup to include AI conversations, image library, map library, and shop templates | `import-export.ts` |

### Medium Priority

| # | Recommendation | Affected Files |
|---|----------------|----------------|
| 7 | Add Zod schemas for `Character5e` and `Campaign` types to validate data on load | New schema files + storage modules |
| 8 | Validate network character payloads instead of using `z.unknown()` | `network/schemas.ts` |
| 9 | Add versioned backups for campaigns (matching character version system) | `campaign-storage.ts` |
| 10 | Fix `/version` chat command to include actual `__APP_VERSION__` | `commands-utility.ts` line 160 |
| 11 | Add save queue/lock to prevent concurrent writes to the same file | `game-auto-save.ts` |

### Low Priority

| # | Recommendation | Affected Files |
|---|----------------|----------------|
| 12 | Make `removeStatusListener` component-scoped instead of clearing all listeners | `preload/index.ts`, `UpdatePrompt.tsx` |
| 13 | Remove hardcoded `CORE_BOOK_DEFS` paths; make book registration user-driven | `book-storage.ts` |
| 14 | Wire combat log export to a UI action with file save dialog | `combat-log-export.ts` |
| 15 | Standardize `settings-storage.ts` and `ai-conversation-storage.ts` to use `StorageResult` pattern | Both files |
| 16 | Move bans storage from inline IPC handler to a proper storage module | `ipc/index.ts` |
| 17 | Mention Claude API support alongside Ollama in About page features | `AboutPage.tsx` |

---

## 8. File Reference Index

| Purpose | Path |
|---------|------|
| About page | `src/renderer/src/pages/AboutPage.tsx` |
| About page test | `src/renderer/src/pages/AboutPage.test.tsx` |
| Main menu | `src/renderer/src/pages/MainMenuPage.tsx` |
| App routes | `src/renderer/src/App.tsx` |
| Version injection | `electron.vite.config.ts` |
| Version global type | `src/renderer/src/global.d.ts` |
| Version IPC + updater | `src/main/updater.ts` |
| Update prompt | `src/renderer/src/components/ui/UpdatePrompt.tsx` |
| Version chat command | `src/renderer/src/services/chat-commands/commands-utility.ts` |
| IPC channels | `src/shared/ipc-channels.ts` |
| Preload API | `src/preload/index.ts` |
| Storage types | `src/main/storage/types.ts` |
| Character storage | `src/main/storage/character-storage.ts` |
| Campaign storage | `src/main/storage/campaign-storage.ts` |
| Game state storage | `src/main/storage/game-state-storage.ts` |
| Settings storage | `src/main/storage/settings-storage.ts` |
| Bastion storage | `src/main/storage/bastion-storage.ts` |
| Homebrew storage | `src/main/storage/homebrew-storage.ts` |
| Custom creature storage | `src/main/storage/custom-creature-storage.ts` |
| Map library storage | `src/main/storage/map-library-storage.ts` |
| Image library storage | `src/main/storage/image-library-storage.ts` |
| Shop storage | `src/main/storage/shop-storage.ts` |
| Book storage | `src/main/storage/book-storage.ts` |
| AI conversation storage | `src/main/storage/ai-conversation-storage.ts` |
| Migrations | `src/main/storage/migrations.ts` |
| IPC storage handlers | `src/main/ipc/storage-handlers.ts` |
| IPC handlers (bans) | `src/main/ipc/index.ts` |
| Cloud sync | `src/main/cloud-sync.ts` |
| Cloud sync IPC | `src/main/ipc/cloud-sync-handlers.ts` |
| Cloud sync UI | `src/renderer/src/services/cloud-sync-service.ts` |
| Import/export service | `src/renderer/src/services/io/import-export.ts` |
| Character I/O | `src/renderer/src/services/io/character-io.ts` |
| Campaign I/O | `src/renderer/src/services/io/campaign-io.ts` |
| Entity I/O | `src/renderer/src/services/io/entity-io.ts` |
| Adventure I/O | `src/renderer/src/services/io/adventure-io.ts` |
| PDF export | `src/renderer/src/services/io/pdf-export.ts` |
| D&D Beyond import | `src/renderer/src/services/io/import-dnd-beyond.ts` |
| Foundry VTT import | `src/renderer/src/services/io/import-foundry.ts` |
| Combat log export | `src/renderer/src/services/io/combat-log-export.ts` |
| Game auto-save | `src/renderer/src/services/io/game-auto-save.ts` |
| Auto-save (localStorage) | `src/renderer/src/services/io/auto-save.ts` |
| Builder auto-save | `src/renderer/src/services/io/builder-auto-save.ts` |
| Game state saver | `src/renderer/src/services/io/game-state-saver.ts` |
| Character store | `src/renderer/src/stores/use-character-store.ts` |
| Campaign store | `src/renderer/src/stores/use-campaign-store.ts` |
| Game store | `src/renderer/src/stores/use-game-store.ts` |
| Network schemas | `src/renderer/src/network/schemas.ts` |
| Client handlers | `src/renderer/src/stores/network-store/client-handlers.ts` |
| Host handlers | `src/renderer/src/stores/network-store/host-handlers.ts` |
| Character types | `src/renderer/src/types/character-5e.ts` |
| Campaign types | `src/renderer/src/types/campaign.ts` |
| Map types | `src/renderer/src/types/map.ts` |
| Game state types | `src/renderer/src/types/game-state.ts` |
| Size constants | `src/shared/constants.ts` |
| Package version | `package.json` |
