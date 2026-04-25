import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { createFloorSlice } from './floor-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

function createTestStore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return create<any>()((set: any, get: any, api: any) => ({
    ...createFloorSlice(set, get, api)
  }))
}

describe('floor-slice', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
  })

  // --- import ---

  it('exports createFloorSlice as a function', async () => {
    const mod = await import('./floor-slice')
    expect(typeof mod.createFloorSlice).toBe('function')
  })

  // --- initial state ---

  describe('initial state', () => {
    it('currentFloor defaults to 0', () => {
      expect(store.getState().currentFloor).toBe(0)
    })
  })

  // --- setCurrentFloor ---

  describe('setCurrentFloor', () => {
    it('sets the floor to a positive number', () => {
      store.getState().setCurrentFloor(3)
      expect(store.getState().currentFloor).toBe(3)
    })

    it('sets the floor to 0', () => {
      store.getState().setCurrentFloor(5)
      store.getState().setCurrentFloor(0)
      expect(store.getState().currentFloor).toBe(0)
    })

    it('sets the floor to a negative number (basements)', () => {
      store.getState().setCurrentFloor(-1)
      expect(store.getState().currentFloor).toBe(-1)
    })

    it('overwrites the previous value', () => {
      store.getState().setCurrentFloor(1)
      store.getState().setCurrentFloor(2)
      store.getState().setCurrentFloor(3)
      expect(store.getState().currentFloor).toBe(3)
    })

    it('handles large floor numbers', () => {
      store.getState().setCurrentFloor(999)
      expect(store.getState().currentFloor).toBe(999)
    })

    it('setting the same floor again does not break state', () => {
      store.getState().setCurrentFloor(2)
      store.getState().setCurrentFloor(2)
      expect(store.getState().currentFloor).toBe(2)
    })
  })
})
