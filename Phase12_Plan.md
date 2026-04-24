# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 12 of the D&D VTT project.

Phase 12 covers the **Map System** — the most architecturally mature subsystem. 16+ composited PixiJS layers, raycast visibility engine, A* pathfinding, three-state animated fog, weather particles, hex grid support, and full import/export. The core is strong; the work here is **missing features** (map resize, gridless mode, portal terrain UI, layer visibility panel), **bug fixes** (pixel math double-multiplication, duplicate refs), and **polish** (drawing preview, text tool, wall preview, hex labels).

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 12 is entirely client-side. No Raspberry Pi involvement.

**Map Rendering (`src/renderer/src/components/game/map/`):**

| File | Lines | Key Issues |
|------|-------|-----------|
| `MapCanvas.tsx` | 837 | Duplicate `drawingGraphicsRef` (lines 118 + 168); token image re-creation on every appearance change; `selectedTokenIds` vs `selectedTokenId` inconsistency |
| `map-pixi-setup.ts` | ~184 | 16 layers with Z-ordering — clean |
| `map-event-handlers.ts` | ~467 | `// TODO: Render live preview` (line 394); text tool uses `window.prompt()` (line 451); hex snapping (lines 492-507) |
| `map-overlay-effects.ts` | ~300 | `// TODO: Add playing state management` (line 303); vision recompute orchestration |
| `fog-overlay.ts` | ~357 | Hex fog cell rendering (lines 266-284, 313-351); performance concern at 100x100 grids |
| `grid-layer.ts` | ~276 | Hex labels skipped: `if (settings.type !== 'square') return` (line 235) |
| `lighting-overlay.ts` | ~225 | Player vs DM view rendering — clean |
| `wall-layer.ts` | ~137 | `drawWallPreview()` exists (lines 104-137) but never called during mousemove |
| `drawing-layer.ts` | ~200 | 5 drawing types — clean |
| `region-layer.ts` | ~200 | Portal terrain not in painter UI |
| `movement-overlay.ts` | ~150 | Budget only for primary dragged token in multi-select |
| `token-sprite.ts` | ~300 | Auras, conditions, HP bars — clean |
| `weather-overlay.ts` | ~200 | 5 weather types — clean |
| `audio-emitter-overlay.ts` | ~206 | Hardcoded `playing: true` |

**Map Services (`src/renderer/src/services/map/`):**

| File | Key Issue |
|------|----------|
| `vision-computation.ts` | **POTENTIAL BUG**: `pixelWidth = map.width * cellSize` at line 58 — but `map.width` may already be in pixels (set as `width * cellSize` during creation). Could double-multiply. |
| `raycast-visibility.ts` | Clean — correct 2D visibility algorithm |
| `pathfinder.ts` | Hex-aware A* — clean |

**Map Editor UI:**

| File | Key Issue |
|------|----------|
| `DMMapEditor.tsx` | `selectedTokenId` (singular, line 30) vs `MapCanvas.selectedTokenIds` (plural) |
| `MapEditorRightPanel.tsx` | 8 tabs — missing portal terrain in terrain painter |
| `CreateMapModal.tsx` | Hex type only `'square'` or `'hex'` — no flat/pointy choice |
| `GridControlPanel.tsx` | Also only `'square'` or `'hex'` toggle — no explicit flat/pointy |

**Map Types:**
- `src/renderer/src/types/map.ts` — `GridSettings.type: 'square' | 'hex' | 'hex-flat' | 'hex-pointy'`; `TerrainCell.type` includes `'portal'` with `portalTarget`

---

## 📋 Core Objectives & Corrections

### POTENTIAL BUG (Verify First)

| # | Bug | Location | Impact |
|---|-----|----------|--------|
| B1 | `computePartyVision` may double-multiply pixel dimensions | `vision-computation.ts` line 58: `map.width * cellSize` — if `map.width` is already in pixels | Visibility polygon bounds cellSize^2 too large; computation works on enormous space |
| B2 | Duplicate `drawingGraphicsRef` — two `useRef` with same name | `MapCanvas.tsx` lines 118 + 168 | Second shadows first; potential stale reference |

### MISSING FEATURES

| # | Feature | Impact |
|---|---------|--------|
| F1 | Map resize after creation | DMs must recreate maps to change dimensions |
| F2 | Gridless mode (true freeform placement) | Theater-of-mind or narrative scenes need freeform tokens |
| F3 | Portal terrain creation UI | Portal type exists in TerrainCell but no way to create portals |
| F4 | Hex grid coordinate labels | Hex grids have no position reference (labels skipped) |
| F5 | Map layers visibility panel | Cannot toggle individual layer visibility |
| F6 | Wall placement preview during mousemove | `drawWallPreview()` exists but is never called |
| F7 | Map image reposition/scale after creation | Cannot adjust imported background image |

### POLISH ITEMS

| # | Item | Impact |
|---|------|--------|
| P1 | Drawing text tool uses `window.prompt()` | Blocking browser dialog — jarring UX |
| P2 | Multi-token drag only validates budget for primary token | Other selected tokens can move beyond movement range |
| P3 | Token sprite re-created on every appearance key change | Performance issue with image-based tokens |
| P4 | Fog iteration over all cells per animation frame | Performance at scale (100x100 = 10k cells per tick) |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Bug Fixes (B1, B2)

**Step 1 — Verify and Fix Pixel Math in Vision Computation (B1)**
- Open `src/renderer/src/services/map/vision-computation.ts`
- Find line 58: `pixelWidth = map.width * cellSize`
- Open `src/renderer/src/components/game/modals/dm-tools/DMMapEditor.tsx` line 118 to see how `map.width` is set during creation
- **If `map.width` is stored in cells (e.g., 30)**: the multiplication is correct — `30 * 40px = 1200px`. No fix needed.
- **If `map.width` is stored in pixels (e.g., 1200)**: the multiplication is WRONG — `1200 * 40 = 48000px`. Fix by removing the multiplication:
  ```typescript
  const pixelWidth = map.width  // already in pixels
  const pixelHeight = map.height
  ```
- Check ALL code that reads `map.width` and `map.height` to determine the canonical unit. Search for `map.width` and `map.height` across the codebase.

**Step 2 — Fix Duplicate drawingGraphicsRef (B2)**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- Find the two `drawingGraphicsRef` at lines 118 and 168
- Determine which one is actually used in the render logic
- Remove the shadowed (unused) one, or rename one to a more specific name (e.g., `drawingPreviewRef` vs `drawingLayerRef`)

### Sub-Phase B: Map Resize (F1)

**Step 3 — Create Map Resize Modal**
- Create `ResizeMapModal.tsx` in the map editor modals:
  ```tsx
  // Props: currentWidth, currentHeight, cellSize, onResize
  // UI: width/height inputs with min/max (same as CreateMapModal: 10-100 cells)
  // Preview: show how the resize affects the map
  // Anchor: where to anchor (top-left, center, etc.)
  ```
- When resizing:
  - If shrinking: tokens/walls/drawings outside the new bounds are preserved (just out of visible area) or optionally trimmed
  - If expanding: new area starts as unexplored fog
  - Grid, background image, and existing content keep their absolute positions

**Step 4 — Wire Resize to Map Editor**
- Open `src/renderer/src/components/game/modals/dm-tools/DMMapEditor.tsx`
- Add a "Resize" button in the toolbar that opens `ResizeMapModal`
- On confirm, call `gameStore.updateMap(mapId, { width: newWidth, height: newHeight })`
- Trigger canvas re-render after resize

### Sub-Phase C: Gridless Mode (F2)

**Step 5 — Add Gridless Grid Type**
- Open `src/renderer/src/types/map.ts`
- Add `'gridless'` to `GridSettings.type`:
  ```typescript
  type: 'square' | 'hex' | 'hex-flat' | 'hex-pointy' | 'gridless'
  ```
- In `grid-layer.ts`, skip rendering when type is `'gridless'`:
  ```typescript
  if (settings.type === 'gridless') return
  ```

**Step 6 — Disable Cell Snapping in Gridless Mode**
- Open `src/renderer/src/components/game/map/map-event-handlers.ts`
- In the token drag handler, check grid type:
  ```typescript
  if (grid.type === 'gridless') {
    // Use raw pixel coordinates, no snapping
    token.x = cursorX
    token.y = cursorY
  } else {
    // Existing snap-to-grid logic
  }
  ```
- Also update `CreateMapModal.tsx` and `GridControlPanel.tsx` to offer `'gridless'` as an option

**Step 7 — Update Measurement for Gridless**
- In gridless mode, distance measurement should use pixel-to-feet conversion:
  ```typescript
  const distanceFeet = pixelDistance / cellSize * 5  // 1 cell = 5 ft
  ```
- The measurement tool should draw a line with distance in feet, not count cells

### Sub-Phase D: Portal Terrain UI (F3)

**Step 8 — Add Portal to Terrain Painter**
- Open `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx`
- In the terrain tab, add a "Portal" terrain type alongside difficult, hazard, water, climbing
- When "Portal" is selected, show a portal configuration form:
  - Target map dropdown (list of maps in current game)
  - Target grid coordinates (X, Y)
  - Visual color: purple (matching region-layer portal convention)

**Step 9 — Wire Portal Click-to-Teleport**
- When a token moves onto a portal terrain cell, check if auto-teleport is enabled
- If so: switch active map and place the token at the target coordinates
- If not: show a prompt "Step through portal to [Map Name]?"

### Sub-Phase E: Hex Grid Labels (F4)

**Step 10 — Add Hex Coordinate Labels**
- Open `src/renderer/src/components/game/map/grid-layer.ts`
- Remove the early return at line 235: `if (settings.type !== 'square') return`
- Implement hex label rendering using axial or offset coordinates:
  ```typescript
  // For hex grids, use column,row format
  for each hex cell:
    const { x: col, y: row } = hexGridPosition
    const label = `${col},${row}`
    // Draw label at hex center
  ```
- Use the same font and visibility rules as square grid labels (only show at zoom > 0.5)

### Sub-Phase F: Wall Placement Preview (F6)

**Step 11 — Wire drawWallPreview During Mousemove**
- Open `src/renderer/src/components/game/map/map-event-handlers.ts`
- In the wall tool's `mousemove` handler, call `drawWallPreview()`:
  ```typescript
  if (activeTool === 'wall' && wallStartPoint) {
    drawWallPreview(wallGraphics, wallStartPoint, currentPoint, wallType)
  }
  ```
- Open `wall-layer.ts` and verify `drawWallPreview` (lines 104-137) renders correctly
- Clear the preview on `mouseup` (when the wall is committed) or `Escape` (cancel)

### Sub-Phase G: Map Layer Visibility Panel (F5)

**Step 12 — Create Layer Visibility Panel**
- Create a `LayerVisibilityPanel` component for the DM map editor:
  ```tsx
  const LAYER_NAMES = [
    'background', 'grid', 'terrain', 'regions', 'drawings',
    'movement', 'aoe', 'tokens', 'fog', 'lighting',
    'walls', 'measurement', 'weather', 'audio'
  ]

  // Toggle checkboxes for each layer
  // Store visibility state in the editor (not persisted to map data)
  ```
- When a layer is toggled off, set its PixiJS container `visible = false`
- Add the panel as a collapsible section in `MapEditorRightPanel.tsx` or as a floating overlay

### Sub-Phase H: Drawing Text Tool UX (P1)

**Step 13 — Replace window.prompt with Inline Input**
- Open `src/renderer/src/components/game/map/map-event-handlers.ts`
- Find the text drawing tool at line 451 where `window.prompt()` is used
- Replace with an inline text input positioned at the cursor:
  ```typescript
  // Instead of window.prompt():
  showInlineTextInput({
    x: cursorScreenX,
    y: cursorScreenY,
    onConfirm: (text) => {
      if (text) commitTextDrawing(text, gridX, gridY)
    },
    onCancel: () => { /* discard */ }
  })
  ```
- Create a small overlay `<input>` element positioned absolutely at the click point
- Support Enter to confirm, Escape to cancel
- Auto-focus the input

### Sub-Phase I: Performance Optimizations (P3, P4)

**Step 14 — Cache Token Sprites**
- Open `src/renderer/src/components/game/map/MapCanvas.tsx`
- Find where `createTokenSprite()` is called on every appearance key change
- Add a sprite cache: only recreate the sprite if the appearance key actually changed:
  ```typescript
  const tokenSpriteCache = useRef(new Map<string, { key: string, sprite: Container }>())

  // In render loop:
  const cached = tokenSpriteCache.current.get(token.id)
  if (cached && cached.key === token.appearanceKey) {
    // Reuse existing sprite
  } else {
    // Create new sprite, cache it
    const sprite = createTokenSprite(token, ...)
    tokenSpriteCache.current.set(token.id, { key: token.appearanceKey, sprite })
  }
  ```

**Step 15 — Optimize Fog Animation Iteration**
- Open `src/renderer/src/components/game/map/fog-overlay.ts`
- The animation ticker iterates ALL grid cells per frame
- Optimization: only iterate cells whose alpha is currently animating (not at target):
  ```typescript
  // Track which cells are animating
  const animatingCells = new Set<string>()

  // In fog update: only add cells to animatingCells when their state changes
  // In ticker: only iterate animatingCells, not all grid cells
  // When a cell reaches target alpha, remove from animatingCells
  ```
- This reduces per-frame work from O(all cells) to O(actively animating cells)

### Sub-Phase J: Multi-Token Movement Validation (P2)

**Step 16 — Validate Movement Budget for All Selected Tokens**
- Open `src/renderer/src/components/game/map/map-event-handlers.ts`
- Find the initiative mode movement validation (line 532)
- When multiple tokens are selected and moved together, validate each token's movement budget:
  ```typescript
  for (const tokenId of selectedTokenIds) {
    const token = activeMap.tokens.find(t => t.id === tokenId)
    if (!token) continue
    const distance = calculateMoveDistance(token.gridX, token.gridY, newGridX, newGridY)
    const budget = getTurnState(tokenId)?.movementMax ?? token.speed
    const used = getTurnState(tokenId)?.movementUsed ?? 0
    if (used + distance > budget) {
      // Block or warn about this token exceeding movement
    }
  }
  ```

### Sub-Phase K: selectedTokenId Consistency Fix

**Step 17 — Unify Token Selection State**
- Open `src/renderer/src/components/game/modals/dm-tools/DMMapEditor.tsx`
- Find `selectedTokenId` (singular, line 30)
- Refactor to use `selectedTokenIds: string[]` consistently:
  ```typescript
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  ```
- Update all references that use the singular form
- Ensure `map-overlay-effects` hook receives the array form

---

## ⚠️ Constraints & Edge Cases

### Pixel Math Bug (B1)
- **This must be verified before fixing.** Read `DMMapEditor.tsx` line 118 to determine what unit `map.width` is stored in. If the creation code sets `width: widthCells * cellSize` (pixels), then `vision-computation.ts` is double-multiplying. If creation sets `width: widthCells` (cells), the math is correct.
- **Impact of incorrect fix**: If you remove the multiplication when it's needed, all vision computation will be cellSize times too small. Test with a visible map to verify before and after.

### Gridless Mode
- **Pathfinding**: A* works on grid cells. In gridless mode, pathfinding needs a different approach (or can be disabled — freeform movement doesn't need pathfinding).
- **Fog of war**: Fog is cell-based. In gridless mode, fog painting needs to work at pixel-level or use a configurable virtual grid for fog cells even when the visible grid is hidden.
- **AoE templates**: Area of effect should still work in gridless mode using pixel distances.
- **Token collision**: Without cell-based snapping, tokens can overlap. This is acceptable for gridless — the DM manages token placement.

### Map Resize
- **Background image**: If the map has a background image, resizing the grid doesn't resize the image. The image stays at its original scale. This may leave the image smaller than the new grid or crop it.
- **Fog state**: Resized areas should be unexplored fog by default. Don't clear existing revealed/explored cells that are still within the new bounds.
- **Walls**: Walls outside the new bounds should be preserved in data but not rendered. Don't delete them — the DM may resize back.

### Portal Terrain
- **Cross-map token persistence**: When a token teleports to another map, the token must be added to the target map and removed from the source map. Ensure the token data (HP, conditions, etc.) is preserved during the transfer.
- **Portal is one-way by default**: Create two portals (one on each map) for bidirectional travel.

### Performance
- **Fog optimization**: The `animatingCells` Set approach requires careful bookkeeping — cells must be added when their target alpha changes and removed when they reach target. Missing a removal will cause a memory leak.
- **Token sprite cache**: Must be invalidated when the token is removed from the map. Use a WeakRef or clean up on token deletion.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) to verify and fix the potential pixel math bug — this is the highest-risk item. Then Sub-Phase B (Steps 3-4) for map resize and Sub-Phase C (Steps 5-7) for gridless mode as the highest-value new features.
