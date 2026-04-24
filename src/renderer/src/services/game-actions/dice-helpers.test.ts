import { describe, expect, it, vi } from 'vitest'

vi.mock('../dice/dice-service', () => ({
  rollMultiple: vi.fn((count: number, sides: number) => {
    // Return deterministic values for testing
    return Array.from({ length: count }, (_, i) => ((i * 3 + 1) % sides) + 1)
  })
}))

import type { MapToken } from '../../types/map'
import { findTokensInArea, rollDiceFormula } from './dice-helpers'

describe('rollDiceFormula', () => {
  it('parses and rolls NdS+M formula', () => {
    const result = rollDiceFormula('2d6+3')
    expect(result.rolls).toHaveLength(2)
    expect(typeof result.total).toBe('number')
    expect(result.total).toBe(result.rolls.reduce((s, r) => s + r, 0) + 3)
  })

  it('parses and rolls NdS-M formula', () => {
    const result = rollDiceFormula('1d20-2')
    expect(result.rolls).toHaveLength(1)
    expect(result.total).toBe(result.rolls[0] - 2)
  })

  it('parses NdS without modifier', () => {
    const result = rollDiceFormula('3d8')
    expect(result.rolls).toHaveLength(3)
    expect(result.total).toBe(result.rolls.reduce((s, r) => s + r, 0))
  })

  it('handles plain number as formula', () => {
    const result = rollDiceFormula('10')
    expect(result.rolls).toEqual([10])
    expect(result.total).toBe(10)
  })

  it('returns empty rolls and total 0 for unparseable formula', () => {
    const result = rollDiceFormula('garbage')
    expect(result.rolls).toEqual([])
    expect(result.total).toBe(0)
  })

  it('handles 1d6 formula', () => {
    const result = rollDiceFormula('1d6')
    expect(result.rolls).toHaveLength(1)
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1)
    expect(result.rolls[0]).toBeLessThanOrEqual(6)
  })
})

describe('findTokensInArea', () => {
  function makeToken(overrides: Partial<MapToken>): MapToken {
    return {
      id: 'tok-1',
      entityId: 'ent-1',
      entityType: 'enemy',
      label: 'Test',
      gridX: 0,
      gridY: 0,
      sizeX: 1,
      sizeY: 1,
      visibleToPlayers: true,
      conditions: [],
      ...overrides
    }
  }

  const tokensGrid = [
    makeToken({ id: 't1', label: 'A', gridX: 0, gridY: 0 }),
    makeToken({ id: 't2', label: 'B', gridX: 3, gridY: 0 }),
    makeToken({ id: 't3', label: 'C', gridX: 0, gridY: 3 }),
    makeToken({ id: 't4', label: 'D', gridX: 5, gridY: 5 }),
    makeToken({ id: 't5', label: 'E', gridX: 10, gridY: 10 })
  ]

  describe('sphere shape', () => {
    it('includes tokens within radius', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 4, 'sphere')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('A')
      expect(labels).toContain('B')
      expect(labels).toContain('C')
    })

    it('excludes tokens outside radius', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 2, 'sphere')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('A')
      expect(labels).not.toContain('D')
      expect(labels).not.toContain('E')
    })
  })

  describe('emanation shape', () => {
    it('works same as sphere', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 4, 'emanation')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('A')
      expect(labels).toContain('B')
    })
  })

  describe('cylinder shape', () => {
    it('works same as sphere (2D check)', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 4, 'cylinder')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('A')
    })
  })

  describe('cube shape', () => {
    it('includes tokens within half-side on each axis', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 4, 'cube')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('A')
      expect(labels).toContain('B')
      expect(labels).toContain('C')
    })

    it('excludes tokens outside the cube', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 3, 'cube')
      const labels = result.map((t) => t.label)
      expect(labels).not.toContain('D')
      expect(labels).not.toContain('E')
    })
  })

  describe('cone shape', () => {
    it('uses same logic as cube', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 4, 'cone')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('A')
    })
  })

  describe('line shape', () => {
    it('includes tokens within width and length', () => {
      const tokens = [
        makeToken({ id: 't1', label: 'InLine', gridX: 3, gridY: 0 }),
        makeToken({ id: 't2', label: 'Outside', gridX: 3, gridY: 5 }),
        makeToken({ id: 't3', label: 'Behind', gridX: -2, gridY: 0 })
      ]
      const result = findTokensInArea(tokens, 0, 0, 5, 'line', 2)
      const labels = result.map((t) => t.label)
      expect(labels).toContain('InLine')
      expect(labels).not.toContain('Outside')
      expect(labels).not.toContain('Behind')
    })

    it('defaults width to 1 when not provided', () => {
      const tokens = [
        makeToken({ id: 't1', label: 'OnLine', gridX: 2, gridY: 0 }),
        makeToken({ id: 't2', label: 'Off', gridX: 2, gridY: 2 })
      ]
      const result = findTokensInArea(tokens, 0, 0, 5, 'line')
      const labels = result.map((t) => t.label)
      expect(labels).toContain('OnLine')
      expect(labels).not.toContain('Off')
    })
  })

  describe('unknown shape', () => {
    it('falls back to sphere/circle behavior', () => {
      const result = findTokensInArea(tokensGrid, 0, 0, 4, 'unknown_shape')
      const sphereResult = findTokensInArea(tokensGrid, 0, 0, 4, 'sphere')
      expect(result.map((t) => t.id)).toEqual(sphereResult.map((t) => t.id))
    })
  })

  it('returns empty array when no tokens in range', () => {
    const result = findTokensInArea(tokensGrid, 100, 100, 1, 'sphere')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty token list', () => {
    const result = findTokensInArea([], 0, 0, 10, 'sphere')
    expect(result).toHaveLength(0)
  })
})
