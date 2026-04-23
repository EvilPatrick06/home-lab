import type { StateCreator } from 'zustand'
import type { DarknessZone } from '../../types/map'
import type { DarknessZoneSliceState, GameStoreState } from './types'

type _DarknessZone = DarknessZone

export const createDarknessZoneSlice: StateCreator<GameStoreState, [], [], DarknessZoneSliceState> = (set) => ({
  addDarknessZone: (mapId: string, zone: DarknessZone) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, darknessZones: [...(m.darknessZones ?? []), zone] }
      })
    }))
  },

  removeDarknessZone: (mapId: string, zoneId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, darknessZones: (m.darknessZones ?? []).filter((z) => z.id !== zoneId) }
      })
    }))
  },

  updateDarknessZone: (mapId: string, zoneId: string, updates: Partial<DarknessZone>) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return {
          ...m,
          darknessZones: (m.darknessZones ?? []).map((z) => (z.id === zoneId ? { ...z, ...updates } : z))
        }
      })
    }))
  }
})
