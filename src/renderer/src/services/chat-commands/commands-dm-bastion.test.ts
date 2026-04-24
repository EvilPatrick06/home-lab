import { describe, expect, it, vi } from 'vitest'

const mockGetState = vi.hoisted(() =>
  vi.fn(() => ({
    bastions: [] as any[],
    startTurn: vi.fn(),
    rollAndResolveEvent: vi.fn(),
    completeTurn: vi.fn()
  }))
)

vi.mock('../../stores/use-bastion-store', () => ({
  useBastionStore: {
    getState: mockGetState
  }
}))

import { commands } from './commands-dm-bastion'

describe('commands-dm-bastion', () => {
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

  it('contains the bastion command', () => {
    const bastion = commands.find((c) => c.name === 'bastion')
    expect(bastion).toBeDefined()
    expect(bastion!.dmOnly).toBe(true)
    expect(bastion!.category).toBe('dm')
  })

  it('bastion command returns error when no bastions exist', () => {
    const bastion = commands.find((c) => c.name === 'bastion')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = bastion.execute('status', ctx)
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('No bastions found') })
  })

  it('bastion command shows usage for unknown subcommand', () => {
    mockGetState.mockReturnValueOnce({
      bastions: [
        {
          id: 'b1',
          name: 'Test Bastion',
          inGameTime: { currentDay: 10, lastBastionTurnDay: 5, turnFrequencyDays: 7 },
          treasury: 100,
          turns: [],
          basicFacilities: [],
          specialFacilities: []
        } as any
      ],
      startTurn: vi.fn(),
      rollAndResolveEvent: vi.fn(),
      completeTurn: vi.fn()
    })
    const bastion = commands.find((c) => c.name === 'bastion')!
    const ctx = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'local',
      addSystemMessage: vi.fn(),
      broadcastSystemMessage: vi.fn(),
      addErrorMessage: vi.fn()
    }
    const result = bastion.execute('unknownsub', ctx)
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Usage') })
  })
})
