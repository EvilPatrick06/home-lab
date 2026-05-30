import { useGameStore } from '../stores/use-game-store'
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
  let prevTurnMode = useGameStore.getState().turnMode
  let prevIsPaused = useGameStore.getState().isPaused
  let prevTurnStates = useGameStore.getState().turnStates
  let prevPartyVisionCells = useGameStore.getState().partyVisionCells
  // Phase 17ad — also watch the sharedJournal array. Previously journal
  // entries only synced as part of the full game-state payload sent at
  // peer join, so a player or DM adding a new shared entry mid-session
  // was invisible to everyone else.
  let prevSharedJournal = useGameStore.getState().sharedJournal

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

    // Phase 31f — initiative (the `{ entries, currentIndex, round }` combat
    // record + the top-level `round` counter + `turnMode`) now streams to
    // clients via the shard broadcaster (`sync:delta`), wired in the network
    // store's hostGame. The bespoke `dm:initiative-delta` per-change broadcast
    // that used to live here is gone; initiative stays in
    // buildFullGameStatePayload so the join snapshot still seeds it.
    //
    // Phase 31e — conditions now stream to clients via the shard broadcaster
    // (`sync:delta`), wired in the network store's hostGame. The bespoke
    // `dm:condition-delta` per-change broadcast that used to live here is gone.
    // Conditions stay in buildFullGameStatePayload so the join snapshot still
    // seeds initial state before the shard delta stream begins.

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

    // Phase 17ad — sharedJournal incremental broadcast. The reference
    // changes whenever an entry is added / updated / deleted (each store
    // mutation returns a fresh array). Ships the full sharedJournal in
    // the state-update payload; per-peer filtering (visibility ===
    // 'private' authored-by-other-player) happens at the client render
    // surface, not at the network layer — fine for now since private
    // entries are still visible to their author + the host, and players
    // currently see all shared entries. (Future phase: per-entry
    // visibility filtering at this broadcast for true private.)
    if (state.sharedJournal !== prevSharedJournal) {
      prevSharedJournal = state.sharedJournal
      sendMessage('game:state-update', { sharedJournal: state.sharedJournal })
    }

    if (state.maps !== prevMaps) {
      const oldMaps = prevMaps
      prevMaps = state.maps

      for (const map of state.maps) {
        const prevMap = oldMaps.find((m) => m.id === map.id)
        if (!prevMap) continue

        // Phase 31h — map tokens now stream to clients via the shard broadcaster
        // (`sync:delta`) through the per-recipient permissionFilter (the DM gets
        // the full token set incl. hidden tokens + DM-only fields, players get
        // only the player-visible tokens with hidden ones dropped and DM-only
        // fields stripped — reusing filterGameStateForRole), wired in the network
        // store's hostGame. The bespoke per-token add/update/move/remove broadcast
        // that used to live here (on `map.tokens !== prevMap.tokens`) is gone, as
        // is the now-unused token-move throttle. Tokens stay in
        // buildFullGameStatePayload so the role-filtered join snapshot still seeds
        // them. (The token message types + their client handlers remain for 31l
        // back-compat.)

        // Phase 31g — fog-of-war now streams to clients via the shard
        // broadcaster (`sync:delta`) through the per-recipient permissionFilter
        // (the DM gets the full fog state, players get only the revealed mask),
        // wired in the network store's hostGame. The bespoke `dm:fog-reveal`
        // per-change broadcast that used to live here (on
        // `map.fogOfWar !== prevMap.fogOfWar`) is gone. Fog stays in
        // buildFullGameStatePayload so the role-filtered join snapshot still
        // seeds it. (The `dm:fog-reveal` message type + its client handler
        // remain for 31l back-compat.)

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
  // Phase 14d: include the currently playing ambient track so late
  // joiners hear the same soundscape the rest of the party already has
  // running. Lazy-imported to avoid pulling sound-manager into every
  // call site that touches this module (sound-manager has heavy
  // playback dependencies).
  let currentAmbient: string | null = null
  try {
    const { getCurrentAmbient } = await import('../services/sound-manager')
    currentAmbient = getCurrentAmbient()
  } catch {
    /* sound-manager not available in this context — skip */
  }
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
    sharedJournal: gs.sharedJournal,
    currentAmbient
  }
}
