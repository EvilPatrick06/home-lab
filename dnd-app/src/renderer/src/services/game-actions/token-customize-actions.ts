/**
 * Token customization DM action (P6.22 — G44 + G45 + G46).
 *
 * MapToken carries elevation/floor, visual styling (color, border, label size, aura),
 * and mobility/senses (swim/climb/fly speed, special senses) — all mutable via
 * updateToken — but the AI DM had no verb for any of them. customize_token maps the
 * provided fields onto a Partial<MapToken> and applies it. Setting `elevation` flows
 * through updateToken, which auto-applies falling-damage rules for drops ≥ 10ft.
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import type { MapToken } from '../../types/map'
import { broadcastTokenSync } from './broadcast-utils'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

export function executeCustomizeToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.label as string)
  if (!token) throw new Error(`Token not found: ${action.label}`)

  const updates: Partial<MapToken> = {}
  if (action.elevation != null) updates.elevation = action.elevation as number
  if (action.floor != null) updates.floor = action.floor as number
  if (action.color != null) updates.color = action.color as string
  if (action.borderColor != null) updates.borderColor = action.borderColor as string
  if (action.borderStyle != null) updates.borderStyle = action.borderStyle as MapToken['borderStyle']
  if (action.labelFontSize != null) updates.labelFontSize = action.labelFontSize as number
  if (action.aura != null) updates.aura = action.aura as MapToken['aura']
  if (action.swimSpeed != null) updates.swimSpeed = action.swimSpeed as number
  if (action.climbSpeed != null) updates.climbSpeed = action.climbSpeed as number
  if (action.flySpeed != null) updates.flySpeed = action.flySpeed as number
  if (action.specialSenses != null) updates.specialSenses = action.specialSenses as MapToken['specialSenses']

  gameStore.updateToken(activeMap.id, token.id, updates)
  broadcastTokenSync(activeMap.id, stores)
  return true
}
