import type {
  ConditionUpdatePayload,
  DrawingAddPayload,
  DrawingsClearPayload,
  FogRevealPayload,
  MapChangePayload,
  NetworkMessage,
  TokenMovePayload
} from '../../../network'
import { useGameStore } from '../../use-game-store'
import { applyGameState } from './shared'

/** Game state sync handlers (host -> client). Each is self-contained: it
 *  reads only its message payload and drives the game store directly. */

export function handleTokenMove(message: NetworkMessage): void {
  const payload = message.payload as TokenMovePayload
  useGameStore.getState().moveToken(payload.mapId, payload.tokenId, payload.gridX, payload.gridY)
}

export function handleFogReveal(message: NetworkMessage): void {
  const payload = message.payload as FogRevealPayload & {
    fogOfWar?: { revealedCells: Array<{ x: number; y: number }>; enabled?: boolean }
  }
  if (payload.fogOfWar) {
    const gs = useGameStore.getState()
    const maps = gs.maps.map((m) =>
      m.id === payload.mapId ? { ...m, fogOfWar: { enabled: m.fogOfWar.enabled, ...payload.fogOfWar! } } : m
    )
    useGameStore.setState({ maps })
  } else if (payload.reveal) {
    useGameStore.getState().revealFog(payload.mapId, payload.cells)
  } else {
    useGameStore.getState().hideFog(payload.mapId, payload.cells)
  }
}

export function handleDrawingAdd(message: NetworkMessage): void {
  const payload = message.payload as DrawingAddPayload
  useGameStore.getState().addDrawing(payload.mapId, payload.drawing as import('../../../types/map').DrawingData)
}

export function handleDrawingsClear(message: NetworkMessage): void {
  const payload = message.payload as DrawingsClearPayload
  useGameStore.getState().clearDrawings(payload.mapId)
}

export function handleMapChange(message: NetworkMessage): void {
  const payload = message.payload as MapChangePayload
  if (payload.mapData) {
    const gs = useGameStore.getState()
    const existing = gs.maps.find((m) => m.id === payload.mapId)
    if (existing) {
      const maps = gs.maps.map((m) =>
        m.id === payload.mapId
          ? {
              ...m,
              ...(payload.mapData as unknown as Record<string, unknown>),
              imagePath: payload.mapData!.imageData || m.imagePath
            }
          : m
      ) as import('../../../types/map').GameMap[]
      useGameStore.setState({ maps })
    } else {
      const newMap = {
        ...payload.mapData,
        imagePath: payload.mapData.imageData || payload.mapData.imagePath
      } as unknown as import('../../../types/map').GameMap
      gs.addMap(newMap)
    }
  }
  useGameStore.getState().setActiveMap(payload.mapId)
}

export function handleInitiativeUpdate(message: NetworkMessage): void {
  const payload = message.payload as {
    initiative: unknown
    round: number
    turnMode?: 'initiative' | 'free'
  }
  applyGameState({
    initiative: payload.initiative,
    round: payload.round,
    ...(payload.turnMode ? { turnMode: payload.turnMode } : {})
  } as Record<string, unknown>)
}

export function handleConditionUpdate(message: NetworkMessage): void {
  const payload = message.payload as ConditionUpdatePayload & { conditions?: unknown[] }
  if (payload.conditions) {
    applyGameState({ conditions: payload.conditions } as Record<string, unknown>)
  }
}
