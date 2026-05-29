import type {
  ConditionUpdatePayload,
  DrawingAddPayload,
  DrawingRemovePayload,
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

export function handleDrawingRemove(message: NetworkMessage): void {
  const payload = message.payload as DrawingRemovePayload
  useGameStore.getState().removeDrawing(payload.mapId, payload.drawingId)
}

export function handleDrawingsClear(message: NetworkMessage): void {
  const payload = message.payload as DrawingsClearPayload
  useGameStore.getState().clearDrawings(payload.mapId)
}

export function handleRegionAdd(message: NetworkMessage): void {
  const payload = message.payload as { mapId: string; region: import('../../../types/map').SceneRegion }
  useGameStore.getState().addRegion(payload.mapId, payload.region)
}

export function handleRegionRemove(message: NetworkMessage): void {
  const payload = message.payload as { mapId: string; regionId: string }
  useGameStore.getState().removeRegion(payload.mapId, payload.regionId)
}

export function handleRegionUpdate(message: NetworkMessage): void {
  const payload = message.payload as {
    mapId: string
    regionId: string
    updates: Partial<import('../../../types/map').SceneRegion>
  }
  useGameStore.getState().updateRegion(payload.mapId, payload.regionId, payload.updates)
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

export function handleInitiativeDelta(message: NetworkMessage): void {
  // Phase 29h: apply add/remove/update against the local initiative
  // mirror instead of replacing the whole array.
  const payload = message.payload as {
    round?: number
    currentIndex?: number
    turnMode?: 'initiative' | 'free'
    added: Array<Record<string, unknown> & { id: string }>
    removed: string[]
    updated: Array<Record<string, unknown> & { id: string }>
  }
  const gameStore = useGameStore.getState()
  const prevInitiative = gameStore.initiative as {
    entries: Array<Record<string, unknown> & { id: string }>
    currentIndex: number
    round: number
  } | null
  const entries = [...(prevInitiative?.entries ?? [])]
  for (const id of payload.removed) {
    const idx = entries.findIndex((e) => e.id === id)
    if (idx >= 0) entries.splice(idx, 1)
  }
  for (const entry of payload.updated) {
    const idx = entries.findIndex((e) => e.id === entry.id)
    if (idx >= 0) entries[idx] = entry
  }
  for (const entry of payload.added) {
    if (!entries.some((e) => e.id === entry.id)) entries.push(entry)
  }
  const nextInitiative = {
    entries,
    currentIndex: payload.currentIndex ?? prevInitiative?.currentIndex ?? 0,
    round: payload.round ?? prevInitiative?.round ?? 1
  }
  applyGameState({
    initiative: nextInitiative,
    ...(payload.round !== undefined ? { round: payload.round } : {}),
    ...(payload.turnMode ? { turnMode: payload.turnMode } : {})
  } as Record<string, unknown>)
}

export function handleConditionUpdate(message: NetworkMessage): void {
  const payload = message.payload as ConditionUpdatePayload & { conditions?: unknown[] }
  if (payload.conditions) {
    applyGameState({ conditions: payload.conditions } as Record<string, unknown>)
  }
}

export function handleConditionDelta(message: NetworkMessage): void {
  const payload = message.payload as {
    added: Array<Record<string, unknown> & { id: string }>
    removed: string[]
    updated: Array<Record<string, unknown> & { id: string }>
  }
  const prevConditions = (useGameStore.getState().conditions ?? []) as unknown as Array<
    Record<string, unknown> & { id: string }
  >
  const next = [...prevConditions]
  for (const id of payload.removed) {
    const idx = next.findIndex((c) => c.id === id)
    if (idx >= 0) next.splice(idx, 1)
  }
  for (const entry of payload.updated) {
    const idx = next.findIndex((c) => c.id === entry.id)
    if (idx >= 0) next[idx] = entry
  }
  for (const entry of payload.added) {
    if (!next.some((c) => c.id === entry.id)) next.push(entry)
  }
  applyGameState({ conditions: next } as Record<string, unknown>)
}
