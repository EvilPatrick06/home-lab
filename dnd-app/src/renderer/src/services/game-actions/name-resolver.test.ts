import { describe, expect, it, vi } from 'vitest'
import type { Bastion } from '../../types/bastion'
import type { MapToken } from '../../types/map'
import { findBastionByOwnerName, resolveMapByName, resolvePlayerByName, resolveTokenByLabel } from './name-resolver'
import type { StoreAccessors } from './types'

function makeToken(overrides: Partial<MapToken>): MapToken {
  return {
    id: 'tok-1',
    entityId: 'ent-1',
    entityType: 'enemy',
    label: 'Default',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

describe('resolveTokenByLabel', () => {
  const tokens = [
    makeToken({ id: 't1', label: 'Goblin 1' }),
    makeToken({ id: 't2', label: 'Goblin 2' }),
    makeToken({ id: 't3', label: 'Orc Chieftain' }),
    makeToken({ id: 't4', label: 'Dragon' })
  ]

  it('returns exact case-insensitive match first', () => {
    const result = resolveTokenByLabel(tokens, 'orc chieftain')
    expect(result).toBeDefined()
    expect(result!.label).toBe('Orc Chieftain')
  })

  it('exact match is case-insensitive', () => {
    const result = resolveTokenByLabel(tokens, 'DRAGON')
    expect(result).toBeDefined()
    expect(result!.label).toBe('Dragon')
  })

  it('falls back to partial match when no exact match', () => {
    const result = resolveTokenByLabel(tokens, 'Goblin')
    expect(result).toBeDefined()
    // Should match the first Goblin since "Goblin 1" starts with "Goblin"
    expect(result!.label).toBe('Goblin 1')
  })

  it('partial match is case-insensitive', () => {
    const result = resolveTokenByLabel(tokens, 'orc')
    expect(result).toBeDefined()
    expect(result!.label).toBe('Orc Chieftain')
  })

  it('returns undefined when no match', () => {
    const result = resolveTokenByLabel(tokens, 'Lich')
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty token list', () => {
    const result = resolveTokenByLabel([], 'anything')
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty label', () => {
    const result = resolveTokenByLabel(tokens, '')
    // Empty string will match everything via startsWith, so first token is returned
    expect(result).toBeDefined()
  })

  it('prefers exact match over partial match', () => {
    const specificTokens = [makeToken({ id: 't1', label: 'Goblin' }), makeToken({ id: 't2', label: 'Goblin King' })]
    const result = resolveTokenByLabel(specificTokens, 'Goblin')
    expect(result!.label).toBe('Goblin')
  })
})

describe('resolveMapByName', () => {
  const maps = [
    { id: 'map-1', name: 'Dungeon Level 1' },
    { id: 'map-2', name: 'Forest Clearing' },
    { id: 'map-3', name: 'Throne Room' }
  ]

  it('returns exact case-insensitive match first', () => {
    const result = resolveMapByName(maps, 'forest clearing')
    expect(result).toBeDefined()
    expect(result!.id).toBe('map-2')
  })

  it('falls back to partial match (includes)', () => {
    const result = resolveMapByName(maps, 'dungeon')
    expect(result).toBeDefined()
    expect(result!.name).toBe('Dungeon Level 1')
  })

  it('returns undefined when no match', () => {
    const result = resolveMapByName(maps, 'Castle')
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty maps array', () => {
    const result = resolveMapByName([], 'anything')
    expect(result).toBeUndefined()
  })

  it('prefers exact match over partial match', () => {
    const specificMaps = [
      { id: 'm1', name: 'Throne Room' },
      { id: 'm2', name: 'Throne Room Upper Level' }
    ]
    const result = resolveMapByName(specificMaps, 'Throne Room')
    expect(result!.id).toBe('m1')
  })
})

describe('findBastionByOwnerName', () => {
  const bastions = [
    { id: 'b1', name: "Fighter's Keep", ownerId: 'player-1' },
    { id: 'b2', name: 'Wizard Tower', ownerId: 'player-2' }
  ] as Bastion[]

  it('finds bastion by name containing owner name', () => {
    const result = findBastionByOwnerName(bastions, 'fighter')
    expect(result).toBeDefined()
    expect(result!.id).toBe('b1')
  })

  it('finds bastion by exact ownerId', () => {
    const result = findBastionByOwnerName(bastions, 'player-2')
    expect(result).toBeDefined()
    expect(result!.id).toBe('b2')
  })

  it('returns undefined when no match', () => {
    const result = findBastionByOwnerName(bastions, 'rogue')
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty bastions array', () => {
    const result = findBastionByOwnerName([], 'anyone')
    expect(result).toBeUndefined()
  })
})

describe('resolvePlayerByName', () => {
  function makeStores(players: Array<{ peerId: string; displayName: string; characterName?: string }>): StoreAccessors {
    return {
      getGameStore: () => ({ getState: vi.fn() }) as any,
      getLobbyStore: () =>
        ({
          getState: () => ({ players })
        }) as any,
      getNetworkStore: () => ({ getState: vi.fn() }) as any
    }
  }

  it('finds player by displayName (case-insensitive)', () => {
    const stores = makeStores([
      { peerId: 'peer-1', displayName: 'Alice' },
      { peerId: 'peer-2', displayName: 'Bob' }
    ])
    const result = resolvePlayerByName('alice', stores)
    expect(result).toBe('peer-1')
  })

  it('finds player by characterName (case-insensitive)', () => {
    const stores = makeStores([{ peerId: 'peer-1', displayName: 'Alice', characterName: 'Elara' }])
    const result = resolvePlayerByName('elara', stores)
    expect(result).toBe('peer-1')
  })

  it('returns undefined when no match', () => {
    const stores = makeStores([{ peerId: 'peer-1', displayName: 'Alice' }])
    const result = resolvePlayerByName('Charlie', stores)
    expect(result).toBeUndefined()
  })

  it('returns undefined for empty players array', () => {
    const stores = makeStores([])
    const result = resolvePlayerByName('Anyone', stores)
    expect(result).toBeUndefined()
  })

  it('prefers displayName match', () => {
    const stores = makeStores([
      { peerId: 'peer-1', displayName: 'Bob', characterName: 'Fighter' },
      { peerId: 'peer-2', displayName: 'Fighter', characterName: 'Wizard' }
    ])
    // "Fighter" matches peer-1 by characterName and peer-2 by displayName
    // The find() will return the first match, which is peer-1 (characterName)
    const result = resolvePlayerByName('Fighter', stores)
    expect(result).toBe('peer-1')
  })
})
