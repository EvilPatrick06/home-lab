import type { StateCreator } from 'zustand'
import type { EntityCondition } from '../../types/game-state'
import type { ConditionsSliceState, GameStoreState } from './types'

export const createConditionsSlice: StateCreator<GameStoreState, [], [], ConditionsSliceState> = (set, get) => ({
  addCondition: (condition: EntityCondition) => {
    // Phase 17ac — idempotent add. Previously this blindly appended,
    // letting the same condition stack on the same entity (e.g. clicking
    // Unconscious in the token context menu twice produced two
    // Unconscious entries). Dedup by (entityId, condition name): if
    // present, replace so the new duration / metadata wins, otherwise
    // append. Exhaustion is special-cased because it carries a `value`
    // (level) — the replace-by-name path naturally bumps that.
    set((state) => {
      const filtered = state.conditions.filter(
        (c) => !(c.entityId === condition.entityId && c.condition === condition.condition)
      )
      return { conditions: [...filtered, condition] }
    })

    // Phase 17c (LOG-8) — 2024 PHB removed the "exhaustion 6 = instant death" rule. Exhaustion
    // now applies a cumulative -2-per-level penalty (handled in attack-condition-effects.ts);
    // there is no death trigger at level 6.
  },

  removeCondition: (conditionId: string) => {
    set((state) => ({
      conditions: state.conditions.filter((c) => c.id !== conditionId)
    }))
  },

  updateCondition: (conditionId: string, updates: Partial<EntityCondition>) => {
    set((state) => ({
      conditions: state.conditions.map((c) => (c.id === conditionId ? { ...c, ...updates } : c))
    }))
    // Phase 17c (LOG-8) — no exhaustion-6 death trigger (2024 PHB; see addCondition).
  }
})
