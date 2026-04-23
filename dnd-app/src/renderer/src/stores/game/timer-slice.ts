import type { StateCreator } from 'zustand'
import type { CombatTimerConfig } from '../../types/campaign'
import type { GameStoreState, TimerSliceState } from './types'

export const createTimerSlice: StateCreator<GameStoreState, [], [], TimerSliceState> = (set, get) => ({
  timerSeconds: 0,
  timerRunning: false,
  timerTargetName: '',

  startTimer: (seconds: number, targetName: string) => {
    set({ timerSeconds: seconds, timerRunning: true, timerTargetName: targetName })
  },

  stopTimer: () => {
    set({ timerSeconds: 0, timerRunning: false, timerTargetName: '' })
  },

  tickTimer: () => {
    const { timerSeconds, timerRunning } = get()
    if (!timerRunning || timerSeconds <= 0) {
      set({ timerRunning: false })
      return
    }
    set({ timerSeconds: timerSeconds - 1 })
  },

  // --- Combat Timer Config ---
  combatTimer: null,
  setCombatTimer: (config: CombatTimerConfig | null) => {
    set({ combatTimer: config })
  }
})
