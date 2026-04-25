import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/use-game-store'
import { useNetworkStore } from '../stores/network-store'
import { logger } from '../utils/logger'

const DEBOUNCE_MS = 3000

/**
 * Hook that subscribes to game store changes (initiative, conditions, HP, activeMapId)
 * and syncs significant changes to the AI memory system via IPC.
 *
 * Only syncs when:
 * - The user is the host
 * - campaignId is truthy
 *
 * Debounces at 3 seconds to avoid excessive IPC traffic.
 */
export function useAiMemorySync(campaignId: string | null | undefined): void {
  const networkRole = useNetworkStore((s) => s.role)
  const isHost = networkRole === 'host'
  const worldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const combatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isHost || !campaignId) return

    let prevActiveMapId = useGameStore.getState().activeMapId
    let prevMaps = useGameStore.getState().maps
    let prevInitiative = useGameStore.getState().initiative
    let prevConditions = useGameStore.getState().conditions

    const scheduleWorldSync = (): void => {
      if (worldTimerRef.current) clearTimeout(worldTimerRef.current)
      worldTimerRef.current = setTimeout(async () => {
        try {
          const gs = useGameStore.getState()
          const activeMap = gs.maps.find((m) => m.id === gs.activeMapId)
          const payload = {
            currentMapId: gs.activeMapId,
            currentMapName: activeMap?.name ?? null,
            tokenCount: activeMap?.tokens.length ?? 0,
            activeTokenPositions: (activeMap?.tokens ?? []).map((t) => ({
              name: t.label,
              gridX: t.gridX,
              gridY: t.gridY,
              hp: t.currentHP != null ? `${t.currentHP}/${t.maxHP ?? '?'}` : undefined
            }))
          }
          await window.api.ai.syncWorldState(campaignId, payload)
        } catch (err) {
          logger.error('[useAiMemorySync] Failed to sync world state:', err)
        }
      }, DEBOUNCE_MS)
    }

    const scheduleCombatSync = (): void => {
      if (combatTimerRef.current) clearTimeout(combatTimerRef.current)
      combatTimerRef.current = setTimeout(async () => {
        try {
          const gs = useGameStore.getState()
          const activeMap = gs.maps.find((m) => m.id === gs.activeMapId)
          const init = gs.initiative
          const payload = {
            inCombat: !!init,
            round: init?.round ?? 0,
            currentTurnEntity: init ? (init.entries[init.currentIndex]?.entityName ?? null) : null,
            entries: init
              ? init.entries.map((e) => {
                  const token = activeMap?.tokens.find((t) => t.entityId === e.entityId)
                  const entityConditions = gs.conditions
                    .filter((c) => c.entityId === e.entityId)
                    .map((c) => c.condition)
                  return {
                    name: e.entityName,
                    initiative: e.total,
                    hp: { current: token?.currentHP ?? 0, max: token?.maxHP ?? 0 },
                    conditions: entityConditions,
                    isPlayer: e.entityType === 'player'
                  }
                })
              : []
          }
          await window.api.ai.syncCombatState(campaignId, payload)
        } catch (err) {
          logger.error('[useAiMemorySync] Failed to sync combat state:', err)
        }
      }, DEBOUNCE_MS)
    }

    // Initial sync
    scheduleWorldSync()

    const unsubscribe = useGameStore.subscribe((state) => {
      // Check for world state changes (map, tokens with HP changes)
      const mapChanged = state.activeMapId !== prevActiveMapId || state.maps !== prevMaps
      if (mapChanged) {
        prevActiveMapId = state.activeMapId
        prevMaps = state.maps
        scheduleWorldSync()
      }

      // Check for combat state changes
      const combatChanged = state.initiative !== prevInitiative || state.conditions !== prevConditions
      if (combatChanged || mapChanged) {
        prevInitiative = state.initiative
        prevConditions = state.conditions
        scheduleCombatSync()
      }
    })

    return () => {
      unsubscribe()
      if (worldTimerRef.current) clearTimeout(worldTimerRef.current)
      if (combatTimerRef.current) clearTimeout(combatTimerRef.current)
    }
  }, [isHost, campaignId])
}
