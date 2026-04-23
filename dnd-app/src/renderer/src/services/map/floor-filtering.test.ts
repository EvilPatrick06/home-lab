import { describe, expect, it } from 'vitest'
import type { DrawingData, MapToken, TerrainCell, WallSegment } from '../../types/map'
import {
  filterDrawingsByFloor,
  filterTerrainByFloor,
  filterTokensByFloor,
  filterWallsByFloor,
  getPlayerFloor,
  getTokenFloor
} from './floor-filtering'

function makeToken(overrides: Partial<MapToken> & { gridX: number; gridY: number }): MapToken {
  return {
    id: `token-${overrides.gridX}-${overrides.gridY}`,
    entityId: `entity-${overrides.gridX}-${overrides.gridY}`,
    entityType: 'player',
    label: 'Token',
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  } as MapToken
}

// ─── getTokenFloor ───────────────────────────────────────────

describe('getTokenFloor', () => {
  it('returns 0 for tokens without a floor property', () => {
    const token = makeToken({ gridX: 0, gridY: 0 })
    expect(getTokenFloor(token)).toBe(0)
  })

  it('returns 0 for tokens with floor explicitly set to 0', () => {
    const token = makeToken({ gridX: 0, gridY: 0, floor: 0 })
    expect(getTokenFloor(token)).toBe(0)
  })

  it('returns the floor value when set', () => {
    const token = makeToken({ gridX: 0, gridY: 0, floor: 2 })
    expect(getTokenFloor(token)).toBe(2)
  })
})

// ─── filterTokensByFloor ─────────────────────────────────────

describe('filterTokensByFloor', () => {
  const tokens = [
    makeToken({ id: 'a', gridX: 0, gridY: 0 }),
    makeToken({ id: 'b', gridX: 1, gridY: 0, floor: 0 }),
    makeToken({ id: 'c', gridX: 2, gridY: 0, floor: 1 }),
    makeToken({ id: 'd', gridX: 3, gridY: 0, floor: 2 })
  ]

  it('returns only floor 0 tokens (including undefined)', () => {
    const result = filterTokensByFloor(tokens, 0)
    expect(result.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('returns only floor 1 tokens', () => {
    const result = filterTokensByFloor(tokens, 1)
    expect(result.map((t) => t.id)).toEqual(['c'])
  })

  it('returns only floor 2 tokens', () => {
    const result = filterTokensByFloor(tokens, 2)
    expect(result.map((t) => t.id)).toEqual(['d'])
  })

  it('returns empty for a floor with no tokens', () => {
    const result = filterTokensByFloor(tokens, 5)
    expect(result).toEqual([])
  })

  it('handles empty token array', () => {
    expect(filterTokensByFloor([], 0)).toEqual([])
  })
})

// ─── filterWallsByFloor ──────────────────────────────────────

describe('filterWallsByFloor', () => {
  const walls: WallSegment[] = [
    { id: 'w1', x1: 0, y1: 0, x2: 1, y2: 0, type: 'solid' },
    { id: 'w2', x1: 0, y1: 0, x2: 1, y2: 0, type: 'solid', floor: 0 },
    { id: 'w3', x1: 0, y1: 0, x2: 1, y2: 0, type: 'door', floor: 1 },
    { id: 'w4', x1: 0, y1: 0, x2: 1, y2: 0, type: 'solid', floor: 2 }
  ]

  it('returns floor 0 walls including those without floor property', () => {
    const result = filterWallsByFloor(walls, 0)
    expect(result.map((w) => w.id)).toEqual(['w1', 'w2'])
  })

  it('returns only floor 1 walls', () => {
    const result = filterWallsByFloor(walls, 1)
    expect(result.map((w) => w.id)).toEqual(['w3'])
  })

  it('handles empty walls array', () => {
    expect(filterWallsByFloor([], 0)).toEqual([])
  })
})

// ─── filterTerrainByFloor ────────────────────────────────────

describe('filterTerrainByFloor', () => {
  const terrain: TerrainCell[] = [
    { x: 0, y: 0, type: 'difficult', movementCost: 2 },
    { x: 1, y: 0, type: 'water', movementCost: 2, floor: 0 },
    { x: 2, y: 0, type: 'hazard', movementCost: 2, floor: 1 }
  ]

  it('returns floor 0 terrain including undefined', () => {
    const result = filterTerrainByFloor(terrain, 0)
    expect(result).toHaveLength(2)
    expect(result[0].x).toBe(0)
    expect(result[1].x).toBe(1)
  })

  it('returns floor 1 terrain only', () => {
    const result = filterTerrainByFloor(terrain, 1)
    expect(result).toHaveLength(1)
    expect(result[0].x).toBe(2)
  })
})

// ─── filterDrawingsByFloor ───────────────────────────────────

describe('filterDrawingsByFloor', () => {
  const drawings: DrawingData[] = [
    { id: 'd1', type: 'draw-free', points: [], color: '#fff', strokeWidth: 2 },
    { id: 'd2', type: 'draw-line', points: [], color: '#fff', strokeWidth: 2, floor: 1 }
  ]

  it('returns floor 0 drawings including undefined', () => {
    const result = filterDrawingsByFloor(drawings, 0)
    expect(result.map((d) => d.id)).toEqual(['d1'])
  })

  it('returns floor 1 drawings', () => {
    const result = filterDrawingsByFloor(drawings, 1)
    expect(result.map((d) => d.id)).toEqual(['d2'])
  })
})

// ─── getPlayerFloor ──────────────────────────────────────────

describe('getPlayerFloor', () => {
  const tokens = [
    makeToken({ id: 'p1', entityId: 'char-1', gridX: 0, gridY: 0, entityType: 'player', floor: 1 }),
    makeToken({ id: 'e1', entityId: 'enemy-1', gridX: 5, gridY: 5, entityType: 'enemy', floor: 2 }),
    makeToken({ id: 'p2', entityId: 'char-2', gridX: 3, gridY: 3, entityType: 'player' })
  ]

  it('returns the floor of the player character token', () => {
    expect(getPlayerFloor(tokens, 'char-1')).toBe(1)
  })

  it('returns 0 for a player token without floor set', () => {
    expect(getPlayerFloor(tokens, 'char-2')).toBe(0)
  })

  it('ignores non-player tokens with matching entityId', () => {
    expect(getPlayerFloor(tokens, 'enemy-1')).toBe(0)
  })

  it('returns 0 when playerEntityId is null', () => {
    expect(getPlayerFloor(tokens, null)).toBe(0)
  })

  it('returns 0 when playerEntityId is undefined', () => {
    expect(getPlayerFloor(tokens, undefined)).toBe(0)
  })

  it('returns 0 when token is not found', () => {
    expect(getPlayerFloor(tokens, 'nonexistent')).toBe(0)
  })

  it('handles empty tokens array', () => {
    expect(getPlayerFloor([], 'char-1')).toBe(0)
  })
})
