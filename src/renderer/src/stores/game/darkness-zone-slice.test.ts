import { describe, expect, it, vi, beforeEach } from 'vitest'
import { create } from 'zustand'
import type { DarknessZone } from '../../types/map'
import { createDarknessZoneSlice } from './darkness-zone-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// Minimal store that provides `maps` array + darkness zone actions
function createTestStore(maps: Array<{ id: string; darknessZones?: DarknessZone[]; [k: string]: unknown }> = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return create<any>()((set: any, get: any, api: any) => ({
    maps,
    ...createDarknessZoneSlice(set, get, api)
  }))
}

function makeZone(overrides: Partial<DarknessZone> = {}): DarknessZone {
  return { id: 'z1', x: 10, y: 20, radius: 30, ...overrides }
}

function makeMap(id: string, darknessZones?: DarknessZone[]) {
  return { id, darknessZones }
}

describe('darkness-zone-slice', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore([makeMap('map-1'), makeMap('map-2')])
  })

  // --- import / export ---

  it('exports createDarknessZoneSlice as a function', async () => {
    const mod = await import('./darkness-zone-slice')
    expect(typeof mod.createDarknessZoneSlice).toBe('function')
  })

  // --- addDarknessZone ---

  describe('addDarknessZone', () => {
    it('adds a zone to the correct map', () => {
      const zone = makeZone()
      store.getState().addDarknessZone('map-1', zone)

      const map1 = store.getState().maps.find((m: { id: string }) => m.id === 'map-1')
      expect(map1.darknessZones).toEqual([zone])
    })

    it('does not affect other maps', () => {
      store.getState().addDarknessZone('map-1', makeZone())

      const map2 = store.getState().maps.find((m: { id: string }) => m.id === 'map-2')
      expect(map2.darknessZones).toBeUndefined()
    })

    it('appends to existing zones', () => {
      store.getState().addDarknessZone('map-1', makeZone({ id: 'z1' }))
      store.getState().addDarknessZone('map-1', makeZone({ id: 'z2' }))

      const zones = store.getState().maps.find((m: { id: string }) => m.id === 'map-1').darknessZones
      expect(zones).toHaveLength(2)
      expect(zones[0].id).toBe('z1')
      expect(zones[1].id).toBe('z2')
    })

    it('handles map with undefined darknessZones (nullish coalesce)', () => {
      // map-1 has no darknessZones initially
      store.getState().addDarknessZone('map-1', makeZone())
      const zones = store.getState().maps.find((m: { id: string }) => m.id === 'map-1').darknessZones
      expect(zones).toHaveLength(1)
    })

    it('does nothing for a non-existent mapId', () => {
      const before = store.getState().maps
      store.getState().addDarknessZone('no-such-map', makeZone())
      // Maps array should be a new reference (set always creates new) but content unchanged
      expect(store.getState().maps).toHaveLength(before.length)
    })

    it('preserves all zone properties including optional fields', () => {
      const zone = makeZone({ floor: 2, magicLevel: 'deeper-darkness' })
      store.getState().addDarknessZone('map-1', zone)

      const stored = store.getState().maps.find((m: { id: string }) => m.id === 'map-1').darknessZones[0]
      expect(stored.floor).toBe(2)
      expect(stored.magicLevel).toBe('deeper-darkness')
    })
  })

  // --- removeDarknessZone ---

  describe('removeDarknessZone', () => {
    beforeEach(() => {
      store = createTestStore([makeMap('map-1', [makeZone({ id: 'z1' }), makeZone({ id: 'z2' })])])
    })

    it('removes a zone by id', () => {
      store.getState().removeDarknessZone('map-1', 'z1')
      const zones = store.getState().maps[0].darknessZones
      expect(zones).toHaveLength(1)
      expect(zones[0].id).toBe('z2')
    })

    it('removes the last zone leaving empty array', () => {
      store.getState().removeDarknessZone('map-1', 'z1')
      store.getState().removeDarknessZone('map-1', 'z2')
      expect(store.getState().maps[0].darknessZones).toEqual([])
    })

    it('does nothing when zoneId does not exist', () => {
      store.getState().removeDarknessZone('map-1', 'nope')
      expect(store.getState().maps[0].darknessZones).toHaveLength(2)
    })

    it('does nothing for a non-existent mapId', () => {
      store.getState().removeDarknessZone('bad-map', 'z1')
      expect(store.getState().maps[0].darknessZones).toHaveLength(2)
    })

    it('handles undefined darknessZones gracefully', () => {
      store = createTestStore([makeMap('map-1')])
      // Should not throw
      store.getState().removeDarknessZone('map-1', 'z1')
      expect(store.getState().maps[0].darknessZones).toEqual([])
    })
  })

  // --- updateDarknessZone ---

  describe('updateDarknessZone', () => {
    const original = makeZone({ id: 'z1', x: 0, y: 0, radius: 10 })

    beforeEach(() => {
      store = createTestStore([makeMap('map-1', [original])])
    })

    it('updates specified fields only', () => {
      store.getState().updateDarknessZone('map-1', 'z1', { radius: 50 })
      const z = store.getState().maps[0].darknessZones[0]
      expect(z.radius).toBe(50)
      expect(z.x).toBe(0) // unchanged
      expect(z.y).toBe(0) // unchanged
    })

    it('can update multiple fields at once', () => {
      store.getState().updateDarknessZone('map-1', 'z1', { x: 100, y: 200, magicLevel: 'darkness' })
      const z = store.getState().maps[0].darknessZones[0]
      expect(z.x).toBe(100)
      expect(z.y).toBe(200)
      expect(z.magicLevel).toBe('darkness')
    })

    it('does not modify other zones', () => {
      store = createTestStore([
        makeMap('map-1', [makeZone({ id: 'z1', radius: 10 }), makeZone({ id: 'z2', radius: 20 })])
      ])
      store.getState().updateDarknessZone('map-1', 'z1', { radius: 99 })
      expect(store.getState().maps[0].darknessZones[1].radius).toBe(20)
    })

    it('does nothing for non-existent zoneId', () => {
      store.getState().updateDarknessZone('map-1', 'nope', { radius: 99 })
      expect(store.getState().maps[0].darknessZones[0].radius).toBe(10)
    })

    it('does nothing for non-existent mapId', () => {
      store.getState().updateDarknessZone('bad-map', 'z1', { radius: 99 })
      expect(store.getState().maps[0].darknessZones[0].radius).toBe(10)
    })

    it('handles undefined darknessZones gracefully', () => {
      store = createTestStore([makeMap('map-1')])
      store.getState().updateDarknessZone('map-1', 'z1', { radius: 99 })
      expect(store.getState().maps[0].darknessZones).toEqual([])
    })

    it('can set optional fields to undefined', () => {
      store = createTestStore([makeMap('map-1', [makeZone({ id: 'z1', magicLevel: 'darkness' })])])
      store.getState().updateDarknessZone('map-1', 'z1', { magicLevel: undefined })
      expect(store.getState().maps[0].darknessZones[0].magicLevel).toBeUndefined()
    })
  })
})
