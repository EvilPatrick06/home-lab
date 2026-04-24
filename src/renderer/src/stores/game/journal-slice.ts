import type { StateCreator } from 'zustand'
import type { SharedJournalEntry } from '../../types/game-state'
import type { GameStoreState, JournalSliceState } from './types'

export const createJournalSlice: StateCreator<GameStoreState, [], [], JournalSliceState> = (set) => ({
  sharedJournal: [],

  addJournalEntry: (entry: SharedJournalEntry) => {
    set((s) => ({ sharedJournal: [...s.sharedJournal, entry] }))
  },

  updateJournalEntry: (id: string, updates: Partial<Pick<SharedJournalEntry, 'title' | 'content' | 'visibility'>>) => {
    set((s) => ({
      sharedJournal: s.sharedJournal.map((e) => (e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e))
    }))
  },

  deleteJournalEntry: (id: string) => {
    set((s) => ({ sharedJournal: s.sharedJournal.filter((e) => e.id !== id) }))
  },

  setSharedJournal: (entries: SharedJournalEntry[]) => {
    set({ sharedJournal: entries })
  }
})
