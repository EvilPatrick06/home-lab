import type { StateCreator } from 'zustand'
import type {
  CombatLogEntry,
  DiceRollRecord,
  GroupRollRequest,
  GroupRollResult,
  HiddenDiceResult
} from '../../types/game-state'
import type { CombatLogSliceState, GameStoreState } from './types'

export const createCombatLogSlice: StateCreator<GameStoreState, [], [], CombatLogSliceState> = (set) => ({
  // --- Hidden dice ---
  hiddenDiceResults: [],
  addHiddenDiceResult: (result: HiddenDiceResult) => {
    set((state) => ({ hiddenDiceResults: [...state.hiddenDiceResults, result] }))
  },
  clearHiddenDiceResults: () => set({ hiddenDiceResults: [] }),

  // --- Dice roll history ---
  diceHistory: [],
  addDiceRoll: (roll: DiceRollRecord) => {
    set((state) => ({ diceHistory: [...state.diceHistory, roll] }))
  },
  clearDiceHistory: () => set({ diceHistory: [] }),

  // --- Combat log ---
  combatLog: [],
  addCombatLogEntry: (entry: CombatLogEntry) => {
    set((s) => {
      const updated = [...s.combatLog, entry]
      return { combatLog: updated.length > 500 ? updated.slice(-500) : updated }
    })
  },
  clearCombatLog: () => set({ combatLog: [] }),

  // --- Group roll ---
  pendingGroupRoll: null,
  groupRollResults: [],
  setPendingGroupRoll: (request: GroupRollRequest | null) => set({ pendingGroupRoll: request, groupRollResults: [] }),
  addGroupRollResult: (result: GroupRollResult) => {
    set((s) => ({ groupRollResults: [...s.groupRollResults, result] }))
  },
  clearGroupRollResults: () => set({ groupRollResults: [], pendingGroupRoll: null })
})
