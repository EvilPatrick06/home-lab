import type { Graphics } from 'pixi.js'

export type AoEShape = 'cone' | 'cube' | 'cylinder' | 'emanation' | 'line' | 'sphere'

export type Direction8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export interface AoEConfig {
  shape: AoEShape
  /** Size in feet (length for cone/line, side for cube, radius for cylinder/emanation/sphere) */
  sizeFeet: number
  /** Origin cell (grid coordinates) */
  originX: number
  originY: number
  /** Direction for directional shapes (cone, line) */
  direction?: Direction8
  /** Width in feet for line shape (default 5) */
  widthFeet?: number
  /** For emanation: the entity size in cells (1=SM, 2=L, etc.) */
  entitySize?: number
}

const DIR_VECTORS: Record<Direction8, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  NE: { dx: 1, dy: -1 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 1, dy: 1 },
  S: { dx: 0, dy: 1 },
  SW: { dx: -1, dy: 1 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -1, dy: -1 }
}

/**
 * Get all affected cells for a given AoE shape.
 */
export function getAoECells(config: AoEConfig): Array<{ x: number; y: number }> {
  const sizeCells = Math.ceil(config.sizeFeet / 5)
  const cells: Array<{ x: number; y: number }> = []
  const cellSet = new Set<string>()

  const add = (x: number, y: number): void => {
    const key = `${x},${y}`
    if (!cellSet.has(key)) {
      cellSet.add(key)
      cells.push({ x, y })
    }
  }

  switch (config.shape) {
    case 'cube': {
      // Square of NxN cells from origin
      for (let dx = 0; dx < sizeCells; dx++) {
        for (let dy = 0; dy < sizeCells; dy++) {
          add(config.originX + dx, config.originY + dy)
        }
      }
      break
    }
    case 'sphere':
    case 'cylinder': {
      // Circle of cells within radius
      const radius = sizeCells
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Chebyshev distance for grid-based D&D
          if (Math.max(Math.abs(dx), Math.abs(dy)) <= radius) {
            add(config.originX + dx, config.originY + dy)
          }
        }
      }
      break
    }
    case 'emanation': {
      // All cells within distance of the entity (includes entity's space)
      const dist = sizeCells
      const entitySize = config.entitySize ?? 1
      for (let dx = -dist; dx < entitySize + dist; dx++) {
        for (let dy = -dist; dy < entitySize + dist; dy++) {
          // Check if cell is within distance of any entity cell
          let withinRange = false
          for (let ex = 0; ex < entitySize; ex++) {
            for (let ey = 0; ey < entitySize; ey++) {
              const cdx = dx - ex
              const cdy = dy - ey
              if (Math.max(Math.abs(cdx), Math.abs(cdy)) <= dist) {
                withinRange = true
                break
              }
            }
            if (withinRange) break
          }
          if (withinRange) {
            add(config.originX + dx, config.originY + dy)
          }
        }
      }
      break
    }
    case 'cone': {
      if (!config.direction) break
      const dir = DIR_VECTORS[config.direction]
      const length = sizeCells

      // Cone spreads from origin: at distance d, width = d cells on each side perpendicular to direction
      for (let d = 1; d <= length; d++) {
        // Width at distance d (in cells from center line)
        const halfWidth = d

        // Perpendicular vectors
        const _perpDx = dir.dy !== 0 ? (dir.dy > 0 ? 1 : -1) : 0
        const _perpDy = dir.dx !== 0 ? (dir.dx > 0 ? -1 : 1) : 0

        // For cardinal directions, perp is simple
        // For diagonal, both perp axes matter
        if (dir.dx === 0 || dir.dy === 0) {
          // Cardinal direction
          const cx = config.originX + dir.dx * d
          const cy = config.originY + dir.dy * d
          for (let w = -halfWidth; w <= halfWidth; w++) {
            if (dir.dx === 0) {
              add(cx + w, cy)
            } else {
              add(cx, cy + w)
            }
          }
        } else {
          // Diagonal direction — fill a diamond/triangle shape
          for (let a = 0; a <= d; a++) {
            for (let b = 0; b <= d - a; b++) {
              add(
                config.originX + dir.dx * a + (dir.dy === 0 ? 0 : dir.dx > 0 ? b : -b),
                config.originY + dir.dy * b + (dir.dx === 0 ? 0 : dir.dy > 0 ? a : -a)
              )
            }
          }
        }
      }
      break
    }
    case 'line': {
      if (!config.direction) break
      const dir = DIR_VECTORS[config.direction]
      const length = sizeCells
      const halfWidth = Math.max(0, Math.floor((config.widthFeet ?? 5) / 10))

      for (let d = 1; d <= length; d++) {
        const cx = config.originX + dir.dx * d
        const cy = config.originY + dir.dy * d

        // Width perpendicular to direction
        if (dir.dx === 0) {
          for (let w = -halfWidth; w <= halfWidth; w++) add(cx + w, cy)
        } else if (dir.dy === 0) {
          for (let w = -halfWidth; w <= halfWidth; w++) add(cx, cy + w)
        } else {
          // Diagonal line: just the single cell width
          add(cx, cy)
          for (let w = 1; w <= halfWidth; w++) {
            add(cx + w, cy)
            add(cx - w, cy)
            add(cx, cy + w)
            add(cx, cy - w)
          }
        }
      }
      break
    }
  }

  return cells
}

/**
 * Draw AoE overlay on the map.
 */
export function drawAoEOverlay(
  graphics: Graphics,
  config: AoEConfig,
  cellSize: number,
  color: number = 0xef4444 // red
): void {
  graphics.clear()

  const cells = getAoECells(config)
  const alpha = 0.25

  for (const cell of cells) {
    graphics.rect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize)
    graphics.fill({ color, alpha })
  }

  // Draw border
  for (const cell of cells) {
    graphics.rect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize)
    graphics.stroke({ width: 1, color, alpha: 0.5 })
  }
}

export function clearAoEOverlay(graphics: Graphics): void {
  graphics.clear()
}
