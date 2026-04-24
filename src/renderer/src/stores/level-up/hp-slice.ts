import type { HpChoice, LevelUpState } from './types'

type SetState = (partial: Partial<LevelUpState> | ((state: LevelUpState) => Partial<LevelUpState>)) => void

export function createHpSlice(set: SetState) {
  return {
    setHpChoice: (level: number, choice: HpChoice) => {
      set((s) => ({ hpChoices: { ...s.hpChoices, [level]: choice } }))
    },

    setHpRoll: (level: number, value: number) => {
      set((s) => ({ hpRolls: { ...s.hpRolls, [level]: value } }))
    }
  }
}
