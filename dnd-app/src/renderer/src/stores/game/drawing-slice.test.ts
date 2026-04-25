import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { DrawingData } from '../../types/map'
import { createDrawingSlice } from './drawing-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

function createTestStore(maps: Array<{ id: string; drawings?: DrawingData[]; [k: string]: unknown }> = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return create<any>()((set: any, get: any, api: any) => ({
    maps,
    ...createDrawingSlice(set, get, api)
  }))
}

function makeDrawing(overrides: Partial<DrawingData> = {}): DrawingData {
  return {
    id: 'd1',
    type: 'draw-free',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 }
    ],
    color: '#ff0000',
    strokeWidth: 2,
    ...overrides
  }
}

function makeMap(id: string, drawings?: DrawingData[]) {
  return { id, drawings }
}

describe('drawing-slice', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore([makeMap('map-1'), makeMap('map-2')])
  })

  // --- import ---

  it('exports createDrawingSlice as a function', async () => {
    const mod = await import('./drawing-slice')
    expect(typeof mod.createDrawingSlice).toBe('function')
  })

  // --- addDrawing ---

  describe('addDrawing', () => {
    it('adds a drawing to the correct map', () => {
      const drawing = makeDrawing()
      store.getState().addDrawing('map-1', drawing)

      const map1 = store.getState().maps.find((m: { id: string }) => m.id === 'map-1')
      expect(map1.drawings).toEqual([drawing])
    })

    it('does not affect other maps', () => {
      store.getState().addDrawing('map-1', makeDrawing())
      const map2 = store.getState().maps.find((m: { id: string }) => m.id === 'map-2')
      expect(map2.drawings).toBeUndefined()
    })

    it('appends to existing drawings', () => {
      store.getState().addDrawing('map-1', makeDrawing({ id: 'd1' }))
      store.getState().addDrawing('map-1', makeDrawing({ id: 'd2' }))

      const drawings = store.getState().maps.find((m: { id: string }) => m.id === 'map-1').drawings
      expect(drawings).toHaveLength(2)
      expect(drawings[0].id).toBe('d1')
      expect(drawings[1].id).toBe('d2')
    })

    it('handles undefined drawings array (nullish coalesce)', () => {
      store.getState().addDrawing('map-1', makeDrawing())
      expect(store.getState().maps[0].drawings).toHaveLength(1)
    })

    it('does nothing for a non-existent mapId', () => {
      store.getState().addDrawing('no-such-map', makeDrawing())
      expect(store.getState().maps).toHaveLength(2)
      expect(store.getState().maps[0].drawings).toBeUndefined()
    })

    it('preserves all drawing properties including optional fields', () => {
      const drawing = makeDrawing({
        id: 'd1',
        type: 'draw-text',
        text: 'Hello',
        visibleToPlayers: false,
        floor: 3
      })
      store.getState().addDrawing('map-1', drawing)

      const stored = store.getState().maps[0].drawings[0]
      expect(stored.text).toBe('Hello')
      expect(stored.visibleToPlayers).toBe(false)
      expect(stored.floor).toBe(3)
      expect(stored.type).toBe('draw-text')
    })

    it('handles all drawing types', () => {
      const types = ['draw-free', 'draw-line', 'draw-rect', 'draw-circle', 'draw-text'] as const
      for (const type of types) {
        store.getState().addDrawing('map-1', makeDrawing({ id: `d-${type}`, type }))
      }
      expect(store.getState().maps[0].drawings).toHaveLength(5)
    })
  })

  // --- removeDrawing ---

  describe('removeDrawing', () => {
    beforeEach(() => {
      store = createTestStore([
        makeMap('map-1', [makeDrawing({ id: 'd1' }), makeDrawing({ id: 'd2' }), makeDrawing({ id: 'd3' })])
      ])
    })

    it('removes a drawing by id', () => {
      store.getState().removeDrawing('map-1', 'd2')
      const drawings = store.getState().maps[0].drawings
      expect(drawings).toHaveLength(2)
      expect(drawings.map((d: DrawingData) => d.id)).toEqual(['d1', 'd3'])
    })

    it('removes the last drawing leaving empty array', () => {
      store.getState().removeDrawing('map-1', 'd1')
      store.getState().removeDrawing('map-1', 'd2')
      store.getState().removeDrawing('map-1', 'd3')
      expect(store.getState().maps[0].drawings).toEqual([])
    })

    it('does nothing when drawingId does not exist', () => {
      store.getState().removeDrawing('map-1', 'nope')
      expect(store.getState().maps[0].drawings).toHaveLength(3)
    })

    it('does nothing for a non-existent mapId', () => {
      store.getState().removeDrawing('bad-map', 'd1')
      expect(store.getState().maps[0].drawings).toHaveLength(3)
    })

    it('handles undefined drawings gracefully', () => {
      store = createTestStore([makeMap('map-1')])
      store.getState().removeDrawing('map-1', 'd1')
      expect(store.getState().maps[0].drawings).toEqual([])
    })
  })

  // --- clearDrawings ---

  describe('clearDrawings', () => {
    beforeEach(() => {
      store = createTestStore([
        makeMap('map-1', [makeDrawing({ id: 'd1' }), makeDrawing({ id: 'd2' })]),
        makeMap('map-2', [makeDrawing({ id: 'd3' })])
      ])
    })

    it('clears all drawings on the specified map', () => {
      store.getState().clearDrawings('map-1')
      expect(store.getState().maps[0].drawings).toEqual([])
    })

    it('does not affect other maps', () => {
      store.getState().clearDrawings('map-1')
      expect(store.getState().maps[1].drawings).toHaveLength(1)
    })

    it('works on a map that already has no drawings', () => {
      store.getState().clearDrawings('map-1')
      store.getState().clearDrawings('map-1') // double clear
      expect(store.getState().maps[0].drawings).toEqual([])
    })

    it('works on a map with undefined drawings', () => {
      store = createTestStore([makeMap('map-1')])
      store.getState().clearDrawings('map-1')
      expect(store.getState().maps[0].drawings).toEqual([])
    })

    it('does nothing for a non-existent mapId', () => {
      store.getState().clearDrawings('no-such-map')
      expect(store.getState().maps[0].drawings).toHaveLength(2)
      expect(store.getState().maps[1].drawings).toHaveLength(1)
    })
  })
})
