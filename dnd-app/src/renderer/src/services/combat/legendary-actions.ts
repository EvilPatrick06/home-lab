/**
 * Legendary Actions, Resistances & Lair Actions — D&D 5e 2024
 *
 * MM 2024 Chapter 1. Extracted from combat-resolver for modularity.
 */

import { useGameStore } from '../../stores/use-game-store'
import { broadcastCombatResult, logCombatEntry } from './combat-log'

/**
 * Spend a legendary action. Returns remaining count.
 */
export function spendLegendaryAction(
  entryId: string,
  cost: number = 1
): { success: boolean; remaining: number; summary: string } {
  const gameStore = useGameStore.getState()
  const initiative = gameStore.initiative
  if (!initiative) return { success: false, remaining: 0, summary: 'No active initiative.' }

  const entry = initiative.entries.find((e) => e.id === entryId)
  if (!entry?.legendaryActions) {
    return { success: false, remaining: 0, summary: 'This creature has no legendary actions.' }
  }

  const remaining = entry.legendaryActions.maximum - entry.legendaryActions.used
  if (remaining < cost) {
    return {
      success: false,
      remaining,
      summary: `Not enough legendary actions remaining (${remaining}/${entry.legendaryActions.maximum}).`
    }
  }

  gameStore.updateInitiativeEntry(entryId, {
    legendaryActions: {
      ...entry.legendaryActions,
      used: entry.legendaryActions.used + cost
    }
  })

  const newRemaining = remaining - cost
  return {
    success: true,
    remaining: newRemaining,
    summary: `Legendary action used (cost: ${cost}). Remaining: ${newRemaining}/${entry.legendaryActions.maximum}`
  }
}

/**
 * Use a legendary resistance to auto-succeed a failed save.
 */
export function useLegendaryResistance(
  entryId: string,
  entityName: string,
  saveName: string
): { success: boolean; remaining: number; summary: string } {
  const gameStore = useGameStore.getState()
  const initiative = gameStore.initiative
  if (!initiative) return { success: false, remaining: 0, summary: 'No active initiative.' }

  const entry = initiative.entries.find((e) => e.id === entryId)
  if (!entry?.legendaryResistances || entry.legendaryResistances.remaining <= 0) {
    return { success: false, remaining: 0, summary: `${entityName} has no legendary resistances remaining.` }
  }

  const newRemaining = entry.legendaryResistances.remaining - 1
  gameStore.updateInitiativeEntry(entryId, {
    legendaryResistances: {
      ...entry.legendaryResistances,
      remaining: newRemaining
    }
  })

  const summary = `${entityName} uses Legendary Resistance to succeed on the ${saveName} save! (${newRemaining}/${entry.legendaryResistances.max} remaining)`

  logCombatEntry({
    type: 'save',
    targetEntityName: entityName,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { success: true, remaining: newRemaining, summary }
}

/**
 * Trigger lair actions at initiative count 20 (losing ties).
 * Returns true if a lair action should trigger.
 */
export function shouldTriggerLairAction(initiative: {
  entries: Array<{ inLair?: boolean }>
  currentIndex: number
}): boolean {
  // Lair actions fire at initiative 20, after any creature with initiative 20+
  // In practice: check if any entry with inLair flag is in the initiative
  return initiative.entries.some((e) => e.inLair)
}
