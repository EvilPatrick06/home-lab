import { describe, expect, it } from 'vitest'
import type { GameMap, MapToken } from '../../types/map'
import { findEmptyCell, type PlaceableToken, smartPlaceTokens } from './token-placement'

function makeMap(overrides: Partial<GameMap> = {}): GameMap {
  return {
    id: 'm1',
    name: 'Test',
    campaignId: 'c1',
    imagePath: '',
    width: 20 * 50, // 20 cols
    height: 20 * 50, // 20 rows
    grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 1, type: 'square' },
    tokens: [],
    fogOfWar: {} as GameMap['fogOfWar'],
    terrain: [],
    createdAt: '',
    ...overrides
  }
}

function playerAt(gridX: number, gridY: number, id: string): MapToken {
  return {
    id,
    entityId: id,
    entityType: 'player',
    label: id,
    gridX,
    gridY,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: []
  }
}

const goblin: PlaceableToken = { label: 'Goblin', entityType: 'enemy', sizeX: 1, sizeY: 1 }

describe('smartPlaceTokens (Phase 26c)', () => {
  it('places all tokens with no overlap', () => {
    const map = makeMap()
    const placed = smartPlaceTokens(
      map,
      Array.from({ length: 8 }, () => ({ ...goblin }))
    )
    expect(placed).toHaveLength(8)
    const seen = new Set(placed.map((t) => `${t.gridX},${t.gridY}`))
    expect(seen.size).toBe(8) // all distinct
  })

  it('deploys opposite the player cluster', () => {
    const map = makeMap({ tokens: [playerAt(10, 10, 'p1'), playerAt(11, 10, 'p2')] })
    const placed = smartPlaceTokens(map, [{ ...goblin }])
    // Players' center x≈10.5 sits just right of center (cols/2=10), so enemies
    // deploy on the LEFT half (start col 2).
    expect(placed[0].gridX).toBeLessThanOrEqual(8)
  })

  it('never overlaps an existing token', () => {
    const existing = playerAt(15, 15, 'p1')
    const map = makeMap({ tokens: [existing] })
    const placed = smartPlaceTokens(
      map,
      Array.from({ length: 5 }, () => ({ ...goblin }))
    )
    for (const t of placed) {
      expect(`${t.gridX},${t.gridY}`).not.toBe('15,15')
    }
  })

  it('places a Huge 3×3 token with all underlying cells clear', () => {
    const map = makeMap()
    const placed = smartPlaceTokens(map, [{ label: 'Dragon', entityType: 'enemy', sizeX: 3, sizeY: 3 }])
    expect(placed).toHaveLength(1)
    const { gridX, gridY } = placed[0]
    expect(gridX + 3).toBeLessThanOrEqual(20)
    expect(gridY + 3).toBeLessThanOrEqual(20)
  })

  it('findEmptyCell skips blocked (wall) cells', () => {
    const occupied = new Set<string>()
    const blocked = new Set<string>(['5,5'])
    const cell = findEmptyCell(5, 5, occupied, blocked, 20, 20, 1, 1)
    expect(cell).not.toBeNull()
    expect(`${cell?.x},${cell?.y}`).not.toBe('5,5')
  })

  it('respects wall segments from the map', () => {
    // A vertical wall along column 15, rows 13-17.
    const map = makeMap({
      tokens: [playerAt(2, 2, 'p1')],
      wallSegments: Array.from({ length: 5 }, (_, i) => ({
        id: `w${i}`,
        x1: 15,
        y1: 13 + i,
        x2: 15,
        y2: 13 + i,
        type: 'solid' as const
      }))
    })
    const placed = smartPlaceTokens(
      map,
      Array.from({ length: 6 }, () => ({ ...goblin }))
    )
    for (const t of placed) {
      // none should sit on the blocked wall cells (col 15, rows 13-17)
      if (t.gridX === 15) expect(t.gridY < 13 || t.gridY > 17).toBe(true)
    }
  })
})
