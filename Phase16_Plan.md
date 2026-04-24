# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 16 of the D&D VTT project.

Phase 16 is a **VTT Platform Comparison** against D&D Beyond, Foundry VTT, and Roll20. Many identified gaps are already addressed by previous phase plans (active effects, dynamic lighting, trigger zones, audio emitters, floor filtering, advanced walls, multi-token ops, rollable tables, party inventory, encounter builder). This plan covers only the **net-new items** not already assigned to other phases, plus 7 UX workflow improvements.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 16 is entirely client-side. No Raspberry Pi involvement.

**Cross-Phase Overlap Map (DO NOT duplicate — these are owned by other phases):**

| Gap | Already Addressed In |
|-----|---------------------|
| Active Effects system | Phase 1 (D7), Phase 4 (conditions) |
| Dynamic lighting animations | Phase 1 (D3) |
| Trigger zones / scene regions | Phase 1 (D4) |
| Audio emitters unwired | Phase 1 (A11) |
| Multi-floor filtering | Phase 1 (A10) |
| Advanced wall types | Phase 1 (D14) |
| Multi-token group operations | Phase 1 (D5) |
| Rollable tables | Phase 1 (D10) |
| Party inventory / shared loot | Phase 1 (D8) |
| Encounter builder CR calc | Phase 1 (D9) |
| Token context menu → conditions | Phase 1 (A6), Phase 13 (C) |
| drawTokenStatusRing unused | Phase 1 (A4) |
| Foreground / occlusion layer | Phase 1 (D16) |
| Guided character builder | Phase 2 (U3) |
| Animated scene transitions | Phase 1 (missing) |

**NET-NEW items from this phase:**

| File | Relevance |
|------|-----------|
| `src/renderer/src/components/game/map/MapCanvas.tsx` | Auto-pan to active token on turn change |
| `src/renderer/src/services/macro-engine.ts` | Macro scripting limitations |
| `src/renderer/src/components/game/player/MacroBar.tsx` | Macro bar hidden when bottom bar collapsed |
| `src/renderer/src/components/game/GameLayout.tsx` | Modal-heavy UI, no floating windows |
| `src/renderer/src/components/game/modals/utility/CompendiumModal.tsx` | Duplicates LibraryPage functionality |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### NET-NEW Features (Not covered by any previous phase)

| # | Feature | Competitor Source | Impact |
|---|---------|-------------------|--------|
| N1 | Auto-pan to active token on turn change | Roll20 | Players lose track of where combat is happening |
| N2 | Map pins with journal linkage | Roll20 | No spatial bookmarks on maps |
| N3 | Non-blocking floating tools (reduce modal reliance) | Foundry | Modals break map immersion |
| N4 | Macro engine improvements (conditionals, loops) | Roll20 | Current macros limited to simple variable substitution |
| N5 | Unified content discovery (merge Compendium + Library) | D&D Beyond | Two separate systems with different UX |
| N6 | Scene preloading for map transitions | Foundry | Map switches may stutter while loading assets |
| N7 | Grid coordinate readout on hover | Foundry/Roll20 | Players can't identify grid positions |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Auto-Pan to Active Token (N1)

**Step 1 — Implement Auto-Pan on Turn Change**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- Find where the initiative turn changes (either via store subscription or prop change)
- When the active initiative entry changes, pan the camera to center on that token:
  ```typescript
  useEffect(() => {
    if (!activeEntry || !autoPanEnabled) return
    const token = activeMap?.tokens.find(t => t.entityId === activeEntry.entityId)
    if (!token) return
    const worldX = token.gridX * cellSize + cellSize / 2
    const worldY = token.gridY * cellSize + cellSize / 2
    panToPosition(worldX, worldY, { animate: true, duration: 300 })
  }, [activeEntry?.entityId])
  ```
- Create a `panToPosition(x, y, options)` utility that smoothly animates the PixiJS viewport/camera
- The animation should use easing (ease-out) for a polished feel

**Step 2 — Add Auto-Pan Toggle**
- Add a game setting: `autoPanOnTurnChange: boolean` (default: true)
- Add a toggle button in the game toolbar or settings dropdown
- When disabled, no camera movement on turn changes
- Players should be able to override independently from DM setting

**Step 3 — Manual "Center on Token" Enhancement**
- The audit mentions "Center on entity" is a manual action via portrait click
- Enhance: add a keyboard shortcut (e.g., `C`) to center camera on the player's own token
- Add "Center on Me" button in the PlayerBottomBar

### Sub-Phase B: Map Pins with Journal Linkage (N2)

**Step 4 — Define MapPin Type**
- Add to `src/renderer/src/types/map.ts`:
  ```typescript
  export interface MapPin {
    id: string
    gridX: number
    gridY: number
    label: string
    icon: 'note' | 'quest' | 'shop' | 'danger' | 'npc' | 'custom'
    color: string
    linkedJournalId?: string
    linkedNpcId?: string
    linkedLocationId?: string
    visibleToPlayers: boolean
    floor?: number
  }
  ```
- Add `pins: MapPin[]` to `GameMap` type

**Step 5 — Create Pin Layer on Map**
- Add a new PixiJS layer for map pins in `map-pixi-setup.ts` (between Tokens and Fog layers)
- Render pins as small icons at their grid positions
- DM pins with `visibleToPlayers: false` hidden from players
- Hover shows pin label tooltip
- Click opens the linked content (journal entry, NPC sheet, or a custom note)

**Step 6 — Pin Creation UI**
- In `EmptyCellContextMenu`, add "Add Pin" option (DM only)
- Opens a small form: label, icon type, color, visibility, optional journal/NPC link
- Pin saved to the map's `pins` array via `updateMap`

**Step 7 — Pin-to-Journal Navigation**
- When clicking a pin with `linkedJournalId`, open the journal entry in a floating panel
- When clicking a pin with `linkedNpcId`, open the NPC detail view
- This creates spatial storytelling — DMs can mark important locations on the map with linked content

### Sub-Phase C: Non-Blocking Floating Tools (N3)

**Step 8 — Create FloatingWindow Component**
- Build a reusable `FloatingWindow` wrapper component:
  ```tsx
  interface FloatingWindowProps {
    title: string
    children: React.ReactNode
    defaultPosition?: { x: number; y: number }
    defaultSize?: { width: number; height: number }
    resizable?: boolean
    onClose: () => void
  }
  ```
- Features: draggable title bar, optional resize handle, close button, semi-transparent background
- Position persisted in sessionStorage per window type
- Z-order management: clicking a window brings it to front

**Step 9 — Convert Key DM Tools to Floating Windows**
- Identify the most disruptive modals (those that block the map):
  - `InitiativeModal` → convert to `FloatingWindow` option
  - `CreatureModal` (monster lookup) → floating window
  - `DMNotesModal` → floating window
- Keep modal as default but add "Float" button in the modal header that detaches it into a floating window
- The game layout should support multiple floating windows simultaneously

**Step 10 — Float Toggle Pattern**
- Add a "Float / Dock" toggle to each modal header:
  ```tsx
  <ModalHeader>
    <span>{title}</span>
    <button onClick={toggleFloat} title="Float as window">
      <FloatIcon />
    </button>
    <button onClick={onClose} title="Close">
      <CloseIcon />
    </button>
  </ModalHeader>
  ```
- When "Float" is clicked, close the modal and open the same content in a `FloatingWindow`
- Store user preference: if a tool was last used as floating, open it as floating next time

### Sub-Phase D: Macro Engine Improvements (N4)

**Step 11 — Add Conditional Logic to Macros**
- Open `src/renderer/src/services/macro-engine.ts`
- Currently supports simple variable substitution (`$self`, `$target`, `$mod.str`)
- Add basic conditional syntax:
  ```
  {if $self.hp < $self.maxhp/2}2d6+$mod.con{else}1d6+$mod.con{/if}
  ```
- Parser should handle:
  - `{if condition}...{else}...{/if}` blocks
  - Comparison operators: `<`, `>`, `<=`, `>=`, `==`, `!=`
  - Arithmetic in conditions: `$self.hp < $self.maxhp/2`

**Step 12 — Add Repeat/Multi-Roll**
- Add repeat syntax for multi-attack macros:
  ```
  {repeat 3}1d20+$mod.str vs AC | 2d6+$mod.str slashing{/repeat}
  ```
- Each iteration produces a separate roll result in chat
- Useful for Extra Attack, Eldritch Blast, Scorching Ray

**Step 13 — Fix Macro Bar Visibility**
- The audit notes the bottom bar collapse hides the Macro Bar
- When the bottom bar is collapsed, show a minimal floating macro bar:
  ```tsx
  {isBottomBarCollapsed && macros.length > 0 && (
    <FloatingMacroBar macros={macros} onExecute={executeMacro} />
  )}
  ```
- Position above the collapsed bar

### Sub-Phase E: Unified Content Discovery (N5)

**Step 14 — Merge CompendiumModal into Library Pattern**
- The CompendiumModal (in-game) and LibraryPage (out-of-game) duplicate functionality
- Replace CompendiumModal internals with a lightweight embed of the Library components:
  ```tsx
  // In CompendiumModal, instead of custom search/display:
  <LibraryItemList items={filteredItems} onSelect={handleSelect} compact />
  <LibraryDetailModal item={selectedItem} compact />
  ```
- Import `LibraryItemList` and `LibraryDetailModal` from `src/renderer/src/components/library/`
- This ensures consistent rendering (stat blocks, search quality) between in-game and out-of-game
- Upgrade CompendiumModal search from `.includes()` to Fuse.js (already addressed in Phase 5 Step 15)

### Sub-Phase F: Scene Preloading (N6)

**Step 15 — Preload Adjacent Map Assets**
- When the DM has multiple maps in a campaign, preload the background images of nearby/linked maps:
  ```typescript
  function preloadAdjacentMaps(currentMap: GameMap, allMaps: GameMap[]) {
    // Preload maps linked by portals
    const portalTargets = currentMap.terrain
      ?.filter(t => t.type === 'portal' && t.portalTarget)
      .map(t => t.portalTarget!.mapId) ?? []

    for (const mapId of portalTargets) {
      const map = allMaps.find(m => m.id === mapId)
      if (map?.imagePath) {
        Assets.load(map.imagePath).catch(() => {})
      }
    }
  }
  ```
- Call on map load and on map list change
- Use PixiJS `Assets.load()` which caches results — subsequent loads are instant
- Also preload the next map in the session's adventure sequence if one is defined

**Step 16 — Add Transition Effect**
- When switching maps, add a brief fade-to-black transition:
  ```typescript
  async function transitionToMap(mapId: string) {
    // Fade out current map (300ms)
    await fadeOverlay(0, 1, 300)
    // Switch map
    gameStore.setActiveMap(mapId)
    // Wait for new map to render (next frame)
    await new Promise(r => requestAnimationFrame(r))
    // Fade in new map (300ms)
    await fadeOverlay(1, 0, 300)
  }
  ```
- Use a PixiJS overlay or CSS transition on the canvas container
- Respect `prefers-reduced-motion` — skip animation if set

### Sub-Phase G: Grid Coordinate Readout (N7)

**Step 17 — Show Grid Position on Hover**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- On mousemove, calculate the grid coordinates under the cursor:
  ```typescript
  const gridCoord = pixelToGrid(cursorX, cursorY, grid)
  // Display as "A3" for square grid or "3,7" for hex
  ```
- Show in a small HUD element:
  ```tsx
  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
    {gridLabel}
  </div>
  ```
- For square grids: use column letter + row number (e.g., "A1", "B5", "AA12")
- For hex grids: use axial coordinates (e.g., "3,7")
- Show for both DM and players
- Add a toggle in settings to hide if unwanted

---

## ⚠️ Constraints & Edge Cases

### Auto-Pan
- **Respect manual camera position**: If the player manually panned/zoomed, don't auto-pan for 5 seconds (debounce). This prevents fighting the user's intentional camera position.
- **Hidden tokens**: If it's a hidden enemy's turn, do NOT pan to their position for players — only pan for visible entities.
- **Animation performance**: Use PixiJS ticker for smooth animation, not CSS transitions on the container.

### Map Pins
- **Pin density**: A map with many pins can be cluttered. Add a zoom threshold — hide pin labels when zoomed out past a threshold, show only icons.
- **Pin persistence**: Pins are part of `GameMap` and persist with the map data. They are NOT separate entities.
- **Network sync**: Pin CRUD must be broadcast to clients via `dm:map-update` when added/removed by the DM.

### Floating Windows
- **Do NOT float all modals** — only the frequently-used DM reference tools. Combat modals (AttackModal, SpellModal) should remain centered modals because they require focused interaction.
- **Window stacking**: Implement a simple Z-index manager. Each click on a window increments its z-index.
- **Screen bounds**: Prevent windows from being dragged off-screen. Clamp position to viewport bounds.

### Macro Conditionals
- **No arbitrary code execution**: The conditional parser should only support comparison operators and arithmetic on known variables. Do NOT implement `eval()` or allow arbitrary JavaScript.
- **Error handling**: Malformed conditional syntax should produce a clear error message, not crash the macro.
- **Backward compatibility**: Existing macros without conditionals must continue to work identically.

### Scene Preloading
- **Memory budget**: Preloading large map images consumes GPU memory. Limit to 3 preloaded maps max.
- **Network bandwidth**: If map images are transferred via P2P, preloading would trigger downloads for clients. Only preload on the host; clients preload when they receive the map data during a switch.

### Content Unification
- **Do NOT delete CompendiumModal** — it serves as a quick in-game reference. Instead, replace its internals with library components so it gets the same rendering quality and search.
- **CompendiumModal must be lightweight** — it opens and closes frequently during gameplay. Don't load the full LibraryPage state on every open.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for auto-pan — this is the highest-impact QoL improvement that every player benefits from immediately. Then Sub-Phase B (Steps 4-7) for map pins as a unique differentiator feature. Sub-Phase C (Steps 8-10) for floating windows is higher effort but transforms the DM workflow.
