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
 * Discriminated union of the DM actions this validator inspects, keyed by the
 * `action` discriminant. `DmAction` itself is the open wire shape
 * (`{ action: string; [key]: unknown }`) parsed from AI/BMO output, so its
 * payload fields are untyped. Rather than reinterpreting each action with a
 * per-field cast at every call site, we declare the concrete shapes once here
 * and narrow `DmAction` → `ValidatedDmAction` through a single runtime-checked
 * parse boundary (`narrowAction`). Downstream cases then get checked field
 * access with no casts.
 */
type GridCell = { x: number; y: number }

type ValidatedDmAction =
  | { action: 'place_token'; gridX: number; gridY: number; label: string }
  | { action: 'place_creature'; gridX: number; gridY: number }
  | { action: 'move_token'; label: string; gridX: number; gridY: number }
  | { action: 'remove_token'; label: string }
  | { action: 'update_token'; label: string }
  | { action: 'remove_from_initiative'; label: string }
  | { action: 'reveal_fog'; cells: GridCell[] }
  | { action: 'hide_fog'; cells: GridCell[] }
  | { action: 'apply_area_effect'; originX: number; originY: number }
  | { action: 'use_legendary_action'; entityLabel: string }
  | { action: 'use_legendary_resistance'; entityLabel: string }
  | { action: 'add_entity_condition'; entityLabel: string }
  | { action: 'remove_entity_condition'; entityLabel: string }
  | { action: 'switch_map'; mapName: string }

/** Discriminants this validator knows how to narrow + inspect. */
type ValidatedActionType = ValidatedDmAction['action']

/**
 * Action discriminants the validator has explicit field-level checks for.
 * Declared as a `const` tuple so the `ValidatedActionType` union and this
 * runtime guard stay in lockstep (the satisfies-check fails to compile if
 * they drift).
 */
const VALIDATED_ACTION_TYPE_LIST = [
  'place_token',
  'place_creature',
  'move_token',
  'remove_token',
  'update_token',
  'remove_from_initiative',
  'reveal_fog',
  'hide_fog',
  'apply_area_effect',
  'use_legendary_action',
  'use_legendary_resistance',
  'add_entity_condition',
  'remove_entity_condition',
  'switch_map'
] as const satisfies readonly ValidatedActionType[]

const VALIDATED_ACTION_TYPES: ReadonlySet<string> = new Set(VALIDATED_ACTION_TYPE_LIST)

function isValidatedActionType(t: string): t is ValidatedActionType {
  return VALIDATED_ACTION_TYPES.has(t)
}

// ── Single validated parse boundary ──
// These helpers read raw `unknown` payload fields off the open `DmAction` and
// confirm the runtime shape. They are the only place that reinterprets the
// opaque action; everything downstream consumes the narrowed union.

function asRecord(action: DmAction): Record<string, unknown> {
  // `DmAction` already declares `[key: string]: unknown`, so this is a widening,
  // not a cast — kept as a single named boundary for the narrowers below.
  return action
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isGridCellArray(v: unknown): v is GridCell[] {
  return (
    Array.isArray(v) &&
    v.every((c) => typeof c === 'object' && c !== null && isNumber((c as GridCell).x) && isNumber((c as GridCell).y))
  )
}

/**
 * Narrow an opaque `DmAction` to the typed `ValidatedDmAction` for its
 * discriminant, or return `null` if the runtime payload doesn't match the
 * expected shape. `null` means "shape invalid" — the validator treats that as
 * a hard validation failure (clearer than a cast that lies and then throws on
 * `.toLowerCase()` / arithmetic downstream).
 */
function narrowAction(action: DmAction): ValidatedDmAction | null {
  if (!isValidatedActionType(action.action)) return null
  const r = asRecord(action)
  switch (action.action) {
    case 'place_token':
      return isNumber(r.gridX) && isNumber(r.gridY) && isString(r.label)
        ? { action: 'place_token', gridX: r.gridX, gridY: r.gridY, label: r.label }
        : null
    case 'place_creature':
      return isNumber(r.gridX) && isNumber(r.gridY)
        ? { action: 'place_creature', gridX: r.gridX, gridY: r.gridY }
        : null
    case 'move_token':
      return isString(r.label) && isNumber(r.gridX) && isNumber(r.gridY)
        ? { action: 'move_token', label: r.label, gridX: r.gridX, gridY: r.gridY }
        : null
    case 'remove_token':
      return isString(r.label) ? { action: 'remove_token', label: r.label } : null
    case 'update_token':
      return isString(r.label) ? { action: 'update_token', label: r.label } : null
    case 'remove_from_initiative':
      return isString(r.label) ? { action: 'remove_from_initiative', label: r.label } : null
    case 'reveal_fog':
      return isGridCellArray(r.cells) ? { action: 'reveal_fog', cells: r.cells } : null
    case 'hide_fog':
      return isGridCellArray(r.cells) ? { action: 'hide_fog', cells: r.cells } : null
    case 'apply_area_effect':
      return isNumber(r.originX) && isNumber(r.originY)
        ? { action: 'apply_area_effect', originX: r.originX, originY: r.originY }
        : null
    case 'use_legendary_action':
      return isString(r.entityLabel) ? { action: 'use_legendary_action', entityLabel: r.entityLabel } : null
    case 'use_legendary_resistance':
      return isString(r.entityLabel) ? { action: 'use_legendary_resistance', entityLabel: r.entityLabel } : null
    case 'add_entity_condition':
      return isString(r.entityLabel) ? { action: 'add_entity_condition', entityLabel: r.entityLabel } : null
    case 'remove_entity_condition':
      return isString(r.entityLabel) ? { action: 'remove_entity_condition', entityLabel: r.entityLabel } : null
    case 'switch_map':
      return isString(r.mapName) ? { action: 'switch_map', mapName: r.mapName } : null
    default:
      return null
  }
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
  // GameMap has no gridWidth/gridHeight; probe optionally for legacy/AI-supplied map shapes.
  const gridW = (activeMap as { gridWidth?: number }).gridWidth
  const gridH = (activeMap as { gridHeight?: number }).gridHeight
  if (gridW == null || gridH == null) return true
  return x >= 0 && y >= 0 && x < gridW && y < gridH
}

function validateOne(action: DmAction, gameStore: GameStoreSnapshot, activeMap: ActiveMap): ActionValidationResult {
  const ok = (): ActionValidationResult => ({ action, valid: true })
  const fail = (reason: string): ActionValidationResult => ({ action, valid: false, reason })

  // ── No-payload checks: these read only game state, never action fields. ──
  switch (action.action) {
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
  }

  // Actions without explicit field-level validation pass through untouched.
  if (!VALIDATED_ACTION_TYPES.has(action.action)) return ok()

  // ── Single validated parse boundary: opaque DmAction → typed union. ──
  const a = narrowAction(action)
  if (!a) return fail(`Malformed payload for "${action.action}" action`)

  // From here `a` is a fully-typed discriminated union — no field casts needed.
  switch (a.action) {
    case 'place_token': {
      if (!activeMap) return fail('No active map to place token on')
      if (!isInBounds(a.gridX, a.gridY, activeMap)) {
        return fail(`Grid position (${a.gridX}, ${a.gridY}) is out of map bounds`)
      }
      return ok()
    }

    case 'place_creature': {
      if (!activeMap) return fail('No active map to place creature on')
      if (!isInBounds(a.gridX, a.gridY, activeMap)) {
        return fail(`Grid position (${a.gridX}, ${a.gridY}) is out of map bounds`)
      }
      return ok()
    }

    case 'move_token': {
      if (!activeMap) return fail('No active map')
      const token = findTokenByLabel(activeMap, a.label)
      if (!token) return fail(`Token "${a.label}" not found on the active map`)
      if (!isInBounds(a.gridX, a.gridY, activeMap)) {
        return fail(`Target position (${a.gridX}, ${a.gridY}) is out of map bounds`)
      }
      return ok()
    }

    case 'remove_token': {
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.label)) {
        return fail(`Token "${a.label}" not found on the active map`)
      }
      return ok()
    }

    case 'update_token': {
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.label)) {
        return fail(`Token "${a.label}" not found on the active map`)
      }
      return ok()
    }

    case 'remove_from_initiative': {
      const initiative = gameStore.initiative
      if (!initiative || !Array.isArray(initiative.entries)) return fail('No active initiative')
      // Phase 17c (LOG-12 / TYP-4) — InitiativeEntry exposes `entityName`, not `label`; the old
      // `{ label?: string }` cast always read undefined, so every remove was rejected as "not found".
      const found = initiative.entries.some((e) => e.entityName?.toLowerCase() === a.label.toLowerCase())
      if (!found) return fail(`"${a.label}" not found in initiative order`)
      return ok()
    }

    case 'reveal_fog':
    case 'hide_fog': {
      if (!activeMap) return fail('No active map for fog operations')
      const outOfBounds = a.cells.filter((c) => !isInBounds(c.x, c.y, activeMap))
      if (outOfBounds.length > 0) {
        return fail(`${outOfBounds.length} fog cell(s) out of map bounds`)
      }
      return ok()
    }

    case 'apply_area_effect': {
      if (!activeMap) return fail('No active map for area effect')
      if (!isInBounds(a.originX, a.originY, activeMap)) {
        return fail(`Area effect origin (${a.originX}, ${a.originY}) is out of map bounds`)
      }
      return ok()
    }

    case 'use_legendary_action':
    case 'use_legendary_resistance': {
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.entityLabel)) {
        return fail(`Entity "${a.entityLabel}" not found on the active map`)
      }
      return ok()
    }

    case 'add_entity_condition':
    case 'remove_entity_condition': {
      if (!activeMap) return fail('No active map')
      if (!findTokenByLabel(activeMap, a.entityLabel)) {
        return fail(`Entity "${a.entityLabel}" not found on the active map`)
      }
      return ok()
    }

    case 'switch_map': {
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
