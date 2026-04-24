/**
 * Visibility & environment actions — fog, lighting, weather, moon, ambient light,
 * underwater, travel pace, light sources, sound effects.
 */

import { LIGHT_SOURCES } from '../../data/light-sources'
import { type AmbientSound, playAmbient, play as playSound, type SoundEvent, stopAmbient } from '../sound-manager'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

export function executeRevealFog(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const cells = action.cells as Array<{ x: number; y: number }>
  if (!Array.isArray(cells)) throw new Error('Missing cells array')
  gameStore.revealFog(activeMap.id, cells)
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:fog-reveal', { cells, reveal: true })
  return true
}

export function executeHideFog(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const cells = action.cells as Array<{ x: number; y: number }>
  if (!Array.isArray(cells)) throw new Error('Missing cells array')
  gameStore.hideFog(activeMap.id, cells)
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:fog-reveal', { cells, reveal: false })
  return true
}

export function executeSetAmbientLight(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const level = action.level as 'bright' | 'dim' | 'darkness'
  if (!['bright', 'dim', 'darkness'].includes(level)) throw new Error(`Invalid light level: ${level}`)
  gameStore.setAmbientLight(level)
  return true
}

export function executeSetUnderwaterCombat(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  gameStore.setUnderwaterCombat(action.enabled as boolean)
  return true
}

export function executeSetTravelPace(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const pace = action.pace as 'fast' | 'normal' | 'slow' | null
  gameStore.setTravelPace(pace)
  return true
}

export function executeLightSource(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const entityName = action.entityName as string
  const sourceName = action.sourceName as string
  if (!entityName || !sourceName) throw new Error('Missing entityName or sourceName')

  const sourceKey = sourceName.toLowerCase().replace(/\s+/g, '-')
  const sourceData = LIGHT_SOURCES[sourceKey]
  if (!sourceData) throw new Error(`Unknown light source: ${sourceName}`)

  const token = activeMap ? resolveTokenByLabel(activeMap.tokens, entityName) : undefined
  const entityId = token?.entityId ?? entityName
  gameStore.lightSource(entityId, entityName, sourceKey, sourceData.durationSeconds)
  stores
    .getNetworkStore()
    .getState()
    .sendMessage('dm:light-source-update', { entityId, entityName, sourceName: sourceKey, action: 'light' })
  return true
}

export function executeExtinguishSource(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const entityName = action.entityName as string
  const sourceName = action.sourceName as string
  if (!entityName) throw new Error('Missing entityName')

  const sources = gameStore.activeLightSources
  const source = sources.find(
    (s) =>
      s.entityName.toLowerCase() === entityName.toLowerCase() &&
      (!sourceName || s.sourceName.toLowerCase().includes(sourceName.toLowerCase()))
  )
  if (!source) throw new Error(`No active light source found for ${entityName}`)
  gameStore.extinguishSource(source.id)
  stores
    .getNetworkStore()
    .getState()
    .sendMessage('dm:light-source-update', {
      entityId: source.entityId ?? source.entityName,
      entityName,
      sourceName: source.sourceName,
      action: 'extinguish'
    })
  return true
}

export function executeSoundEffect(action: DmAction): boolean {
  const sound = action.sound as string
  if (sound) playSound(sound as SoundEvent)
  return true
}

export function executePlayAmbient(action: DmAction): boolean {
  const loop = action.loop as string
  if (loop) playAmbient(loop as AmbientSound)
  return true
}

export function executeStopAmbient(): boolean {
  stopAmbient()
  return true
}

export function executeSetWeather(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const description = action.description as string
  if (!description) throw new Error('Missing weather description')
  gameStore.setWeatherOverride({
    description,
    temperature: action.temperature as number | undefined,
    temperatureUnit: action.temperatureUnit as 'F' | 'C' | undefined,
    windSpeed: action.windSpeed as string | undefined,
    mechanicalEffects: action.mechanicalEffects as string[] | undefined
  })
  return true
}

export function executeClearWeather(_action: DmAction, gameStore: GameStoreSnapshot): boolean {
  gameStore.setWeatherOverride(null)
  return true
}

export function executeSetMoon(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const phase = action.phase as string
  if (!phase) throw new Error('Missing moon phase')
  gameStore.setMoonOverride(phase)
  return true
}
