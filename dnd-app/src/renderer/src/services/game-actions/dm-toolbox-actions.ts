/**
 * DM-toolbox affliction/environment/trap actions (P6.12 — G16 + G17 + G18).
 *
 * The engine already tracks active environmental effects, diseases, curses, and
 * placed traps (effects-slice + the game-state snapshot reads them), but the AI DM
 * had no verbs to apply or manage them. These executors call the effects slice;
 * the results then surface in the AI's snapshot.
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import type { ActiveCurse, ActiveDisease, ActiveEnvironmentalEffect, PlacedTrap } from '../../types/dm-toolbox'
import { postDmMessage } from './broadcast-utils'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── G16: environmental effects ──

export function executeAddEnvironmentalEffect(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  const name = action.name as string
  const effect: ActiveEnvironmentalEffect = {
    id: crypto.randomUUID(),
    effectId: (action.effectId as string | undefined) ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    appliedAt: Date.now(),
    mechanicalEffect: action.mechanicalEffect as string | undefined,
    saveDC: action.saveDC as number | undefined,
    category: action.category as ActiveEnvironmentalEffect['category']
  }
  gameStore.addEnvironmentalEffect(effect)
  return true
}

export function executeRemoveEnvironmentalEffect(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  const effectId = action.effectId as string | undefined
  const name = action.name as string | undefined
  const match = gameStore.activeEnvironmentalEffects.find(
    (e) =>
      (effectId && (e.id === effectId || e.effectId === effectId)) ||
      (name && e.name.toLowerCase() === name.toLowerCase())
  )
  if (!match) throw new Error(`Environmental effect not found: ${name ?? effectId ?? '(unspecified)'}`)
  gameStore.removeEnvironmentalEffect(match.id)
  return true
}

// ── G17: diseases & curses ──

export function executeApplyDisease(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const label = action.targetLabel as string
  const name = action.name as string
  const token = activeMap ? resolveTokenByLabel(activeMap.tokens, label) : undefined
  const disease: ActiveDisease = {
    id: crypto.randomUUID(),
    diseaseId: (action.diseaseId as string | undefined) ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    targetId: token?.entityId ?? crypto.randomUUID(),
    targetName: token?.label ?? label,
    successCount: 0,
    failCount: 0,
    notes: action.notes as string | undefined
  }
  gameStore.addDisease(disease)
  postDmMessage(stores, 'disease', `🦠 ${disease.targetName} contracts ${name}.`)
  return true
}

export function executeRemoveDisease(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const label = action.targetLabel as string
  const name = action.name as string | undefined
  const match = findAffliction(gameStore.activeDiseases, label, name)
  if (!match) throw new Error(`Disease not found on ${label}${name ? ` (${name})` : ''}`)
  gameStore.removeDisease(match.id)
  postDmMessage(stores, 'disease-cure', `💊 ${match.targetName} is cured of ${match.name}.`)
  return true
}

export function executeRecordDiseaseSave(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const label = action.targetLabel as string
  const name = action.name as string | undefined
  const success = action.success as boolean
  const match = findAffliction(gameStore.activeDiseases, label, name)
  if (!match) throw new Error(`Disease not found on ${label}${name ? ` (${name})` : ''}`)
  gameStore.updateDisease(
    match.id,
    success ? { successCount: match.successCount + 1 } : { failCount: match.failCount + 1 }
  )
  const after = success ? match.successCount + 1 : match.failCount + 1
  postDmMessage(
    stores,
    'disease-save',
    `${success ? '✅' : '❌'} ${match.targetName} ${success ? 'succeeds' : 'fails'} a save vs ${match.name} (${success ? after : match.successCount} success / ${success ? match.failCount : after} fail).`
  )
  return true
}

export function executeApplyCurse(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const label = action.targetLabel as string
  const name = action.name as string
  const token = activeMap ? resolveTokenByLabel(activeMap.tokens, label) : undefined
  const curse: ActiveCurse = {
    id: crypto.randomUUID(),
    curseId: (action.curseId as string | undefined) ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    targetId: token?.entityId ?? crypto.randomUUID(),
    targetName: token?.label ?? label,
    source: action.source as string | undefined,
    notes: action.notes as string | undefined
  }
  gameStore.addCurse(curse)
  postDmMessage(stores, 'curse', `🔮 ${curse.targetName} is afflicted with ${name}.`)
  return true
}

export function executeRemoveCurse(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const label = action.targetLabel as string
  const name = action.name as string | undefined
  const match = findAffliction(gameStore.activeCurses, label, name)
  if (!match) throw new Error(`Curse not found on ${label}${name ? ` (${name})` : ''}`)
  gameStore.removeCurse(match.id)
  postDmMessage(stores, 'curse-lift', `✨ ${match.targetName} is freed from ${match.name}.`)
  return true
}

// ── G18: traps ──

export function executePlaceTrap(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  const name = action.name as string
  const trap: PlacedTrap = {
    id: crypto.randomUUID(),
    trapId: (action.trapId as string | undefined) ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    gridX: action.gridX as number,
    gridY: action.gridY as number,
    armed: true,
    revealed: false
  }
  gameStore.addPlacedTrap(trap)
  // Silent: a freshly placed trap is hidden DM setup — players shouldn't see it announced.
  return true
}

export function executeTriggerTrap(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const trap = findTrap(gameStore.placedTraps, action)
  if (!trap) throw new Error(`Trap not found: ${describeTrapRef(action)}`)
  gameStore.triggerTrap(trap.id)
  postDmMessage(stores, 'trap-trigger', `⚠️ The ${trap.name} at (${trap.gridX}, ${trap.gridY}) springs!`)
  return true
}

export function executeRevealTrap(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const trap = findTrap(gameStore.placedTraps, action)
  if (!trap) throw new Error(`Trap not found: ${describeTrapRef(action)}`)
  gameStore.revealTrap(trap.id)
  postDmMessage(stores, 'trap-reveal', `🔍 A ${trap.name} is spotted at (${trap.gridX}, ${trap.gridY}).`)
  return true
}

export function executeRemoveTrap(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  _stores: StoreAccessors
): boolean {
  const trap = findTrap(gameStore.placedTraps, action)
  if (!trap) throw new Error(`Trap not found: ${describeTrapRef(action)}`)
  gameStore.removeTrap(trap.id)
  return true
}

// ── Helpers ──

/** Find an active disease/curse by target name (case-insensitive) + optional affliction name. */
function findAffliction<T extends { targetName: string; name: string }>(
  list: T[],
  targetLabel: string,
  name?: string
): T | undefined {
  return list.find(
    (a) =>
      a.targetName.toLowerCase() === targetLabel.toLowerCase() && (!name || a.name.toLowerCase() === name.toLowerCase())
  )
}

/** Find a placed trap by name (case-insensitive) and/or grid position. */
function findTrap(traps: PlacedTrap[], action: DmAction): PlacedTrap | undefined {
  const name = action.name as string | undefined
  const gridX = action.gridX as number | undefined
  const gridY = action.gridY as number | undefined
  return traps.find((t) => {
    const nameOk = name ? t.name.toLowerCase() === name.toLowerCase() : true
    const posOk = gridX != null && gridY != null ? t.gridX === gridX && t.gridY === gridY : true
    // Require at least one selector to actually match (don't match the first trap blindly).
    if (name == null && (gridX == null || gridY == null)) return false
    return nameOk && posOk
  })
}

function describeTrapRef(action: DmAction): string {
  const name = action.name as string | undefined
  const gridX = action.gridX as number | undefined
  const gridY = action.gridY as number | undefined
  if (name) return name
  if (gridX != null && gridY != null) return `(${gridX}, ${gridY})`
  return '(unspecified)'
}
