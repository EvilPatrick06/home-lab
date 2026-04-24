import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/data-provider', () => ({
  load5eNpcNames: vi.fn(),
  load5eRandomTables: vi.fn()
}))
vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: { getState: vi.fn(() => ({ players: [], addChatMessage: vi.fn() })) }
}))
vi.mock('./helpers', () => ({
  getLatestCharacter: vi.fn(),
  saveAndBroadcastCharacter: vi.fn()
}))

import { commands } from './commands-dm-narrative'

describe('commands-dm-narrative', () => {
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
    expect(names).toContain('npc')
    expect(names).toContain('announce')
    expect(names).toContain('weather')
    expect(names).toContain('note')
    expect(names).toContain('name')
    expect(names).toContain('random')
    expect(names).toContain('npcmood')
    expect(names).toContain('grant-feature')
    expect(names).toContain('revoke-feature')
  })

  it('all commands in this module are dm category', () => {
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
})
