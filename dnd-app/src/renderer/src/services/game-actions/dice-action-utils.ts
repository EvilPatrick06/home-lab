/**
 * Dice rolling helpers for action execution.
 */

import { getConeCells, getLineCells } from '../combat/aoe-targeting'
import { rollMultiple } from '../dice/dice-service'

export function rollDiceFormula(formula: string): { rolls: number[]; total: number } {
  // Parse "NdS+M" or "NdS-M" or "NdS"
  const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (!match) {
    // Try plain number
    const num = parseInt(formula, 10)
    if (!Number.isNaN(num)) return { rolls: [num], total: num }
    return { rolls: [], total: 0 }
  }

  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  const rolls = rollMultiple(count, sides)
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier
  return { rolls, total }
}

/**
 * Find tokens within a geometric area (sphere, cube, cone, line, etc.).
 */
export function findTokensInArea(
  tokens: import('../../types/map').MapToken[],
  originX: number,
  originY: number,
  radiusCells: number,
  shape: string,
  widthCells?: number,
  /** Phase 17c (LOG-5) — cone facing in degrees (0 = +x). Required for true cone geometry. */
  directionDeg?: number
): import('../../types/map').MapToken[] {
  // Phase 17c (LOG-5) — a cone is no longer approximated by a square. Build the cone's cell set
  // once (getConeCells, 5ft cells) and test membership; cells are { x, y } in absolute grid coords.
  let coneCellSet: Set<string> | null = null
  if (shape === 'cone') {
    const cells = getConeCells(originX, originY, radiusCells * 5, directionDeg ?? 0)
    coneCellSet = new Set(cells.map((c) => `${c.x},${c.y}`))
  }
  // 08I — lines now respect direction too (was hardcoded +x). `directionDeg ?? 0` keeps the old
  // +x behavior when no direction is given.
  let lineCellSet: Set<string> | null = null
  if (shape === 'line') {
    const cells = getLineCells(originX, originY, radiusCells * 5, directionDeg ?? 0, (widthCells ?? 1) * 5)
    lineCellSet = new Set(cells.map((c) => `${c.x},${c.y}`))
  }
  return tokens.filter((t) => {
    const dx = t.gridX - originX
    const dy = t.gridY - originY
    switch (shape) {
      case 'sphere':
      case 'emanation':
      case 'cylinder':
        return Math.sqrt(dx * dx + dy * dy) <= radiusCells
      case 'cone':
        return coneCellSet?.has(`${t.gridX},${t.gridY}`) ?? false
      case 'cube': {
        const half = radiusCells
        return Math.abs(dx) <= half && Math.abs(dy) <= half
      }
      case 'line':
        return lineCellSet?.has(`${t.gridX},${t.gridY}`) ?? false
      default:
        return Math.sqrt(dx * dx + dy * dy) <= radiusCells
    }
  })
}
