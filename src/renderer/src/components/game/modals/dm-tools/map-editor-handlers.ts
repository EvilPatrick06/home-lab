import * as UndoManager from '../../../../services/undo-manager'
import { useGameStore } from '../../../../stores/use-game-store'
import type { TerrainCell, WallSegment } from '../../../../types/map'

type ActiveTool = 'select' | 'token' | 'fog-reveal' | 'fog-hide' | 'measure' | 'terrain' | 'wall' | 'fill'

// ---------------------------------------------------------------------------
// Private helpers — shared across exported handlers
// ---------------------------------------------------------------------------

/** Floor grid coordinates to integer cell indices. */
function floorGrid(gridX: number, gridY: number): { fx: number; fy: number } {
  return { fx: Math.floor(gridX), fy: Math.floor(gridY) }
}

/**
 * Write a new terrain array into the game store for the given map.
 * Does NOT push to the undo stack — call `pushTerrainUndo` for that.
 */
function applyTerrainToMap(mapId: string, newTerrain: TerrainCell[]): void {
  const gs = useGameStore.getState()
  const maps = gs.maps.map((m) => (m.id === mapId ? { ...m, terrain: newTerrain } : m))
  gs.loadGameState({ maps })
}

/**
 * Push a reversible terrain operation onto the undo stack and trigger a
 * re-render.  Both `undo` and `redo` callbacks simply call `applyTerrainToMap`
 * with the appropriate snapshot.
 */
function pushTerrainUndo(
  mapId: string,
  type: string,
  description: string,
  oldTerrain: TerrainCell[],
  newTerrain: TerrainCell[],
  triggerRerender: () => void
): void {
  UndoManager.push({
    type,
    description,
    undo: () => {
      applyTerrainToMap(mapId, oldTerrain)
    },
    redo: () => {
      applyTerrainToMap(mapId, newTerrain)
    }
  })
  triggerRerender()
}

// ---------------------------------------------------------------------------
// Exported handlers
// ---------------------------------------------------------------------------

/**
 * Handle a cell click for terrain painting or removal.
 * Returns true if the click was handled by terrain logic.
 */
export function handleTerrainCellClick(
  mapId: string,
  gridX: number,
  gridY: number,
  terrain: TerrainCell[],
  terrainPaintType: TerrainCell['type'],
  triggerRerender: () => void
): boolean {
  const { fx, fy } = floorGrid(gridX, gridY)
  const existing = terrain.findIndex((t) => t.x === fx && t.y === fy)
  const oldTerrain = [...terrain]
  const newTerrain =
    existing >= 0
      ? terrain.filter((_, i) => i !== existing)
      : [...terrain, { x: fx, y: fy, type: terrainPaintType, movementCost: terrainPaintType === 'hazard' ? 1 : 2 }]

  applyTerrainToMap(mapId, newTerrain)
  pushTerrainUndo(mapId, 'terrain-paint', `Paint terrain at (${fx}, ${fy})`, oldTerrain, newTerrain, triggerRerender)
  return true
}

/**
 * Handle flood-fill terrain paint or removal.
 * Returns true if the click was handled.
 */
export function handleFillCellClick(
  mapId: string,
  mapWidth: number,
  mapHeight: number,
  cellSize: number,
  gridX: number,
  gridY: number,
  terrain: TerrainCell[],
  terrainPaintType: TerrainCell['type'],
  triggerRerender: () => void
): boolean {
  const { fx, fy } = floorGrid(gridX, gridY)
  const terrainSet = new Set(terrain.map((t) => `${t.x},${t.y}`))

  // If clicking on existing terrain, remove the flood-fill group
  if (terrainSet.has(`${fx},${fy}`)) {
    const targetType = terrain.find((t) => t.x === fx && t.y === fy)?.type
    const toRemove = new Set<string>()
    const stack = [`${fx},${fy}`]
    while (stack.length > 0) {
      const key = stack.pop()!
      if (toRemove.has(key)) continue
      const cell = terrain.find((t) => `${t.x},${t.y}` === key)
      if (!cell || cell.type !== targetType) continue
      toRemove.add(key)
      const [cx, cy] = key.split(',').map(Number)
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0]
      ]) {
        stack.push(`${cx + dx},${cy + dy}`)
      }
    }
    const oldTerrain = [...terrain]
    const newTerrain = terrain.filter((t) => !toRemove.has(`${t.x},${t.y}`))
    applyTerrainToMap(mapId, newTerrain)
    pushTerrainUndo(
      mapId,
      'terrain-fill-remove',
      `Remove fill at (${fx}, ${fy})`,
      oldTerrain,
      newTerrain,
      triggerRerender
    )
    return true
  }

  // Flood-fill empty cells
  const cols = Math.ceil(mapWidth / cellSize)
  const rows = Math.ceil(mapHeight / cellSize)
  const filled: TerrainCell[] = []
  const visited = new Set<string>()
  const stack = [`${fx},${fy}`]
  const maxFill = 500

  while (stack.length > 0 && filled.length < maxFill) {
    const key = stack.pop()!
    if (visited.has(key) || terrainSet.has(key)) continue
    visited.add(key)
    const [cx, cy] = key.split(',').map(Number)
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue
    filled.push({
      x: cx,
      y: cy,
      type: terrainPaintType,
      movementCost: terrainPaintType === 'hazard' ? 1 : 2
    })
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0]
    ]) {
      stack.push(`${cx + dx},${cy + dy}`)
    }
  }

  const oldTerrain = [...terrain]
  const newTerrain = [...terrain, ...filled]
  applyTerrainToMap(mapId, newTerrain)
  pushTerrainUndo(
    mapId,
    'terrain-fill',
    `Fill ${filled.length} cells at (${fx}, ${fy})`,
    oldTerrain,
    newTerrain,
    triggerRerender
  )
  return true
}

/**
 * Handle fog brush click (reveal or hide cells with brush size).
 */
export function handleFogBrushClick(
  activeTool: ActiveTool,
  mapId: string,
  gridX: number,
  gridY: number,
  fogBrushSize: number
): void {
  const halfBrush = Math.floor(fogBrushSize / 2)
  const cells: Array<{ x: number; y: number }> = []
  for (let dx = -halfBrush; dx <= halfBrush; dx++) {
    for (let dy = -halfBrush; dy <= halfBrush; dy++) {
      cells.push({ x: gridX + dx, y: gridY + dy })
    }
  }
  const gs = useGameStore.getState()
  if (activeTool === 'fog-reveal') {
    gs.revealFog(mapId, cells)
  } else {
    gs.hideFog(mapId, cells)
  }
}

/**
 * Handle wall placement with auto-close snapping.
 */
export function handleWallPlace(
  mapId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  existingWalls: WallSegment[],
  triggerRerender: () => void
): void {
  const snapThreshold = 0.5
  let finalX2 = x2
  let finalY2 = y2

  if (existingWalls.length > 0) {
    const firstWall = existingWalls[existingWalls.length - 1]
    if (firstWall) {
      const distToStart = Math.sqrt((x2 - firstWall.x1) ** 2 + (y2 - firstWall.y1) ** 2)
      if (distToStart < snapThreshold && distToStart > 0) {
        finalX2 = firstWall.x1
        finalY2 = firstWall.y1
      }
    }
  }

  const wall: WallSegment = {
    id: crypto.randomUUID(),
    x1,
    y1,
    x2: finalX2,
    y2: finalY2,
    type: 'solid',
    isOpen: false
  }

  const gs = useGameStore.getState()
  gs.addWallSegment(mapId, wall)

  const wallId = wall.id
  UndoManager.push({
    type: 'wall-place',
    description: `Place wall (${x1},${y1}) to (${finalX2},${finalY2})`,
    undo: () => {
      const s = useGameStore.getState()
      s.removeWallSegment(mapId, wallId)
    },
    redo: () => {
      const s = useGameStore.getState()
      s.addWallSegment(mapId, wall)
    }
  })
  triggerRerender()
}
