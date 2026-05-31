import { io } from 'socket.io-client'
import type { NetworkMessage } from '../message-types'
import type { PeerInfo, PeerRole } from '../state-types'
import type { TransportAdapter } from './transport-adapter'

/**
 * Phase 32c — Pi-relayed WebSocket transport.
 *
 * The third `TransportAdapter` implementation (alongside `P2PTransport` /
 * `MemoryTransport`). Instead of a WebRTC mesh, every client opens ONE Socket.IO
 * connection to the always-on Pi's `/game` namespace and joins a room keyed by
 * the invite code. The Pi relays `NetworkMessage`s between peers — so `send` /
 * `broadcast` / `broadcastExcluding` become `relay` emits with a routing hint,
 * and inbound `message` events fan back out to `onMessage`.
 *
 * The Pi is a relay, not the game-rules authority: the DM client still runs
 * `GameAuthority` + the shard broadcaster over THIS transport, exactly as it did
 * over `P2PTransport`. Nothing in `GameAuthority`/`broadcaster`/`applier` changes.
 *
 * The shard broadcaster leaves the envelope `senderId` empty, so the relay tells
 * each recipient who sent a frame via an out-of-band `from_peer_id` field; this
 * transport surfaces that as the `peerId` arg of the `onMessage` callback.
 */

/** Minimal Socket.IO client surface this transport needs. Lets tests inject a
 * fake socket without a live connection. `socket.io-client`'s `Socket` satisfies it. */
export interface RelaySocket {
  on: (event: string, listener: (payload?: unknown) => void) => void
  emit: (event: string, payload?: unknown) => void
  disconnect: () => void
}

export interface WebSocketTransportOptions {
  /** Pi origin the Socket.IO client connects to (e.g. `wss://bmo.example`). The
   * `/game` namespace is appended by the default factory. */
  url: string
  /** Invite code — the relay room to join. */
  code: string
  /** The local peer's identity, announced on join. */
  self: PeerInfo
  /** Optional BMO API key, sent in the connect auth dict when the Pi is locked. */
  apiKey?: string
  /** Socket factory — defaults to `socket.io-client`. Injected by tests. */
  socketFactory?: (url: string, auth: Record<string, unknown>) => RelaySocket
}

/** Relay peer-ref wire shape (`game_relay.py` `_normalize_peer`). */
interface RelayPeerRef {
  peer_id?: string
  client_id?: string
  role?: string
  display_name?: string
}

function defaultSocketFactory(url: string, auth: Record<string, unknown>): RelaySocket {
  // socket.io appends the namespace to the origin; `transports: ['websocket']`
  // skips the long-poll upgrade dance (the Pi serves WS directly).
  return io(`${url}/game`, {
    auth,
    transports: ['websocket'],
    forceNew: true
  }) as unknown as RelaySocket
}

/** Translate a relay peer-ref into the renderer's `PeerInfo`. */
function toPeerInfo(ref: RelayPeerRef): PeerInfo {
  const role = (ref.role as PeerRole) || 'player'
  return {
    peerId: String(ref.peer_id ?? ''),
    clientId: String(ref.client_id ?? ''),
    role,
    displayName: String(ref.display_name ?? ''),
    characterId: null,
    characterName: null,
    isReady: false,
    isHost: role === 'host'
  }
}

export function createWebSocketTransport(opts: WebSocketTransportOptions): TransportAdapter {
  const factory = opts.socketFactory ?? defaultSocketFactory
  const socket = factory(opts.url, { api_key: opts.apiKey })

  const msgCbs = new Set<(peerId: string, message: NetworkMessage) => void>()
  const joinCbs = new Set<(peer: PeerInfo) => void>()
  const leaveCbs = new Set<(peerId: string) => void>()
  const migratedCbs = new Set<(info: { oldHostPeerId: string; newHostPeerId: string }) => void>()

  socket.on('peers', (payload) => {
    const data = (payload ?? {}) as { peers?: RelayPeerRef[] }
    for (const ref of data.peers ?? []) {
      const peer = toPeerInfo(ref)
      for (const cb of joinCbs) cb(peer)
    }
  })

  socket.on('peer-joined', (payload) => {
    const peer = toPeerInfo((payload ?? {}) as RelayPeerRef)
    for (const cb of joinCbs) cb(peer)
  })

  socket.on('peer-left', (payload) => {
    const peerId = ((payload ?? {}) as { peer_id?: string }).peer_id
    if (peerId) for (const cb of leaveCbs) cb(peerId)
  })

  // Relay re-elected a co-DM to host after the previous host dropped.
  socket.on('host-migrated', (payload) => {
    const data = (payload ?? {}) as { old_host_peer_id?: string; new_host_peer_id?: string }
    const info = {
      oldHostPeerId: String(data.old_host_peer_id ?? ''),
      newHostPeerId: String(data.new_host_peer_id ?? '')
    }
    for (const cb of migratedCbs) cb(info)
  })

  socket.on('message', (payload) => {
    const data = (payload ?? {}) as { from_peer_id?: string; message?: NetworkMessage }
    if (data.message) {
      const fromPeerId = String(data.from_peer_id ?? '')
      for (const cb of msgCbs) cb(fromPeerId, data.message)
    }
  })

  // Announce ourselves into the room. `is_co_dm` lets the relay mark a peer
  // promotable for host re-election (the host also keeps it in sync via the
  // relayed dm:promote-codm message — see game_relay_ws.py).
  socket.emit('join', {
    code: opts.code,
    peer_id: opts.self.peerId,
    client_id: opts.self.clientId,
    role: opts.self.role,
    display_name: opts.self.displayName,
    is_co_dm: opts.self.isCoDM ?? false
  })

  return {
    send: (peerId, message) => socket.emit('relay', { message, target_peer_id: peerId }),
    broadcast: (message) => socket.emit('relay', { message }),
    broadcastExcluding: (excludePeerId, message) => socket.emit('relay', { message, exclude_peer_id: excludePeerId }),
    onMessage: (cb) => {
      msgCbs.add(cb)
      return () => msgCbs.delete(cb)
    },
    onPeerJoin: (cb) => {
      joinCbs.add(cb)
      return () => joinCbs.delete(cb)
    },
    onPeerLeave: (cb) => {
      leaveCbs.add(cb)
      return () => leaveCbs.delete(cb)
    },
    onHostMigrated: (cb) => {
      migratedCbs.add(cb)
      return () => migratedCbs.delete(cb)
    },
    // Host-only on the relay: ask the Pi to drop a peer's socket.
    disconnect: (peerId) => socket.emit('kick', { peer_id: peerId }),
    close: () => {
      msgCbs.clear()
      joinCbs.clear()
      leaveCbs.clear()
      migratedCbs.clear()
      socket.disconnect()
    }
  }
}
