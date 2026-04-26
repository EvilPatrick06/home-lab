import { create } from 'zustand'
import { LAST_SESSION_KEY } from '../../constants'
import type { ConnectionState, MessageType, NetworkGameState, NetworkMap, NetworkMessage, PeerInfo } from '../../network'
import {
  broadcastMessage,
  disconnect as clientDisconnect,
  connectToHost,
  getConnectedPeers,
  getPeerId,
  kickPeer,
  onClientMessage,
  onDisconnected,
  onHostMessage,
  onPeerJoined,
  onPeerLeft,
  resetToDefaults,
  sendClientMessage,
  sendToPeer,
  setGameStateProvider,
  startHosting,
  stopHosting
} from '../../network'
import { useGameStore } from '../use-game-store'
import { handleClientMessage } from './client-handlers'
import { handleHostMessage } from './host-handlers'
import type { NetworkState } from './types'

export type { NetworkState }

const listenerCleanups: Array<() => void> = []
function clearListenerCleanups(): void {
  for (const fn of listenerCleanups) fn()
  listenerCleanups.length = 0
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  role: 'none',
  connectionState: 'disconnected',
  inviteCode: null,
  campaignId: null,
  localPeerId: null,
  displayName: '',
  peers: [],
  error: null,
  disconnectReason: null,
  latencyMs: null,

  // --- Host actions ---

  hostGame: async (displayName: string, existingInviteCode?: string) => {
    set({
      connectionState: 'connecting',
      error: null,
      displayName,
      role: 'host'
    })

    try {
      const inviteCode = await startHosting(displayName, existingInviteCode)

      clearListenerCleanups()
      listenerCleanups.push(
        onPeerJoined((peer: PeerInfo) => {
          get().addPeer(peer)
          // Async: send map images to newly joined peer after the initial handshake
          // Lazy import to break circular dependency (network-store -> game-sync -> use-game-store -> network-store)
          import('../../network/game-sync')
            .then(({ buildFullGameStatePayload }) => buildFullGameStatePayload())
            .then((fullState) => {
              const maps = fullState.maps as Array<Record<string, unknown>>
              if (maps?.length) {
                // The joining peer is by definition non-host — strip hidden tokens
                // from each map's `tokens` array before shipping the image payload.
                const transformed = transformUpdatePayloadForPeer({ mapsWithImages: maps }, false)
                if (!transformed) return
                const msg = {
                  type: 'game:state-update' as const,
                  payload: transformed,
                  senderId: getPeerId() || '',
                  senderName: get().displayName,
                  timestamp: Date.now(),
                  sequence: 0
                }
                sendToPeer(peer.peerId, msg)
              }
            })
        }),
        onPeerLeft((peer: PeerInfo) => {
          get().removePeer(peer.peerId)
        }),
        onHostMessage((message: NetworkMessage, fromPeerId: string) => {
          handleHostMessage(message, fromPeerId, get, set)
        })
      )

      // Provide game state for full syncs when new players connect.
      // The host gets the unfiltered view; non-host peers get a player-view
      // with hidden tokens / unrevealed traps / DM-only handouts redacted.
      setGameStateProvider((peerInfo: PeerInfo) =>
        filterGameStateForRole(buildNetworkGameState(), peerInfo.isHost === true)
      )

      set({
        connectionState: 'connected',
        inviteCode,
        localPeerId: getPeerId()
      })

      return inviteCode
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to host game'
      set({
        connectionState: 'error',
        error: errorMsg,
        role: 'none'
      })
      throw err
    }
  },

  stopHosting: () => {
    setGameStateProvider(null)
    clearListenerCleanups()
    stopHosting()
    resetToDefaults()
    set({
      role: 'none',
      connectionState: 'disconnected',
      inviteCode: null,
      campaignId: null,
      localPeerId: null,
      peers: [],
      error: null,
      disconnectReason: null,
      latencyMs: null
    })
  },

  kickPlayer: (peerId: string) => {
    kickPeer(peerId)
    get().removePeer(peerId)
  },

  // --- Client actions ---

  joinGame: async (inviteCode: string, displayName: string) => {
    set({
      connectionState: 'connecting',
      error: null,
      displayName,
      role: 'client'
    })

    try {
      clearListenerCleanups()
      listenerCleanups.push(
        onClientMessage((message: NetworkMessage) => {
          handleClientMessage(message, get, set)
        }),
        onDisconnected((reason: string) => {
          // Determine if this was a kick or ban based on the reason string
          let disconnectReason: 'kicked' | 'banned' | null = null
          if (reason.toLowerCase().includes('kicked')) {
            disconnectReason = 'kicked'
          } else if (reason.toLowerCase().includes('banned')) {
            disconnectReason = 'banned'
          }

          // Clear saved session so kicked/banned players don't see "Rejoin"
          if (disconnectReason) {
            try {
              localStorage.removeItem(LAST_SESSION_KEY)
            } catch {
              /* ignore */
            }
          }

          set({
            connectionState: 'disconnected',
            role: 'none',
            inviteCode: null,
            campaignId: null,
            localPeerId: null,
            peers: [],
            error: reason,
            disconnectReason
          })
        })
      )

      await connectToHost(inviteCode, displayName)

      set({
        connectionState: 'connected',
        inviteCode,
        localPeerId: getPeerId()
      })
    } catch (err) {
      // Clean up listeners so they don't linger if the connection attempt failed
      clearListenerCleanups()
      const errorMsg = err instanceof Error ? err.message : 'Failed to join game'
      set({
        connectionState: 'error',
        error: errorMsg,
        role: 'none'
      })
      throw err
    }
  },

  disconnect: () => {
    clearListenerCleanups()
    const { role } = get()
    if (role === 'host') {
      get().stopHosting()
    } else if (role === 'client') {
      clientDisconnect()
      resetToDefaults()
      set({
        role: 'none',
        connectionState: 'disconnected',
        inviteCode: null,
        campaignId: null,
        localPeerId: null,
        peers: [],
        error: null,
        disconnectReason: null
      })
    }
  },

  // --- Shared actions ---

  sendMessage: (type: MessageType, payload: unknown) => {
    const { role, displayName } = get()
    if (role === 'host') {
      // `game:state-update` requires per-peer routing — each connected peer gets
      // its own filtered/transformed copy based on its DM status. Visibility
      // transitions (host hiding/revealing a token) are rewritten to
      // removeToken/addToken on the player wire so player clients see the right
      // visual change without learning the underlying isHidden flag.
      //
      // Other message types are uniformly broadcast — they don't carry DM-only data.
      if (type === 'game:state-update') {
        const peers = getConnectedPeers()
        const baseHeader = {
          type,
          senderId: getPeerId() || '',
          senderName: displayName,
          sequence: 0
        }
        for (const p of peers) {
          const isDM = p.isHost === true // future co-DM peers can flip this
          const transformed = transformUpdatePayloadForPeer(payload, isDM)
          if (transformed === null) continue
          const message: NetworkMessage = {
            ...baseHeader,
            payload: transformed,
            timestamp: Date.now()
          }
          sendToPeer(p.peerId, message)
        }
        return
      }

      const message: NetworkMessage = {
        type,
        payload,
        senderId: getPeerId() || '',
        senderName: displayName,
        timestamp: Date.now(),
        sequence: 0
      }
      // dm:character-update: broadcast to all peers so everyone has the latest
      // character data in remoteCharacters, but include targetPeerId in payload
      // so only the target player persists the update to disk
      broadcastMessage(message)
    } else if (role === 'client') {
      sendClientMessage({ type, payload })
    }
  },

  setDisplayName: (name: string) => {
    set({ displayName: name })
  },

  updatePeer: (peerId: string, updates: Partial<PeerInfo>) => {
    set((state) => ({
      peers: state.peers.map((p) => (p.peerId === peerId ? { ...p, ...updates } : p))
    }))
  },

  removePeer: (peerId: string) => {
    set((state) => ({
      peers: state.peers.filter((p) => p.peerId !== peerId)
    }))
  },

  addPeer: (peer: PeerInfo) => {
    set((state) => {
      // Avoid duplicates
      const exists = state.peers.some((p) => p.peerId === peer.peerId)
      if (exists) {
        return {
          peers: state.peers.map((p) => (p.peerId === peer.peerId ? peer : p))
        }
      }
      return { peers: [...state.peers, peer] }
    })
  },

  setConnectionState: (connectionState: ConnectionState) => {
    set({ connectionState })
  },

  setError: (error: string | null) => {
    set({ error })
  },

  clearDisconnectReason: () => {
    set({ disconnectReason: null })
  }
}))

// --- Game state helpers ---

function buildNetworkGameState(): NetworkGameState {
  const gs = useGameStore.getState()
  return {
    activeMapId: gs.activeMapId,
    maps: gs.maps.map((m) => ({
      id: m.id,
      name: m.name,
      campaignId: m.campaignId,
      imagePath: m.imagePath,
      width: m.width,
      height: m.height,
      grid: m.grid,
      tokens: m.tokens,
      fogOfWar: m.fogOfWar,
      wallSegments: m.wallSegments,
      terrain: m.terrain,
      createdAt: m.createdAt
    })),
    turnMode: gs.turnMode,
    initiative: gs.initiative,
    round: gs.round,
    conditions: gs.conditions,
    isPaused: gs.isPaused,
    turnStates: gs.turnStates,
    underwaterCombat: gs.underwaterCombat,
    flankingEnabled: gs.flankingEnabled,
    groupInitiativeEnabled: gs.groupInitiativeEnabled,
    ambientLight: gs.ambientLight,
    diagonalRule: gs.diagonalRule,
    travelPace: gs.travelPace,
    marchingOrder: gs.marchingOrder,
    inGameTime: gs.inGameTime,
    allies: gs.allies,
    enemies: gs.enemies,
    places: gs.places,
    handouts: gs.handouts,
    shopOpen: gs.shopOpen,
    shopName: gs.shopName,
    shopInventory: gs.shopInventory,
    customEffects: gs.customEffects,
    placedTraps: gs.placedTraps,
    sessionLog: gs.sessionLog,
    combatLog: gs.combatLog,
    partyVisionCells: gs.partyVisionCells
  }
}

// --- Per-peer state filtering ---
//
// The host's authoritative game state contains DM-only data (hidden tokens,
// unrevealed traps, DM-only handouts, sidebar entries with `notes` or
// `visibleToPlayers: false`). Without filtering, every peer that joins
// receives this data and can read it via DevTools or a modified client.
//
// `filterGameStateForRole` strips DM-only fields when `isDM === false`.
// Currently only the literal host is treated as DM; co-DM is a future feature
// (see SUGGESTIONS-LOG-DNDAPP.md if/when added).

interface MaybeHiddenToken {
  id?: string
  isHidden?: boolean
}

interface MaybeRevealedTrap {
  revealed?: boolean
}

interface SidebarEntryShape {
  visibleToPlayers?: boolean
  notes?: string
  // DM-only stat / lookup pointers — stripped on the player wire
  monsterStatBlockId?: unknown
  linkedMonsterId?: unknown
  statBlock?: unknown
}

interface HandoutShape {
  visibility?: 'all' | 'dm-only'
  pages?: Array<{ dmOnly?: boolean }>
}

interface InitiativeEntryShape {
  entityId?: string
}

interface ConditionEntryShape {
  entityId?: string
}

interface CustomEffectShape {
  targetEntityId?: string
}

function filterMapForPlayer(m: NetworkMap): NetworkMap {
  const tokens = Array.isArray(m.tokens)
    ? (m.tokens as MaybeHiddenToken[]).filter((t) => !t || t.isHidden !== true)
    : m.tokens
  return { ...m, tokens }
}

/**
 * Collect every hidden token's `id` across all maps. Used to filter
 * entity-keyed collateral state (initiative, turnStates, conditions, etc.)
 * so non-DM peers don't see references to tokens they can't see.
 */
function collectHiddenTokenIds(maps: NetworkMap[]): Set<string> {
  const hidden = new Set<string>()
  for (const m of maps) {
    if (!Array.isArray(m.tokens)) continue
    for (const t of m.tokens as MaybeHiddenToken[]) {
      if (t && t.isHidden === true && typeof t.id === 'string') {
        hidden.add(t.id)
      }
    }
  }
  return hidden
}

function filterSidebarForPlayer(entries: unknown[]): unknown[] {
  if (!Array.isArray(entries)) return entries
  return (entries as SidebarEntryShape[])
    .filter((e) => !e || e.visibleToPlayers !== false)
    .map((e) => {
      if (!e || typeof e !== 'object') return e
      // Strip DM-only fields: notes, monster stat-block links, full embedded statBlock
      const {
        notes: _notes,
        monsterStatBlockId: _msbId,
        linkedMonsterId: _lmId,
        statBlock: _sb,
        ...rest
      } = e
      return rest
    })
}

function filterHandoutsForPlayer(handouts: unknown[]): unknown[] {
  if (!Array.isArray(handouts)) return handouts
  return (handouts as HandoutShape[])
    .filter((h) => !h || h.visibility !== 'dm-only')
    .map((h) => {
      if (!h || typeof h !== 'object' || !Array.isArray(h.pages)) return h
      // Drop DM-only pages within a player-visible handout
      return { ...h, pages: h.pages.filter((p) => !p || p.dmOnly !== true) }
    })
}

function filterTrapsForPlayer(traps: unknown[] | undefined): unknown[] | undefined {
  if (!Array.isArray(traps)) return traps
  return (traps as MaybeRevealedTrap[]).filter((t) => !t || t.revealed === true)
}

/**
 * Strip DM-only data from a NetworkGameState payload when the recipient is not the DM.
 * Pass-through for the DM (`isDM === true`).
 *
 * Stripped on the non-DM wire:
 * - `maps[i].tokens` where `isHidden === true`
 * - `placedTraps` where `revealed !== true`
 * - `allies` / `enemies` / `places` where `visibleToPlayers === false` AND each entry's
 *   `notes`, `monsterStatBlockId`, `linkedMonsterId`, `statBlock` (DM-only stat refs)
 * - `handouts` where `visibility === 'dm-only'` AND `pages[].dmOnly === true` within visible handouts
 * - `initiative.entries` whose `entityId` belongs to a hidden token
 * - `turnStates` keys that match a hidden token id
 * - `conditions` whose `entityId` matches a hidden token id
 * - `customEffects` whose `targetEntityId` matches a hidden token id
 * - `marchingOrder` ids that match a hidden token id
 *
 * Not stripped (intentional — design):
 * - `fogOfWar` (the visible-to-players reveal mask is by definition player-visible)
 * - `combatLog` / `sessionLog` (player-readable game journal)
 * - `partyVisionCells` (computed from player tokens — the input)
 */
export function filterGameStateForRole(state: NetworkGameState, isDM: boolean): NetworkGameState {
  if (isDM) return state

  const hiddenIds = collectHiddenTokenIds(state.maps)

  let initiative: unknown = state.initiative
  if (initiative && typeof initiative === 'object' && Array.isArray((initiative as { entries?: unknown }).entries)) {
    const init = initiative as { entries: InitiativeEntryShape[] }
    initiative = {
      ...init,
      entries: init.entries.filter((e) => !e || !e.entityId || !hiddenIds.has(e.entityId))
    }
  }

  let turnStates = state.turnStates
  if (turnStates && typeof turnStates === 'object' && hiddenIds.size > 0) {
    const filtered: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(turnStates)) {
      if (!hiddenIds.has(k)) filtered[k] = v
    }
    turnStates = filtered
  }

  const conditions = Array.isArray(state.conditions)
    ? (state.conditions as ConditionEntryShape[]).filter((c) => !c || !c.entityId || !hiddenIds.has(c.entityId))
    : state.conditions

  const customEffects = Array.isArray(state.customEffects)
    ? (state.customEffects as CustomEffectShape[]).filter(
        (e) => !e || !e.targetEntityId || !hiddenIds.has(e.targetEntityId)
      )
    : state.customEffects

  const marchingOrder = Array.isArray(state.marchingOrder)
    ? state.marchingOrder.filter((id) => typeof id !== 'string' || !hiddenIds.has(id))
    : state.marchingOrder

  return {
    ...state,
    maps: state.maps.map(filterMapForPlayer),
    allies: filterSidebarForPlayer(state.allies),
    enemies: filterSidebarForPlayer(state.enemies),
    places: filterSidebarForPlayer(state.places),
    handouts: filterHandoutsForPlayer(state.handouts),
    placedTraps: filterTrapsForPlayer(state.placedTraps),
    initiative,
    turnStates,
    conditions,
    customEffects,
    marchingOrder
  }
}

/**
 * Look up a token in the host's authoritative game state.
 * Used by `transformUpdatePayloadForPeer` to make visibility-transition decisions
 * (was a token visible before this update? what's its full data after a reveal?).
 *
 * Returns `null` if the map or token isn't present.
 */
function lookupTokenInHostState(mapId: string, tokenId: string): unknown | null {
  const gs = useGameStore.getState()
  const map = gs.maps.find((m) => m.id === mapId)
  if (!map) return null
  return map.tokens.find((t) => t.id === tokenId) ?? null
}

/**
 * Transform a `game:state-update` delta payload for a specific peer.
 *
 * - For the DM (`isDM === true`), returns the payload unchanged.
 * - For non-DM peers, applies these rules in order:
 *   1. **Visibility transitions** on `updateToken`:
 *      - `updates.isHidden === true` (host hiding a previously-visible token) →
 *        rewrite to `removeToken: { mapId, tokenId }` so the player drops their copy.
 *      - `updates.isHidden === false` (host revealing a hidden token) →
 *        rewrite to `addToken: { mapId, token }` with the full post-update token
 *        data (read from the host's game store) so the player adds it fresh.
 *   2. **Hidden-token updates**: any `updateToken` for a token that is currently
 *      hidden in the host's state → suppress (the player doesn't have that token,
 *      so the update is meaningless).
 *   3. **`addToken`** with `token.isHidden === true` → suppress (player never learns
 *      it exists).
 *   4. **`addMap.tokens`** and **`mapsWithImages[i].tokens`** → strip entries with
 *      `isHidden === true`.
 *
 * Returns `null` when the entire broadcast should be skipped for this peer.
 *
 * `lookupToken` is dependency-injectable for tests; defaults to the host game store.
 */
export function transformUpdatePayloadForPeer(
  payload: unknown,
  isDM: boolean,
  lookupToken: (mapId: string, tokenId: string) => unknown | null = lookupTokenInHostState
): unknown | null {
  if (isDM) return payload
  if (!payload || typeof payload !== 'object') return payload

  const p = { ...(payload as Record<string, unknown>) }

  // 1 & 2: updateToken — visibility transitions + hidden-token suppression
  if (p.updateToken && typeof p.updateToken === 'object') {
    const ut = p.updateToken as { mapId?: string; tokenId?: string; updates?: Record<string, unknown> }
    if (ut.mapId && ut.tokenId && ut.updates && typeof ut.updates === 'object') {
      const isHiddenSpecified = 'isHidden' in ut.updates
      if (isHiddenSpecified && ut.updates.isHidden === true) {
        // Hide: player drops the token entirely
        return { removeToken: { mapId: ut.mapId, tokenId: ut.tokenId } }
      }
      if (isHiddenSpecified && ut.updates.isHidden === false) {
        // Reveal: player adds the token with full post-update data
        const token = lookupToken(ut.mapId, ut.tokenId)
        if (!token) return null
        return { addToken: { mapId: ut.mapId, token } }
      }
      // Non-visibility update: forward only if the token is currently visible to players
      const token = lookupToken(ut.mapId, ut.tokenId) as { isHidden?: boolean } | null
      if (token?.isHidden === true) return null
      // Visible token, normal update — fall through to passthrough
    }
  }

  // 3: addToken — suppress if the token is marked hidden
  if (p.addToken && typeof p.addToken === 'object') {
    const at = p.addToken as { token?: { isHidden?: boolean } }
    if (at.token?.isHidden === true) return null
  }

  // 4a: addMap — strip hidden tokens from the new map
  if (p.addMap && typeof p.addMap === 'object') {
    const am = p.addMap as { tokens?: unknown }
    if (Array.isArray(am.tokens)) {
      const filtered = (am.tokens as Array<{ isHidden?: boolean }>).filter((t) => !t || t.isHidden !== true)
      p.addMap = { ...am, tokens: filtered }
    }
  }

  // 4b: mapsWithImages — strip hidden tokens per map (post-join image bundle)
  if (Array.isArray(p.mapsWithImages)) {
    p.mapsWithImages = (p.mapsWithImages as Array<Record<string, unknown>>).map((m) => {
      if (Array.isArray(m.tokens)) {
        const tokens = (m.tokens as Array<{ isHidden?: boolean }>).filter((t) => !t || t.isHidden !== true)
        return { ...m, tokens }
      }
      return m
    })
  }

  return p
}
