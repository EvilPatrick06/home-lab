import type { StateCreator } from 'zustand'
import type { GameMap, MapToken } from '../../types/map'
import { logger } from '../../utils/logger'
import type { GameStoreState, MapTokenSliceState } from './types'

function applyTokenUpdates(map: GameMap, tokenId: string, updates: Partial<MapToken>): GameMap {
  const targetToken = map.tokens.find((token) => token.id === tokenId)
  if (!targetToken) return map

  const syncMountedPosition = updates.gridX !== undefined || updates.gridY !== undefined
  const nextGridX = updates.gridX ?? targetToken.gridX
  const nextGridY = updates.gridY ?? targetToken.gridY
  const linkedRiderId = 'riderId' in updates ? updates.riderId : targetToken.riderId

  return {
    ...map,
    tokens: map.tokens.map((token) => {
      if (token.id === tokenId) {
        return syncMountedPosition
          ? { ...token, ...updates, gridX: nextGridX, gridY: nextGridY }
          : { ...token, ...updates }
      }

      if (syncMountedPosition && linkedRiderId != null && token.entityId === linkedRiderId) {
        return { ...token, gridX: nextGridX, gridY: nextGridY }
      }

      return token
    })
  }
}

function clearMountedTurnState(
  turnStates: GameStoreState['turnStates'],
  riderEntityId: string | undefined
): GameStoreState['turnStates'] {
  if (!riderEntityId) return turnStates

  const riderTurnState = turnStates[riderEntityId]
  if (!riderTurnState || (riderTurnState.mountedOn == null && riderTurnState.mountType == null)) {
    return turnStates
  }

  return {
    ...turnStates,
    [riderEntityId]: {
      ...riderTurnState,
      mountedOn: undefined,
      mountType: undefined
    }
  }
}

export const createMapTokenSlice: StateCreator<GameStoreState, [], [], MapTokenSliceState> = (set, get) => ({
  // --- Map actions ---

  setActiveMap: (mapId: string) => {
    set({ activeMapId: mapId })
  },

  addMap: (map) => {
    set((state) => ({ maps: [...state.maps, map] }))
  },

  deleteMap: (mapId: string) => {
    set((state) => {
      const filtered = state.maps.filter((m) => m.id !== mapId)
      const newActiveMapId =
        state.activeMapId === mapId ? (filtered.length > 0 ? filtered[0].id : null) : state.activeMapId
      return { maps: filtered, activeMapId: newActiveMapId }
    })
  },

  updateMap: (mapId: string, updates: Partial<GameMap>) => {
    set((state) => ({
      maps: state.maps.map((m) => (m.id === mapId ? { ...m, ...updates } : m))
    }))
  },

  duplicateMap: (mapId: string) => {
    const state = get()
    const original = state.maps.find((m) => m.id === mapId)
    if (!original) return null

    const newMap: GameMap = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString()
    }
    set((s) => ({ maps: [...s.maps, newMap] }))
    return newMap
  },

  // --- Token actions ---

  addToken: (mapId: string, token: MapToken) => {
    set((state) => ({
      maps: state.maps.map((m) => (m.id === mapId ? { ...m, tokens: [...m.tokens, token] } : m))
    }))
  },

  moveToken: (mapId: string, tokenId: string, gridX: number, gridY: number) => {
    set((state) => ({
      maps: state.maps.map((m) => (m.id === mapId ? applyTokenUpdates(m, tokenId, { gridX, gridY }) : m))
    }))
  },

  removeToken: (mapId: string, tokenId: string) => {
    set((state) => ({
      maps: state.maps.map((m) => (m.id === mapId ? { ...m, tokens: m.tokens.filter((t) => t.id !== tokenId) } : m))
    }))
  },

  updateToken: (mapId: string, tokenId: string, updates: Partial<MapToken>) => {
    const state = get()
    const map = state.maps.find((m) => m.id === mapId)
    const oldToken = map?.tokens.find((t) => t.id === tokenId)
    const removedRiderId =
      oldToken?.riderId && 'riderId' in updates && updates.riderId !== oldToken.riderId ? oldToken.riderId : undefined

    set((s) => ({
      maps: s.maps.map((m) => (m.id === mapId ? applyTokenUpdates(m, tokenId, updates) : m))
    }))

    if (removedRiderId) {
      set((s) => ({
        turnStates: clearMountedTurnState(s.turnStates, removedRiderId)
      }))
    }

    // Force-dismount rider when mount drops to 0 HP
    if (
      oldToken?.riderId &&
      updates.currentHP !== undefined &&
      updates.currentHP <= 0 &&
      (oldToken.currentHP ?? 1) > 0
    ) {
      const riderId = oldToken.riderId
      const riderToken = map?.tokens.find((t) => t.entityId === riderId)

      // Clear riderId on mount
      set((s) => ({
        maps: s.maps.map((m) =>
          m.id === mapId
            ? { ...m, tokens: m.tokens.map((t) => (t.id === tokenId ? { ...t, riderId: undefined } : t)) }
            : m
        )
      }))

      set((s) => ({
        turnStates: clearMountedTurnState(s.turnStates, riderId)
      }))

      // Log force-dismount (listeners can pick this up from state changes)
      if (riderToken) {
        logger.log(`[Mount] ${oldToken.label} drops to 0 HP! ${riderToken.label} is forcibly dismounted!`)
      }
    }

    // Detect elevation drops >= 10 ft for auto-falling damage
    if (
      oldToken &&
      updates.elevation !== undefined &&
      oldToken.elevation !== undefined &&
      oldToken.elevation - updates.elevation >= 10 &&
      !(oldToken.flySpeed && oldToken.flySpeed > 0)
    ) {
      set({
        pendingFallDamage: {
          tokenId,
          mapId,
          height: oldToken.elevation - updates.elevation
        }
      })
    }
  },

  // --- Token selection actions ---

  setSelectedTokenIds: (tokenIds: string[]) => set({ selectedTokenIds: tokenIds }),
  addToSelection: (tokenId: string) => {
    set((state) => ({
      selectedTokenIds: state.selectedTokenIds.includes(tokenId)
        ? state.selectedTokenIds
        : [...state.selectedTokenIds, tokenId]
    }))
  },
  removeFromSelection: (tokenId: string) => {
    set((state) => ({
      selectedTokenIds: state.selectedTokenIds.filter(id => id !== tokenId)
    }))
  },
  clearSelection: () => set({ selectedTokenIds: [] }),

  // --- Bulk token actions ---

  revealAllTokens: () => {
    set((state) => ({
      maps: state.maps.map((m) =>
        m.id === state.activeMapId ? { ...m, tokens: m.tokens.map((t) => ({ ...t, visibleToPlayers: true })) } : m
      )
    }))
  },

  // --- Wall segments ---

  addWallSegment: (mapId, wall) => {
    set((state) => ({
      maps: state.maps.map((m) => (m.id === mapId ? { ...m, wallSegments: [...(m.wallSegments || []), wall] } : m))
    }))
  },

  removeWallSegment: (mapId: string, wallId: string) => {
    set((state) => ({
      maps: state.maps.map((m) =>
        m.id === mapId ? { ...m, wallSegments: (m.wallSegments || []).filter((w) => w.id !== wallId) } : m
      )
    }))
  },

  updateWallSegment: (mapId, wallId, updates) => {
    set((state) => ({
      maps: state.maps.map((m) =>
        m.id === mapId
          ? { ...m, wallSegments: (m.wallSegments || []).map((w) => (w.id === wallId ? { ...w, ...updates } : w)) }
          : m
      )
    }))
  },

  // --- Center on entity ---

  centerOnEntityId: null,
  requestCenterOnEntity: (entityId: string) => set({ centerOnEntityId: entityId }),
  clearCenterRequest: () => set({ centerOnEntityId: null }),

  // --- Click-to-place token ---

  pendingFallDamage: null,
  setPendingFallDamage: (pending) => set({ pendingFallDamage: pending }),

  pendingPlacement: null,
  setPendingPlacement: (tokenData) => set({ pendingPlacement: tokenData ? { tokenData } : null }),
  commitPlacement: (mapId, gridX, gridY) => {
    const { pendingPlacement, currentFloor } = get()
    if (!pendingPlacement) return
    const token: MapToken = {
      ...pendingPlacement.tokenData,
      id: crypto.randomUUID(),
      gridX,
      gridY,
      floor: currentFloor
    }
    get().addToken(mapId, token)
    set({ pendingPlacement: null })
  }
})
