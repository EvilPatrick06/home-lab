import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock plugin event bus
vi.mock('../plugin-system/event-bus', () => ({
  pluginEventBus: {
    hasSubscribers: vi.fn(() => false),
    emit: vi.fn()
  }
}))

// Mock broadcast helpers
vi.mock('./broadcast-helpers', () => ({
  broadcastTokenSync: vi.fn()
}))

// Mock name resolver
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))

// Mock data-provider (lazy-loaded by ensureMonsterCache)
vi.mock('../data-provider', () => ({
  load5eMonsters: vi.fn(() =>
    Promise.resolve([
      {
        id: 'goblin-1',
        name: 'Goblin',
        size: 'Small',
        hp: 7,
        ac: 15,
        speed: { walk: 30 },
        abilityScores: { dex: 14 },
        resistances: [],
        vulnerabilities: [],
        damageImmunities: [],
        senses: { darkvision: 60 }
      }
    ])
  )
}))

// Mock getSizeTokenDimensions
vi.mock('../../types/monster', () => ({
  getSizeTokenDimensions: vi.fn((size: string) => {
    if (size === 'Small' || size === 'Medium') return { x: 1, y: 1 }
    if (size === 'Large') return { x: 2, y: 2 }
    if (size === 'Huge') return { x: 3, y: 3 }
    return { x: 1, y: 1 }
  })
}))

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-token' })

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeStores(): StoreAccessors {
  const sendMessage = vi.fn()
  return {
    getGameStore: vi.fn(() => ({ getState: vi.fn() })) as unknown as StoreAccessors['getGameStore'],
    getLobbyStore: vi.fn(() => ({ getState: vi.fn() })) as unknown as StoreAccessors['getLobbyStore'],
    getNetworkStore: vi.fn(() => ({
      getState: () => ({ sendMessage })
    })) as unknown as StoreAccessors['getNetworkStore']
  }
}

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    addToken: vi.fn(),
    moveToken: vi.fn(),
    removeToken: vi.fn(),
    updateToken: vi.fn(),
    initiative: null,
    initTurnState: vi.fn(),
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

function makeActiveMap(
  tokens: Array<{
    id: string
    entityId: string
    label: string
    gridX?: number
    gridY?: number
    maxHP?: number
    currentHP?: number
  }> = []
): ActiveMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    tokens: tokens.map((t) => ({ gridX: 0, gridY: 0, ...t }))
  } as unknown as ActiveMap
}

describe('token-actions', () => {
  let stores: StoreAccessors

  beforeEach(() => {
    vi.clearAllMocks()
    stores = makeStores()
  })

  describe('executePlaceToken', () => {
    it('places a token on the map', async () => {
      const { executePlaceToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'place_token',
        label: 'Skeleton',
        gridX: 5,
        gridY: 10,
        entityType: 'enemy',
        hp: 13,
        ac: 13
      }

      const result = executePlaceToken(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.addToken).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({
          label: 'Skeleton',
          gridX: 5,
          gridY: 10,
          entityType: 'enemy',
          currentHP: 13,
          maxHP: 13,
          ac: 13
        })
      )
    })

    it('throws if no active map', async () => {
      const { executePlaceToken } = await import('./token-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'place_token', label: 'X', gridX: 0, gridY: 0 }
      expect(() => executePlaceToken(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if gridX or gridY missing', async () => {
      const { executePlaceToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'place_token', label: 'X' }
      expect(() => executePlaceToken(action, gs, map, stores)).toThrow('Missing gridX/gridY')
    })

    it('initializes turn state if initiative is running', async () => {
      const { executePlaceToken } = await import('./token-actions')
      const gs = makeGameStore({ initiative: { entries: [], currentIndex: 0 } })
      const map = makeActiveMap()
      const action: DmAction = { action: 'place_token', label: 'Guard', gridX: 1, gridY: 1, speed: 30 }

      executePlaceToken(action, gs, map, stores)
      expect(gs.initTurnState).toHaveBeenCalled()
    })

    it('emits plugin event when subscribers exist', async () => {
      const { pluginEventBus } = await import('../plugin-system/event-bus')
      vi.mocked(pluginEventBus.hasSubscribers).mockReturnValue(true)

      const { executePlaceToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'place_token', label: 'Orc', gridX: 3, gridY: 3 }

      executePlaceToken(action, gs, map, stores)
      expect(pluginEventBus.emit).toHaveBeenCalledWith(
        'map:token-placed',
        expect.objectContaining({ label: 'Orc', gridX: 3, gridY: 3 })
      )
    })
  })

  describe('executeMoveToken', () => {
    it('moves a token to new coordinates', async () => {
      const { executeMoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Fighter', gridX: 0, gridY: 0 }])
      const action: DmAction = { action: 'move_token', label: 'Fighter', gridX: 5, gridY: 8 }

      const result = executeMoveToken(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.moveToken).toHaveBeenCalledWith('map-1', 't1', 5, 8)
    })

    it('throws if token not found', async () => {
      const { executeMoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'move_token', label: 'Ghost', gridX: 1, gridY: 1 }
      expect(() => executeMoveToken(action, gs, map, stores)).toThrow('Token not found')
    })

    it('throws if no active map', async () => {
      const { executeMoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'move_token', label: 'X', gridX: 0, gridY: 0 }
      expect(() => executeMoveToken(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if gridX/gridY not numbers', async () => {
      const { executeMoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Fighter' }])
      const action: DmAction = { action: 'move_token', label: 'Fighter', gridX: 'a', gridY: 'b' }
      expect(() => executeMoveToken(action, gs, map, stores)).toThrow('Missing gridX/gridY')
    })
  })

  describe('executeRemoveToken', () => {
    it('removes a token from the map', async () => {
      const { executeRemoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Goblin' }])
      const action: DmAction = { action: 'remove_token', label: 'Goblin' }

      const result = executeRemoveToken(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.removeToken).toHaveBeenCalledWith('map-1', 't1')
    })

    it('throws if token not found', async () => {
      const { executeRemoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'remove_token', label: 'Phantom' }
      expect(() => executeRemoveToken(action, gs, map, stores)).toThrow('Token not found')
    })

    it('emits plugin event when subscribers exist', async () => {
      const { pluginEventBus } = await import('../plugin-system/event-bus')
      vi.mocked(pluginEventBus.hasSubscribers).mockReturnValue(true)

      const { executeRemoveToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Orc' }])
      const action: DmAction = { action: 'remove_token', label: 'Orc' }

      executeRemoveToken(action, gs, map, stores)
      expect(pluginEventBus.emit).toHaveBeenCalledWith(
        'map:token-removed',
        expect.objectContaining({ tokenId: 't1', label: 'Orc' })
      )
    })
  })

  describe('executeUpdateToken', () => {
    it('updates token HP, AC, conditions, and visibility', async () => {
      const { executeUpdateToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Bandit', maxHP: 20, currentHP: 20 }])
      const action: DmAction = {
        action: 'update_token',
        label: 'Bandit',
        hp: 10,
        ac: 14,
        conditions: ['Poisoned'],
        visibleToPlayers: false
      }

      const result = executeUpdateToken(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.updateToken).toHaveBeenCalledWith(
        'map-1',
        't1',
        expect.objectContaining({
          currentHP: 10,
          ac: 14,
          conditions: ['Poisoned'],
          visibleToPlayers: false
        })
      )
    })

    it('updates maxHP if new HP exceeds current maxHP', async () => {
      const { executeUpdateToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Troll', maxHP: 50 }])
      const action: DmAction = { action: 'update_token', label: 'Troll', hp: 60 }

      executeUpdateToken(action, gs, map, stores)
      expect(gs.updateToken).toHaveBeenCalledWith(
        'map-1',
        't1',
        expect.objectContaining({
          currentHP: 60,
          maxHP: 60
        })
      )
    })

    it('supports renaming via label_new', async () => {
      const { executeUpdateToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Unknown' }])
      const action: DmAction = { action: 'update_token', label: 'Unknown', label_new: 'Dragon' }

      executeUpdateToken(action, gs, map, stores)
      expect(gs.updateToken).toHaveBeenCalledWith(
        'map-1',
        't1',
        expect.objectContaining({
          label: 'Dragon'
        })
      )
    })

    it('throws if no active map', async () => {
      const { executeUpdateToken } = await import('./token-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'update_token', label: 'X' }
      expect(() => executeUpdateToken(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if token not found', async () => {
      const { executeUpdateToken } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'update_token', label: 'Nonexistent' }
      expect(() => executeUpdateToken(action, gs, map, stores)).toThrow('Token not found')
    })
  })

  describe('executePlaceCreature', () => {
    it('throws if no active map', async () => {
      const { executePlaceCreature } = await import('./token-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'place_creature', creatureName: 'Goblin', gridX: 0, gridY: 0 }
      expect(() => executePlaceCreature(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if neither creatureName nor creatureId is provided', async () => {
      const { executePlaceCreature } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'place_creature', creatureName: '', gridX: 0, gridY: 0 }
      expect(() => executePlaceCreature(action, gs, map, stores)).toThrow('Missing creatureName or creatureId')
    })

    it('throws if gridX/gridY missing', async () => {
      const { executePlaceCreature } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'place_creature', creatureName: 'Goblin' }
      expect(() => executePlaceCreature(action, gs, map, stores)).toThrow('Missing gridX/gridY')
    })

    it('falls back to basic token if creature not in monster cache', async () => {
      const { executePlaceCreature } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'place_creature',
        creatureName: 'Custom Monster',
        gridX: 3,
        gridY: 4,
        hp: 50,
        ac: 18
      }

      const result = executePlaceCreature(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.addToken).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({
          label: 'Custom Monster',
          gridX: 3,
          gridY: 4,
          currentHP: 50,
          ac: 18
        })
      )
    })

    it('accepts creatureId when placing a creature', async () => {
      const { executePlaceCreature } = await import('./token-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'place_creature',
        creatureId: 'goblin-1',
        label: 'Goblin Scout',
        gridX: 2,
        gridY: 2
      }

      const result = executePlaceCreature(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.addToken).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({
          label: 'Goblin Scout',
          gridX: 2,
          gridY: 2
        })
      )
    })
  })
})
