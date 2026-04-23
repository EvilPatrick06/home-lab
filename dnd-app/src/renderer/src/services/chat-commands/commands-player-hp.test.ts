import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommandContext, createMockCharacter } from '../../test-helpers'

// Mock helpers
vi.mock('./helpers', () => ({
  getLatestCharacter: vi.fn(),
  saveAndBroadcastCharacter: vi.fn()
}))

vi.mock('../../services/sound-manager', () => ({
  play: vi.fn()
}))

vi.mock('../../stores/use-character-store', () => ({
  useCharacterStore: {
    getState: vi.fn(() => ({
      characters: []
    }))
  }
}))

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [{ id: 'map-1', tokens: [] }],
      activeMapId: 'map-1',
      round: 1,
      updateToken: vi.fn()
    }))
  }
}))

vi.mock('../../types/character', () => ({
  is5eCharacter: vi.fn((c) => c?.gameSystem === 'dnd5e')
}))

import type { Character5e } from '../../types/character-5e'
import { commands } from './commands-player-hp'
import { getLatestCharacter } from './helpers'

function makeChar(overrides: Partial<Character5e> = {}): Character5e {
  return createMockCharacter(overrides)
}

function makeCtx(overrides: Partial<Parameters<typeof createCommandContext>[0]> = {}) {
  return createCommandContext({
    isDM: false,
    playerName: 'TestPlayer',
    character: makeChar(),
    localPeerId: 'local-peer',
    ...overrides
  })
}

describe('commands-player-hp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getLatestCharacter).mockReset()
    vi.mocked(getLatestCharacter).mockReturnValue(makeChar())
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

  describe('/hp command', () => {
    const hpCmd = commands.find((c) => c.name === 'hp')!

    it('exists', () => {
      expect(hpCmd).toBeDefined()
    })

    it('returns error when no args provided', () => {
      const result = hpCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error when character not selected', () => {
      vi.mocked(getLatestCharacter).mockReturnValueOnce(undefined)
      const result = hpCmd.execute('+5', makeCtx({ character: { id: 'char-1' } as Character5e }))
      expect(result).toHaveProperty('error')
    })

    it('heals HP with +N', () => {
      const ctx = makeCtx()
      const result = hpCmd.execute('+5', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
    })

    it('damages HP with -N', () => {
      const ctx = makeCtx()
      const result = hpCmd.execute('-10', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
    })

    it('sets HP with set N', () => {
      const ctx = makeCtx()
      const result = hpCmd.execute('set 20', ctx)
      expect(result).toHaveProperty('handled', true)
    })

    it('sets HP with = N', () => {
      const ctx = makeCtx()
      const result = hpCmd.execute('= 25', ctx)
      expect(result).toHaveProperty('handled', true)
    })

    it('sets HP with bare number', () => {
      const ctx = makeCtx()
      const result = hpCmd.execute('15', ctx)
      expect(result).toHaveProperty('handled', true)
    })
  })

  describe('/heal command', () => {
    const healCmd = commands.find((c) => c.name === 'heal')!

    it('exists', () => {
      expect(healCmd).toBeDefined()
    })

    it('returns error when no args', () => {
      const result = healCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid amount', () => {
      const result = healCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('heals player character with amount', () => {
      const ctx = makeCtx()
      const result = healCmd.execute('10', ctx)
      expect(result).toHaveProperty('handled', true)
    })

    it('returns error when no character selected', () => {
      const result = healCmd.execute('10', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })
  })

  describe('/damage command', () => {
    const dmgCmd = commands.find((c) => c.name === 'damage')!

    it('exists with dmg alias', () => {
      expect(dmgCmd).toBeDefined()
      expect(dmgCmd.aliases).toContain('dmg')
    })

    it('returns error when no args', () => {
      const result = dmgCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid amount', () => {
      const result = dmgCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('deals damage to player character', () => {
      const ctx = makeCtx()
      const result = dmgCmd.execute('10', ctx)
      expect(result).toHaveProperty('handled', true)
    })

    it('returns error when no character selected', () => {
      const result = dmgCmd.execute('10', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })
  })

  describe('/hphalf command', () => {
    const hphalfCmd = commands.find((c) => c.name === 'hphalf')!

    it('exists with halfhp and halfdamage aliases', () => {
      expect(hphalfCmd).toBeDefined()
      expect(hphalfCmd.aliases).toContain('halfhp')
      expect(hphalfCmd.aliases).toContain('halfdamage')
    })

    it('halves HP on the target', () => {
      const ctx = makeCtx()
      const result = hphalfCmd.execute('', ctx)
      expect(result).toHaveProperty('handled', true)
    })

    it('returns error when no character selected', () => {
      vi.mocked(getLatestCharacter).mockReturnValueOnce(undefined)
      const result = hphalfCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })
  })

  describe('/temphp command', () => {
    const thpCmd = commands.find((c) => c.name === 'temphp')!

    it('exists with thp alias', () => {
      expect(thpCmd).toBeDefined()
      expect(thpCmd.aliases).toContain('thp')
    })

    it('returns error when no args', () => {
      const result = thpCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid amount', () => {
      const result = thpCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('sets temp HP for player character', () => {
      const ctx = makeCtx()
      const result = thpCmd.execute('10', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
    })

    it('returns error when no character selected', () => {
      const result = thpCmd.execute('10', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })
  })

  describe('/halve command', () => {
    const halveCmd = commands.find((c) => c.name === 'halve')!

    it('exists with half and resist aliases', () => {
      expect(halveCmd).toBeDefined()
      expect(halveCmd.aliases).toContain('half')
      expect(halveCmd.aliases).toContain('resist')
    })

    it('returns error when no args', () => {
      const result = halveCmd.execute('', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid damage amount', () => {
      const result = halveCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('halves damage and applies to character', () => {
      const ctx = makeCtx()
      const result = halveCmd.execute('20', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
      const msg = vi.mocked(ctx.addSystemMessage).mock.calls[0][0]
      expect(msg).toContain('halved')
      expect(msg).toContain('10')
    })

    it('returns error when no character selected', () => {
      const result = halveCmd.execute('20', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('hp')
    expect(names).toContain('heal')
    expect(names).toContain('damage')
    expect(names).toContain('hphalf')
    expect(names).toContain('temphp')
    expect(names).toContain('halve')
  })
})
