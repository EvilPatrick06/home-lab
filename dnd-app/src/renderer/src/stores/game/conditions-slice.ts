import type { StateCreator } from 'zustand'
import { publishSystemChat } from '../../events/system-chat-bridge'
import type { EntityCondition } from '../../types/game-state'
import type { ConditionsSliceState, GameStoreState } from './types'

function addExhaustionDeathMessage(entityName: string): void {
  publishSystemChat({
    senderId: 'system',
    senderName: 'System',
    content: `${entityName} dies from Exhaustion level 6!`,
    timestamp: Date.now(),
    isSystem: true
  })
}

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

    // Exhaustion level 6 = death
    if (condition.condition === 'Exhaustion' && (condition.value ?? 0) >= 6) {
      const maps = get().maps
      for (const map of maps) {
        const token = map.tokens.find((t) => t.entityId === condition.entityId)
        if (token?.currentHP && token.currentHP > 0) {
          get().updateToken(map.id, token.id, { currentHP: 0 })
        }
      }
      addExhaustionDeathMessage(condition.entityName)
    }
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

    // Check if updated condition is now Exhaustion >= 6
    if (updates.value !== undefined) {
      const updated = get().conditions.find((c) => c.id === conditionId)
      if (updated && updated.condition === 'Exhaustion' && (updated.value ?? 0) >= 6) {
        const maps = get().maps
        for (const map of maps) {
          const token = map.tokens.find((t) => t.entityId === updated.entityId)
          if (token?.currentHP && token.currentHP > 0) {
            get().updateToken(map.id, token.id, { currentHP: 0 })
          }
        }
        addExhaustionDeathMessage(updated.entityName)
      }
    }
  }
})
