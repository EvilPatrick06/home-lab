import type { GameMap, MapToken } from '../../types/map'
import { logger } from '../../utils/logger'

/**
 * Phase 26c — smart token placement.
 *
 * Spreads new tokens onto the half of the map AWAY from the players, skipping
 * cells already occupied by tokens or crossed by wall segments, and honoring
 * each token's footprint (Large 2×2, Huge 3×3, Gargantuan 4×4). Pure: assigns
 * `gridX`/`gridY` and returns the tokens; the caller persists them.
 */

export type PlaceableToken = Partial<MapToken> & { sizeX?: number; sizeY?: number }
export type PlacedToken = PlaceableToken & { gridX: number; gridY: number }

const key = (x: number, y: number): string => `${x},${y}`

/** Rasterize a wall segment (grid-cell coords) into the cells it passes through. */
function rasterizeWall(x1: number, y1: number, x2: number, y2: number, out: Set<string>): void {
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  const sx = x1 < x2 ? 1 : -1
  const sy = y1 < y2 ? 1 : -1
  let err = dx - dy
  let x = x1
  let y = y1
  // Guard against degenerate / runaway segments.
  for (let i = 0; i < 1000; i++) {
    out.add(key(Math.round(x), Math.round(y)))
    if (x === x2 && y === y2) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

/** Find the first empty cell (all footprint cells clear + in bounds) spiraling out from a start. */
export function findEmptyCell(
  startX: number,
  startY: number,
  occupied: Set<string>,
  blocked: Set<string>,
  cols: number,
  rows: number,
  sizeX: number,
  sizeY: number
): { x: number; y: number } | null {
  const fits = (ox: number, oy: number): boolean => {
    if (ox < 0 || oy < 0 || ox + sizeX > cols || oy + sizeY > rows) return false
    for (let dx = 0; dx < sizeX; dx++) {
      for (let dy = 0; dy < sizeY; dy++) {
        const k = key(ox + dx, oy + dy)
        if (occupied.has(k) || blocked.has(k)) return false
      }
    }
    return true
  }

  const maxRadius = Math.max(cols, rows)
  for (let r = 0; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only the ring at radius r (Chebyshev) — inner rings already checked.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = startX + dx
        const y = startY + dy
        if (fits(x, y)) return { x, y }
      }
    }
  }
  return null
}

export function smartPlaceTokens(map: GameMap, tokens: PlaceableToken[]): PlacedToken[] {
  const cellSize = map.grid?.cellSize || 64
  const cols = Math.max(1, Math.floor((map.width || 0) / cellSize))
  const rows = Math.max(1, Math.floor((map.height || 0) / cellSize))

  const occupied = new Set<string>()
  for (const t of map.tokens ?? []) {
    for (let dx = 0; dx < (t.sizeX || 1); dx++) {
      for (let dy = 0; dy < (t.sizeY || 1); dy++) {
        occupied.add(key(t.gridX + dx, t.gridY + dy))
      }
    }
  }

  const blocked = new Set<string>()
  for (const w of map.wallSegments ?? []) {
    if (w.isOpen) continue
    rasterizeWall(w.x1, w.y1, w.x2, w.y2, blocked)
  }

  // Deployment start = opposite side from the players' center of mass.
  const players = (map.tokens ?? []).filter((t) => t.entityType === 'player')
  let startX = Math.floor(cols / 2)
  let startY = Math.floor(rows / 2)
  if (players.length > 0) {
    const px = players.reduce((s, t) => s + t.gridX, 0) / players.length
    const py = players.reduce((s, t) => s + t.gridY, 0) / players.length
    startX = px > cols / 2 ? Math.min(2, cols - 1) : Math.max(cols - 5, 0)
    startY = py > rows / 2 ? Math.min(2, rows - 1) : Math.max(rows - 5, 0)
  }

  const placed: PlacedToken[] = []
  for (const token of tokens) {
    const sizeX = token.sizeX || 1
    const sizeY = token.sizeY || 1
    const cell = findEmptyCell(startX, startY, occupied, blocked, cols, rows, sizeX, sizeY)
    if (!cell) {
      logger.warn('[token-placement] no empty cell for token; map may be full', token.label)
      continue
    }
    for (let dx = 0; dx < sizeX; dx++) {
      for (let dy = 0; dy < sizeY; dy++) {
        occupied.add(key(cell.x + dx, cell.y + dy))
      }
    }
    placed.push({ ...token, gridX: cell.x, gridY: cell.y })
  }
  return placed
}
