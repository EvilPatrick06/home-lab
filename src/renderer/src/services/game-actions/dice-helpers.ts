/**
 * Dice rolling helpers for action execution.
 */

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
  widthCells?: number
): import('../../types/map').MapToken[] {
  return tokens.filter((t) => {
    const dx = t.gridX - originX
    const dy = t.gridY - originY
    switch (shape) {
      case 'sphere':
      case 'emanation':
      case 'cylinder':
        return Math.sqrt(dx * dx + dy * dy) <= radiusCells
      case 'cube':
      case 'cone': {
        const half = radiusCells
        return Math.abs(dx) <= half && Math.abs(dy) <= half
      }
      case 'line': {
        const w = widthCells ?? 1
        return Math.abs(dy) <= Math.floor(w / 2) && dx >= 0 && dx <= radiusCells
      }
      default:
        return Math.sqrt(dx * dx + dy * dy) <= radiusCells
    }
  })
}
