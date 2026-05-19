import { create } from 'zustand'
import { SETTINGS_KEYS } from '../constants'
import type { LibraryCategory, LibraryItem } from '../types/library'

function loadRecentlyViewed(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEYS.LIBRARY_RECENT)
    if (raw) return JSON.parse(raw) as LibraryItem[]
  } catch {
    /* ignore */
  }
  return []
}

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEYS.LIBRARY_FAVORITES)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore */
  }
  return new Set()
}

interface LibraryUiState {
  selectedCategory: LibraryCategory | null
  searchQuery: string
  recentlyViewed: LibraryItem[]
  favorites: Set<string>

  setCategory: (category: LibraryCategory | null) => void
  setSearchQuery: (query: string) => void
  addToRecentlyViewed: (item: LibraryItem) => void
  clearRecentlyViewed: () => void
  toggleFavorite: (itemId: string) => void
  isFavorite: (itemId: string) => boolean
}

export const useLibraryUiStore = create<LibraryUiState>((set, get) => ({
  selectedCategory: null,
  searchQuery: '',
  recentlyViewed: loadRecentlyViewed(),
  favorites: loadFavorites(),

  setCategory: (category) => set({ selectedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),

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

  clearRecentlyViewed: () => {
    set({ recentlyViewed: [] })
    try {
      localStorage.removeItem(SETTINGS_KEYS.LIBRARY_RECENT)
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
