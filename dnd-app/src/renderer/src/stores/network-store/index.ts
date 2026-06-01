import { create } from 'zustand'
import { KICK_PLAYER_REMOVE_DELAY_MS, LAST_SESSION_KEY } from '../../constants'
import type { ConnectionState, MessageType, NetworkGameState, NetworkMessage, PeerInfo } from '../../network'
import {
  broadcastMessage,
  disconnect as clientDisconnect,
  connectToHost,
  generateInviteCode,
  getConnectedPeers,
  getPeerId,
  kickPeer,
  onClientMessage,
  onDisconnected,
  onPeerJoined,
  onPeerLeft,
  resetToDefaults,
  sendClientMessage,
  sendToPeer,
  setGameStateProvider,
  startHosting,
  stopHosting
} from '../../network'
import { GameAuthority } from '../../network/authority/game-authority'
import { setHostOutboundOverride } from '../../network/host-manager'
import { setPeerIdOverride } from '../../network/peer-manager'
import { createShardApplier } from '../../network/sync/applier'
import { createShardBroadcaster } from '../../network/sync/broadcaster'
// Phase 31e — importing the shard barrel runs each shard module's top-level
// registerShard() so the broadcaster/applier below see the migrated features.
import '../../network/sync/shards'
import { addToast } from '../../hooks/use-toast'
import { createP2PTransport } from '../../network/transport/p2p-transport'
import type { TransportAdapter } from '../../network/transport/transport-adapter'
import { hasPermission } from '../../services/permissions/has-permission'
import { useCampaignStore } from '../use-campaign-store'
import { useGameStore } from '../use-game-store'
import { useLobbyStore } from '../use-lobby-store'
import { handleClientMessage } from './client-handlers'
import { connectCloudSession } from './cloud-session'
import { handleHostMessage } from './host-handlers'
import { setNetworkCampaignIdRef } from './network-session-ref'
import { filterGameStateForRole } from './network-state-filter'
import { registerNetworkStoreAccessor } from './network-store-ref'
import type { NetworkState } from './types'

export type { NetworkState }

const listenerCleanups: Array<() => void> = []
function clearListenerCleanups(): void {
  for (const fn of listenerCleanups) fn()
  listenerCleanups.length = 0
}

// Phase 32 — the active Pi-relay transport while a cloud session is live. The
// cloud client's `sendMessage` routes through it (point-to-point to the host);
// the cloud HOST routes via the host-manager outbound override instead, so this
// is read on the client path only. Cleared on teardown.
let activeCloudTransport: TransportAdapter | null = null

// Phase R3b — set true only across a host-migration promotion so the cloud
// CLIENT's listener teardown (`clearListenerCleanups`) drops its subscriptions
// WITHOUT closing the live relay socket: the relay has already moved `host_sid`
// to this socket, so the promoted client must keep the SAME connection and
// re-attach as host over it (a fresh socket would get a new sid and fail to
// claim the already-occupied host slot).
let preserveCloudTransportOnPromotion = false

// Phase 29i: per-role filter cache. Filtering a full game state for
// each joining peer is the slowest path in our broadcast pipeline —
// it walks every map, token, region, drawing, and handout to strip
// DM-only data. We bump `gameStateVersion` whenever the host's game
// store mutates, and keep one cached filtered result per role at the
// latest version. A burst of joins (e.g. 4 players reconnecting at
// the same time) sees a single compute followed by 3 cache hits.
let gameStateVersion = 0
const filteredStateCache = new Map<string, { version: number; result: unknown }>()

function buildFilteredStateForRole(role: 'host' | 'player' | 'spectator'): unknown {
  const cached = filteredStateCache.get(role)
  if (cached && cached.version === gameStateVersion) return cached.result
  const result = filterGameStateForRole(buildNetworkGameState(), role)
  filteredStateCache.set(role, { version: gameStateVersion, result })
  return result
}

type StoreGet = () => NetworkState
type StoreSet = (partial: Partial<NetworkState> | ((state: NetworkState) => Partial<NetworkState>)) => void

/**
 * Phase 32 / R3b — install the cloud-HOST machinery over an already-connected
 * relay transport: reroute the host outbound + peer-id primitives to the relay,
 * run the GameAuthority host dispatch + shard broadcaster, and wire host-side
 * peer listeners (new joiners get the filtered snapshot). Pushes ALL teardown to
 * `listenerCleanups`, including the paired override/peer-id reset + transport
 * close — keep them together so a later disconnect never leaks the overrides.
 *
 * Shared by `hostGame(cloud)` (fresh DM host) and `promoteToCloudHost` (a co-DM
 * promoted in place after host re-election) so the two paths can never drift.
 */
function attachCloudHostMachinery(
  transport: TransportAdapter,
  self: PeerInfo,
  displayName: string,
  get: StoreGet,
  set: StoreSet
): void {
  setPeerIdOverride(self.peerId)
  setHostOutboundOverride({
    broadcast: (m) => transport.broadcast(m),
    broadcastExcluding: (m, exclude) => transport.broadcastExcluding(exclude, m),
    sendToPeer: (peerId, m) => transport.send(peerId, m),
    kick: (peerId) => transport.disconnect(peerId),
    getPeers: () => get().peers,
    getPeerInfo: (peerId) => get().peers.find((p) => p.peerId === peerId)
  })

  const hostAuthority = new GameAuthority(transport)
  hostAuthority.registerDefault((message, ctx) => handleHostMessage(message, ctx.peerId, get, set))
  hostAuthority.start()

  const shardBroadcaster = createShardBroadcaster(transport, {
    getRecipients: () => get().peers.map((p) => ({ peerId: p.peerId, clientId: p.clientId })),
    coalesceMs: 50
  })
  shardBroadcaster.start()
  listenerCleanups.push(() => shardBroadcaster.stop())

  listenerCleanups.push(
    useGameStore.subscribe(() => {
      gameStateVersion++
      filteredStateCache.clear()
    }),
    transport.onPeerJoin((peer: PeerInfo) => {
      get().addPeer(peer)
      // The joiner gets the full player-filtered state snapshot (no P2P
      // host-connection handshake exists on the relay) plus the async
      // map-image payload — two partial `game:state-update`s the client merges.
      const header = {
        senderId: self.peerId,
        senderName: displayName,
        sequence: 0
      }
      transport.send(peer.peerId, {
        type: 'game:state-update' as const,
        payload: buildFilteredStateForRole('player'),
        timestamp: Date.now(),
        ...header
      })
      import('../../network/game-sync')
        .then(({ buildFullGameStatePayload }) => buildFullGameStatePayload())
        .then((fullState) => {
          const maps = fullState.maps as Array<Record<string, unknown>>
          if (!maps?.length) return
          const transformed = transformUpdatePayloadForPeer({ mapsWithImages: maps }, 'player')
          if (!transformed) return
          transport.send(peer.peerId, {
            type: 'game:state-update' as const,
            payload: transformed,
            timestamp: Date.now(),
            ...header
          })
        })
    }),
    transport.onPeerLeave((peerId: string) => get().removePeer(peerId)),
    () => hostAuthority.stop(),
    () => {
      transport.close()
      activeCloudTransport = null
      setHostOutboundOverride(null)
      setPeerIdOverride(null)
    }
  )
}

/**
 * Phase R3b — promote this cloud CLIENT to cloud HOST in place after the relay
 * re-elected it (host-migration). Drops the client-only subscriptions WITHOUT
 * closing the live socket (the relay already owns us as host), then attaches the
 * host machinery over that same transport. The promoted co-DM already holds the
 * unfiltered authoritative game state (it received the 'host' bucket), so there
 * is nothing to seed — it just starts broadcasting.
 */
function promoteToCloudHost(transport: TransportAdapter, self: PeerInfo, get: StoreGet, set: StoreSet): void {
  // Tear down the cloud-client listeners (onMessage/applier/peer subs) but keep
  // the relay socket open for re-use as host.
  preserveCloudTransportOnPromotion = true
  clearListenerCleanups()
  preserveCloudTransportOnPromotion = false

  self.role = 'host'
  self.isHost = true
  self.isDM = true
  attachCloudHostMachinery(transport, self, get().displayName, get, set)
  set({ role: 'host', localIsDM: true, connectionState: 'connected' })
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
  localIsDM: false,
  connectionMode: 'p2p',

  // --- Host actions ---

  hostGame: async (displayName: string, existingInviteCode?: string, mode: 'p2p' | 'cloud' = 'p2p') => {
    set({
      connectionState: 'connecting',
      error: null,
      displayName,
      role: 'host',
      connectionMode: mode
    })

    // Phase 32 — Pi-relayed cloud host. There is no PeerJS mesh: the DM client
    // opens one Socket.IO connection to the Pi relay and the existing host
    // dispatch (GameAuthority + handleHostMessage + shard broadcaster) runs over
    // it. The host-manager outbound override + peer-id override reroute every
    // `broadcastMessage`/`sendToPeer`/`getConnectedPeers`/`getPeerId` call to the
    // relay, so the whole host path works unchanged — no PeerJS state involved.
    if (mode === 'cloud') {
      try {
        const inviteCode = existingInviteCode || generateInviteCode()
        clearListenerCleanups()
        const { transport, self } = await connectCloudSession({
          inviteCode,
          displayName,
          role: 'host'
        })
        activeCloudTransport = transport

        // Install the host outbound overrides + GameAuthority + shard broadcaster
        // + host-side peer listeners over the relay transport (shared with the
        // host-migration promotion path so the two can never drift).
        attachCloudHostMachinery(transport, self, displayName, get, set)

        set({
          connectionState: 'connected',
          inviteCode,
          localPeerId: self.peerId,
          localIsDM: true
        })
        return inviteCode
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to host cloud game'
        setHostOutboundOverride(null)
        setPeerIdOverride(null)
        activeCloudTransport = null
        set({ connectionState: 'error', error: errorMsg, role: 'none', connectionMode: 'p2p' })
        throw err
      }
    }

    try {
      const inviteCode = await startHosting(displayName, existingInviteCode)

      clearListenerCleanups()
      // 30c: the host's inbound dispatch now flows through GameAuthority over a
      // P2PTransport instead of a direct host-manager onMessage subscription.
      // The whole existing handleHostMessage switch is registered as the default
      // handler — behavior-preserving (host-connection still validates upstream;
      // handleHostMessage still broadcasts via host-manager). Per-type handlers
      // peel off the monolith incrementally in 30d+.
      const hostAuthority = new GameAuthority(createP2PTransport())
      hostAuthority.registerDefault((message, ctx) => handleHostMessage(message, ctx.peerId, get, set))
      hostAuthority.start()
      // Phase 31e — the host's per-shard state (conditions, …) now streams to
      // clients via the shard broadcaster (`sync:delta`) instead of the bespoke
      // per-change broadcasts in startGameSync. It subscribes to every shard
      // registered by the barrel import above.
      const shardBroadcaster = createShardBroadcaster(createP2PTransport(), {
        // Phase 31j — feeds the per-recipient permission filter for filtered
        // shards. No-op for unfiltered shards (conditions/initiative), which
        // keep broadcasting the structural diff to all.
        getRecipients: () => getConnectedPeers().map((p) => ({ peerId: p.peerId, clientId: p.clientId })),
        // Phase 31 — coalesce a burst of changes (e.g. a token drag) into one
        // delta of the final value, restoring the throttle the old per-feature
        // broadcasters had.
        coalesceMs: 50
      })
      shardBroadcaster.start()
      listenerCleanups.push(() => shardBroadcaster.stop())
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
                const transformed = transformUpdatePayloadForPeer({ mapsWithImages: maps }, 'player')
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
        () => hostAuthority.stop()
      )

      // Provide game state for full syncs when new players connect.
      // The host gets the unfiltered view; non-host peers get a player-view
      // with hidden tokens / unrevealed traps / DM-only handouts redacted.
      // Phase 29i: results are cached per role until the next game-state
      // mutation, so burst joins reuse the filter pass.
      listenerCleanups.push(
        useGameStore.subscribe(() => {
          gameStateVersion++
          filteredStateCache.clear()
        })
      )
      setGameStateProvider((peerInfo: PeerInfo) => {
        // Phase 29e — the recipient's *view* is keyed on view permissions rather
        // than the literal host/CoDM flags. A peer that can see hidden tokens AND
        // DM-only stats gets the unfiltered ("host") state; everyone else gets the
        // player/spectator-filtered view. isHost/isCoDM remain a fast path and the
        // legacy fallback for campaigns with no permissions block.
        const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === get().campaignId) ?? null
        const seesAll =
          peerInfo.isHost ||
          peerInfo.isCoDM === true ||
          (hasPermission(peerInfo, 'view_hidden_tokens', campaign) &&
            hasPermission(peerInfo, 'view_dm_only_stats', campaign))
        const bucket: 'host' | 'player' | 'spectator' = seesAll
          ? 'host'
          : peerInfo.role === 'spectator'
            ? 'spectator'
            : 'player'
        return buildFilteredStateForRole(bucket)
      })

      set({
        connectionState: 'connected',
        inviteCode,
        localPeerId: getPeerId(),
        // Phase 30e — the network host starts as DM (legacy: host === DM).
        // `transferDm` later moves authority without moving the host.
        localIsDM: true
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
    // Phase 32 — for a cloud host the listener-cleanup chain closes the relay
    // transport + clears the host-manager/peer-id overrides; the P2P calls below
    // are harmless no-ops in that mode.
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
      latencyMs: null,
      localIsDM: false,
      connectionMode: 'p2p'
    })
  },

  kickPlayer: (peerId: string) => {
    // Phase 17e — kicked peers used to linger in the sidebar as "reconnecting"
    // (yellow pill) for ~15 s before vanishing, because the lobby-bridge
    // peer-disappearance handler set status='reconnecting' on any peer that
    // dropped, regardless of cause. Set the status to 'disconnected' (red
    // pill) up front so the kick reads as a kick, give the user 1.5 s to
    // notice, then drop the entry. (The bridge sees the explicit
    // 'disconnected' status and skips the 'reconnecting' downgrade.)
    useLobbyStore.getState().setPlayerStatus(peerId, 'disconnected')
    kickPeer(peerId)
    get().removePeer(peerId)
    setTimeout(() => {
      useLobbyStore.getState().removePlayer(peerId)
    }, KICK_PLAYER_REMOVE_DELAY_MS)
  },

  transferDm: (newDmPeerId: string) => {
    // Phase 30e — DM authority transfer. The network host stays put; only the
    // `isDM` flag moves. Host-only: a client has no peers to broadcast to and
    // its outbound `dm:transfer-dm` would just be relayed back by the host.
    if (get().role !== 'host') return
    // Apply locally to every peer + the lobby mirror so the UI (PlayerCard
    // badges, DM-tool gates) reacts immediately on the host before the wire
    // round-trip.
    for (const peer of get().peers) {
      const isDM = peer.peerId === newDmPeerId
      get().updatePeer(peer.peerId, { isDM })
      useLobbyStore.getState().updatePlayer(peer.peerId, { isDM })
    }
    set({ localIsDM: newDmPeerId === get().localPeerId })
    get().sendMessage('dm:transfer-dm', { newDmPeerId })
  },

  // --- Client actions ---

  joinGame: async (inviteCode: string, displayName: string, mode: 'p2p' | 'cloud' = 'p2p') => {
    set({
      connectionState: 'connecting',
      error: null,
      displayName,
      role: 'client',
      connectionMode: mode
    })

    // Phase 32 — join a Pi-relayed cloud game. One Socket.IO connection; inbound
    // host messages flow to `handleClientMessage`, shard deltas to the applier
    // (both subscribe the same transport). Outgoing intents route to the host in
    // `sendMessage`'s cloud-client branch.
    if (mode === 'cloud') {
      try {
        clearListenerCleanups()
        const { transport, self } = await connectCloudSession({
          inviteCode,
          displayName,
          role: 'player'
        })
        activeCloudTransport = transport
        const shardApplier = createShardApplier(transport)
        shardApplier.start()
        listenerCleanups.push(
          transport.onMessage((_fromPeerId: string, message: NetworkMessage) => {
            handleClientMessage(message, get, set)
          }),
          transport.onPeerJoin((peer: PeerInfo) => get().addPeer(peer)),
          transport.onPeerLeave((peerId: string) => {
            // Phase 32 / R3b — host-disconnect fallback. The relay now re-elects a
            // co-DM server-side (→ `host-migrated`, handled below). It only emits a
            // bare `peer-left` with `was_host` when the host dropped and NO co-DM
            // could inherit — in that case the session is genuinely headless, so a
            // cloud client tears down into the same disconnected state the P2P drop
            // path produces (its `sendMessage` would otherwise find no `isHost` peer
            // and silently drop every intent). A non-host leaving is a normal
            // removePeer.
            const hostLeft = get().peers.some((p) => p.peerId === peerId && p.isHost)
            if (hostLeft) {
              clearListenerCleanups()
              set({
                connectionState: 'disconnected',
                role: 'none',
                inviteCode: null,
                campaignId: null,
                localPeerId: null,
                peers: [],
                error: 'Host left the session',
                disconnectReason: null,
                localIsDM: false,
                connectionMode: 'p2p'
              })
              return
            }
            get().removePeer(peerId)
          }),
          // Phase R3b — relay-driven host migration. When the host drops and a
          // co-DM exists, the relay moves `host_sid` to the oldest co-DM and emits
          // this instead of `peer-left`. The elected client is authority the moment
          // the relay says so (no client-side claim race).
          transport.onHostMigrated?.(({ oldHostPeerId, newHostPeerId }) => {
            if (oldHostPeerId) get().removePeer(oldHostPeerId)
            if (newHostPeerId === self.peerId) {
              promoteToCloudHost(transport, self, get, set)
              addToast('You are now the DM — the previous host disconnected.', 'info')
            } else {
              // Another co-DM inherited authority; keep running as a client but
              // retarget the host pointer so `sendMessage` routes intents correctly.
              get().updatePeer(newHostPeerId, { isHost: true, role: 'host', isDM: true })
              useLobbyStore.getState().updatePlayer(newHostPeerId, { isHost: true })
              const name = get().peers.find((p) => p.peerId === newHostPeerId)?.displayName || 'A co-DM'
              addToast(`${name} is now the DM — the previous host disconnected.`, 'info')
            }
          }) ?? (() => {}),
          () => shardApplier.stop(),
          () => {
            // Skip the close during a promotion: the relay already owns this socket
            // as host, so `promoteToCloudHost` re-uses it (see the preserve flag).
            if (!preserveCloudTransportOnPromotion) {
              transport.close()
              activeCloudTransport = null
            }
          }
        )
        set({
          connectionState: 'connected',
          inviteCode,
          localPeerId: self.peerId
        })
        return
      } catch (err) {
        clearListenerCleanups()
        activeCloudTransport = null
        const errorMsg = err instanceof Error ? err.message : 'Failed to join cloud game'
        set({ connectionState: 'error', error: errorMsg, role: 'none', connectionMode: 'p2p' })
        throw err
      }
    }

    try {
      clearListenerCleanups()
      listenerCleanups.push(
        onClientMessage((message: NetworkMessage) => {
          handleClientMessage(message, get, set)
        }),
        (() => {
          // Phase 31e — the client applies host shard deltas (`sync:delta`) via
          // the shard applier, which writes received conditions back into the
          // game store. Stopped on disconnect by clearListenerCleanups().
          const shardApplier = createShardApplier(createP2PTransport())
          shardApplier.start()
          return () => shardApplier.stop()
        })(),
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
            disconnectReason,
            localIsDM: false
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
    // Phase 29e — structural transport check: the disconnect path needs to
    // know which side owns the connection (host = tear down everyone, client
    // = just leave). Not a permission gate. Phase 30 will revisit
    // role-as-string.
    if (role === 'host') {
      get().stopHosting()
    } else if (role === 'client') {
      // Phase 32 — clearListenerCleanups() above closed the relay transport for a
      // cloud client; clientDisconnect()/resetToDefaults() are P2P no-ops there.
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
        disconnectReason: null,
        localIsDM: false,
        connectionMode: 'p2p'
      })
    }
  },

  // --- Shared actions ---

  sendMessage: (type: MessageType, payload: unknown) => {
    const { role, displayName, connectionMode } = get()
    // Phase 32 — cloud client: route the intent point-to-point to the host (the
    // authority), never broadcast at other players. The cloud HOST falls through
    // to the host branch below — its broadcastMessage/sendToPeer/getConnectedPeers
    // calls are rerouted to the relay by the host-manager outbound override.
    if (connectionMode === 'cloud' && role === 'client' && activeCloudTransport) {
      const host = get().peers.find((p) => p.isHost)
      if (host) {
        activeCloudTransport.send(host.peerId, {
          type,
          payload,
          senderId: get().localPeerId ?? '',
          senderName: displayName,
          timestamp: Date.now(),
          sequence: 0
        })
      }
      return
    }
    // Phase 29e — structural transport gate: only the network host owns the
    // per-peer routing path (filtered state, transform for visibility, etc).
    // Clients fan out via the host. Not a permission gate. Phase 30 will
    // revisit role-as-string.
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
        const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === get().campaignId) ?? null
        const baseHeader = {
          type,
          senderId: getPeerId() || '',
          senderName: displayName,
          sequence: 0
        }
        for (const p of peers) {
          // Phase 17b — CoDM peers receive the unfiltered host view of state
          // updates (hidden-token transitions, etc.). Only the literal host
          // role short-circuits visibility transforms; promote a CoDM to
          // 'host' for transform purposes too.
          //
          // Phase 30d — DM authority is decoupled from the network host. A peer
          // that holds the DM-only view permissions (hidden tokens + DM-only
          // stats) also gets the unfiltered 'host' transform bucket. The
          // isHost/isCoDM checks stay as a fast path and the legacy fallback for
          // campaigns with no permissions block (mirrors the setGameStateProvider
          // gate above).
          const seesAll =
            p.isHost ||
            p.isCoDM === true ||
            (hasPermission(p, 'view_hidden_tokens', campaign) && hasPermission(p, 'view_dm_only_stats', campaign))
          const role = seesAll ? 'host' : (p.role ?? 'player')
          const transformed = transformUpdatePayloadForPeer(payload, role)
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
      // Phase 17ab — whispers must NOT be broadcast (every other peer
      // would see them). Route the host's outgoing whisper directly to
      // the named target via sendToPeer. The sender's own chat already
      // has a local echo added by `sendChat` in use-lobby-store. If the
      // target peerId isn't found in the connection map, drop the
      // message rather than fan it out — better silent than leaked.
      if (type === 'chat:whisper') {
        const wpayload = payload as { targetPeerId?: string }
        const targetPeerId = typeof wpayload?.targetPeerId === 'string' ? wpayload.targetPeerId : null
        if (targetPeerId) sendToPeer(targetPeerId, message)
        return
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

// Mirror the store's `campaignId` into the leaf `network-session-ref` so the sync
// shards can read it synchronously without importing this store (breaks the
// shard ↔ network-store import cycle). Seed the initial value and subscribe.
setNetworkCampaignIdRef(useNetworkStore.getState().campaignId)
useNetworkStore.subscribe((state) => {
  setNetworkCampaignIdRef(state.campaignId)
})

// Late-bind this store for `use-lobby-store` via the leaf accessor so the lobby
// store does not statically import this module (breaks the lobby ↔ network cycle;
// the network → lobby edge stays as a one-directional dependency).
registerNetworkStoreAccessor(() => useNetworkStore.getState())

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
// `filterGameStateForRole` (strips DM-only fields for non-DM peers) lives in the
// leaf module `network-state-filter` so the sync shards can reuse it without
// importing this store (which would form a shard ↔ network-store cycle). It is
// imported above for internal use; re-export it here to preserve this module's
// public surface for existing importers.
export { filterGameStateForRole }

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
  role: 'host' | 'player' | 'spectator' | boolean,
  lookupToken: (mapId: string, tokenId: string) => unknown | null = lookupTokenInHostState
): unknown | null {
  // Phase 29e: accept `role` as either the new role string or the legacy boolean
  // (true = host) for in-flight callers. Spectator sees the same filtered view
  // as a player.
  const isHost = role === true || role === 'host'
  if (isHost) return payload
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

  // 4a: addMap — strip hidden tokens AND DM-only regions/drawings from the new
  // map. addMap broadcasts the full GameMap on mid-session map creation, so
  // without this a player's client receives DM-only scene regions + drawings
  // (mirrors the shard `permissionFilter` + render-surface predicates: regions
  // require `visibleToPlayers === true`; drawings drop only `=== false`).
  if (p.addMap && typeof p.addMap === 'object') {
    const am = p.addMap as { tokens?: unknown; regions?: unknown; drawings?: unknown }
    const nextMap: Record<string, unknown> = { ...am }
    if (Array.isArray(am.tokens)) {
      nextMap.tokens = (am.tokens as Array<{ isHidden?: boolean }>).filter((t) => t?.isHidden !== true)
    }
    if (Array.isArray(am.regions)) {
      nextMap.regions = (am.regions as Array<{ visibleToPlayers?: boolean }>).filter((r) => r.visibleToPlayers === true)
    }
    if (Array.isArray(am.drawings)) {
      nextMap.drawings = (am.drawings as Array<{ visibleToPlayers?: boolean }>).filter(
        (d) => d.visibleToPlayers !== false
      )
    }
    p.addMap = nextMap
  }

  // 4b: mapsWithImages — strip hidden tokens per map (post-join image bundle)
  if (Array.isArray(p.mapsWithImages)) {
    p.mapsWithImages = (p.mapsWithImages as Array<Record<string, unknown>>).map((m) => {
      if (Array.isArray(m.tokens)) {
        const tokens = (m.tokens as Array<{ isHidden?: boolean }>).filter((t) => t?.isHidden !== true)
        return { ...m, tokens }
      }
      return m
    })
  }

  return p
}
