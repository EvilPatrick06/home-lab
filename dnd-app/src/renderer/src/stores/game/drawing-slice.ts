import type { StateCreator } from 'zustand'
import type { DrawingData } from '../../types/map'
import type { DrawingSliceState, GameStoreState } from './types'

type _DrawingData = DrawingData

export const createDrawingSlice: StateCreator<GameStoreState, [], [], DrawingSliceState> = (set) => ({
  addDrawing: (mapId: string, drawing: DrawingData) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, drawings: [...(m.drawings ?? []), drawing] }
      })
    }))
  },

  removeDrawing: (mapId: string, drawingId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, drawings: (m.drawings ?? []).filter((d) => d.id !== drawingId) }
      })
    }))
  },

  clearDrawings: (mapId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        return { ...m, drawings: [] }
      })
    }))
  }
})
