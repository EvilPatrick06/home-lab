import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock stores and combat-log ─────────────────────────────────

const mockUpdateInitiativeEntry = vi.fn()
const mockAddCombatLogEntry = vi.fn()
const mockAddChatMessage = vi.fn()
const mockSendMessage = vi.fn()

let mockInitiative: {
  entries: Array<{
    id: string
    legendaryResistances?: { remaining: number; max: number }
    legendaryActions?: { used: number; maximum: number }
    inLair?: boolean
  }>
  currentIndex: number
} | null = null

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      initiative: mockInitiative,
      round: 1,
      updateInitiativeEntry: mockUpdateInitiativeEntry,
      addCombatLogEntry: mockAddCombatLogEntry
    }))
  }
}))

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      addChatMessage: mockAddChatMessage
    }))
  }
}))

vi.mock('../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      sendMessage: mockSendMessage
    }))
  }
}))

import { shouldTriggerLairAction, spendLegendaryAction, useLegendaryResistance } from './legendary-actions'

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockInitiative = null
})

describe('spendLegendaryAction', () => {
  it('returns failure when no initiative is active', () => {
    mockInitiative = null
    const result = spendLegendaryAction('dragon-1')
    expect(result.success).toBe(false)
    expect(result.summary).toContain('No active initiative')
  })

  it('returns failure when entry has no legendaryActions', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1' }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1')
    expect(result.success).toBe(false)
    expect(result.summary).toContain('no legendary actions')
  })

  it('returns failure when entry id is not found', () => {
    mockInitiative = {
      entries: [{ id: 'other-creature' }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1')
    expect(result.success).toBe(false)
  })

  it('succeeds when legendary actions are available (cost 1)', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 0, maximum: 3 } }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1', 1)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.summary).toContain('2/3')
  })

  it('updates the initiative entry in the store', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 0, maximum: 3 } }],
      currentIndex: 0
    }
    spendLegendaryAction('dragon-1', 1)
    expect(mockUpdateInitiativeEntry).toHaveBeenCalledWith('dragon-1', {
      legendaryActions: { used: 1, maximum: 3 }
    })
  })

  it('handles cost of 2 correctly', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 0, maximum: 3 } }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1', 2)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('fails when cost exceeds remaining legendary actions', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 2, maximum: 3 } }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1', 2)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(1)
    expect(result.summary).toContain('Not enough legendary actions')
  })

  it('defaults cost to 1', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 0, maximum: 3 } }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1')
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('can spend the last legendary action', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 2, maximum: 3 } }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1', 1)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('fails when remaining is 0', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryActions: { used: 3, maximum: 3 } }],
      currentIndex: 0
    }
    const result = spendLegendaryAction('dragon-1', 1)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })
})

describe('useLegendaryResistance', () => {
  it('returns failure when no initiative is active', () => {
    mockInitiative = null
    const result = useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Wisdom')
    expect(result.success).toBe(false)
    expect(result.summary).toContain('No active initiative')
  })

  it('returns failure when no legendary resistances remain', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryResistances: { remaining: 0, max: 3 } }],
      currentIndex: 0
    }
    const result = useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Wisdom')
    expect(result.success).toBe(false)
    expect(result.summary).toContain('no legendary resistances remaining')
  })

  it('returns failure when entry has no legendaryResistances field', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1' }],
      currentIndex: 0
    }
    const result = useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Wisdom')
    expect(result.success).toBe(false)
  })

  it('succeeds and decrements remaining count', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryResistances: { remaining: 3, max: 3 } }],
      currentIndex: 0
    }
    const result = useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Wisdom')
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('summary includes entity name, save type, and remaining count', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryResistances: { remaining: 2, max: 3 } }],
      currentIndex: 0
    }
    const result = useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Wisdom')
    expect(result.summary).toContain('Ancient Dragon')
    expect(result.summary).toContain('Legendary Resistance')
    expect(result.summary).toContain('Wisdom')
    expect(result.summary).toContain('1/3')
  })

  it('updates the initiative entry in the store', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryResistances: { remaining: 2, max: 3 } }],
      currentIndex: 0
    }
    useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Wisdom')
    expect(mockUpdateInitiativeEntry).toHaveBeenCalledWith('dragon-1', {
      legendaryResistances: { remaining: 1, max: 3 }
    })
  })

  it('logs a combat entry with type save', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryResistances: { remaining: 1, max: 3 } }],
      currentIndex: 0
    }
    useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Constitution')
    expect(mockAddCombatLogEntry).toHaveBeenCalledTimes(1)
    const logEntry = mockAddCombatLogEntry.mock.calls[0][0]
    expect(logEntry.type).toBe('save')
    expect(logEntry.targetEntityName).toBe('Ancient Dragon')
  })

  it('broadcasts the result as a non-secret message', () => {
    mockInitiative = {
      entries: [{ id: 'dragon-1', legendaryResistances: { remaining: 1, max: 3 } }],
      currentIndex: 0
    }
    useLegendaryResistance('dragon-1', 'Ancient Dragon', 'Dexterity')
    expect(mockAddChatMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('shouldTriggerLairAction', () => {
  it('returns true when any entry has inLair flag', () => {
    const initiative = {
      entries: [{ inLair: true }, { inLair: false }, {}],
      currentIndex: 0
    }
    expect(shouldTriggerLairAction(initiative)).toBe(true)
  })

  it('returns false when no entry has inLair flag', () => {
    const initiative = {
      entries: [{}, { inLair: false }],
      currentIndex: 0
    }
    expect(shouldTriggerLairAction(initiative)).toBe(false)
  })

  it('returns false for empty entries array', () => {
    const initiative = {
      entries: [],
      currentIndex: 0
    }
    expect(shouldTriggerLairAction(initiative)).toBe(false)
  })

  it('returns true even if only the last entry is in lair', () => {
    const initiative = {
      entries: [{}, {}, { inLair: true }],
      currentIndex: 0
    }
    expect(shouldTriggerLairAction(initiative)).toBe(true)
  })
})
