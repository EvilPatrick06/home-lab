# Phase 1 Research: Feature Completeness (Global)

## 1. Missing Features for a Full, All-Inclusive VTT
*(Note: Voice/video are intentionally excluded as they are handled via Discord)*

### Advanced Map & Combat Features
- **3D/Elevation Combat:** Tokens have an elevation property, but line-of-sight and cover calculations operate purely on a 2D plane.
- **Hex Grid Support:** The fog of War (`fog-overlay.ts`) iterates over square grid cells only. Hex measurement distance (`measurement-tool.ts`) uses Euclidean distance only.
- **Advanced Movement & Measurement:** No D&D diagonal measurement (e.g., 1-2-1 or 5/10/5). No multi-segment ruler for path distance. No pathfinding display or threatened area highlighting.
- **Dynamic Lighting & Environment:**
  - No dynamic lighting animations (e.g., torch flicker, pulse).
  - No darkness sources (magical darkness zones).
  - No day/night cycle; weather is manual only, and there is no calendar-driven lighting.
  - No one-way or transparent wall types (only solid, door, window).
- **Scene & Map Interactivity:**
  - No trigger zones (token-enter/leave events for traps, teleportation, or macros).
  - No foreground/occlusion layer (e.g., tiles that fade conditionally on token proximity).
  - No animated scene transitions or scene preloading.
- **Token Management:**
  - No multi-token group operations (select, lock, move, enumerate).
  - No token aura rings or rotation/facing direction indicators.
  - No auto-pan to active token on turn change.

### Content & Campaign Management
- **Party Inventory / Shared Loot:** A shop system exists, but there is no shared inventory pool.
- **Encounter Builder:** Has encounter presets but no CR-based difficulty calculation.
- **Content Sharing:** No content sharing mechanism between users.
- **Rollable Tables:** `random-tables` exists as a library category, but there is no in-game table roller.
- **Active Effects System:** Conditions exist but do not mechanically alter token properties or stats.
- **Missing Core Content:** Legendary Actions/Lair Actions, Monster Templates, Specific Campaign Settings, and Treasure Hoard tables.

### AI DM Features
- **Vision Capabilities:** Missing image/map analysis for the AI to "see" token positions or map screenshots.
- **Voice/TTS Integration:** Missing text-to-speech for AI DM narration.
- **Proactive DM:** Currently reactive (waits for player input). Missing the ability to initiate based on initiative changes, HP thresholds, or time passing.

### UX/UI & Accessibility
- **Mobile/Tablet Support:** Interface is not touch-optimized, and there is no mobile companion app for player view.
- **Accessibility:** Many buttons lack `aria-label`. `CompendiumModal` and `LibraryDetailModal` don't use the shared `Modal` component (missing focus trap, escape handling). No `prefers-reduced-motion` support.

---

## 2. Features Started but Never Finished

- **WIP/Orphaned UI Components:**
  - **Library Redesign:** `src/renderer/src/components/library/*` (Barrel, `HomebrewCreateModal`, `LibraryCategoryGrid`, `LibraryDetailModal`, `LibraryItemList`, `LibrarySidebar`) are all marked as WIP and awaiting library page integration.
  - **`CombatLogPanel.tsx`:** Fully implemented but orphaned, awaiting sidebar integration.
  - **`JournalPanel.tsx`:** TipTap journal built but orphaned, awaiting sidebar integration.
  - **`RollRequestOverlay.tsx`:** DM roll request overlay built but awaiting P2P socket wiring.
  - **`ThemeSelector.tsx`:** Theme picker built but awaiting settings integration.
  - **`PrintSheet.tsx`:** Print-ready character sheet layout built but orphaned.
- **Mounted Combat Logic:** Currently in Phase 4. `riderId` exists on tokens, but the movement logic to keep rider and mount synced is incomplete.
- **Cloud LLM Integration:** Only Ollama is fully supported. Claude (`src/main/ai/claude-client.ts`), OpenAI, and Gemini cloud providers are missing from the main app flow (Claude is used in scripts only).
- **JavaScript Plugin Execution:** Content packs are working, but `plugin` and `game-system` type execution is missing (`src/main/plugins/plugin-scanner.ts:1-137`). Entry points are defined in the manifest but never loaded/executed.
- **5e Data Extraction:** In `scripts/extract-5e-data.ts` (line 254), only the Spells domain is extracted; Classes are commented out (line 267).
- **Auto-Update:** Configured in `src/main/updater.ts`, but `autoDownload` and `autoInstallOnAppQuit` are both explicitly set to `false`.
- **BMO Agents:** In `BMO-setup/pi/agent.py` (line 770), there is a `pass # Remaining agents not yet implemented`.
- **Cloud Sync:** Referenced in audits (as S3 cloud backup/sync infrastructure `cloud-sync.ts`), but the file is missing from the repository.

---

## 3. Systems Built but Not Hooked Up

- **Memory Manager Sync:** `updateWorldState()` and `updateCombatState()` in `src/main/ai/memory-manager.ts` are defined and exposed via IPC (`AI_SYNC_WORLD_STATE`), but they are never called from the renderer's main game flow. The persistent `world-state.json` / `combat-state.json` is not synced from the live game store.
- **Light Sources in Vision:** `computePartyVision` in `src/renderer/src/services/map/vision-computation.ts` accepts a `lightSources` parameter, but no caller passes them. Token light only affects the `lighting-overlay` and is ignored by fog/explored cells.
- **CDN Provider:** Exists but is unused in `src/renderer/src/services/data-provider.ts`; it is not wired up.
- **Sentient Item Generation:** A framework is built (`sentient-items.ts`) but not hooked up to the rest of the app.
- **Fog Brush Size:** Passed to `MapCanvas` as `_fogBrushSize` (`src/renderer/src/components/game/map/MapCanvas.tsx:88`), but it is completely ignored in the implementation.
- **Token Status Ring:** `drawTokenStatusRing` is exported in `combat-animations.ts` but never referenced or rendered.
- **Custom Token Images:** `MapToken.imagePath` exists in `map.ts`, but tokens currently only render as colored circles.
- **Place Creature DM Action:** `place_creature` is listed in the AI prompt (`src/main/ai/dm-system-prompt.ts`), but it is missing from the `DmAction` TypeScript union in `src/main/ai/dm-actions.ts`.
- **Initiative Delay:** The UI in `InitiativeTracker.tsx` removes the entry on `onDelayEntry`, but the `delayTurn` and `undelay` methods in the slice are separate and unwired.
- **Token Context Menu Conditions:** `handleApplyCondition` in `TokenContextMenu` simply closes the menu; there is no link to the `QuickConditionModal`.
- **Drawing Tools:** Data and layers exist (`drawing-layer.ts`), but the tools are only available in `DMMapEditor`, not in the main game toolbar.
- **Fog Controls:** "Clear All Fog" and "Reset Explored" actions exist in `vision-slice.ts`, but they are not exposed anywhere in the game UI.
- **Multi-Floor Filtering:** `currentFloor` state is set in `FloorSelector.tsx`, but it is never used for token visibility or layer filtering (floors are purely decorative).
- **Audio Emitters:** `AudioEmitterLayer` is created in `audio-emitter-overlay.ts`, but `updateEmitters` is never called with the map's `audioEmitters`.