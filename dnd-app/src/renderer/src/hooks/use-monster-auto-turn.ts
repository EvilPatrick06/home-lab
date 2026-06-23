import { useEffect, useRef } from 'react'
import { runMonsterTurn } from '../services/combat/monster-turn-executor'
import { lookupTokenStatBlock } from '../services/game/token-stats'
import { pluginEventBus } from '../services/plugin-system/event-bus'
import { useNetworkStore } from '../stores/network-store'
import { getGameStore, getLobbyStore, getNetworkStore } from '../stores/store-accessors'
import { useGameStore } from '../stores/use-game-store'
import { logger } from '../utils/logger'

const AUTO_TURN_DELAY_MS = 800 // let the turn-change UI settle (mirrors mookAI's visible cadence)

type TurnStartPayload = { entityId: string; entityName: string; round: number }

/**
 * PHASE-30 30E — opt-in auto-run of enemy turns. Subscribes to `game:turn-start`; when
 * `monsterAutomation.autoRun` is on, this client is the authority (host or solo DM), the game is
 * not paused, and the incoming entity is a stat-block-backed enemy whose INT is ≤ the configured
 * cap, it runs the deterministic turn once per entity-turn. Everything off by default.
 */
export function useMonsterAutoTurn(): void {
  const lastRunRef = useRef<string>('')
  useEffect(() => {
    const handler = (payload: TurnStartPayload): void => {
      const auto = useGameStore.getState().monsterAutomation
      if (!auto?.autoRun) return
      // Authority: only the host (or a solo DM with no network) runs automation.
      const role = useNetworkStore.getState().role
      if (role !== 'host' && role !== 'none') return
      const gs = useGameStore.getState()
      if (gs.isPaused) return
      const entry = gs.initiative?.entries.find((e) => e.entityId === payload.entityId)
      if (entry?.entityType !== 'enemy') return
      const map = gs.maps.find((m) => m.id === gs.activeMapId) ?? gs.maps[0]
      const token = map?.tokens.find((tk) => tk.entityId === payload.entityId)
      if (!token?.monsterStatBlockId) return
      const sb = lookupTokenStatBlock(token.monsterStatBlockId)
      if (!sb || sb.abilityScores.int > auto.autoRunMaxInt) return
      // Fire once per entity-turn (the event can re-emit on re-renders).
      const key = `${payload.entityId}:${payload.round}`
      if (lastRunRef.current === key) return
      lastRunRef.current = key

      setTimeout(() => {
        try {
          runMonsterTurn(
            entry.entityName,
            { getGameStore, getLobbyStore, getNetworkStore },
            { autoAdvance: auto.autoAdvance }
          )
        } catch (err) {
          logger.warn('[MonsterAutoTurn] failed (turn advancement unaffected):', err)
        }
      }, AUTO_TURN_DELAY_MS)
    }
    pluginEventBus.on<TurnStartPayload>('game:turn-start', 'phase30-monster-auto-turn', handler)
    return () => pluginEventBus.off('game:turn-start', handler as (p: unknown) => void)
  }, [])
}
