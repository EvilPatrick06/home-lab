import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { createOcclusionSlice } from './occlusion-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

type SliceStore = ReturnType<typeof createOcclusionSlice> & {
  maps: any[]
}

function makeStore() {
  return create<SliceStore>()((set, get, api) => ({
    maps: [],
    ...createOcclusionSlice(set as any, get as any, api as any)
  }))
}

function makeMap(overrides: Partial<any> = {}) {
  return { id: 'map-1', name: 'Test', tokens: [], ...overrides }
}

function makeTile(overrides: Partial<any> = {}) {
  return { id: 'tile-1', x: 0, y: 0, width: 1, height: 1, ...overrides }
}

describe('createOcclusionSlice', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
    // seed a map with no occlusionTiles
    store.setState({ maps: [makeMap({ id: 'm1' })] })
  })

  // --- addOcclusionTile ---

  describe('addOcclusionTile', () => {
    it('appends tile to target map', () => {
      store.getState().addOcclusionTile('m1', makeTile({ id: 't1' }))
      expect(store.getState().maps[0].occlusionTiles).toHaveLength(1)
      expect(store.getState().maps[0].occlusionTiles[0].id).toBe('t1')
    })

    it('initialises occlusionTiles when property is undefined', () => {
      const map = makeMap({ id: 'm1' })
      delete map.occlusionTiles
      store.setState({ maps: [map] })
      store.getState().addOcclusionTile('m1', makeTile({ id: 't1' }))
      expect(store.getState().maps[0].occlusionTiles).toHaveLength(1)
    })

    it('does not affect other maps', () => {
      store.setState({ maps: [makeMap({ id: 'm1' }), makeMap({ id: 'm2' })] })
      store.getState().addOcclusionTile('m1', makeTile({ id: 't1' }))
      expect(store.getState().maps[1].occlusionTiles ?? []).toHaveLength(0)
    })

    it('appends multiple tiles in order', () => {
      store.getState().addOcclusionTile('m1', makeTile({ id: 't1' }))
      store.getState().addOcclusionTile('m1', makeTile({ id: 't2' }))
      const ids = store.getState().maps[0].occlusionTiles.map((t: any) => t.id)
      expect(ids).toEqual(['t1', 't2'])
    })

    it('no-op for unknown mapId', () => {
      store.getState().addOcclusionTile('ghost', makeTile({ id: 't1' }))
      expect(store.getState().maps[0].occlusionTiles ?? []).toHaveLength(0)
    })
  })

  // --- removeOcclusionTile ---

  describe('removeOcclusionTile', () => {
    it('removes the tile by id', () => {
      store.setState({
        maps: [makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1' }), makeTile({ id: 't2' })] })]
      })
      store.getState().removeOcclusionTile('m1', 't1')
      expect(store.getState().maps[0].occlusionTiles.map((t: any) => t.id)).toEqual(['t2'])
    })

    it('removing the last tile yields empty array', () => {
      store.setState({ maps: [makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1' })] })] })
      store.getState().removeOcclusionTile('m1', 't1')
      expect(store.getState().maps[0].occlusionTiles).toHaveLength(0)
    })

    it('no-op for unknown tileId', () => {
      store.setState({ maps: [makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1' })] })] })
      store.getState().removeOcclusionTile('m1', 'nope')
      expect(store.getState().maps[0].occlusionTiles).toHaveLength(1)
    })

    it('handles missing occlusionTiles gracefully (undefined -> empty)', () => {
      const map = makeMap({ id: 'm1' })
      delete map.occlusionTiles
      store.setState({ maps: [map] })
      // should not throw
      store.getState().removeOcclusionTile('m1', 'any')
      expect(store.getState().maps[0].occlusionTiles).toHaveLength(0)
    })

    it('does not affect other maps', () => {
      store.setState({
        maps: [
          makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1' })] }),
          makeMap({ id: 'm2', occlusionTiles: [makeTile({ id: 't2' })] })
        ]
      })
      store.getState().removeOcclusionTile('m1', 't1')
      expect(store.getState().maps[1].occlusionTiles).toHaveLength(1)
    })
  })

  // --- updateOcclusionTile ---

  describe('updateOcclusionTile', () => {
    it('merges updates into the matching tile', () => {
      store.setState({ maps: [makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1', x: 0, y: 0 })] })] })
      store.getState().updateOcclusionTile('m1', 't1', { x: 5, y: 10 })
      const tile = store.getState().maps[0].occlusionTiles[0]
      expect(tile.x).toBe(5)
      expect(tile.y).toBe(10)
    })

    it('preserves other tile properties not in updates', () => {
      store.setState({
        maps: [makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1', x: 1, y: 2, width: 5 })] })]
      })
      store.getState().updateOcclusionTile('m1', 't1', { x: 9 })
      const tile = store.getState().maps[0].occlusionTiles[0]
      expect(tile.width).toBe(5)
      expect(tile.y).toBe(2)
    })

    it('does not affect other tiles in the same map', () => {
      store.setState({
        maps: [
          makeMap({
            id: 'm1',
            occlusionTiles: [makeTile({ id: 't1', x: 0 }), makeTile({ id: 't2', x: 0 })]
          })
        ]
      })
      store.getState().updateOcclusionTile('m1', 't1', { x: 99 })
      expect(store.getState().maps[0].occlusionTiles[1].x).toBe(0)
    })

    it('does not affect other maps', () => {
      store.setState({
        maps: [
          makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1', x: 0 })] }),
          makeMap({ id: 'm2', occlusionTiles: [makeTile({ id: 't1', x: 0 })] })
        ]
      })
      store.getState().updateOcclusionTile('m1', 't1', { x: 99 })
      expect(store.getState().maps[1].occlusionTiles[0].x).toBe(0)
    })

    it('handles missing occlusionTiles without throwing', () => {
      const map = makeMap({ id: 'm1' })
      delete map.occlusionTiles
      store.setState({ maps: [map] })
      store.getState().updateOcclusionTile('m1', 't1', { x: 5 })
      // no crash; tile array is empty after coercion
      expect(store.getState().maps[0].occlusionTiles).toHaveLength(0)
    })

    it('no-op for unknown tileId', () => {
      store.setState({ maps: [makeMap({ id: 'm1', occlusionTiles: [makeTile({ id: 't1', x: 3 })] })] })
      store.getState().updateOcclusionTile('m1', 'ghost', { x: 99 })
      expect(store.getState().maps[0].occlusionTiles[0].x).toBe(3)
    })
  })
})
