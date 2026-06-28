/**
 * Wall-segment DM actions (P6.20 — G40).
 *
 * Walls (solid / door / window / one-way / transparent, with open state + facing)
 * drive cover and line-of-sight, but the AI DM had no verb to place, open/close, or
 * remove them. These executors call the map-token slice's wall CRUD; walls then
 * surface in the [WALLS] snapshot block. Silent board edits (like token placement).
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import type { WallSegment } from '../../types/map'
import { broadcastTokenSync } from './broadcast-utils'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

export function executeAddWallSegment(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const wall: WallSegment = {
    id: crypto.randomUUID(),
    x1: action.x1 as number,
    y1: action.y1 as number,
    x2: action.x2 as number,
    y2: action.y2 as number,
    type: action.type as WallSegment['type'],
    isOpen: action.isOpen as boolean | undefined,
    oneWayDirection: action.oneWayDirection as number | undefined,
    floor: action.floor as number | undefined
  }
  gameStore.addWallSegment(activeMap.id, wall)
  broadcastTokenSync(activeMap.id, stores)
  return true
}

export function executeRemoveWallSegment(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  gameStore.removeWallSegment(activeMap.id, action.wallId as string)
  broadcastTokenSync(activeMap.id, stores)
  return true
}

export function executeUpdateWallSegment(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const updates: Partial<WallSegment> = {}
  if (action.type != null) updates.type = action.type as WallSegment['type']
  if (action.isOpen != null) updates.isOpen = action.isOpen as boolean
  if (action.oneWayDirection != null) updates.oneWayDirection = action.oneWayDirection as number
  if (action.floor != null) updates.floor = action.floor as number
  if (action.x1 != null) updates.x1 = action.x1 as number
  if (action.y1 != null) updates.y1 = action.y1 as number
  if (action.x2 != null) updates.x2 = action.x2 as number
  if (action.y2 != null) updates.y2 = action.y2 as number
  gameStore.updateWallSegment(activeMap.id, action.wallId as string, updates)
  broadcastTokenSync(activeMap.id, stores)
  return true
}
