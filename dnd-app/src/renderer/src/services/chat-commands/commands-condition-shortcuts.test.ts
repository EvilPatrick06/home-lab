import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// Stub crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-12345678' })

import { commands } from './commands-condition-shortcuts'
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

const EXPECTED_CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious'
]

describe('commands-condition-shortcuts', () => {
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

  it('exports all 14 standard 5e conditions', () => {
    expect(commands.length).toBe(14)
    const names = commands.map((c) => c.name)
    for (const condition of EXPECTED_CONDITIONS) {
      expect(names).toContain(condition)
    }
  })

  describe('condition command behavior (using blinded as example)', () => {
    const blindedCmd = commands.find((c) => c.name === 'blinded')!

    it('exists with blind alias', () => {
      expect(blindedCmd).toBeDefined()
      expect(blindedCmd.aliases).toContain('blind')
    })

    it('returns error when no target provided', () => {
      const result = blindedCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('applies condition to a target', () => {
      const result = blindedCmd.execute('Goblin', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Blinded')
      expect((result as { content: string }).content).toContain('applied')
      expect((result as { content: string }).content).toContain('Goblin')
    })

    it('applies condition with duration', () => {
      const result = blindedCmd.execute('Goblin 3', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('3 rounds')
    })

    it('applies condition with 1 round (singular)', () => {
      const result = blindedCmd.execute('Goblin 1', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('1 round')
      expect((result as { content: string }).content).not.toContain('1 rounds')
    })

    it('removes existing condition (toggle off)', async () => {
      const { useGameStore } = await import('../../stores/use-game-store')
      const removeCondition = vi.fn()
      vi.mocked(useGameStore.getState).mockReturnValueOnce({
        conditions: [
          {
            id: 'cond-1',
            entityId: 'goblin',
            entityName: 'Goblin',
            condition: 'Blinded',
            duration: 'permanent',
            source: 'TestPlayer',
            appliedRound: 1
          }
        ],
        maps: [],
        activeMapId: 'map-1',
        round: 1,
        addCondition: vi.fn(),
        removeCondition
      } as never)

      const result = blindedCmd.execute('Goblin', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('removed')
      expect(removeCondition).toHaveBeenCalledWith('cond-1')
    })

    it('calls addCondition when applying', async () => {
      const { useGameStore } = await import('../../stores/use-game-store')
      const addCondition = vi.fn()
      vi.mocked(useGameStore.getState).mockReturnValueOnce({
        conditions: [],
        maps: [],
        activeMapId: 'map-1',
        round: 1,
        addCondition,
        removeCondition: vi.fn()
      } as never)

      blindedCmd.execute('Orc 5', makeCtx())
      expect(addCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          entityName: 'Orc',
          condition: 'Blinded',
          duration: 5,
          source: 'TestPlayer',
          appliedRound: 1
        })
      )
    })
  })

  describe('specific condition aliases', () => {
    it('frightened has fear and scared aliases', () => {
      const cmd = commands.find((c) => c.name === 'frightened')!
      expect(cmd.aliases).toContain('fear')
      expect(cmd.aliases).toContain('scared')
    })

    it('incapacitated has incap alias', () => {
      const cmd = commands.find((c) => c.name === 'incapacitated')!
      expect(cmd.aliases).toContain('incap')
    })

    it('invisible has invis alias', () => {
      const cmd = commands.find((c) => c.name === 'invisible')!
      expect(cmd.aliases).toContain('invis')
    })

    it('unconscious has ko alias', () => {
      const cmd = commands.find((c) => c.name === 'unconscious')!
      expect(cmd.aliases).toContain('ko')
    })

    it('petrified has stone alias', () => {
      const cmd = commands.find((c) => c.name === 'petrified')!
      expect(cmd.aliases).toContain('stone')
    })

    it('prone has no aliases', () => {
      const cmd = commands.find((c) => c.name === 'prone')!
      expect(cmd.aliases).toEqual([])
    })
  })

  describe('each condition command applies the correct condition name', () => {
    for (const conditionName of EXPECTED_CONDITIONS) {
      it(`/${conditionName} applies "${conditionName.charAt(0).toUpperCase() + conditionName.slice(1)}"`, () => {
        const cmd = commands.find((c) => c.name === conditionName)!
        const result = cmd.execute('Target', makeCtx())
        expect(result).toHaveProperty('type', 'broadcast')
        const expectedCondition = conditionName.charAt(0).toUpperCase() + conditionName.slice(1)
        expect((result as { content: string }).content).toContain(expectedCondition)
      })
    }
  })
})
