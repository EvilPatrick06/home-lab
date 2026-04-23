import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      inGameTime: { totalSeconds: 0 },
      advanceTimeSeconds: vi.fn(),
      setInGameTime: vi.fn(),
      shopOpen: false,
      openShop: vi.fn(),
      closeShop: vi.fn()
    }))
  }
}))
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: {
    getState: vi.fn(() => ({
      getActiveCampaign: vi.fn(() => null)
    }))
  }
}))
vi.mock('../../stores/use-character-store', () => ({
  useCharacterStore: { getState: vi.fn(() => ({ characters: [] })) }
}))
vi.mock('../downtime-service', () => ({
  advanceTrackedDowntime: vi.fn(),
  getActiveDowntimeForCharacter: vi.fn(() => []),
  updateDowntimeProgress: vi.fn()
}))

import { commands } from './commands-dm-time'

describe('commands-dm-time', () => {
  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('every command has the required fields', () => {
    for (const cmd of commands) {
      expect(typeof cmd.name).toBe('string')
      expect(cmd.name.length).toBeGreaterThan(0)
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(typeof cmd.description).toBe('string')
      expect(cmd.description.length).toBeGreaterThan(0)
      expect(typeof cmd.usage).toBe('string')
      expect(cmd.usage.length).toBeGreaterThan(0)
      expect(['player', 'dm', 'ai']).toContain(cmd.category)
      expect(typeof cmd.dmOnly).toBe('boolean')
      expect(typeof cmd.execute).toBe('function')
    }
  })

  it('command names are unique within the module', () => {
    const names = commands.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('time')
    expect(names).toContain('shop')
    expect(names).toContain('downtime')
    expect(names).toContain('craft')
    expect(names).toContain('timeset')
    expect(names).toContain('rest')
  })

  it('all commands are in the dm category', () => {
    for (const cmd of commands) {
      expect(cmd.category).toBe('dm')
    }
  })

  it('aliases are unique across all commands in the module', () => {
    const allAliases: string[] = []
    for (const cmd of commands) {
      allAliases.push(...cmd.aliases)
    }
    expect(new Set(allAliases).size).toBe(allAliases.length)
  })

  it('aliases do not collide with command names', () => {
    const names = new Set(commands.map((c) => c.name))
    for (const cmd of commands) {
      for (const alias of cmd.aliases) {
        expect(names.has(alias)).toBe(false)
      }
    }
  })

  it('downtime command is not dmOnly', () => {
    const downtime = commands.find((c) => c.name === 'downtime')
    expect(downtime?.dmOnly).toBe(false)
  })

  it('craft command is not dmOnly', () => {
    const craft = commands.find((c) => c.name === 'craft')
    expect(craft?.dmOnly).toBe(false)
  })
})
