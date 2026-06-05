/**
 * Combat action-economy DM actions — let the AI DM mechanically enforce the
 * action economy on monster/NPC tokens it controls: the Dash / Disengage / Dodge
 * stances, the Hidden state, and spending an action / bonus action / reaction /
 * movement. The engine already implements these (initiative-slice turn-state
 * setters); the AI could SEE the [ACTION ECONOMY] block but had no way to SET it.
 *
 * All are combat-scoped (require active initiative) and resolve the target by its
 * on-map label, then drive the matching game-store turn-state mutator by entityId.
 */

import { checkConcentrationOnDamage } from '../combat/concentration-manager'
import { getCreatureSaveMod, getTokenStats } from '../game/token-stats'
import { rollDiceFormula } from './dice-helpers'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

/** Post a system combat line to chat and broadcast it. */
function postCombatNote(stores: StoreAccessors, idPrefix: string, msg: string): void {
  stores
    .getLobbyStore()
    .getState()
    .addChatMessage({
      id: `${idPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'ai-dm',
      senderName: 'Dungeon Master',
      content: msg,
      timestamp: Date.now(),
      isSystem: true
    })
  stores.getNetworkStore().getState().sendMessage('chat:message', { message: msg, isSystem: true })
}

/** Resolve the target token + post a combat note, then run the turn-state mutator. */
function applyEconomy(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors,
  note: (label: string) => string,
  run: (entityId: string) => void
): boolean {
  if (!gameStore.initiative) throw new Error('No active combat — action economy only applies during initiative')
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.entityLabel as string)
  if (!token) throw new Error(`Token not found: ${action.entityLabel}`)
  run(token.entityId)
  const reason = action.reason ? ` (${action.reason})` : ''
  postCombatNote(stores, 'ai-econ', `⚔️ ${note(token.label)}${reason}`)
  return true
}

export function executeSetEntityDash(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} takes the Dash action`,
    (id) => gameStore.setDashing(id)
  )
}

export function executeSetEntityDisengage(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} takes the Disengage action`,
    (id) => gameStore.setDisengaging(id)
  )
}

export function executeSetEntityDodge(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} takes the Dodge action`,
    (id) => gameStore.setDodging(id)
  )
}

export function executeSetEntityHidden(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const hidden = action.hidden !== false // default true
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} ${hidden ? 'becomes Hidden' : 'is no longer Hidden'}`,
    (id) => gameStore.setHidden(id, hidden)
  )
}

export function executeSpendAction(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} uses its action`,
    (id) => gameStore.useAction(id)
  )
}

export function executeSpendBonusAction(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} uses its bonus action`,
    (id) => gameStore.useBonusAction(id)
  )
}

export function executeSpendReaction(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} uses its reaction`,
    (id) => gameStore.useReaction(id)
  )
}

export function executeSpendMovement(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const feet = Math.max(0, Math.round((action.feet as number) ?? 0))
  return applyEconomy(
    action,
    gameStore,
    activeMap,
    stores,
    (l) => `${l} moves ${feet} ft`,
    (id) => gameStore.useMovement(id, feet)
  )
}

/**
 * The AI DM has a creature take an opportunity attack (or any reaction attack).
 * Resolves the to-hit roll vs the target's AC, applies damage on hit (doubling the
 * damage dice on a natural 20), marks the attacker's reaction as used, and — if the
 * target was concentrating — runs the same concentration save the damage pipeline
 * uses. Combat-scoped.
 */
export function executeOpportunityAttack(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No active combat — opportunity attacks only apply during initiative')
  if (!activeMap) throw new Error('No active map')
  const a = action as {
    attackerLabel?: string
    targetLabel?: string
    toHit?: number
    damage?: string
    damageType?: string
  }
  const attacker = resolveTokenByLabel(activeMap.tokens, a.attackerLabel ?? '')
  if (!attacker) throw new Error(`Attacker not found: ${a.attackerLabel}`)
  const target = resolveTokenByLabel(activeMap.tokens, a.targetLabel ?? '')
  if (!target) throw new Error(`Target not found: ${a.targetLabel}`)

  // The attack consumes the attacker's reaction regardless of hit/miss.
  gameStore.useReaction(attacker.entityId)

  const toHit = Math.round(a.toHit ?? 0)
  const d20 = rollDiceFormula('1d20').total
  const isCrit = d20 === 20
  const isFumble = d20 === 1
  const targetAC = getTokenStats(target).ac ?? 10
  const total = d20 + toHit
  const hit = isCrit && !isFumble ? true : !isFumble && total >= targetAC
  const dmgType = a.damageType ? ` ${a.damageType}` : ''
  let line = `⚔️ Opportunity Attack — ${attacker.label} → ${target.label}: d20(${d20})+${toHit}=${total} vs AC ${targetAC} → ${
    isFumble ? 'MISS (nat 1)' : hit ? (isCrit ? 'CRIT' : 'HIT') : 'MISS'
  }`

  if (hit && a.damage) {
    const base = rollDiceFormula(a.damage)
    let dmg = base.total
    if (isCrit) dmg += base.rolls.reduce((s, r) => s + r, 0) // double the dice (not the modifier)
    dmg = Math.max(0, dmg)
    const newHP = Math.max(0, (target.currentHP ?? 0) - dmg)
    gameStore.updateToken(activeMap.id, target.id, { currentHP: newHP })
    line += ` — ${dmg}${dmgType} damage (HP ${newHP})`

    // Mirror the damage pipeline's concentration check for a concentrating target.
    const ts = gameStore.turnStates?.[target.entityId]
    if (ts?.concentratingSpell) {
      const res = checkConcentrationOnDamage(
        target.entityId,
        target.label,
        dmg,
        gameStore.turnStates,
        getCreatureSaveMod(target, 'con')
      )
      if (res.needsCheck && res.result) {
        if (!res.result.maintained) gameStore.setConcentrating(target.entityId, undefined)
        line += ` | ${res.result.summary}`
      }
    }
  }

  postCombatNote(stores, 'ai-oa', line)
  return true
}

/**
 * Atomically drop a creature to 0 HP and Unconscious (non-lethal downing) — clearing
 * its concentration, since Unconscious is incapacitating. Distinct from creature_kill
 * (which is lethal) and from manual damage + condition steps the AI would otherwise
 * have to chain.
 */
export function executeKnockUnconscious(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, (action.entityLabel as string) ?? '')
  if (!token) throw new Error(`Token not found: ${action.entityLabel}`)

  gameStore.updateToken(activeMap.id, token.id, { currentHP: 0 })
  const already = token.conditions?.some((c) => c.toLowerCase() === 'unconscious')
  if (!already) {
    gameStore.addCondition({
      id: crypto.randomUUID(),
      entityId: token.entityId,
      entityName: token.label,
      condition: 'Unconscious',
      duration: 'permanent',
      source: (action.reason as string) || 'AI DM',
      appliedRound: gameStore.round
    })
  }
  // Incapacitation breaks concentration.
  if (gameStore.turnStates?.[token.entityId]?.concentratingSpell) {
    gameStore.setConcentrating(token.entityId, undefined)
  }
  const reason = action.reason ? ` (${action.reason})` : ''
  postCombatNote(stores, 'ai-ko', `💤 ${token.label} drops to 0 HP and is Unconscious${reason}`)
  return true
}
