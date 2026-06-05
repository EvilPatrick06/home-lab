/**
 * Environment-zone DM actions (P6.11 — G14 darkness zones + G15 terrain cells).
 *
 * Darkness zones (regional magical darkness) and terrain cells (difficult/hazard/
 * water/climbing/portal) are full engine features editable in the map editor, but
 * the AI DM had no verbs to place or perceive them. These executors call the
 * darkness-zone / terrain store slices; the cells/zones then surface in the AI's
 * game-state snapshot. Board edits are silent (like token placement) — no chat spam.
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import type { DarknessZone, TerrainCell } from '../../types/map'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── G14: darkness zones ──

export function executeAddDarknessZone(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const zone: DarknessZone = {
    id: crypto.randomUUID(),
    x: action.x as number,
    y: action.y as number,
    radius: action.radius as number,
    floor: action.floor as number | undefined,
    magicLevel: action.magicLevel as DarknessZone['magicLevel']
  }
  gameStore.addDarknessZone(activeMap.id, zone)
  return true
}

export function executeUpdateDarknessZone(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const zoneId = action.zoneId as string
  const updates: Partial<DarknessZone> = {}
  if (action.x != null) updates.x = action.x as number
  if (action.y != null) updates.y = action.y as number
  if (action.radius != null) updates.radius = action.radius as number
  if (action.magicLevel != null) updates.magicLevel = action.magicLevel as DarknessZone['magicLevel']
  if (action.floor != null) updates.floor = action.floor as number
  gameStore.updateDarknessZone(activeMap.id, zoneId, updates)
  return true
}

export function executeRemoveDarknessZone(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  gameStore.removeDarknessZone(activeMap.id, action.zoneId as string)
  return true
}

// ── G15: terrain cells ──

export function executePlaceTerrain(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const type = action.type as TerrainCell['type']
  // Default movement cost matches the map editor: hazards cost 1 (you still cross them,
  // taking damage), everything else (difficult/water/climbing) costs 2.
  const movementCost = (action.movementCost as number | undefined) ?? (type === 'hazard' ? 1 : 2)
  const cell: TerrainCell = {
    x: action.gridX as number,
    y: action.gridY as number,
    type,
    movementCost,
    hazardType: action.hazardType as TerrainCell['hazardType'],
    hazardDamage: action.hazardDamage as number | undefined,
    portalTarget: action.portalTarget as TerrainCell['portalTarget'],
    floor: action.floor as number | undefined
  }
  gameStore.addTerrainCell(activeMap.id, cell)
  return true
}

export function executeRemoveTerrain(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  gameStore.removeTerrainCell(
    activeMap.id,
    action.gridX as number,
    action.gridY as number,
    action.floor as number | undefined
  )
  return true
}

// Partial update of an existing terrain cell (G41) — change just the type, movement
// cost, or hazard without re-specifying the whole cell.
export function executeUpdateTerrain(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const updates: Partial<TerrainCell> = {}
  if (action.type != null) updates.type = action.type as TerrainCell['type']
  if (action.movementCost != null) updates.movementCost = action.movementCost as number
  if (action.hazardType != null) updates.hazardType = action.hazardType as TerrainCell['hazardType']
  if (action.hazardDamage != null) updates.hazardDamage = action.hazardDamage as number
  gameStore.updateTerrainCell(
    activeMap.id,
    action.gridX as number,
    action.gridY as number,
    updates,
    action.floor as number | undefined
  )
  return true
}
