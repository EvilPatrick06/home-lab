/**
 * PHASE-30 30C — combat-automation DM actions. `run_monster_turn` lets the AI DM delegate a
 * creature's ENTIRE turn to the deterministic engine (planner + executor) instead of hand-rolling
 * mechanics. The home for ALL automation executors (NOT creature-actions.ts, which PHASE-08 pared
 * down to its live non-initiative actions).
 */

import { runMonsterTurn } from '../combat/monster-turn-executor'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

export function executeRunMonsterTurn(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No initiative running')
  if (!activeMap) throw new Error('No active map')
  const label = (action as { entityLabel?: string }).entityLabel
  if (!label) throw new Error('Missing entityLabel for run_monster_turn')
  const result = runMonsterTurn(label, stores)
  // An engine failure (no stat block, unknown label) surfaces as a failed action the AI sees.
  if ('error' in result) throw new Error(result.error)
  return true
}
