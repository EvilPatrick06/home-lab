import { describe, expect, it } from 'vitest'

describe('types (barrel re-export)', () => {
  it('re-exports MESSAGE_TYPES from message-types', async () => {
    const mod = await import('./types')
    expect(mod.MESSAGE_TYPES).toBeDefined()
    expect(Array.isArray(mod.MESSAGE_TYPES)).toBe(true)
    expect(mod.MESSAGE_TYPES.length).toBeGreaterThan(0)
  })

  it('re-exports KNOWN_MESSAGE_TYPES from message-types', async () => {
    const mod = await import('./types')
    expect(mod.KNOWN_MESSAGE_TYPES).toBeDefined()
    expect(mod.KNOWN_MESSAGE_TYPES).toBeInstanceOf(Set)
  })

  it('re-exports PLAYER_COLORS from state-types', async () => {
    const mod = await import('./types')
    expect(mod.PLAYER_COLORS).toBeDefined()
    expect(Array.isArray(mod.PLAYER_COLORS)).toBe(true)
    expect(mod.PLAYER_COLORS.length).toBeGreaterThanOrEqual(10)
  })

  it('MESSAGE_TYPES is the same reference as message-types module', async () => {
    const types = await import('./types')
    const messageTypes = await import('./message-types')
    expect(types.MESSAGE_TYPES).toBe(messageTypes.MESSAGE_TYPES)
  })

  it('PLAYER_COLORS is the same reference as state-types module', async () => {
    const types = await import('./types')
    const stateTypes = await import('./state-types')
    expect(types.PLAYER_COLORS).toBe(stateTypes.PLAYER_COLORS)
  })

  it('KNOWN_MESSAGE_TYPES is the same reference as message-types module', async () => {
    const types = await import('./types')
    const messageTypes = await import('./message-types')
    expect(types.KNOWN_MESSAGE_TYPES).toBe(messageTypes.KNOWN_MESSAGE_TYPES)
  })
})
