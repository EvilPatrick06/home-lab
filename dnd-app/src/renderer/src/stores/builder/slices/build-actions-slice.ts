import type { StateCreator } from 'zustand'
import type { BuildActionsSliceState, BuilderState } from '../types'
import { FOUNDATION_SLOT_IDS } from '../types'

export const createBuildActionsSlice: StateCreator<BuilderState, [], [], BuildActionsSliceState> = (set, get) => ({
  advanceToNextSlot: () => {
    const { buildSlots } = get()

    // First walk foundation slots (level 0) in their declared array order
    const foundationSlots = buildSlots.filter((s) => s.level === 0)
    for (const slot of foundationSlots) {
      if (slot.selectedId !== null) continue

      if (slot.category === 'ability-scores') {
        set({ customModal: 'ability-scores', activeAsiSlotId: null, selectionModal: null })
        return
      }
      if (slot.category === 'ability-boost') {
        set({ customModal: 'asi', activeAsiSlotId: slot.id, selectionModal: null })
        return
      }
      if (slot.category === 'skill-choice') {
        set({ customModal: 'skills', activeAsiSlotId: null, selectionModal: null })
        return
      }
      set({ activeAsiSlotId: null, customModal: null })
      get().openSelectionModal(slot.id)
      return
    }

    // Then walk remaining slots (level 1+) in order
    const nonFoundationSlots = buildSlots
      .filter((s) => !FOUNDATION_SLOT_IDS.includes(s.id))
      .sort((a, b) => a.level - b.level)

    for (const slot of nonFoundationSlots) {
      if (slot.selectedId !== null) continue

      if (slot.category === 'expertise') {
        set({ customModal: 'expertise', activeExpertiseSlotId: slot.id, selectionModal: null })
        return
      }
      if (slot.category === 'ability-boost') {
        set({ customModal: 'asi', activeAsiSlotId: slot.id, selectionModal: null })
        return
      }
      // Try to open the modal for this slot
      set({ activeAsiSlotId: null, customModal: null })
      get().openSelectionModal(slot.id)
      return
    }

    // All slots filled
    set({ activeAsiSlotId: null, customModal: null })
  },

  confirmAbilityScores: () => {
    const { buildSlots, abilityScores } = get()
    const scores = Object.values(abilityScores)
    const summary = scores.join('/')

    const updatedSlots = buildSlots.map((slot) =>
      slot.id === 'ability-scores' ? { ...slot, selectedId: 'confirmed', selectedName: summary } : slot
    )
    set({ buildSlots: updatedSlots, customModal: null })
    queueMicrotask(() => get().advanceToNextSlot())
  },

  confirmSkills: () => {
    const { buildSlots, selectedSkills } = get()
    const summary = selectedSkills.length > 0 ? `${selectedSkills.length} selected` : 'None'

    const updatedSlots = buildSlots.map((slot) =>
      slot.id === 'skill-choices' ? { ...slot, selectedId: 'confirmed', selectedName: summary } : slot
    )
    set({ buildSlots: updatedSlots, customModal: null })
    queueMicrotask(() => get().advanceToNextSlot())
  },

  confirmExpertise: (slotId: string) => {
    const { buildSlots, builderExpertiseSelections } = get()
    const skills = builderExpertiseSelections[slotId] ?? []
    const summary = skills.length > 0 ? skills.join(', ') : 'None'

    const updatedSlots = buildSlots.map((slot) =>
      slot.id === slotId ? { ...slot, selectedId: 'confirmed', selectedName: summary } : slot
    )
    set({ buildSlots: updatedSlots, customModal: null, activeExpertiseSlotId: null })
    queueMicrotask(() => get().advanceToNextSlot())
  }
})
