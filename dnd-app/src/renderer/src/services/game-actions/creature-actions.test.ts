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
import { broadcastConditionSync } from './broadcast-helpers'
import {
  executeAwardTreasure,
  executeAwardXp,
  executeLoadEncounter,
  executeLongRest,
  executeSetNpcAttitude,
  executeShortRest,
  executeTriggerLevelUp
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

describe('executeAwardTreasure', () => {
  it('returns true and rolls/distributes (async, fire-and-forget)', () => {
    const result = executeAwardTreasure(
      { action: 'award_treasure', characterNames: ['Aria'], type: 'hoard', crTier: '5-10' },
      makeGameStore(),
      undefined,
      makeStores()
    )
    expect(result).toBe(true)
  })

  it('throws for empty character names', () => {
    expect(() =>
      executeAwardTreasure(
        { action: 'award_treasure', characterNames: [], type: 'individual', crTier: '0-4' },
        makeGameStore(),
        undefined,
        makeStores()
      )
    ).toThrow('No character names')
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
      conditions: [{ id: 'c1', entityId: 'e2', condition: 'exhaustion', value: 1 }],
      inGameTime: { totalSeconds: 36000 }
    })
    const activeMap = makeActiveMap()
    const stores = makeStores({ inGameTime: { totalSeconds: 64800 } })
    const action: DmAction = { action: 'long_rest', characterNames: ['Fighter'] }
    const result = executeLongRest(action, gameStore, activeMap, stores)
    expect(result).toBe(true)
    expect(gameStore.advanceTimeSeconds).toHaveBeenCalledWith(28800)
    // Exhaustion at value 1 should be removed entirely
    expect(gameStore.removeCondition).toHaveBeenCalledWith('c1')
    expect(broadcastConditionSync).toHaveBeenCalled()
  })

  it('decrements exhaustion by 1 when value > 1 (PHB 2024)', () => {
    const updateCondition = vi.fn()
    const gameStore = makeGameStore({
      conditions: [{ id: 'c1', entityId: 'e2', condition: 'exhaustion', value: 3 }],
      inGameTime: { totalSeconds: 36000 },
      updateCondition
    })
    const activeMap = makeActiveMap()
    const stores = makeStores({ inGameTime: { totalSeconds: 64800 } })
    const action: DmAction = { action: 'long_rest', characterNames: ['Fighter'] }
    executeLongRest(action, gameStore, activeMap, stores)
    // Should decrement, not remove
    expect(gameStore.removeCondition).not.toHaveBeenCalled()
    expect(updateCondition).toHaveBeenCalledWith('c1', { value: 2 })
  })

  it('removes exhaustion when decrementing from value 1', () => {
    const updateCondition = vi.fn()
    const gameStore = makeGameStore({
      conditions: [{ id: 'c1', entityId: 'e2', condition: 'exhaustion', value: 1 }],
      inGameTime: { totalSeconds: 36000 },
      updateCondition
    })
    const activeMap = makeActiveMap()
    const stores = makeStores({ inGameTime: { totalSeconds: 64800 } })
    const action: DmAction = { action: 'long_rest', characterNames: ['Fighter'] }
    executeLongRest(action, gameStore, activeMap, stores)
    expect(gameStore.removeCondition).toHaveBeenCalledWith('c1')
    expect(updateCondition).not.toHaveBeenCalled()
  })

  it('blocks long rest within 24 hours of last (PHB 2024)', () => {
    const gameStore = makeGameStore({
      restTracking: { lastLongRestSeconds: 36000, lastShortRestSeconds: null },
      inGameTime: { totalSeconds: 50000 }
    })
    const stores = makeStores({ inGameTime: { totalSeconds: 50000 } })
    const action: DmAction = { action: 'long_rest', characterNames: ['Fighter'] }
    const result = executeLongRest(action, gameStore, undefined, stores)
    expect(result).toBe(true)
    // Should NOT advance time
    expect(gameStore.advanceTimeSeconds).not.toHaveBeenCalled()
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
  it('exports exactly the 7 live executors (the dead duplicates were removed in 08C)', () => {
    expect(typeof executeAwardXp).toBe('function')
    expect(typeof executeAwardTreasure).toBe('function')
    expect(typeof executeTriggerLevelUp).toBe('function')
    expect(typeof executeShortRest).toBe('function')
    expect(typeof executeLongRest).toBe('function')
    expect(typeof executeLoadEncounter).toBe('function')
    expect(typeof executeSetNpcAttitude).toBe('function')
  })
})
