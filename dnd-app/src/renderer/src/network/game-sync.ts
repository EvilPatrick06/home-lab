import { useGameStore } from '../stores/use-game-store'
import type { EntityCondition } from '../types/game-state'
import type { GameMap } from '../types/map'
import { logger } from '../utils/logger'
import type { MessageType } from './types'

type SendMessageFn = (type: MessageType, payload: unknown) => void

let unsubscribe: (() => void) | null = null

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const imageCache = new Map<string, string>()

async function encodeMapImage(imagePath: string): Promise<string | null> {
  if (!imagePath || imagePath.startsWith('data:')) return imagePath
  if (imageCache.has(imagePath)) return imageCache.get(imagePath)!
  return new Promise<string | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      let dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        const scale = Math.sqrt(MAX_IMAGE_BYTES / dataUrl.length) * 0.9
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      }
      imageCache.set(imagePath, dataUrl)
      resolve(dataUrl)
    }
    img.onerror = () => resolve(null)
    img.src = imagePath
  })
}

/**
 * Start broadcasting game state changes from the host to all clients.
 * Uses Zustand subscribe to watch for state changes and sends
 * the relevant network messages.
 */
export function startGameSync(sendMessage: SendMessageFn): void {
  stopGameSync()

  let prevMaps: GameMap[] = useGameStore.getState().maps
  let prevActiveMapId: string | null = useGameStore.getState().activeMapId
  let prevInitiative = useGameStore.getState().initiative
  let prevRound = useGameStore.getState().round
  let prevConditions: EntityCondition[] = useGameStore.getState().conditions
  let prevTurnMode = useGameStore.getState().turnMode
  let prevIsPaused = useGameStore.getState().isPaused
  let prevTurnStates = useGameStore.getState().turnStates
  let prevPartyVisionCells = useGameStore.getState().partyVisionCells

  unsubscribe = useGameStore.subscribe((state) => {
    // Sync party vision cells
    if (state.partyVisionCells !== prevPartyVisionCells) {
      prevPartyVisionCells = state.partyVisionCells
      sendMessage('dm:vision-update', { partyVisionCells: state.partyVisionCells })
    }

    if (state.activeMapId !== prevActiveMapId) {
      prevActiveMapId = state.activeMapId
      const map = state.maps.find((m) => m.id === state.activeMapId)
      if (map) {
        encodeMapImage(map.imagePath)
          .then((imageData) => {
            sendMessage('dm:map-change', {
              mapId: state.activeMapId,
              mapData: { ...map, imageData: imageData || undefined }
            })
          })
          .catch((err) => {
            logger.error('[GameSync] Failed to encode map image, sending map without image data:', err)
            sendMessage('dm:map-change', {
              mapId: state.activeMapId,
              mapData: { ...map }
            })
          })
      } else {
        if (state.activeMapId !== null) {
          logger.warn('[GameSync] activeMapId', state.activeMapId, 'not found in maps — broadcasting mapId only')
        }
        sendMessage('dm:map-change', { mapId: state.activeMapId })
      }
    }

    if (state.initiative !== prevInitiative || state.round !== prevRound) {
      prevInitiative = state.initiative
      prevRound = state.round
      sendMessage('dm:initiative-update', {
        initiative: state.initiative,
        round: state.round,
        turnMode: state.turnMode
      })
    }

    if (state.conditions !== prevConditions) {
      prevConditions = state.conditions
      sendMessage('dm:condition-update', { conditions: state.conditions })
    }

    if (state.turnMode !== prevTurnMode || state.isPaused !== prevIsPaused) {
      prevTurnMode = state.turnMode
      prevIsPaused = state.isPaused
      sendMessage('game:state-update', {
        turnMode: state.turnMode,
        isPaused: state.isPaused
      })
    }

    if (state.turnStates !== prevTurnStates) {
      prevTurnStates = state.turnStates
      sendMessage('game:state-update', { turnStates: state.turnStates })
    }

    if (state.maps !== prevMaps) {
      const oldMaps = prevMaps
      prevMaps = state.maps

      for (const map of state.maps) {
        const prevMap = oldMaps.find((m) => m.id === map.id)
        if (!prevMap) continue

        if (map.tokens !== prevMap.tokens) {
          for (const token of map.tokens) {
            const prevToken = prevMap.tokens.find((t) => t.id === token.id)
            if (!prevToken) {
              sendMessage('game:state-update', { addToken: { mapId: map.id, token } })
            } else if (prevToken.gridX !== token.gridX || prevToken.gridY !== token.gridY) {
              sendMessage('dm:token-move', {
                mapId: map.id,
                tokenId: token.id,
                gridX: token.gridX,
                gridY: token.gridY
              })
            } else if (prevToken !== token) {
              sendMessage('game:state-update', {
                updateToken: { mapId: map.id, tokenId: token.id, updates: token }
              })
            }
          }

          for (const prevToken of prevMap.tokens) {
            if (!map.tokens.some((t) => t.id === prevToken.id)) {
              sendMessage('game:state-update', {
                removeToken: { mapId: map.id, tokenId: prevToken.id }
              })
            }
          }
        }

        if (map.fogOfWar !== prevMap.fogOfWar) {
          sendMessage('dm:fog-reveal', {
            mapId: map.id,
            fogOfWar: map.fogOfWar
          })
        }

        if (map.wallSegments !== prevMap.wallSegments) {
          sendMessage('game:state-update', {
            wallSegments: { mapId: map.id, segments: map.wallSegments }
          })
        }

        if (map.regions !== prevMap.regions) {
          for (const region of map.regions ?? []) {
            if (!(prevMap.regions ?? []).some((r) => r.id === region.id)) {
              sendMessage('dm:region-add', { mapId: map.id, region })
            } else {
              const prev = (prevMap.regions ?? []).find((r) => r.id === region.id)
              if (prev && prev !== region) {
                sendMessage('dm:region-update', { mapId: map.id, regionId: region.id, updates: region })
              }
            }
          }
          for (const prevRegion of prevMap.regions ?? []) {
            if (!(map.regions ?? []).some((r) => r.id === prevRegion.id)) {
              sendMessage('dm:region-remove', { mapId: map.id, regionId: prevRegion.id })
            }
          }
        }

        if (map.drawings !== prevMap.drawings) {
          // Check for added drawings
          for (const drawing of map.drawings ?? []) {
            if (!(prevMap.drawings ?? []).some((d) => d.id === drawing.id)) {
              sendMessage('dm:drawing-add', {
                mapId: map.id,
                drawing: {
                  id: drawing.id,
                  type: drawing.type,
                  points: drawing.points,
                  color: drawing.color,
                  strokeWidth: drawing.strokeWidth,
                  text: drawing.text,
                  visibleToPlayers: drawing.visibleToPlayers,
                  floor: drawing.floor
                }
              })
            }
          }

          // Check for removed drawings
          for (const prevDrawing of prevMap.drawings ?? []) {
            if (!(map.drawings ?? []).some((d) => d.id === prevDrawing.id)) {
              sendMessage('dm:drawing-remove', {
                mapId: map.id,
                drawingId: prevDrawing.id
              })
            }
          }
        }
      }

      // New maps added
      for (const map of state.maps) {
        if (!oldMaps.some((m) => m.id === map.id)) {
          sendMessage('game:state-update', { addMap: map })
        }
      }
    }
  })
}

/**
 * Stop broadcasting game state changes.
 */
export function stopGameSync(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
}

/**
 * Build the full game state payload for sending to a newly joined player.
 * Encodes map images as base64 data URLs so clients can render them.
 */
export async function buildFullGameStatePayload(): Promise<Record<string, unknown>> {
  const gs = useGameStore.getState()
  const mapsWithImages = await Promise.all(
    gs.maps.map(async (m) => {
      const imageData = await encodeMapImage(m.imagePath)
      return { ...m, imageData: imageData || undefined }
    })
  )
  return {
    maps: mapsWithImages,
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
    shopOpen: gs.shopOpen,
    shopName: gs.shopName,
    shopInventory: gs.shopInventory,
    shopMarkup: gs.shopMarkup,
    timerSeconds: gs.timerSeconds,
    timerRunning: gs.timerRunning,
    timerTargetName: gs.timerTargetName,
    weatherOverride: gs.weatherOverride,
    moonOverride: gs.moonOverride,
    showWeatherOverlay: gs.showWeatherOverlay,
    handouts: gs.handouts,
    combatTimer: gs.combatTimer,
    partyVisionCells: gs.partyVisionCells,
    sharedJournal: gs.sharedJournal
  }
}
