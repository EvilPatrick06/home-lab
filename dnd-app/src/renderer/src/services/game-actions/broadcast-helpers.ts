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
