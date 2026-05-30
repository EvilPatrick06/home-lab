import type { NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'
import type { TransportAdapter } from './transport-adapter'

/**
 * Phase 30b.2 — in-process `TransportAdapter` for deterministic tests.
 *
 * A shared `MemoryHub` routes messages between `MemoryTransport` endpoints
 * created from it. No PeerJS, no timers — delivery is synchronous, so tests
 * assert outcomes without awaiting. Two endpoints sharing one hub model a
 * host↔client pair; N endpoints model a full session. This is the transport
 * `GameAuthority` (30a) runs over in unit tests.
 */
type MessageCb = (peerId: string, message: NetworkMessage) => void
type JoinCb = (peer: PeerInfo) => void
type LeaveCb = (peerId: string) => void

export class MemoryHub {
  private readonly endpoints = new Map<string, MemoryTransport>()

  /** @internal — called by MemoryTransport's constructor. */
  _register(peerId: string, transport: MemoryTransport, info: PeerInfo): void {
    this.endpoints.set(peerId, transport)
    for (const [id, other] of this.endpoints) {
      if (id !== peerId) other._fireJoin(info)
    }
  }

  /** @internal */
  _unregister(peerId: string): void {
    if (!this.endpoints.delete(peerId)) return
    for (const other of this.endpoints.values()) other._fireLeave(peerId)
  }

  /** @internal */
  _deliver(toPeerId: string, fromPeerId: string, message: NetworkMessage): void {
    this.endpoints.get(toPeerId)?._fireMessage(fromPeerId, message)
  }

  /** @internal */
  _peerIds(): string[] {
    return [...this.endpoints.keys()]
  }
}

export class MemoryTransport implements TransportAdapter {
  private readonly peerId: string
  private readonly msgCbs = new Set<MessageCb>()
  private readonly joinCbs = new Set<JoinCb>()
  private readonly leaveCbs = new Set<LeaveCb>()

  constructor(
    private readonly hub: MemoryHub,
    private readonly self: PeerInfo
  ) {
    this.peerId = self.peerId
    hub._register(this.peerId, this, self)
  }

  send(peerId: string, message: NetworkMessage): void {
    this.hub._deliver(peerId, this.peerId, message)
  }

  broadcast(message: NetworkMessage): void {
    for (const id of this.hub._peerIds()) {
      if (id !== this.peerId) this.hub._deliver(id, this.peerId, message)
    }
  }

  broadcastExcluding(excludePeerId: string, message: NetworkMessage): void {
    for (const id of this.hub._peerIds()) {
      if (id !== this.peerId && id !== excludePeerId) this.hub._deliver(id, this.peerId, message)
    }
  }

  onMessage(cb: MessageCb): () => void {
    this.msgCbs.add(cb)
    return () => {
      this.msgCbs.delete(cb)
    }
  }

  onPeerJoin(cb: JoinCb): () => void {
    this.joinCbs.add(cb)
    return () => {
      this.joinCbs.delete(cb)
    }
  }

  onPeerLeave(cb: LeaveCb): () => void {
    this.leaveCbs.add(cb)
    return () => {
      this.leaveCbs.delete(cb)
    }
  }

  disconnect(peerId: string): void {
    this.hub._unregister(peerId)
  }

  close(): void {
    this.hub._unregister(this.peerId)
  }

  /** @internal — hub callbacks. */
  _fireMessage(fromPeerId: string, message: NetworkMessage): void {
    for (const cb of this.msgCbs) cb(fromPeerId, message)
  }

  /** @internal */
  _fireJoin(peer: PeerInfo): void {
    for (const cb of this.joinCbs) cb(peer)
  }

  /** @internal */
  _fireLeave(peerId: string): void {
    for (const cb of this.leaveCbs) cb(peerId)
  }
}
