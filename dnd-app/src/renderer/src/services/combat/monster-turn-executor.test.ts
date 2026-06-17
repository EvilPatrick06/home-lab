import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonsterStatBlock } from '../../types/monster'
import type { StoreAccessors } from '../game-actions/types'

// Mock the library-bound stat resolution + the next-turn executor (assert autoAdvance delegation).
const goblin = {
  id: 'goblin-warrior',
  name: 'Goblin Warrior',
  size: 'Small',
  type: 'Fey',
  ac: 15,
  hp: 7,
  speed: { walk: 30 },
  abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [
    {
      name: 'Scimitar',
      description: 'melee',
      attackType: 'melee',
      toHit: 4,
      reach: 5,
      damageDice: '1d6+2',
      damageType: 'slashing'
    }
  ]
} as unknown as MonsterStatBlock

vi.mock('../game/token-stats', () => ({
  lookupTokenStatBlock: vi.fn((id?: string) => (id === 'goblin-warrior' ? goblin : undefined)),
  getTokenStats: vi.fn(() => ({ ac: 13, maxHP: 20, libraryBacked: true })),
  getCreatureSaveMod: vi.fn(() => 1)
}))
const { nextTurnMock } = vi.hoisted(() => ({ nextTurnMock: vi.fn() }))
vi.mock('../game-actions/creature-initiative', () => ({ executeNextTurn: nextTurnMock }))

// 30E flavor-narration dependencies (mocked so the executor test can assert the dispatch).
const { sendMessageMock, aiEnabled } = vi.hoisted(() => ({ sendMessageMock: vi.fn(), aiEnabled: { value: false } }))
vi.mock('../../stores/use-ai-dm-store', () => ({
  useAiDmStore: { getState: () => ({ enabled: aiEnabled.value, sendMessage: sendMessageMock }) }
}))
vi.mock('../active-campaign-ref', () => ({ getActiveCampaignId: () => 'camp-1' }))
vi.mock('../ai-dm-routing', () => ({ buildPlayerRoster: () => ({ charIds: ['c1'], rosterText: '' }) }))
vi.mock('../../stores/use-lobby-store', () => ({ useLobbyStore: { getState: () => ({ players: [] }) } }))
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: { getState: () => ({ getActiveCampaign: () => ({ players: [] }) }) }
}))

import { buildMonsterTurnContext, runMonsterTurn } from './monster-turn-executor'

interface MapTokenLike {
  id: string
  entityId: string
  entityType: string
  label: string
  gridX: number
  gridY: number
  sizeX: number
  sizeY: number
  visibleToPlayers: boolean
  conditions: unknown[]
  currentHP: number
  maxHP: number
  ac: number
  monsterStatBlockId?: string
}

function makeStores(tokens: MapTokenLike[], monsterAutomation: unknown = null) {
  const map = { id: 'm1', width: 30, height: 30, wallSegments: [], terrain: [], grid: { type: 'square' }, tokens }
  const updateToken = vi.fn((_mapId: string, tokenId: string, updates: Record<string, unknown>) => {
    const t = map.tokens.find((x) => x.id === tokenId)
    if (t) Object.assign(t, updates)
  })
  const gameStore = {
    activeMapId: 'm1',
    maps: [map],
    turnStates: {},
    diagonalRule: 'standard',
    flankingEnabled: false,
    monsterAutomation,
    initiative: {
      round: 1,
      currentIndex: 0,
      entries: [{ id: 'ie1', entityId: 'g1', entityType: 'enemy', entityName: 'Goblin 1' }]
    },
    moveToken: vi.fn(),
    updateToken,
    useMovement: vi.fn(),
    useAction: vi.fn(),
    useBonusAction: vi.fn(),
    setDashing: vi.fn(),
    setDisengaging: vi.fn(),
    setDodging: vi.fn(),
    setConcentrating: vi.fn(),
    addCondition: vi.fn(),
    updateInitiativeEntry: vi.fn(),
    nextTurn: vi.fn()
  }
  const addChatMessage = vi.fn()
  const sendMessage = vi.fn()
  const stores = {
    getGameStore: () => ({ getState: () => gameStore }),
    getLobbyStore: () => ({ getState: () => ({ addChatMessage }) }),
    getNetworkStore: () => ({ getState: () => ({ sendMessage }) })
  } as unknown as StoreAccessors
  return { stores, gameStore, map, addChatMessage }
}

function tok(over: Partial<MapTokenLike> & { id: string; entityType: string }): MapTokenLike {
  return {
    entityId: over.id,
    label: over.id,
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    currentHP: 20,
    maxHP: 20,
    ac: 13,
    ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  aiEnabled.value = false
})

describe('runMonsterTurn (30B)', () => {
  it('resolves a goblin attack against an adjacent PC, spends the action, and posts a summary', () => {
    const goblinTok = tok({
      id: 'g1',
      entityType: 'enemy',
      label: 'Goblin 1',
      gridX: 5,
      gridY: 5,
      currentHP: 7,
      maxHP: 7,
      ac: 15,
      monsterStatBlockId: 'goblin-warrior'
    })
    const pc = tok({
      id: 'p1',
      entityType: 'player',
      label: 'Aria',
      gridX: 6,
      gridY: 5,
      currentHP: 20,
      maxHP: 20,
      ac: 13
    })
    const { stores, gameStore, map, addChatMessage } = makeStores([goblinTok, pc])

    const result = runMonsterTurn('Goblin 1', stores)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.attacksResolved).toBeGreaterThanOrEqual(1)
    expect(result.turnAdvanced).toBe(false)
    expect(gameStore.useAction).toHaveBeenCalledWith('g1')
    expect(addChatMessage).toHaveBeenCalled() // consolidated summary posted
    // HP either unchanged (miss) or reduced (hit), never increased, never negative.
    const pcHp = map.tokens.find((t) => t.id === 'p1')?.currentHP ?? 0
    expect(pcHp).toBeGreaterThanOrEqual(0)
    expect(pcHp).toBeLessThanOrEqual(20)
    expect(result.damageDealt).toBe(20 - pcHp)
  })

  it('advances the turn when autoAdvance is set', () => {
    const goblinTok = tok({
      id: 'g1',
      entityType: 'enemy',
      label: 'Goblin 1',
      gridX: 5,
      gridY: 5,
      currentHP: 7,
      maxHP: 7,
      ac: 15,
      monsterStatBlockId: 'goblin-warrior'
    })
    const pc = tok({ id: 'p1', entityType: 'player', label: 'Aria', gridX: 6, gridY: 5 })
    const { stores } = makeStores([goblinTok, pc])
    const result = runMonsterTurn('Goblin 1', stores, { autoAdvance: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.turnAdvanced).toBe(true)
    expect(nextTurnMock).toHaveBeenCalled()
  })

  it('returns an error and mutates nothing for a token without a stat block', () => {
    const plain = tok({ id: 'g1', entityType: 'enemy', label: 'Goblin 1', gridX: 5, gridY: 5 }) // no monsterStatBlockId
    const pc = tok({ id: 'p1', entityType: 'player', label: 'Aria', gridX: 6, gridY: 5 })
    const { stores, gameStore } = makeStores([plain, pc])
    const result = runMonsterTurn('Goblin 1', stores)
    expect('error' in result).toBe(true)
    expect(gameStore.useAction).not.toHaveBeenCalled()
    expect(gameStore.updateToken).not.toHaveBeenCalled()
  })

  it('dispatches a [RESOLVED COMBAT TURN] flavor request when flavorNarration + AI DM are on', () => {
    aiEnabled.value = true
    const goblinTok = tok({
      id: 'g1',
      entityType: 'enemy',
      label: 'Goblin 1',
      gridX: 5,
      gridY: 5,
      currentHP: 7,
      maxHP: 7,
      ac: 15,
      monsterStatBlockId: 'goblin-warrior'
    })
    const pc = tok({ id: 'p1', entityType: 'player', label: 'Aria', gridX: 6, gridY: 5 })
    const { stores } = makeStores([goblinTok, pc], {
      autoRun: false,
      autoRunMaxInt: 7,
      autoAdvance: false,
      flavorNarration: true
    })
    runMonsterTurn('Goblin 1', stores)
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock.mock.calls[0][1]).toContain('[RESOLVED COMBAT TURN]')
  })

  it('never dispatches flavor when the AI DM is disabled', () => {
    aiEnabled.value = false
    const goblinTok = tok({
      id: 'g1',
      entityType: 'enemy',
      label: 'Goblin 1',
      gridX: 5,
      gridY: 5,
      currentHP: 7,
      maxHP: 7,
      ac: 15,
      monsterStatBlockId: 'goblin-warrior'
    })
    const pc = tok({ id: 'p1', entityType: 'player', label: 'Aria', gridX: 6, gridY: 5 })
    const { stores } = makeStores([goblinTok, pc], {
      autoRun: false,
      autoRunMaxInt: 7,
      autoAdvance: false,
      flavorNarration: true
    })
    runMonsterTurn('Goblin 1', stores)
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('buildMonsterTurnContext pre-hydrates ac/maxHP onto context tokens', () => {
    const goblinTok = tok({
      id: 'g1',
      entityType: 'enemy',
      label: 'Goblin 1',
      gridX: 5,
      gridY: 5,
      monsterStatBlockId: 'goblin-warrior'
    })
    const pc = tok({ id: 'p1', entityType: 'player', label: 'Aria', gridX: 6, gridY: 5 })
    const { stores } = makeStores([goblinTok, pc])
    const ctx = buildMonsterTurnContext('Goblin 1', stores)
    expect('error' in ctx).toBe(false)
    if ('error' in ctx) return
    expect(ctx.statBlock.name).toBe('Goblin Warrior')
    expect(ctx.tokens.every((t) => typeof t.ac === 'number')).toBe(true)
  })
})
