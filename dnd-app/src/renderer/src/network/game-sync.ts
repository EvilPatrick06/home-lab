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

  unsubscribe = useGameStore.subscribe((state) => {
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
    //
    // Phase 31k — the LAST bespoke per-change broadcasts here are migrated onto
    // the shard pipeline:
    //   - `turnMode` + `isPaused` (was a `game:state-update { turnMode, isPaused }`
    //     block) → folded into initiative-shard. `turnMode` was ALREADY synced by
    //     initiative-shard, so it had been double-synced; the whole block is gone.
    //   - `turnStates` (was `game:state-update { turnStates }`) → turn-states-shard,
    //     a permission-FILTERED shard (keys for hidden-token entities are stripped
    //     for players, reusing filterGameStateForRole — same hidden-token rule as
    //     tokens/fog).
    //   - `sharedJournal` (was `game:state-update { sharedJournal }`, Phase 17ad)
    //     → shared-journal-shard, UNFILTERED (the shared/player-visible journal;
    //     the DM-only journal is a separate store; per-entry private visibility
    //     stays a render-surface concern).
    //   - `partyVisionCells` (was `dm:vision-update`) → party-vision-shard,
    //     UNFILTERED (computed from player tokens — no DM-only data).
    // All four stay in buildFullGameStatePayload so the role-filtered join
    // snapshot still seeds them; the old message types + client handlers remain
    // for 31l back-compat.
    //
    // `activeMapId` is intentionally LEFT on the bespoke `dm:map-change` path
    // above (not migrated): that broadcast is a map SWITCH that asynchronously
    // encodes + ships the target map's full image data so a client switching to
    // a map it doesn't yet hold can render it. A scalar `activeMapId` shard can't
    // carry that side effect, and keeping `dm:map-change` while also adding a
    // shard would double-sync the scalar — exactly the redundancy this phase
    // removes. So `dm:map-change` stays the single source for map switching.

    // Phase 31h — map tokens now stream to clients via the shard broadcaster
    // (`sync:delta`) through the per-recipient permissionFilter (the DM gets the
    // full token set incl. hidden tokens + DM-only fields, players get only the
    // player-visible tokens with hidden ones dropped and DM-only fields stripped
    // — reusing filterGameStateForRole). The bespoke per-token broadcast that
    // used to live here is gone (tokens-shard).
    //
    // Phase 31g — fog-of-war now streams via the shard broadcaster through the
    // per-recipient permissionFilter (DM = full fog state, players = revealed
    // mask only). The bespoke `dm:fog-reveal` per-change broadcast is gone
    // (fog-shard).
    //
    // Phase 31i — wall segments, scene regions, and drawings now stream via the
    // shard broadcaster (walls-shard / regions-shard / drawings-shard). walls-shard
    // is UNFILTERED (walls aren't DM-secret). regions-shard + drawings-shard now
    // carry a per-recipient `permissionFilter` (88ad36a) that wire-enforces DM-only
    // visibility — `visibleToPlayers:false` regions/drawings are stripped for
    // non-DM recipients, so it's no longer only a render-surface concern. The
    // bespoke `game:state-update { wallSegments }`, `dm:region-add/update/remove`,
    // and `dm:drawing-add/remove` per-change broadcasts that used to live here (on
    // `map.* !== prevMap.*`) are gone. All of these features stay in
    // buildFullGameStatePayload so the role-filtered join snapshot still seeds
    // them, and the old message types + client handlers remain for 31l
    // back-compat.
    //
    // Newly-added maps still broadcast here: `addMap` carries the full map
    // (incl. walls/regions/drawings/tokens/fog) so a mid-session map creation
    // reaches clients before the shard deltas for its per-map fields begin.
    if (state.maps !== prevMaps) {
      const oldMaps = prevMaps
      prevMaps = state.maps

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
