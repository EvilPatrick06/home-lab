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

import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

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
  const msg = `⚔️ ${note(token.label)}${reason}`
  stores
    .getLobbyStore()
    .getState()
    .addChatMessage({
      id: `ai-econ-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'ai-dm',
      senderName: 'Dungeon Master',
      content: msg,
      timestamp: Date.now(),
      isSystem: true
    })
  stores.getNetworkStore().getState().sendMessage('chat:message', { message: msg, isSystem: true })
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
