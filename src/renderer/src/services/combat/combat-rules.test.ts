import { describe, expect, it } from 'vitest'
import type { MapToken } from '../../types/map'
import {
  checkRangedRange,
  fallDamageDice,
  getReachableCells,
  gridDistanceFeet,
  gridDistanceFeetAlternate,
  isInMeleeRange,
  movementCostFeet
} from './combat-rules'

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'tok-1',
    entityId: 'e-1',
    entityType: 'player',
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

describe('gridDistanceFeet', () => {
  it('returns 0 for same position', () => {
    expect(gridDistanceFeet(0, 0, 0, 0)).toBe(0)
  })

  it('returns 5 for adjacent horizontal cell', () => {
    expect(gridDistanceFeet(0, 0, 1, 0)).toBe(5)
  })

  it('returns 5 for adjacent vertical cell', () => {
    expect(gridDistanceFeet(0, 0, 0, 1)).toBe(5)
  })

  it('returns 5 for diagonal cell (Chebyshev distance)', () => {
    expect(gridDistanceFeet(0, 0, 1, 1)).toBe(5)
  })

  it('returns 30 for 6 cells away', () => {
    expect(gridDistanceFeet(0, 0, 6, 0)).toBe(30)
  })

  it('handles negative coordinates', () => {
    expect(gridDistanceFeet(-2, -3, 2, 3)).toBe(30)
  })

  it('diagonal 3x3 is 15ft (Chebyshev)', () => {
    expect(gridDistanceFeet(0, 0, 3, 3)).toBe(15)
  })

  it('asymmetric distance uses max of dx/dy', () => {
    expect(gridDistanceFeet(0, 0, 2, 5)).toBe(25)
  })
})

describe('movementCostFeet', () => {
  it('returns base distance with no terrain', () => {
    expect(movementCostFeet(0, 0, 1, 0, [])).toBe(5)
  })

  it('doubles cost for water terrain without swim speed', () => {
    const terrain = [{ x: 1, y: 0, type: 'water' as const, movementCost: 1 }]
    expect(movementCostFeet(0, 0, 1, 0, terrain)).toBe(10)
  })

  it('normal cost for water terrain with swim speed', () => {
    const terrain = [{ x: 1, y: 0, type: 'water' as const, movementCost: 1 }]
    expect(movementCostFeet(0, 0, 1, 0, terrain, { hasSwimSpeed: true })).toBe(5)
  })

  it('doubles cost for climbing terrain without climb speed', () => {
    const terrain = [{ x: 1, y: 0, type: 'climbing' as const, movementCost: 1 }]
    expect(movementCostFeet(0, 0, 1, 0, terrain)).toBe(10)
  })

  it('normal cost for climbing terrain with climb speed', () => {
    const terrain = [{ x: 1, y: 0, type: 'climbing' as const, movementCost: 1 }]
    expect(movementCostFeet(0, 0, 1, 0, terrain, { hasClimbSpeed: true })).toBe(5)
  })

  it('applies custom movement cost multiplier', () => {
    const terrain = [{ x: 1, y: 0, type: 'difficult' as const, movementCost: 2 }]
    expect(movementCostFeet(0, 0, 1, 0, terrain)).toBe(10)
  })
})

describe('gridDistanceFeet with elevation', () => {
  it('returns horizontal distance when both at ground level', () => {
    expect(gridDistanceFeet(0, 0, 6, 0, 0, 0)).toBe(30)
  })

  it('returns purely vertical distance when same horizontal position', () => {
    // sqrt(0 + 30^2) = 30
    expect(gridDistanceFeet(0, 0, 0, 0, 0, 30)).toBe(30)
  })

  it('calculates 3D distance with elevation difference', () => {
    // Horizontal: 6 cells = 30ft, Vertical: 40ft
    // sqrt(30^2 + 40^2) = sqrt(900+1600) = sqrt(2500) = 50ft
    expect(gridDistanceFeet(0, 0, 6, 0, 0, 40)).toBe(50)
  })

  it('rounds to nearest 5ft increment', () => {
    // Horizontal: 3 cells = 15ft, Vertical: 20ft
    // sqrt(225 + 400) = sqrt(625) = 25ft
    expect(gridDistanceFeet(0, 0, 3, 0, 0, 20)).toBe(25)
  })

  it('minimum distance is 5ft', () => {
    // Very small distances still return 5ft minimum
    expect(gridDistanceFeet(0, 0, 0, 0, 0, 3)).toBe(5)
  })

  it('handles negative elevation (below ground)', () => {
    // Same as positive difference
    expect(gridDistanceFeet(0, 0, 0, 0, 0, -30)).toBe(30)
  })
})

describe('fallDamageDice', () => {
  it('returns 0 dice for 0 feet', () => {
    expect(fallDamageDice(0)).toBe(0)
  })

  it('returns 0 dice for less than 10 feet', () => {
    expect(fallDamageDice(5)).toBe(0)
  })

  it('returns 1d6 for 10 feet', () => {
    expect(fallDamageDice(10)).toBe(1)
  })

  it('returns 2d6 for 20 feet', () => {
    expect(fallDamageDice(20)).toBe(2)
  })

  it('returns 10d6 for 100 feet', () => {
    expect(fallDamageDice(100)).toBe(10)
  })

  it('caps at 20d6 for 200+ feet', () => {
    expect(fallDamageDice(200)).toBe(20)
    expect(fallDamageDice(500)).toBe(20)
  })
})

describe('isInMeleeRange with elevation', () => {
  it('tokens at same elevation within 5ft are in melee', () => {
    const a = makeToken({ gridX: 0, gridY: 0 })
    const b = makeToken({ id: 'tok-2', gridX: 1, gridY: 0 })
    expect(isInMeleeRange(a, b)).toBe(true)
  })

  it('tokens at different elevations may be out of melee range', () => {
    const a = makeToken({ gridX: 0, gridY: 0, elevation: 0 })
    const b = makeToken({ id: 'tok-2', gridX: 1, gridY: 0, elevation: 30 })
    // 3D distance: sqrt(5^2 + 30^2) = sqrt(925) ≈ 30.4ft → rounds to 30ft
    expect(isInMeleeRange(a, b, 5)).toBe(false)
  })

  it('elevated tokens within reach of long weapons', () => {
    const a = makeToken({ gridX: 0, gridY: 0, elevation: 0 })
    const b = makeToken({ id: 'tok-2', gridX: 1, gridY: 0, elevation: 5 })
    // 3D distance: sqrt(5^2 + 5^2) = sqrt(50) ≈ 7.07 → rounds to 5ft
    expect(isInMeleeRange(a, b, 10)).toBe(true)
  })
})

describe('checkRangedRange with elevation', () => {
  it('elevation does not change result for close targets', () => {
    const a = makeToken({ gridX: 0, gridY: 0, elevation: 0 })
    const b = makeToken({ id: 'tok-2', gridX: 4, gridY: 0, elevation: 0 })
    expect(checkRangedRange(a, b, 80, 320)).toBe('normal')
  })

  it('elevation puts target in long range', () => {
    const a = makeToken({ gridX: 0, gridY: 0, elevation: 0 })
    // Horizontal: 16 cells = 80ft, Vertical: 30ft
    // 3D: sqrt(6400 + 900) = sqrt(7300) ≈ 85.4 → rounds to 85ft (long range for 80/320)
    const b = makeToken({ id: 'tok-2', gridX: 16, gridY: 0, elevation: 30 })
    expect(checkRangedRange(a, b, 80, 320)).toBe('long')
  })
})

describe('gridDistanceFeetAlternate', () => {
  it('1 diagonal = 5ft', () => {
    expect(gridDistanceFeetAlternate(0, 0, 1, 1)).toBe(5)
  })

  it('2 diagonals = 15ft (5+10)', () => {
    expect(gridDistanceFeetAlternate(0, 0, 2, 2)).toBe(15)
  })

  it('3 diagonals = 20ft (5+10+5)', () => {
    expect(gridDistanceFeetAlternate(0, 0, 3, 3)).toBe(20)
  })

  it('4 diagonals = 30ft (5+10+5+10)', () => {
    expect(gridDistanceFeetAlternate(0, 0, 4, 4)).toBe(30)
  })

  it('pure cardinal movement unchanged', () => {
    expect(gridDistanceFeetAlternate(0, 0, 6, 0)).toBe(30)
    expect(gridDistanceFeetAlternate(0, 0, 0, 4)).toBe(20)
  })

  it('mixed movement: 3 diag + 2 straight = 30ft', () => {
    // 5 cells right, 3 cells down → 3 diag + 2 straight
    // diag cost: 5+10+5 = 20, straight: 2*5 = 10 → total 30
    expect(gridDistanceFeetAlternate(0, 0, 5, 3)).toBe(30)
  })
})

describe('getReachableCells with alternate diagonal', () => {
  it('standard mode: diagonal cells at 5ft each', () => {
    const cells = getReachableCells(5, 5, 5, [], 11, 11, undefined, 'standard')
    // All 8 neighbors at cost 5
    expect(cells.filter((c) => c.cost === 5).length).toBe(8)
  })

  it('alternate mode: first diagonal costs 5ft, second costs 10ft', () => {
    const cells = getReachableCells(5, 5, 15, [], 11, 11, undefined, 'alternate')
    // (6,6) at cost 5 (1st diagonal)
    const diag1 = cells.find((c) => c.x === 6 && c.y === 6)
    expect(diag1?.cost).toBe(5)
    // (7,7) at cost 15 (5 + 10, 2nd diagonal)
    const diag2 = cells.find((c) => c.x === 7 && c.y === 7)
    expect(diag2?.cost).toBe(15)
  })
})
