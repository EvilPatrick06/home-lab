# Phase 8: Settings System Analysis (Kimi K2.5)

## Executive Summary

This document provides a comprehensive analysis of the settings architecture in the D&D VTT Electron application. The settings system is **functionally complete** but has **architectural inconsistencies** with mixed persistence strategies that could lead to maintainability issues.

---

## 1. Settings Architecture Overview

### 1.1 Two-Tier Persistence Model

The application uses a **dual persistence strategy**:

| Tier | Storage Type | Location | Use Case |
|------|--------------|----------|----------|
| **Tier 1** | File-based (Electron userData) | `settings.json` | Cross-device sync, sensitive data |
| **Tier 2** | localStorage (Renderer) | Browser localStorage | UI preferences, per-device settings |

### 1.2 Core Settings Files

```
src/main/storage/settings-storage.ts         (41 lines) - File-based persistence
src/renderer/src/stores/use-accessibility-store.ts   (117 lines) - Accessibility & keybindings
src/renderer/src/pages/SettingsPage.tsx      (952 lines) - Main settings UI
src/renderer/src/services/theme-manager.ts   (108 lines) - Theme switching
src/renderer/src/services/notification-service.ts    (185 lines) - Notifications
src/renderer/src/services/io/auto-save.ts  (277 lines) - Auto-save logic
src/renderer/src/services/keyboard-shortcuts.ts      (185 lines) - Keybindings
src/renderer/src/services/sound-manager.ts   (558 lines) - Audio settings
```

---

## 2. Settings Saving & Loading Analysis

### 2.1 File-Based Settings (`settings-storage.ts`)

**Storage Location:**
```typescript
// Line 23-25: settings-storage.ts
function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}
```

**Data Structure:**
```typescript
// Lines 5-21: settings-storage.ts
export interface RTCIceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface UserProfile {
  id: string
  displayName: string
  avatarPath?: string
  createdAt: string
}

export interface AppSettings {
  turnServers?: RTCIceServerConfig[]
  userProfile?: UserProfile
}
```

**Findings:**
- ✅ **Properly saves/loads** via IPC handlers (Line 238-245: `storage-handlers.ts`)
- ✅ **Error handling** returns empty object on failure (Line 31-33)
- ⚠️ **Limited scope** - only stores TURN servers and user profile
- ⚠️ **No validation** of loaded data structure
- ⚠️ **No versioning** for migration support

### 2.2 localStorage-Based Settings

**Complete Registry of localStorage Keys:**

| Key | Type | File | Line | Purpose |
|-----|------|------|------|---------|
| `dnd-vtt-accessibility` | JSON | use-accessibility-store.ts | 30 | Accessibility settings |
| `dnd-vtt-theme` | string | theme-manager.ts | 14 | Active theme |
| `dnd-vtt-display-name` | string | app-constants.ts | 39 | User display name |
| `dnd-vtt-last-session` | JSON | app-constants.ts | 36 | Last game session |
| `dnd-vtt-joined-sessions` | JSON | app-constants.ts | 37 | Session history |
| `dnd-vtt-auto-rejoin` | string | app-constants.ts | 38 | Auto-rejoin flag |
| `dnd-vtt-grid-opacity` | number | SettingsPage.tsx | 395 | Grid opacity % |
| `dnd-vtt-grid-color` | string | SettingsPage.tsx | 399 | Grid hex color |
| `dnd-vtt-dice-mode` | string | SettingsPage.tsx | 402 | 3D/2D dice mode |
| `dnd-vtt-bottom-bar-height` | number | GameLayout.tsx | 119 | Bottom panel height |
| `dnd-vtt-sidebar-width` | number | GameLayout.tsx | 126 | Sidebar width |
| `notification-config` | JSON | notification-service.ts | 35 | Notification preferences |
| `autosave:config` | JSON | auto-save.ts | 24 | Auto-save configuration |
| `library-recent` | JSON | use-library-store.ts | 8 | Recent library items |
| `library-favorites` | JSON | use-library-store.ts | 19 | Library favorites |
| `lobby-chat-{campaignId}` | JSON | use-lobby-store.ts | N/A | Chat history |
| `dice-tray-position` | JSON | DiceTray.tsx | 15 | Dice tray position |
| `narration-tts-enabled` | string | use-narration-tts-store.ts | 12 | TTS enabled |
| `autosave:{campaignId}:versions` | JSON | auto-save.ts | 33 | Save version list |
| `autosave:{campaignId}:{versionId}` | JSON | auto-save.ts | 37 | Save version data |
| `macro-storage-{characterId}` | JSON | use-macro-store.ts | N/A | Character macros |
| `builder-draft-{characterId}` | JSON | builder-auto-save.ts | N/A | Builder drafts |
| `encounter-presets` | JSON | EncounterBuilderModal.tsx | 226 | Encounter presets |

**Findings:**
- ✅ All settings use proper `try/catch` for localStorage errors
- ✅ Consistent `dnd-vtt-` prefix for app-specific keys
- ⚠️ **No centralized registry** - keys scattered across files
- ⚠️ **No validation** on loaded values
- ⚠️ **No garbage collection** for orphaned campaign-specific keys

---

## 3. Settings Scope Analysis

### 3.1 Global Settings (Applied Everywhere)

| Setting | Scope | Persistence | Verified |
|---------|-------|-------------|----------|
| Theme | Global | localStorage | ✅ Line 72: theme-manager.ts |
| UI Scale | Global | localStorage | ✅ Line 44: use-accessibility-store.ts |
| Colorblind Mode | Global | localStorage | ✅ Line 48: use-accessibility-store.ts |
| Reduced Motion | Global | localStorage | ✅ Line 49: use-accessibility-store.ts |
| Screen Reader Mode | Global | localStorage | ✅ Line 50: use-accessibility-store.ts |
| Tooltips | Global | localStorage | ✅ Line 51: use-accessibility-store.ts |
| Keybindings | Global | localStorage | ✅ Line 52: use-accessibility-store.ts |
| Notifications | Global | localStorage | ✅ Line 35: notification-service.ts |
| Grid Opacity | Per-map | localStorage | ✅ Line 395: SettingsPage.tsx |
| Grid Color | Per-map | localStorage | ✅ Line 399: SettingsPage.tsx |
| Dice Mode | Global | localStorage | ✅ Line 402: SettingsPage.tsx |
| Sound Volume | Session | Memory | ⚠️ No persistence |
| Ambient Volume | Session | Memory | ⚠️ No persistence |
| Mute State | Session | Memory | ⚠️ No persistence |

### 3.2 Per-Session Settings (Not Persisted)

| Setting | Scope | Issue |
|---------|-------|-------|
| Sound Effects Volume | Session | Not saved between launches |
| Ambient Music Volume | Session | Not saved between launches |
| Mute State | Session | Resets on app restart |
| Dice Colors | Per-player | Saved but only in lobby context |
| Sound Overrides | Per-campaign | Module-level state, not persisted |

### 3.3 Per-User Settings (File-Based)

| Setting | Scope | Persistence | Verified |
|---------|-------|-------------|----------|
| User Profile | Per-user | File | ✅ Line 11-16: settings-storage.ts |
| TURN Servers | Per-user | File | ✅ Line 19: settings-storage.ts |
| Discord Config | Per-user | Main process | ✅ Line 415-428: preload/index.ts |
| AI Provider Config | Per-user | Main process | ✅ Line 68-177: preload/index.ts |
| Plugin States | Per-user | Main process | ✅ Line 391-405: preload/index.ts |

---

## 4. Missing Settings Analysis

### 4.1 Reasonably Expected Settings (MISSING)

| Category | Setting | Priority | Impact |
|----------|---------|----------|--------|
| **Audio** | Master Volume Control | 🔴 High | Users cannot set global volume |
| **Audio** | Ambient Volume Control | 🔴 High | No UI for ambient music volume |
| **Audio** | Mute on Focus Loss | 🟡 Medium | No "mute when unfocused" option |
| **Language** | Language Selection | 🟡 Medium | Hardcoded English only |
| **Accessibility** | Font Size Override | 🟡 Medium | Only UI scale available |
| **Accessibility** | High Contrast Mode | 🟢 Low | "high-contrast" theme exists |
| **Accessibility** | Focus Indicators | 🟢 Low | Basic focus styling present |
| **Privacy** | Analytics Opt-out | 🟡 Medium | No analytics mentioned |
| **Network** | Proxy Configuration | 🟢 Low | No proxy support visible |
| **Storage** | Cache Clear | 🟡 Medium | No cache management UI |
| **Storage** | Data Export Path | 🟢 Low | Uses default paths only |
| **Display** | Default Dice Colors | 🟡 Medium | No global default, per-session only |
| **Input** | Mouse Sensitivity | 🟢 Low | Canvas drag sensitivity |
| **Input** | Touch/Gesture Settings | 🟡 Medium | Touch device support unclear |

### 4.2 Audio Settings Deep Dive

The sound manager (`sound-manager.ts`) exposes these controls:

```typescript
// Lines 454-487: sound-manager.ts
export function setVolume(v: number): void  // Master volume
export function setAmbientVolume(v: number): void  // Ambient volume  
export function setMuted(m: boolean): void  // Mute toggle
export function setEnabled(e: boolean): void  // Sound system on/off
```

**Critical Finding:** These are **module-level variables** with **NO PERSISTENCE**:

```typescript
// Lines 207-211: sound-manager.ts
let initialized = false
let volume = 1        // Always resets to 100%
let ambientVolume = 0.3   // Always resets to 30%
let muted = false     // Always resets to unmuted
let enabled = true    // Always resets to enabled
```

**Impact:** Users must adjust volume every session. This is a **significant UX issue**.

---

## 5. UI-Only Settings (Not Wired to Functionality)

### 5.1 Properly Wired Settings ✅

| Setting | UI Location | Wired To | Evidence |
|---------|-------------|----------|----------|
| Theme | SettingsPage.tsx Line 524 | theme-manager.ts | ✅ `setTheme()` called |
| UI Scale | SettingsPage.tsx Line 557 | accessibility-store | ✅ `setUiScale()` called |
| Colorblind Mode | SettingsPage.tsx Line 591 | accessibility-store | ✅ `setColorblindMode()` called |
| Reduced Motion | SettingsPage.tsx Line 612 | accessibility-store | ✅ `setReducedMotion()` called |
| Screen Reader | SettingsPage.tsx Line 626 | accessibility-store | ✅ `setScreenReaderMode()` called |
| Tooltips | SettingsPage.tsx Line 639 | accessibility-store | ✅ `setTooltipsEnabled()` called |
| Grid Opacity | SettingsPage.tsx Line 656 | localStorage | ✅ Direct localStorage write |
| Grid Color | SettingsPage.tsx Line 656 | localStorage | ✅ Direct localStorage write |
| Dice Mode | SettingsPage.tsx Line 688 | localStorage | ✅ Direct localStorage write |
| Notifications | SettingsPage.tsx Line 710 | notification-service | ✅ `setEnabled()` called |
| Auto-Save | SettingsPage.tsx Line 788 | auto-save.ts | ✅ `setConfig()` called |
| Keybindings | SettingsPage.tsx Line 945 | accessibility-store | ✅ `setCustomKeybinding()` called |

### 5.2 Partially Wired / UI-Only Issues ⚠️

| Setting | Issue | Evidence |
|---------|-------|----------|
| Sound Customization in SettingsDropdown | Shows overrides but path is hardcoded | Line 173: `'/sounds/custom/${event}.mp3'` - not validated |
| Dice Colors in SettingsDropdown | Only saved per-session | Uses lobby store, not global default |
| Profile Display Name | Synced to both localStorage AND file | Line 430: Both saved - potential conflict |
| TURN Servers | Saved to file but UI doesn't show current config | Line 21-32: NetworkSettingsModal loads fresh each time |

### 5.3 Unsaved Module-Level State 🔴

| Setting | UI Control Exists | Persisted | Location |
|---------|-------------------|-----------|----------|
| Master Volume | ❌ No UI | ❌ No | sound-manager.ts |
| Ambient Volume | ❌ No UI | ❌ No | sound-manager.ts |
| Mute State | ❌ No UI | ❌ No | sound-manager.ts |
| Sound Enabled | ❌ No UI | ❌ No | sound-manager.ts |

---

## 6. Reset-to-Defaults Analysis

### 6.1 Existing Reset Functionality ✅

| Component | Reset Type | Implementation |
|-----------|------------|----------------|
| Keybindings | Per-action + Global | Lines 103-115: `resetKeybinding()`, `resetAllKeybindings()` |
| UI Scale | Individual | Line 564-569: One-click reset to 100% |
| Network Settings | Global | Line 77-80: NetworkSettingsModal `handleReset()` |
| TURN Servers | Global | Calls `resetIceConfig()` |

### 6.2 Missing Reset Functionality ❌

| Setting Category | Missing Reset | Impact |
|------------------|---------------|--------|
| All Accessibility | No global "Reset Accessibility" button | Must reset each individually |
| All Settings | No "Factory Reset" option | Cannot reset entire app settings |
| Theme | No reset to default | Dark theme is default but not explicit |
| Notifications | No reset to defaults | Default events pre-selected but no reset button |
| Grid Settings | No reset button | Default is 40% opacity, white color |
| Auto-Save | No reset button | Defaults: enabled, 5min interval, 10 versions |
| Plugin Settings | No reset | Enabled states persist, no bulk reset |
| Discord Settings | No clear/reset | Must manually clear each field |

### 6.3 Reset Implementation Quality

**Good Example (Keybindings):**
```typescript
// Lines 253-262: SettingsPage.tsx - KeybindingEditor
{customKeybindings && Object.keys(customKeybindings).length > 0 && (
  <div className="mt-3 pt-3 border-t border-gray-700/50">
    <button
      onClick={resetAllKeybindings}
      className="px-3 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded 
                 text-gray-400 hover:text-red-400 hover:border-red-600"
    >
      Reset All to Defaults
    </button>
  </div>
)}
```

**Pattern Observed:** Only keybindings have a comprehensive reset mechanism.

---

## 7. Settings Import/Export Analysis

### 7.1 Implementation (SettingsPage.tsx Lines 826-894)

**Export Process:**
```typescript
// Lines 832-846: Export combines file settings + localStorage
const settings = await window.api.loadSettings()  // File-based
const prefs: Record<string, string> = {}
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i)
  if (key?.startsWith('dnd-vtt-')) prefs[key] = localStorage.getItem(key) ?? ''
}
const ok = await exportEntities('settings', [{ settings, preferences: prefs }])
```

**Import Process:**
```typescript
// Lines 852-873: Import restores both sources
if (item.settings) {
  await window.api.saveSettings(item.settings as Parameters<typeof window.api.saveSettings>[0])
}
if (item.preferences) {
  for (const [key, value] of Object.entries(item.preferences)) {
    if (key.startsWith('dnd-vtt-') && typeof value === 'string') {
      localStorage.setItem(key, value)
    }
  }
}
```

**Findings:**
- ✅ **Comprehensive export** captures both file and localStorage settings
- ✅ **Filter by prefix** (`dnd-vtt-`) prevents exporting unrelated data
- ✅ **Type validation** on import
- ⚠️ **No version checking** - imported settings may not match app version
- ⚠️ **Requires reload** - user must reload to apply all changes
- ⚠️ **No conflict resolution** - overwrites existing settings without prompt

---

## 8. Critical Issues & Recommendations

### 8.1 Critical Issues (Fix Recommended)

| Priority | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 **P0** | Audio volumes not persisted | sound-manager.ts | Add localStorage persistence for volume/mute |
| 🔴 **P0** | No master volume UI | N/A | Add volume slider to SettingsPage |
| 🟡 **P1** | Settings scattered across stores | Multiple | Consolidate to single settings store |
| 🟡 **P1** | No settings versioning | settings-storage.ts | Add `version` field for migrations |
| 🟡 **P1** | No factory reset | SettingsPage.tsx | Add "Reset All Settings" button |
| 🟢 **P2** | localStorage keys not centralized | Multiple | Create SETTINGS_KEYS constant |
| 🟢 **P2** | No validation on load | Multiple | Add Zod schemas for settings validation |
| 🟢 **P2** | Orphaned campaign keys | auto-save.ts | Cleanup on campaign delete |

### 8.2 Architecture Recommendations

**Current State (Fragmented):**
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ accessibility-  │  │  theme-manager  │  │  notification-  │
│    store.ts     │  │     .ts         │  │   service.ts    │
│  (localStorage) │  │  (localStorage) │  │  (localStorage) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │         SettingsPage          │
              └───────────────────────────────┘
```

**Recommended State (Unified):**
```
┌─────────────────────────────────────────────┐
│         Unified Settings Store              │
│  ┌─────────────┐  ┌─────────────────────┐  │
│  │  UI State   │  │    File Settings    │  │
│  │(localStorage)│  │  (settings.json)    │  │
│  └─────────────┘  └─────────────────────┘  │
│              ┌─────────────┐               │
│              │   Sync Layer │               │
│              │  (IPC/Events)│               │
│              └─────────────┘               │
└─────────────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │      UI Layer       │
    ┌────┴────┐  ┌────┴────┐  ┌┴─────────┐
    │Settings │  │  Game   │  │Dropdown  │
    │  Page   │  │ Overlay │  │          │
    └─────────┘  └─────────┘  └──────────┘
```

### 8.3 Implementation Priority List

**Phase 1: Critical (Immediate)**
1. Add volume controls to SettingsPage UI
2. Persist audio settings to localStorage
3. Add master "Reset All Settings" button

**Phase 2: Important (Next Sprint)**
4. Centralize all localStorage keys in constants
5. Add settings schema validation (Zod)
6. Add settings version field for migrations
7. Cleanup orphaned keys on campaign delete

**Phase 3: Polish (Future)**
8. Unify settings stores
9. Add settings search/filter
10. Add settings categories/sub-menus
11. Add per-campaign settings override

---

## 9. Test Coverage Analysis

### 9.1 Existing Tests

| Test File | Coverage | Quality |
|-----------|----------|---------|
| `settings-storage.test.ts` | Basic | ✅ Good - tests save/load |
| `use-accessibility-store.test.ts` | Comprehensive | ✅ Excellent - tests all actions |
| `SettingsPage.test.tsx` | Minimal | ⚠️ Poor - only import test |
| `SettingsDropdown.test.tsx` | Moderate | ✅ Good - interaction tests |
| `NetworkSettingsModal.test.tsx` | Moderate | ✅ Good - form tests |
| `theme-manager.test.ts` | Moderate | ✅ Good - theme switching |
| `auto-save.test.ts` | Comprehensive | ✅ Excellent - full coverage |

### 9.2 Test Gaps

- ❌ No integration test for settings import/export
- ❌ No test for settings persistence across reloads
- ❌ No test for IPC settings handlers
- ❌ No test for volume/mute persistence (because none exists)

---

## 10. Summary

### 10.1 Strengths

1. ✅ **Comprehensive accessibility settings** - UI scale, colorblind modes, reduced motion, screen reader support
2. ✅ **Flexible keybinding system** - Per-action customization with conflict detection
3. ✅ **Import/Export functionality** - Full settings portability
4. ✅ **Proper IPC architecture** - Main/renderer separation for sensitive settings
5. ✅ **Good error handling** - try/catch on all localStorage operations
6. ✅ **Auto-save system** - Configurable with version history

### 10.2 Weaknesses

1. ❌ **Audio settings not persisted** - Critical UX issue
2. ❌ **Fragmented persistence** - Scattered across multiple systems
3. ❌ **No global reset** - Users cannot factory reset
4. ❌ **Missing volume UI** - No master volume control in settings
5. ❌ **No settings validation** - Corrupted settings may crash app
6. ❌ **No versioning** - Cannot migrate settings on app update

### 10.3 Overall Assessment

| Category | Grade | Notes |
|----------|-------|-------|
| **Saving/Loading** | B+ | Works well but fragmented |
| **Scope Management** | B | Clear but some gaps (audio) |
| **Completeness** | C+ | Missing key audio/language settings |
| **UI/UX** | B | Good interface but missing controls |
| **Reset Functionality** | C | Only keybindings have proper reset |
| **Data Integrity** | B | Good error handling, no validation |
| **Test Coverage** | B+ | Good except SettingsPage.tsx |

**Overall Grade: B**

The settings system is **functional and mostly complete**, but needs attention to audio persistence and a unified architecture for long-term maintainability.

---

## Appendix: File References

All line numbers reference files at:
- `src/main/storage/settings-storage.ts`
- `src/renderer/src/stores/use-accessibility-store.ts`
- `src/renderer/src/pages/SettingsPage.tsx`
- `src/renderer/src/services/theme-manager.ts`
- `src/renderer/src/services/notification-service.ts`
- `src/renderer/src/services/io/auto-save.ts`
- `src/renderer/src/services/keyboard-shortcuts.ts`
- `src/renderer/src/services/sound-manager.ts`
- `src/preload/index.ts`
- `src/main/ipc/storage-handlers.ts`
- `src/shared/ipc-channels.ts`

*Analysis completed by Kimi K2.5 - Phase 8 of comprehensive codebase review.*
