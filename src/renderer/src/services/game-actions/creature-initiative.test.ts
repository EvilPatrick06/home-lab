import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock broadcast helpers
vi.mock('./broadcast-helpers', () => ({
  broadcastInitiativeSync: vi.fn()
}))

// Mock dice helpers
vi.mock('./dice-helpers', () => ({
  rollDiceFormula: vi.fn(() => ({ rolls: [4], total: 4 }))
}))

// Mock name resolver
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-0000' })

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeStores(overrides: Record<string, unknown> = {}): StoreAccessors {
  const sendMessage = vi.fn()
  const addChatMessage = vi.fn()
  return {
    getGameStore: vi.fn(() => ({
      getState: () => ({ initiative: null, ...overrides })
    })) as unknown as StoreAccessors['getGameStore'],
    getLobbyStore: vi.fn(() => ({
      getState: () => ({ addChatMessage })
    })) as unknown as StoreAccessors['getLobbyStore'],
    getNetworkStore: vi.fn(() => ({
      getState: () => ({ sendMessage })
    })) as unknown as StoreAccessors['getNetworkStore']
  }
}

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    initiative: null,
    round: 1,
    startInitiative: vi.fn(),
    addToInitiative: vi.fn(),
    nextTurn: vi.fn(),
    endInitiative: vi.fn(),
    removeFromInitiative: vi.fn(),
    updateInitiativeEntry: vi.fn(),
    initTurnState: vi.fn(),
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

function makeActiveMap(
  tokens: Array<{ id: string; entityId: string; label: string; walkSpeed?: number }> = []
): ActiveMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    tokens: tokens.map((t) => ({ walkSpeed: 30, ...t }))
  } as unknown as ActiveMap
}

describe('creature-initiative', () => {
  let stores: StoreAccessors

  beforeEach(() => {
    vi.clearAllMocks()
    stores = makeStores()
  })

  describe('executeStartInitiative', () => {
    it('starts initiative with provided entries', async () => {
      const { executeStartInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Fighter' }])
      const action: DmAction = {
        action: 'start_initiative',
        entries: [
          { label: 'Fighter', roll: 15, modifier: 2, entityType: 'player' },
          { label: 'Goblin', roll: 10, modifier: 1, entityType: 'enemy' }
        ]
      }

      const result = executeStartInitiative(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.startInitiative).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ entityName: 'Fighter', roll: 15, total: 17 }),
          expect.objectContaining({ entityName: 'Goblin', roll: 10, total: 11 })
        ])
      )
    })

    it('throws when entries array is empty', async () => {
      const { executeStartInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'start_initiative', entries: [] }
      expect(() => executeStartInitiative(action, gs, map, stores)).toThrow('No initiative entries')
    })

    it('throws when entries is not an array', async () => {
      const { executeStartInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'start_initiative', entries: 'bad' }
      expect(() => executeStartInitiative(action, gs, map, stores)).toThrow('No initiative entries')
    })

    it('initializes turn states for all entries', async () => {
      const { executeStartInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Wizard', walkSpeed: 25 }])
      const action: DmAction = {
        action: 'start_initiative',
        entries: [{ label: 'Wizard', roll: 12, modifier: 3, entityType: 'player' }]
      }

      executeStartInitiative(action, gs, map, stores)
      // Since resolveTokenByLabel finds the token, entityId should be 'e1'
      expect(gs.initTurnState).toHaveBeenCalled()
    })
  })

  describe('executeAddToInitiative', () => {
    it('adds a single entry to initiative', async () => {
      const { executeAddToInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Rogue' }])
      const action: DmAction = {
        action: 'add_to_initiative',
        label: 'Rogue',
        roll: 18,
        modifier: 4,
        entityType: 'player'
      }

      const result = executeAddToInitiative(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.addToInitiative).toHaveBeenCalledWith(
        expect.objectContaining({ entityName: 'Rogue', roll: 18, total: 22 })
      )
    })

    it('defaults entity type to enemy', async () => {
      const { executeAddToInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'add_to_initiative', label: 'Skeleton', roll: 8, modifier: 0 }

      executeAddToInitiative(action, gs, map, stores)
      expect(gs.addToInitiative).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'enemy' }))
    })
  })

  describe('executeNextTurn', () => {
    it('advances to the next turn', async () => {
      const { executeNextTurn } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [
            { id: 'i1', entityName: 'Fighter', isActive: true },
            { id: 'i2', entityName: 'Goblin', isActive: false }
          ],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'next_turn' }

      const result = executeNextTurn(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.nextTurn).toHaveBeenCalled()
    })

    it('throws if no initiative is running', async () => {
      const { executeNextTurn } = await import('./creature-initiative')
      const gs = makeGameStore({ initiative: null })
      const action: DmAction = { action: 'next_turn' }
      expect(() => executeNextTurn(action, gs, undefined, stores)).toThrow('No initiative running')
    })

    it('resets legendary actions for the next creature', async () => {
      const { executeNextTurn } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [
            { id: 'i1', entityName: 'Paladin', isActive: true },
            { id: 'i2', entityName: 'Dragon', isActive: false, legendaryActions: { maximum: 3, used: 2 } }
          ],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'next_turn' }

      executeNextTurn(action, gs, undefined, stores)
      expect(gs.updateInitiativeEntry).toHaveBeenCalledWith('i2', {
        legendaryActions: { maximum: 3, used: 0 }
      })
    })

    it('auto-rolls recharge abilities for enemy creatures', async () => {
      const { rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(rollDiceFormula).mockReturnValue({ rolls: [6], total: 6 })

      const { executeNextTurn } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [
            { id: 'i1', entityName: 'Paladin', isActive: true },
            {
              id: 'i2',
              entityName: 'Dragon',
              entityType: 'enemy',
              isActive: false,
              rechargeAbilities: [{ name: 'Fire Breath', rechargeOn: 5, available: false }]
            }
          ],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'next_turn' }

      executeNextTurn(action, gs, undefined, stores)
      expect(gs.updateInitiativeEntry).toHaveBeenCalledWith('i2', {
        rechargeAbilities: expect.arrayContaining([expect.objectContaining({ name: 'Fire Breath', available: true })])
      })
    })
  })

  describe('executeEndInitiative', () => {
    it('ends initiative and broadcasts', async () => {
      const { executeEndInitiative } = await import('./creature-initiative')
      const gs = makeGameStore()
      const action: DmAction = { action: 'end_initiative' }

      const result = executeEndInitiative(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.endInitiative).toHaveBeenCalled()
    })
  })

  describe('executeRemoveFromInitiative', () => {
    it('removes an entry by label', async () => {
      const { executeRemoveFromInitiative } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Goblin' }],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'remove_from_initiative', label: 'Goblin' }

      const result = executeRemoveFromInitiative(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.removeFromInitiative).toHaveBeenCalledWith('i1')
    })

    it('throws if initiative is not running', async () => {
      const { executeRemoveFromInitiative } = await import('./creature-initiative')
      const gs = makeGameStore({ initiative: null })
      const action: DmAction = { action: 'remove_from_initiative', label: 'X' }
      expect(() => executeRemoveFromInitiative(action, gs, undefined, stores)).toThrow('No initiative running')
    })

    it('throws if entry not found', async () => {
      const { executeRemoveFromInitiative } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: { entries: [{ id: 'i1', entityName: 'Orc' }], currentIndex: 0 }
      })
      const action: DmAction = { action: 'remove_from_initiative', label: 'Dragon' }
      expect(() => executeRemoveFromInitiative(action, gs, undefined, stores)).toThrow('Initiative entry not found')
    })
  })

  describe('executeUseLegendaryAction', () => {
    it('uses a legendary action', async () => {
      const { executeUseLegendaryAction } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Dragon', legendaryActions: { maximum: 3, used: 0 } }],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'use_legendary_action', entityLabel: 'Dragon', cost: 1 }

      const result = executeUseLegendaryAction(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.updateInitiativeEntry).toHaveBeenCalledWith('i1', {
        legendaryActions: { maximum: 3, used: 1 }
      })
    })

    it('throws if not enough legendary actions remain', async () => {
      const { executeUseLegendaryAction } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Dragon', legendaryActions: { maximum: 3, used: 3 } }],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'use_legendary_action', entityLabel: 'Dragon', cost: 1 }

      expect(() => executeUseLegendaryAction(action, gs, undefined, stores)).toThrow(
        'only 0 legendary actions remaining'
      )
    })

    it('throws if creature has no legendary actions', async () => {
      const { executeUseLegendaryAction } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Goblin' }],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'use_legendary_action', entityLabel: 'Goblin', cost: 1 }

      expect(() => executeUseLegendaryAction(action, gs, undefined, stores)).toThrow('has no legendary actions')
    })

    it('throws if no initiative running', async () => {
      const { executeUseLegendaryAction } = await import('./creature-initiative')
      const gs = makeGameStore({ initiative: null })
      const action: DmAction = { action: 'use_legendary_action', entityLabel: 'X' }
      expect(() => executeUseLegendaryAction(action, gs, undefined, stores)).toThrow('No initiative running')
    })
  })

  describe('executeUseLegendaryResistance', () => {
    it('uses a legendary resistance and decrements', async () => {
      const { executeUseLegendaryResistance } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Lich', legendaryResistances: { max: 3, remaining: 2 } }],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'use_legendary_resistance', entityLabel: 'Lich' }

      const result = executeUseLegendaryResistance(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.updateInitiativeEntry).toHaveBeenCalledWith('i1', {
        legendaryResistances: { max: 3, remaining: 1 }
      })
    })

    it('throws if no legendary resistances remaining', async () => {
      const { executeUseLegendaryResistance } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Lich', legendaryResistances: { max: 3, remaining: 0 } }],
          currentIndex: 0
        }
      })
      const action: DmAction = { action: 'use_legendary_resistance', entityLabel: 'Lich' }

      expect(() => executeUseLegendaryResistance(action, gs, undefined, stores)).toThrow(
        'no legendary resistances remaining'
      )
    })
  })

  describe('executeRechargeRoll', () => {
    it('rolls to recharge an ability', async () => {
      const { rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(rollDiceFormula).mockReturnValue({ rolls: [5], total: 5 })

      const { executeRechargeRoll } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [
            {
              id: 'i1',
              entityName: 'Dragon',
              rechargeAbilities: [{ name: 'Fire Breath', rechargeOn: 5, available: false }]
            }
          ],
          currentIndex: 0
        }
      })
      const action: DmAction = {
        action: 'recharge_roll',
        entityLabel: 'Dragon',
        abilityName: 'Fire Breath',
        rechargeOn: 5
      }

      const result = executeRechargeRoll(action, gs, undefined, stores)
      expect(result).toBe(true)
      expect(gs.updateInitiativeEntry).toHaveBeenCalledWith('i1', {
        rechargeAbilities: expect.arrayContaining([expect.objectContaining({ name: 'Fire Breath', available: true })])
      })
    })

    it('throws if no initiative running', async () => {
      const { executeRechargeRoll } = await import('./creature-initiative')
      const gs = makeGameStore({ initiative: null })
      const action: DmAction = { action: 'recharge_roll', entityLabel: 'X', abilityName: 'Y', rechargeOn: 5 }
      expect(() => executeRechargeRoll(action, gs, undefined, stores)).toThrow('No initiative running')
    })

    it('throws if abilityName or rechargeOn is missing', async () => {
      const { executeRechargeRoll } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: { entries: [{ id: 'i1', entityName: 'Dragon' }], currentIndex: 0 }
      })
      const action: DmAction = { action: 'recharge_roll', entityLabel: 'Dragon', abilityName: '', rechargeOn: 'bad' }
      expect(() => executeRechargeRoll(action, gs, undefined, stores)).toThrow('Missing abilityName or rechargeOn')
    })

    it('adds a new ability entry if one does not exist', async () => {
      const { rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(rollDiceFormula).mockReturnValue({ rolls: [3], total: 3 })

      const { executeRechargeRoll } = await import('./creature-initiative')
      const gs = makeGameStore({
        initiative: {
          entries: [{ id: 'i1', entityName: 'Hydra', rechargeAbilities: [] }],
          currentIndex: 0
        }
      })
      const action: DmAction = {
        action: 'recharge_roll',
        entityLabel: 'Hydra',
        abilityName: 'Acid Spit',
        rechargeOn: 5
      }

      executeRechargeRoll(action, gs, undefined, stores)
      expect(gs.updateInitiativeEntry).toHaveBeenCalledWith('i1', {
        rechargeAbilities: expect.arrayContaining([
          expect.objectContaining({ name: 'Acid Spit', rechargeOn: 5, available: false })
        ])
      })
    })
  })
})
