import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [
        { id: 'map-1', name: 'Dungeon', tokens: [] },
        { id: 'map-2', name: 'Town', tokens: [] }
      ],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      inGameTime: { totalSeconds: 3600 * 48 }
    }))
  }
}))

import { commands } from './commands-dm-campaign'

describe('commands-dm-campaign', () => {
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

  it('contains expected campaign commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('calendar')
    expect(names).toContain('journal')
    expect(names).toContain('handout')
    expect(names).toContain('session')
    expect(names).toContain('snapshot')
    expect(names).toContain('maplist')
  })

  it('calendar show subcommand returns time info', () => {
    const calendar = commands.find((c) => c.name === 'calendar')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = calendar.execute('show', ctx)
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Day') })
  })

  it('calendar with no args defaults to show', () => {
    const calendar = commands.find((c) => c.name === 'calendar')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = calendar.execute('', ctx)
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Day') })
  })

  it('calendar event add returns error without description', () => {
    const calendar = commands.find((c) => c.name === 'calendar')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = calendar.execute('event add', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('calendar event add with description returns broadcast', () => {
    const calendar = commands.find((c) => c.name === 'calendar')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = calendar.execute('event add Festival of Lights', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Festival of Lights') })
  })

  it('journal entry subcommand returns error without text', () => {
    const journal = commands.find((c) => c.name === 'journal')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = journal.execute('entry', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('journal show subcommand opens modal', () => {
    const journal = commands.find((c) => c.name === 'journal')!
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
    journal.execute('show', ctx)
    expect(ctx.openModal).toHaveBeenCalledWith('notes')
  })

  it('handout share returns broadcast with title', () => {
    const handout = commands.find((c) => c.name === 'handout')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = handout.execute('share Ancient Map', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Ancient Map') })
  })

  it('handout returns error without proper args', () => {
    const handout = commands.find((c) => c.name === 'handout')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = handout.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('session start returns broadcast', () => {
    const session = commands.find((c) => c.name === 'session')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = session.execute('start', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Session Started') })
  })

  it('session end returns broadcast', () => {
    const session = commands.find((c) => c.name === 'session')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = session.execute('end', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Session Ended') })
  })

  it('session with unknown arg returns error', () => {
    const session = commands.find((c) => c.name === 'session')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = session.execute('badarg', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('snapshot save returns system message', () => {
    const snapshot = commands.find((c) => c.name === 'snapshot')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = snapshot.execute('', ctx)
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('snapshot saved') })
  })

  it('snapshot restore returns system message', () => {
    const snapshot = commands.find((c) => c.name === 'snapshot')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = snapshot.execute('restore', ctx)
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('restore') })
  })

  it('maplist lists available maps', () => {
    const maplist = commands.find((c) => c.name === 'maplist')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = maplist.execute('', ctx)
    expect(result).toEqual({
      type: 'system',
      content: expect.stringContaining('Maps (2)')
    })
  })

  it('all campaign commands are dmOnly', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
    }
  })
})
