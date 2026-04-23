# Phase 14: DM View — Research Findings

**Analyst:** Composer 1.5  
**Date:** March 9, 2025  
**Scope:** Full codebase analysis of the Dungeon Master (DM) view, tools, and player/DM separation.

---

## 1. Dedicated DM View with DM-Only Tools

### 1.1 DM View Toggle
- **Location:** `GameLayout.tsx` line 247  
- **Logic:** `effectiveIsDM = isDM && viewMode === 'dm'`
- **Component:** `ViewModeToggle` (line 664) — visible only when `isDM` is true. Lets the DM switch between "DM" and "Player" view.
- **Session persistence:** View mode is stored in `sessionStorage` per campaign (`game-viewMode-${campaign.id}`).

### 1.2 DM Bottom Bar
- **Location:** `GameLayout.tsx` lines 609–622  
- **Condition:** `effectiveIsDM ? DMBottomBar : PlayerBottomBar`
- When in DM view, the DM sees `DMBottomBar` with a tabbed panel (`DMTabPanel`) plus chat.
- DM tabs come from `dm-tabs.json`: Combat, Magic, DM Tools, Map, Party, Audio, AI DM, Campaign, Dice, Chat, Utility, Combat Log, Journal.

### 1.3 DM Tools Summary
| Tool Category | Access Path | Modal/Component |
|---------------|-------------|-----------------|
| Initiative | DMTabPanel → Combat tab | InitiativeModal |
| Monster Lookup | Combat tab | CreatureModal |
| Encounter Builder | DMToolsTabContent | EncounterBuilderModal |
| DM Notes | Campaign tab | DMNotesModal |
| NPC Generator | DMToolsTabContent | NPCGeneratorModal |
| Treasure Generator | DMToolsTabContent | TreasureGeneratorModal |
| Map Editor | Map tab → Edit Map | DMMapEditor (fullscreen) |
| DM Roller / Hidden Dice | Dice tab | DMRollerModal, HiddenDiceModal |
| Audio/Music | Audio tab | DMAudioPanel (in-panel) |
| Handouts | Utility tab | HandoutModal |
| Whisper | Chat tab | WhisperModal |
| AI DM controls | AI DM tab | In-panel (pause, approval, token budget) |

### 1.4 Player View Mode
When the DM switches to "Player" view via `ViewModeToggle`:
- `effectiveIsDM` becomes `false`
- Bottom bar switches to `PlayerBottomBar` (player UI)
- Map uses player vision (fog, hidden tokens)
- Left sidebar filters to player-visible content
- DM tools are not available until switching back to DM view

---

## 2. Hidden Tokens, Fog of War, and Player View

### 2.1 Token Visibility
- **Location:** `MapCanvas.tsx` lines 424–425, 461  
- **Logic:**
  - `if (!isHost && !token.visibleToPlayers) continue` — non-host viewers do not see tokens with `visibleToPlayers: false`
  - DM (when `isHost`/`effectiveIsDM` is true) sees all tokens
  - HP bars: `showHpBar = hpBarsVisibility === 'all' || (hpBarsVisibility === 'dm-only' && isHost)`
- **Token sprite:** `createTokenSprite(..., isHost)` — DM sees full labels, auras with `visibility: 'dm-only'`; players see filtered versions (e.g., first letter for hidden names).

### 2.2 Fog of War
- **Store:** `stores/game/fog-slice.ts` — `revealFog`, `hideFog`
- **Map overlay:** `map-overlay-effects.ts` lines 108–122  
  - DM: fog rendered at `alpha = 0.3` (semi-transparent, can see through)  
  - Player: fog at `alpha = 1` (fully opaque where not revealed)
- **Vision:** When `dynamicFogEnabled` is on, players use `partyVisionCells` from `recomputeVision` for revealed areas.
- **Tools:** Fog reveal/hide tools and `FogToolbar` only when `effectiveIsDM` (lines 816–826).

### 2.3 Lighting Overlay
- **Location:** `lighting-overlay.ts` lines 42–94  
- **DM:** `drawDMPreview` — light dim overlay, light source radii (no darkness masking)
- **Player:** `drawPlayerView` — full darkness mask with cutouts based on `viewerTokens` (party vision)
- **Tokens:** `viewerTokens = !isHost ? tokens.filter(t => t.entityType === 'player') : []` — DM has empty `viewerTokens`, so no player-vision masking.

### 2.4 Other DM-Only Map Features
- **Drawings:** `drawing-layer.ts` line 32 — `if (!isHost && drawing.visibleToPlayers === false) continue`
- **Regions:** `region-layer.ts` lines 66–67 — hidden regions skipped for non-host
- **Walls:** `wall-layer.ts` line 26 — walls drawn only when `isHost` (edit-mode preview)
- **Empty cell context menu:** `MapCanvas.tsx` line 530 — `onEmptyCellContextMenu` only when `effectiveIsDM`

---

## 3. Notes Panel, NPC Manager, Encounter Builder

### 3.1 DM Notes
- **Modal:** `modals/dm-tools/DMNotesModal.tsx`
- **Access:** DMTabPanel → Campaign tab → "DM Notes"
- **Guard:** `DmModals.tsx` line 101 — `activeModal === 'notes' && effectiveIsDM`

### 3.2 NPC Manager
- **Location:** `LeftSidebar.tsx` lines 218–225, `dm/NPCManager.tsx`
- **Visibility:** In the NPCs section, `NPCManager` receives `isDM={isDM}` from LeftSidebar (which gets `effectiveIsDM` from GameLayout).
- **DM vs player:** `NPCManager` filters `visibleNpcs = isDM ? npcs : npcs.filter(n => n.isVisible)` (line 104).
- **DM actions:** Add to initiative, place on map, import/export; player sees only visible NPCs.

### 3.3 Encounter Builder
- **Modal:** `modals/dm-tools/EncounterBuilderModal.tsx`
- **Access:** DMToolsTabContent → "Encounter Builder"
- **Guard:** `DmModals.tsx` line 125 — `effectiveIsDM`
- **Placement:** Can place monsters on the map with `visibleToPlayers: false` by default (line 74).

---

## 4. Music, Ambient Sounds, and Scene Transitions

### 4.1 DM Audio Control
- **Panel:** `bottom/DMAudioPanel.tsx` — used in DMTabPanel → Audio tab
- **Features:**
  - Ambient music grid from `ambient-tracks.json`
  - Volume sliders (ambient, master)
  - Quick SFX buttons
  - Custom sound upload, play, loop, delete
- **Sync:** `sendMessage('dm:play-ambient', …)`, `dm:stop-ambient`, `dm:play-sound` — host broadcasts to clients.

### 4.2 Client Handling
- **Location:** `network-store/client-handlers.ts` lines 624–645  
- Clients handle `dm:play-sound`, `dm:play-ambient`, `dm:stop-ambient` and play accordingly.

### 4.3 Scene / Map Transitions
- **Mechanisms:**
  1. **Places tree:** `SidebarEntryList` → `PlacesTree` → `onGoToMap` (setActiveMap). DM and players can switch to a map via a visible place with `linkedMapId`.
  2. **Portals:** Region triggers call `gameStore.setActiveMap(pendingPortal.targetMapId)` (GameLayout line 749) — DM-confirmed.
  3. **DMMapEditor:** MapSelector in fullscreen editor — DM only.
  4. **AI DM:** `switch_map` action in game-action-executor.
  5. **Chat command:** `/map <name>` (commands-dm-map.ts) — DM-only.
- **Network:** `client-handlers.ts` line 331 — `setActiveMap(payload.mapId)` on `game:set-active-map`.

---

## 5. DM / Player Separation and Leakage

### 5.1 Separation Logic
- **Effective DM:** `effectiveIsDM = isDM && viewMode === 'dm'`
- **isDM:** `InGamePage.tsx` line 51 — `networkRole === 'host' || (networkRole === 'none' && campaign?.dmId === 'local')`
- **Solo:** `effectiveDM = isDM || networkRole === 'none'` — in solo mode, local user is effectively DM.

### 5.2 Guards on DM Features
| Feature | Guard | File:Line |
|---------|-------|-----------|
| DMBottomBar | `effectiveIsDM` | GameLayout:609 |
| ViewModeToggle | `isDM` | GameLayout:664 |
| MapCanvas isHost | `effectiveIsDM` | GameLayout:489 |
| Fog/Wall tools | `effectiveIsDM` | GameLayout:816, 828 |
| Empty cell context menu | `effectiveIsDM` | GameLayout:530 |
| DM modals | `effectiveIsDM` | DmModals (multiple) |
| Initiative controls | `isDM` / `isHost` | InitiativeOverlay, InitiativeTracker |
| LeftSidebar filtering | `effectiveIsDM` (as isDM) | GameLayout:571 |

### 5.3 Potential Leakage
1. **LeftSidebar `isDM` prop:** LeftSidebar gets `isDM={effectiveIsDM}`. When DM is in Player view, sidebar correctly filters to player content. No leakage.
2. **Places "Go to Map":** Both DM and players get `onGoToMap` (setActiveMap). Players only see `visibleToPlayers` places, so they can switch maps only for revealed places. Intentional.
3. **Host message validation:** `host-message-handlers.ts` line 6 — "dm: prefixed messages are host-only and must never be accepted from clients." Host rejects client-originated DM messages.

---

## 6. Missing, Broken, or Incomplete

### 6.1 Missing or Partial
1. **No map selector in main game view:** Map switching in-session is via Places tree (if place has linkedMapId), portals, or fullscreen Map Editor. There is no quick map dropdown in the main game UI.
2. **Drawing tools always visible:** `GameLayout.tsx` lines 832–869 — the Drawing button block and DrawingToolbar show when `activeTool` matches, without an `effectiveIsDM` check. DM-only drawing would require wrapping these with `effectiveIsDM`.
3. **Floor selector:** MapCanvas line 788 — `isHost && hasMultipleFloors` shows FloorSelector. Correct, but floor filtering for tokens/regions is already host-gated.

### 6.2 Design Gaps
4. **Player view loses DM tools:** In Player view mode, the DM loses all DM tools (notes, encounter builder, audio, etc.) until switching back. No "quick peek" at DM tools while in Player view.
5. **NPC manager in Player view:** When in Player view, the NPC section still appears in the sidebar with `isDM=false`, so players see only visible NPCs. That’s correct, but the NPC section remains visible to the DM in Player mode (no structural change).
6. **Journal panel:** DMTabPanel Journal tab (line 348) uses `JournalPanel` with `isDM={true}`. It is inside DMTabPanel, so it only appears in DM view. Correct.

### 6.3 Verification Notes
- **Broken:** No obvious broken DM features in the code paths reviewed.
- **Incomplete:** Drawing tools UI not explicitly gated by `effectiveIsDM` — worth verifying if non-DMs can ever reach drawing tools (they shouldn’t be able to open modals, but the toolbar could show if `activeTool` is set by some path).

---

## 7. File Reference Summary

| Component / Area | File Path |
|------------------|-----------|
| Game layout, view mode, bottom bar choice | `components/game/GameLayout.tsx` |
| DM bottom bar | `components/game/bottom/DMBottomBar.tsx` |
| DM tab panel | `components/game/bottom/DMTabPanel.tsx` |
| DM tools tab | `components/game/bottom/DMToolsTabContent.tsx` |
| DM audio panel | `components/game/bottom/DMAudioPanel.tsx` |
| View mode toggle | `components/game/overlays/ViewModeToggle.tsx` |
| DM modals | `components/game/modal-groups/DmModals.tsx` |
| Map canvas, token/fog rendering | `components/game/map/MapCanvas.tsx` |
| Map overlay effects, fog, lighting | `components/game/map/map-overlay-effects.ts` |
| Lighting overlay | `components/game/map/lighting-overlay.ts` |
| Fog overlay | `components/game/map/fog-overlay.ts` |
| Left sidebar, NPC manager | `components/game/sidebar/LeftSidebar.tsx` |
| DM tab definitions | `public/data/ui/dm-tabs.json` |
| In-game page, isDM derivation | `pages/InGamePage.tsx` |
