import type { StateCreator } from 'zustand'
import type { FogSliceState, GameStoreState } from './types'

export const createFogSlice: StateCreator<GameStoreState, [], [], FogSliceState> = (set) => ({
  revealFog: (mapId: string, cells: Array<{ x: number; y: number }>) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        const existing = new Set(m.fogOfWar.revealedCells.map((c) => `${c.x},${c.y}`))
        const newCells = cells.filter((c) => !existing.has(`${c.x},${c.y}`))
        return {
          ...m,
          fogOfWar: {
            ...m.fogOfWar,
            revealedCells: [...m.fogOfWar.revealedCells, ...newCells]
          }
        }
      })
    }))
  },

  hideFog: (mapId: string, cells: Array<{ x: number; y: number }>) => {
    set((state) => ({
      maps: state.maps.map((m) => {
        if (m.id !== mapId) return m
        const toHide = new Set(cells.map((c) => `${c.x},${c.y}`))
        return {
          ...m,
          fogOfWar: {
            ...m.fogOfWar,
            // Hiding fog (manual fog-hide brush or "Hide All") is an explicit DM
            // intent to apply fog, so turn fog ON. New maps default to
            // `enabled: false`; without this flip `drawFogOfWar` returns early
            // (fog-overlay.ts) and nothing renders on either the DM canvas or the
            // synced player view, so Hide All looked like a no-op.
            enabled: true,
            revealedCells: m.fogOfWar.revealedCells.filter((c) => !toHide.has(`${c.x},${c.y}`))
          }
        }
      })
    }))
  }
})
