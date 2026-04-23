// ─── Concentration Manager ────────────────────────────────────────────
// Auto-checks concentration when damage is taken, handles concentration
// loss, and warns when a new concentration spell replaces an existing one.
// ─────────────────────────────────────────────────────────────────────

import type { TurnState } from '../../types/game-state'
import { resolveConcentrationCheck } from './death-mechanics'

// ─── Types ───────────────────────────────────────────────────

export interface ConcentrationCheckResult {
  dc: number
  roll: number
  maintained: boolean
  spell: string
  summary: string
}

export interface ConcentrationDamageResult {
  needsCheck: boolean
  result?: ConcentrationCheckResult
}

// ─── Core Functions ──────────────────────────────────────────

/**
 * Check if an entity needs a concentration check after taking damage.
 * If concentrating, automatically performs the check using the existing
 * resolveConcentrationCheck function.
 */
export function checkConcentrationOnDamage(
  entityId: string,
  entityName: string,
  damageTaken: number,
  turnStates: Record<string, TurnState>,
  conSaveModifier: number,
  hasWarCaster: boolean = false
): ConcentrationDamageResult {
  const ts = turnStates[entityId]
  if (!ts?.concentratingSpell) {
    return { needsCheck: false }
  }

  const spell = ts.concentratingSpell
  const checkResult = resolveConcentrationCheck(entityId, entityName, damageTaken, conSaveModifier, hasWarCaster)

  return {
    needsCheck: true,
    result: {
      dc: checkResult.dc,
      roll: checkResult.roll.total,
      maintained: checkResult.maintained,
      spell,
      summary: checkResult.summary
    }
  }
}

/**
 * Handle concentration being lost: clears the concentrating spell
 * from the entity's turn state. Returns the spell that was lost.
 */
export function onConcentrationLost(entityId: string, turnStates: Record<string, TurnState>): string | null {
  const ts = turnStates[entityId]
  if (!ts?.concentratingSpell) return null
  return ts.concentratingSpell
}

/**
 * Check if an entity is already concentrating before casting a new
 * concentration spell. Returns a warning if so.
 */
export function warnNewConcentration(
  entityId: string,
  entityName: string,
  newSpell: string,
  turnStates: Record<string, TurnState>
): string | null {
  const ts = turnStates[entityId]
  if (!ts?.concentratingSpell) return null

  return (
    `${entityName} is already concentrating on ${ts.concentratingSpell}. ` +
    `Casting ${newSpell} will end concentration on ${ts.concentratingSpell}.`
  )
}
