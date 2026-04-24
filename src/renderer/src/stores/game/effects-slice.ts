import type { StateCreator } from 'zustand'
import type { ActiveCurse, ActiveDisease, ActiveEnvironmentalEffect, PlacedTrap } from '../../types/dm-toolbox'
import type { CustomEffect } from '../../types/effects'
import type { EffectsSliceState, GameStoreState } from './types'

export const createEffectsSlice: StateCreator<GameStoreState, [], [], EffectsSliceState> = (set, get) => ({
  // Custom DM effects
  customEffects: [],
  addCustomEffect: (effect: CustomEffect): void => {
    set((s) => ({ customEffects: [...s.customEffects, effect] }))
  },
  removeCustomEffect: (id: string): void => {
    set((s) => ({ customEffects: s.customEffects.filter((e) => e.id !== id) }))
  },
  checkExpiredEffects: (): CustomEffect[] => {
    const { customEffects, round, inGameTime } = get()
    const expired: CustomEffect[] = []
    const remaining: CustomEffect[] = []
    for (const effect of customEffects) {
      if (!effect.duration) {
        remaining.push(effect)
        continue
      }
      let isExpired = false
      if (effect.duration.type === 'rounds' && effect.duration.startRound != null) {
        isExpired = round - effect.duration.startRound >= effect.duration.value
      } else if (
        (effect.duration.type === 'minutes' || effect.duration.type === 'hours') &&
        effect.duration.startSeconds != null &&
        inGameTime
      ) {
        const durationSeconds =
          effect.duration.type === 'minutes' ? effect.duration.value * 60 : effect.duration.value * 3600
        isExpired = inGameTime.totalSeconds - effect.duration.startSeconds >= durationSeconds
      }
      if (isExpired) {
        expired.push(effect)
      } else {
        remaining.push(effect)
      }
    }
    if (expired.length > 0) {
      set({ customEffects: remaining })
    }
    return expired
  },

  // --- Diseases ---
  activeDiseases: [],
  addDisease: (disease: ActiveDisease) => {
    set((s) => ({ activeDiseases: [...s.activeDiseases, disease] }))
  },
  updateDisease: (id: string, updates: Partial<ActiveDisease>) => {
    set((s) => ({
      activeDiseases: s.activeDiseases.map((d) => (d.id === id ? { ...d, ...updates } : d))
    }))
  },
  removeDisease: (id: string) => {
    set((s) => ({ activeDiseases: s.activeDiseases.filter((d) => d.id !== id) }))
  },

  // --- Curses ---
  activeCurses: [],
  addCurse: (curse: ActiveCurse) => {
    set((s) => ({ activeCurses: [...s.activeCurses, curse] }))
  },
  updateCurse: (id: string, updates: Partial<ActiveCurse>) => {
    set((s) => ({
      activeCurses: s.activeCurses.map((c) => (c.id === id ? { ...c, ...updates } : c))
    }))
  },
  removeCurse: (id: string) => {
    set((s) => ({ activeCurses: s.activeCurses.filter((c) => c.id !== id) }))
  },

  // --- Environmental Effects ---
  activeEnvironmentalEffects: [],
  addEnvironmentalEffect: (effect: ActiveEnvironmentalEffect) => {
    set((s) => ({ activeEnvironmentalEffects: [...s.activeEnvironmentalEffects, effect] }))
  },
  removeEnvironmentalEffect: (id: string) => {
    set((s) => ({
      activeEnvironmentalEffects: s.activeEnvironmentalEffects.filter((e) => e.id !== id)
    }))
  },

  // --- Placed Traps ---
  placedTraps: [],
  addPlacedTrap: (trap: PlacedTrap) => {
    set((s) => ({ placedTraps: [...s.placedTraps, trap] }))
  },
  removeTrap: (id: string) => {
    set((s) => ({ placedTraps: s.placedTraps.filter((t) => t.id !== id) }))
  },
  triggerTrap: (id: string) => {
    set((s) => ({
      placedTraps: s.placedTraps.map((t) => (t.id === id ? { ...t, armed: false } : t))
    }))
  },
  revealTrap: (id: string) => {
    set((s) => ({
      placedTraps: s.placedTraps.map((t) => (t.id === id ? { ...t, revealed: true } : t))
    }))
  },
  updatePlacedTrap: (id: string, updates: Partial<PlacedTrap>) => {
    set((s) => ({
      placedTraps: s.placedTraps.map((t) => (t.id === id ? { ...t, ...updates } : t))
    }))
  }
})
