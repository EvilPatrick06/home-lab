import { describe, expect, it } from 'vitest'
import type { MapToken } from '../../types/map'
import { checkFlanking } from './flanking'

function makeToken(
  overrides: Partial<MapToken> & {
    id: string
    entityId: string
    entityType: 'player' | 'enemy' | 'npc'
    gridX: number
    gridY: number
  }
): MapToken {
  return {
    label: overrides.id,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  } as MapToken
}

describe('checkFlanking', () => {
  const noIncap = new Set<string>()

  it('returns ally name when two allies are on opposite sides of target', () => {
    // Attacker at (0,2), target at (2,2), ally at (4,2) — straight line through target
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 3, gridY: 2 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBe('b')
  })

  it('returns null when ally is on same side as attacker', () => {
    // Both attackers on left side of target
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 1, gridY: 3 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBeNull()
  })

  it('returns null when attacker is not adjacent to target', () => {
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 0, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 3, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 4, gridY: 2 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBeNull()
  })

  it('returns null when ally is not adjacent to target', () => {
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 5, gridY: 2 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBeNull()
  })

  it('returns null when ally is incapacitated', () => {
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 3, gridY: 2 })
    const incapIds = new Set(['eb'])
    const result = checkFlanking(attacker, target, [attacker, target, ally], incapIds)
    expect(result).toBeNull()
  })

  it('returns null when attacker is incapacitated', () => {
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 3, gridY: 2 })
    const incapIds = new Set(['ea'])
    const result = checkFlanking(attacker, target, [attacker, target, ally], incapIds)
    expect(result).toBeNull()
  })

  it('ignores tokens of different entity types', () => {
    // Ally is actually an enemy — shouldn't count for flanking with player attacker
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const enemyAlly = makeToken({ id: 'b', entityId: 'eb', entityType: 'enemy', gridX: 3, gridY: 2 })
    const result = checkFlanking(attacker, target, [attacker, target, enemyAlly], noIncap)
    expect(result).toBeNull()
  })

  it('works with diagonal flanking (NW/SE)', () => {
    // Attacker NW of target, ally SE of target
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 1 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 3, gridY: 3 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBe('b')
  })

  it('works with large (2x2) target token', () => {
    // Large target occupies (2,2) to (3,3), attacker at (1,2), ally at (4,2) — opposite sides
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'player', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'enemy', gridX: 2, gridY: 2, sizeX: 2, sizeY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'player', gridX: 4, gridY: 2 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBe('b')
  })

  it('enemies can flank players', () => {
    const attacker = makeToken({ id: 'a', entityId: 'ea', entityType: 'enemy', gridX: 1, gridY: 2 })
    const target = makeToken({ id: 't', entityId: 'et', entityType: 'player', gridX: 2, gridY: 2 })
    const ally = makeToken({ id: 'b', entityId: 'eb', entityType: 'enemy', gridX: 3, gridY: 2 })
    const result = checkFlanking(attacker, target, [attacker, target, ally], noIncap)
    expect(result).toBe('b')
  })
})
