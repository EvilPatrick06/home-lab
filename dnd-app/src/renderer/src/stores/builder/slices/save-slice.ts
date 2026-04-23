import type { StateCreator } from 'zustand'
import { is5eCharacter } from '../../../types/character'
import type { BuilderState, SaveSliceState } from '../types'
import { buildCharacter5e, loadCharacterForEdit5e } from './save-slice-5e'

export const createSaveSlice: StateCreator<BuilderState, [], [], SaveSliceState> = (set, get) => ({
  loadCharacterForEdit: (character) => {
    if (is5eCharacter(character)) {
      loadCharacterForEdit5e(character, set, get)
    }
  },

  buildCharacter5e: async () => {
    return buildCharacter5e(get)
  }
})
