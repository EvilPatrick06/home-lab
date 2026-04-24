# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 1 of the D&D VTT project.

Phase 1 is the **Feature Completeness Audit**. The research identified missing features, incomplete features, and built-but-unwired systems. Your task is to wire up disconnected systems, integrate orphaned components, and scaffold stubs for missing features — prioritizing quick wins that require connecting existing code over building net-new systems.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`)

All Electron main-process and renderer code lives here. This is the primary target for Phase 1 work.

**Electron Main Process (`src/main/`):**
- `src/main/ai/memory-manager.ts` — World/combat state sync (needs renderer integration)
- `src/main/ai/dm-actions.ts` — DM action types and parser (place_creature already present — verify handler exists)
- `src/main/ai/dm-system-prompt.ts` — DM system prompt (~825 lines)
- `src/main/ai/claude-client.ts` — Claude LLM client (needs integration into main AI flow alongside Ollama)
- `src/main/plugins/plugin-scanner.ts` — Plugin scanner (~164 lines, needs plugin/game-system execution)
- `src/main/updater.ts` — Auto-updater (~145 lines, autoDownload/autoInstallOnAppQuit disabled)
- `src/main/cloud-sync.ts` — Cloud sync via rclone on BMO (~328 lines, EXISTS contrary to audit — needs IPC wiring)
- `src/main/ipc/` — IPC handlers directory

**Electron Renderer (`src/renderer/src/`):**

| Component | Verified Path | Status |
|-----------|--------------|--------|
| CombatLogPanel | `src/renderer/src/components/game/sidebar/CombatLogPanel.tsx` | Built, needs sidebar integration |
| JournalPanel | `src/renderer/src/components/game/sidebar/JournalPanel.tsx` | Built, needs sidebar integration |
| RollRequestOverlay | `src/renderer/src/components/game/overlays/RollRequestOverlay.tsx` | Built, needs P2P socket wiring |
| ThemeSelector | `src/renderer/src/components/game/overlays/ThemeSelector.tsx` | Built, needs settings integration |
| PrintSheet | `src/renderer/src/components/sheet/shared/PrintSheet.tsx` | Built, orphaned |
| Library redesign | `src/renderer/src/components/library/` (HomebrewCreateModal, LibraryCategoryGrid, LibraryDetailModal, LibraryItemList, LibrarySidebar) | WIP, awaiting library page integration |
| QuickConditionModal | `src/renderer/src/components/game/modals/combat/QuickConditionModal.tsx` | Built, not linked from TokenContextMenu |
| TokenContextMenu | `src/renderer/src/components/game/overlays/TokenContextMenu.tsx` | handleApplyCondition closes menu without opening QuickConditionModal |
| InitiativeTracker | `src/renderer/src/components/game/dm/InitiativeTracker.tsx` | Delay/undelay props exist but store methods unwired |
| MapCanvas | `src/renderer/src/components/game/map/MapCanvas.tsx` (~838 lines) | fogBrushSize prop ignored (line 92) |
| fog-overlay | `src/renderer/src/components/game/map/fog-overlay.ts` (~357 lines) | Square grid only |
| measurement-tool | `src/renderer/src/components/game/map/measurement-tool.ts` (~213 lines) | Euclidean only |
| combat-animations | `src/renderer/src/components/game/map/combat-animations.ts` (~467 lines) | drawTokenStatusRing exported but unused |
| drawing-layer | `src/renderer/src/components/game/map/drawing-layer.ts` | Only in DMMapEditor, not game toolbar |
| audio-emitter-overlay | `src/renderer/src/components/game/map/audio-emitter-overlay.ts` (~206 lines) | updateEmitters never called |
| FloorSelector | `src/renderer/src/components/game/map/FloorSelector.tsx` | currentFloor set but never filters tokens/layers |
| vision-computation | `src/renderer/src/services/map/vision-computation.ts` (~330 lines) | lightSources parameter accepted but never passed |
| sentient-items | `src/renderer/src/data/sentient-items.ts` | Framework built but not hooked up |
| data-provider | `src/renderer/src/services/data-provider.ts` (~1163 lines) | No CDN provider code found despite audit claim |

**Stores (Zustand):**
- `src/renderer/src/stores/game/vision-slice.ts` — Has `clearVision(mapId)`, `clearAllVision()`, `setDynamicFogEnabled()` — none exposed in game UI
- `src/renderer/src/stores/game/fog-slice.ts` — Has `revealFog()`, `hideFog()` — no bulk clear/reset UI
- `src/renderer/src/stores/game/index.ts` — Aggregates all slices including floor-slice, fog-slice, initiative-slice, vision-slice, drawing-slice, effects-slice

### Raspberry Pi (`patrick@bmo` / `BMO-setup/pi/`)

- `BMO-setup/pi/agent.py` (~2958 lines) — Line 768-769: `pass  # Remaining agents not yet implemented`
- `BMO-setup/pi/voice_pipeline.py` — Voice/TTS pipeline for AI DM narration
- `BMO-setup/pi/dnd_engine.py` — D&D engine for proactive DM triggers
- `BMO-setup/pi/agents/` — Directory of 20+ agents (needs completion)

---

## 📋 Core Objectives & Corrections

### CORRECTIONS FROM AUDIT (Items the audit got wrong)

1. **`place_creature` IS in `DmAction` union** — `src/main/ai/dm-actions.ts` lines 38-47 already contains `place_creature`. The audit claimed it was missing. **Action:** Verify there is a runtime handler/executor for this action. If the action type exists but no handler processes it, add the handler.

2. **`cloud-sync.ts` EXISTS** — `src/main/cloud-sync.ts` (~328 lines) is a fully implemented module using rclone via BMO bridge. The audit claimed the file was missing. **Action:** Verify IPC handlers exist in `src/main/ipc/` to expose cloud-sync to the renderer. If missing, wire them up.

3. **No CDN Provider in `data-provider.ts`** — The audit claimed a CDN provider exists but is unused. Grep confirms zero CDN references in the file. **Action:** No action needed on CDN. Mark as audit false-positive.

### PRIORITY A: Wire Up Disconnected Systems (Quick Wins)

These systems are fully built but simply not connected. Each item requires minimal code — typically adding a function call, importing a component, or passing a prop.

| # | System | What Exists | What's Missing |
|---|--------|------------|----------------|
| A1 | Memory Manager Sync | `updateWorldState()` and `updateCombatState()` in `memory-manager.ts` (lines 92, 110), IPC channel `AI_SYNC_WORLD_STATE` | No caller from renderer game flow. Need to dispatch sync calls on game state changes (combat start/end, turn change, HP change, map change). |
| A2 | Light Sources in Vision | `computePartyVision()` accepts `lightSources` param in `vision-computation.ts` (line 46-50) | No caller passes light source data. Collect token light sources from game store and pass them to `computePartyVision`. |
| A3 | Fog Brush Size | `fogBrushSize` prop passed to `MapCanvas` (line 92 as `_fogBrushSize`) | Prop is destructured with underscore prefix and ignored. Wire it into the fog painting logic in `fog-overlay.ts`. |
| A4 | Token Status Ring | `drawTokenStatusRing` exported from `combat-animations.ts` (line 449) | Never called during token rendering. Call it from the token render loop in `MapCanvas.tsx` when a token has active conditions. |
| A5 | Custom Token Images | `MapToken.imagePath` exists in map types (`map.ts`) | Tokens only render as colored circles. Load and render `imagePath` as a sprite/texture when present. |
| A6 | Token Context Menu → Conditions | `handleApplyCondition` in `TokenContextMenu.tsx` | Handler just closes menu. Wire it to open `QuickConditionModal.tsx` (at `src/renderer/src/components/game/modals/combat/QuickConditionModal.tsx`) with the selected token. |
| A7 | Initiative Delay | `onDelayTurn` and `onUndelay` props in `InitiativeTracker.tsx` (lines 24, 46) | Props come from store but `delayTurn`/`undelay` methods are separate and unwired. Connect the UI callbacks to the store actions. |
| A8 | Drawing Tools in Game | Drawing layer and tools exist in `drawing-layer.ts` | Only available in DMMapEditor. Expose drawing tool buttons in the main game toolbar for the DM role. |
| A9 | Fog Controls in UI | `clearVision(mapId)`, `clearAllVision()` in `vision-slice.ts`; `revealFog()`/`hideFog()` in `fog-slice.ts` | No UI buttons exposed. Add "Clear Fog" and "Reset Explored" buttons to the DM map toolbar. |
| A10 | Multi-Floor Token Filtering | `currentFloor` state in `FloorSelector.tsx` | Floor changes are decorative. Filter token visibility and layer rendering by `currentFloor` value. |
| A11 | Audio Emitters | `AudioEmitterLayer` and `updateEmitters()` in `audio-emitter-overlay.ts` (line 80) | `updateEmitters` is never called. Wire it to receive the map's `audioEmitters` data on map load and map change. |
| A12 | Sentient Items | Framework in `src/renderer/src/data/sentient-items.ts` | Not hooked into item generation or DM tools. Wire into the magic item generation flow. |

### PRIORITY B: Integrate Orphaned UI Components

These components are fully built but not rendered anywhere in the app.

| # | Component | Integration Target |
|---|-----------|-------------------|
| B1 | CombatLogPanel (`game/sidebar/CombatLogPanel.tsx`) | Add as a tab/panel in the game sidebar. Wire to receive combat log events from the game store. |
| B2 | JournalPanel (`game/sidebar/JournalPanel.tsx`) | Add as a tab/panel in the game sidebar. Uses TipTap editor — ensure TipTap dependency is in package.json. |
| B3 | RollRequestOverlay (`game/overlays/RollRequestOverlay.tsx`) | Wire to P2P socket events. When DM requests a roll from a player, show this overlay on the player's client. |
| B4 | ThemeSelector (`game/overlays/ThemeSelector.tsx`) | Integrate into the Settings page/modal. Connect to the app's theme state. |
| B5 | PrintSheet (`sheet/shared/PrintSheet.tsx`) | Add a "Print Character Sheet" button to the character sheet view that renders this component. |
| B6 | Library Redesign (`components/library/*`) | All 5 components (HomebrewCreateModal, LibraryCategoryGrid, LibraryDetailModal, LibraryItemList, LibrarySidebar) need integration into the Library page. Replace or augment existing library UI. |

### PRIORITY C: Complete Partially Built Systems

| # | System | Current State | Required Work |
|---|--------|--------------|---------------|
| C1 | Cloud LLM Integration | Only Ollama works. `claude-client.ts`, OpenAI, Gemini clients exist in `src/main/ai/` | Add provider selection to AI settings. Route AI calls through a provider abstraction that can dispatch to Ollama, Claude, OpenAI, or Gemini based on user config. |
| C2 | Plugin Execution | Content packs work. `plugin-scanner.ts` scans manifests but `plugin`/`game-system` types never execute | Implement sandboxed JS execution for plugin entry points defined in manifests. |
| C3 | Auto-Update | `updater.ts` has `autoDownload=false`, `autoInstallOnAppQuit=false` | Change to `autoDownload=true`. Add a user-facing update notification with "Install Now" / "Install on Quit" options. |
| C4 | 5e Data Extraction | `scripts/extract-5e-data.ts` line 254: only Spells extracted. Line 267: Classes commented out | Uncomment and complete the Classes extraction. Add remaining domains (Feats, Backgrounds, etc.). |
| C5 | Cloud Sync IPC | `cloud-sync.ts` exists and is implemented | Verify/add IPC handlers to expose sync operations to the renderer. Add UI for triggering backup/restore. |
| C6 | BMO Agents | `agent.py` line 768-769: `pass` stub | Complete remaining agent implementations on the Pi. This is Raspberry Pi work. |

### PRIORITY D: Scaffold Missing Features (Stubs Only)

These are net-new features that need type definitions, interfaces, and placeholder implementations. Full implementation will happen in later phases.

| # | Feature | Scaffold Requirements |
|---|---------|----------------------|
| D1 | Hex Grid Support | Add `gridType: 'square' | 'hex'` to map types. Add hex distance calculation stub to `measurement-tool.ts`. Add hex iteration stub to `fog-overlay.ts`. |
| D2 | D&D Diagonal Measurement | Add `diagonalRule: '5-10-5' | 'euclidean' | 'manhattan'` to game settings types. Stub measurement variant in `measurement-tool.ts`. |
| D3 | Dynamic Lighting Animations | Add `lightAnimation?: { type: 'flicker' | 'pulse'; intensity: number }` to light source types. Stub animation loop. |
| D4 | Trigger Zones | Add `TriggerZone` type with `onEnter`/`onLeave` callbacks to map types. Stub zone layer. |
| D5 | Token Group Operations | Add multi-select state to game store. Stub group move/lock/delete actions. |
| D6 | Token Auras & Rotation | Add `auraRadius?: number`, `rotation?: number` to `MapToken` type. Stub rendering. |
| D7 | Active Effects System | Add `ActiveEffect` type that mechanically modifies stats. Stub effect application on condition add/remove. |
| D8 | Party Inventory / Shared Loot | Add `PartyInventory` type to game store. Stub shared loot UI. |
| D9 | Encounter Builder CR Calc | Add CR difficulty calculation function stub using 5e 2024 encounter budget tables. |
| D10 | Rollable Tables | Add in-game table roller component stub. Wire to existing `random-tables` data. |
| D11 | Accessibility Pass | Add `aria-label` to all icon-only buttons. Migrate `CompendiumModal` and `LibraryDetailModal` to use shared `Modal` component (focus trap, Escape handling). Add `prefers-reduced-motion` media query support. |
| D12 | AI DM Proactive Triggers | Add event hook types for initiative change, HP threshold, and time-based triggers. Stub observer in AI flow. |
| D13 | AI Vision (Map Screenshot) | Stub a screenshot capture function in main process. Stub image encoding for LLM vision APIs. |
| D14 | One-Way/Transparent Walls | Add `wallType: 'solid' | 'door' | 'window' | 'one-way' | 'transparent'` to wall types. |
| D15 | Darkness Sources | Add `DarknessZone` type. Stub rendering in lighting overlay. |
| D16 | Foreground/Occlusion Layer | Add `occlusionLayer` to map types. Stub conditional fade on token proximity. |
| D17 | Mounted Combat Sync | Wire `riderId` movement logic so rider token follows mount token. |
| D18 | Legendary/Lair Actions | Add `legendaryActions`, `lairActions` fields to monster stat block types. |

---

## 🛠️ Step-by-Step Execution Plan

Execute in this exact order. Each step includes the file(s) to modify and the specific change.

### Sub-Phase A: Wire Disconnected Systems

**Step 1 — Memory Manager Sync**
- Open `src/renderer/src/stores/game/index.ts`
- Identify game state change subscriptions (combat start, turn advance, HP change, map load)
- Add IPC calls to `window.api.ai.syncWorldState()` and `window.api.ai.syncCombatState()` at these points
- Verify the IPC channel `AI_SYNC_WORLD_STATE` is registered in `src/main/ipc/`

**Step 2 — Light Sources in Vision**
- Open `src/renderer/src/services/map/vision-computation.ts`
- Identify where `computePartyVision` is called (search for callsites)
- At each callsite, collect light source data from tokens in the current map
- Pass the collected `lightSources` array to `computePartyVision`

**Step 3 — Fog Brush Size**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- Find `_fogBrushSize` at line 92
- Remove the underscore prefix, wire the value into `fog-overlay.ts` fog painting functions
- Ensure the brush size affects the radius of fog reveal/hide operations

**Step 4 — Token Status Ring**
- Open `src/renderer/src/components/game/map/combat-animations.ts`
- Find `drawTokenStatusRing` (line 449)
- Open `MapCanvas.tsx` token rendering section
- Call `drawTokenStatusRing` for each token that has active conditions

**Step 5 — Custom Token Images**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- Find the token rendering code (colored circles)
- Add conditional: if `token.imagePath` exists, load as PixiJS texture/sprite instead of drawing a circle
- Add texture caching to avoid reloading on every frame

**Step 6 — Token Context Menu → Quick Condition Modal**
- Open `src/renderer/src/components/game/overlays/TokenContextMenu.tsx`
- Find `handleApplyCondition`
- Instead of just closing the menu, set state to open `QuickConditionModal` with the target token ID
- Import and render `QuickConditionModal` from `src/renderer/src/components/game/modals/combat/QuickConditionModal.tsx`

**Step 7 — Initiative Delay Wiring**
- Open `src/renderer/src/components/game/dm/InitiativeTracker.tsx`
- Trace `onDelayTurn` and `onUndelay` props
- Verify the parent component passes actual store actions (not no-ops)
- Connect to `delayTurn()` and `undelay()` store methods in the initiative slice

**Step 8 — Drawing Tools in Game Toolbar**
- Open the main game toolbar component (find it via the DMMapEditor import pattern for drawing tools)
- Add drawing tool buttons (pen, line, shape, eraser) to the game toolbar, gated behind `isDM` check
- Wire buttons to the same drawing-layer actions used by DMMapEditor

**Step 9 — Fog Control Buttons**
- Locate the DM map toolbar/controls area
- Add two buttons: "Clear All Fog" → calls `clearAllVision()` from vision-slice, "Reset Explored" → calls `clearVision(currentMapId)` from vision-slice
- Gate behind `isDM` check

**Step 10 — Multi-Floor Token Filtering**
- Open `src/renderer/src/components/game/map/FloorSelector.tsx`
- Trace where `currentFloor` is stored
- In `MapCanvas.tsx` token rendering loop, filter tokens by `token.floor === currentFloor`
- Apply same filter to drawing layers and other map overlays

**Step 11 — Audio Emitters**
- Open `src/renderer/src/components/game/map/audio-emitter-overlay.ts`
- Find `updateEmitters` (line 80)
- Locate map load/change event handler in the game flow
- Call `updateEmitters(map.audioEmitters)` when the active map changes

**Step 12 — Sentient Items**
- Open `src/renderer/src/data/sentient-items.ts`
- Identify the generation API it exposes
- Wire into magic item generation UI/flow (likely in DM tools or loot generation)

### Sub-Phase B: Integrate Orphaned Components

**Step 13 — CombatLogPanel into Sidebar**
- Open the game sidebar component (likely in `src/renderer/src/components/game/sidebar/`)
- Add CombatLogPanel as a new tab alongside existing sidebar tabs
- Wire combat events from the game store into the panel

**Step 14 — JournalPanel into Sidebar**
- Add JournalPanel as a new tab in the game sidebar
- Verify TipTap dependencies are installed (`@tiptap/react`, `@tiptap/starter-kit`, etc.)
- Connect journal save/load to campaign storage

**Step 15 — ThemeSelector into Settings**
- Find the Settings page/modal
- Import and render ThemeSelector
- Connect to the app's theme/CSS variable system

**Step 16 — PrintSheet Button**
- Open the character sheet view component
- Add a "Print" button that renders PrintSheet in a print-friendly layout
- Use `window.print()` or Electron's print API

**Step 17 — Library Redesign Integration**
- Open the Library page
- Replace/augment with the new components from `src/renderer/src/components/library/`
- Wire HomebrewCreateModal, LibraryCategoryGrid, LibraryDetailModal, LibraryItemList, LibrarySidebar

### Sub-Phase C: Complete Partial Systems

**Step 18 — Cloud LLM Provider Abstraction**
- Open `src/main/ai/` directory
- Create a provider router that selects between Ollama, Claude, OpenAI, Gemini based on user settings
- Wire `claude-client.ts` and other clients into the main AI conversation flow
- Add provider selection to AI settings UI

**Step 19 — Plugin Execution**
- Open `src/main/plugins/plugin-scanner.ts`
- After scanning manifests, for `plugin` and `game-system` types, load and execute their entry point JS files
- Use a sandboxed context (Node.js `vm` module or Electron's `webFrame.executeJavaScript`)

**Step 20 — Auto-Update UX**
- Open `src/main/updater.ts`
- Set `autoDownload: true`
- Add IPC channel to notify renderer of available updates
- Add update notification UI with "Install Now" / "Later" options

**Step 21 — Cloud Sync UI**
- Verify IPC handlers for `cloud-sync.ts` exist in `src/main/ipc/`
- If missing, add IPC handlers for sync operations
- Add backup/restore UI in settings

**Step 22 — 5e Data Extraction**
- Open `scripts/extract-5e-data.ts`
- Uncomment Classes extraction at line 267
- Add remaining domains

### Sub-Phase D: Scaffold Net-New Features (Types & Stubs Only)

**Step 23 — Map Type Extensions**
- Add to map types: `gridType`, `wallType` extensions, `TriggerZone`, `DarknessZone`, `occlusionLayer`
- Add to token types: `auraRadius`, `rotation`, `groupId`
- Add to monster types: `legendaryActions`, `lairActions`

**Step 24 — Game Settings Extensions**
- Add to game settings types: `diagonalRule`, `lightAnimations`
- Add `ActiveEffect` type definition

**Step 25 — Store Stubs**
- Add `PartyInventory` type and empty slice stub
- Add multi-select token state stub
- Add encounter CR calculation function stub

**Step 26 — AI Event Hooks**
- Define `DmTrigger` type: `{ event: 'initiative_change' | 'hp_threshold' | 'time_elapsed'; condition: ...; action: ... }`
- Add trigger observer stub in AI flow

**Step 27 — Accessibility Audit (Manual)**
- Add `aria-label` to all `<button>` elements that only contain icons
- Migrate `CompendiumModal` and `LibraryDetailModal` to use shared `Modal` component
- Add `@media (prefers-reduced-motion: reduce)` to global CSS, disable animations

### Sub-Phase E: Raspberry Pi Work

**Step 28 — BMO Agent Completion (on `patrick@bmo`)**
- SSH to `patrick@bmo`
- Open `BMO-setup/pi/agent.py`
- At line 768-769, replace `pass` stub with actual agent implementations
- Focus on D&D-relevant agents first (encounter generation, NPC dialogue, lore lookup)

---

## ⚠️ Constraints & Edge Cases

### D&D 5e 2024 Rules
- Diagonal measurement MUST support the 5e 2024 rule: alternating 5ft/10ft (not the older 5ft flat rule). Default to `5-10-5`.
- CR-based encounter difficulty MUST use the 2024 encounter budget tables, not the 2014 XP thresholds.
- Conditions (Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious, Exhaustion) must match the 2024 PHB definitions.
- Legendary Actions use the 2024 format (actions at end of other creatures' turns, not a pool).

### State Synchronization
- Memory Manager sync (`updateWorldState`/`updateCombatState`) must be **debounced** — do not call on every frame or minor state change. Debounce to 2-5 second intervals or trigger only on significant events.
- Floor filtering must not delete tokens — only hide them from rendering. Tokens on other floors still participate in initiative and HP tracking.
- Fog operations (clear/reset) are **DM-only** actions. Never expose to player clients.
- Audio emitter updates must handle map transitions gracefully — stop old emitters before starting new ones.

### Security & Sandboxing
- Plugin execution MUST be sandboxed. Plugins must NOT have access to `require('fs')`, `require('child_process')`, or any Node.js APIs. Use a restricted VM context.
- Cloud sync operations go through BMO Pi — no AWS/GCP credentials should ever be stored in the Electron app.
- Custom token images must be validated (file type check, size limit) before loading as PixiJS textures to prevent memory exhaustion.

### Performance
- Token image textures must be cached in a `Map<string, PIXI.Texture>` to avoid reloading per frame.
- Light source collection for vision computation must be O(n) where n = token count, not O(n*m) with map cells.
- `drawTokenStatusRing` should only be called for tokens with active conditions, not all tokens.
- Fog brush operations should use a spatial index for cells within brush radius, not iterate all grid cells.

### Backward Compatibility
- All new map/token type fields must be **optional** with sensible defaults to avoid breaking existing campaign saves.
- `gridType` defaults to `'square'`, `wallType` defaults to `'solid'`, `diagonalRule` defaults to `'5-10-5'`.
- Existing content packs must continue to work — plugin execution is additive only.

Begin implementation now. Execute Sub-Phase A first (Steps 1-12), verifying each hookup works before proceeding. Output the modified code blocks and verify paths before moving to the next step.
