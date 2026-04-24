import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapToken } from '../../../../types/map'
import { applyGrappleCondition, applyProneCondition, autoCalculateCover, executeGrappleSave } from './attack-handlers'

// ─── Mocks ────────────────────────────────────────────────────

const mockAddCondition = vi.fn()
const mockGameStore = {
  addCondition: mockAddCondition,
  round: 1,
  underwaterCombat: false,
  flankingEnabled: false,
  maps: [],
  activeMapId: 'map-1'
}

vi.mock('../../../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => mockGameStore)
  }
}))

vi.mock('../../../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({ players: [] }))
  }
}))

vi.mock('../../../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({ localPeerId: null }))
  }
}))

vi.mock('../../../../services/combat/combat-rules', () => ({
  unarmedStrikeDC: vi.fn((strScore: number, pb: number) => 8 + Math.floor((strScore - 10) / 2) + pb),
  getCoverACBonus: vi.fn(() => 0),
  getMasteryEffect: vi.fn(() => null),
  isInMeleeRange: vi.fn(() => true),
  isAdjacent: vi.fn(() => false)
}))

vi.mock('../../../../services/combat/cover-calculator', () => ({
  calculateCover: vi.fn(() => 'none')
}))

vi.mock('../../../../utils/damage', () => ({
  applyDamageToCharacter: vi.fn(() => ({
    tempHpLost: 0,
    hpLost: 5,
    remainingDamage: 0,
    effectiveDamage: 5,
    modifierDescription: null,
    reducedToZero: false,
    instantDeath: false
  }))
}))

vi.mock('../../dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('./attack-utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./attack-utils')>()
  return {
    ...original,
    rollD20: vi.fn(() => 12),
    rollDice: vi.fn(() => [4, 3])
  }
})

vi.mock('./attack-computations', () => ({
  getWeaponContext: vi.fn(() => ({
    isMelee: true,
    isRanged: false,
    isHeavy: false,
    isThrown: false,
    isCrossbow: false,
    isSpell: false
  }))
}))

// ─── Helpers ──────────────────────────────────────────────────

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'tok-1',
    entityId: 'ent-1',
    entityType: 'player',
    label: 'Ulfric',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    conditions: [],
    nameVisible: true,
    ...overrides
  } as MapToken
}

// ─── executeGrappleSave ───────────────────────────────────────

describe('executeGrappleSave', () => {
  const baseOpts = {
    character: { abilityScores: { strength: 16 }, name: 'Fighter' },
    profBonus: 3,
    unarmedMode: 'grapple' as const
  }

  it('returns an object with success and message fields', () => {
    const result = executeGrappleSave({ ...baseOpts, selectedTarget: makeToken() })
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('message')
  })

  it('produces success=true on natural 20 regardless of DC', async () => {
    const { rollD20 } = await import('./attack-utils')
    vi.mocked(rollD20).mockReturnValueOnce(20)
    const result = executeGrappleSave({ ...baseOpts, selectedTarget: makeToken({ saveMod: -100 }) })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Natural 20')
  })

  it('produces a failure message on natural 1', async () => {
    const { rollD20 } = await import('./attack-utils')
    vi.mocked(rollD20).mockReturnValueOnce(1)
    const result = executeGrappleSave({ ...baseOpts, selectedTarget: makeToken() })
    expect(result.message).toContain('Natural 1')
  })

  it('includes the target label in the result message', () => {
    const result = executeGrappleSave({ ...baseOpts, selectedTarget: makeToken({ label: 'Goblin' }) })
    expect(result.message).toContain('Goblin')
  })

  it('includes the unarmed mode in the result message', async () => {
    const { rollD20 } = await import('./attack-utils')
    vi.mocked(rollD20).mockReturnValueOnce(1)
    const result = executeGrappleSave({ ...baseOpts, selectedTarget: makeToken(), unarmedMode: 'shove' })
    expect(result.message).toContain('shove')
  })

  it('uses unarmedStrikeDC from combat-rules', async () => {
    const { unarmedStrikeDC } = await import('../../../../services/combat/combat-rules')
    executeGrappleSave({ ...baseOpts, selectedTarget: makeToken() })
    expect(unarmedStrikeDC).toHaveBeenCalledWith(16, 3)
  })
})

// ─── applyGrappleCondition ─────────────────────────────────────

describe('applyGrappleCondition', () => {
  beforeEach(() => {
    mockAddCondition.mockClear()
  })

  it('calls gameStore.addCondition with Grappled condition', () => {
    applyGrappleCondition('entity-99', 'Goblin', 'Fighter')
    expect(mockAddCondition).toHaveBeenCalledOnce()
    const arg = mockAddCondition.mock.calls[0][0]
    expect(arg.condition).toBe('Grappled')
  })

  it('sets entityId to the provided target entity id', () => {
    applyGrappleCondition('entity-99', 'Goblin', 'Fighter')
    const arg = mockAddCondition.mock.calls[0][0]
    expect(arg.entityId).toBe('entity-99')
  })

  it('sets entityName to the provided target label', () => {
    applyGrappleCondition('entity-99', 'Goblin', 'Fighter')
    const arg = mockAddCondition.mock.calls[0][0]
    expect(arg.entityName).toBe('Goblin')
  })

  it('sets source to the character name', () => {
    applyGrappleCondition('entity-99', 'Goblin', 'Fighter')
    const arg = mockAddCondition.mock.calls[0][0]
    expect(arg.source).toBe('Fighter')
  })

  it('sets duration to permanent', () => {
    applyGrappleCondition('entity-99', 'Goblin', 'Fighter')
    const arg = mockAddCondition.mock.calls[0][0]
    expect(arg.duration).toBe('permanent')
  })

  it('generates a unique id for the condition', () => {
    let counter = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => counter++)
    applyGrappleCondition('e1', 'A', 'B')
    applyGrappleCondition('e2', 'C', 'D')
    const id1 = mockAddCondition.mock.calls[0][0].id
    const id2 = mockAddCondition.mock.calls[1][0].id
    expect(id1).not.toBe(id2)
    vi.restoreAllMocks()
  })
})

// ─── applyProneCondition ──────────────────────────────────────

describe('applyProneCondition', () => {
  beforeEach(() => {
    mockAddCondition.mockClear()
  })

  it('calls gameStore.addCondition with Prone condition', () => {
    applyProneCondition('entity-50', 'Orc', 'Ranger')
    expect(mockAddCondition).toHaveBeenCalledOnce()
    const arg = mockAddCondition.mock.calls[0][0]
    expect(arg.condition).toBe('Prone')
  })

  it('sets entityId correctly', () => {
    applyProneCondition('entity-50', 'Orc', 'Ranger')
    expect(mockAddCondition.mock.calls[0][0].entityId).toBe('entity-50')
  })

  it('sets source to the character name', () => {
    applyProneCondition('entity-50', 'Orc', 'Ranger')
    expect(mockAddCondition.mock.calls[0][0].source).toBe('Ranger')
  })
})

// ─── autoCalculateCover ───────────────────────────────────────

describe('autoCalculateCover', () => {
  it('calls calculateCover and returns the result', async () => {
    const { calculateCover } = await import('../../../../services/combat/cover-calculator')
    vi.mocked(calculateCover).mockReturnValueOnce('half')
    const attacker = makeToken({ id: 'a' })
    const target = makeToken({ id: 'b' })
    const result = autoCalculateCover(attacker, target, [attacker, target])
    expect(calculateCover).toHaveBeenCalled()
    expect(result).toBe('half')
  })

  it('filters out attacker and target from allTokens before cover calc', async () => {
    const { calculateCover } = await import('../../../../services/combat/cover-calculator')
    vi.mocked(calculateCover).mockReturnValueOnce('none')
    const attacker = makeToken({ id: 'a' })
    const target = makeToken({ id: 'b' })
    const blocker = makeToken({ id: 'c' })
    autoCalculateCover(attacker, target, [attacker, target, blocker])
    const callArgs = vi.mocked(calculateCover).mock.calls.at(-1)!
    const tokensArg = callArgs[4] as MapToken[]
    expect(tokensArg.some((t) => t.id === 'a')).toBe(false)
    expect(tokensArg.some((t) => t.id === 'b')).toBe(false)
    expect(tokensArg.some((t) => t.id === 'c')).toBe(true)
  })
})
