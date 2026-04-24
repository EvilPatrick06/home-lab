import { create } from 'zustand'
import { LAST_SESSION_KEY } from '../../constants'
import type { ConnectionState, MessageType, NetworkGameState, NetworkMessage, PeerInfo } from '../../network'
import {
  broadcastMessage,
  disconnect as clientDisconnect,
  connectToHost,
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
                const msg = {
                  type: 'game:state-update' as const,
                  payload: { mapsWithImages: maps },
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

      // Provide game state for full syncs when new players connect
      setGameStateProvider(() => buildNetworkGameState())

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
