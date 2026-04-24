import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      flankingEnabled: false,
      groupInitiativeEnabled: false,
      diagonalRule: 'standard',
      stopTimer: vi.fn(),
      startTimer: vi.fn(),
      setPendingGroupRoll: vi.fn(),
      addCondition: vi.fn(),
      removeCondition: vi.fn(),
      setFlankingEnabled: vi.fn(),
      setGroupInitiativeEnabled: vi.fn(),
      setDiagonalRule: vi.fn()
    }))
  }
}))

vi.mock('./helpers', () => ({
  findTokenByName: vi.fn()
}))

import { commands } from './commands-dm-combat'

describe('commands-dm-combat', () => {
  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('each command has required fields', () => {
    for (const cmd of commands) {
      expect(cmd).toHaveProperty('name')
      expect(cmd).toHaveProperty('description')
      expect(cmd).toHaveProperty('execute')
      expect(typeof cmd.name).toBe('string')
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.execute).toBe('function')
    }
  })

  it('each command has aliases array, usage string, category, and dmOnly flag', () => {
    for (const cmd of commands) {
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(typeof cmd.usage).toBe('string')
      expect(typeof cmd.category).toBe('string')
      expect(typeof cmd.dmOnly).toBe('boolean')
    }
  })

  it('command names are unique', () => {
    const names = commands.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('command names are lowercase strings without leading slash', () => {
    for (const cmd of commands) {
      expect(cmd.name).not.toMatch(/^\//)
      expect(cmd.name).toBe(cmd.name.toLowerCase())
    }
  })

  it('contains expected combat commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('initiative')
    expect(names).toContain('timer')
    expect(names).toContain('rollfor')
    expect(names).toContain('grouproll')
    expect(names).toContain('effect')
    expect(names).toContain('mob')
    expect(names).toContain('chase')
    expect(names).toContain('flanking')
    expect(names).toContain('groupinit')
    expect(names).toContain('diagonal')
  })

  it('initiative command opens modal', () => {
    const init = commands.find((c) => c.name === 'initiative')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn(),
      openModal: vi.fn()
    }
    init.execute('', ctx)
    expect(ctx.openModal).toHaveBeenCalledWith('initiativeTracker')
  })

  it('timer command shows usage for invalid input', () => {
    const timer = commands.find((c) => c.name === 'timer')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    timer.execute('abc', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('rollfor command shows usage when args missing', () => {
    const rollfor = commands.find((c) => c.name === 'rollfor')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    rollfor.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('flanking command toggles and returns broadcast result', () => {
    const flanking = commands.find((c) => c.name === 'flanking')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = flanking.execute('on', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Enabled') })
  })

  it('diagonal command toggles alternate rule', () => {
    const diag = commands.find((c) => c.name === 'diagonal')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = diag.execute('on', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('5/10/5/10') })
  })

  it('mob command opens mobCalculator modal', () => {
    const mob = commands.find((c) => c.name === 'mob')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn(),
      openModal: vi.fn()
    }
    mob.execute('', ctx)
    expect(ctx.openModal).toHaveBeenCalledWith('mobCalculator')
  })

  it('all combat commands are dmOnly', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
    }
  })
})
