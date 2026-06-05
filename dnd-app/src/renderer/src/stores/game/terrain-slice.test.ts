import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { TerrainCell } from '../../types/map'
import { createTerrainSlice } from './terrain-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

function createTestStore(maps: Array<{ id: string; terrain?: TerrainCell[]; [k: string]: unknown }> = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return create<any>()((set: any, get: any, api: any) => ({
    maps,
    ...createTerrainSlice(set, get, api)
  }))
}

function makeCell(overrides: Partial<TerrainCell> = {}): TerrainCell {
  return { x: 3, y: 4, type: 'difficult', movementCost: 2, ...overrides }
}

function makeMap(id: string, terrain?: TerrainCell[]) {
  return { id, terrain }
}

describe('terrain-slice', () => {
  let store: ReturnType<typeof createTestStore>
  beforeEach(() => {
    store = createTestStore([makeMap('map-1'), makeMap('map-2')])
  })

  it('exports createTerrainSlice as a function', () => {
    expect(typeof createTerrainSlice).toBe('function')
  })

  describe('addTerrainCell', () => {
    it('adds a cell to the correct map', () => {
      store.getState().addTerrainCell('map-1', makeCell())
      const m = store.getState().maps.find((x: { id: string }) => x.id === 'map-1')
      expect(m.terrain).toHaveLength(1)
      expect(m.terrain[0].type).toBe('difficult')
    })

    it('does not affect other maps', () => {
      store.getState().addTerrainCell('map-1', makeCell())
      const m2 = store.getState().maps.find((x: { id: string }) => x.id === 'map-2')
      expect(m2.terrain).toBeUndefined()
    })

    it('replaces an existing cell at the same square + floor', () => {
      store.getState().addTerrainCell('map-1', makeCell({ x: 3, y: 4, type: 'difficult' }))
      store.getState().addTerrainCell('map-1', makeCell({ x: 3, y: 4, type: 'hazard', movementCost: 1 }))
      const terrain = store.getState().maps[0].terrain
      expect(terrain).toHaveLength(1)
      expect(terrain[0].type).toBe('hazard')
    })

    it('keeps cells with the same square but different floor', () => {
      store.getState().addTerrainCell('map-1', makeCell({ x: 3, y: 4, floor: 0 }))
      store.getState().addTerrainCell('map-1', makeCell({ x: 3, y: 4, floor: 1 }))
      expect(store.getState().maps[0].terrain).toHaveLength(2)
    })

    it('preserves hazard + portal fields', () => {
      store
        .getState()
        .addTerrainCell('map-1', makeCell({ type: 'hazard', hazardType: 'fire', hazardDamage: 6, movementCost: 1 }))
      const c = store.getState().maps[0].terrain[0]
      expect(c.hazardType).toBe('fire')
      expect(c.hazardDamage).toBe(6)
    })
  })

  describe('removeTerrainCell', () => {
    beforeEach(() => {
      store = createTestStore([makeMap('map-1', [makeCell({ x: 1, y: 1 }), makeCell({ x: 2, y: 2 })])])
    })

    it('removes a cell by coordinates', () => {
      store.getState().removeTerrainCell('map-1', 1, 1)
      const terrain = store.getState().maps[0].terrain
      expect(terrain).toHaveLength(1)
      expect(terrain[0].x).toBe(2)
    })

    it('is a no-op for a square with no terrain', () => {
      store.getState().removeTerrainCell('map-1', 9, 9)
      expect(store.getState().maps[0].terrain).toHaveLength(2)
    })

    it('respects floor when removing', () => {
      store = createTestStore([
        makeMap('map-1', [makeCell({ x: 1, y: 1, floor: 0 }), makeCell({ x: 1, y: 1, floor: 2 })])
      ])
      store.getState().removeTerrainCell('map-1', 1, 1, 2)
      const terrain = store.getState().maps[0].terrain
      expect(terrain).toHaveLength(1)
      expect(terrain[0].floor).toBe(0)
    })
  })

  describe('updateTerrainCell', () => {
    beforeEach(() => {
      store = createTestStore([makeMap('map-1', [makeCell({ x: 1, y: 1, type: 'difficult', movementCost: 2 })])])
    })

    it('patches the matching cell only', () => {
      store.getState().updateTerrainCell('map-1', 1, 1, { movementCost: 4 })
      expect(store.getState().maps[0].terrain[0].movementCost).toBe(4)
      expect(store.getState().maps[0].terrain[0].type).toBe('difficult')
    })

    it('does nothing for a non-existent square', () => {
      store.getState().updateTerrainCell('map-1', 5, 5, { movementCost: 9 })
      expect(store.getState().maps[0].terrain[0].movementCost).toBe(2)
    })
  })
})
