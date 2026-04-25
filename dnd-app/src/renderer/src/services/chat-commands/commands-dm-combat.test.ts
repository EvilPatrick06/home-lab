import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertCommandNameFormat,
  assertCommandShape,
  assertUniqueCommandNames,
  createCommandContext
} from '../../test-helpers'

const mockGameState = {
  conditions: [
    {
      id: 'c1',
      entityId: 'tok-1',
      entityName: 'Goblin',
      condition: 'poisoned',
      duration: 3,
      source: 'command',
      appliedRound: 1
    }
  ],
  maps: [],
  activeMapId: 'map-1',
  round: 1,
  turnStates: {},
  flankingEnabled: false,
  groupInitiativeEnabled: false,
  diagonalRule: 'standard' as const,
  stopTimer: vi.fn(),
  startTimer: vi.fn(),
  setPendingGroupRoll: vi.fn(),
  addCondition: vi.fn(),
  removeCondition: vi.fn(),
  setFlankingEnabled: vi.fn(),
  setGroupInitiativeEnabled: vi.fn(),
  setDiagonalRule: vi.fn()
}

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => mockGameState)
  }
}))

vi.mock('./helpers', () => ({
  findTokenByName: vi.fn((name: string) => {
    if (name.toLowerCase() === 'goblin') return { id: 'tok-1', label: 'Goblin' }
    return null
  })
}))

import { commands } from './commands-dm-combat'
import { findTokenByName } from './helpers'

describe('commands-dm-combat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameState.flankingEnabled = false
    mockGameState.groupInitiativeEnabled = false
    mockGameState.diagonalRule = 'standard'
  })

  // ── Shape tests ──────────────────────────────────────────────
  it('every command has required fields', () => assertCommandShape(commands))
  it('names are unique', () => assertUniqueCommandNames(commands))
  it('names are lowercase without leading slash', () => assertCommandNameFormat(commands))

  it('all commands are dmOnly and dm category', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
      expect(cmd.category).toBe('dm')
    }
  })

  it('contains all 10 expected commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'initiative',
        'timer',
        'rollfor',
        'grouproll',
        'effect',
        'mob',
        'chase',
        'flanking',
        'groupinit',
        'diagonal'
      ])
    )
    expect(commands).toHaveLength(10)
  })

  it('aliases do not collide with command names', () => {
    const names = new Set(commands.map((c) => c.name))
    for (const cmd of commands) {
      for (const alias of cmd.aliases) {
        expect(names.has(alias)).toBe(false)
      }
    }
  })

  // ── /initiative ──────────────────────────────────────────────
  describe('initiative', () => {
    const cmd = () => commands.find((c) => c.name === 'initiative')!

    it('opens initiativeTracker modal', () => {
      const ctx = createCommandContext({ openModal: vi.fn() })
      cmd().execute('', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('initiativeTracker')
    })

    it('has alias "init"', () => {
      expect(cmd().aliases).toContain('init')
    })
  })

  // ── /timer ───────────────────────────────────────────────────
  describe('timer', () => {
    const cmd = () => commands.find((c) => c.name === 'timer')!

    it('starts timer with valid seconds', () => {
      const ctx = createCommandContext()
      cmd().execute('60', ctx)
      expect(mockGameState.startTimer).toHaveBeenCalledWith(60, 'Turn')
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('60 seconds'))
    })

    it('stops timer with "stop"', () => {
      const ctx = createCommandContext()
      cmd().execute('stop', ctx)
      expect(mockGameState.stopTimer).toHaveBeenCalled()
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('stopped'))
    })

    it('stops timer case-insensitive', () => {
      const ctx = createCommandContext()
      cmd().execute('STOP', ctx)
      expect(mockGameState.stopTimer).toHaveBeenCalled()
    })

    it('shows usage for non-numeric input', () => {
      const ctx = createCommandContext()
      cmd().execute('abc', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('shows usage for zero', () => {
      const ctx = createCommandContext()
      cmd().execute('0', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('shows usage for negative number', () => {
      const ctx = createCommandContext()
      cmd().execute('-5', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('shows usage for empty args', () => {
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })
  })

  // ── /rollfor ─────────────────────────────────────────────────
  describe('rollfor', () => {
    const cmd = () => commands.find((c) => c.name === 'rollfor')!

    it('shows usage when args missing', () => {
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('shows usage when only name given', () => {
      const ctx = createCommandContext()
      cmd().execute('Goblin', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('rejects invalid dice formula', () => {
      const ctx = createCommandContext()
      cmd().execute('Goblin abc', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid dice formula'))
    })

    it('rolls valid formula and broadcasts result', () => {
      const ctx = createCommandContext()
      cmd().execute('Goblin 1d20+5', ctx)
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringMatching(/Goblin rolled 1d20\+5/))
    })

    it('rolls formula without modifier', () => {
      const ctx = createCommandContext()
      cmd().execute('Orc 2d6', ctx)
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringMatching(/Orc rolled 2d6/))
    })

    it('rolls formula with negative modifier', () => {
      const ctx = createCommandContext()
      cmd().execute('Zombie d8-1', ctx)
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringMatching(/Zombie rolled 1d8-1/))
    })

    it('shows individual rolls for multi-die formulas', () => {
      const ctx = createCommandContext()
      cmd().execute('Dragon 3d6+4', ctx)
      // Multi-die shows [x, y, z] detail
      const call = (ctx.broadcastSystemMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(call).toMatch(/\[[\d, ]+\]/)
    })

    it('has alias "rf"', () => {
      expect(cmd().aliases).toContain('rf')
    })
  })

  // ── /grouproll ───────────────────────────────────────────────
  describe('grouproll', () => {
    const cmd = () => commands.find((c) => c.name === 'grouproll')!

    it('shows usage with insufficient args', () => {
      const ctx = createCommandContext()
      cmd().execute('ability', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('shows usage with empty args', () => {
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('rejects invalid DC', () => {
      const ctx = createCommandContext()
      cmd().execute('ability abc', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('DC must be'))
    })

    it('rejects zero DC', () => {
      const ctx = createCommandContext()
      cmd().execute('ability 0', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('DC must be'))
    })

    it('sets pending group roll and broadcasts', () => {
      const ctx = createCommandContext()
      cmd().execute('save 15', ctx)
      expect(mockGameState.setPendingGroupRoll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'save', dc: 15, isSecret: false, scope: 'all' })
      )
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('DC 15'))
    })

    it('handles secret group roll', () => {
      const ctx = createCommandContext()
      cmd().execute('skill 12 secret', ctx)
      expect(mockGameState.setPendingGroupRoll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'skill', dc: 12, isSecret: true })
      )
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Secret'))
    })

    it('has alias "gr"', () => {
      expect(cmd().aliases).toContain('gr')
    })
  })

  // ── /effect ──────────────────────────────────────────────────
  describe('effect', () => {
    const cmd = () => commands.find((c) => c.name === 'effect')!

    it('shows usage with insufficient args', () => {
      const ctx = createCommandContext()
      cmd().execute('add Goblin', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('shows usage with empty args', () => {
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    })

    it('rejects invalid action (not add/remove)', () => {
      const ctx = createCommandContext()
      cmd().execute('toggle Goblin poisoned', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('"add" or "remove"'))
    })

    it('reports missing token', () => {
      const ctx = createCommandContext()
      cmd().execute('add Unknown poisoned', ctx)
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Token not found'))
    })

    it('adds effect to found token', () => {
      const ctx = createCommandContext()
      cmd().execute('add Goblin stunned', ctx)
      expect(mockGameState.addCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'tok-1',
          entityName: 'Goblin',
          condition: 'stunned',
          duration: 'permanent',
          source: 'command'
        })
      )
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('stunned applied to Goblin'))
    })

    it('adds effect with duration', () => {
      const ctx = createCommandContext()
      cmd().execute('add Goblin blinded 3', ctx)
      expect(mockGameState.addCondition).toHaveBeenCalledWith(
        expect.objectContaining({ condition: 'blinded', duration: 3 })
      )
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('3 rounds'))
    })

    it('removes effect from token', () => {
      const ctx = createCommandContext()
      cmd().execute('remove Goblin poisoned', ctx)
      expect(mockGameState.removeCondition).toHaveBeenCalledWith('c1')
      expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('poisoned removed from Goblin'))
    })

    it('has alias "fx"', () => {
      expect(cmd().aliases).toContain('fx')
    })
  })

  // ── /mob ─────────────────────────────────────────────────────
  describe('mob', () => {
    it('opens mobCalculator modal', () => {
      const ctx = createCommandContext({ openModal: vi.fn() })
      commands.find((c) => c.name === 'mob')!.execute('', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('mobCalculator')
    })
  })

  // ── /chase ───────────────────────────────────────────────────
  describe('chase', () => {
    it('opens chaseTracker modal', () => {
      const ctx = createCommandContext({ openModal: vi.fn() })
      commands.find((c) => c.name === 'chase')!.execute('', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('chaseTracker')
    })
  })

  // ── /flanking ────────────────────────────────────────────────
  describe('flanking', () => {
    const cmd = () => commands.find((c) => c.name === 'flanking')!

    it('enables with "on"', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('on', ctx)
      expect(mockGameState.setFlankingEnabled).toHaveBeenCalledWith(true)
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Enabled') })
    })

    it('disables with "off"', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('off', ctx)
      expect(mockGameState.setFlankingEnabled).toHaveBeenCalledWith(false)
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Disabled') })
    })

    it('toggles when no arg given (currently off -> on)', () => {
      mockGameState.flankingEnabled = false
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(mockGameState.setFlankingEnabled).toHaveBeenCalledWith(true)
    })

    it('toggles when no arg given (currently on -> off)', () => {
      mockGameState.flankingEnabled = true
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(mockGameState.setFlankingEnabled).toHaveBeenCalledWith(false)
    })

    it('has alias "flank"', () => {
      expect(cmd().aliases).toContain('flank')
    })
  })

  // ── /groupinit ───────────────────────────────────────────────
  describe('groupinit', () => {
    const cmd = () => commands.find((c) => c.name === 'groupinit')!

    it('enables with "on"', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('on', ctx)
      expect(mockGameState.setGroupInitiativeEnabled).toHaveBeenCalledWith(true)
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Enabled') })
    })

    it('disables with "off"', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('off', ctx)
      expect(mockGameState.setGroupInitiativeEnabled).toHaveBeenCalledWith(false)
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Disabled') })
    })

    it('toggles when no arg given', () => {
      mockGameState.groupInitiativeEnabled = false
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(mockGameState.setGroupInitiativeEnabled).toHaveBeenCalledWith(true)
    })

    it('has alias "groupinitiative"', () => {
      expect(cmd().aliases).toContain('groupinitiative')
    })

    it('mentions identical monster types in message', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('on', ctx)
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('identical monster types') })
    })
  })

  // ── /diagonal ────────────────────────────────────────────────
  describe('diagonal', () => {
    const cmd = () => commands.find((c) => c.name === 'diagonal')!

    it('sets alternate with "on"', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('on', ctx)
      expect(mockGameState.setDiagonalRule).toHaveBeenCalledWith('alternate')
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('5/10/5/10') })
    })

    it('sets alternate with "alternate"', () => {
      const ctx = createCommandContext()
      cmd().execute('alternate', ctx)
      expect(mockGameState.setDiagonalRule).toHaveBeenCalledWith('alternate')
    })

    it('sets standard with "off"', () => {
      const ctx = createCommandContext()
      const result = cmd().execute('off', ctx)
      expect(mockGameState.setDiagonalRule).toHaveBeenCalledWith('standard')
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Standard') })
    })

    it('sets standard with "standard"', () => {
      const ctx = createCommandContext()
      cmd().execute('standard', ctx)
      expect(mockGameState.setDiagonalRule).toHaveBeenCalledWith('standard')
    })

    it('toggles when no arg given (standard -> alternate)', () => {
      mockGameState.diagonalRule = 'standard'
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(mockGameState.setDiagonalRule).toHaveBeenCalledWith('alternate')
    })

    it('toggles when no arg given (alternate -> standard)', () => {
      mockGameState.diagonalRule = 'alternate'
      const ctx = createCommandContext()
      cmd().execute('', ctx)
      expect(mockGameState.setDiagonalRule).toHaveBeenCalledWith('standard')
    })

    it('has alias "diag"', () => {
      expect(cmd().aliases).toContain('diag')
    })
  })
})
