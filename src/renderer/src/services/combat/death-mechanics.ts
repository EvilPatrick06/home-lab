/**
 * Death Save & Concentration Mechanics — D&D 5e 2024
 *
 * PHB 2024 p.230 (Death Saves), p.236 (Concentration).
 * Extracted from combat-resolver for modularity.
 */

import { useGameStore } from '../../stores/use-game-store'
import { type DiceRollResult, rollD20 } from '../dice/dice-service'
import { broadcastCombatResult, logCombatEntry } from './combat-log'

// ─── Concentration Check (PHB 2024 p.236) ─────────────────────

/**
 * Perform a concentration check when a concentrating creature takes damage.
 * DC = max(10, floor(damage / 2)). CON save.
 * Returns true if concentration is maintained.
 */
export function resolveConcentrationCheck(
  entityId: string,
  entityName: string,
  damageTaken: number,
  conSaveModifier: number,
  hasWarCasterAdvantage: boolean = false
): { maintained: boolean; roll: DiceRollResult; dc: number; summary: string } {
  const dc = Math.max(10, Math.floor(damageTaken / 2))

  const saveRoll = rollD20(conSaveModifier, {
    label: 'Concentration',
    silent: true,
    advantage: hasWarCasterAdvantage
  })

  const maintained = saveRoll.total >= dc

  const gameStore = useGameStore.getState()
  const concentratingSpell = gameStore.turnStates[entityId]?.concentratingSpell

  if (!maintained && concentratingSpell) {
    // Drop concentration
    gameStore.setConcentrating(entityId, undefined)
  }

  const summary = maintained
    ? `${entityName} maintains concentration on ${concentratingSpell ?? 'spell'}. (CON save: ${saveRoll.total} vs DC ${dc})`
    : `${entityName} loses concentration on ${concentratingSpell ?? 'spell'}! (CON save: ${saveRoll.total} vs DC ${dc})`

  logCombatEntry({
    type: 'save',
    targetEntityId: entityId,
    targetEntityName: entityName,
    value: saveRoll.total,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { maintained, roll: saveRoll, dc, summary }
}

// ─── Death Save Mechanics (PHB 2024 p.230) ─────────────────────

export interface DeathSaveState {
  successes: number
  failures: number
}

export interface DeathSaveResult {
  roll: DiceRollResult
  successes: number
  failures: number
  outcome: 'continue' | 'stabilized' | 'dead' | 'revived'
  summary: string
}

/**
 * Roll a death saving throw at the start of a turn.
 * - Nat 20: regain 1 HP (revived).
 * - Nat 1: counts as 2 failures.
 * - >= 10: success. < 10: failure.
 * - 3 successes = stabilized. 3 failures = dead.
 */
export function resolveDeathSave(entityId: string, entityName: string, currentState: DeathSaveState): DeathSaveResult {
  const saveRoll = rollD20(0, { label: 'Death Save', silent: true })

  let { successes, failures } = currentState

  if (saveRoll.natural20) {
    // Nat 20: regain 1 HP
    successes = 0
    failures = 0
    const summary = `${entityName} rolls a Natural 20 on their death save — they regain 1 HP!`

    logCombatEntry({
      type: 'death',
      targetEntityId: entityId,
      targetEntityName: entityName,
      value: 1,
      description: summary
    })

    broadcastCombatResult(summary, false)

    return { roll: saveRoll, successes, failures, outcome: 'revived', summary }
  }

  if (saveRoll.natural1) {
    failures += 2
  } else if (saveRoll.total >= 10) {
    successes += 1
  } else {
    failures += 1
  }

  let outcome: DeathSaveResult['outcome'] = 'continue'
  let summary: string

  if (successes >= 3) {
    outcome = 'stabilized'
    summary = `${entityName} is stabilized! (Death saves: ${successes} successes)`
  } else if (failures >= 3) {
    outcome = 'dead'
    summary = `${entityName} has died! (Death saves: ${failures} failures)`
  } else {
    const rollDesc = saveRoll.natural1 ? 'Natural 1 (2 failures!)' : `${saveRoll.total}`
    summary = `${entityName} death save: ${rollDesc} — Successes: ${successes}/3, Failures: ${failures}/3`
  }

  logCombatEntry({
    type: 'death',
    targetEntityId: entityId,
    targetEntityName: entityName,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { roll: saveRoll, successes, failures, outcome, summary }
}

/**
 * Handle taking damage while at 0 HP (PHB 2024).
 * - Any damage = 1 death save failure.
 * - Critical hit = 2 death save failures.
 * - Damage >= maxHP remaining = instant death (massive damage).
 */
export function deathSaveDamageAtZero(
  entityId: string,
  entityName: string,
  currentState: DeathSaveState,
  damageTaken: number,
  isCritical: boolean,
  maxHP: number
): { failures: number; outcome: 'continue' | 'dead'; summary: string } {
  // Massive damage: if damage at 0 HP >= max HP, instant death
  if (damageTaken >= maxHP) {
    const summary = `${entityName} takes ${damageTaken} damage at 0 HP (max HP: ${maxHP}) — Massive damage! Instant death!`
    logCombatEntry({
      type: 'death',
      targetEntityId: entityId,
      targetEntityName: entityName,
      value: damageTaken,
      description: summary
    })
    broadcastCombatResult(summary, false)
    return { failures: 3, outcome: 'dead', summary }
  }

  const addedFailures = isCritical ? 2 : 1
  const newFailures = currentState.failures + addedFailures

  const outcome = newFailures >= 3 ? 'dead' : 'continue'
  const summary =
    outcome === 'dead'
      ? `${entityName} takes damage at 0 HP${isCritical ? ' (critical!)' : ''} — ${addedFailures} death save failure(s). ${entityName} has died!`
      : `${entityName} takes damage at 0 HP${isCritical ? ' (critical!)' : ''} — ${addedFailures} death save failure(s). Failures: ${newFailures}/3`

  logCombatEntry({
    type: 'death',
    targetEntityId: entityId,
    targetEntityName: entityName,
    value: damageTaken,
    description: summary
  })

  broadcastCombatResult(summary, false)

  return { failures: newFailures, outcome, summary }
}
