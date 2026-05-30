import type { NetworkMessage } from '../message-types'
import type { TransportAdapter } from '../transport/transport-adapter'
import { getShards } from './registry'
import type { Delta } from './shard'

/**
 * Phase 31c — host-side shard broadcaster.
 *
 * `start()` subscribes to every registered shard. On a local change it diffs
 * prev→next, stamps the delta with a monotonic per-shard sequence, and
 * broadcasts a `sync:delta`. It also answers `sync:resync-request` with a full
 * `replace` delta carrying the shard's live value at its current sequence, so a
 * client that detected a gap (31d) can recover.
 *
 * `stop()` unsubscribes everything. Additive in 31c: nothing constructs this
 * until the host wires it in 31e.
 */

/** Build a wire envelope. Sync deltas carry their ordering in `delta.sequence`;
 * the envelope `sequence`/`timestamp`/`sender*` fields are unused by the sync
 * path and filled by the real transport when it ships (31e+). */
function envelope(type: NetworkMessage['type'], payload: unknown): NetworkMessage {
  return { type, payload, senderId: '', senderName: '', timestamp: 0, sequence: 0 }
}

export function createShardBroadcaster(transport: TransportAdapter): { start: () => void; stop: () => void } {
  const unsubscribes: Array<() => void> = []
  /** Live monotonic sequence per shard name; reused by the resync reply. */
  const seqByShard = new Map<string, number>()

  function start(): void {
    for (const shard of getShards()) {
      let prev = shard.read()
      seqByShard.set(shard.name, 0)

      const off = shard.onChange((next) => {
        const delta = shard.diff(prev, next)
        prev = next
        if (!delta) return
        const seq = (seqByShard.get(shard.name) ?? 0) + 1
        seqByShard.set(shard.name, seq)
        delta.sequence = seq
        // TODO(31j): when `shard.permissionFilter` is set, ship a per-recipient
        // filtered value using the GameAuthority peer list instead of an
        // unfiltered broadcast. Broadcast can't per-peer-filter, so for now the
        // common (filter-less) case broadcasts the raw delta to everyone.
        transport.broadcast(envelope('sync:delta', { shard: shard.name, delta }))
      })
      unsubscribes.push(off)
    }

    // Answer resync requests with a full replace at the shard's live sequence.
    const offMsg = transport.onMessage((fromPeerId, message) => {
      if (message.type !== 'sync:resync-request') return
      const { shard: shardName } = message.payload as { shard: string }
      const shard = getShards().find((s) => s.name === shardName)
      if (!shard) return
      const delta: Delta = { kind: 'replace', payload: shard.read(), sequence: seqByShard.get(shardName) ?? 0 }
      transport.send(fromPeerId, envelope('sync:delta', { shard: shardName, delta }))
    })
    unsubscribes.push(offMsg)
  }

  function stop(): void {
    for (const off of unsubscribes) off()
    unsubscribes.length = 0
    seqByShard.clear()
  }

  return { start, stop }
}
