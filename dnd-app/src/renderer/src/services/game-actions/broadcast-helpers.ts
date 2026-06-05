/**
 * Broadcast sync helpers — send state updates to connected peers.
 */

import type { StoreAccessors } from './types'

export function broadcastInitiativeSync(stores: StoreAccessors): void {
  const gs = stores.getGameStore().getState()
  if (!gs.initiative) return
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:initiative-update', {
    order: gs.initiative.entries.map((e) => ({ id: e.id, name: e.entityName, initiative: e.total })),
    currentTurnIndex: gs.initiative.currentIndex
  })
}

export function broadcastTokenSync(mapId: string, stores: StoreAccessors): void {
  const gs = stores.getGameStore().getState()
  const map = gs.maps.find((m) => m.id === mapId)
  if (!map) return
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  for (const t of map.tokens) {
    sendMsg('dm:token-move', { tokenId: t.id, gridX: t.gridX, gridY: t.gridY })
  }
}

export function broadcastConditionSync(stores: StoreAccessors): void {
  const gs = stores.getGameStore().getState()
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  for (const c of gs.conditions) {
    sendMsg('dm:condition-update', { targetId: c.entityId, condition: c.condition, active: true })
  }
}

/**
 * Post a Dungeon-Master chat message (system flavor) and optionally broadcast it.
 * Shared by spell-effect / AoE executors so they can surface mechanical feedback
 * (e.g. "[AoE] affects Goblin 1, Goblin 2") into chat history — which the AI then
 * reads on its next turn. broadcast=false keeps it DM-only (preview/secret info).
 */
export function postDmMessage(stores: StoreAccessors, idPrefix: string, content: string, broadcast = true): void {
  stores
    .getLobbyStore()
    .getState()
    .addChatMessage({
      id: `${idPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'ai-dm',
      senderName: 'Dungeon Master',
      content,
      timestamp: Date.now(),
      isSystem: true
    })
  if (broadcast) {
    stores.getNetworkStore().getState().sendMessage('chat:message', { message: content, isSystem: true })
  }
}
