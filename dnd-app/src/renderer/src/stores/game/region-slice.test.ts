import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { SceneRegion } from '../../types/map'
import { createRegionSlice } from './region-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

function makeStore(initialMaps: Array<{ id: string; regions?: SceneRegion[]; [k: string]: unknown }> = []) {
  return create<any>()((set, get, api) => ({
    maps: initialMaps,
    ...createRegionSlice(set, get, api)
  }))
}

function makeRegion(overrides: Partial<SceneRegion> = {}): SceneRegion {
  return {
    id: 'r1',
    name: 'Test Region',
    shape: { type: 'circle', centerX: 5, centerY: 5, radius: 3 },
    trigger: 'enter',
    action: { type: 'alert-dm', message: 'entered' },
    enabled: true,
    visibleToPlayers: false,
    oneShot: false,
    ...overrides
  }
}

describe('region-slice', () => {
  describe('addRegion', () => {
    it('adds a region to the correct map', () => {
      const store = makeStore([{ id: 'map1' }, { id: 'map2' }])
      store.getState().addRegion('map1', makeRegion({ id: 'r1' }))
      const maps = store.getState().maps
      expect(maps[0].regions).toHaveLength(1)
      expect(maps[0].regions[0].id).toBe('r1')
      expect(maps[1].regions).toBeUndefined()
    })

    it('appends to existing regions', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r0' })] }])
      store.getState().addRegion('map1', makeRegion({ id: 'r1' }))
      expect(store.getState().maps[0].regions).toHaveLength(2)
      expect(store.getState().maps[0].regions[1].id).toBe('r1')
    })

    it('handles map with undefined regions', () => {
      const store = makeStore([{ id: 'map1' }])
      store.getState().addRegion('map1', makeRegion({ id: 'r1' }))
      expect(store.getState().maps[0].regions).toHaveLength(1)
    })

    it('does nothing if mapId not found', () => {
      const store = makeStore([{ id: 'map1' }])
      store.getState().addRegion('nonexistent', makeRegion())
      expect(store.getState().maps[0].regions).toBeUndefined()
    })

    it('preserves all region fields', () => {
      const store = makeStore([{ id: 'map1' }])
      const region = makeRegion({
        id: 'r-full',
        name: 'Lava Pit',
        shape: { type: 'rectangle', x: 0, y: 0, width: 10, height: 5 },
        trigger: 'start-turn',
        action: { type: 'apply-condition', condition: 'burning', duration: 3 },
        enabled: false,
        visibleToPlayers: true,
        oneShot: true,
        color: '#ff0000',
        floor: 2
      })
      store.getState().addRegion('map1', region)
      expect(store.getState().maps[0].regions[0]).toEqual(region)
    })
  })

  describe('removeRegion', () => {
    it('removes the correct region by id', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' }), makeRegion({ id: 'r2' })] }])
      store.getState().removeRegion('map1', 'r1')
      const regions = store.getState().maps[0].regions
      expect(regions).toHaveLength(1)
      expect(regions[0].id).toBe('r2')
    })

    it('does nothing if regionId not found', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' })] }])
      store.getState().removeRegion('map1', 'nonexistent')
      expect(store.getState().maps[0].regions).toHaveLength(1)
    })

    it('does nothing if mapId not found', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' })] }])
      store.getState().removeRegion('other', 'r1')
      expect(store.getState().maps[0].regions).toHaveLength(1)
    })

    it('handles map with undefined regions', () => {
      const store = makeStore([{ id: 'map1' }])
      store.getState().removeRegion('map1', 'r1')
      expect(store.getState().maps[0].regions).toEqual([])
    })

    it('results in empty array when last region removed', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' })] }])
      store.getState().removeRegion('map1', 'r1')
      expect(store.getState().maps[0].regions).toEqual([])
    })
  })

  describe('updateRegion', () => {
    it('merges updates into the matching region', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1', name: 'Old' })] }])
      store.getState().updateRegion('map1', 'r1', { name: 'New', enabled: false })
      const region = store.getState().maps[0].regions[0]
      expect(region.name).toBe('New')
      expect(region.enabled).toBe(false)
      expect(region.id).toBe('r1')
    })

    it('does not affect other regions', () => {
      const store = makeStore([
        { id: 'map1', regions: [makeRegion({ id: 'r1', name: 'A' }), makeRegion({ id: 'r2', name: 'B' })] }
      ])
      store.getState().updateRegion('map1', 'r1', { name: 'Updated' })
      expect(store.getState().maps[0].regions[1].name).toBe('B')
    })

    it('does nothing if regionId not found', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1', name: 'A' })] }])
      store.getState().updateRegion('map1', 'ghost', { name: 'X' })
      expect(store.getState().maps[0].regions[0].name).toBe('A')
    })

    it('handles empty updates object', () => {
      const original = makeRegion({ id: 'r1' })
      const store = makeStore([{ id: 'map1', regions: [original] }])
      store.getState().updateRegion('map1', 'r1', {})
      expect(store.getState().maps[0].regions[0]).toEqual(original)
    })

    it('can update shape', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' })] }])
      const newShape = {
        type: 'polygon' as const,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 }
        ]
      }
      store.getState().updateRegion('map1', 'r1', { shape: newShape })
      expect(store.getState().maps[0].regions[0].shape).toEqual(newShape)
    })
  })

  describe('clearRegions', () => {
    it('removes all regions from specified map', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' }), makeRegion({ id: 'r2' })] }])
      store.getState().clearRegions('map1')
      expect(store.getState().maps[0].regions).toEqual([])
    })

    it('does not affect other maps', () => {
      const store = makeStore([
        { id: 'map1', regions: [makeRegion({ id: 'r1' })] },
        { id: 'map2', regions: [makeRegion({ id: 'r2' })] }
      ])
      store.getState().clearRegions('map1')
      expect(store.getState().maps[1].regions).toHaveLength(1)
    })

    it('is a no-op on map with no regions', () => {
      const store = makeStore([{ id: 'map1' }])
      store.getState().clearRegions('map1')
      expect(store.getState().maps[0].regions).toEqual([])
    })

    it('does nothing if mapId not found', () => {
      const store = makeStore([{ id: 'map1', regions: [makeRegion({ id: 'r1' })] }])
      store.getState().clearRegions('nonexistent')
      expect(store.getState().maps[0].regions).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    let store: ReturnType<typeof makeStore>

    beforeEach(() => {
      store = makeStore([])
    })

    it('handles operations on empty maps array without throwing', () => {
      store.getState().addRegion('map1', makeRegion())
      store.getState().removeRegion('map1', 'r1')
      store.getState().updateRegion('map1', 'r1', { name: 'X' })
      store.getState().clearRegions('map1')
      expect(store.getState().maps).toEqual([])
    })

    it('add then remove yields empty array', () => {
      store = makeStore([{ id: 'map1' }])
      store.getState().addRegion('map1', makeRegion({ id: 'r1' }))
      store.getState().removeRegion('map1', 'r1')
      expect(store.getState().maps[0].regions).toEqual([])
    })

    it('multiple adds create independent regions', () => {
      store = makeStore([{ id: 'map1' }])
      for (let i = 0; i < 5; i++) {
        store.getState().addRegion('map1', makeRegion({ id: `r${i}`, name: `Region ${i}` }))
      }
      expect(store.getState().maps[0].regions).toHaveLength(5)
    })
  })
})
