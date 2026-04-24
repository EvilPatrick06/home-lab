import { useGameStore } from '../../stores/use-game-store'
import type { EntityCondition, InGameTimeState, InitiativeState } from '../../types/game-state'
import type { GameMap, MapToken } from '../../types/map'
import { logger } from '../../utils/logger'

const WORLD_STATE_DEBOUNCE_MS = 2000
const COMBAT_STATE_DEBOUNCE_MS = 1500

let worldDebounceTimer: ReturnType<typeof setTimeout> | null = null
let combatDebounceTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribe: (() => void) | null = null
let activeCampaignId: string | null = null

function deriveTimeOfDay(inGameTime: InGameTimeState | null): string {
  if (!inGameTime) return 'morning'
  const hour = Math.floor((inGameTime.totalSeconds % 86400) / 3600)
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 20) return 'dusk'
  if (hour >= 20 && hour < 22) return 'evening'
  return 'night'
}

function buildWorldState(
  activeMap: GameMap | undefined,
  activeMapId: string | null,
  inGameTime: InGameTimeState | null,
  weatherOverride: { description?: string } | null
): Record<string, unknown> {
  return {
    currentMapId: activeMapId,
    currentMapName: activeMap?.name ?? null,
    timeOfDay: deriveTimeOfDay(inGameTime),
    weather: weatherOverride?.description ?? 'clear',
    currentScene: activeMap?.name ?? '',
    activeTokenPositions: (activeMap?.tokens ?? []).map((t: MapToken) => ({
      name: t.label,
      gridX: t.gridX,
      gridY: t.gridY
    }))
  }
}

function buildCombatState(
  initiative: InitiativeState | null,
  conditions: EntityCondition[],
  activeMap: GameMap | undefined
): Record<string, unknown> {
  if (!initiative) {
    return {
      inCombat: false,
      round: 0,
      currentTurnEntity: null,
      entries: []
    }
  }

  const currentEntry = initiative.entries[initiative.currentIndex]
  const tokensByEntityId = new Map<string, MapToken>()
  if (activeMap) {
    for (const t of activeMap.tokens) {
      tokensByEntityId.set(t.entityId, t)
    }
  }

  return {
    inCombat: true,
    round: initiative.round,
    currentTurnEntity: currentEntry?.entityName ?? null,
    entries: initiative.entries.map((e) => {
      const token = tokensByEntityId.get(e.entityId)
      const entityConditions = conditions.filter((c) => c.entityId === e.entityId).map((c) => c.condition)

      return {
        name: e.entityName,
        initiative: e.total,
        hp: {
          current: token?.currentHP ?? 0,
          max: token?.maxHP ?? 0
        },
        conditions: entityConditions,
        isPlayer: e.entityType === 'player'
      }
    })
  }
}

function scheduleWorldStateSync(): void {
  if (!activeCampaignId) return
  if (worldDebounceTimer) clearTimeout(worldDebounceTimer)
  worldDebounceTimer = setTimeout(async () => {
    if (!activeCampaignId) return
    try {
      const gs = useGameStore.getState()
      const activeMap = gs.maps.find((m) => m.id === gs.activeMapId)
      const payload = buildWorldState(activeMap, gs.activeMapId, gs.inGameTime, gs.weatherOverride)
      await window.api.ai.syncWorldState(activeCampaignId, payload)
    } catch (err) {
      logger.error('[AI MemorySync] Failed to sync world state:', err)
    }
  }, WORLD_STATE_DEBOUNCE_MS)
}

function scheduleCombatStateSync(): void {
  if (!activeCampaignId) return
  if (combatDebounceTimer) clearTimeout(combatDebounceTimer)
  combatDebounceTimer = setTimeout(async () => {
    if (!activeCampaignId) return
    try {
      const gs = useGameStore.getState()
      const activeMap = gs.maps.find((m) => m.id === gs.activeMapId)
      const payload = buildCombatState(gs.initiative, gs.conditions, activeMap)
      await window.api.ai.syncCombatState(activeCampaignId, payload)
    } catch (err) {
      logger.error('[AI MemorySync] Failed to sync combat state:', err)
    }
  }, COMBAT_STATE_DEBOUNCE_MS)
}

/**
 * Start syncing game state to the AI Memory Manager for the given campaign.
 * Subscribes to the game store and debounces writes to world-state.json
 * and combat-state.json so the AI DM always has current context.
 */
export function startAiMemorySync(campaignId: string): void {
  stopAiMemorySync()
  activeCampaignId = campaignId

  let prevActiveMapId = useGameStore.getState().activeMapId
  let prevMaps = useGameStore.getState().maps
  let prevInitiative = useGameStore.getState().initiative
  let prevConditions = useGameStore.getState().conditions
  let prevInGameTime = useGameStore.getState().inGameTime
  let prevWeatherOverride = useGameStore.getState().weatherOverride

  scheduleWorldStateSync()

  unsubscribe = useGameStore.subscribe((state) => {
    const mapChanged = state.activeMapId !== prevActiveMapId || state.maps !== prevMaps
    const timeChanged = state.inGameTime !== prevInGameTime
    const weatherChanged = state.weatherOverride !== prevWeatherOverride

    if (mapChanged || timeChanged || weatherChanged) {
      prevActiveMapId = state.activeMapId
      prevMaps = state.maps
      prevInGameTime = state.inGameTime
      prevWeatherOverride = state.weatherOverride
      scheduleWorldStateSync()
    }

    const combatChanged = state.initiative !== prevInitiative || state.conditions !== prevConditions

    if (combatChanged || mapChanged) {
      prevInitiative = state.initiative
      prevConditions = state.conditions
      scheduleCombatStateSync()
    }
  })
}

/**
 * Stop syncing and flush pending writes.
 */
export function stopAiMemorySync(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  if (worldDebounceTimer) {
    clearTimeout(worldDebounceTimer)
    worldDebounceTimer = null
  }
  if (combatDebounceTimer) {
    clearTimeout(combatDebounceTimer)
    combatDebounceTimer = null
  }
  activeCampaignId = null
}
