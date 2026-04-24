import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    loadBastions: vi.fn().mockResolvedValue([]),
    saveBastion: vi.fn().mockResolvedValue(undefined),
    deleteBastion: vi.fn().mockResolvedValue(undefined)
  }
})

describe('bastion store index', () => {
  it('can be imported', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
  })

  it('exports useBastionStore', async () => {
    const mod = await import('./index')
    expect(mod.useBastionStore).toBeDefined()
    expect(typeof mod.useBastionStore).toBe('function')
  })

  it('store has initial state fields', async () => {
    const { useBastionStore } = await import('./index')
    const state = useBastionStore.getState()
    expect(Array.isArray(state.bastions)).toBe(true)
    expect(state.loading).toBe(false)
    expect(state.hasLoaded).toBe(false)
    expect(Array.isArray(state.facilityDefs)).toBe(true)
  })

  it('store has CRUD action methods', async () => {
    const { useBastionStore } = await import('./index')
    const state = useBastionStore.getState()
    expect(typeof state.loadBastions).toBe('function')
    expect(typeof state.saveBastion).toBe('function')
    expect(typeof state.deleteBastion).toBe('function')
    expect(typeof state.deleteAllBastions).toBe('function')
    expect(typeof state.setFacilityDefs).toBe('function')
  })

  it('store has facility action methods', async () => {
    const { useBastionStore } = await import('./index')
    const state = useBastionStore.getState()
    expect(typeof state.addBasicFacility).toBe('function')
    expect(typeof state.removeBasicFacility).toBe('function')
    expect(typeof state.addSpecialFacility).toBe('function')
    expect(typeof state.removeSpecialFacility).toBe('function')
    expect(typeof state.depositGold).toBe('function')
    expect(typeof state.withdrawGold).toBe('function')
  })

  it('store has event action methods', async () => {
    const { useBastionStore } = await import('./index')
    const state = useBastionStore.getState()
    expect(typeof state.advanceTime).toBe('function')
    expect(typeof state.startTurn).toBe('function')
    expect(typeof state.issueOrder).toBe('function')
    expect(typeof state.completeTurn).toBe('function')
    expect(typeof state.rollAndResolveEvent).toBe('function')
  })
})
