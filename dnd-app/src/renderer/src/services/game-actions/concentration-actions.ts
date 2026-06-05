/**
 * Concentration DM actions — let the AI DM establish/clear a creature's concentration
 * and roll the concentration save on demand. The engine tracks concentration
 * (turn-state concentratingSpell, checkConcentrationOnDamage) and auto-checks on
 * player-applied damage; these give the AI the same control for the creatures it runs.
 */

import { checkConcentrationOnDamage } from '../combat/concentration-manager'
import { getCreatureSaveMod } from '../game/token-stats'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function postNote(stores: StoreAccessors, msg: string): void {
  stores
    .getLobbyStore()
    .getState()
    .addChatMessage({
      id: `ai-conc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'ai-dm',
      senderName: 'Dungeon Master',
      content: msg,
      timestamp: Date.now(),
      isSystem: true
    })
  stores.getNetworkStore().getState().sendMessage('chat:message', { message: msg, isSystem: true })
}

/** Set or clear a creature's concentration. Omit/empty `spell` to clear (break). */
export function executeSetConcentration(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const a = action as { entityLabel?: string; spell?: string }
  const token = resolveTokenByLabel(activeMap.tokens, a.entityLabel ?? '')
  if (!token) throw new Error(`Token not found: ${a.entityLabel}`)
  const spell = a.spell?.trim() ? a.spell.trim() : undefined
  gameStore.setConcentrating(token.entityId, spell)
  postNote(
    stores,
    spell ? `🧠 ${token.label} begins concentrating on ${spell}` : `🧠 ${token.label}'s concentration ends`
  )
  return true
}

/** Roll a concentration save for a creature that just took damage (CON save DC = max(10,
 *  half damage), capped 30). Breaks concentration on a failure. */
export function executeConcentrationCheck(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const a = action as { entityLabel?: string; damageTaken?: number; conSaveModifier?: number; hasWarCaster?: boolean }
  const token = resolveTokenByLabel(activeMap.tokens, a.entityLabel ?? '')
  if (!token) throw new Error(`Token not found: ${a.entityLabel}`)
  if (!gameStore.turnStates?.[token.entityId]?.concentratingSpell) {
    postNote(stores, `🧠 ${token.label} is not concentrating — no check needed`)
    return true
  }
  const conMod = typeof a.conSaveModifier === 'number' ? a.conSaveModifier : getCreatureSaveMod(token, 'con')
  const res = checkConcentrationOnDamage(
    token.entityId,
    token.label,
    Math.max(0, a.damageTaken ?? 0),
    gameStore.turnStates,
    conMod,
    a.hasWarCaster === true
  )
  if (res.needsCheck && res.result) {
    if (!res.result.maintained) gameStore.setConcentrating(token.entityId, undefined)
    postNote(stores, `🧠 ${res.result.summary}`)
  }
  return true
}
