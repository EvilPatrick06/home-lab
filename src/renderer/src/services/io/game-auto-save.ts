import { useGameStore } from '../../stores/use-game-store'
import type { GameMap } from '../../types/map'
import { logger } from '../../utils/logger'

const AUTO_SAVE_DEBOUNCE_MS = 5000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribe: (() => void) | null = null
let activeCampaignId: string | null = null

function buildSavePayload(): Record<string, unknown> {
  const gs = useGameStore.getState()
  return {
    maps: gs.maps,
    activeMapId: gs.activeMapId,
    initiative: gs.initiative,
    round: gs.round,
    conditions: gs.conditions,
    turnMode: gs.turnMode,
    isPaused: gs.isPaused,
    turnStates: gs.turnStates,
    underwaterCombat: gs.underwaterCombat,
    flankingEnabled: gs.flankingEnabled,
    groupInitiativeEnabled: gs.groupInitiativeEnabled,
    diagonalRule: gs.diagonalRule,
    ambientLight: gs.ambientLight,
    travelPace: gs.travelPace,
    marchingOrder: gs.marchingOrder,
    allies: gs.allies,
    enemies: gs.enemies,
    places: gs.places,
    inGameTime: gs.inGameTime,
    restTracking: gs.restTracking,
    activeLightSources: gs.activeLightSources,
    sessionLog: gs.sessionLog,
    currentSessionId: gs.currentSessionId,
    currentSessionLabel: gs.currentSessionLabel,
    weatherOverride: gs.weatherOverride,
    moonOverride: gs.moonOverride,
    savedWeatherPresets: gs.savedWeatherPresets,
    handouts: gs.handouts,
    combatTimer: gs.combatTimer,
    shopInventory: gs.shopInventory,
    shopName: gs.shopName,
    shopMarkup: gs.shopMarkup
  }
}

function scheduleSave(): void {
  if (!activeCampaignId) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    if (!activeCampaignId) return
    try {
      await window.api.saveGameState(activeCampaignId, buildSavePayload())
    } catch (err) {
      logger.error('[AutoSave] Failed to save game state:', err)
    }
  }, AUTO_SAVE_DEBOUNCE_MS)
}

/**
 * Start auto-saving game state for the given campaign.
 * Subscribes to the game store and debounces saves.
 */
export function startAutoSave(campaignId: string): void {
  stopAutoSave()
  activeCampaignId = campaignId

  let prevMaps: GameMap[] = useGameStore.getState().maps
  let prevInitiative = useGameStore.getState().initiative
  let prevConditions = useGameStore.getState().conditions
  let prevActiveMapId = useGameStore.getState().activeMapId

  unsubscribe = useGameStore.subscribe((state) => {
    const changed =
      state.maps !== prevMaps ||
      state.initiative !== prevInitiative ||
      state.conditions !== prevConditions ||
      state.activeMapId !== prevActiveMapId

    if (changed) {
      prevMaps = state.maps
      prevInitiative = state.initiative
      prevConditions = state.conditions
      prevActiveMapId = state.activeMapId
      scheduleSave()
    }
  })
}

/**
 * Stop auto-saving and flush any pending save immediately.
 */
export function stopAutoSave(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  activeCampaignId = null
}

/**
 * Force an immediate save (e.g., on exit).
 */
export async function flushAutoSave(campaignId: string): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  try {
    await window.api.saveGameState(campaignId, buildSavePayload())
  } catch (err) {
    logger.error('[AutoSave] Flush failed:', err)
  }
}

/**
 * Load persisted game state and apply it to the store.
 */
export async function loadPersistedGameState(campaignId: string): Promise<boolean> {
  try {
    const data = await window.api.loadGameState(campaignId)
    if (data) {
      useGameStore.getState().loadGameState(data)
      return true
    }
  } catch (err) {
    logger.error('[AutoSave] Failed to load game state:', err)
  }
  return false
}
