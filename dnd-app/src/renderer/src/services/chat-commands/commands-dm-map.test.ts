import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/data-provider', () => ({
  load5eMonsters: vi.fn(() =>
    Promise.resolve([
      { name: 'Goblin', size: 'Small', hp: 7, ac: 15 },
      { name: 'Dragon', size: 'Huge', hp: 200, ac: 19 }
    ])
  )
}))

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [
        {
          id: 'map-1',
          name: 'Dungeon',
          tokens: [
            { id: 't1', label: 'Goblin', entityType: 'enemy', gridX: 5, gridY: 5, visibleToPlayers: true },
            { id: 't2', label: 'Fighter', entityType: 'player', gridX: 10, gridY: 10, visibleToPlayers: true }
          ]
        }
      ],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      setActiveMap: vi.fn(),
      addToken: vi.fn(),
      removeToken: vi.fn(),
      updateToken: vi.fn(),
      setAmbientLight: vi.fn()
    }))
  }
}))

import { commands } from './commands-dm-map'

describe('commands-dm-map', () => {
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

  it('contains expected map commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('fog')
    expect(names).toContain('map')
    expect(names).toContain('token')
    expect(names).toContain('summon')
    expect(names).toContain('light')
    expect(names).toContain('elevate')
    expect(names).toContain('measure')
    expect(names).toContain('grid')
    expect(names).toContain('zoom')
    expect(names).toContain('center')
    expect(names).toContain('darkness')
    expect(names).toContain('setweather')
    expect(names).toContain('sunmoon')
    expect(names).toContain('tokenclone')
    expect(names).toContain('tokenhide')
    expect(names).toContain('tokenshow')
    expect(names).toContain('tokenmove')
  })

  it('fog command shows usage for invalid action', () => {
    const fog = commands.find((c) => c.name === 'fog')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    fog.execute('badaction', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('fog reveal all broadcasts message', () => {
    const fog = commands.find((c) => c.name === 'fog')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    fog.execute('reveal all', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('revealed'))
  })

  it('map command shows usage when no args', () => {
    const map = commands.find((c) => c.name === 'map')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    map.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('token command shows usage for invalid action', () => {
    const token = commands.find((c) => c.name === 'token')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    token.execute('badaction', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('token add command places a token', () => {
    const token = commands.find((c) => c.name === 'token')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    token.execute('add Orc 5 10', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Orc'))
  })

  it('light command shows usage for empty input', () => {
    const light = commands.find((c) => c.name === 'light')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    light.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('light command rejects invalid level', () => {
    const light = commands.find((c) => c.name === 'light')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    light.execute('purple', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('bright, dim, or dark'))
  })

  it('light command accepts valid levels', () => {
    const light = commands.find((c) => c.name === 'light')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    light.execute('bright', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('bright'))
  })

  it('measure command returns distance calculation', () => {
    const measure = commands.find((c) => c.name === 'measure')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = measure.execute('0 0 3 4', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('ft') })
  })

  it('measure command shows usage with insufficient args', () => {
    const measure = commands.find((c) => c.name === 'measure')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    measure.execute('1 2', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('grid command handles show/hide/size', () => {
    const grid = commands.find((c) => c.name === 'grid')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    expect(grid.execute('show', ctx)).toEqual({ type: 'system', content: 'Grid visible.' })
    expect(grid.execute('hide', ctx)).toEqual({ type: 'system', content: 'Grid hidden.' })
  })

  it('grid size rejects out-of-range values', () => {
    const grid = commands.find((c) => c.name === 'grid')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = grid.execute('size 200', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('20-100') })
  })

  it('zoom command handles valid inputs', () => {
    const zoom = commands.find((c) => c.name === 'zoom')!
    expect(zoom.execute('in', {} as never)).toEqual({ type: 'system', content: expect.stringContaining('Zoomed in') })
    expect(zoom.execute('out', {} as never)).toEqual({ type: 'system', content: expect.stringContaining('Zoomed out') })
    expect(zoom.execute('reset', {} as never)).toEqual({ type: 'system', content: expect.stringContaining('100%') })
    expect(zoom.execute('150', {} as never)).toEqual({ type: 'system', content: expect.stringContaining('150%') })
  })

  it('zoom command returns error for invalid input', () => {
    const zoom = commands.find((c) => c.name === 'zoom')!
    const result = zoom.execute('sideways', {} as never)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('center command returns error without input', () => {
    const center = commands.find((c) => c.name === 'center')!
    const result = center.execute('', {} as never)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('center command returns system message with input', () => {
    const center = commands.find((c) => c.name === 'center')!
    const result = center.execute('Fighter', {} as never)
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Fighter') })
  })

  it('darkness command returns broadcast with radius', () => {
    const darkness = commands.find((c) => c.name === 'darkness')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = darkness.execute('30', ctx)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('30 ft') })
  })

  it('setweather command rejects invalid weather', () => {
    const setweather = commands.find((c) => c.name === 'setweather')!
    const result = setweather.execute('tornado', {} as never)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Valid weather') })
  })

  it('setweather command accepts valid weather', () => {
    const setweather = commands.find((c) => c.name === 'setweather')!
    const result = setweather.execute('rain', {} as never)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('rain') })
  })

  it('sunmoon command rejects invalid phase', () => {
    const sunmoon = commands.find((c) => c.name === 'sunmoon')!
    const result = sunmoon.execute('afternoon', {} as never)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Valid phases') })
  })

  it('sunmoon command accepts valid phase', () => {
    const sunmoon = commands.find((c) => c.name === 'sunmoon')!
    const result = sunmoon.execute('dusk', {} as never)
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('dusk') })
  })

  it('elevate command shows usage with insufficient args', () => {
    const elevate = commands.find((c) => c.name === 'elevate')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    elevate.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('measure and zoom commands are not dmOnly', () => {
    const measure = commands.find((c) => c.name === 'measure')!
    const zoom = commands.find((c) => c.name === 'zoom')!
    const center = commands.find((c) => c.name === 'center')!
    expect(measure.dmOnly).toBe(false)
    expect(zoom.dmOnly).toBe(false)
    expect(center.dmOnly).toBe(false)
  })
})
