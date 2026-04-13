import type { StateCreator } from 'zustand'
import type { DmTrigger } from '../../types/game-state'
import type { GameStoreState, TriggerSliceState } from './types'

export const createTriggerSlice: StateCreator<GameStoreState, [], [], TriggerSliceState> = (set) => ({
  triggers: [],

  addTrigger: (trigger: DmTrigger) => {
    set((state) => ({ triggers: [...state.triggers, trigger] }))
  },

  removeTrigger: (triggerId: string) => {
    set((state) => ({
      triggers: state.triggers.filter((t) => t.id !== triggerId)
    }))
  },

  updateTrigger: (triggerId: string, updates: Partial<DmTrigger>) => {
    set((state) => ({
      triggers: state.triggers.map((t) => (t.id === triggerId ? { ...t, ...updates } : t))
    }))
  },

  toggleTrigger: (triggerId: string) => {
    set((state) => ({
      triggers: state.triggers.map((t) => (t.id === triggerId ? { ...t, enabled: !t.enabled } : t))
    }))
  },

  fireTrigger: (triggerId: string) => {
    set((state) => ({
      triggers: state.triggers.map((t) => {
        if (t.id !== triggerId) return t
        const newCount = (t.firedCount ?? 0) + 1
        return {
          ...t,
          firedCount: newCount,
          // One-shot triggers disable after firing
          enabled: t.oneShot ? false : t.enabled
        }
      })
    }))
  }
})
