import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock helpers
vi.mock('./helpers', () => ({
  getLatestCharacter: vi.fn(),
  broadcastDiceResult: vi.fn()
}))

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      players: [
        { displayName: 'Alice', peerId: 'peer-1', isHost: true },
        { displayName: 'Bob', peerId: 'peer-2', isHost: false }
      ],
      addChatMessage: vi.fn()
    }))
  }
}))

vi.mock('../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      localPeerId: 'local',
      sendMessage: vi.fn(),
      role: 'host'
    }))
  }
}))

vi.mock('../../data/skills', () => ({
  SKILLS_5E: [
    { name: 'Athletics', ability: 'STR', description: '', uses: '' },
    { name: 'Acrobatics', ability: 'DEX', description: '', uses: '' },
    { name: 'Stealth', ability: 'DEX', description: '', uses: '' },
    { name: 'Perception', ability: 'WIS', description: '', uses: '' }
  ]
}))

vi.mock('../../types/character-common', async () => {
  const actual = await vi.importActual<typeof import('../../types/character-common')>('../../types/character-common')
  return actual
})

import type { Character5e } from '../../types/character-5e'
import { commands } from './commands-player-utility'
import { getLatestCharacter } from './helpers'
import type { CommandContext } from './types'

function makeChar(overrides: Partial<Character5e> = {}): Character5e {
  return {
    id: 'char-1',
    system: '5e',
    name: 'Thorin',
    level: 5,
    hitPoints: { maximum: 40, current: 30, temporary: 0 },
    abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 13, charisma: 8 },
    proficiencies: { savingThrows: ['strength', 'constitution'] },
    skills: [
      { name: 'Athletics', proficient: true, expertise: false },
      { name: 'Perception', proficient: false, expertise: false }
    ],
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

describe('commands-player-utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  describe('/save command', () => {
    const saveCmd = commands.find((c) => c.name === 'save')!

    it('exists', () => {
      expect(saveCmd).toBeDefined()
    })

    it('returns error when no character', () => {
      const result = saveCmd.execute('str', makeCtx({ character: null }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error when no args', () => {
      const result = saveCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error for unknown ability', () => {
      const result = saveCmd.execute('xyz', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast for valid ability', () => {
      const result = saveCmd.execute('str', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Strength')
      expect((result as { content: string }).content).toContain('Save')
    })

    it('marks proficiency when applicable', () => {
      const result = saveCmd.execute('str', makeCtx())
      expect((result as { content: string }).content).toContain('proficient')
    })
  })

  describe('/check command', () => {
    const checkCmd = commands.find((c) => c.name === 'check')!

    it('exists', () => {
      expect(checkCmd).toBeDefined()
    })

    it('returns error when no character', () => {
      const result = checkCmd.execute('athletics', makeCtx({ character: null }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error when no args', () => {
      const result = checkCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast for valid skill', () => {
      const result = checkCmd.execute('athletics', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Athletics')
      expect((result as { content: string }).content).toContain('Check')
    })

    it('returns broadcast for raw ability check', () => {
      const result = checkCmd.execute('str', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Strength')
      expect((result as { content: string }).content).toContain('Check')
    })

    it('returns error for unknown skill/ability', () => {
      const result = checkCmd.execute('nonexistent', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })
  })

  describe('/rest command', () => {
    const restCmd = commands.find((c) => c.name === 'rest')!

    it('exists with shortrest alias', () => {
      expect(restCmd).toBeDefined()
      expect(restCmd.aliases).toContain('shortrest')
    })

    it('returns error when no character', () => {
      const result = restCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with short rest message', () => {
      const result = restCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Short Rest')
    })
  })

  describe('/longrest command', () => {
    const longrestCmd = commands.find((c) => c.name === 'longrest')!

    it('exists', () => {
      expect(longrestCmd).toBeDefined()
    })

    it('returns error when no character', () => {
      const result = longrestCmd.execute('', makeCtx({ character: null }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with long rest message', () => {
      const result = longrestCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Long Rest')
    })
  })

  describe('/attack command', () => {
    const attackCmd = commands.find((c) => c.name === 'attack')!

    it('exists', () => {
      expect(attackCmd).toBeDefined()
    })

    it('returns system message directing to character sheet', () => {
      const result = attackCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
    })
  })

  describe('/help command', () => {
    const helpCmd = commands.find((c) => c.name === 'help')!

    it('exists with commands and ? aliases', () => {
      expect(helpCmd).toBeDefined()
      expect(helpCmd.aliases).toContain('commands')
      expect(helpCmd.aliases).toContain('?')
    })

    it('returns system message with command list when no args', () => {
      const result = helpCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Chat Commands')
    })

    it('returns lookup reference for specific command', () => {
      const result = helpCmd.execute('roll', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('roll')
    })
  })

  describe('/w command (whisper)', () => {
    const wCmd = commands.find((c) => c.name === 'w')!

    it('exists with whisper, msg, pm aliases', () => {
      expect(wCmd).toBeDefined()
      expect(wCmd.aliases).toContain('whisper')
      expect(wCmd.aliases).toContain('msg')
      expect(wCmd.aliases).toContain('pm')
    })

    it('returns error when too few args', () => {
      const result = wCmd.execute('Alice', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error when player not found', () => {
      const result = wCmd.execute('Unknown hello', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns whisper message to found player', () => {
      const result = wCmd.execute('Alice hello there!', makeCtx())
      expect(result).toHaveProperty('type', 'whisper')
      expect((result as { content: string }).content).toContain('Alice')
    })
  })

  describe('/ref command', () => {
    const refCmd = commands.find((c) => c.name === 'ref')!

    it('exists with reference alias', () => {
      expect(refCmd).toBeDefined()
      expect(refCmd.aliases).toContain('reference')
    })

    it('returns available topics when no args', () => {
      const result = refCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Available topics')
    })

    it('returns content for known topic "conditions"', () => {
      const result = refCmd.execute('conditions', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Conditions')
    })

    it('returns content for partial topic match "cond"', () => {
      const result = refCmd.execute('cond', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Conditions')
    })

    it('returns error for unknown topic', () => {
      const result = refCmd.execute('nonexistent', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('save')
    expect(names).toContain('check')
    expect(names).toContain('rest')
    expect(names).toContain('longrest')
    expect(names).toContain('attack')
    expect(names).toContain('help')
    expect(names).toContain('w')
    expect(names).toContain('ref')
  })
})
