import type { HpChoice, LevelUpState } from './types'

type SetState = (partial: Partial<LevelUpState> | ((state: LevelUpState) => Partial<LevelUpState>)) => void

export function createHpSlice(set: SetState) {
  return {
    setHpChoice: (level: number, choice: HpChoice) => {
      set((s) => ({ hpChoices: { ...s.hpChoices, [level]: choice } }))
    },

    setHpRoll: (level: number, value: number) => {
      // Phase 24d — once a level's HP is rolled it locks (no re-rolls). A
      // re-roll attempt for an already-locked level is ignored.
      set((s) => {
        if (s.hpLocked[level]) return {}
        return { hpRolls: { ...s.hpRolls, [level]: value }, hpLocked: { ...s.hpLocked, [level]: true } }
      })
    }
  }
}
