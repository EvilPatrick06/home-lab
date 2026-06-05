/**
 * Mounted-combat DM actions — let the AI DM mount/dismount creatures it controls.
 *
 * The engine already implements mounted combat (the rider's turn-state mountedOn/mountType
 * + the mount token's riderId, with movement/position sync and forced dismount in
 * map-token-slice / mount-rules). It was UI-only (MountModal); these actions give the AI
 * the same mount/dismount control, mirroring exactly what the modal does.
 */

import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function postMountNote(stores: StoreAccessors, msg: string): void {
  stores
    .getLobbyStore()
    .getState()
    .addChatMessage({
      id: `ai-mount-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'ai-dm',
      senderName: 'Dungeon Master',
      content: msg,
      timestamp: Date.now(),
      isSystem: true
    })
  stores.getNetworkStore().getState().sendMessage('chat:message', { message: msg, isSystem: true })
}

/** Mount a rider creature onto a mount creature (controlled by default). */
export function executeMountToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const a = action as { riderLabel?: string; mountLabel?: string; mountType?: 'controlled' | 'independent' }
  const rider = resolveTokenByLabel(activeMap.tokens, a.riderLabel ?? '')
  if (!rider) throw new Error(`Rider not found: ${a.riderLabel}`)
  const mount = resolveTokenByLabel(activeMap.tokens, a.mountLabel ?? '')
  if (!mount) throw new Error(`Mount not found: ${a.mountLabel}`)
  if (mount.id === rider.id) throw new Error('A creature cannot mount itself')
  if (mount.riderId) throw new Error(`${mount.label} already has a rider`)

  const mountType = a.mountType === 'independent' ? 'independent' : 'controlled'
  gameStore.setMounted(rider.entityId, mount.id, mountType)
  gameStore.updateToken(activeMap.id, mount.id, { riderId: rider.entityId })
  postMountNote(stores, `🐎 ${rider.label} mounts ${mount.label} (${mountType} mount)`)
  return true
}

/** Dismount a rider from whatever it's riding. */
export function executeDismountToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const rider = resolveTokenByLabel(activeMap.tokens, (action.riderLabel as string) ?? '')
  if (!rider) throw new Error(`Rider not found: ${action.riderLabel}`)

  const mountedOn = gameStore.turnStates?.[rider.entityId]?.mountedOn
  if (mountedOn) {
    const mount = activeMap.tokens.find((t) => t.id === mountedOn)
    if (mount) gameStore.updateToken(activeMap.id, mount.id, { riderId: undefined })
  }
  gameStore.dismountRider(rider.entityId)
  postMountNote(stores, `🐎 ${rider.label} dismounts`)
  return true
}
