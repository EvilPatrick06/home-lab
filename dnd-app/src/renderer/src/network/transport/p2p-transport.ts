import {
  broadcastMessage,
  broadcastExcluding as hostBroadcastExcluding,
  onMessage as hostOnMessage,
  kickPeer,
  onPeerJoined,
  onPeerLeft,
  sendToPeer,
  stopHosting
} from '../host-manager'
import type { PeerInfo } from '../state-types'
import type { TransportAdapter } from './transport-adapter'

/**
 * Phase 30b.1 — `TransportAdapter` over the existing PeerJS host mesh.
 *
 * Pure delegation to `host-manager` — no behavior change, no host-manager edits.
 * This lets `GameAuthority` (30a) run over the production P2P path without
 * importing PeerJS directly, and is the seam that Phase 32 swaps for a
 * WebSocket transport on the Pi.
 *
 * Note the two adapters: host-manager's message callback is `(message, peerId)`
 * while the transport contract is `(peerId, message)`; and host-manager reports
 * peer-leave with a full `PeerInfo` while the transport contract wants just the
 * peerId.
 */
export function createP2PTransport(): TransportAdapter {
  return {
    send: (peerId, message) => sendToPeer(peerId, message),
    broadcast: (message) => broadcastMessage(message),
    broadcastExcluding: (excludePeerId, message) => hostBroadcastExcluding(message, excludePeerId),
    onMessage: (cb) => hostOnMessage((message, fromPeerId) => cb(fromPeerId, message)),
    onPeerJoin: (cb) => onPeerJoined(cb),
    onPeerLeave: (cb) => onPeerLeft((peer: PeerInfo) => cb(peer.peerId)),
    disconnect: (peerId) => kickPeer(peerId),
    close: () => stopHosting()
  }
}
