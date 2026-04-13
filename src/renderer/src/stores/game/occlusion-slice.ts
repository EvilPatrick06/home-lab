import type { StateCreator } from 'zustand'
import type { OcclusionTile } from '../../types/map'
import type { GameStoreState, OcclusionSliceState } from './types'

export const createOcclusionSlice: StateCreator<GameStoreState, [], [], OcclusionSliceState> = (set) => ({
  addOcclusionTile: (mapId: string, tile: OcclusionTile) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, occlusionTiles: [...(m.occlusionTiles ?? []), tile] }
      })
    }))
  },

  removeOcclusionTile: (mapId: string, tileId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, occlusionTiles: (m.occlusionTiles ?? []).filter((t) => t.id !== tileId) }
      })
    }))
  },

  updateOcclusionTile: (mapId: string, tileId: string, updates: Partial<OcclusionTile>) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return {
          ...m,
          occlusionTiles: (m.occlusionTiles ?? []).map((t) => (t.id === tileId ? { ...t, ...updates } : t))
        }
      })
    }))
  }
})
