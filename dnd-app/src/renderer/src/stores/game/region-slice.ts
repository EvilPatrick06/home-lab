import type { StateCreator } from 'zustand'
import type { SceneRegion } from '../../types/map'
import type { GameStoreState, RegionSliceState } from './types'

export const createRegionSlice: StateCreator<GameStoreState, [], [], RegionSliceState> = (set) => ({
  addRegion: (mapId: string, region: SceneRegion) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, regions: [...(m.regions ?? []), region] }
      })
    }))
  },

  removeRegion: (mapId: string, regionId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, regions: (m.regions ?? []).filter((r) => r.id !== regionId) }
      })
    }))
  },

  updateRegion: (mapId: string, regionId: string, updates: Partial<SceneRegion>) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return {
          ...m,
          regions: (m.regions ?? []).map((r) => (r.id === regionId ? { ...r, ...updates } : r))
        }
      })
    }))
  },

  clearRegions: (mapId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, regions: [] }
      })
    }))
  }
})
