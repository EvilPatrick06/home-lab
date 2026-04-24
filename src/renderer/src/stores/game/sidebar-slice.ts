import type { StateCreator } from 'zustand'
import type { SidebarCategory, SidebarEntry } from '../../types/game-state'
import type { GameStoreState, SidebarSliceState } from './types'

export const createSidebarSlice: StateCreator<GameStoreState, [], [], SidebarSliceState> = (set) => ({
  allies: [],
  enemies: [],
  places: [],

  addSidebarEntry: (category: SidebarCategory, entry: SidebarEntry) => {
    set((state) => {
      const entries = state[category] as SidebarEntry[]
      return { [category]: [...entries, entry] }
    })
  },

  updateSidebarEntry: (category: SidebarCategory, id: string, updates: Partial<SidebarEntry>) => {
    set((state) => {
      const entries = state[category] as SidebarEntry[]
      return { [category]: entries.map((e) => (e.id === id ? { ...e, ...updates } : e)) }
    })
  },

  removeSidebarEntry: (category: SidebarCategory, id: string) => {
    set((state) => {
      const entries = state[category] as SidebarEntry[]
      return { [category]: entries.filter((e) => e.id !== id) }
    })
  },

  moveSidebarEntry: (fromCategory: SidebarCategory, toCategory: SidebarCategory, entryId: string) => {
    set((state) => {
      const fromEntries = state[fromCategory] as SidebarEntry[]
      const entry = fromEntries.find((e) => e.id === entryId)
      if (!entry) return state
      const toEntries = state[toCategory] as SidebarEntry[]
      return {
        [fromCategory]: fromEntries.filter((e) => e.id !== entryId),
        [toCategory]: [...toEntries, entry]
      }
    })
  },

  toggleEntryVisibility: (category: SidebarCategory, id: string) => {
    set((state) => {
      const entries = state[category] as SidebarEntry[]
      return { [category]: entries.map((e) => (e.id === id ? { ...e, visibleToPlayers: !e.visibleToPlayers } : e)) }
    })
  },

  reparentPlace: (entryId: string, newParentId: string | null) => {
    set((state) => ({
      places: state.places.map((e) => (e.id === entryId ? { ...e, parentId: newParentId ?? undefined } : e))
    }))
  }
})
