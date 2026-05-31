import type { NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'

/**
 * Phase 30b — transport seam.
 *
 * Abstracts the wire (PeerJS today via `P2PTransport`; WebSocket on the Pi in
 * Phase 32) so `GameAuthority` can run anywhere without direct PeerJS imports.
 * The interface lands first (additive); the PeerJS wrap + GameAuthority
 * consolidation + old-core deletion are the staged rewrite (30a/30c+).
 */
export interface TransportAdapter {
  /** Send a message to one peer. */
  send: (peerId: string, message: NetworkMessage) => void
  /** Send to all connected peers. */
  broadcast: (message: NetworkMessage) => void
  /** Send to all peers except one (e.g. the originator). */
  broadcastExcluding: (excludePeerId: string, message: NetworkMessage) => void
  /** Subscribe to inbound messages; returns an unsubscribe fn. */
  onMessage: (cb: (peerId: string, message: NetworkMessage) => void) => () => void
  /** Subscribe to peer joins; returns an unsubscribe fn. */
  onPeerJoin: (cb: (peer: PeerInfo) => void) => () => void
  /** Subscribe to peer leaves; returns an unsubscribe fn. */
  onPeerLeave: (cb: (peerId: string) => void) => () => void
  /**
   * Subscribe to relay-driven host migration; returns an unsubscribe fn. Fired
   * when the relay re-elects a co-DM after the host drops — `oldHostPeerId` is
   * the departed host, `newHostPeerId` the elected one. Optional: only the cloud
   * WebSocket transport emits it (P2P/Memory have no server-side re-election).
   */
  onHostMigrated?: (cb: (info: { oldHostPeerId: string; newHostPeerId: string }) => void) => () => void
  /** Disconnect a specific peer. */
  disconnect: (peerId: string) => void
  /** Tear down the transport entirely. */
  close: () => void
}
