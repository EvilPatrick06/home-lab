# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 8 of the D&D VTT project.

Phase 8 covers the **Settings System**. The audit graded it B overall: accessibility, keybindings, import/export, and IPC architecture are solid. The critical failures are **audio volumes not persisted** (users re-adjust every session), **no volume UI in settings**, **no factory reset**, and **fragmented persistence** scattered across 25+ localStorage keys, file storage, and module-level variables with no centralized registry.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 8 is entirely client-side. No Raspberry Pi involvement.

**Core Settings Files:**

| File | Lines | Role | Issues |
|------|-------|------|--------|
| `src/main/storage/settings-storage.ts` | 41 | File-based persistence (`settings.json`) | Only stores TURN servers + user profile; no validation; no versioning |
| `src/renderer/src/pages/SettingsPage.tsx` | 952 | Main settings UI | No volume controls; no factory reset; `SettingsPage.test.tsx` is import-only |
| `src/renderer/src/stores/use-accessibility-store.ts` | 117 | Accessibility + keybindings (localStorage) | Well-implemented |
| `src/renderer/src/services/theme-manager.ts` | 108 | Theme switching (localStorage) | Works correctly |
| `src/renderer/src/services/notification-service.ts` | 185 | Notification preferences (localStorage) | Works correctly |
| `src/renderer/src/services/io/auto-save.ts` | 277 | Auto-save config (localStorage) | Works correctly |
| `src/renderer/src/services/keyboard-shortcuts.ts` | 185 | Keybindings system | Only component with proper reset |
| `src/renderer/src/services/sound-manager.ts` | 558 | Audio system | **CRITICAL**: Volume/mute are module-level variables, NO persistence, NO UI (lines 207-211) |

**Audio System Detail (`sound-manager.ts` lines 207-211):**
```
let volume = 1          // Always resets to 100% on launch
let ambientVolume = 0.3 // Always resets to 30% on launch
let muted = false       // Always resets to unmuted on launch
let enabled = true      // Always resets to enabled on launch
```
Exposed functions: `setVolume()`, `setAmbientVolume()`, `setMuted()`, `setEnabled()` (lines 454-487) — all modify in-memory state only.

**localStorage Keys (25+ scattered across codebase):**

| Key | File | Purpose |
|-----|------|---------|
| `dnd-vtt-accessibility` | `use-accessibility-store.ts` | Accessibility settings JSON |
| `dnd-vtt-theme` | `theme-manager.ts` | Active theme name |
| `dnd-vtt-display-name` | `app-constants.ts` | User display name |
| `dnd-vtt-last-session` | `app-constants.ts` | Last game session |
| `dnd-vtt-joined-sessions` | `app-constants.ts` | Session history |
| `dnd-vtt-auto-rejoin` | `app-constants.ts` | Auto-rejoin flag |
| `dnd-vtt-grid-opacity` | `SettingsPage.tsx` | Grid opacity |
| `dnd-vtt-grid-color` | `SettingsPage.tsx` | Grid hex color |
| `dnd-vtt-dice-mode` | `SettingsPage.tsx` | 3D/2D dice mode |
| `dnd-vtt-bottom-bar-height` | `GameLayout.tsx` | Bottom panel height |
| `dnd-vtt-sidebar-width` | `GameLayout.tsx` | Sidebar width |
| `notification-config` | `notification-service.ts` | Notification prefs |
| `autosave:config` | `auto-save.ts` | Auto-save config |
| `library-recent` | `use-library-store.ts` | Recent library items |
| `library-favorites` | `use-library-store.ts` | Library favorites |
| `lobby-chat-{campaignId}` | `use-lobby-store.ts` | Chat history |
| `dice-tray-position` | `DiceTray.tsx` | Dice tray position |
| `narration-tts-enabled` | `use-narration-tts-store.ts` | TTS enabled |
| `autosave:{campaignId}:versions` | `auto-save.ts` | Save version list |
| `autosave:{campaignId}:{versionId}` | `auto-save.ts` | Save version data |
| `macro-storage-{characterId}` | `use-macro-store.ts` | Character macros |
| `builder-draft-{characterId}` | `builder-auto-save.ts` | Builder drafts |
| `encounter-presets` | `EncounterBuilderModal.tsx` | Encounter presets |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### CRITICAL (P0)

| # | Issue | Impact |
|---|-------|--------|
| P0-1 | Audio volumes not persisted — resets every session | Users re-adjust volume on every app launch |
| P0-2 | No master volume UI in Settings | Users have no way to configure audio preferences |

### HIGH (P1)

| # | Issue | Impact |
|---|-------|--------|
| P1-1 | No factory reset for all settings | Users cannot recover from broken settings |
| P1-2 | No settings versioning in `settings-storage.ts` | Cannot migrate settings on app update |
| P1-3 | Display name saved to both localStorage AND file — potential conflict | Dual-source can diverge |

### MEDIUM (P2)

| # | Issue | Impact |
|---|-------|--------|
| P2-1 | localStorage keys scattered with no centralized registry | Maintenance nightmare; easy to miss keys |
| P2-2 | No orphaned campaign key cleanup | Deleted campaigns leave stale localStorage data |
| P2-3 | Missing reset buttons for most setting categories | Only keybindings have "Reset All" |
| P2-4 | Settings import has no version check | Old exports may not match current app |
| P2-5 | Settings import requires reload to apply | Poor UX |
| P2-6 | Sound customization path hardcoded (`/sounds/custom/${event}.mp3`) | Not validated |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Audio Persistence & UI (P0-1, P0-2)

**Step 1 — Persist Audio Settings to localStorage**
- Open `src/renderer/src/services/sound-manager.ts`
- Add localStorage persistence for the four module-level audio variables:
  ```typescript
  const AUDIO_STORAGE_KEY = 'dnd-vtt-audio'

  interface AudioSettings {
    volume: number
    ambientVolume: number
    muted: boolean
    enabled: boolean
  }

  function loadAudioSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(AUDIO_STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* use defaults */ }
    return { volume: 1, ambientVolume: 0.3, muted: false, enabled: true }
  }

  function saveAudioSettings(): void {
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
        volume, ambientVolume, muted, enabled
      }))
    } catch { /* quota or other error */ }
  }
  ```
- Initialize the module-level variables from `loadAudioSettings()` instead of hardcoded defaults:
  ```typescript
  const saved = loadAudioSettings()
  let volume = saved.volume
  let ambientVolume = saved.ambientVolume
  let muted = saved.muted
  let enabled = saved.enabled
  ```
- Call `saveAudioSettings()` at the end of each setter (`setVolume`, `setAmbientVolume`, `setMuted`, `setEnabled`)

**Step 2 — Add Audio Controls to Settings Page**
- Open `src/renderer/src/pages/SettingsPage.tsx`
- Add a new "Audio" section with:
  - **Master Volume** slider (0-100%) — calls `setVolume(value / 100)`
  - **Ambient Volume** slider (0-100%) — calls `setAmbientVolume(value / 100)`
  - **Sound Effects Mute** toggle — calls `setMuted(value)`
  - **Sound System Enable/Disable** toggle — calls `setEnabled(value)`
- Import `getVolume`, `getAmbientVolume`, `isMuted`, `isEnabled` from sound-manager (add getter exports if they don't exist)
- Place the Audio section prominently (near the top, after Theme)

**Step 3 — Add Audio Getter Exports**
- Open `src/renderer/src/services/sound-manager.ts`
- Add getter functions if they don't exist:
  ```typescript
  export function getVolume(): number { return volume }
  export function getAmbientVolume(): number { return ambientVolume }
  export function isMuted(): boolean { return muted }
  export function isEnabled(): boolean { return enabled }
  ```

### Sub-Phase B: Factory Reset (P1-1)

**Step 4 — Create Reset Utility**
- Create a centralized reset function:
  ```typescript
  // In a new utility or in SettingsPage.tsx
  export async function factoryResetAllSettings(): Promise<void> {
    // 1. Clear all dnd-vtt- localStorage keys
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('dnd-vtt-') || key?.startsWith('autosave:') ||
          key?.startsWith('notification') || key?.startsWith('lobby-') ||
          key?.startsWith('macro-storage-') || key?.startsWith('builder-draft-') ||
          key?.startsWith('library-') || key?.startsWith('dice-tray') ||
          key?.startsWith('narration-') || key?.startsWith('encounter-')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))

    // 2. Reset file-based settings
    await window.api.saveSettings({ turnServers: undefined, userProfile: undefined })

    // 3. Reset in-memory state
    setVolume(1)
    setAmbientVolume(0.3)
    setMuted(false)
    setEnabled(true)

    // 4. Reset accessibility store
    useAccessibilityStore.getState().resetAllKeybindings()
    // ... reset other accessibility settings to defaults

    // 5. Reset theme
    setTheme('dark')
  }
  ```

**Step 5 — Add Factory Reset UI**
- Open `src/renderer/src/pages/SettingsPage.tsx`
- Add a "Reset All Settings" section at the bottom with:
  - Red warning text: "This will reset all settings to their defaults."
  - Confirmation dialog before executing
  - Button styled as destructive action (red border)
  - Call `factoryResetAllSettings()` then reload the page

**Step 6 — Add Per-Category Reset Buttons**
- Add "Reset to Default" buttons for each settings section:
  - Accessibility: reset UI scale, colorblind, reduced motion, screen reader, tooltips
  - Grid: reset opacity to 40%, color to white
  - Notifications: reset to default enabled events
  - Auto-save: reset to enabled, 5min interval, 10 versions
  - Audio: reset to volume 100%, ambient 30%, unmuted, enabled

### Sub-Phase C: Centralize localStorage Keys (P2-1)

**Step 7 — Create Settings Keys Registry**
- Create `src/renderer/src/constants/settings-keys.ts`:
  ```typescript
  export const SETTINGS_KEYS = {
    ACCESSIBILITY: 'dnd-vtt-accessibility',
    THEME: 'dnd-vtt-theme',
    DISPLAY_NAME: 'dnd-vtt-display-name',
    LAST_SESSION: 'dnd-vtt-last-session',
    JOINED_SESSIONS: 'dnd-vtt-joined-sessions',
    AUTO_REJOIN: 'dnd-vtt-auto-rejoin',
    GRID_OPACITY: 'dnd-vtt-grid-opacity',
    GRID_COLOR: 'dnd-vtt-grid-color',
    DICE_MODE: 'dnd-vtt-dice-mode',
    BOTTOM_BAR_HEIGHT: 'dnd-vtt-bottom-bar-height',
    SIDEBAR_WIDTH: 'dnd-vtt-sidebar-width',
    NOTIFICATION_CONFIG: 'notification-config',
    AUTOSAVE_CONFIG: 'autosave:config',
    LIBRARY_RECENT: 'library-recent',
    LIBRARY_FAVORITES: 'library-favorites',
    DICE_TRAY_POSITION: 'dice-tray-position',
    NARRATION_TTS: 'narration-tts-enabled',
    ENCOUNTER_PRESETS: 'encounter-presets',
    AUDIO: 'dnd-vtt-audio',
  } as const

  // Dynamic keys (campaign/character-specific)
  export const dynamicKeys = {
    lobbyChat: (campaignId: string) => `lobby-chat-${campaignId}`,
    autosaveVersions: (campaignId: string) => `autosave:${campaignId}:versions`,
    autosaveVersion: (campaignId: string, versionId: string) => `autosave:${campaignId}:${versionId}`,
    macroStorage: (characterId: string) => `macro-storage-${characterId}`,
    builderDraft: (characterId: string) => `builder-draft-${characterId}`,
  } as const
  ```

**Step 8 — Replace Hardcoded Keys Across Codebase**
- Search for all hardcoded localStorage key strings and replace with `SETTINGS_KEYS` constants
- Update: `use-accessibility-store.ts`, `theme-manager.ts`, `SettingsPage.tsx`, `GameLayout.tsx`, `notification-service.ts`, `auto-save.ts`, `use-library-store.ts`, `use-lobby-store.ts`, `DiceTray.tsx`, `use-narration-tts-store.ts`, `use-macro-store.ts`, `builder-auto-save.ts`, `EncounterBuilderModal.tsx`, `app-constants.ts`

### Sub-Phase D: Orphaned Key Cleanup (P2-2)

**Step 9 — Clean Up on Campaign Delete**
- Find where campaigns are deleted (likely in `use-campaign-store.ts` or via IPC handler)
- After campaign deletion, clean up associated localStorage keys:
  ```typescript
  function cleanupCampaignLocalStorage(campaignId: string) {
    localStorage.removeItem(dynamicKeys.lobbyChat(campaignId))
    localStorage.removeItem(dynamicKeys.autosaveVersions(campaignId))
    // Also clean up all autosave version data
    const versionsKey = dynamicKeys.autosaveVersions(campaignId)
    try {
      const raw = localStorage.getItem(versionsKey)
      if (raw) {
        const versions = JSON.parse(raw) as string[]
        versions.forEach(vid => {
          localStorage.removeItem(dynamicKeys.autosaveVersion(campaignId, vid))
        })
      }
    } catch { /* ignore */ }
    localStorage.removeItem(versionsKey)
  }
  ```

**Step 10 — Clean Up on Character Delete**
- After character deletion, clean up:
  ```typescript
  function cleanupCharacterLocalStorage(characterId: string) {
    localStorage.removeItem(dynamicKeys.macroStorage(characterId))
    localStorage.removeItem(dynamicKeys.builderDraft(characterId))
  }
  ```

### Sub-Phase E: Settings Versioning (P1-2)

**Step 11 — Add Version to File Settings**
- Open `src/main/storage/settings-storage.ts`
- Add version field to `AppSettings`:
  ```typescript
  export interface AppSettings {
    version?: number
    turnServers?: RTCIceServerConfig[]
    userProfile?: UserProfile
  }
  ```
- On save, stamp `version: SETTINGS_SCHEMA_VERSION`
- On load, migrate if version is old:
  ```typescript
  const SETTINGS_SCHEMA_VERSION = 1

  export function migrateSettings(settings: Record<string, unknown>): AppSettings {
    const version = (settings.version as number) ?? 0
    if (version < 1) {
      settings.version = 1
      // v0→v1 migration if needed
    }
    return settings as AppSettings
  }
  ```

**Step 12 — Add Version to Settings Import/Export**
- Open `src/renderer/src/pages/SettingsPage.tsx`
- In the settings export (lines 832-846), include `appVersion: __APP_VERSION__`
- In the settings import (lines 852-873), check the version:
  ```typescript
  if (item.appVersion && item.appVersion !== __APP_VERSION__) {
    // Show warning: "These settings were exported from version X. Some settings may not apply correctly."
  }
  ```

### Sub-Phase F: Display Name Conflict Fix (P1-3)

**Step 13 — Single Source of Truth for Display Name**
- Currently saved to both `localStorage` (`dnd-vtt-display-name`) and `settings.json` (via `userProfile`)
- Decide: file-based `userProfile.displayName` is the canonical source
- On app load, read from `userProfile.displayName` and write to localStorage for quick access
- On save, write ONLY to file-based settings; update localStorage from there
- Remove any direct `localStorage.setItem(DISPLAY_NAME_KEY, ...)` that doesn't also update the file

### Sub-Phase G: Settings Import UX (P2-4, P2-5)

**Step 14 — Auto-Apply Settings After Import**
- Open `src/renderer/src/pages/SettingsPage.tsx`
- After settings import (lines 852-873), trigger a settings reload:
  ```typescript
  // After restoring all settings
  useAccessibilityStore.getState().loadPersistedState()
  setTheme(localStorage.getItem(SETTINGS_KEYS.THEME) ?? 'dark')
  // Reload audio settings
  const audioSettings = loadAudioSettings()
  setVolume(audioSettings.volume)
  setAmbientVolume(audioSettings.ambientVolume)
  setMuted(audioSettings.muted)
  setEnabled(audioSettings.enabled)
  // Show success message — no reload needed
  ```
- If full re-application is too complex, show "Settings imported. Restart the app to apply all changes." with a restart button

### Sub-Phase H: Audio Settings in Export/Import

**Step 15 — Include Audio in Settings Export**
- In the settings export (lines 832-846), the `dnd-vtt-audio` key is already captured by the `dnd-vtt-` prefix filter
- Verify this by checking the export loop — it should capture `dnd-vtt-audio` alongside other `dnd-vtt-` keys
- If the audio key uses a different prefix, add it to the capture filter

---

## ⚠️ Constraints & Edge Cases

### Audio Persistence
- **Volume values are 0.0-1.0 floats**, not 0-100 integers. The UI slider should display 0-100% but store/pass 0.0-1.0 to the sound manager.
- **Initial load timing**: `loadAudioSettings()` must run BEFORE any sound plays. If the sound manager initializes with hardcoded defaults and sounds play before localStorage is read, users hear a brief burst at full volume.
- **Howler.js integration**: The sound manager likely uses Howler.js. Verify that `Howler.volume(value)` is called on load, not just stored in the module variable.

### Factory Reset
- **Confirmation is critical** — factory reset destroys user preferences. Use a two-step confirmation: first click shows warning, second click executes.
- **Do NOT delete game data** — factory reset should only clear settings/preferences, NOT characters, campaigns, or bastions.
- **Post-reset state**: After factory reset, the app should be in the same state as a fresh install. Theme reverts to dark, UI scale to 100%, volume to defaults.

### Settings Keys Migration
- **Renaming keys breaks existing installs** — when centralizing keys, do NOT rename any keys. The constants file should use the EXACT same string values currently in use. This is purely a code organization change.
- **The `notification-config` key does NOT have the `dnd-vtt-` prefix** — add it to the centralized registry but do NOT rename it. Same for `autosave:config`, `library-recent`, `library-favorites`, `dice-tray-position`, `narration-tts-enabled`, `encounter-presets`.

### Orphaned Key Cleanup
- **Timing matters** — cleanup must happen AFTER the campaign/character delete IPC call succeeds, not before.
- **localStorage keys are synchronous** — `removeItem` calls are safe to batch without async handling.
- **Auto-save versions can be numerous** — a campaign with frequent auto-saves may have 10+ version keys. Clean them all.

### Import/Export
- **Settings import should NOT trigger auto-save** — if the auto-save system detects "changes" from the import, it could immediately overwrite the just-imported settings. Temporarily disable auto-save during import.
- **Export captures `dnd-vtt-` prefix only** — keys like `notification-config`, `autosave:config` are NOT captured. Update the export filter to include all known settings keys.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for audio persistence and UI — this is the highest-impact UX fix that every user will notice immediately. Then Sub-Phase B (Steps 4-6) for factory reset.
