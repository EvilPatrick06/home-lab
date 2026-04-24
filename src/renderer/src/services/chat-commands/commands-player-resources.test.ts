import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock helpers
vi.mock('./helpers', () => ({
  getLatestCharacter: vi.fn(),
  saveAndBroadcastCharacter: vi.fn(),
  requireLatestCharacter: vi.fn(),
  addConditionOnCharacter: vi.fn(),
  removeConditionByPrefix: vi.fn()
}))

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      addCondition: vi.fn(),
      removeCondition: vi.fn()
    }))
  }
}))

vi.mock('../../types/character', () => ({
  is5eCharacter: vi.fn((c) => c?.system === '5e')
}))

// Stub crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })

import type { Character5e } from '../../types/character-5e'
import { commands } from './commands-player-resources'
import { getLatestCharacter, requireLatestCharacter } from './helpers'
import type { CommandContext } from './types'

function makeChar(overrides: Partial<Character5e> = {}): Character5e {
  return {
    id: 'char-1',
    system: '5e',
    name: 'Thorin',
    level: 5,
    hitPoints: { maximum: 40, current: 30, temporary: 0 },
    abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 13, charisma: 8 },
    heroicInspiration: false,
    deathSaves: { successes: 0, failures: 0 },
    spellSlotLevels: {
      1: { max: 4, current: 3 },
      2: { max: 3, current: 2 },
      3: { max: 2, current: 0 }
    },
    ...overrides
  } as unknown as Character5e
}

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    isDM: false,
    playerName: 'TestPlayer',
    character: makeChar(),
    localPeerId: 'local-peer',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    ...overrides
  }
}

describe('commands-player-resources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getLatestCharacter).mockReturnValue(makeChar())
    vi.mocked(requireLatestCharacter).mockReturnValue(makeChar())
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

  describe('/spell command', () => {
    const spellCmd = commands.find((c) => c.name === 'spell')!

    it('exists with slot alias', () => {
      expect(spellCmd).toBeDefined()
      expect(spellCmd.aliases).toContain('slot')
    })

    it('returns error when no character', () => {
      const result = spellCmd.execute('1', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid spell level', () => {
      const result = spellCmd.execute('0', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error for level > 9', () => {
      const result = spellCmd.execute('10', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('returns error when no slots remaining at that level', () => {
      vi.mocked(getLatestCharacter).mockReturnValueOnce(makeChar())
      const result = spellCmd.execute('3', makeCtx())
      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('no remaining')
    })

    it('succeeds and expends a spell slot', () => {
      const ctx = makeCtx()
      const result = spellCmd.execute('1', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
    })
  })

  describe('/channel command', () => {
    const channelCmd = commands.find((c) => c.name === 'channel')!

    it('exists with cd alias', () => {
      expect(channelCmd).toBeDefined()
      expect(channelCmd.aliases).toContain('cd')
    })

    it('returns error when no character', () => {
      const result = channelCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('succeeds with character', () => {
      const ctx = makeCtx()
      const result = channelCmd.execute('', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
    })
  })

  describe('/ki command', () => {
    const kiCmd = commands.find((c) => c.name === 'ki')!

    it('exists', () => {
      expect(kiCmd).toBeDefined()
    })

    it('returns error when no character', () => {
      const result = kiCmd.execute('2', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid amount', () => {
      const result = kiCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('succeeds with valid amount', () => {
      const ctx = makeCtx()
      const result = kiCmd.execute('3', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.addSystemMessage).toHaveBeenCalled()
    })

    it('pluralizes correctly for 1 point', () => {
      const ctx = makeCtx()
      kiCmd.execute('1', ctx)
      const msg = vi.mocked(ctx.addSystemMessage).mock.calls[0][0]
      expect(msg).toContain('1 Ki Point.')
      expect(msg).not.toContain('Points.')
    })
  })

  describe('/rage command', () => {
    const rageCmd = commands.find((c) => c.name === 'rage')!

    it('exists', () => {
      expect(rageCmd).toBeDefined()
    })

    it('returns error when no character', () => {
      const result = rageCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('adds rage condition when not raging', () => {
      const ctx = makeCtx()
      const result = rageCmd.execute('', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.broadcastSystemMessage).toHaveBeenCalled()
    })
  })

  describe('/bardic command', () => {
    const bardicCmd = commands.find((c) => c.name === 'bardic')!

    it('exists with bi alias', () => {
      expect(bardicCmd).toBeDefined()
      expect(bardicCmd.aliases).toContain('bi')
    })

    it('returns error when no character', () => {
      const result = bardicCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('defaults target to "an ally" when none given', () => {
      const ctx = makeCtx()
      bardicCmd.execute('', ctx)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('an ally')
    })

    it('uses specified target', () => {
      const ctx = makeCtx()
      bardicCmd.execute('Frodo', ctx)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('Frodo')
    })
  })

  describe('/inspiration command', () => {
    const inspCmd = commands.find((c) => c.name === 'inspiration')!

    it('exists with insp alias', () => {
      expect(inspCmd).toBeDefined()
      expect(inspCmd.aliases).toContain('insp')
    })

    it('returns error when no character', () => {
      const result = inspCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('toggles heroic inspiration on', () => {
      vi.mocked(getLatestCharacter).mockReturnValueOnce(makeChar({ heroicInspiration: false }))
      const ctx = makeCtx()
      const result = inspCmd.execute('', ctx)
      expect(result).toHaveProperty('handled', true)
    })
  })

  describe('/deathsave command', () => {
    const dsCmd = commands.find((c) => c.name === 'deathsave')!

    it('exists with ds alias', () => {
      expect(dsCmd).toBeDefined()
      expect(dsCmd.aliases).toContain('ds')
    })

    it('returns error when no character', () => {
      const result = dsCmd.execute('pass', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid result (not pass/fail)', () => {
      const result = dsCmd.execute('maybe', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('records a pass', () => {
      const ctx = makeCtx()
      const result = dsCmd.execute('pass', ctx)
      expect(result).toHaveProperty('handled', true)
      expect(ctx.broadcastSystemMessage).toHaveBeenCalled()
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('SUCCESS')
    })

    it('records a fail', () => {
      const ctx = makeCtx()
      const result = dsCmd.execute('fail', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('FAILURE')
    })
  })

  describe('/sorcery command', () => {
    const sorcCmd = commands.find((c) => c.name === 'sorcery')!

    it('exists with sp and sorcpoint aliases', () => {
      expect(sorcCmd).toBeDefined()
      expect(sorcCmd.aliases).toContain('sp')
      expect(sorcCmd.aliases).toContain('sorcpoint')
    })

    it('returns error when no character', () => {
      const result = sorcCmd.execute('2', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid amount', () => {
      const result = sorcCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('succeeds with amount and optional description', () => {
      const ctx = makeCtx()
      const result = sorcCmd.execute('3 Quickened Spell', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('3 Sorcery Points')
      expect(msg).toContain('Quickened Spell')
    })
  })

  describe('/superiority command', () => {
    const supCmd = commands.find((c) => c.name === 'superiority')!

    it('exists with sd and maneuver aliases', () => {
      expect(supCmd).toBeDefined()
      expect(supCmd.aliases).toContain('sd')
      expect(supCmd.aliases).toContain('maneuver')
    })

    it('returns error when no character', () => {
      const result = supCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('succeeds with maneuver name', () => {
      const ctx = makeCtx()
      const result = supCmd.execute('Riposte', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('Riposte')
      expect(msg).toContain('d8')
    })

    it('defaults to "a maneuver" when no name given', () => {
      const ctx = makeCtx()
      supCmd.execute('', ctx)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('a maneuver')
    })
  })

  describe('/secondwind command', () => {
    const swCmd = commands.find((c) => c.name === 'secondwind')!

    it('exists with sw alias', () => {
      expect(swCmd).toBeDefined()
      expect(swCmd.aliases).toContain('sw')
    })

    it('returns error when no character', () => {
      const result = swCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('succeeds and mentions HP healed', () => {
      const ctx = makeCtx()
      const result = swCmd.execute('', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('Second Wind')
      expect(msg).toContain('HP healed')
    })
  })

  describe('/actionsurge command', () => {
    const asCmd = commands.find((c) => c.name === 'actionsurge')!

    it('exists with as and surge aliases', () => {
      expect(asCmd).toBeDefined()
      expect(asCmd.aliases).toContain('as')
      expect(asCmd.aliases).toContain('surge')
    })

    it('returns error when no character', () => {
      const result = asCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('broadcasts action surge message', () => {
      const ctx = makeCtx()
      const result = asCmd.execute('', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('Action Surge')
    })
  })

  describe('/layonhands command', () => {
    const lohCmd = commands.find((c) => c.name === 'layonhands')!

    it('exists with loh alias', () => {
      expect(lohCmd).toBeDefined()
      expect(lohCmd.aliases).toContain('loh')
    })

    it('returns error when no character', () => {
      const result = lohCmd.execute('5', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid amount', () => {
      const result = lohCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('error')
    })

    it('succeeds with amount and target', () => {
      const ctx = makeCtx()
      const result = lohCmd.execute('10 Frodo', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('Lay on Hands')
      expect(msg).toContain('Frodo')
      expect(msg).toContain('10 HP')
    })

    it('defaults target to "themselves"', () => {
      const ctx = makeCtx()
      lohCmd.execute('5', ctx)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('themselves')
    })
  })

  describe('/hitdice command', () => {
    const hdCmd = commands.find((c) => c.name === 'hitdice')!

    it('exists with hd alias', () => {
      expect(hdCmd).toBeDefined()
      expect(hdCmd.aliases).toContain('hd')
    })

    it('returns error when no character', () => {
      const result = hdCmd.execute('1 8', makeCtx({ character: null }))
      expect(result).toHaveProperty('error')
    })

    it('returns error for invalid die size', () => {
      const result = hdCmd.execute('1 20', makeCtx())
      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toContain('6, 8, 10, or 12')
    })

    it('succeeds with valid count and die size', () => {
      const ctx = makeCtx()
      const result = hdCmd.execute('2 8 3', ctx)
      expect(result).toHaveProperty('handled', true)
      const msg = vi.mocked(ctx.broadcastSystemMessage).mock.calls[0][0]
      expect(msg).toContain('Hit Dice')
      expect(msg).toContain('HP healed')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('spell')
    expect(names).toContain('channel')
    expect(names).toContain('ki')
    expect(names).toContain('rage')
    expect(names).toContain('bardic')
    expect(names).toContain('inspiration')
    expect(names).toContain('deathsave')
    expect(names).toContain('sorcery')
    expect(names).toContain('superiority')
    expect(names).toContain('secondwind')
    expect(names).toContain('actionsurge')
    expect(names).toContain('layonhands')
    expect(names).toContain('hitdice')
  })
})
