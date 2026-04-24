import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 15)
}))

import { commands } from './commands-player-checks'
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

describe('commands-player-checks', () => {
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

  describe('/contest command', () => {
    const contestCmd = commands.find((c) => c.name === 'contest')!

    it('exists with opposed alias', () => {
      expect(contestCmd).toBeDefined()
      expect(contestCmd.aliases).toContain('opposed')
    })

    it('returns error when no args', () => {
      const result = contestCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with contested check result', () => {
      const result = contestCmd.execute('Strength vs Dexterity', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Contested Check')
      expect((result as { content: string }).content).toContain('Strength')
      expect((result as { content: string }).content).toContain('Dexterity')
    })

    it('defaults abilities when only partial input given', () => {
      const result = contestCmd.execute('Athletics', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Contested Check')
    })
  })

  describe('/passive command', () => {
    const passiveCmd = commands.find((c) => c.name === 'passive')!

    it('exists', () => {
      expect(passiveCmd).toBeDefined()
    })

    it('returns system message with passive score (10 + modifier)', () => {
      const result = passiveCmd.execute('Perception 5', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Passive')
      expect((result as { content: string }).content).toContain('Perception')
      expect((result as { content: string }).content).toContain('15')
    })

    it('defaults to 0 modifier when none given', () => {
      const result = passiveCmd.execute('Investigation', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('10')
    })
  })

  describe('/groupcheck command', () => {
    const gcCmd = commands.find((c) => c.name === 'groupcheck')!

    it('exists with gc alias', () => {
      expect(gcCmd).toBeDefined()
      expect(gcCmd.aliases).toContain('gc')
    })

    it('returns error when no args', () => {
      const result = gcCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with group check request (no DC)', () => {
      const result = gcCmd.execute('Stealth', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Group Check')
      expect((result as { content: string }).content).toContain('Stealth')
    })

    it('returns broadcast with group check request (with DC)', () => {
      const result = gcCmd.execute('Stealth 15', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('DC 15')
    })
  })

  describe('/ability command', () => {
    const abilityCmd = commands.find((c) => c.name === 'ability')!

    it('exists with ability score aliases', () => {
      expect(abilityCmd).toBeDefined()
      expect(abilityCmd.aliases).toContain('str')
      expect(abilityCmd.aliases).toContain('dex')
      expect(abilityCmd.aliases).toContain('con')
      expect(abilityCmd.aliases).toContain('int')
      expect(abilityCmd.aliases).toContain('wis')
      expect(abilityCmd.aliases).toContain('cha')
    })

    it('returns broadcast with ability check result (with modifier)', () => {
      const result = abilityCmd.execute('+3', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Ability Check')
    })

    it('works with no modifier (defaults to 0)', () => {
      const result = abilityCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Ability Check')
    })
  })

  describe('/save command', () => {
    const saveCmd = commands.find((c) => c.name === 'save')!

    it('exists with savingthrow and st aliases', () => {
      expect(saveCmd).toBeDefined()
      expect(saveCmd.aliases).toContain('savingthrow')
      expect(saveCmd.aliases).toContain('st')
    })

    it('returns error when ability not recognized', () => {
      const result = saveCmd.execute('xyz', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with saving throw result for valid ability', () => {
      const result = saveCmd.execute('str +2', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Saving Throw')
      expect((result as { content: string }).content).toContain('Strength')
    })

    it('works with full ability name', () => {
      const result = saveCmd.execute('dexterity', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Dexterity')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('contest')
    expect(names).toContain('passive')
    expect(names).toContain('groupcheck')
    expect(names).toContain('ability')
    expect(names).toContain('save')
  })
})
