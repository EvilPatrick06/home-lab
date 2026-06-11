/**
 * Drawing + scene-region DM actions (P6.21 — G42 + G43).
 *
 * Drawings (freehand/line/rect/circle/text annotations) and scene regions (trigger
 * zones with enter/leave/turn triggers firing alert-dm / teleport / apply-condition)
 * are full map features with store CRUD, but the AI DM had no verbs for them. These
 * executors call the drawing / region slices; both surface in the snapshot.
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import type { DrawingData, SceneRegion } from '../../types/map'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── G42: drawings ──

export function executeAddDrawing(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const drawing: DrawingData = {
    id: crypto.randomUUID(),
    type: action.type as DrawingData['type'],
    points: action.points as Array<{ x: number; y: number }>,
    color: action.color as string,
    strokeWidth: action.strokeWidth as number,
    text: action.text as string | undefined,
    visibleToPlayers: action.visibleToPlayers as boolean | undefined,
    floor: action.floor as number | undefined
  }
  gameStore.addDrawing(activeMap.id, drawing)
  return true
}

export function executeRemoveDrawing(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const drawingId = action.drawingId as string
  // 08H — store removal of a missing id is a silent no-op; fail honestly so the AI learns it
  // (the auto-execute path posts the failure to chat). Ids are listed in [GAME STATE].
  if (!activeMap.drawings?.some((d) => d.id === drawingId)) {
    throw new Error(`Drawing not found: ${drawingId}`)
  }
  gameStore.removeDrawing(activeMap.id, drawingId)
  return true
}

export function executeClearDrawings(
  _action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  gameStore.clearDrawings(activeMap.id)
  return true
}

// ── G43: scene regions ──

export function executeAddRegion(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const region: SceneRegion = {
    id: crypto.randomUUID(),
    name: action.name as string,
    shape: action.shape as SceneRegion['shape'],
    trigger: action.trigger as SceneRegion['trigger'],
    action: action.regionAction as SceneRegion['action'],
    enabled: (action.enabled as boolean | undefined) ?? true,
    visibleToPlayers: (action.visibleToPlayers as boolean | undefined) ?? false,
    oneShot: (action.oneShot as boolean | undefined) ?? false,
    color: action.color as string | undefined,
    floor: action.floor as number | undefined
  }
  gameStore.addRegion(activeMap.id, region)
  return true
}

export function executeUpdateRegion(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const updates: Partial<SceneRegion> = {}
  if (action.name != null) updates.name = action.name as string
  if (action.enabled != null) updates.enabled = action.enabled as boolean
  if (action.visibleToPlayers != null) updates.visibleToPlayers = action.visibleToPlayers as boolean
  if (action.oneShot != null) updates.oneShot = action.oneShot as boolean
  if (action.trigger != null) updates.trigger = action.trigger as SceneRegion['trigger']
  if (action.regionAction != null) updates.action = action.regionAction as SceneRegion['action']
  gameStore.updateRegion(activeMap.id, action.regionId as string, updates)
  return true
}

export function executeRemoveRegion(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  gameStore.removeRegion(activeMap.id, action.regionId as string)
  return true
}
