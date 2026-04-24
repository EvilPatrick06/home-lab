import { create } from 'zustand'
import { createAbilityScoreSlice } from './slices/ability-score-slice'
import { createBuildActionsSlice } from './slices/build-actions-slice'
import { createCharacterDetailsSlice } from './slices/character-details-slice'
import { createCoreSlice } from './slices/core-slice'
import { createSaveSlice } from './slices/save-slice'
import { createSelectionSlice } from './slices/selection-slice'
import type { BuilderState } from './types'

export const useBuilderStore = create<BuilderState>()((...a) => ({
  ...createCoreSlice(...a),
  ...createAbilityScoreSlice(...a),
  ...createSelectionSlice(...a),
  ...createCharacterDetailsSlice(...a),
  ...createBuildActionsSlice(...a),
  ...createSaveSlice(...a)
}))

// Re-export types and constants so existing imports work
export type { AbilityScoreMethod, BuilderState } from './types'
export {
  DEFAULT_SCORES,
  FOUNDATION_SLOT_IDS,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_START,
  PRESET_ICONS,
  pointBuyTotal,
  roll4d6DropLowest,
  STANDARD_ARRAY
} from './types'
