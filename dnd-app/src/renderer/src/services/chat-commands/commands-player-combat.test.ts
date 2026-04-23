import { describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))
vi.mock('../../data/light-sources', () => ({
  LIGHT_SOURCE_LABELS: { torch: 'Torch' },
  LIGHT_SOURCES: { torch: { brightRadius: 20, dimRadius: 40, durationSeconds: 3600 } }
}))
vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      activeLightSources: [],
      extinguishSource: vi.fn(),
      lightSource: vi.fn()
    }))
  }
}))
vi.mock('../combat/attack-resolver', () => ({
  findWeapon: vi.fn(),
  formatAttackResult: vi.fn(() => 'attack result'),
  resolveAttack: vi.fn()
}))
vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 10),
  rollMultiple: vi.fn((count: number) => Array(count).fill(5))
}))
vi.mock('./helpers', () => ({
  findTokenByName: vi.fn()
}))

import { commands } from './commands-player-combat'

describe('commands-player-combat', () => {
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
    expect(names).toContain('grapple')
    expect(names).toContain('shove')
    expect(names).toContain('readyaction')
    expect(names).toContain('delayaction')
    expect(names).toContain('multiattack')
    expect(names).toContain('reaction')
    expect(names).toContain('useobj')
    expect(names).toContain('dash')
    expect(names).toContain('disengage')
    expect(names).toContain('dodge')
    expect(names).toContain('hide')
    expect(names).toContain('search')
    expect(names).toContain('offhand')
    expect(names).toContain('unarmed')
    expect(names).toContain('aoedamage')
    expect(names).toContain('attack')
    expect(names).toContain('torch')
  })

  it('most player-combat commands are not dmOnly', () => {
    const playerCmds = commands.filter((c) => c.category === 'player')
    for (const cmd of playerCmds) {
      expect(cmd.dmOnly).toBe(false)
    }
  })

  it('aoedamage command is dmOnly', () => {
    const aoe = commands.find((c) => c.name === 'aoedamage')
    expect(aoe?.dmOnly).toBe(true)
    expect(aoe?.category).toBe('dm')
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

  it('commands with examples have them as arrays of strings', () => {
    for (const cmd of commands) {
      if (cmd.examples) {
        expect(Array.isArray(cmd.examples)).toBe(true)
        for (const ex of cmd.examples) {
          expect(typeof ex).toBe('string')
        }
      }
    }
  })
})
