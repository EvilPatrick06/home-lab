import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))
vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 10),
  rollMultiple: vi.fn((count: number) => Array(count).fill(4))
}))

import {
  assertCommandNameFormat,
  assertCommandShape,
  assertUniqueCommandNames,
  createCommandContext
} from '../../test-helpers'
import { commands } from './commands-player-spells'
import type { CommandContext } from './types'

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return createCommandContext({
    isDM: false,
    playerName: 'TestPlayer',
    ...overrides
  })
}

describe('commands-player-spells', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('every command has the required shape', () => {
    assertCommandShape(commands)
  })

  it('command names are unique', () => {
    assertUniqueCommandNames(commands)
  })

  it('command names are lowercase without leading slash', () => {
    assertCommandNameFormat(commands)
  })

  it('all spell commands are player category and not dmOnly', () => {
    for (const cmd of commands) {
      expect(cmd.category).toBe('player')
      expect(cmd.dmOnly).toBe(false)
    }
  })

  it('aliases are unique across all commands in the module', () => {
    const allAliases: string[] = []
    for (const cmd of commands) {
      allAliases.push(...cmd.aliases)
    }
    expect(new Set(allAliases).size).toBe(allAliases.length)
  })

  it('aliases do not collide with command names', () => {
    const names = new Set(commands.map((c) => c.name))
    for (const cmd of commands) {
      for (const alias of cmd.aliases) {
        expect(names.has(alias)).toBe(false)
      }
    }
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('cast')
    expect(names).toContain('pactmagic')
    expect(names).toContain('counterspell')
    expect(names).toContain('dispel')
    expect(names).toContain('identify')
    expect(names).toContain('smite')
    expect(names).toContain('sneakattack')
    expect(names).toContain('conccheck')
    expect(names).toContain('wildshape')
  })

  // ── /cast ──────────────────────────────────────────────────────────────

  describe('/cast command', () => {
    const castCmd = commands.find((c) => c.name === 'cast')!

    it('returns error when no args', () => {
      const result = castCmd.execute('', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for whitespace-only args', () => {
      const result = castCmd.execute('   ', makeCtx())
      expect(result.type).toBe('error')
    })

    it('broadcasts basic spell cast', () => {
      const result = castCmd.execute('Fireball', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('TestPlayer')
      expect(result.content).toContain('Fireball')
    })

    it('handles upcast with "at <level>"', () => {
      const result = castCmd.execute('Fireball at 5', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('upcast to level 5')
    })

    it('handles ritual flag', () => {
      const result = castCmd.execute('Detect Magic ritual', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ritual')
    })

    it('handles concentration flag', () => {
      const result = castCmd.execute('Bless concentration', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Concentration')
    })

    it('handles all modifiers combined', () => {
      const result = castCmd.execute('Hold Person at 4 ritual concentration', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('upcast to level 4')
      expect(result.content).toContain('Ritual')
      expect(result.content).toContain('Concentration')
    })

    it('strips modifiers from spell name', () => {
      const result = castCmd.execute('Shield at 3 ritual concentration', makeCtx())
      expect(result.content).toContain('Shield')
      // Should not have leftover keywords in the spell name portion
      expect(result.content).not.toMatch(/casts \*\*.*ritual.*\*\*/)
    })

    it('uses "a spell" as default name when only modifiers given', () => {
      const result = castCmd.execute('at 5 ritual', makeCtx())
      expect(result.content).toContain('a spell')
    })
  })

  // ── /pactmagic ─────────────────────────────────────────────────────────

  describe('/pactmagic command', () => {
    const pactCmd = commands.find((c) => c.name === 'pactmagic')!

    it('has pact alias', () => {
      expect(pactCmd.aliases).toContain('pact')
    })

    it('defaults to status when no args', () => {
      const result = pactCmd.execute('', makeCtx())
      expect(result.type).toBe('system')
      expect(result.content).toContain('Pact Magic')
    })

    it('handles use subcommand', () => {
      const result = pactCmd.execute('use', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('expends a Pact Magic slot')
    })

    it('handles restore subcommand', () => {
      const result = pactCmd.execute('restore', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('restores Pact Magic slots')
      expect(result.content).toContain('short rest')
    })

    it('defaults to status for unknown subcommand', () => {
      const result = pactCmd.execute('foobar', makeCtx())
      expect(result.type).toBe('system')
    })
  })

  // ── /counterspell ──────────────────────────────────────────────────────

  describe('/counterspell command', () => {
    const csCmd = commands.find((c) => c.name === 'counterspell')!

    it('has counter alias', () => {
      expect(csCmd.aliases).toContain('counter')
    })

    it('rolls ability check when no level given', () => {
      const result = csCmd.execute('', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ability check')
      expect(result.content).toContain('10') // mocked rollSingle returns 10
    })

    it('casts at specific level without ability check', () => {
      const result = csCmd.execute('5 Fireball', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('level 5')
      expect(result.content).toContain('Fireball')
      expect(result.content).not.toContain('Ability check')
    })

    it('includes target spell name when provided without level', () => {
      const result = csCmd.execute('Fireball', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Fireball')
    })

    it('rolls check for out-of-range level (0)', () => {
      const result = csCmd.execute('0 Fireball', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ability check')
    })

    it('rolls check for out-of-range level (10)', () => {
      const result = csCmd.execute('10 Shield', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ability check')
    })
  })

  // ── /dispel ────────────────────────────────────────────────────────────

  describe('/dispel command', () => {
    const dispelCmd = commands.find((c) => c.name === 'dispel')!

    it('has dispelmagic alias', () => {
      expect(dispelCmd.aliases).toContain('dispelmagic')
    })

    it('rolls check when no level given', () => {
      const result = dispelCmd.execute('', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ability check')
    })

    it('casts at specific level without check', () => {
      const result = dispelCmd.execute('5 Curse', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('level 5')
      expect(result.content).toContain('Curse')
      expect(result.content).not.toContain('Ability check')
    })

    it('includes target when provided without level', () => {
      const result = dispelCmd.execute('the barrier', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('the barrier')
    })

    it('rolls check for level below 3', () => {
      const result = dispelCmd.execute('2 shield', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ability check')
    })

    it('rolls check for level above 9', () => {
      const result = dispelCmd.execute('10 hex', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Ability check')
    })
  })

  // ── /identify ──────────────────────────────────────────────────────────

  describe('/identify command', () => {
    const idCmd = commands.find((c) => c.name === 'identify')!

    it('defaults target to "an item" when no args', () => {
      const result = idCmd.execute('', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('an item')
      expect(result.content).toContain('Identify')
      expect(result.content).toContain('ritual')
    })

    it('uses provided target', () => {
      const result = idCmd.execute('the mysterious sword', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('the mysterious sword')
    })
  })

  // ── /smite ─────────────────────────────────────────────────────────────

  describe('/smite command', () => {
    const smiteCmd = commands.find((c) => c.name === 'smite')!

    it('has divinesmite alias', () => {
      expect(smiteCmd.aliases).toContain('divinesmite')
    })

    it('returns error when no args', () => {
      const result = smiteCmd.execute('', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for level 0', () => {
      const result = smiteCmd.execute('0', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for level 6', () => {
      const result = smiteCmd.execute('6', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for non-numeric args', () => {
      const result = smiteCmd.execute('abc', makeCtx())
      expect(result.type).toBe('error')
    })

    it('rolls correct dice for level 1 (2d8)', () => {
      const result = smiteCmd.execute('1', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('2d8')
      expect(result.content).toContain('radiant damage')
    })

    it('rolls correct dice for level 5 (6d8 base = capped at 5+1)', () => {
      const result = smiteCmd.execute('5', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('6d8')
    })

    it('adds +1d8 vs undead', () => {
      const result = smiteCmd.execute('1 undead', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('3d8')
      expect(result.content).toContain('undead/fiend')
    })

    it('adds +1d8 vs fiend', () => {
      const result = smiteCmd.execute('1 fiend', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('3d8')
      expect(result.content).toContain('undead/fiend')
    })

    it('caps total dice at 6 for undead at high level', () => {
      // Level 5 = 6 base dice, +1 for undead = 7 but capped at min(7,6) = 6
      const result = smiteCmd.execute('5 undead', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('6d8')
    })

    it('includes player name', () => {
      const result = smiteCmd.execute('2', makeCtx({ playerName: 'Paladin' }))
      expect(result.content).toContain('Paladin')
    })
  })

  // ── /sneakattack ───────────────────────────────────────────────────────

  describe('/sneakattack command', () => {
    const saCmd = commands.find((c) => c.name === 'sneakattack')!

    it('has sneak and sa aliases', () => {
      expect(saCmd.aliases).toContain('sneak')
      expect(saCmd.aliases).toContain('sa')
    })

    it('returns error when no args', () => {
      const result = saCmd.execute('', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for 0 dice', () => {
      const result = saCmd.execute('0', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for 21 dice', () => {
      const result = saCmd.execute('21', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for non-numeric args', () => {
      const result = saCmd.execute('abc', makeCtx())
      expect(result.type).toBe('error')
    })

    it('rolls correct number of d6', () => {
      const result = saCmd.execute('5', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('5d6')
      expect(result.content).toContain('Sneak Attack')
    })

    it('calculates total from rolls', () => {
      // rollMultiple returns Array(5).fill(4), total = 20
      const result = saCmd.execute('5', makeCtx())
      expect(result.content).toContain('20')
    })

    it('works at max dice (20)', () => {
      const result = saCmd.execute('20', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('20d6')
    })
  })

  // ── /conccheck ─────────────────────────────────────────────────────────

  describe('/conccheck command', () => {
    const ccCmd = commands.find((c) => c.name === 'conccheck')!

    it('has concentrationcheck and concdc aliases', () => {
      expect(ccCmd.aliases).toContain('concentrationcheck')
      expect(ccCmd.aliases).toContain('concdc')
    })

    it('returns error when no args', () => {
      const result = ccCmd.execute('', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for non-numeric args', () => {
      const result = ccCmd.execute('abc', makeCtx())
      expect(result.type).toBe('error')
    })

    it('returns error for negative damage', () => {
      const result = ccCmd.execute('-5', makeCtx())
      expect(result.type).toBe('error')
    })

    it('calculates DC as max(10, damage/2) for low damage', () => {
      // damage=10, DC=max(10,5)=10. rollSingle mock returns 10, so 10>=10 = MAINTAINED
      const result = ccCmd.execute('10', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('DC 10')
      expect(result.content).toContain('MAINTAINED')
    })

    it('calculates DC for high damage', () => {
      // damage=30, DC=max(10,15)=15. rollSingle returns 10, so 10<15 = BROKEN
      const result = ccCmd.execute('30', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('DC 15')
      expect(result.content).toContain('BROKEN')
    })

    it('calculates DC for 0 damage', () => {
      // damage=0, DC=max(10,0)=10
      const result = ccCmd.execute('0', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('DC 10')
    })

    it('includes Concentration Check label', () => {
      const result = ccCmd.execute('10', makeCtx())
      expect(result.content).toContain('Concentration Check')
    })
  })

  // ── /wildshape ─────────────────────────────────────────────────────────

  describe('/wildshape command', () => {
    const wsCmd = commands.find((c) => c.name === 'wildshape')!

    it('has ws alias', () => {
      expect(wsCmd.aliases).toContain('ws')
    })

    it('returns error when no args', () => {
      const result = wsCmd.execute('', makeCtx())
      expect(result.type).toBe('error')
    })

    it('announces transformation with creature name', () => {
      const result = wsCmd.execute('Brown Bear', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Brown Bear')
      expect(result.content).toContain('Wild Shape')
    })

    it('includes HP when provided as last argument', () => {
      const result = wsCmd.execute('Dire Wolf 37', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Dire Wolf')
      expect(result.content).toContain('37 HP')
    })

    it('handles single-word creature without HP', () => {
      const result = wsCmd.execute('Spider', makeCtx())
      expect(result.type).toBe('broadcast')
      expect(result.content).toContain('Spider')
      expect(result.content).not.toContain('HP')
    })

    it('includes player name', () => {
      const result = wsCmd.execute('Wolf', makeCtx({ playerName: 'Druid' }))
      expect(result.content).toContain('Druid')
    })
  })
})
