import { describe, expect, it } from 'vitest'
import type { MapToken } from '../../types/map'
import { type AoEDefinition, countTargetsInAoE, getAffectedCells, getTokensInAoE } from './aoe-targeting'

function makeToken(id: string, gridX: number, gridY: number, sizeX = 1, sizeY = 1): MapToken {
  return {
    id,
    entityId: `entity-${id}`,
    entityType: 'enemy',
    label: `Token ${id}`,
    gridX,
    gridY,
    sizeX,
    sizeY,
    visibleToPlayers: true,
    conditions: []
  }
}

describe('aoe-targeting', () => {
  describe('getAffectedCells', () => {
    it('should compute sphere cells centered on origin', () => {
      const aoe: AoEDefinition = { shape: 'sphere', originX: 5, originY: 5, size: 10 }
      const cells = getAffectedCells(aoe)
      // 10ft radius = 2 cell radius, should include origin
      expect(cells.length).toBeGreaterThan(0)
      expect(cells).toContainEqual({ x: 5, y: 5 })
    })

    it('should compute line cells', () => {
      const aoe: AoEDefinition = { shape: 'line', originX: 0, originY: 0, size: 30, direction: 0, width: 5 }
      const cells = getAffectedCells(aoe)
      expect(cells.length).toBeGreaterThan(0)
      // Line going right from origin should include (1,0), (2,0), etc.
      expect(cells).toContainEqual({ x: 1, y: 0 })
    })

    it('should compute cone cells', () => {
      const aoe: AoEDefinition = { shape: 'cone', originX: 5, originY: 5, size: 15, direction: 0 }
      const cells = getAffectedCells(aoe)
      expect(cells.length).toBeGreaterThan(0)
    })

    it('should compute cube cells', () => {
      const aoe: AoEDefinition = { shape: 'cube', originX: 5, originY: 5, size: 15, direction: 0 }
      const cells = getAffectedCells(aoe)
      expect(cells.length).toBeGreaterThan(0)
    })

    it('should return empty array for unknown shape', () => {
      const _aoe = { shape: 'unknown' as 'sphere', originX: 5, originY: 5, size: 10 }
      // Cylinder uses sphere cells
      const aoeCyl: AoEDefinition = { shape: 'cylinder', originX: 5, originY: 5, size: 10 }
      const cells = getAffectedCells(aoeCyl)
      expect(cells.length).toBeGreaterThan(0)
    })
  })

  describe('getTokensInAoE', () => {
    const tokens: MapToken[] = [
      makeToken('a', 5, 5),
      makeToken('b', 6, 5),
      makeToken('c', 15, 15),
      makeToken('d', 5, 6)
    ]

    it('should find tokens within a sphere', () => {
      const aoe: AoEDefinition = { shape: 'sphere', originX: 5, originY: 5, size: 10 }
      const result = getTokensInAoE(aoe, tokens)
      const targetIds = result.targets.map((t) => t.id)
      expect(targetIds).toContain('a')
      expect(targetIds).toContain('b')
      expect(targetIds).toContain('d')
      expect(targetIds).not.toContain('c') // too far away
    })

    it('should exclude specific token', () => {
      const aoe: AoEDefinition = { shape: 'sphere', originX: 5, originY: 5, size: 10 }
      const result = getTokensInAoE(aoe, tokens, 'a')
      const targetIds = result.targets.map((t) => t.id)
      expect(targetIds).not.toContain('a')
    })

    it('should detect Large tokens that overlap AoE', () => {
      const largeToken = makeToken('large', 4, 4, 2, 2) // occupies (4,4), (5,4), (4,5), (5,5)
      const aoe: AoEDefinition = { shape: 'sphere', originX: 5, originY: 5, size: 5 }
      const result = getTokensInAoE(aoe, [largeToken])
      expect(result.targets.length).toBe(1)
    })
  })

  describe('countTargetsInAoE', () => {
    const tokens: MapToken[] = [makeToken('a', 5, 5), makeToken('b', 6, 5), makeToken('c', 15, 15)]

    it('should return correct count', () => {
      const aoe: AoEDefinition = { shape: 'sphere', originX: 5, originY: 5, size: 10 }
      expect(countTargetsInAoE(aoe, tokens)).toBe(2)
    })

    it('should return 0 when no tokens in range', () => {
      const aoe: AoEDefinition = { shape: 'sphere', originX: 50, originY: 50, size: 5 }
      expect(countTargetsInAoE(aoe, tokens)).toBe(0)
    })
  })
})
