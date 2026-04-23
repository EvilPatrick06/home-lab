# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 14 of the D&D VTT project.

Phase 14 covers the **DM View** — dedicated DM tools, player/DM separation, and feature gating. The audit found the system **well-implemented with no broken features**. DM/player view toggle, token visibility, fog differentiation, lighting overlay, host message validation, and sidebar filtering all work correctly. The work here is **3 small gaps**: missing quick map selector, drawing tools not explicitly DM-gated, and DM losing all tools in player preview mode.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 14 is entirely client-side. No Raspberry Pi involvement.

**Core DM View Files:**

| File | Role | Status |
|------|------|--------|
| `src/renderer/src/components/game/GameLayout.tsx` | Main game layout — view mode toggle (line 247), bottom bar choice (lines 609-622), drawing toolbar (lines 832-869) | `effectiveIsDM` gating works; drawing tools NOT gated |
| `src/renderer/src/components/game/overlays/ViewModeToggle.tsx` | DM/Player view toggle (visible only when `isDM`) | Functional |
| `src/renderer/src/components/game/bottom/DMBottomBar.tsx` | DM bottom bar with tab panel | Functional |
| `src/renderer/src/components/game/bottom/DMTabPanel.tsx` | 13 DM tabs (Combat, Magic, DM Tools, Map, Party, Audio, AI DM, Campaign, Dice, Chat, Utility, Combat Log, Journal) | Functional |
| `src/renderer/src/components/game/bottom/DMAudioPanel.tsx` | Audio control with ambient grid, volume, SFX, custom uploads | Functional |
| `src/renderer/src/components/game/modal-groups/DmModals.tsx` | DM modal orchestrator — all gated by `effectiveIsDM` | Functional |
| `src/renderer/src/components/game/map/MapCanvas.tsx` | Token visibility (line 424-425, 461), HP bars, fog alpha | Functional |
| `src/renderer/src/components/game/map/map-overlay-effects.ts` | Fog: DM alpha 0.3, player alpha 1.0 (lines 108-122) | Functional |
| `src/renderer/src/components/game/map/lighting-overlay.ts` | DM: `drawDMPreview`, Player: `drawPlayerView` (lines 42-94) | Functional |
| `src/renderer/src/components/game/sidebar/LeftSidebar.tsx` | NPC filtering: DM sees all, players see visible only (line 104) | Functional |
| `src/renderer/src/pages/InGamePage.tsx` | isDM derivation (line 51): `networkRole === 'host' \|\| (networkRole === 'none' && campaign?.dmId === 'local')` | Functional |

**DM Guard Summary (all verified working):**

| Feature | Guard | File |
|---------|-------|------|
| DMBottomBar | `effectiveIsDM` | `GameLayout.tsx:609` |
| ViewModeToggle | `isDM` | `GameLayout.tsx:664` |
| MapCanvas isHost | `effectiveIsDM` | `GameLayout.tsx:489` |
| Fog/Wall tools | `effectiveIsDM` | `GameLayout.tsx:816, 828` |
| Empty cell context menu | `effectiveIsDM` | `GameLayout.tsx:530` |
| DM modals | `effectiveIsDM` | `DmModals.tsx` (multiple) |
| Initiative controls | `isDM` / `isHost` | `InitiativeOverlay, InitiativeTracker` |
| LeftSidebar filtering | `effectiveIsDM` | `GameLayout.tsx:571` |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### ISSUES IDENTIFIED

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| D1 | No quick map selector in main game view — map switching requires Places tree, portals, or fullscreen editor | Medium | `GameLayout.tsx` |
| D2 | Drawing tools toolbar not explicitly gated by `effectiveIsDM` — could theoretically show for players if `activeTool` is set | Low (security) | `GameLayout.tsx` lines 832-869 |
| D3 | DM loses ALL tools in Player view mode — no "quick peek" or floating DM tools | Medium (UX) | `GameLayout.tsx:247` |

### VERIFIED WORKING (No action needed)

- Token visibility: `visibleToPlayers` properly gated
- Fog of war: DM alpha 0.3, player alpha 1.0
- Lighting: DM preview vs player darkness mask
- Host message validation: rejects client `dm:` messages
- NPC filtering: DM sees all, players see visible only
- Drawing visibility: `visibleToPlayers` filter on drawings
- Region visibility: hidden regions skipped for non-host
- Wall rendering: DM only
- View mode session persistence: `sessionStorage` per campaign

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Quick Map Selector (D1)

**Step 1 — Add Map Dropdown to DM Toolbar**
- Open `src/renderer/src/components/game/GameLayout.tsx`
- Add a compact map selector dropdown in the DM toolbar area (visible only when `effectiveIsDM`):
  ```tsx
  {effectiveIsDM && maps.length > 1 && (
    <MapQuickSelector
      maps={maps}
      activeMapId={activeMap?.id}
      onSelectMap={(mapId) => gameStore.setActiveMap(mapId)}
    />
  )}
  ```
- Create `MapQuickSelector` as a small dropdown component:
  ```tsx
  function MapQuickSelector({ maps, activeMapId, onSelectMap }) {
    return (
      <select
        value={activeMapId}
        onChange={(e) => onSelectMap(e.target.value)}
        className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-600"
      >
        {maps.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    )
  }
  ```
- Or use a custom dropdown with map thumbnails for a more polished UX
- Position it in the top bar near the view mode toggle or in the Map tab of DMTabPanel

**Step 2 — Network Broadcast on Map Switch**
- When the DM selects a map from the quick selector, broadcast `dm:map-change` to all clients
- Verify the existing `setActiveMap` flow already handles this broadcast (check `game-sync.ts`)
- If not, add the broadcast: `sendMessage('game:set-active-map', { mapId })`

### Sub-Phase B: Drawing Tools DM Gate (D2)

**Step 3 — Gate Drawing Toolbar by effectiveIsDM**
- Open `src/renderer/src/components/game/GameLayout.tsx`
- Find the drawing tools block at lines 832-869
- Wrap with `effectiveIsDM` check:
  ```tsx
  {effectiveIsDM && (activeTool === 'draw-free' || activeTool === 'draw-line' || ...) && (
    <DrawingToolbar ... />
  )}
  ```
- Also gate the drawing tool buttons themselves — ensure the `DMToolbar` only shows drawing tools when `effectiveIsDM` is true
- Verify: can a player ever have `activeTool` set to a drawing tool? Search for `setActiveTool('draw-')` calls and ensure they're all DM-gated

**Step 4 — Verify No Player Path to Drawing Tools**
- Search the codebase for all calls to `setActiveTool` with draw tool values
- Confirm these are only reachable from:
  - `DMToolbar` (DM-only toolbar)
  - `DMMapEditor` (DM-only fullscreen editor)
  - Never from player UI components
- If any player-accessible code sets a draw tool, remove or gate it

### Sub-Phase C: DM Quick Tools in Player View (D3)

**Step 5 — Add Floating DM Quick Access Panel**
- When the DM is in Player view mode (`isDM && viewMode === 'player'`), show a minimal floating panel with essential DM tools:
  ```tsx
  {isDM && viewMode === 'player' && (
    <FloatingDMPanel
      onSwitchView={() => setViewMode('dm')}
      onOpenInitiative={() => openModal('initiative')}
      onNextTurn={() => gameStore.nextTurn()}
      onPauseAI={() => toggleAIPause()}
    />
  )}
  ```
- The floating panel should be:
  - Small (icon-only buttons, no labels)
  - Semi-transparent
  - Positioned in the corner (top-right or bottom-right)
  - Draggable (optional)
  - Contains only the most critical DM actions: "Switch to DM View", "Next Turn", "Pause AI", "Open Initiative"
- This lets the DM preview the player experience while retaining quick access to essential controls

**Step 6 — Keyboard Shortcut for View Toggle**
- Add a keyboard shortcut to quickly toggle between DM and Player view:
  ```typescript
  // In keyboard-shortcuts.ts or a useEffect in GameLayout:
  if (isDM && event.key === 'F5') {
    setViewMode(viewMode === 'dm' ? 'player' : 'dm')
  }
  ```
- Add this to the keybindings system in `use-accessibility-store.ts` so it's customizable
- Default: F5 (or another unused key — check existing keybindings for conflicts)

### Sub-Phase D: Audio Sync Verification

**Step 7 — Verify Audio Sync Completeness**
- The DM controls audio via `DMAudioPanel`. Verify all audio actions sync to clients:
  - `dm:play-ambient` — ambient track starts on all clients
  - `dm:stop-ambient` — ambient stops on all clients
  - `dm:play-sound` — SFX plays on all clients
  - Volume changes — verify if volume is per-client (player controls their own) or DM-set
- Check `client-handlers.ts` lines 624-645 for the client-side handling
- Verify: when a player joins mid-session, do they hear the currently playing ambient? If not, add a state sync that includes current audio state

**Step 8 — Add "Currently Playing" Indicator for Clients**
- Players should see what ambient music/sound is currently playing (for immersion context)
- Add a small indicator in the PlayerBottomBar or as an overlay:
  ```tsx
  {currentAmbient && (
    <div className="text-xs text-gray-400 flex items-center gap-1">
      <MusicIcon className="w-3 h-3" />
      <span>{currentAmbient.name}</span>
    </div>
  )}
  ```

---

## ⚠️ Constraints & Edge Cases

### Quick Map Selector
- **Player maps**: The selector is DM-only. Players switch maps through Places tree or portal triggers. Do NOT add a map selector for players — map access should be DM-controlled.
- **Network broadcast**: When the DM switches maps, ALL clients should switch. Verify the existing `dm:map-change` network message includes the full map data for clients that haven't loaded it yet.
- **Performance**: The dropdown should NOT render map images/thumbnails inline — just map names. Thumbnail rendering would cause unnecessary texture loads.

### Drawing Tools Gate
- **This may already be safe**: Drawing tools are only accessible from `DMToolbar` which is only rendered in `DMBottomBar`. However, if `activeTool` state persists across view mode switches, a player session could theoretically inherit a draw tool active state from a previous DM session. The explicit `effectiveIsDM` gate prevents this edge case.
- **Do NOT gate drawing RENDERING for players**: Players should still SEE drawings that have `visibleToPlayers: true`. Only gate the drawing CREATION tools.

### Floating DM Panel in Player View
- **Must not block map interaction**: The floating panel should be small and positioned in a corner. Use `pointer-events: none` on the panel background with `pointer-events: auto` only on the buttons.
- **Should NOT include map editing tools**: Only quick actions (view toggle, initiative, AI pause). Full DM tools require switching back to DM view.
- **View mode should NOT affect game state**: Switching to player view is purely a rendering change. Game state (initiative, tokens, fog) continues unchanged.

### Audio Sync for Late Joiners
- **This is a real gap**: If a player joins after the DM started ambient music, the new player hears nothing. The state sync for new players (`game-sync.ts` lines 249-291) should include the current audio state.
- **Audio state**: Track `currentAmbientTrack: string | null` and `ambientVolume: number` in the game store, and include in the full state sync payload.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) for the quick map selector — this is the most impactful DM workflow improvement. Then Sub-Phase C (Steps 5-6) for the floating DM panel in player view. Sub-Phase B (Steps 3-4) is a quick security gate that should be done alongside.
