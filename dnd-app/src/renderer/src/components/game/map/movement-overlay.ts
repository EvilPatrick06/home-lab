import type { Graphics } from 'pixi.js'
import { getReachableCells } from '../../../services/combat/combat-rules'
import { getReachableCellsWithWalls, type PathResult } from '../../../services/map/pathfinder'

type _PathResult = PathResult

import type { TerrainCell, WallSegment } from '../../../types/map'

/**
 * Draw movement range overlay showing reachable cells for the active token.
 * Uses wall-aware pathfinding when walls are provided, falls back to simple BFS otherwise.
 */
export function drawMovementOverlay(
  graphics: Graphics,
  startX: number,
  startY: number,
  movementRemaining: number,
  movementMax: number,
  cellSize: number,
  terrain: TerrainCell[],
  gridWidth: number,
  gridHeight: number,
  walls?: WallSegment[]
): void {
  graphics.clear()

  if (movementRemaining <= 0) return

  const reachable =
    walls && walls.length > 0
      ? getReachableCellsWithWalls(startX, startY, movementRemaining, terrain, gridWidth, gridHeight, walls)
      : getReachableCells(startX, startY, movementRemaining, terrain, gridWidth, gridHeight)

  for (const cell of reachable) {
    // Normal movement range: green tint
    // Dash-extended range (> base speed): yellow tint
    const isDashRange = cell.cost > movementMax
    const color = isDashRange ? 0xfbbf24 : 0x22c55e // amber-400 : green-500
    const alpha = isDashRange ? 0.15 : 0.2

    graphics.rect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize)
    graphics.fill({ color, alpha })
  }
}

/**
 * Draw terrain overlay showing difficult terrain cells.
 */
export function drawTerrainOverlay(graphics: Graphics, terrain: TerrainCell[], cellSize: number): void {
  graphics.clear()

  for (const cell of terrain) {
    let color: number
    let alpha: number

    switch (cell.type) {
      case 'difficult':
        color = 0x92400e // brown
        alpha = 0.25
        break
      case 'hazard':
        color = 0xef4444 // red
        alpha = 0.2
        break
      case 'water':
        color = 0x3b82f6 // blue
        alpha = 0.2
        break
      case 'climbing':
        color = 0xa855f7 // purple
        alpha = 0.2
        break
      default:
        color = 0x92400e
        alpha = 0.25
    }

    const flooredX = Math.floor(cell.x)
    const flooredY = Math.floor(cell.y)

    graphics.rect(flooredX * cellSize, flooredY * cellSize, cellSize, cellSize)
    graphics.fill({ color, alpha })

    // Draw crosshatch pattern for difficult terrain
    if (cell.type === 'difficult') {
      graphics.moveTo(flooredX * cellSize, flooredY * cellSize)
      graphics.lineTo((flooredX + 1) * cellSize, (flooredY + 1) * cellSize)
      graphics.moveTo((flooredX + 1) * cellSize, flooredY * cellSize)
      graphics.lineTo(flooredX * cellSize, (flooredY + 1) * cellSize)
      graphics.stroke({ width: 1, color: 0x92400e, alpha: 0.4 })
    }

    // Draw diagonal hash pattern for climbing terrain
    if (cell.type === 'climbing') {
      const cx = flooredX * cellSize
      const cy = flooredY * cellSize
      for (let i = 0; i < cellSize; i += 6) {
        graphics.moveTo(cx + i, cy)
        graphics.lineTo(cx + i, cy + cellSize)
      }
      graphics.stroke({ width: 1, color: 0xa855f7, alpha: 0.3 })
    }
  }
}

export function clearMovementOverlay(graphics: Graphics): void {
  graphics.clear()
}
