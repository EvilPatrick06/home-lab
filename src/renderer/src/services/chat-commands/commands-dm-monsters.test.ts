import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [
        {
          id: 'map-1',
          name: 'Test Map',
          tokens: [
            { id: 't1', label: 'Goblin', entityType: 'enemy', currentHP: 10, maxHP: 10 },
            { id: 't2', label: 'Fighter', entityType: 'player', currentHP: 30, maxHP: 50 }
          ]
        }
      ],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      updateToken: vi.fn()
    }))
  }
}))

import { commands } from './commands-dm-monsters'

describe('commands-dm-monsters', () => {
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

  it('contains expected monster commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('statblock')
    expect(names).toContain('cr')
    expect(names).toContain('spawn')
    expect(names).toContain('kill')
    expect(names).toContain('legendary')
    expect(names).toContain('lair')
    expect(names).toContain('healall')
    expect(names).toContain('npcmood')
    expect(names).toContain('npcsay')
    expect(names).toContain('revive')
  })

  it('statblock command returns error when no name given', () => {
    const statblock = commands.find((c) => c.name === 'statblock')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn(),
      openModalWithArgs: vi.fn()
    }
    const result = statblock.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('statblock command opens creatures modal with search arg', () => {
    const statblock = commands.find((c) => c.name === 'statblock')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn(),
      openModalWithArgs: vi.fn()
    }
    statblock.execute('Goblin', ctx)
    expect(ctx.openModalWithArgs).toHaveBeenCalledWith('creatures', { search: 'Goblin' })
  })

  it('cr command returns error when no rating given', () => {
    const cr = commands.find((c) => c.name === 'cr')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn(),
      openModalWithArgs: vi.fn()
    }
    const result = cr.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('spawn command returns error when no name given', () => {
    const spawn = commands.find((c) => c.name === 'spawn')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = spawn.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('spawn command enforces count limits', () => {
    const spawn = commands.find((c) => c.name === 'spawn')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = spawn.execute('Goblin x25', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('between 1 and 20') })
  })

  it('spawn command broadcasts correct message with count', () => {
    const spawn = commands.find((c) => c.name === 'spawn')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = spawn.execute('Goblin x3', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('3x') })
  })

  it('kill command returns error when no target given', () => {
    const kill = commands.find((c) => c.name === 'kill')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = kill.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('legendary command returns error when insufficient args', () => {
    const legendary = commands.find((c) => c.name === 'legendary')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = legendary.execute('Dragon', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('legendary command returns broadcast with creature and action', () => {
    const legendary = commands.find((c) => c.name === 'legendary')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = legendary.execute('Dragon Tail Attack', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Dragon') })
  })

  it('lair command returns error when no description given', () => {
    const lair = commands.find((c) => c.name === 'lair')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = lair.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('npcmood command rejects invalid mood', () => {
    const npcmood = commands.find((c) => c.name === 'npcmood')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = npcmood.execute('Guard angry', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Mood must be') })
  })

  it('npcmood command accepts valid mood', () => {
    const npcmood = commands.find((c) => c.name === 'npcmood')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = npcmood.execute('Guard friendly', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Friendly') })
  })

  it('npcsay command returns error without proper args', () => {
    const npcsay = commands.find((c) => c.name === 'npcsay')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = npcsay.execute('', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('all monster commands are dmOnly', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
    }
  })
})
