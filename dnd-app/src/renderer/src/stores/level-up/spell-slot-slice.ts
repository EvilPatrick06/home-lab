import type { LevelUpState } from './types'

type SetState = (partial: Partial<LevelUpState> | ((state: LevelUpState) => Partial<LevelUpState>)) => void
type GetState = () => LevelUpState

export function createSpellSlotSlice(set: SetState, get: GetState) {
  return {
    setNewSpellIds: (ids: string[]) => set({ newSpellIds: ids }),

    toggleNewSpell: (id: string) => {
      const { newSpellIds } = get()
      if (newSpellIds.includes(id)) {
        set({ newSpellIds: newSpellIds.filter((s) => s !== id) })
      } else {
        set({ newSpellIds: [...newSpellIds, id] })
      }
    },

    setSpellsRequired: (count: number) => set({ spellsRequired: count }),

    setInvocationSelections: (ids: string[]) => set({ invocationSelections: ids }),

    setMetamagicSelections: (ids: string[]) => set({ metamagicSelections: ids }),

    setBlessedWarriorCantrips: (ids: string[]) => set({ blessedWarriorCantrips: ids }),

    setDruidicWarriorCantrips: (ids: string[]) => set({ druidicWarriorCantrips: ids })
  }
}
