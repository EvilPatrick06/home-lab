import type { StateCreator } from 'zustand'
import type { TerrainCell } from '../../types/map'
import type { GameStoreState, TerrainSliceState } from './types'

/**
 * Terrain cell CRUD on a map's `terrain` array. Mirrors the darkness-zone slice so
 * the AI DM (via place_terrain / remove_terrain) and the map editor share one path.
 * Cells are keyed by (x, y, floor) — at most one terrain cell per grid square per floor.
 */
export const createTerrainSlice: StateCreator<GameStoreState, [], [], TerrainSliceState> = (set) => ({
  addTerrainCell: (mapId: string, cell: TerrainCell) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        // Replace any existing cell at the same square+floor so a square never has two terrains.
        const kept = (m.terrain ?? []).filter(
          (t) => !(t.x === cell.x && t.y === cell.y && (t.floor ?? 0) === (cell.floor ?? 0))
        )
        return { ...m, terrain: [...kept, cell] }
      })
    }))
  },

  removeTerrainCell: (mapId: string, x: number, y: number, floor?: number) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return {
          ...m,
          terrain: (m.terrain ?? []).filter((t) => !(t.x === x && t.y === y && (t.floor ?? 0) === (floor ?? 0)))
        }
      })
    }))
  },

  updateTerrainCell: (mapId: string, x: number, y: number, updates: Partial<TerrainCell>, floor?: number) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return {
          ...m,
          terrain: (m.terrain ?? []).map((t) =>
            t.x === x && t.y === y && (t.floor ?? 0) === (floor ?? 0) ? { ...t, ...updates } : t
          )
        }
      })
    }))
  }
})
