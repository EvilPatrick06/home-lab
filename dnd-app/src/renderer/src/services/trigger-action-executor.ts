import { useGameStore } from '../stores/use-game-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { logger } from '../utils/logger'

/**
 * Execute a DM trigger's action when the main-process observer reports it fired.
 * Runs in the renderer (the DM client). Actions mirror TriggerManagerModal's
 * action payloads: narrate/show_message ({text}), play_sound ({soundId}),
 * change_lighting ({level}), spawn_creature ({creatureId}).
 */
export function executeTriggerAction(action: string, payload: Record<string, unknown>): void {
  switch (action) {
    case 'narrate':
    case 'show_message': {
      const text = typeof payload.text === 'string' ? payload.text : ''
      if (!text.trim()) return
      useLobbyStore.getState().addChatMessage({
        id: `trigger-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: action === 'narrate' ? 'ai-dm' : 'system',
        senderName: action === 'narrate' ? 'AI Dungeon Master' : 'System',
        content: text,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }
    case 'play_sound': {
      const soundId = typeof payload.soundId === 'string' ? payload.soundId : ''
      if (soundId) {
        import('./sound-manager')
          .then(({ play }) => play(soundId as Parameters<typeof play>[0]))
          .catch((err) => logger.warn('[trigger] play_sound failed', err))
      }
      break
    }
    case 'change_lighting': {
      const level = payload.level
      if (level === 'bright' || level === 'dim' || level === 'darkness') {
        useGameStore.getState().setAmbientLight(level)
      }
      break
    }
    case 'spawn_creature': {
      // PHASE-13 13D — place at the trigger's configured gridX/gridY when both are valid
      // non-negative integers (clamped to the active map's grid bounds); otherwise fall back
      // to the active map's centre.
      const creatureId = typeof payload.creatureId === 'string' ? payload.creatureId : ''
      if (!creatureId) break
      const gs = useGameStore.getState()
      const map = gs.maps.find((m) => m.id === gs.activeMapId)
      if (!map) break
      const cell = map.grid.cellSize || 70
      const maxX = Math.max(0, Math.floor(map.width / cell) - 1)
      const maxY = Math.max(0, Math.floor(map.height / cell) - 1)
      const validCoord = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
      const gridX = validCoord(payload.gridX)
        ? Math.min(payload.gridX, maxX)
        : Math.max(0, Math.floor(map.width / cell / 2))
      const gridY = validCoord(payload.gridY)
        ? Math.min(payload.gridY, maxY)
        : Math.max(0, Math.floor(map.height / cell / 2))
      import('./game-action-executor')
        .then(({ executeDmActions }) => {
          executeDmActions([{ action: 'place_creature', creatureId, gridX, gridY }])
        })
        .catch((err) => logger.warn('[trigger] spawn_creature failed', err))
      break
    }
    default:
      logger.warn(`[trigger] unknown action: ${action}`)
  }
}
