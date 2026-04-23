/**
 * Pre-execution validator for AI DM actions.
 * Checks actions against current game state to catch impossible operations
 * before they reach the executor — preventing silent failures and state corruption.
 */

import { logger } from '../../utils/logger'
import type { ActiveMap, DmAction, GameStoreSnapshot } from './types'

export interface ActionValidationResult {
  action: DmAction
  valid: boolean
  reason?: string
}

/**
 * Validate a batch of DM actions against the current game state.
 * Returns per-action validation results. Invalid actions include a reason string.
 */
export function validateActionsAgainstState(
  actions: DmAction[],
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap
): ActionValidationResult[] {
  return actions.map((action) => validateOne(action, gameStore, activeMap))
}

function getMapTokens(activeMap: ActiveMap): Array<{ label?: string; gridX: number; gridY: number }> {
  if (!activeMap) return []
  return (activeMap.tokens ?? []) as Array<{ label?: string; gridX: number; gridY: number }>
}

function findTokenByLabel(
  activeMap: ActiveMap,
  label: string
): { label?: string; gridX: number; gridY: number } | undefined {
  return getMapTokens(activeMap).find((t) => t.label && t.label.toLowerCase() === label.toLowerCase())
}

function isInBounds(x: number, y: number, activeMap: ActiveMap): boolean {
  if (!activeMap) return false
  const gridW = (activeMap as Record<string, unknown>).gridWidth as number | undefined
  const gridH = (activeMap as Record<string, unknown>).gridHeight as number | undefined
  if (gridW == null || gridH == null) return true
  return x >= 0 && y >= 0 && x < gridW && y < gridH
}

function validateOne(action: DmAction, gameStore: GameStoreSnapshot, activeMap: ActiveMap): ActionValidationResult {
  const ok = (): ActionValidationResult => ({ action, valid: true })
  const fail = (reason: string): ActionValidationResult => ({ action, valid: false, reason })

  switch (action.action) {
    case 'place_token': {
      const a = action as { gridX: number; gridY: number; label: string }
      if (!activeMap) return fail('No active map to place token on')
      if (!isInBounds(a.gridX, a.gridY, activeMap)) {
        return fail(`Grid position (${a.gridX}, ${a.gridY}) is out of map bounds`)
      }
      return ok()
    }

    case 'place_creature': {
      const a = action as { gridX: number; gridY: number }
      if (!activeMap) return fail('No active map to place creature on')
      if (!isInBounds(a.gridX, a.gridY, activeMap)) {
        return fail(`Grid position (${a.gridX}, ${a.gridY}) is out of map bounds`)
      }
      return ok()
    }

    case 'move_token': {
      const a = action as { label: string; gridX: number; gridY: number }
      if (!activeMap) return fail('No active map')
      const token = findTokenByLabel(activeMap, a.label)
      if (!token) return fail(`Token "${a.label}" not found on the active map`)
      if (!isInBounds(a.gridX, a.gridY, activeMap)) {
        return fail(`Target position (${a.gridX}, ${a.gridY}) is out of map bounds`)
      }
      return ok()
    }

    case 'remove_token': {
      const a = action as { label: string }
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.label)) {
        return fail(`Token "${a.label}" not found on the active map`)
      }
      return ok()
    }

    case 'update_token': {
      const a = action as { label: string }
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.label)) {
        return fail(`Token "${a.label}" not found on the active map`)
      }
      return ok()
    }

    case 'remove_from_initiative': {
      const a = action as { label: string }
      const initiative = gameStore.initiative
      if (!initiative || !Array.isArray(initiative.entries)) return fail('No active initiative')
      const found = initiative.entries.some((e: { label?: string }) => e.label?.toLowerCase() === a.label.toLowerCase())
      if (!found) return fail(`"${a.label}" not found in initiative order`)
      return ok()
    }

    case 'next_turn': {
      const initiative = gameStore.initiative
      if (!initiative || !Array.isArray(initiative.entries) || initiative.entries.length === 0) {
        return fail('No active initiative to advance')
      }
      return ok()
    }

    case 'end_initiative': {
      const initiative = gameStore.initiative
      if (!initiative || !Array.isArray(initiative.entries) || initiative.entries.length === 0) {
        return fail('No active initiative to end')
      }
      return ok()
    }

    case 'reveal_fog':
    case 'hide_fog': {
      const a = action as { cells: Array<{ x: number; y: number }> }
      if (!activeMap) return fail('No active map for fog operations')
      const outOfBounds = a.cells.filter((c) => !isInBounds(c.x, c.y, activeMap))
      if (outOfBounds.length > 0) {
        return fail(`${outOfBounds.length} fog cell(s) out of map bounds`)
      }
      return ok()
    }

    case 'apply_area_effect': {
      const a = action as { originX: number; originY: number }
      if (!activeMap) return fail('No active map for area effect')
      if (!isInBounds(a.originX, a.originY, activeMap)) {
        return fail(`Area effect origin (${a.originX}, ${a.originY}) is out of map bounds`)
      }
      return ok()
    }

    case 'use_legendary_action':
    case 'use_legendary_resistance': {
      const a = action as { entityLabel: string }
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.entityLabel)) {
        return fail(`Entity "${a.entityLabel}" not found on the active map`)
      }
      return ok()
    }

    case 'add_entity_condition':
    case 'remove_entity_condition': {
      const a = action as { entityLabel: string }
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.entityLabel)) {
        return fail(`Entity "${a.entityLabel}" not found on the active map`)
      }
      return ok()
    }

    case 'switch_map': {
      const a = action as { mapName: string }
      const maps = gameStore.maps ?? []
      const found = maps.some((m: { name?: string }) => m.name?.toLowerCase() === a.mapName.toLowerCase())
      if (!found) return fail(`Map "${a.mapName}" not found in campaign`)
      return ok()
    }

    default:
      return ok()
  }
}

/**
 * Filter a batch of actions, logging and removing invalid ones.
 * Returns only actions that passed game-state validation.
 */
export function filterValidActions(
  actions: DmAction[],
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap
): { valid: DmAction[]; rejected: ActionValidationResult[] } {
  const results = validateActionsAgainstState(actions, gameStore, activeMap)
  const valid: DmAction[] = []
  const rejected: ActionValidationResult[] = []

  for (const r of results) {
    if (r.valid) {
      valid.push(r.action)
    } else {
      rejected.push(r)
      logger.warn(`[AI Validator] Rejected DM action "${r.action.action}": ${r.reason}`)
    }
  }

  return { valid, rejected }
}
