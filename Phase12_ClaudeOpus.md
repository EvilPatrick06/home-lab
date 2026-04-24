# Phase 12 — Maps: Deep Analysis (Claude Opus)

## Summary

The map system is the most architecturally mature subsystem in this codebase. It features a PixiJS-based canvas renderer with 16+ composited layers, a raycast visibility engine, A* pathfinding with wall awareness, animated fog of war with three-state transitions, weather particle effects, and full import/export. The core is solid and well-structured; the gaps are mostly in edge-case polish and a few partially wired features.

---

## 1. Map Editor — Fully Implemented?

**Verdict: Substantially implemented. Import works; draw tools exist but have a missing live-preview; resize is absent; configuration is thorough.**

### 1.1 Map Creation

`CreateMapModal.tsx` (lines 91–365) provides:
- Name, width (10–100 cells), height (10–100 cells), cell size (20–100px)
- Grid type toggle: square or hex (only two options at creation time; `hex-flat`/`hex-pointy` variants are available later via `GridControlPanel`)
- Background color picker with hex input
- Custom image upload (PNG/JPG/WebP via FileReader → base64 data URL)
- Live grid alignment preview drawn on a `<canvas>` element
- Size presets: Small (20x20), Medium (30x30), Large (50x50), Wide (60x30)

Map creation in `DMMapEditor.tsx` (lines 102–138) constructs the full `GameMap` object with grid, empty fog, empty terrain, and adds it to the store.

### 1.2 Image Import

- Image upload at creation time via file picker → stored as base64 `imageData` in `GameMap.imagePath`
- Background loaded in `MapCanvas.tsx` (lines 284–322) using PixiJS `Assets.load()`; auto-centers and zoom-to-fit on load
- Error handling for failed image loads with a visible warning banner

### 1.3 Drawing / Annotation Tools

`drawing-layer.ts` renders five drawing types:
- `draw-free`: freehand polyline
- `draw-line`: two-point line
- `draw-rect`: two-point rectangle
- `draw-circle`: center + edge-point circle
- `draw-text`: positioned text label (prompted via `window.prompt()`)

Drawing creation in `map-event-handlers.ts` (lines 236–467): mouse events collect points, then commit to store on mouseUp.

**Gap**: Line 394 contains `// TODO: Render live preview` — freehand drawings are only persisted on mouseUp with no visual feedback during the stroke. Shape tools (`draw-rect`, `draw-circle`, `draw-line`) similarly lack a rubber-band preview.

### 1.4 Map Resize

**Missing.** There is no UI or code path to resize an existing map's width/height after creation. The `updateMap` store action accepts `Partial<GameMap>` so the infrastructure exists, but no UI exposes it.

### 1.5 Map Configuration (Post-Creation)

`MapEditorRightPanel.tsx` exposes 8 tabs:
- **Tokens**: TokenPlacer with click-to-place ghost preview
- **Fog**: FogBrush with reveal/hide tools, brush size slider (1–5), Reveal All, Hide All, Dynamic Fog toggle
- **Terrain**: Terrain painter (difficult, hazard, water, climbing) with clear-all
- **Regions**: RegionManager for scene trigger zones
- **Grid**: `GridControlPanel.tsx` — cell size slider, X/Y offset, color picker, opacity, grid type (square/hex), toggle on/off
- **NPCs**: NPC placement from campaign roster
- **Notes**: DM notepad
- **Shop**: Shop panel

`DMToolbar` provides tool selection: select, token, fog-reveal, fog-hide, measure, terrain, wall, fill, and 5 draw tools.

---

## 2. Fog of War — DM and Player Views

**Verdict: Fully implemented with three-state animated fog, dynamic vision, and proper DM/player differentiation.**

### 2.1 Data Model

`FogOfWarData` in `types/map.ts` (lines 182–189):
```
enabled: boolean
revealedCells: Array<{x, y}>       // DM-manually-revealed
exploredCells?: Array<{x, y}>      // auto-revealed by player movement
dynamicFogEnabled?: boolean         // toggle for vision-driven fog
```

### 2.2 Three-State Fog

`fog-overlay.ts` implements a three-state system:
- **Visible** (alpha 0): cells in `revealedCells` OR currently in `partyVisionCells`
- **Explored** (alpha 0.4): cells in `exploredCells` but NOT currently visible
- **Unexplored** (alpha 0.75): cells in neither set

This is the standard D&D VTT pattern (explored areas show as dimmed when party moves away).

### 2.3 Animation

`initFogAnimation()` (lines 34–91) attaches a PixiJS ticker that interpolates per-cell alpha values each frame:
- Reveal fade-out: 500ms
- Hide fade-in: 1500ms (slow, atmospheric)
- Alpha values bucketed into 10 levels for batched draw calls

### 2.4 DM vs Player Rendering

In `map-overlay-effects.ts` (line 113): DM sees fog at `alpha: 0.3` (semi-transparent preview); players see at `alpha: 1` (fully opaque).

### 2.5 Fog Painting

`FogBrush` component in the right panel provides:
- Reveal/Hide tool toggle
- Brush size slider
- Reveal All / Hide All bulk operations
- Click-and-drag painting via `map-event-handlers.ts` (lines 205–209, 285–298)

### 2.6 Dynamic Fog (Vision-Driven)

When `dynamicFogEnabled` is true (toggled in FogBrush panel):
- `map-overlay-effects.ts` (lines 261–278) recomputes vision every time tokens, walls, or light sources change
- `recomputeVision()` calls `computePartyVision()` which raycasts from each player token
- Visible cells are stored in `partyVisionCells` (store) and `exploredCells` (per-map persistent)
- Fog overlay draws using `partyVisionCells` for current vision

### 2.7 Hex Grid Support in Fog

`fog-overlay.ts` (lines 266–284, 313–351) handles hex cell shapes correctly — uses `getHexCenter()` and draws hex polygons for fog cells instead of rectangles.

### 2.8 Network Sync

`dm:fog-reveal` network message (Zod-validated) syncs fog changes to connected clients.

---

## 3. Dynamic Lighting

**Verdict: Fully implemented with raycast visibility, light source management, darkvision support, and wall occlusion. Well-architected.**

### 3.1 Raycast Visibility Engine

`raycast-visibility.ts` implements the classic 2D visibility algorithm:
1. Collects unique endpoints from all wall segments + map boundary
2. Casts 3 rays per endpoint (center + ±0.001 rad offset to peek around corners)
3. Finds closest wall intersection for each ray
4. Sorts intersections by angle to form a visibility polygon
5. Deduplicates near-coincident points (epsilon = 0.0001)

Key functions:
- `computeVisibility(origin, walls, bounds)` → `VisibilityPolygon`
- `computeLitAreas(sources, walls, bounds, cellSize)` → `LitArea[]`
- `clipToRadius(poly, radius)` → clips visibility polygon to circular bounds
- `isPointVisible(point, poly)` → ray-casting point-in-polygon test
- `isMovementBlocked(from, to, walls)` → ray-segment intersection check

Wall types correctly handled:
- **Solid**: always blocks vision and movement
- **Door (closed)**: blocks vision and movement
- **Door (open)**: transparent to both
- **Window**: does NOT block vision (filtered out at line 78), but DOES block movement

### 3.2 Lighting Overlay

`lighting-overlay.ts` renders the darkness mask:

**Player view** (`drawPlayerView`, lines 142–225):
1. Draws full darkness rectangle over the map
2. Ambient light determines base alpha (bright=0.2, dim=0.5, darkness=0.85)
3. Cuts out visibility polygons for each player token (shared party vision)
4. Cuts out darkvision circles for tokens with darkvision (per-token range support)
5. Computes lit areas from light sources, cuts bright areas fully and dims at alpha 0.15

**DM view** (`drawDMPreview`, lines 99–138):
1. Light semi-transparent overlay based on ambient light
2. Draws bright and dim radius circles for each light source
3. Center dots for light source positions

### 3.3 Vision Computation

`vision-computation.ts` provides the higher-level API:
- `computePartyVision(map, playerTokens, lightSources)`: union of all player visibility, with floor-filtered walls, darkvision radius clipping, and light-source-extended visibility
- `getLightingAtPoint(point, lightSources, ambientLight, cellSize)`: returns `'bright'|'dim'|'darkness'` for any map point
- `buildMapLightSources(activeSources, tokens)`: converts active light sources to geometry
- `debouncedRecomputeVision()`: debounced at 32ms for performance during rapid token movement
- Floor-aware: walls cached per floor via `segmentsByFloor` map

### 3.4 Light Sources

`data/light-sources.ts` defines D&D 5e light sources with bright and dim radius in feet. `LightSourceModal.tsx` provides UI for managing active lights. Active light sources are tracked in `TimeSliceState.activeLightSources` with duration tracking.

### 3.5 Darkvision

- Species-based: `DARKVISION_SPECIES` array in `types/map.ts` (elf, dwarf, gnome, tiefling, half-elf)
- Per-token override: `MapToken.darkvision` (boolean) and `MapToken.darkvisionRange` (in feet, e.g., 60, 120)
- `tokenDarkvisionRanges` map in `LightingConfig` supports different darkvision ranges per party member
- Vision computation clips each token's visibility polygon to their darkvision radius

---

## 4. Grid Systems

**Verdict: Square and hex (flat-top, pointy-top) are fully implemented. True "gridless" mode is absent.**

### 4.1 Grid Type Support

`GridSettings.type` in `types/map.ts` (line 61):
```
type: 'square' | 'hex' | 'hex-flat' | 'hex-pointy'
```

`grid-layer.ts` renders:
- **Square grid** (lines 27–43): standard vertical/horizontal lines with offset support
- **Hex flat-top** (lines 62–81): `hexWidth = cellSize * 2`, staggered columns
- **Hex pointy-top** (lines 82–105): `hexWidth = sqrt(3) * cellSize`, staggered rows

Grid coordinate labels (`drawGridLabels`, lines 218–276): only rendered for square grids when zoom > 0.5.

### 4.2 Hex Grid Utilities

- `getHexCenter(col, row, cellSize, offsetX, offsetY, orientation)` — pixel center for token snapping
- `pixelToHex(pixelX, pixelY, ...)` — pixel-to-hex coordinate conversion for interaction
- `getHexNeighbors(x, y, gridType)` — 6 neighbors with correct stagger offsets for both flat and pointy

### 4.3 Hex-Aware Systems

- **Fog overlay**: `drawGridCellShape()` draws hex polygons for fog cells (lines 330–356)
- **Pathfinding**: `pathfinder.ts` uses 6 hex neighbors (lines 158–203) instead of 8 square neighbors
- **Token snapping**: `map-event-handlers.ts` (lines 492–507) uses `pixelToHex()` for hex grid drag-drop
- **Measurement tool**: Hex measurement via `drawMeasurement()` with hex distance calculation
- **Movement overlay**: Uses `getReachableCellsWithWalls()` which is hex-aware

### 4.4 Grid Configuration

`GridControlPanel.tsx` provides post-creation grid editing:
- Cell size slider (20–100px)
- X/Y offset sliders (-50 to +50) for aligning grid to imported map images
- Color picker with hex display
- Opacity slider (0–100%)
- Grid type toggle (square / hex)
- Grid enable/disable toggle

### 4.5 Gridless Mode

**Missing.** The `GridSettings.type` union does not include a `'none'` or `'gridless'` option. The `enabled` boolean can hide grid lines, but tokens still snap to grid cells. True free-placement gridless mode (freeform token positioning without cell snapping) is not implemented.

---

## 5. Map Save/Load/Switch

**Verdict: Fully implemented across multiple persistence layers. Maps are part of game state and have their own library system.**

### 5.1 In-Session Map Switching

- `MapSelector` component in the DMMapEditor top bar shows all maps in the game store
- `gameStore.setActiveMap(mapId)` switches the active map instantly
- `MapCanvas` reacts to `map?.imagePath` changes and reloads the background
- Floor state resets when switching maps (line 337–341 in MapCanvas)
- Network sync: `dm:map-change` message broadcasts map switches to connected clients, with optional `mapData` payload for the full map

### 5.2 Game State Persistence

Maps are part of `GameState` (saved/loaded via `storage:save-game-state` / `storage:load-game-state` IPC channels). All maps, their tokens, fog state, walls, terrain, drawings, and regions persist with the game session.

### 5.3 Map Library (Electron Storage)

`map-library-storage.ts` (main process) provides a standalone map library:
- Storage: `userData/map-library/{id}.json` per map
- IPC channels: `map-library:save`, `map-library:list`, `map-library:get`, `map-library:delete`
- `MapLibraryEntry`: id, name, data (full map JSON), savedAt timestamp
- Input validation: map ID regex, non-empty name

### 5.4 File Import/Export

`entity-io.ts` supports map import/export:
- Extension: `.dndmap`
- Versioned envelope format: `{ version: 1, type: 'map', exportedAt, count, data }`
- Required fields validation: `id`, `name`
- Supports both single and bulk map export
- `reIdItems()` helper for re-generating UUIDs on import to prevent collisions
- File size limits enforced via `MAX_READ_FILE_SIZE` and `MAX_WRITE_CONTENT_SIZE`
- Bare-object import supported (no envelope required, graceful fallback)

### 5.5 Map CRUD Operations

`MapTokenSliceState` provides:
- `addMap(map)` — add new map to game state
- `deleteMap(mapId)` — remove map (switches active map if needed)
- `updateMap(mapId, updates)` — partial update
- `duplicateMap(mapId)` — deep clone with new IDs
- `setActiveMap(mapId)` — switch active map

### 5.6 Built-in Maps

`src/renderer/public/data/5e/world/built-in-maps.json` provides starter map templates.

---

## 6. Map Layers

**Verdict: All major layers are present and correctly Z-ordered. 16 distinct layers plus weather (screen-space).**

### 6.1 Layer Architecture

`map-pixi-setup.ts` (lines 84–184) creates layers in explicit Z-order (back to front):

| Z-Order | Layer Name | PixiJS Object | Purpose |
|---------|------------|---------------|---------|
| 0 | Background | `Sprite` (bg) | Map image |
| 1 | Grid | `Graphics` | Square/hex grid lines |
| 2 | Grid Labels | `Container` | A,B,C / 1,2,3 labels |
| 3 | Terrain | `Graphics` | Difficult terrain, hazards, water |
| 4 | Regions | `Graphics` | Trigger zones (circle/rect/polygon) |
| 5 | Drawings | `Graphics` | Freehand, lines, shapes, text |
| 6 | Movement | `Graphics` | Reachable cells overlay (green/yellow) |
| 7 | AoE | `Graphics` | Area-of-effect templates |
| 8 | Tokens | `Container` | Token sprites with HP bars, conditions, auras |
| 9 | Selection Box | `Graphics` | Rubber-band multi-select |
| 10 | Pings | `Graphics` | Double-click ping animations |
| 11 | Fog | `Graphics` | Fog of war (three-state) |
| 12 | Lighting | `Graphics` | Darkness mask with visibility cutouts |
| 13 | Walls | `Graphics` | Wall segments (DM only) |
| 14 | Measurement | `Graphics` | Distance measurement tool |
| 15 | Combat Anims | `Container` | Slash, projectile, spell-burst, heal particles |
| 16 | Audio Emitters | `Container` | Spatial audio emitter indicators |
| -- | Weather | `Container` | Screen-space particle overlay (stage-level) |

### 6.2 Background Layer

- Loaded via PixiJS `Assets.load()` with nearest-neighbor scaling (`scaleMode: 'nearest'`)
- Auto zoom-to-fit on load (calculates scale to fit container)
- Error handling with visible banner on load failure
- Inserted at index 0 in the world container

### 6.3 Token Layer

`token-sprite.ts` creates token sprites with:
- Circular clip mask with border (solid/dashed/double)
- Custom colors and border colors
- HP bar ring (configurable: all/dm-only/none)
- Condition badges (up to 3 visible + overflow indicator)
- Active turn glow (cyan pulse)
- Name label with configurable font size and visibility
- Lighting condition badge (dim/darkness indicator)
- Aura rendering (configurable radius, color, opacity, visibility)
- Elevation badge when non-zero
- Floor-aware: off-floor tokens dimmed to alpha 0.3 for DM

### 6.4 Drawing/Annotation Layer

`drawing-layer.ts` supports 5 types: freehand, line, rectangle, circle, text. Drawings have:
- Configurable color and stroke width
- Per-drawing player visibility toggle
- Floor-aware filtering via `filterDrawingsByFloor()`

### 6.5 Weather Layer

`weather-overlay.ts` is a screen-space PixiJS particle system supporting:
- **Rain**: 500 particles, blue, angled 15°, speed 4
- **Snow**: 200 particles, white, sine-wave drift, speed 1
- **Ash**: 150 particles, gray, slight wobble, speed 1.2
- **Hail**: 100 particles, icy blue, bounce effect, speed 6
- **Sandstorm**: 400 particles, sandy color, horizontal, speed 5

`presetToWeatherType()` maps calendar weather strings to particle types. Weather toggle via `showWeatherOverlay` store state.

### 6.6 Audio Emitter Layer

`audio-emitter-overlay.ts` renders spatial audio emitters with:
- Position indicators on the map
- Sound occlusion via `sound-occlusion.ts` (wall-blocked audio)
- Listener position tracking based on player token position
- Per-emitter volume, radius, and spatial flag

**Partial**: Line 303 contains `// TODO: Add playing state management` — audio emitter play/pause state is not yet managed, all emitters are hardcoded as `playing: true`.

### 6.7 Region Layer

`region-layer.ts` renders scene trigger zones:
- Three shape types: circle, rectangle, polygon
- Color-coded by action type (amber=alert-dm, purple=teleport, red=apply-condition)
- DM sees all regions; players only see visible+enabled regions
- Disabled regions shown with hatched overlay for DM
- Floor-aware filtering

### 6.8 Movement Overlay

`movement-overlay.ts` shows reachable cells during initiative:
- Green tint for normal movement range
- Yellow tint for dash-extended range (> base speed)
- Wall-aware pathfinding via `getReachableCellsWithWalls()`
- Terrain cost calculation (difficult=2x, water/climbing with/without swim/climb speed)

---

## 7. What Is Missing, Broken, or Partially Implemented

### 7.1 Missing Features

| Feature | Status | Details |
|---------|--------|---------|
| **Map resize** | Missing | No UI to change width/height of existing maps. Store supports it (`updateMap`), but no modal/panel exposes it. |
| **Gridless mode** | Missing | No `'gridless'` or `'none'` grid type. `grid.enabled: false` hides lines but tokens still snap to cells. True freeform placement is not implemented. |
| **Drawing live preview** | Missing | `map-event-handlers.ts` line 394: `// TODO: Render live preview`. Drawing tools have no rubber-band preview during stroke/shape creation. |
| **Map resize after image import** | Missing | Cannot crop, scale, or reposition the background image relative to the grid after initial creation. |
| **Grid labels for hex** | Missing | `drawGridLabels()` in `grid-layer.ts` line 235: `if (settings.type !== 'square') return` — hex grids get no coordinate labels. |
| **Portal terrain UI** | Missing | `TerrainCell.type` includes `'portal'` with `portalTarget` (mapId + gridX/Y), but the terrain painter in `MapEditorRightPanel.tsx` only offers difficult, hazard, water, climbing. No portal creation UI. |
| **Map layers panel** | Missing | No UI to toggle individual layer visibility (e.g., hide terrain overlay, show only tokens). Layers are always rendered based on data presence. |
| **Map rotation** | Missing | No rotation support for the background image or the world container. |

### 7.2 Partially Implemented

| Feature | Status | Details |
|---------|--------|---------|
| **Audio emitter state** | Partial | `map-overlay-effects.ts` line 303: `// TODO: Add playing state management`. All emitters hardcoded as playing. No UI to start/stop individual emitters. |
| **Hex grid at creation time** | Partial | `CreateMapModal` only offers `'square'` and `'hex'` (two buttons). The `'hex-flat'` vs `'hex-pointy'` distinction requires post-creation change via `GridControlPanel`, which also only shows `'square'` and `'hex'` (no explicit flat/pointy toggle). The `'hex'` default maps to `'hex-flat'`. |
| **Drawing text tool** | Partial | Uses `window.prompt()` for text input (line 451 in `map-event-handlers.ts`), which is a blocking browser dialog — not a polished UX. |
| **Multi-token drag movement validation** | Partial | Wall blocking is only checked per-token individually, and initiative mode movement budget is only enforced for the primary dragged token (line 532), not for all selected tokens. |
| **Wall placement preview** | Partial | `drawWallPreview()` in `wall-layer.ts` exists (lines 104–137) but the current wall tool flow in `map-event-handlers.ts` clears the wall graphics on placement (line 230) without calling `drawWallPreview()` during mouse-move to show a preview line. |
| **Floor selector for players** | Partial | Players are auto-locked to their token's floor (`MapCanvas.tsx` lines 344–350), and the `FloorSelector` only renders for the host (`isHost && hasMultipleFloors`). Players cannot manually browse other floors. This is intentional but limits player agency. |

### 7.3 Potential Issues

| Issue | Location | Details |
|-------|----------|---------|
| **Duplicate `drawingGraphicsRef`** | `MapCanvas.tsx` lines 118 + 168 | Two `useRef<Graphics \| null>` with the same name `drawingGraphicsRef` — the second (line 168) shadows the first. TypeScript should catch this in strict mode, but it's a code smell. |
| **`computePartyVision` pixel math** | `vision-computation.ts` line 58 | `pixelWidth = map.width * cellSize` — but `GameMap.width` is already in pixels (set as `width * cellSize` during creation in `DMMapEditor.tsx` line 118). This could cause the visibility polygon bounds to be `cellSize²` times too large, making the computation work on an enormous virtual space. Needs verification. |
| **Performance at scale** | `fog-overlay.ts` | Three-state fog iterates all grid cells every frame during animation. For a 100x100 grid (10,000 cells), this creates 10,000 map entries per tick. Bucketed drawing helps but the iteration itself could be costly. |
| **Token image loading** | `MapCanvas.tsx` renderTokens | `createTokenSprite()` is called every time a token's appearance key changes, which destroys and recreates the sprite. For tokens with images, this triggers re-loading the image from `Assets` each time. |
| **`selectedTokenId` vs `selectedTokenIds`** | `DMMapEditor.tsx` vs `MapCanvas.tsx` | DMMapEditor tracks `selectedTokenId` (singular, line 30) but MapCanvas accepts `selectedTokenIds` (plural array). DMMapEditor passes a single-element array. The map overlay effects hook still expects `selectedTokenId` (singular). Inconsistency that works but could cause confusion. |

### 7.4 Test Coverage

The map subsystem is well-tested with co-located test files:
- `MapCanvas.test.ts`, `fog-overlay.test.ts`, `grid-layer.test.ts`, `lighting-overlay.test.ts`
- `map-event-handlers.test.ts`, `map-overlay-effects.test.ts`, `map-pixi-setup.test.ts`
- `wall-layer.test.ts`, `weather-overlay.test.ts`, `measurement-tool.test.ts`
- `token-sprite.test.ts`, `combat-animations.test.ts`, `aoe-overlay.test.ts`
- `raycast-visibility.test.ts`, `vision-computation.test.ts`, `pathfinder.test.ts`
- `map-utils.test.ts`, `floor-filtering.test.ts`, `region-detection.test.ts`

18 source files with 18 corresponding test files in the `map/` component directory alone, plus 7 service files with 6 test files. This is strong coverage.

---

## 8. Architecture Quality Assessment

### Strengths

1. **Clean layer composition**: `map-pixi-setup.ts` creates all layers in one function with explicit Z-ordering. Easy to understand and modify.
2. **Separation of concerns**: Rendering (`components/game/map/`), business logic (`services/map/`), and state (`stores/game/`) are cleanly separated.
3. **Slice pattern**: Map state is distributed across focused slices (`map-token-slice`, `fog-slice`, `vision-slice`, `floor-slice`, `drawing-slice`, `region-slice`).
4. **Floor awareness**: Walls, terrain, drawings, tokens, and regions all support per-floor filtering via `floor-filtering.ts`.
5. **Typed throughout**: Full TypeScript interfaces for `GameMap`, `MapToken`, `WallSegment`, `GridSettings`, `FogOfWarData`, `SceneRegion`, `DrawingData`, etc.
6. **Comprehensive raycast engine**: The visibility algorithm is correct, handles edge cases (corners, boundaries), and is reused by lighting, vision, cover, and sound occlusion.
7. **Network-ready**: Map changes, fog reveals, and token moves all have Zod-validated network message types.

### Weaknesses

1. **MapCanvas monolith**: At 837 lines, `MapCanvas.tsx` is large. The `useMapOverlayEffects` extraction helps, but the component still has many refs and effects.
2. **Pixel vs cell confusion**: Some code treats `map.width` as pixels, some as cells. The creation path multiplies cells × cellSize, but `computePartyVision` multiplies again. This is a latent bug.
3. **No undo for drawings/regions**: The undo system (`UndoManager`) is connected in `DMMapEditor` but only for terrain. Drawings, regions, and wall placement lack undo integration.
4. **No WebSocket fallback**: Map sync uses WebRTC (PeerJS). If peers can't connect, map state doesn't sync. No HTTP/WebSocket fallback exists.

---

## File Index

### Core Map Types
- `src/renderer/src/types/map.ts` — GameMap, MapToken, GridSettings, FogOfWarData, WallSegment, DrawingData, SceneRegion, TerrainCell

### Map Components (PixiJS Rendering)
- `src/renderer/src/components/game/map/MapCanvas.tsx` — Main canvas component (837 lines)
- `src/renderer/src/components/game/map/map-pixi-setup.ts` — Layer creation and PixiJS init
- `src/renderer/src/components/game/map/map-overlay-effects.ts` — Hook orchestrating all overlays
- `src/renderer/src/components/game/map/map-event-handlers.ts` — Mouse/keyboard event handling
- `src/renderer/src/components/game/map/grid-layer.ts` — Square and hex grid rendering
- `src/renderer/src/components/game/map/fog-overlay.ts` — Three-state animated fog
- `src/renderer/src/components/game/map/lighting-overlay.ts` — Darkness mask with visibility cutouts
- `src/renderer/src/components/game/map/wall-layer.ts` — Wall rendering and interaction
- `src/renderer/src/components/game/map/drawing-layer.ts` — Annotation rendering
- `src/renderer/src/components/game/map/region-layer.ts` — Trigger zone rendering
- `src/renderer/src/components/game/map/movement-overlay.ts` — Reachable cells + terrain overlay
- `src/renderer/src/components/game/map/weather-overlay.ts` — Particle weather effects
- `src/renderer/src/components/game/map/token-sprite.ts` — Token sprite creation
- `src/renderer/src/components/game/map/token-animation.ts` — Token move animations
- `src/renderer/src/components/game/map/aoe-overlay.ts` — AoE template rendering
- `src/renderer/src/components/game/map/measurement-tool.ts` — Distance measurement
- `src/renderer/src/components/game/map/combat-animations.ts` — Combat particle effects
- `src/renderer/src/components/game/map/audio-emitter-overlay.ts` — Spatial audio indicators
- `src/renderer/src/components/game/map/FloorSelector.tsx` — Multi-floor tab selector

### Map Services (Business Logic)
- `src/renderer/src/services/map/raycast-visibility.ts` — 2D visibility algorithm
- `src/renderer/src/services/map/vision-computation.ts` — Party vision, lighting conditions
- `src/renderer/src/services/map/pathfinder.ts` — A* pathfinding with wall awareness
- `src/renderer/src/services/map/map-utils.ts` — Zoom-to-fit, grid labels, ping system
- `src/renderer/src/services/map/floor-filtering.ts` — Per-floor data filtering
- `src/renderer/src/services/map/region-detection.ts` — Region enter/leave detection
- `src/renderer/src/services/map/sound-occlusion.ts` — Wall-based sound attenuation

### Map Editor UI
- `src/renderer/src/components/game/modals/dm-tools/DMMapEditor.tsx` — Full-screen map editor
- `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx` — 8-tab right panel
- `src/renderer/src/components/game/modals/dm-tools/CreateMapModal.tsx` — Map creation dialog
- `src/renderer/src/components/game/modals/dm-tools/map-editor-handlers.ts` — Editor action handlers
- `src/renderer/src/components/game/dm/GridControlPanel.tsx` — Grid settings panel
- `src/renderer/src/components/game/dm/FogBrush.tsx` — Fog painting controls

### Map State Management
- `src/renderer/src/stores/game/map-token-slice.ts` — Maps, tokens, walls CRUD
- `src/renderer/src/stores/game/fog-slice.ts` — Fog reveal/hide
- `src/renderer/src/stores/game/vision-slice.ts` — Party vision, explored cells, dynamic fog
- `src/renderer/src/stores/game/floor-slice.ts` — Current floor index
- `src/renderer/src/stores/game/drawing-slice.ts` — Drawing annotations
- `src/renderer/src/stores/game/region-slice.ts` — Scene regions

### Map Storage & I/O
- `src/main/storage/map-library-storage.ts` — Electron userData map library
- `src/main/ipc/storage-handlers.ts` (lines 249–266) — Map library IPC handlers
- `src/renderer/src/services/io/entity-io.ts` — Import/export with `.dndmap` format

### Network
- `src/renderer/src/network/schemas.ts` — FogRevealPayloadSchema, MapChangePayloadSchema
- `src/renderer/src/network/message-types.ts` — dm:fog-reveal, dm:map-change, dm:token-move
- `src/renderer/src/network/state-types.ts` — NetworkMap serialization shape
