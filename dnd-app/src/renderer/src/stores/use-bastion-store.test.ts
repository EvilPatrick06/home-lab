import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    loadBastions: vi.fn().mockResolvedValue([]),
    saveBastion: vi.fn().mockResolvedValue({ success: true }),
    deleteBastion: vi.fn().mockResolvedValue({ success: true })
  }
})

import { useBastionStore } from './use-bastion-store'

describe('useBastionStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-bastion-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useBastionStore).toBe('function')
  })

  it('store has bastion state properties', () => {
    // BastionState is a type-only export (erased at runtime)
    // so we verify the store state shape instead
    const state = useBastionStore.getState()
    expect(Array.isArray(state.bastions)).toBe(true)
    expect(typeof state.loading).toBe('boolean')
  })

  it('has expected initial state shape', () => {
    const state = useBastionStore.getState()
    expect(state).toHaveProperty('bastions')
    expect(state).toHaveProperty('loading')
    expect(state).toHaveProperty('hasLoaded')
    expect(state).toHaveProperty('facilityDefs')
  })

  it('has expected initial state values', () => {
    const state = useBastionStore.getState()
    expect(state.bastions).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.hasLoaded).toBe(false)
    expect(state.facilityDefs).toEqual([])
  })

  it('has CRUD actions', () => {
    const state = useBastionStore.getState()
    expect(typeof state.loadBastions).toBe('function')
    expect(typeof state.saveBastion).toBe('function')
    expect(typeof state.deleteBastion).toBe('function')
    expect(typeof state.deleteAllBastions).toBe('function')
    expect(typeof state.setFacilityDefs).toBe('function')
  })

  it('has facility slice actions', () => {
    const state = useBastionStore.getState()
    expect(typeof state.addBasicFacility).toBe('function')
    expect(typeof state.removeBasicFacility).toBe('function')
    expect(typeof state.addSpecialFacility).toBe('function')
    expect(typeof state.removeSpecialFacility).toBe('function')
    expect(typeof state.swapSpecialFacility).toBe('function')
    expect(typeof state.enlargeSpecialFacility).toBe('function')
    expect(typeof state.configureFacility).toBe('function')
    expect(typeof state.depositGold).toBe('function')
    expect(typeof state.withdrawGold).toBe('function')
  })

  it('has event slice actions', () => {
    const state = useBastionStore.getState()
    expect(typeof state.advanceTime).toBe('function')
    expect(typeof state.checkAndTriggerTurn).toBe('function')
    expect(typeof state.startTurn).toBe('function')
    expect(typeof state.issueOrder).toBe('function')
    expect(typeof state.completeTurn).toBe('function')
  })
})
