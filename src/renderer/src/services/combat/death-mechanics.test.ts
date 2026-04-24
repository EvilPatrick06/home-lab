import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock stores and services ───────────────────────────────────

const mockSetConcentrating = vi.fn()
const mockAddCombatLogEntry = vi.fn()
const mockAddChatMessage = vi.fn()
const mockSendMessage = vi.fn()

let mockTurnStates: Record<string, { concentratingSpell?: string }> = {}

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      round: 1,
      turnStates: mockTurnStates,
      setConcentrating: mockSetConcentrating,
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

// Mock rollD20 to return controllable results
let mockRollResult = {
  formula: '1d20',
  rolls: [15],
  total: 15,
  natural20: false,
  natural1: false
}

vi.mock('../dice/dice-service', () => ({
  rollD20: vi.fn(() => mockRollResult)
}))

import { deathSaveDamageAtZero, resolveConcentrationCheck, resolveDeathSave } from './death-mechanics'

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockTurnStates = {}
  mockRollResult = {
    formula: '1d20',
    rolls: [15],
    total: 15,
    natural20: false,
    natural1: false
  }
})

// ─── resolveConcentrationCheck (PHB 2024 p.236) ─────────────────

describe('resolveConcentrationCheck', () => {
  it('DC is 10 for low damage (less than 20)', () => {
    // damage 8 → floor(8/2) = 4, max(10, 4) = 10
    mockRollResult = { formula: '1d20+3', rolls: [12], total: 15, natural20: false, natural1: false }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 8, 3)
    expect(result.dc).toBe(10)
  })

  it('DC scales to half damage when damage >= 20', () => {
    // damage 30 → floor(30/2) = 15, max(10, 15) = 15
    mockRollResult = { formula: '1d20+3', rolls: [12], total: 15, natural20: false, natural1: false }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 30, 3)
    expect(result.dc).toBe(15)
  })

  it('DC is floor(damage/2) for odd damage >= 21', () => {
    // damage 21 → floor(21/2) = 10, max(10, 10) = 10
    mockRollResult = { formula: '1d20', rolls: [10], total: 10, natural20: false, natural1: false }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 21, 0)
    expect(result.dc).toBe(10)

    // damage 41 → floor(41/2) = 20, max(10, 20) = 20
    const result2 = resolveConcentrationCheck('wiz-1', 'Wizard', 41, 0)
    expect(result2.dc).toBe(20)
  })

  it('maintains concentration when total >= DC', () => {
    mockRollResult = { formula: '1d20+5', rolls: [10], total: 15, natural20: false, natural1: false }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 10, 5)
    expect(result.maintained).toBe(true)
    expect(result.summary).toContain('maintains concentration')
  })

  it('loses concentration when total < DC', () => {
    mockRollResult = { formula: '1d20+1', rolls: [4], total: 5, natural20: false, natural1: false }
    mockTurnStates = { 'wiz-1': { concentratingSpell: 'Haste' } }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 10, 1)
    expect(result.maintained).toBe(false)
    expect(result.summary).toContain('loses concentration')
    expect(result.summary).toContain('Haste')
  })

  it('drops concentration in the store when check fails', () => {
    mockRollResult = { formula: '1d20', rolls: [5], total: 5, natural20: false, natural1: false }
    mockTurnStates = { 'wiz-1': { concentratingSpell: 'Hold Person' } }
    resolveConcentrationCheck('wiz-1', 'Wizard', 10, 0)
    expect(mockSetConcentrating).toHaveBeenCalledWith('wiz-1', undefined)
  })

  it('does not call setConcentrating when check succeeds', () => {
    mockRollResult = { formula: '1d20+5', rolls: [15], total: 20, natural20: false, natural1: false }
    mockTurnStates = { 'wiz-1': { concentratingSpell: 'Shield of Faith' } }
    resolveConcentrationCheck('wiz-1', 'Wizard', 10, 5)
    expect(mockSetConcentrating).not.toHaveBeenCalled()
  })

  it('logs the combat entry and broadcasts the result', () => {
    mockRollResult = { formula: '1d20+3', rolls: [12], total: 15, natural20: false, natural1: false }
    resolveConcentrationCheck('wiz-1', 'Wizard', 10, 3)
    expect(mockAddCombatLogEntry).toHaveBeenCalledTimes(1)
    expect(mockAddChatMessage).toHaveBeenCalledTimes(1)
  })

  it('summary includes the roll total and DC', () => {
    mockRollResult = { formula: '1d20+3', rolls: [12], total: 15, natural20: false, natural1: false }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 10, 3)
    expect(result.summary).toContain('15')
    expect(result.summary).toContain('DC 10')
  })

  it('exactly meeting DC maintains concentration', () => {
    mockRollResult = { formula: '1d20+0', rolls: [10], total: 10, natural20: false, natural1: false }
    const result = resolveConcentrationCheck('wiz-1', 'Wizard', 10, 0)
    expect(result.maintained).toBe(true)
  })
})

// ─── resolveDeathSave (PHB 2024 p.230) ──────────────────────────

describe('resolveDeathSave', () => {
  it('natural 20 revives the entity (regain 1 HP)', () => {
    mockRollResult = { formula: '1d20', rolls: [20], total: 20, natural20: true, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 1, failures: 2 })
    expect(result.outcome).toBe('revived')
    expect(result.successes).toBe(0) // Reset
    expect(result.failures).toBe(0) // Reset
    expect(result.summary).toContain('Natural 20')
    expect(result.summary).toContain('1 HP')
  })

  it('natural 1 adds 2 failures', () => {
    mockRollResult = { formula: '1d20', rolls: [1], total: 1, natural20: false, natural1: true }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 0 })
    expect(result.failures).toBe(2)
    expect(result.successes).toBe(0)
    expect(result.summary).toContain('Natural 1')
    expect(result.summary).toContain('2 failures')
  })

  it('rolling >= 10 adds a success', () => {
    mockRollResult = { formula: '1d20', rolls: [14], total: 14, natural20: false, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 0 })
    expect(result.successes).toBe(1)
    expect(result.failures).toBe(0)
    expect(result.outcome).toBe('continue')
  })

  it('rolling exactly 10 counts as a success', () => {
    mockRollResult = { formula: '1d20', rolls: [10], total: 10, natural20: false, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 0 })
    expect(result.successes).toBe(1)
  })

  it('rolling < 10 adds a failure', () => {
    mockRollResult = { formula: '1d20', rolls: [5], total: 5, natural20: false, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 0 })
    expect(result.failures).toBe(1)
    expect(result.successes).toBe(0)
    expect(result.outcome).toBe('continue')
  })

  it('3 successes stabilizes the entity', () => {
    mockRollResult = { formula: '1d20', rolls: [15], total: 15, natural20: false, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 2, failures: 1 })
    expect(result.outcome).toBe('stabilized')
    expect(result.successes).toBe(3)
    expect(result.summary).toContain('stabilized')
  })

  it('3 failures kills the entity', () => {
    mockRollResult = { formula: '1d20', rolls: [5], total: 5, natural20: false, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 2 })
    expect(result.outcome).toBe('dead')
    expect(result.failures).toBe(3)
    expect(result.summary).toContain('died')
  })

  it('natural 1 with 2 existing failures results in death (2+2=4 >= 3)', () => {
    mockRollResult = { formula: '1d20', rolls: [1], total: 1, natural20: false, natural1: true }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 2 })
    expect(result.outcome).toBe('dead')
    expect(result.failures).toBe(4) // 2 + 2
  })

  it('natural 1 with 1 existing failure results in continue (1+2=3 >= 3 = dead)', () => {
    mockRollResult = { formula: '1d20', rolls: [1], total: 1, natural20: false, natural1: true }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 1 })
    expect(result.outcome).toBe('dead')
    expect(result.failures).toBe(3)
  })

  it('natural 20 resets successes and failures even if near death', () => {
    mockRollResult = { formula: '1d20', rolls: [20], total: 20, natural20: true, natural1: false }
    const result = resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 2 })
    expect(result.outcome).toBe('revived')
    expect(result.successes).toBe(0)
    expect(result.failures).toBe(0)
  })

  it('logs combat entry on every death save', () => {
    mockRollResult = { formula: '1d20', rolls: [14], total: 14, natural20: false, natural1: false }
    resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 0 })
    expect(mockAddCombatLogEntry).toHaveBeenCalledTimes(1)
    const logEntry = mockAddCombatLogEntry.mock.calls[0][0]
    expect(logEntry.type).toBe('death')
  })

  it('broadcasts result on every death save', () => {
    mockRollResult = { formula: '1d20', rolls: [14], total: 14, natural20: false, natural1: false }
    resolveDeathSave('fighter-1', 'Fighter', { successes: 0, failures: 0 })
    expect(mockAddChatMessage).toHaveBeenCalledTimes(1)
  })
})

// ─── deathSaveDamageAtZero (PHB 2024) ───────────────────────────

describe('deathSaveDamageAtZero', () => {
  it('normal damage at 0 HP adds 1 failure', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 10, false, 50)
    expect(result.failures).toBe(1)
    expect(result.outcome).toBe('continue')
  })

  it('critical hit at 0 HP adds 2 failures', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 10, true, 50)
    expect(result.failures).toBe(2)
    expect(result.outcome).toBe('continue')
    expect(result.summary).toContain('critical')
  })

  it('massive damage (damage >= maxHP) causes instant death', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 2, failures: 0 }, 50, false, 50)
    expect(result.failures).toBe(3)
    expect(result.outcome).toBe('dead')
    expect(result.summary).toContain('Massive damage')
    expect(result.summary).toContain('Instant death')
  })

  it('massive damage at exactly maxHP causes instant death', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 30, false, 30)
    expect(result.outcome).toBe('dead')
    expect(result.failures).toBe(3)
  })

  it('damage exceeding maxHP causes instant death', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 100, false, 30)
    expect(result.outcome).toBe('dead')
  })

  it('normal damage with 2 existing failures results in death', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 1, failures: 2 }, 5, false, 50)
    expect(result.failures).toBe(3)
    expect(result.outcome).toBe('dead')
    expect(result.summary).toContain('died')
  })

  it('critical hit with 1 existing failure results in death (1+2=3)', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 1, failures: 1 }, 5, true, 50)
    expect(result.failures).toBe(3)
    expect(result.outcome).toBe('dead')
  })

  it('critical hit with 0 failures continues (0+2=2 < 3)', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 1, failures: 0 }, 5, true, 50)
    expect(result.failures).toBe(2)
    expect(result.outcome).toBe('continue')
  })

  it('logs combat entry', () => {
    deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 5, false, 50)
    expect(mockAddCombatLogEntry).toHaveBeenCalledTimes(1)
    const logEntry = mockAddCombatLogEntry.mock.calls[0][0]
    expect(logEntry.type).toBe('death')
    expect(logEntry.targetEntityName).toBe('Fighter')
  })

  it('broadcasts result', () => {
    deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 5, false, 50)
    expect(mockAddChatMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('summary includes damage amount for normal hits', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 7, false, 50)
    expect(result.summary).toContain('0 HP')
    expect(result.summary).toContain('1 death save failure')
  })

  it('summary includes damage amount for massive damage', () => {
    const result = deathSaveDamageAtZero('fighter-1', 'Fighter', { successes: 0, failures: 0 }, 60, false, 50)
    expect(result.summary).toContain('60')
    expect(result.summary).toContain('max HP: 50')
  })
})
