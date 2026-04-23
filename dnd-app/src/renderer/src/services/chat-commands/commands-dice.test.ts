import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock helpers used by commands-dice
vi.mock('./helpers', () => ({
  parseDiceFormula: vi.fn((formula: string) => {
    const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/)
    if (!match) return null
    return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10), modifier: parseInt(match[3] || '0', 10) }
  }),
  rollDiceFormula: vi.fn(() => ({ rolls: [10, 5], total: 15 })),
  rollSingle: vi.fn(() => 12),
  setLastRoll: vi.fn(),
  getLastRoll: vi.fn(() => ({ formula: '1d20+5', rolls: [15], total: 20, rollerName: 'Tester' })),
  broadcastDiceResult: vi.fn()
}))

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      addHiddenDiceResult: vi.fn()
    }))
  }
}))

vi.mock('../../services/data-provider', () => ({
  load5eRandomTables: vi.fn(() => Promise.resolve({}))
}))

vi.mock('../dice/dice-service', () => ({
  rollForDm: vi.fn(),
  revealRoll: vi.fn()
}))

// Stub crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })

import { commands } from './commands-dice'
import type { CommandContext } from './types'

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    isDM: false,
    playerName: 'TestPlayer',
    character: null,
    localPeerId: 'local-peer',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    ...overrides
  }
}

describe('commands-dice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('each command has required fields: name, description, execute', () => {
    for (const cmd of commands) {
      expect(cmd).toHaveProperty('name')
      expect(cmd).toHaveProperty('description')
      expect(cmd).toHaveProperty('execute')
      expect(typeof cmd.name).toBe('string')
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.execute).toBe('function')
    }
  })

  it('command names are unique within the module', () => {
    const names = commands.map((c) => c.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('command names follow expected format (lowercase, no leading slash)', () => {
    for (const cmd of commands) {
      expect(cmd.name).not.toMatch(/^\//)
      expect(cmd.name).toBe(cmd.name.toLowerCase())
    }
  })

  it('each command has aliases array and category', () => {
    for (const cmd of commands) {
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(['player', 'dm', 'ai']).toContain(cmd.category)
      expect(typeof cmd.dmOnly).toBe('boolean')
    }
  })

  describe('/roll command', () => {
    const rollCmd = commands.find((c) => c.name === 'roll')!

    it('exists', () => {
      expect(rollCmd).toBeDefined()
    })

    it('returns error when no args provided', () => {
      const result = rollCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid formula', () => {
      const result = rollCmd.execute('invalid', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('succeeds with a valid formula', () => {
      const result = rollCmd.execute('1d20+5', makeCtx())
      expect(result).toHaveProperty('handled', true)
    })
  })

  describe('/adv command', () => {
    const advCmd = commands.find((c) => c.name === 'adv')!

    it('exists with advantage alias', () => {
      expect(advCmd).toBeDefined()
      expect(advCmd.aliases).toContain('advantage')
    })

    it('succeeds with no modifier', () => {
      const result = advCmd.execute('', makeCtx())
      expect(result).toHaveProperty('handled', true)
    })

    it('returns error for invalid modifier', () => {
      const result = advCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })
  })

  describe('/dis command', () => {
    const disCmd = commands.find((c) => c.name === 'dis')!

    it('exists with disadvantage alias', () => {
      expect(disCmd).toBeDefined()
      expect(disCmd.aliases).toContain('disadvantage')
    })

    it('succeeds with no modifier', () => {
      const result = disCmd.execute('', makeCtx())
      expect(result).toHaveProperty('handled', true)
    })

    it('returns error for invalid modifier', () => {
      const result = disCmd.execute('xyz', makeCtx())
      expect(result).toHaveProperty('error')
    })
  })

  describe('/reroll command', () => {
    const rerollCmd = commands.find((c) => c.name === 'reroll')!

    it('exists', () => {
      expect(rerollCmd).toBeDefined()
    })

    it('succeeds when there is a last roll', () => {
      const result = rerollCmd.execute('', makeCtx())
      expect(result).toHaveProperty('handled', true)
    })

    it('returns error when there is no last roll', async () => {
      const { getLastRoll } = await import('./helpers')
      vi.mocked(getLastRoll).mockReturnValueOnce(null)
      const result = rerollCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })
  })

  describe('/multiroll command', () => {
    const mrCmd = commands.find((c) => c.name === 'multiroll')!

    it('exists with mr alias', () => {
      expect(mrCmd).toBeDefined()
      expect(mrCmd.aliases).toContain('mr')
    })

    it('returns error for insufficient args', () => {
      const result = mrCmd.execute('4', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid count', () => {
      const result = mrCmd.execute('abc 1d20', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for count > 20', () => {
      const result = mrCmd.execute('21 1d20', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('succeeds with valid args', () => {
      const result = mrCmd.execute('3 1d20+5', makeCtx())
      expect(result).toHaveProperty('handled', true)
    })
  })

  describe('/hdice command', () => {
    const hdiceCmd = commands.find((c) => c.name === 'hdice')!

    it('exists and is DM-only', () => {
      expect(hdiceCmd).toBeDefined()
      expect(hdiceCmd.dmOnly).toBe(true)
    })

    it('returns error when no args provided', () => {
      const result = hdiceCmd.execute('', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('error')
    })

    it('returns handled with preventBroadcast on success', () => {
      const result = hdiceCmd.execute('1d20+5', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('handled', true)
      expect(result).toHaveProperty('preventBroadcast', true)
    })
  })

  describe('/secretroll command', () => {
    const srCmd = commands.find((c) => c.name === 'secretroll')!

    it('exists and is DM-only', () => {
      expect(srCmd).toBeDefined()
      expect(srCmd.dmOnly).toBe(true)
      expect(srCmd.aliases).toContain('sr')
    })
  })

  describe('/massroll command', () => {
    const massrollCmd = commands.find((c) => c.name === 'massroll')!

    it('exists and is DM-only', () => {
      expect(massrollCmd).toBeDefined()
      expect(massrollCmd.dmOnly).toBe(true)
    })

    it('returns error for insufficient args', () => {
      const result = massrollCmd.execute('5', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for count > 50', () => {
      const result = massrollCmd.execute('51 1d20', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('error')
    })

    it('succeeds with valid args', () => {
      const ctx = makeCtx({ isDM: true })
      const result = massrollCmd.execute('3 1d20+5 DEX save', ctx)
      expect(result).toHaveProperty('handled', true)
    })
  })

  describe('/fudge command', () => {
    const fudgeCmd = commands.find((c) => c.name === 'fudge')!

    it('exists and is DM-only', () => {
      expect(fudgeCmd).toBeDefined()
      expect(fudgeCmd.dmOnly).toBe(true)
    })

    it('returns error for insufficient args', () => {
      const result = fudgeCmd.execute('1d20', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid result number', () => {
      const result = fudgeCmd.execute('1d20 abc', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('error')
    })

    it('succeeds with valid formula and result', () => {
      const ctx = makeCtx({ isDM: true })
      const result = fudgeCmd.execute('1d20+5 18', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(result).toHaveProperty('preventBroadcast', true)
    })
  })

  describe('/rolltable command', () => {
    const rolltableCmd = commands.find((c) => c.name === 'rolltable')!

    it('exists with table alias', () => {
      expect(rolltableCmd).toBeDefined()
      expect(rolltableCmd.aliases).toContain('table')
    })

    it('returns error when no table name provided', async () => {
      const result = await rolltableCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('roll')
    expect(names).toContain('adv')
    expect(names).toContain('dis')
    expect(names).toContain('reroll')
    expect(names).toContain('multiroll')
    expect(names).toContain('hdice')
    expect(names).toContain('secretroll')
    expect(names).toContain('massroll')
    expect(names).toContain('fudge')
    expect(names).toContain('rolltable')
  })
})
