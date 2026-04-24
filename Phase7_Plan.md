# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 7 of the D&D VTT project.

Phase 7 covers **Data Persistence, Backup, Integrity, and Schema Safety**. The audit found the About page and versioning system are solid, but identified **critical data integrity risks**: non-atomic file writes across ALL storage modules, incomplete backup coverage (game states, AI conversations, images all excluded), no load validation, campaign migration inconsistency, and IPC save handlers accepting unvalidated data. This phase is about making the persistence layer crash-safe, complete, and validated.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

**Storage Modules (Main Process — `src/main/storage/`):**

| File | Entity | Has Migration? | Has Atomic Write? | Has Load Validation? |
|------|--------|---------------|-------------------|---------------------|
| `character-storage.ts` | Characters | Yes (v1→v3) | NO | UUID check only |
| `campaign-storage.ts` | Campaigns | Yes (single-load only) | NO | UUID check only |
| `game-state-storage.ts` | Game states | **NO** | NO | **NO** |
| `settings-storage.ts` | Settings | **NO** | NO | **NO** (type assertion) |
| `bastion-storage.ts` | Bastions | Yes (v1→v3) | NO | UUID check only |
| `homebrew-storage.ts` | Homebrew | **NO** | NO | **NO** |
| `custom-creature-storage.ts` | Creatures | **NO** | NO | **NO** |
| `map-library-storage.ts` | Maps | **NO** | NO | **NO** |
| `image-library-storage.ts` | Images | **NO** | NO | **NO** |
| `shop-storage.ts` | Shops | **NO** | NO | **NO** |
| `book-storage.ts` | Books | **NO** | NO | **NO** |
| `ai-conversation-storage.ts` | AI convos | **NO** | NO | **NO** |

**IPC Handlers (Main Process — `src/main/ipc/`):**

| File | Key Handlers |
|------|-------------|
| `storage-handlers.ts` | SAVE_CHARACTER (line 58), SAVE_CAMPAIGN (97), SAVE_BASTION (128), SAVE_CUSTOM_CREATURE (159), SAVE_GAME_STATE (190), MAP_LIBRARY_SAVE (251), SHOP_TEMPLATE_SAVE (272) — ALL accept unvalidated data |
| `index.ts` | Ban list handlers (lines 62-118) — inline, no storage module |

**I/O Services (Renderer — `src/renderer/src/services/io/`):**

| File | Purpose | Issues |
|------|---------|--------|
| `import-export.ts` | Full backup `.dndbackup` (lines 173-292) | DOES NOT include: game states, AI conversations, image library, map library, shop templates, books, bans |
| `combat-log-export.ts` | Export combat logs as text/JSON/CSV | Functions return strings, NO file dialog UI |
| `game-auto-save.ts` | Debounced game state save | Race conditions with concurrent writes |
| `auto-save.ts` | localStorage snapshots | localStorage quota risk |

**Network Schemas (Renderer — `src/renderer/src/network/`):**

| File | Issues |
|------|--------|
| `schemas.ts` | `StateUpdatePayloadSchema.value: z.unknown()`, `CharacterSelectPayloadSchema.characterData: z.unknown()`, `CharacterUpdatePayloadSchema.characterData: z.unknown()` |
| `stores/network-store/client-handlers.ts` | `applyGameState(data)` passes `Record<string, unknown>` without validation (line 63-65) |

**Other Files:**

| File | Issues |
|------|--------|
| `src/renderer/src/pages/AboutPage.tsx` | Features list says "Ollama" but doesn't mention Claude |
| `src/renderer/src/services/chat-commands/commands-utility.ts` | `/version` (line 160) missing actual version number |
| `src/main/storage/book-storage.ts` | Hardcoded paths to developer's machine (lines 187-203) |
| `src/main/storage/migrations.ts` | Schema v1→v3, `CURRENT_SCHEMA_VERSION = 3` |
| `src/renderer/src/components/ui/UpdatePrompt.tsx` | `removeAllListeners` clears other components' listeners (line 44-46) |

### Raspberry Pi (`patrick@bmo`) — NO DIRECT WORK

Cloud sync (`cloud-sync.ts`) connects to Pi but the code changes are all Windows-side.

---

## 📋 Core Objectives & Corrections

### CRITICAL: Data Integrity

| # | Issue | Risk | Impact |
|---|-------|------|--------|
| D1 | Non-atomic file writes — all storage uses `writeFile()` directly | **Critical** | Crash during save = corrupted/truncated file, data loss |
| D2 | Full backup excludes game states, AI conversations, images, maps, shops, books | **High** | Restore from backup loses active combat, AI history, custom maps, images |
| D3 | Campaign `loadCampaigns()` skips migration; `loadCampaign()` runs it | **Medium** | List view shows un-migrated data, potential `undefined` field access |

### HIGH: Validation Gaps

| # | Issue | Risk |
|---|-------|------|
| V1 | IPC save handlers accept unvalidated data from renderer | Medium — compromised renderer can write garbage |
| V2 | Game state loaded without any validation | Medium — corrupted file crashes app |
| V3 | Network state injection via `z.unknown()` payloads | Medium — malicious host corrupts client state |
| V4 | Game state has no schema version or migration path | Medium — schema changes break existing saves |

### MEDIUM: Completeness

| # | Issue |
|---|-------|
| M1 | Combat log export has no file save UI |
| M2 | `/version` command missing actual version number |
| M3 | About page doesn't mention Claude API support |
| M4 | Hardcoded book paths in `book-storage.ts` |
| M5 | Auto-save race conditions (concurrent debounced writes) |
| M6 | Campaign has no versioned backups (characters do) |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Atomic Writes (D1) — CRITICAL

**Step 1 — Create Atomic Write Utility**
- Create a shared utility function in `src/main/storage/`:
  ```typescript
  // src/main/storage/atomic-write.ts
  import { writeFile, rename, unlink } from 'node:fs/promises'

  export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, data, 'utf-8')
    await rename(tmpPath, filePath)
  }
  ```
- `rename()` is atomic on NTFS (Windows) and most Linux filesystems. If the process crashes before `rename`, only the `.tmp` file is affected — the original file remains intact.

**Step 2 — Replace All writeFile Calls in Storage Modules**
- Replace `writeFile(path, JSON.stringify(data, null, 2), 'utf-8')` with `atomicWriteFile(path, JSON.stringify(data, null, 2))` in:
  - `character-storage.ts` line 74
  - `campaign-storage.ts` line 47
  - `game-state-storage.ts` line 44
  - `settings-storage.ts` line 39
  - `bastion-storage.ts` (find the write call)
  - `homebrew-storage.ts` (find the write call)
  - `custom-creature-storage.ts` (find the write call)
  - `map-library-storage.ts` (find the write call)
  - `image-library-storage.ts` (metadata write)
  - `shop-storage.ts` (find the write call)
  - `book-storage.ts` (find the write call)
  - `ai-conversation-storage.ts` (find the write call)
- Search for ALL `writeFile` calls in `src/main/storage/` and replace each one

**Step 3 — Clean Up Orphaned .tmp Files on Startup**
- In the main process startup (e.g., `src/main/index.ts`), scan the userData directory for any `.tmp` files left by interrupted writes and delete them:
  ```typescript
  async function cleanupTmpFiles(dir: string) {
    const entries = await readdir(dir, { recursive: true })
    for (const entry of entries) {
      if (entry.endsWith('.tmp')) {
        await unlink(path.join(dir, entry)).catch(() => {})
      }
    }
  }
  ```

### Sub-Phase B: Complete Backup Coverage (D2)

**Step 4 — Add Game States to Full Backup**
- Open `src/renderer/src/services/io/import-export.ts`
- In `exportAllData()` (lines 173-217), add game state collection:
  ```typescript
  // After gathering characters, campaigns, bastions, creatures, homebrew, settings
  const gameStates = await window.api.storage.loadAllGameStates()
  // Add to backup payload
  payload.gameStates = gameStates
  ```
- Add `gameStates` to the `BackupPayload` type
- In `importAllData()` (lines 223-292), restore game states from backup

**Step 5 — Add AI Conversations to Full Backup**
- In `exportAllData()`, add AI conversation collection
- In `importAllData()`, restore AI conversations

**Step 6 — Add Image Library to Full Backup**
- Image files are binary — they need special handling
- Option A: Base64-encode images into the backup JSON (increases file size)
- Option B: Create a `.dndbackup.zip` format that includes both JSON metadata and binary image files
- Option B is better for large libraries but more complex. Start with Option A with a size warning if > 50MB

**Step 7 — Add Map Library, Shop Templates, Book Config to Backup**
- Extend `exportAllData()` and `importAllData()` to include these remaining entity types
- Update `BACKUP_VERSION` to 3

**Step 8 — Add Campaign Game State to Campaign Export**
- Open `src/renderer/src/services/io/campaign-io.ts`
- When exporting a campaign, also include the associated game state file:
  ```typescript
  const gameState = await window.api.storage.loadGameState(campaign.id)
  exportData = { campaign, gameState }
  ```
- On import, restore both the campaign and its game state

### Sub-Phase C: Fix Campaign Migration (D3)

**Step 9 — Run Migration in loadCampaigns()**
- Open `src/main/storage/campaign-storage.ts`
- In `loadCampaigns()` (line 54-76), add `migrateData()` call:
  ```typescript
  // After JSON.parse(data), before pushing to results:
  const migrated = migrateData(parsed)
  results.push(migrated)
  ```
- This ensures the list view has the same schema as single-load

### Sub-Phase D: Add Game State Schema Versioning (V4)

**Step 10 — Add Schema Version to Game State**
- Open `src/main/storage/game-state-storage.ts`
- Add `GAME_STATE_SCHEMA_VERSION = 1` constant
- On save, stamp the version:
  ```typescript
  state.schemaVersion = GAME_STATE_SCHEMA_VERSION
  ```
- On load, check version and migrate:
  ```typescript
  const data = JSON.parse(raw)
  const migrated = migrateGameState(data)
  return { success: true, data: migrated }
  ```
- Create `migrateGameState()` function (empty for now — establishes the pattern)

### Sub-Phase E: IPC Validation (V1)

**Step 11 — Create Zod Schemas for Save Operations**
- Create `src/shared/storage-schemas.ts` with Zod schemas for the most critical types:
  ```typescript
  import { z } from 'zod'

  export const CharacterSaveSchema = z.object({
    id: z.string().uuid(),
    gameSystem: z.string(),
    name: z.string().min(1),
    schemaVersion: z.number().optional(),
    // ... key fields. Use .passthrough() for remaining fields
  }).passthrough()

  export const CampaignSaveSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    schemaVersion: z.number().optional(),
  }).passthrough()

  export const GameStateSaveSchema = z.object({
    // ... key shape validation
  }).passthrough()
  ```
- Use `.passthrough()` to allow extra fields — the goal is structural validation, not exhaustive field checking

**Step 12 — Apply Schemas in IPC Handlers**
- Open `src/main/ipc/storage-handlers.ts`
- Before each save operation, validate with the corresponding Zod schema:
  ```typescript
  // SAVE_CHARACTER handler (line 58)
  const parsed = CharacterSaveSchema.safeParse(character)
  if (!parsed.success) {
    return { success: false, error: `Invalid character data: ${parsed.error.message}` }
  }
  return characterStorage.saveCharacter(parsed.data)
  ```
- Apply to all save handlers

### Sub-Phase F: Load Validation (V2)

**Step 13 — Add Load Validation to Game State Storage**
- Open `src/main/storage/game-state-storage.ts`
- After `JSON.parse`, validate basic structure:
  ```typescript
  const data = JSON.parse(raw)
  if (!data || typeof data !== 'object') {
    return { success: false, error: 'Invalid game state format' }
  }
  ```
- Add Zod schema parsing for critical fields

**Step 14 — Add Load Validation to Settings Storage**
- Open `src/main/storage/settings-storage.ts`
- Replace `return JSON.parse(content) as AppSettings` with:
  ```typescript
  const data = JSON.parse(content)
  return AppSettingsSchema.safeParse(data).data ?? {}
  ```

### Sub-Phase G: Network Schema Hardening (V3)

**Step 15 — Replace z.unknown() in Network Schemas**
- Open `src/renderer/src/network/schemas.ts`
- Replace `value: z.unknown()` in `StateUpdatePayloadSchema` with typed unions based on the update type:
  ```typescript
  // Instead of z.unknown(), use discriminated union
  value: z.union([
    z.object({ /* addToken shape */ }),
    z.object({ /* updateToken shape */ }),
    z.record(z.unknown()) // fallback for extensibility
  ])
  ```
- Replace `characterData: z.unknown()` with a `Character5e` Zod schema (or at minimum `z.object({ id: z.string(), name: z.string() }).passthrough()`)

**Step 16 — Validate in Client Handlers**
- Open `src/renderer/src/stores/network-store/client-handlers.ts`
- In `applyGameState(data)` (line 63-65), validate before applying:
  ```typescript
  const parsed = GameStateSchema.safeParse(data)
  if (!parsed.success) {
    console.error('Invalid game state from host:', parsed.error)
    return
  }
  loadGameState(parsed.data)
  ```

### Sub-Phase H: Auto-Save Safety (M5)

**Step 17 — Add Write Lock to Game Auto-Save**
- Open `src/renderer/src/services/io/game-auto-save.ts`
- Add a write lock to prevent concurrent saves:
  ```typescript
  let saveInProgress = false

  async function executeSave(campaignId: string) {
    if (saveInProgress) return
    saveInProgress = true
    try {
      const payload = buildSavePayload()
      await window.api.storage.saveGameState(campaignId, payload)
    } finally {
      saveInProgress = false
    }
  }
  ```
- If a save is requested while another is in progress, queue it (but only queue the latest — don't stack multiple)

### Sub-Phase I: Campaign Versioned Backups (M6)

**Step 18 — Add Version History to Campaign Storage**
- Open `src/main/storage/campaign-storage.ts`
- Copy the versioning pattern from `character-storage.ts` (lines 55-71):
  ```typescript
  // Before overwrite, copy to .versions/{id}/{id}_{timestamp}.json
  const versionsDir = path.join(dir, '.versions', id)
  await mkdir(versionsDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await copyFile(filePath, path.join(versionsDir, `${id}_${timestamp}.json`))
  // Keep last 20 versions
  ```
- Add `listCampaignVersions(id)` and `restoreCampaignVersion(id, fileName)` functions
- Wire to IPC channels

### Sub-Phase J: Minor Fixes (M1-M4)

**Step 19 — Wire Combat Log Export to UI**
- Open `src/renderer/src/services/io/combat-log-export.ts`
- The functions return strings. Add file save dialog integration:
  ```typescript
  export async function saveCombatLogToFile(log: CombatLogEntry[], format: 'text' | 'json' | 'csv') {
    const content = format === 'json' ? exportCombatLogJSON(log)
                  : format === 'csv' ? exportCombatLogCSV(log)
                  : exportCombatLogText(log)
    const ext = format === 'json' ? '.json' : format === 'csv' ? '.csv' : '.txt'
    // Use Electron save dialog
    await window.api.showSaveDialog({ defaultPath: `combat-log${ext}`, content })
  }
  ```
- Add an "Export Combat Log" button in the CombatLogPanel sidebar component

**Step 20 — Fix /version Command**
- Open `src/renderer/src/services/chat-commands/commands-utility.ts`
- Find line 160 in the `/version` command handler
- Include `__APP_VERSION__`:
  ```typescript
  return { type: 'info', content: `D&D VTT v${__APP_VERSION__} — 5e 2024 Edition | Electron + React 19 + PixiJS` }
  ```

**Step 21 — Update About Page Features**
- Open `src/renderer/src/pages/AboutPage.tsx`
- In the FEATURES array, change "AI Dungeon Master (Ollama)" to "AI Dungeon Master (Ollama, Claude, OpenAI, Gemini)"

**Step 22 — Fix Hardcoded Book Paths**
- Open `src/main/storage/book-storage.ts`
- Remove hardcoded `C:\Users\evilp\dnd\5.5e References\...` paths from `CORE_BOOK_DEFS` (lines 187-203)
- Replace with a user-configurable book registration system or use relative paths from the app data directory

**Step 23 — Fix UpdatePrompt Listener Cleanup**
- Open `src/renderer/src/components/ui/UpdatePrompt.tsx`
- Replace `removeAllListeners(IPC_CHANNELS.UPDATE_STATUS)` (line 44-46) with component-scoped cleanup:
  ```typescript
  useEffect(() => {
    const handler = (status) => setUpdateStatus(status)
    window.api.onUpdateStatus(handler)
    return () => window.api.removeUpdateStatusListener(handler)
  }, [])
  ```
- Update the preload bridge to support removing specific listeners

### Sub-Phase K: Storage Pattern Standardization

**Step 24 — Standardize StorageResult Pattern**
- Open `src/main/storage/settings-storage.ts`
- Refactor to return `StorageResult<AppSettings>` instead of throwing or returning raw data
- Open `src/main/storage/ai-conversation-storage.ts`
- Refactor to return `StorageResult<ConversationData>` instead of throwing

**Step 25 — Extract Ban Storage to Module**
- Open `src/main/ipc/index.ts`
- Extract ban list handling (lines 62-118) into `src/main/storage/ban-storage.ts`
- Follow the `StorageResult` pattern with proper file operations

---

## ⚠️ Constraints & Edge Cases

### Atomic Writes
- **Windows NTFS**: `rename()` is atomic on NTFS for same-volume renames. Ensure `.tmp` files are in the same directory as the target (not a different drive).
- **Electron userData**: `app.getPath('userData')` is always on the same volume, so same-directory `.tmp` files are safe.
- **Existing .tmp cleanup**: If the app starts and finds `.tmp` files, it means a previous write was interrupted. The original file should still be intact — only delete the `.tmp`, do NOT promote it (it may be incomplete).

### Backup Format
- **Backward compatibility**: `BACKUP_VERSION` increment from 2 to 3 must handle v2 backups on import (missing `gameStates`, `aiConversations`, `imageLibrary` fields should default to empty arrays).
- **Image encoding**: Base64-encoded images in the backup JSON will increase file size by ~33%. Warn users if backup exceeds 100MB.
- **Import is destructive**: `importAllData()` overwrites existing items with same IDs. This is the existing behavior — do not change it, but ensure the confirmation dialog clearly states this.

### Zod Validation
- **Use `.passthrough()`**: The Zod schemas for save validation should use `.passthrough()` to allow fields not in the schema. This prevents breaking saves when new fields are added to types.
- **Don't over-validate**: The goal is structural safety (correct ID format, required fields present, correct types), not exhaustive field checking. Over-strict schemas will break backward compatibility.
- **Network schemas**: When replacing `z.unknown()`, use loose schemas first. A malformed character from a peer should be logged and rejected, not crash the app.

### Migration
- **`loadCampaigns()` migration**: Running `migrateData()` on every campaign in the list might be slow for large collections. Consider lazy migration (migrate on first individual load, mark as migrated in a cache).
- **Game state migration**: Start with version 1 and an empty migration function. This establishes the pattern for future changes.

### Auto-Save Race Condition
- **Write lock must be non-blocking**: If a save is in progress, queue the next save request but do NOT block the UI thread. Use a flag + queued callback pattern, not a mutex.
- **Only queue the LATEST**: If 5 saves are requested during a write, only the last one matters. Discard intermediate requests.

### Performance
- **Zod parsing on every save** adds overhead. For large game states (big maps, many tokens), consider a fast pre-check (`typeof data === 'object' && 'id' in data`) before full Zod parse.
- **Startup .tmp cleanup** should be non-blocking — run it after the app is fully loaded.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for atomic writes — this is the highest-impact change that prevents data loss across the entire application. Then Sub-Phase B (Steps 4-8) to complete backup coverage.
