import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./broadcast-utils', () => ({ broadcastTokenSync: vi.fn() }))
vi.stubGlobal('crypto', { randomUUID: () => 'wall-uuid-1234' })

import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    addWallSegment: vi.fn(),
    removeWallSegment: vi.fn(),
    updateWallSegment: vi.fn(),
    ...overrides
  } as unknown as GameStoreSnapshot
}

const stores = {} as StoreAccessors
const map = { id: 'map-1', name: 'Test', tokens: [] } as unknown as ActiveMap

describe('wall-actions', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('executeAddWallSegment', () => {
    it('adds a wall with a generated id', async () => {
      const { executeAddWallSegment } = await import('./wall-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'add_wall_segment',
        x1: 0,
        y1: 0,
        x2: 5,
        y2: 0,
        type: 'door',
        isOpen: false
      }
      expect(executeAddWallSegment(action, gs, map, stores)).toBe(true)
      expect(gs.addWallSegment).toHaveBeenCalledWith('map-1', {
        id: 'wall-uuid-1234',
        x1: 0,
        y1: 0,
        x2: 5,
        y2: 0,
        type: 'door',
        isOpen: false,
        oneWayDirection: undefined,
        floor: undefined
      })
    })

    it('throws without an active map', async () => {
      const { executeAddWallSegment } = await import('./wall-actions')
      const action: DmAction = { action: 'add_wall_segment', x1: 0, y1: 0, x2: 1, y2: 1, type: 'solid' }
      expect(() => executeAddWallSegment(action, makeGameStore(), undefined, stores)).toThrow('No active map')
    })
  })

  describe('executeUpdateWallSegment', () => {
    it('passes only the provided fields (e.g. opening a door)', async () => {
      const { executeUpdateWallSegment } = await import('./wall-actions')
      const gs = makeGameStore()
      executeUpdateWallSegment({ action: 'update_wall_segment', wallId: 'w1', isOpen: true }, gs, map, stores)
      expect(gs.updateWallSegment).toHaveBeenCalledWith('map-1', 'w1', { isOpen: true })
    })
  })

  describe('executeRemoveWallSegment', () => {
    it('removes a wall by id', async () => {
      const { executeRemoveWallSegment } = await import('./wall-actions')
      const gs = makeGameStore()
      executeRemoveWallSegment({ action: 'remove_wall_segment', wallId: 'w9' }, gs, map, stores)
      expect(gs.removeWallSegment).toHaveBeenCalledWith('map-1', 'w9')
    })
  })
})
