import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertCommandShape, assertUniqueCommandNames, createCommandContext } from '../../test-helpers'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      setAmbientLight: vi.fn(),
      updateToken: vi.fn()
    }))
  }
}))

import { useGameStore } from '../../stores/use-game-store'
import {
  centerCommand,
  darknessCommand,
  elevateCommand,
  fogCommand,
  gridCommand,
  lightCommand,
  sunmoonCommand,
  weatherCommand2,
  zoomCommand
} from './map-environment-commands'

const makeCtx = createCommandContext

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fogCommand', () => {
  it('has correct metadata', () => {
    expect(fogCommand.name).toBe('fog')
    expect(fogCommand.dmOnly).toBe(true)
    expect(fogCommand.category).toBe('dm')
  })

  it('shows usage for invalid action', () => {
    const ctx = makeCtx()
    fogCommand.execute('invalid', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('broadcasts when revealing all fog', () => {
    const ctx = makeCtx()
    fogCommand.execute('reveal all', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('revealed'))
  })

  it('broadcasts when hiding all fog', () => {
    const ctx = makeCtx()
    fogCommand.execute('hide all', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('restored'))
  })

  it('shows tool hint for reveal without all', () => {
    const ctx = makeCtx()
    fogCommand.execute('reveal', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('fog brush tool'))
  })

  it('shows tool hint for hide without all', () => {
    const ctx = makeCtx()
    fogCommand.execute('hide', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('fog brush tool'))
  })
})

describe('lightCommand', () => {
  it('has correct metadata', () => {
    expect(lightCommand.name).toBe('light')
    expect(lightCommand.dmOnly).toBe(true)
  })

  it('shows usage when no args', () => {
    const ctx = makeCtx()
    lightCommand.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('sets bright light', () => {
    const setAmbientLight = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({ setAmbientLight } as any)
    const ctx = makeCtx()
    lightCommand.execute('bright', ctx)
    expect(setAmbientLight).toHaveBeenCalledWith('bright')
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('bright'))
  })

  it('sets dim light', () => {
    const setAmbientLight = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({ setAmbientLight } as any)
    const ctx = makeCtx()
    lightCommand.execute('dim', ctx)
    expect(setAmbientLight).toHaveBeenCalledWith('dim')
  })

  it('sets darkness', () => {
    const setAmbientLight = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({ setAmbientLight } as any)
    const ctx = makeCtx()
    lightCommand.execute('dark', ctx)
    expect(setAmbientLight).toHaveBeenCalledWith('darkness')
  })

  it('shows error for invalid light level', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({} as any)
    const ctx = makeCtx()
    lightCommand.execute('purple', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('must be'))
  })
})

describe('elevateCommand', () => {
  it('has correct metadata', () => {
    expect(elevateCommand.name).toBe('elevate')
    expect(elevateCommand.aliases).toContain('elevation')
    expect(elevateCommand.dmOnly).toBe(true)
  })

  it('shows usage when insufficient args', () => {
    const ctx = makeCtx()
    elevateCommand.execute('Goblin', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('shows error for non-numeric height', () => {
    const ctx = makeCtx()
    elevateCommand.execute('Goblin high', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid height'))
  })

  it('shows error when no active map', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: null,
      maps: [],
      updateToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    elevateCommand.execute('Goblin 30', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith('No active map. Load a map first.')
  })

  it('updates token elevation and broadcasts for positive elevation', () => {
    const updateToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      updateToken
    } as any)
    const ctx = makeCtx()
    elevateCommand.execute('Goblin 30', ctx)
    expect(updateToken).toHaveBeenCalledWith('map-1', 't1', { elevation: 30 })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('30 ft elevation'))
  })

  it('broadcasts landing message for elevation 0', () => {
    const updateToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      updateToken
    } as any)
    const ctx = makeCtx()
    elevateCommand.execute('Goblin 0', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('lands on the ground'))
  })

  it('broadcasts descend message for negative elevation', () => {
    const updateToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      updateToken
    } as any)
    const ctx = makeCtx()
    elevateCommand.execute('Goblin -10', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('below ground'))
  })

  it('shows error when token not found', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      updateToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    elevateCommand.execute('Dragon 50', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Token not found'))
  })
})

describe('darknessCommand', () => {
  it('has correct metadata', () => {
    expect(darknessCommand.name).toBe('darkness')
    expect(darknessCommand.dmOnly).toBe(true)
  })

  it('returns broadcast with default 15 ft radius', () => {
    const result = darknessCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('15 ft radius')
  })

  it('uses specified radius', () => {
    const result = darknessCommand.execute('30', makeCtx()) as any
    expect(result.content).toContain('30 ft radius')
  })
})

describe('weatherCommand2', () => {
  it('has correct metadata', () => {
    expect(weatherCommand2.name).toBe('setweather')
    expect(weatherCommand2.dmOnly).toBe(true)
  })

  it('returns broadcast for valid weather', () => {
    const result = weatherCommand2.execute('rain', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('rain')
  })

  it('returns error for invalid weather', () => {
    const result = weatherCommand2.execute('tornado', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Valid weather')
  })

  it('defaults to "clear" for empty args', () => {
    const result = weatherCommand2.execute('', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('clear')
  })
})

describe('sunmoonCommand', () => {
  it('has correct metadata', () => {
    expect(sunmoonCommand.name).toBe('sunmoon')
    expect(sunmoonCommand.aliases).toContain('daynight')
    expect(sunmoonCommand.dmOnly).toBe(true)
  })

  it('returns broadcast for valid phase', () => {
    const result = sunmoonCommand.execute('night', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('night')
  })

  it('returns error for invalid phase', () => {
    const result = sunmoonCommand.execute('twilight', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Valid phases')
  })

  it('defaults to "day" for empty args', () => {
    const result = sunmoonCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('day')
  })
})

describe('gridCommand', () => {
  it('has correct metadata', () => {
    expect(gridCommand.name).toBe('grid')
    expect(gridCommand.dmOnly).toBe(true)
  })

  it('returns system message for show', () => {
    const result = gridCommand.execute('show', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('visible')
  })

  it('returns system message for hide', () => {
    const result = gridCommand.execute('hide', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('hidden')
  })

  it('sets grid size for valid pixel value', () => {
    const result = gridCommand.execute('size 50', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('50px')
  })

  it('returns error for grid size out of range', () => {
    const result = gridCommand.execute('size 10', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('20-100')
  })

  it('returns error for unknown subcommand', () => {
    const result = gridCommand.execute('invalid', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })
})

describe('zoomCommand', () => {
  it('has correct metadata', () => {
    expect(zoomCommand.name).toBe('zoom')
    expect(zoomCommand.dmOnly).toBe(false)
    expect(zoomCommand.category).toBe('player')
  })

  it('returns system message for zoom in', () => {
    const result = zoomCommand.execute('in', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('Zoomed in')
  })

  it('returns system message for zoom out', () => {
    const result = zoomCommand.execute('out', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('Zoomed out')
  })

  it('returns system message for zoom reset', () => {
    const result = zoomCommand.execute('reset', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('100%')
  })

  it('sets zoom to a valid percentage', () => {
    const result = zoomCommand.execute('150', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('150%')
  })

  it('returns error for invalid input', () => {
    const result = zoomCommand.execute('banana', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns error for out-of-range percentage', () => {
    const result = zoomCommand.execute('500', makeCtx()) as any
    expect(result.type).toBe('error')
  })
})

describe('centerCommand', () => {
  it('has correct metadata', () => {
    expect(centerCommand.name).toBe('center')
    expect(centerCommand.aliases).toContain('focus')
    expect(centerCommand.dmOnly).toBe(false)
  })

  it('returns error when no args', () => {
    const result = centerCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns system message with target', () => {
    const result = centerCommand.execute('Goblin', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('Goblin')
  })
})

describe('all map-environment commands share required shape', () => {
  const commands = [
    fogCommand,
    lightCommand,
    elevateCommand,
    darknessCommand,
    weatherCommand2,
    sunmoonCommand,
    gridCommand,
    zoomCommand,
    centerCommand
  ]

  it('each has name, aliases, description, usage, category, dmOnly, execute', () => {
    assertCommandShape(commands)
  })

  it('names are unique', () => {
    assertUniqueCommandNames(commands)
  })
})
