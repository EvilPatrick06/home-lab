import { describe, expect, it } from 'vitest'
import type { MapToken, WallSegment } from '../../types/map'
import { calculateCover, hasLineOfSight } from './cover-calculator'

const CELL = 40 // 40px per cell

function makeToken(gridX: number, gridY: number, overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: `tok-${gridX}-${gridY}`,
    entityId: `e-${gridX}-${gridY}`,
    entityType: 'player',
    label: 'Test',
    gridX,
    gridY,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

function makeWall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  type: 'solid' | 'door' | 'window' = 'solid',
  isOpen = false
): WallSegment {
  return { id: `wall-${x1}-${y1}`, x1, y1, x2, y2, type, isOpen }
}

describe('calculateCover', () => {
  it('returns none with no walls between tokens', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(3, 0)
    expect(calculateCover(attacker, target, [], CELL)).toBe('none')
  })

  it('returns total when wall fully blocks all lines', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(3, 0)
    // Vertical wall between them at x=2 from y=-1 to y=2 (fully blocks)
    const wall = makeWall(2, -1, 2, 3)
    expect(calculateCover(attacker, target, [wall], CELL)).toBe('total')
  })

  it('returns none for open doors', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(3, 0)
    const wall = makeWall(2, -1, 2, 3, 'door', true)
    expect(calculateCover(attacker, target, [wall], CELL)).toBe('none')
  })

  it('returns none for windows', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(3, 0)
    const wall = makeWall(2, -1, 2, 3, 'window')
    expect(calculateCover(attacker, target, [wall], CELL)).toBe('none')
  })

  it('closed door blocks like a wall', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(3, 0)
    const wall = makeWall(2, -1, 2, 3, 'door', false)
    expect(calculateCover(attacker, target, [wall], CELL)).toBe('total')
  })

  it('partial wall gives half or three-quarters cover', () => {
    const attacker = makeToken(0, 2)
    const target = makeToken(4, 2)
    // Wall at x=2, covering y=2 to y=3 (blocks bottom lines from any corner)
    const wall = makeWall(2, 2, 2, 3)
    const cover = calculateCover(attacker, target, [wall], CELL)
    // Should be half or three-quarters since some lines are blocked from every corner
    expect(['half', 'three-quarters']).toContain(cover)
  })

  it('creatures between attacker and target provide cover', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(4, 0)
    // Creature standing between them
    const blocker = makeToken(2, 0, { id: 'blocker' })
    const cover = calculateCover(attacker, target, [], CELL, [blocker])
    expect(cover).not.toBe('none')
  })

  it('creatures off the line do not provide cover', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(4, 0)
    // Creature well off to the side
    const bystander = makeToken(2, 5, { id: 'bystander' })
    const cover = calculateCover(attacker, target, [], CELL, [bystander])
    expect(cover).toBe('none')
  })

  it('large tokens have larger cover profiles', () => {
    const attacker = makeToken(0, 0)
    const target = makeToken(5, 0)
    // 2x2 large creature between them
    const largeBlocker = makeToken(3, 0, { id: 'large', sizeX: 2, sizeY: 2 })
    const cover = calculateCover(attacker, target, [], CELL, [largeBlocker])
    expect(cover).not.toBe('none')
  })
})

describe('hasLineOfSight', () => {
  it('returns true with no walls', () => {
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 100, y: 0 }, [], CELL)).toBe(true)
  })

  it('returns false when wall blocks', () => {
    const wall = makeWall(2, -1, 2, 3)
    expect(hasLineOfSight({ x: 20, y: 20 }, { x: 120, y: 20 }, [wall], CELL)).toBe(false)
  })

  it('returns true through open doors', () => {
    const wall = makeWall(2, -1, 2, 3, 'door', true)
    expect(hasLineOfSight({ x: 20, y: 20 }, { x: 120, y: 20 }, [wall], CELL)).toBe(true)
  })

  it('returns true through windows', () => {
    const wall = makeWall(2, -1, 2, 3, 'window')
    expect(hasLineOfSight({ x: 20, y: 20 }, { x: 120, y: 20 }, [wall], CELL)).toBe(true)
  })
})
