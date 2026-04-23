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
  broadcastTokenSync: vi.fn(),
  broadcastConditionSync: vi.fn()
}))

// Mock dice helpers
vi.mock('./dice-helpers', () => ({
  rollDiceFormula: vi.fn(() => ({ rolls: [15], total: 15 })),
  findTokensInArea: vi.fn(() => [])
}))

// Mock name resolver
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    conditions: [],
    round: 1,
    addCondition: vi.fn(),
    removeCondition: vi.fn(),
    updateToken: vi.fn(),
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

function makeStores(): StoreAccessors {
  const sendMessage = vi.fn()
  return {
    getGameStore: vi.fn(() => ({
      getState: () => ({ conditions: [] })
    })) as unknown as StoreAccessors['getGameStore'],
    getLobbyStore: vi.fn(() => ({
      getState: () => ({})
    })) as unknown as StoreAccessors['getLobbyStore'],
    getNetworkStore: vi.fn(() => ({
      getState: () => ({ sendMessage })
    })) as unknown as StoreAccessors['getNetworkStore']
  }
}

function makeActiveMap(
  tokens: Array<{
    id: string
    entityId: string
    label: string
    gridX?: number
    gridY?: number
    currentHP?: number
  }> = []
): ActiveMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    tokens: tokens.map((t) => ({ gridX: 0, gridY: 0, ...t }))
  } as unknown as ActiveMap
}

describe('creature-conditions', () => {
  let stores: StoreAccessors

  beforeEach(() => {
    vi.clearAllMocks()
    stores = makeStores()
  })

  describe('executeAddEntityCondition', () => {
    it('adds a condition to a token and broadcasts', async () => {
      const { executeAddEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Goblin' }])
      const action: DmAction = {
        action: 'add_entity_condition',
        entityLabel: 'Goblin',
        condition: 'Poisoned',
        duration: 3,
        source: 'Poison Spray'
      }

      const result = executeAddEntityCondition(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.addCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'e1',
          entityName: 'Goblin',
          condition: 'Poisoned',
          duration: 3,
          source: 'Poison Spray'
        })
      )
    })

    it('throws if no active map', async () => {
      const { executeAddEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'add_entity_condition', entityLabel: 'Goblin', condition: 'Stunned' }
      expect(() => executeAddEntityCondition(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if token not found', async () => {
      const { executeAddEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap([])
      const action: DmAction = { action: 'add_entity_condition', entityLabel: 'Ghost', condition: 'Frightened' }
      expect(() => executeAddEntityCondition(action, gs, map, stores)).toThrow('Token not found')
    })

    it('defaults to permanent duration if not specified', async () => {
      const { executeAddEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Orc' }])
      const action: DmAction = { action: 'add_entity_condition', entityLabel: 'Orc', condition: 'Blinded' }

      executeAddEntityCondition(action, gs, map, stores)
      expect(gs.addCondition).toHaveBeenCalledWith(expect.objectContaining({ duration: 'permanent' }))
    })

    it('defaults source to AI DM when not provided', async () => {
      const { executeAddEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Wolf' }])
      const action: DmAction = { action: 'add_entity_condition', entityLabel: 'Wolf', condition: 'Prone' }

      executeAddEntityCondition(action, gs, map, stores)
      expect(gs.addCondition).toHaveBeenCalledWith(expect.objectContaining({ source: 'AI DM' }))
    })

    it('emits plugin event when subscribers exist', async () => {
      const { pluginEventBus } = await import('../plugin-system/event-bus')
      vi.mocked(pluginEventBus.hasSubscribers).mockReturnValue(true)

      const { executeAddEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Rat' }])
      const action: DmAction = { action: 'add_entity_condition', entityLabel: 'Rat', condition: 'Charmed' }

      executeAddEntityCondition(action, gs, map, stores)
      expect(pluginEventBus.emit).toHaveBeenCalledWith(
        'entity:condition-added',
        expect.objectContaining({
          entityId: 'e1',
          condition: 'Charmed'
        })
      )
    })
  })

  describe('executeRemoveEntityCondition', () => {
    it('removes a condition from a token', async () => {
      const { executeRemoveEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore({
        conditions: [{ id: 'c1', entityId: 'e1', condition: 'Poisoned' }]
      })
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Goblin' }])
      const action: DmAction = { action: 'remove_entity_condition', entityLabel: 'Goblin', condition: 'Poisoned' }

      const result = executeRemoveEntityCondition(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.removeCondition).toHaveBeenCalledWith('c1')
    })

    it('throws if condition not found on entity', async () => {
      const { executeRemoveEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore({ conditions: [] })
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Goblin' }])
      const action: DmAction = { action: 'remove_entity_condition', entityLabel: 'Goblin', condition: 'Invisible' }

      expect(() => executeRemoveEntityCondition(action, gs, map, stores)).toThrow('Condition "Invisible" not found')
    })

    it('throws if no active map', async () => {
      const { executeRemoveEntityCondition } = await import('./creature-conditions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'remove_entity_condition', entityLabel: 'X', condition: 'Y' }
      expect(() => executeRemoveEntityCondition(action, gs, undefined, stores)).toThrow('No active map')
    })
  })

  describe('executeApplyAreaEffect', () => {
    it('throws if no active map', async () => {
      const { executeApplyAreaEffect } = await import('./creature-conditions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'apply_area_effect',
        originX: 0,
        originY: 0,
        radiusOrLength: 20,
        shape: 'sphere'
      }
      expect(() => executeApplyAreaEffect(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if origin or radius missing', async () => {
      const { executeApplyAreaEffect } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'apply_area_effect',
        originX: 'bad',
        originY: 0,
        radiusOrLength: 20,
        shape: 'sphere'
      }
      expect(() => executeApplyAreaEffect(action, gs, map, stores)).toThrow('Missing origin/radius')
    })

    it('returns true when no tokens are in the area', async () => {
      const { findTokensInArea } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([])

      const { executeApplyAreaEffect } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'apply_area_effect',
        originX: 5,
        originY: 5,
        radiusOrLength: 20,
        shape: 'sphere'
      }

      expect(executeApplyAreaEffect(action, gs, map, stores)).toBe(true)
    })

    it('applies damage and condition to tokens in area', async () => {
      const { findTokensInArea } = await import('./dice-helpers')
      const { rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([
        { id: 't1', entityId: 'e1', label: 'Goblin', gridX: 5, gridY: 5, currentHP: 20 } as never
      ])
      vi.mocked(rollDiceFormula).mockReturnValue({ rolls: [10], total: 10 })

      const { executeApplyAreaEffect } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'apply_area_effect',
        originX: 5,
        originY: 5,
        radiusOrLength: 20,
        shape: 'sphere',
        damageFormula: '3d6',
        condition: 'Prone'
      }

      const result = executeApplyAreaEffect(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.updateToken).toHaveBeenCalled()
      expect(gs.addCondition).toHaveBeenCalledWith(
        expect.objectContaining({ condition: 'Prone', source: 'Area Effect' })
      )
    })

    it('halves damage on successful save with halfOnSave', async () => {
      const { findTokensInArea, rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([
        { id: 't1', entityId: 'e1', label: 'Fighter', gridX: 0, gridY: 0, currentHP: 30 } as never
      ])
      // First call for save roll (succeeds with 18), second for damage
      vi.mocked(rollDiceFormula)
        .mockReturnValueOnce({ rolls: [18], total: 18 })
        .mockReturnValueOnce({ rolls: [5, 4, 3], total: 12 })

      const { executeApplyAreaEffect } = await import('./creature-conditions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'apply_area_effect',
        originX: 0,
        originY: 0,
        radiusOrLength: 15,
        shape: 'sphere',
        saveType: 'dexterity',
        saveDC: 15,
        damageFormula: '3d6',
        halfOnSave: true
      }

      executeApplyAreaEffect(action, gs, map, stores)
      // Damage should be halved: Math.floor(12 / 2) = 6, so newHP = 30 - 6 = 24
      expect(gs.updateToken).toHaveBeenCalledWith('map-1', 't1', { currentHP: 24 })
    })
  })
})
