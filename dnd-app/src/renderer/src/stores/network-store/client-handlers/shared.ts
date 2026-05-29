import { useGameStore } from '../../use-game-store'

// Phase 27i — client-side cache of Blob URLs for DM-streamed custom audio,
// keyed by fileName. Lets a stop message revoke the exact URL it created.
export const customAudioUrlCache = new Map<string, string>()

/** Apply a partial game state update from the network */
export function applyGameState(data: Record<string, unknown>): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return
  // Prototype pollution protection
  if ('__proto__' in data || 'constructor' in data || 'prototype' in data) {
    console.warn('[Network] Blocked state update with unsafe prototype keys')
    return
  }
  useGameStore.getState().loadGameState(data)
}

/** Handle granular game:state-update messages with add/remove/update operations */
export function handleGameStateUpdate(payload: Record<string, unknown>): void {
  const gs = useGameStore.getState()

  if (payload.addToken) {
    const { mapId, token } = payload.addToken as { mapId: string; token: import('../../../types/map').MapToken }
    gs.addToken(mapId, token)
    return
  }

  if (payload.removeToken) {
    const { mapId, tokenId } = payload.removeToken as { mapId: string; tokenId: string }
    gs.removeToken(mapId, tokenId)
    return
  }

  if (payload.updateToken) {
    const { mapId, tokenId, updates } = payload.updateToken as {
      mapId: string
      tokenId: string
      updates: Partial<import('../../../types/map').MapToken>
    }
    gs.updateToken(mapId, tokenId, updates)
    return
  }

  if (payload.addMap) {
    gs.addMap(payload.addMap as import('../../../types/map').GameMap)
    return
  }

  if (payload.wallSegments) {
    const { mapId, segments } = payload.wallSegments as {
      mapId: string
      segments: import('../../../types/map').WallSegment[]
    }
    const maps = gs.maps.map((m) => (m.id === mapId ? { ...m, wallSegments: segments } : m))
    useGameStore.setState({ maps })
    return
  }

  // Generic partial state update
  applyGameState(payload)
}
