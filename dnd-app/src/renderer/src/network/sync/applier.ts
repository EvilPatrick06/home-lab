import type { NetworkMessage } from '../message-types'
import type { TransportAdapter } from '../transport/transport-adapter'
import { findShard } from './registry'
import type { Delta } from './shard'

/**
 * Phase 31d — client-side shard applier.
 *
 * `start()` subscribes to inbound `sync:delta` messages. A `replace` is always
 * accepted (and resets the tracked sequence). A `patch` is applied only when its
 * sequence is exactly one past the last applied one; any gap is treated as lost
 * frames — the gapped patch is dropped and a `sync:resync-request` is sent so the
 * broadcaster (31c) replies with a full `replace` to recover.
 *
 * `stop()` unsubscribes. Additive in 31d: nothing constructs this until the
 * client wires it in 31e.
 */

function envelope(type: NetworkMessage['type'], payload: unknown): NetworkMessage {
  return { type, payload, senderId: '', senderName: '', timestamp: 0, sequence: 0 }
}

export function createShardApplier(transport: TransportAdapter): { start: () => void; stop: () => void } {
  let unsubscribe: (() => void) | null = null
  /** Last applied sequence per shard name. */
  const lastSeqByShard = new Map<string, number>()

  function start(): void {
    unsubscribe = transport.onMessage((fromPeerId, message) => {
      if (message.type !== 'sync:delta') return
      const { shard: shardName, delta } = message.payload as { shard: string; delta: Delta }
      const shard = findShard(shardName)
      if (!shard) return

      if (delta.kind === 'replace') {
        shard.applyDelta(delta)
        lastSeqByShard.set(shardName, delta.sequence)
        return
      }

      const lastSeq = lastSeqByShard.get(shardName) ?? 0
      if (delta.sequence === lastSeq + 1) {
        shard.applyDelta(delta)
        lastSeqByShard.set(shardName, delta.sequence)
        return
      }

      // Sequence gap (or out-of-order frame): don't apply the gapped patch.
      // Ask the broadcaster (the delta's sender) for a full replace to re-anchor.
      transport.send(fromPeerId, envelope('sync:resync-request', { shard: shardName }))
    })
  }

  function stop(): void {
    unsubscribe?.()
    unsubscribe = null
    lastSeqByShard.clear()
  }

  return { start, stop }
}
