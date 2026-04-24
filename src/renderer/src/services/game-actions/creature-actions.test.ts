import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sound-manager', () => ({
  play: vi.fn()
}))

vi.mock('./broadcast-helpers', () => ({
  broadcastInitiativeSync: vi.fn(),
  broadcastTokenSync: vi.fn(),
  broadcastConditionSync: vi.fn()
}))

vi.mock('./dice-helpers', () => ({
  rollDiceFormula: vi.fn((formula: string) => {
    if (formula === '1d6') return { rolls: [4], total: 4 }
    if (formula === '1d20') return { rolls: [15], total: 15 }
    const m = formula.match(/^(\d+)d(\d+)/)
    const count = m ? parseInt(m[1], 10) : 1
    return { rolls: Array.from({ length: count }, () => 5), total: count * 5 }
  }),
  findTokensInArea: vi.fn(() => [])
}))

vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) => {
    return tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  })
}))

import { play as playSound } from '../sound-manager'
import { broadcastConditionSync, broadcastInitiativeSync } from './broadcast-helpers'
import {
  executeAddEntityCondition,
  executeAddToInitiative,
  executeApplyAreaEffect,
  executeAwardXp,
  executeEndInitiative,
  executeLoadEncounter,
  executeLongRest,
  executeNextTurn,
  executeRechargeRoll,
  executeRemoveEntityCondition,
  executeRemoveFromInitiative,
  executeSetNpcAttitude,
  executeShortRest,
  executeStartInitiative,
  executeTriggerLevelUp,
  executeUseLegendaryAction,
  executeUseLegendaryResistance
} from './creature-actions'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function makeGameStore(overrides?: Record<string, unknown>): GameStoreSnapshot {
  return {
    initiative: null,
    maps: [],
    activeMapId: null,
    conditions: [],
    round: 1,
    turnStates: {},
    startInitiative: vi.fn(),
    endInitiative: vi.fn(),
    nextTurn: vi.fn(),
    addToInitiative: vi.fn(),
    removeFromInitiative: vi.fn(),
    updateInitiativeEntry: vi.fn(),
    initTurnState: vi.fn(),
    addCondition: vi.fn(),
    removeCondition: vi.fn(),
    updateToken: vi.fn(),
    advanceTimeSeconds: vi.fn(),
    setRestTracking: vi.fn(),
    restTracking: null,
    ambientLight: 'bright',
    inGameTime: null,
    allies: [],
    enemies: [],
    places: [],
    updateSidebarEntry: vi.fn(),
    addSidebarEntry: vi.fn(),
    ...overrides
  } as unknown as GameStoreSnapshot
}

function makeStores(gameStoreOverrides?: Record<string, unknown>): StoreAccessors {
  const gameStore = makeGameStore(gameStoreOverrides)
  const sendMessage = vi.fn()
  const addChatMessage = vi.fn()
  return {
    getGameStore: () =>
      ({
        getState: () => gameStore
      }) as any,
    getLobbyStore: () =>
      ({
        getState: () => ({ players: [], addChatMessage })
      }) as any,
    getNetworkStore: () =>
      ({
        getState: () => ({ localPeerId: 'local', sendMessage })
      }) as any
  }
}

function makeActiveMap(overrides?: Record<string, unknown>): ActiveMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    width: 400,
    height: 400,
    grid: { cellSize: 40 },
    tokens: [
      {
        id: 't1',
        entityId: 'e1',
        entityType: 'enemy',
        label: 'Goblin',
        gridX: 0,
        gridY: 0,
        sizeX: 1,
        sizeY: 1,
        conditions: [],
        currentHP: 7,
        maxHP: 7
      },
      {
        id: 't2',
        entityId: 'e2',
        entityType: 'player',
        label: 'Fighter',
        gridX: 5,
        gridY: 5,
        sizeX: 1,
        sizeY: 1,
        conditions: [],
        walkSpeed: 30
      }
    ],
    ...overrides
  } as unknown as ActiveMap
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Initiative ──

describe('executeStartInitiative', () => {
  it('starts initiative with given entries', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap()
    const stores = makeStores()
    const action: DmAction = {
      action: 'start_initiative',
      entries: [
        { label: 'Fighter', roll: 18, modifier: 2, entityType: 'player' },
        { label: 'Goblin', roll: 8, modifier: 1, entityType: 'enemy' }
      ]
    }
    const result = executeStartInitiative(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
    expect(gameStore.startInitiative).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entityName: 'Fighter', roll: 18, total: 20, entityType: 'player' }),
        expect.objectContaining({ entityName: 'Goblin', roll: 8, total: 9, entityType: 'enemy' })
      ])
    )
    expect(broadcastInitiativeSync).toHaveBeenCalled()
  })

  it('throws when entries are empty', () => {
    const gameStore = makeGameStore()
    const stores = makeStores()
    const action: DmAction = { action: 'start_initiative', entries: [] }
    expect(() => executeStartInitiative(action, gameStore, undefined, stores)).toThrow('No initiative entries')
  })

  it('initializes turn state for each entry', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap()
    const stores = makeStores()
    const action: DmAction = {
      action: 'start_initiative',
      entries: [{ label: 'Fighter', roll: 15, modifier: 0, entityType: 'player' }]
    }
    executeStartInitiative(action, gameStore, activeMap, stores)
    expect(gameStore.initTurnState).toHaveBeenCalled()
  })
})

describe('executeAddToInitiative', () => {
  it('adds an entry to initiative', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap()
    const stores = makeStores()
    const action: DmAction = {
      action: 'add_to_initiative',
      label: 'Orc',
      roll: 12,
      modifier: 1,
      entityType: 'enemy'
    }
    const result = executeAddToInitiative(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
    expect(gameStore.addToInitiative).toHaveBeenCalledWith(expect.objectContaining({ entityName: 'Orc', total: 13 }))
    expect(broadcastInitiativeSync).toHaveBeenCalled()
  })
})

describe('executeNextTurn', () => {
  it('advances to the next turn', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [
          {
            id: 'i1',
            entityName: 'Fighter',
            total: 18,
            entityType: 'player',
            legendaryActions: null,
            rechargeAbilities: null
          },
          {
            id: 'i2',
            entityName: 'Goblin',
            total: 12,
            entityType: 'enemy',
            legendaryActions: null,
            rechargeAbilities: null
          }
        ]
      }
    })
    const stores = makeStores()
    const result = executeNextTurn({ action: 'next_turn' }, gameStore, undefined, stores)
    expect(result).toBe(true)
    expect(gameStore.nextTurn).toHaveBeenCalled()
    expect(broadcastInitiativeSync).toHaveBeenCalled()
  })

  it('throws when no initiative running', () => {
    const gameStore = makeGameStore()
    const stores = makeStores()
    expect(() => executeNextTurn({ action: 'next_turn' }, gameStore, undefined, stores)).toThrow(
      'No initiative running'
    )
  })

  it('resets legendary actions for the creature whose turn is starting', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [
          {
            id: 'i1',
            entityName: 'Fighter',
            total: 20,
            entityType: 'player',
            legendaryActions: null,
            rechargeAbilities: null
          },
          {
            id: 'i2',
            entityName: 'Dragon',
            total: 15,
            entityType: 'enemy',
            legendaryActions: { maximum: 3, used: 2 },
            rechargeAbilities: null
          }
        ]
      }
    })
    const stores = makeStores()
    executeNextTurn({ action: 'next_turn' }, gameStore, undefined, stores)
    expect(gameStore.updateInitiativeEntry).toHaveBeenCalledWith('i2', {
      legendaryActions: { maximum: 3, used: 0 }
    })
  })
})

describe('executeEndInitiative', () => {
  it('ends initiative', () => {
    const gameStore = makeGameStore()
    const stores = makeStores()
    const result = executeEndInitiative({ action: 'end_initiative' }, gameStore, undefined, stores)
    expect(result).toBe(true)
    expect(gameStore.endInitiative).toHaveBeenCalled()
    expect(broadcastInitiativeSync).toHaveBeenCalled()
  })
})

describe('executeRemoveFromInitiative', () => {
  it('removes an entry from initiative', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [{ id: 'i1', entityName: 'Goblin', total: 10 }]
      }
    })
    const stores = makeStores()
    const result = executeRemoveFromInitiative(
      { action: 'remove_from_initiative', label: 'Goblin' },
      gameStore,
      undefined,
      stores
    )
    expect(result).toBe(true)
    expect(gameStore.removeFromInitiative).toHaveBeenCalledWith('i1')
  })

  it('throws when no initiative running', () => {
    const gameStore = makeGameStore()
    const stores = makeStores()
    expect(() =>
      executeRemoveFromInitiative({ action: 'remove_from_initiative', label: 'Goblin' }, gameStore, undefined, stores)
    ).toThrow('No initiative running')
  })

  it('throws when entry not found', () => {
    const gameStore = makeGameStore({
      initiative: { round: 1, currentIndex: 0, entries: [] }
    })
    const stores = makeStores()
    expect(() =>
      executeRemoveFromInitiative({ action: 'remove_from_initiative', label: 'Missing' }, gameStore, undefined, stores)
    ).toThrow('Initiative entry not found')
  })
})

// ── Conditions ──

describe('executeAddEntityCondition', () => {
  it('adds a condition to a token', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap()
    const stores = makeStores()
    const action: DmAction = {
      action: 'add_entity_condition',
      entityLabel: 'Goblin',
      condition: 'poisoned',
      source: 'Poison Spray'
    }
    const result = executeAddEntityCondition(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
    expect(gameStore.addCondition).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'poisoned', entityName: 'Goblin' })
    )
  })

  it('throws when no active map', () => {
    const gameStore = makeGameStore()
    const stores = makeStores()
    expect(() =>
      executeAddEntityCondition(
        { action: 'add_condition', entityLabel: 'X', condition: 'stunned' },
        gameStore,
        undefined,
        stores
      )
    ).toThrow('No active map')
  })

  it('throws when token not found', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap({ tokens: [] })
    const stores = makeStores()
    expect(() =>
      executeAddEntityCondition(
        { action: 'add_condition', entityLabel: 'Missing', condition: 'stunned' },
        gameStore,
        activeMap,
        stores
      )
    ).toThrow('Token not found')
  })
})

describe('executeRemoveEntityCondition', () => {
  it('removes a condition from a token', () => {
    const gameStore = makeGameStore({
      conditions: [{ id: 'c1', entityId: 'e1', condition: 'poisoned' }]
    })
    const activeMap = makeActiveMap()
    const stores = makeStores()
    const action: DmAction = {
      action: 'remove_entity_condition',
      entityLabel: 'Goblin',
      condition: 'poisoned'
    }
    const result = executeRemoveEntityCondition(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
    expect(gameStore.removeCondition).toHaveBeenCalledWith('c1')
  })

  it('throws when condition not found on entity', () => {
    const gameStore = makeGameStore({ conditions: [] })
    const activeMap = makeActiveMap()
    const stores = makeStores()
    expect(() =>
      executeRemoveEntityCondition(
        { action: 'remove_condition', entityLabel: 'Goblin', condition: 'stunned' },
        gameStore,
        activeMap,
        stores
      )
    ).toThrow('Condition "stunned" not found')
  })
})

// ── Area Effects ──

describe('executeApplyAreaEffect', () => {
  it('returns true when no tokens in area', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap()
    const stores = makeStores()
    const action: DmAction = {
      action: 'apply_area_effect',
      originX: 50,
      originY: 50,
      radiusOrLength: 10,
      shape: 'sphere'
    }
    const result = executeApplyAreaEffect(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
  })

  it('throws when no active map', () => {
    const gameStore = makeGameStore()
    const stores = makeStores()
    expect(() =>
      executeApplyAreaEffect(
        { action: 'area_effect', originX: 0, originY: 0, radiusOrLength: 5, shape: 'sphere' },
        gameStore,
        undefined,
        stores
      )
    ).toThrow('No active map')
  })

  it('throws when missing origin/radius', () => {
    const gameStore = makeGameStore()
    const activeMap = makeActiveMap()
    const stores = makeStores()
    expect(() => executeApplyAreaEffect({ action: 'area_effect' }, gameStore, activeMap, stores)).toThrow(
      'Missing origin/radius'
    )
  })
})

// ── Legendary Actions & Resistances ──

describe('executeUseLegendaryAction', () => {
  it('uses a legendary action', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [{ id: 'i1', entityName: 'Dragon', total: 22, legendaryActions: { maximum: 3, used: 0 } }]
      }
    })
    const stores = makeStores()
    const action: DmAction = { action: 'use_legendary_action', entityLabel: 'Dragon', cost: 1 }
    const result = executeUseLegendaryAction(action, gameStore, undefined, stores)
    expect(result).toBe(true)
    expect(gameStore.updateInitiativeEntry).toHaveBeenCalledWith('i1', {
      legendaryActions: { maximum: 3, used: 1 }
    })
  })

  it('throws when entity has no legendary actions', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [{ id: 'i1', entityName: 'Goblin', total: 10, legendaryActions: null }]
      }
    })
    const stores = makeStores()
    expect(() =>
      executeUseLegendaryAction({ action: 'use_la', entityLabel: 'Goblin' }, gameStore, undefined, stores)
    ).toThrow('has no legendary actions')
  })

  it('throws when not enough legendary actions remaining', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [{ id: 'i1', entityName: 'Dragon', total: 22, legendaryActions: { maximum: 3, used: 3 } }]
      }
    })
    const stores = makeStores()
    expect(() =>
      executeUseLegendaryAction({ action: 'use_la', entityLabel: 'Dragon', cost: 1 }, gameStore, undefined, stores)
    ).toThrow('only 0 legendary actions remaining')
  })
})

describe('executeUseLegendaryResistance', () => {
  it('uses a legendary resistance', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [{ id: 'i1', entityName: 'Dragon', total: 22, legendaryResistances: { max: 3, remaining: 3 } }]
      }
    })
    const stores = makeStores()
    const result = executeUseLegendaryResistance(
      { action: 'use_lr', entityLabel: 'Dragon' },
      gameStore,
      undefined,
      stores
    )
    expect(result).toBe(true)
    expect(gameStore.updateInitiativeEntry).toHaveBeenCalledWith('i1', {
      legendaryResistances: { max: 3, remaining: 2 }
    })
  })

  it('throws when no legendary resistances remaining', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [{ id: 'i1', entityName: 'Dragon', total: 22, legendaryResistances: { max: 3, remaining: 0 } }]
      }
    })
    const stores = makeStores()
    expect(() =>
      executeUseLegendaryResistance({ action: 'use_lr', entityLabel: 'Dragon' }, gameStore, undefined, stores)
    ).toThrow('no legendary resistances remaining')
  })
})

// ── Recharge ──

describe('executeRechargeRoll', () => {
  it('rolls a recharge and updates abilities', () => {
    const gameStore = makeGameStore({
      initiative: {
        round: 1,
        currentIndex: 0,
        entries: [
          {
            id: 'i1',
            entityName: 'Dragon',
            total: 22,
            rechargeAbilities: [{ name: 'Fire Breath', rechargeOn: 5, available: false }]
          }
        ]
      }
    })
    const stores = makeStores()
    // Mock returns total=4, which is < 5, so should NOT recharge
    const result = executeRechargeRoll(
      { action: 'recharge_roll', entityLabel: 'Dragon', abilityName: 'Fire Breath', rechargeOn: 5 },
      gameStore,
      undefined,
      stores
    )
    expect(result).toBe(true)
    expect(gameStore.updateInitiativeEntry).toHaveBeenCalled()
  })

  it('throws when missing abilityName', () => {
    const gameStore = makeGameStore({
      initiative: { round: 1, currentIndex: 0, entries: [{ id: 'i1', entityName: 'Dragon', total: 22 }] }
    })
    const stores = makeStores()
    expect(() =>
      executeRechargeRoll(
        { action: 'recharge_roll', entityLabel: 'Dragon', rechargeOn: 5 },
        gameStore,
        undefined,
        stores
      )
    ).toThrow('Missing abilityName')
  })

  it('throws when entry not found', () => {
    const gameStore = makeGameStore({
      initiative: { round: 1, currentIndex: 0, entries: [] }
    })
    const stores = makeStores()
    expect(() =>
      executeRechargeRoll(
        { action: 'recharge_roll', entityLabel: 'Missing', abilityName: 'X', rechargeOn: 5 },
        gameStore,
        undefined,
        stores
      )
    ).toThrow('Initiative entry not found')
  })
})

// ── XP & Level-Up ──

describe('executeAwardXp', () => {
  it('plays xp-gain sound and broadcasts', () => {
    const stores = makeStores()
    const action: DmAction = {
      action: 'award_xp',
      characterNames: ['Fighter', 'Wizard'],
      amount: 200,
      reason: 'defeating goblins'
    }
    const result = executeAwardXp(action, makeGameStore(), undefined, stores)
    expect(result).toBe(true)
    expect(playSound).toHaveBeenCalledWith('xp-gain')
  })

  it('throws for empty character names', () => {
    expect(() =>
      executeAwardXp({ action: 'award_xp', characterNames: [], amount: 100 }, makeGameStore(), undefined, makeStores())
    ).toThrow('No character names')
  })

  it('throws for invalid XP amount', () => {
    expect(() =>
      executeAwardXp(
        { action: 'award_xp', characterNames: ['X'], amount: -5 },
        makeGameStore(),
        undefined,
        makeStores()
      )
    ).toThrow('Invalid XP amount')
  })
})

describe('executeTriggerLevelUp', () => {
  it('plays level-up sound and broadcasts', () => {
    const stores = makeStores()
    const result = executeTriggerLevelUp(
      { action: 'trigger_level_up', characterName: 'Fighter' },
      makeGameStore(),
      undefined,
      stores
    )
    expect(result).toBe(true)
    expect(playSound).toHaveBeenCalledWith('level-up')
  })

  it('throws for missing character name', () => {
    expect(() =>
      executeTriggerLevelUp({ action: 'trigger_level_up' }, makeGameStore(), undefined, makeStores())
    ).toThrow('Missing character name')
  })
})

// ── Resting ──

describe('executeShortRest', () => {
  it('advances time by 1 hour and broadcasts', () => {
    const gameStore = makeGameStore({ inGameTime: { totalSeconds: 36000 } })
    const stores = makeStores({ inGameTime: { totalSeconds: 39600 } })
    const action: DmAction = { action: 'short_rest', characterNames: ['Fighter'] }
    const result = executeShortRest(action, gameStore, undefined, stores)
    expect(result).toBe(true)
    expect(gameStore.advanceTimeSeconds).toHaveBeenCalledWith(3600)
    expect(gameStore.setRestTracking).toHaveBeenCalled()
  })

  it('throws for empty character names', () => {
    expect(() =>
      executeShortRest({ action: 'short_rest', characterNames: [] }, makeGameStore(), undefined, makeStores())
    ).toThrow('No character names')
  })
})

describe('executeLongRest', () => {
  it('advances time by 8 hours and broadcasts', () => {
    const gameStore = makeGameStore({
      conditions: [{ id: 'c1', entityId: 'e2', condition: 'exhaustion' }],
      inGameTime: { totalSeconds: 36000 }
    })
    const activeMap = makeActiveMap()
    const stores = makeStores({ inGameTime: { totalSeconds: 64800 } })
    const action: DmAction = { action: 'long_rest', characterNames: ['Fighter'] }
    const result = executeLongRest(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
    expect(gameStore.advanceTimeSeconds).toHaveBeenCalledWith(28800)
    // Should remove exhaustion from Fighter
    expect(gameStore.removeCondition).toHaveBeenCalledWith('c1')
    expect(broadcastConditionSync).toHaveBeenCalled()
  })

  it('throws for empty character names', () => {
    expect(() =>
      executeLongRest({ action: 'long_rest', characterNames: [] }, makeGameStore(), undefined, makeStores())
    ).toThrow('No character names')
  })
})

// ── Encounters ──

describe('executeLoadEncounter', () => {
  it('broadcasts encounter load message', () => {
    const stores = makeStores()
    const result = executeLoadEncounter(
      { action: 'load_encounter', encounterName: 'Goblin Ambush' },
      makeGameStore(),
      undefined,
      stores
    )
    expect(result).toBe(true)
  })

  it('throws for missing encounter name', () => {
    expect(() => executeLoadEncounter({ action: 'load_encounter' }, makeGameStore(), undefined, makeStores())).toThrow(
      'Missing encounter name'
    )
  })
})

// ── NPC Attitude ──

describe('executeSetNpcAttitude', () => {
  it('updates existing sidebar entry attitude', () => {
    const gameStore = makeGameStore({
      allies: [{ id: 'a1', name: 'Bartender', attitude: 'friendly' }],
      enemies: [],
      places: []
    })
    const result = executeSetNpcAttitude(
      { action: 'set_npc_attitude', npcName: 'Bartender', attitude: 'indifferent' },
      gameStore
    )
    expect(result).toBe(true)
    expect(gameStore.updateSidebarEntry).toHaveBeenCalledWith('allies', 'a1', { attitude: 'indifferent' })
  })

  it('adds new sidebar entry when NPC not found', () => {
    const gameStore = makeGameStore({
      allies: [],
      enemies: [],
      places: []
    })
    executeSetNpcAttitude({ action: 'set_npc_attitude', npcName: 'Stranger', attitude: 'hostile' }, gameStore)
    expect(gameStore.addSidebarEntry).toHaveBeenCalledWith(
      'enemies',
      expect.objectContaining({ name: 'Stranger', attitude: 'hostile' })
    )
  })

  it('adds friendly NPCs to allies category', () => {
    const gameStore = makeGameStore({
      allies: [],
      enemies: [],
      places: []
    })
    executeSetNpcAttitude({ action: 'set_npc_attitude', npcName: 'Guide', attitude: 'friendly' }, gameStore)
    expect(gameStore.addSidebarEntry).toHaveBeenCalledWith(
      'allies',
      expect.objectContaining({ name: 'Guide', attitude: 'friendly' })
    )
  })

  it('throws for missing npcName', () => {
    expect(() => executeSetNpcAttitude({ action: 'set_npc_attitude', attitude: 'friendly' }, makeGameStore())).toThrow(
      'Missing npcName'
    )
  })

  it('throws for invalid attitude', () => {
    expect(() =>
      executeSetNpcAttitude({ action: 'set_npc_attitude', npcName: 'NPC', attitude: 'neutral' }, makeGameStore())
    ).toThrow('Invalid attitude')
  })
})

// ── All exports ──

describe('creature-actions exports', () => {
  it('all exported functions are defined', () => {
    expect(typeof executeStartInitiative).toBe('function')
    expect(typeof executeAddToInitiative).toBe('function')
    expect(typeof executeNextTurn).toBe('function')
    expect(typeof executeEndInitiative).toBe('function')
    expect(typeof executeRemoveFromInitiative).toBe('function')
    expect(typeof executeAddEntityCondition).toBe('function')
    expect(typeof executeRemoveEntityCondition).toBe('function')
    expect(typeof executeApplyAreaEffect).toBe('function')
    expect(typeof executeUseLegendaryAction).toBe('function')
    expect(typeof executeUseLegendaryResistance).toBe('function')
    expect(typeof executeRechargeRoll).toBe('function')
    expect(typeof executeAwardXp).toBe('function')
    expect(typeof executeTriggerLevelUp).toBe('function')
    expect(typeof executeShortRest).toBe('function')
    expect(typeof executeLongRest).toBe('function')
    expect(typeof executeLoadEncounter).toBe('function')
    expect(typeof executeSetNpcAttitude).toBe('function')
  })
})
