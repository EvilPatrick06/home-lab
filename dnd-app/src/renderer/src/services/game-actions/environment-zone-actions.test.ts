import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('crypto', { randomUUID: () => 'zone-uuid-1234' })

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    addDarknessZone: vi.fn(),
    updateDarknessZone: vi.fn(),
    removeDarknessZone: vi.fn(),
    addTerrainCell: vi.fn(),
    removeTerrainCell: vi.fn(),
    updateTerrainCell: vi.fn(),
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

const stores = {} as StoreAccessors
const map = { id: 'map-1', name: 'Test', tokens: [] } as unknown as ActiveMap

describe('environment-zone-actions', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Darkness zones (G14) ──

  describe('executeAddDarknessZone', () => {
    it('adds a zone with a generated id to the active map', async () => {
      const { executeAddDarknessZone } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'add_darkness_zone', x: 5, y: 6, radius: 20, magicLevel: 'deeper-darkness' }
      expect(executeAddDarknessZone(action, gs, map, stores)).toBe(true)
      expect(gs.addDarknessZone).toHaveBeenCalledWith('map-1', {
        id: 'zone-uuid-1234',
        x: 5,
        y: 6,
        radius: 20,
        floor: undefined,
        magicLevel: 'deeper-darkness'
      })
    })

    it('throws without an active map', async () => {
      const { executeAddDarknessZone } = await import('./environment-zone-actions')
      const action: DmAction = { action: 'add_darkness_zone', x: 0, y: 0, radius: 10 }
      expect(() => executeAddDarknessZone(action, makeGameStore(), undefined, stores)).toThrow('No active map')
    })
  })

  describe('executeUpdateDarknessZone', () => {
    it('passes only the provided fields as updates', async () => {
      const { executeUpdateDarknessZone } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'update_darkness_zone', zoneId: 'z1', radius: 40 }
      executeUpdateDarknessZone(action, gs, map, stores)
      expect(gs.updateDarknessZone).toHaveBeenCalledWith('map-1', 'z1', { radius: 40 })
    })
  })

  describe('executeRemoveDarknessZone', () => {
    it('removes by zone id', async () => {
      const { executeRemoveDarknessZone } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      executeRemoveDarknessZone({ action: 'remove_darkness_zone', zoneId: 'z9' }, gs, map, stores)
      expect(gs.removeDarknessZone).toHaveBeenCalledWith('map-1', 'z9')
    })
  })

  // ── Terrain (G15) ──

  describe('executePlaceTerrain', () => {
    it('defaults movementCost to 2 for difficult terrain', async () => {
      const { executePlaceTerrain } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'place_terrain', gridX: 3, gridY: 4, type: 'difficult' }
      executePlaceTerrain(action, gs, map, stores)
      expect(gs.addTerrainCell).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({ x: 3, y: 4, type: 'difficult', movementCost: 2 })
      )
    })

    it('defaults movementCost to 1 for hazards and carries hazard fields', async () => {
      const { executePlaceTerrain } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'place_terrain',
        gridX: 7,
        gridY: 8,
        type: 'hazard',
        hazardType: 'fire',
        hazardDamage: 6
      }
      executePlaceTerrain(action, gs, map, stores)
      expect(gs.addTerrainCell).toHaveBeenCalledWith(
        'map-1',
        expect.objectContaining({ type: 'hazard', movementCost: 1, hazardType: 'fire', hazardDamage: 6 })
      )
    })

    it('respects an explicit movementCost', async () => {
      const { executePlaceTerrain } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      executePlaceTerrain(
        { action: 'place_terrain', gridX: 1, gridY: 1, type: 'water', movementCost: 3 },
        gs,
        map,
        stores
      )
      expect(gs.addTerrainCell).toHaveBeenCalledWith('map-1', expect.objectContaining({ movementCost: 3 }))
    })
  })

  describe('executeRemoveTerrain', () => {
    it('removes a cell by coordinates + floor', async () => {
      const { executeRemoveTerrain } = await import('./environment-zone-actions')
      const gs = makeGameStore()
      executeRemoveTerrain({ action: 'remove_terrain', gridX: 2, gridY: 2, floor: 1 }, gs, map, stores)
      expect(gs.removeTerrainCell).toHaveBeenCalledWith('map-1', 2, 2, 1)
    })
  })

  describe('executeUpdateTerrain', () => {
    it('passes only the provided fields to updateTerrainCell', async () => {
      const { executeUpdateTerrain } = await import('./environment-zone-actions')
      const gs = makeGameStore({ updateTerrainCell: vi.fn() })
      executeUpdateTerrain({ action: 'update_terrain_cell', gridX: 3, gridY: 4, hazardDamage: 12 }, gs, map, stores)
      expect(gs.updateTerrainCell).toHaveBeenCalledWith('map-1', 3, 4, { hazardDamage: 12 }, undefined)
    })
  })
})
