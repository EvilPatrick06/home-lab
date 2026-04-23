import { create } from 'zustand'
import { SETTINGS_KEYS } from '../constants'
import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../types/library'
import { logger } from '../utils/logger'

// Load recently viewed from localStorage
function loadRecentlyViewed(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEYS.LIBRARY_RECENT)
    if (raw) return JSON.parse(raw) as LibraryItem[]
  } catch {
    /* ignore */
  }
  return []
}

// Load favorites from localStorage
function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEYS.LIBRARY_FAVORITES)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore */
  }
  return new Set()
}

interface LibraryState {
  selectedCategory: LibraryCategory | null
  searchQuery: string
  items: LibraryItem[]
  homebrewEntries: HomebrewEntry[]
  loading: boolean
  homebrewLoaded: boolean
  recentlyViewed: LibraryItem[]
  favorites: Set<string>

  setCategory: (category: LibraryCategory | null) => void
  setSearchQuery: (query: string) => void
  setItems: (items: LibraryItem[]) => void
  setLoading: (loading: boolean) => void

  loadHomebrew: () => Promise<void>
  saveHomebrewEntry: (entry: HomebrewEntry) => Promise<boolean>
  deleteHomebrewEntry: (category: string, id: string) => Promise<boolean>

  addToRecentlyViewed: (item: LibraryItem) => void
  toggleFavorite: (itemId: string) => void
  isFavorite: (itemId: string) => boolean
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  selectedCategory: null,
  searchQuery: '',
  items: [],
  homebrewEntries: [],
  loading: false,
  homebrewLoaded: false,
  recentlyViewed: loadRecentlyViewed(),
  favorites: loadFavorites(),

  setCategory: (category) => set({ selectedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setItems: (items) => set({ items }),
  setLoading: (loading) => set({ loading }),

  loadHomebrew: async () => {
    if (get().homebrewLoaded) return
    const raw = await window.api.loadAllHomebrew()
    if (Array.isArray(raw)) {
      set({ homebrewEntries: raw as unknown as HomebrewEntry[], homebrewLoaded: true })
    }
  },

  saveHomebrewEntry: async (entry) => {
    try {
      const result = await window.api.saveHomebrew(entry as unknown as Record<string, unknown>)
      if (result.success) {
        const { homebrewEntries } = get()
        const idx = homebrewEntries.findIndex((e) => e.id === entry.id)
        if (idx >= 0) {
          const updated = [...homebrewEntries]
          updated[idx] = entry
          set({ homebrewEntries: updated })
        } else {
          set({ homebrewEntries: [...homebrewEntries, entry] })
        }
        return true
      }
      return false
    } catch (err) {
      logger.error('Failed to save homebrew entry:', err)
      return false
    }
  },

  deleteHomebrewEntry: async (category, id) => {
    try {
      const success = await window.api.deleteHomebrew(category, id)
      if (success) {
        set({ homebrewEntries: get().homebrewEntries.filter((e) => e.id !== id) })
        return true
      }
      return false
    } catch (err) {
      logger.error('Failed to delete homebrew entry:', err)
      return false
    }
  },

  addToRecentlyViewed: (item) => {
    const { recentlyViewed } = get()
    const filtered = recentlyViewed.filter((r) => r.id !== item.id)
    const next = [item, ...filtered].slice(0, 20)
    set({ recentlyViewed: next })
    try {
      localStorage.setItem(SETTINGS_KEYS.LIBRARY_RECENT, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  },

  toggleFavorite: (itemId) => {
    const { favorites } = get()
    const next = new Set(favorites)
    if (next.has(itemId)) {
      next.delete(itemId)
    } else {
      next.add(itemId)
    }
    set({ favorites: next })
    try {
      localStorage.setItem(SETTINGS_KEYS.LIBRARY_FAVORITES, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  },

  isFavorite: (itemId) => get().favorites.has(itemId)
}))
