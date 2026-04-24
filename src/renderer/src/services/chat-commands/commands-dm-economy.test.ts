import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      players: [
        { displayName: 'Alice', characterId: 'char-1' },
        { displayName: 'Bob', characterId: 'char-2' }
      ],
      addChatMessage: vi.fn()
    }))
  }
}))

vi.mock('../../types/character', () => ({
  is5eCharacter: vi.fn(() => true)
}))

vi.mock('./helpers', () => ({
  getLatestCharacter: vi.fn((id: string) => {
    if (id === 'char-1')
      return {
        id: 'char-1',
        name: 'Alice the Brave',
        system: '5e',
        level: 5,
        xp: 1000,
        treasure: { gp: 100 },
        magicItems: [{ name: 'Wand of Fireballs', identified: false }]
      }
    if (id === 'char-2')
      return {
        id: 'char-2',
        name: 'Bob the Bold',
        system: '5e',
        level: 10,
        xp: 5000,
        treasure: { gp: 200 },
        magicItems: []
      }
    return null
  }),
  saveAndBroadcastCharacter: vi.fn()
}))

import { commands } from './commands-dm-economy'

describe('commands-dm-economy', () => {
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

  it('contains expected economy commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('dmgold')
    expect(names).toContain('xp')
    expect(names).toContain('level')
    expect(names).toContain('loot')
    expect(names).toContain('encounter')
    expect(names).toContain('shopadd')
    expect(names).toContain('shopremove')
    expect(names).toContain('identify')
  })

  it('dmgold command shows usage with invalid args', async () => {
    const dmgold = commands.find((c) => c.name === 'dmgold')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await dmgold.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('dmgold command awards gold to a player', async () => {
    const dmgold = commands.find((c) => c.name === 'dmgold')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await dmgold.execute('Alice 50', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('50 gold'))
  })

  it('xp command shows error with no args', async () => {
    const xp = commands.find((c) => c.name === 'xp')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await xp.execute('', ctx)
    // ''.split(/\s+/) = [''] (length 1), parseInt('') = NaN → "positive number" message
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('positive number'))
  })

  it('xp command rejects non-positive amounts', async () => {
    const xp = commands.find((c) => c.name === 'xp')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await xp.execute('-100', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('positive number'))
  })

  it('xp command awards XP to all players', async () => {
    const xp = commands.find((c) => c.name === 'xp')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await xp.execute('500 all', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('500 XP'))
  })

  it('level command shows usage with no args', async () => {
    const level = commands.find((c) => c.name === 'level')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await level.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('level command levels up a player', async () => {
    const level = commands.find((c) => c.name === 'level')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    await level.execute('Alice', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('leveled up'))
  })

  it('loot command opens treasure generator modal', () => {
    const loot = commands.find((c) => c.name === 'loot')!
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
    loot.execute('', ctx)
    expect(ctx.openModal).toHaveBeenCalledWith('treasureGenerator')
  })

  it('encounter command opens encounter builder modal', () => {
    const encounter = commands.find((c) => c.name === 'encounter')!
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
    encounter.execute('', ctx)
    expect(ctx.openModal).toHaveBeenCalledWith('encounterBuilder')
  })

  it('shopadd command shows usage with invalid format', () => {
    const shopadd = commands.find((c) => c.name === 'shopadd')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    shopadd.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('shopadd command broadcasts item addition', () => {
    const shopadd = commands.find((c) => c.name === 'shopadd')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    shopadd.execute('Longsword 15', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Longsword'))
  })

  it('shopremove command shows usage with no args', () => {
    const shopremove = commands.find((c) => c.name === 'shopremove')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    shopremove.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('shopremove command broadcasts item removal', () => {
    const shopremove = commands.find((c) => c.name === 'shopremove')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    shopremove.execute('Longsword', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Longsword'))
  })

  it('identify command shows usage with no args', () => {
    const identify = commands.find((c) => c.name === 'identify')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    identify.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('all economy commands are dmOnly', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
    }
  })
})
