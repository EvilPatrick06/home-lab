import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('crypto', { randomUUID: () => 'anno-uuid-1234' })

import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    addDrawing: vi.fn(),
    removeDrawing: vi.fn(),
    clearDrawings: vi.fn(),
    addRegion: vi.fn(),
    updateRegion: vi.fn(),
    removeRegion: vi.fn(),
    ...overrides
  } as unknown as GameStoreSnapshot
}

const stores = {} as StoreAccessors
const map = { id: 'map-1', name: 'Test', tokens: [] } as unknown as ActiveMap

describe('map-annotation-actions', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Drawings (G42) ──

  describe('drawings', () => {
    it('adds a drawing with a generated id', async () => {
      const { executeAddDrawing } = await import('./map-annotation-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'add_drawing',
        type: 'draw-rect',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 50 }
        ],
        color: '#ff0000',
        strokeWidth: 2,
        visibleToPlayers: false
      }
      expect(executeAddDrawing(action, gs, map, stores)).toBe(true)
      expect(gs.addDrawing).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({ id: 'anno-uuid-1234', type: 'draw-rect', color: '#ff0000', visibleToPlayers: false })
      )
    })

    it('removes + clears drawings', async () => {
      const { executeRemoveDrawing, executeClearDrawings } = await import('./map-annotation-actions')
      const gs = makeGameStore()
      executeRemoveDrawing({ action: 'remove_drawing', drawingId: 'd1' }, gs, map, stores)
      expect(gs.removeDrawing).toHaveBeenCalledWith('map-1', 'd1')
      executeClearDrawings({ action: 'clear_drawings' }, gs, map, stores)
      expect(gs.clearDrawings).toHaveBeenCalledWith('map-1')
    })

    it('throws without an active map', async () => {
      const { executeAddDrawing } = await import('./map-annotation-actions')
      expect(() =>
        executeAddDrawing(
          { action: 'add_drawing', type: 'draw-free', points: [], color: '#fff', strokeWidth: 1 },
          makeGameStore(),
          undefined,
          stores
        )
      ).toThrow('No active map')
    })
  })

  // ── Regions (G43) ──

  describe('regions', () => {
    it('adds a region with defaults + maps regionAction → action', async () => {
      const { executeAddRegion } = await import('./map-annotation-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'add_region',
        name: 'Trap Hall',
        shape: { type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
        trigger: 'enter',
        regionAction: { type: 'alert-dm', message: 'Party entered the trapped hall' }
      }
      expect(executeAddRegion(action, gs, map, stores)).toBe(true)
      expect(gs.addRegion).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({
          id: 'anno-uuid-1234',
          name: 'Trap Hall',
          trigger: 'enter',
          action: { type: 'alert-dm', message: 'Party entered the trapped hall' },
          enabled: true,
          visibleToPlayers: false,
          oneShot: false
        })
      )
    })

    it('updates a region (e.g. disabling it) with only provided fields', async () => {
      const { executeUpdateRegion } = await import('./map-annotation-actions')
      const gs = makeGameStore()
      executeUpdateRegion({ action: 'update_region', regionId: 'r1', enabled: false }, gs, map, stores)
      expect(gs.updateRegion).toHaveBeenCalledWith('map-1', 'r1', { enabled: false })
    })

    it('removes a region by id', async () => {
      const { executeRemoveRegion } = await import('./map-annotation-actions')
      const gs = makeGameStore()
      executeRemoveRegion({ action: 'remove_region', regionId: 'r9' }, gs, map, stores)
      expect(gs.removeRegion).toHaveBeenCalledWith('map-1', 'r9')
    })
  })
})
