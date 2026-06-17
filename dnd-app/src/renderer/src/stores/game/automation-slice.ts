import type { StateCreator } from 'zustand'
import type { MonsterAutomationConfig } from '../../types/campaign'
import type { AutomationSliceState, GameStoreState } from './types'

// PHASE-30 — DM monster-automation preferences. `null` (the default) means fully disabled:
// no auto-run, no buttons firing, no flavor calls. Persisted per campaign like combatTimer.
export const createAutomationSlice: StateCreator<GameStoreState, [], [], AutomationSliceState> = (set) => ({
  monsterAutomation: null,
  setMonsterAutomation: (config: MonsterAutomationConfig | null) => {
    set({ monsterAutomation: config })
  }
})
