import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the game store
const mockAddCondition = vi.fn()
const mockAddCombatLogEntry = vi.fn()
vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      round: 1,
      addCondition: mockAddCondition,
      addCombatLogEntry: mockAddCombatLogEntry
    }))
  }
}))

// Mock lobby store (used by combat-log broadcastCombatResult)
vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      addChatMessage: vi.fn()
    }))
  }
}))

// Mock network store
vi.mock('../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      isHost: false,
      broadcastMessage: vi.fn()
    }))
  }
}))

// Mock dice service with controllable outputs
let mockD20Result = 10
vi.mock('../dice/dice-service', () => ({
  rollD20: vi.fn((bonus: number, _opts?: any) => ({
    formula: `1d20+${bonus}`,
    rolls: [mockD20Result],
    total: mockD20Result + bonus,
    natural20: mockD20Result === 20,
    natural1: mockD20Result === 1
  }))
}))

// Mock combat-rules functions
vi.mock('./combat-rules', () => ({
  canGrappleOrShove: vi.fn(() => true),
  unarmedStrikeDC: vi.fn((strScore: number, profBonus: number) => {
    const strMod = Math.floor((strScore - 10) / 2)
    return 8 + strMod + profBonus
  })
}))

// Mock combat-log
vi.mock('./combat-log', () => ({
  logCombatEntry: vi.fn(),
  broadcastCombatResult: vi.fn()
}))

import type { MapToken } from '../../types/map'
import { canGrappleOrShove } from './combat-rules'
import type { GrappleRequest, ShoveRequest } from './grapple-shove-resolver'
import { resolveGrapple, resolveShove } from './grapple-shove-resolver'

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'tok-1',
    entityId: 'e-1',
    entityType: 'player',
    label: 'Test Token',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

function makeGrappleRequest(overrides: Partial<GrappleRequest> = {}): GrappleRequest {
  return {
    attackerToken: makeToken({ id: 'tok-attacker', entityId: 'e-attacker', label: 'Fighter' }),
    targetToken: makeToken({ id: 'tok-target', entityId: 'e-target', label: 'Goblin' }),
    attackerName: 'Fighter',
    targetName: 'Goblin',
    attackerAthleticsBonus: 5,
    targetEscapeBonus: 2,
    attackerStrScore: 16,
    proficiencyBonus: 3,
    ...overrides
  }
}

function makeShoveRequest(overrides: Partial<ShoveRequest> = {}): ShoveRequest {
  return {
    ...makeGrappleRequest(),
    shoveType: 'prone',
    ...overrides
  } as ShoveRequest
}

describe('resolveGrapple', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockD20Result = 10
    vi.mocked(canGrappleOrShove).mockReturnValue(true)
  })

  it('returns a GrappleResult with all expected fields', () => {
    const result = resolveGrapple(makeGrappleRequest())
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('attackerRoll')
    expect(result).toHaveProperty('targetRoll')
    expect(result).toHaveProperty('dc')
    expect(result).toHaveProperty('summary')
  })

  it('calculates DC as 8 + STR mod + proficiency (PHB 2024)', () => {
    // STR 16 → mod +3, PB +3 → DC 14
    const result = resolveGrapple(makeGrappleRequest({ attackerStrScore: 16, proficiencyBonus: 3 }))
    expect(result.dc).toBe(14)
  })

  it('succeeds when target roll is below DC', () => {
    mockD20Result = 5 // Target rolls 5 + 2 = 7, DC is 14
    const result = resolveGrapple(makeGrappleRequest())
    expect(result.success).toBe(true)
    expect(result.summary).toContain('grapples')
    expect(result.summary).toContain('Grappled')
  })

  it('fails when target roll meets or exceeds DC', () => {
    mockD20Result = 15 // Target rolls 15 + 2 = 17, DC is 14
    const result = resolveGrapple(makeGrappleRequest())
    expect(result.success).toBe(false)
    expect(result.summary).toContain('fails')
  })

  it('applies Grappled condition to target on success', () => {
    mockD20Result = 3
    resolveGrapple(makeGrappleRequest())
    expect(mockAddCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'e-target',
        condition: 'Grappled',
        duration: 'permanent',
        sourceEntityId: 'e-attacker'
      })
    )
  })

  it('does not apply Grappled condition on failure', () => {
    mockD20Result = 20
    resolveGrapple(makeGrappleRequest())
    expect(mockAddCondition).not.toHaveBeenCalled()
  })

  it('returns failure summary when target is too large', () => {
    vi.mocked(canGrappleOrShove).mockReturnValue(false)
    const result = resolveGrapple(makeGrappleRequest())
    expect(result.success).toBe(false)
    expect(result.summary).toContain('too large')
    expect(result.dc).toBe(0)
  })

  it('includes attacker and target names in summary', () => {
    mockD20Result = 5
    const result = resolveGrapple(makeGrappleRequest({ attackerName: 'Thorin', targetName: 'Orc' }))
    expect(result.summary).toContain('Thorin')
    expect(result.summary).toContain('Orc')
  })

  it('includes DC and target roll in summary', () => {
    mockD20Result = 5
    const result = resolveGrapple(makeGrappleRequest())
    expect(result.summary).toContain('DC 14')
    expect(result.summary).toContain(`rolled ${5 + 2}`) // target roll total
  })

  it('works with low STR score (STR 8, mod -1)', () => {
    // STR 8 → mod -1, PB +2 → DC 9
    const result = resolveGrapple(makeGrappleRequest({ attackerStrScore: 8, proficiencyBonus: 2 }))
    expect(result.dc).toBe(9)
  })

  it('works with high STR score (STR 20, mod +5)', () => {
    // STR 20 → mod +5, PB +6 → DC 19
    const result = resolveGrapple(makeGrappleRequest({ attackerStrScore: 20, proficiencyBonus: 6 }))
    expect(result.dc).toBe(19)
  })
})

describe('resolveShove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockD20Result = 10
    vi.mocked(canGrappleOrShove).mockReturnValue(true)
  })

  it('returns a ShoveResult with all expected fields', () => {
    const result = resolveShove(makeShoveRequest())
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('attackerRoll')
    expect(result).toHaveProperty('targetRoll')
    expect(result).toHaveProperty('dc')
    expect(result).toHaveProperty('summary')
  })

  it('calculates DC using unarmedStrikeDC formula', () => {
    const result = resolveShove(makeShoveRequest({ attackerStrScore: 16, proficiencyBonus: 3 }))
    expect(result.dc).toBe(14)
  })

  // ── Shove Prone ─────────────────────────────────────────────

  describe('shove prone', () => {
    it('succeeds and applies Prone condition when target fails save', () => {
      mockD20Result = 3
      const result = resolveShove(makeShoveRequest({ shoveType: 'prone' }))
      expect(result.success).toBe(true)
      expect(result.summary).toContain('Prone')
      expect(mockAddCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          condition: 'Prone',
          entityId: 'e-target'
        })
      )
    })

    it('fails and does not apply Prone when target passes save', () => {
      mockD20Result = 20
      const result = resolveShove(makeShoveRequest({ shoveType: 'prone' }))
      expect(result.success).toBe(false)
      expect(result.summary).toContain('fails')
      expect(mockAddCondition).not.toHaveBeenCalled()
    })
  })

  // ── Shove Push ──────────────────────────────────────────────

  describe('shove push', () => {
    it('succeeds and describes 5ft push on success', () => {
      mockD20Result = 3
      const result = resolveShove(makeShoveRequest({ shoveType: 'push' }))
      expect(result.success).toBe(true)
      expect(result.summary).toContain('pushes')
      expect(result.summary).toContain('5 ft')
    })

    it('does not apply any condition on push (just moves)', () => {
      mockD20Result = 3
      resolveShove(makeShoveRequest({ shoveType: 'push' }))
      // Push does not add Prone; only movement
      expect(mockAddCondition).not.toHaveBeenCalled()
    })

    it('fails on push when target saves', () => {
      mockD20Result = 20
      const result = resolveShove(makeShoveRequest({ shoveType: 'push' }))
      expect(result.success).toBe(false)
      expect(result.summary).toContain('fails')
    })
  })

  // ── Size restriction ─────────────────────────────────────────

  it('returns failure when target is too large to shove', () => {
    vi.mocked(canGrappleOrShove).mockReturnValue(false)
    const result = resolveShove(makeShoveRequest())
    expect(result.success).toBe(false)
    expect(result.summary).toContain('too large')
    expect(result.dc).toBe(0)
  })

  it('includes attacker and target names in shove summary', () => {
    mockD20Result = 3
    const result = resolveShove(
      makeShoveRequest({ attackerName: 'Barbarian', targetName: 'Skeleton', shoveType: 'prone' })
    )
    expect(result.summary).toContain('Barbarian')
    expect(result.summary).toContain('Skeleton')
  })
})
