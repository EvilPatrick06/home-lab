import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('builder store index', () => {
  it('can be imported', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
  })

  it('exports useBuilderStore', async () => {
    const mod = await import('./index')
    expect(mod.useBuilderStore).toBeDefined()
    expect(typeof mod.useBuilderStore).toBe('function')
  })

  it('exports type constants and helpers', async () => {
    const mod = await import('./index')
    expect(mod.DEFAULT_SCORES).toBeDefined()
    expect(mod.FOUNDATION_SLOT_IDS).toBeDefined()
    expect(mod.POINT_BUY_BUDGET).toBeDefined()
    expect(mod.POINT_BUY_COSTS).toBeDefined()
    expect(mod.POINT_BUY_START).toBeDefined()
    expect(mod.PRESET_ICONS).toBeDefined()
    expect(mod.STANDARD_ARRAY).toBeDefined()
    expect(typeof mod.pointBuyTotal).toBe('function')
    expect(typeof mod.roll4d6DropLowest).toBe('function')
  })

  it('store has initial state fields', async () => {
    const { useBuilderStore } = await import('./index')
    const state = useBuilderStore.getState()
    expect(state).toHaveProperty('phase')
    expect(state).toHaveProperty('buildSlots')
    expect(state).toHaveProperty('abilityScores')
    expect(state).toHaveProperty('selectionModal')
    expect(state).toHaveProperty('characterName')
  })
})
