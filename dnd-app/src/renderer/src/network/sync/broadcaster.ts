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
 *
 * Phase 31j — permission-aware per-recipient sync. When a shard declares a
 * `permissionFilter` AND the host supplies `opts.getRecipients`, the broadcaster
 * abandons the unfiltered structural-diff broadcast for that shard and instead
 * ships a per-recipient full `replace` carrying `permissionFilter(next, clientId)`
 * to each peer. A single shared sequence is bumped once per change (so the
 * applier's monotonic check still holds across recipients). Shards without a
 * filter — or any shard when no recipient list is available — keep the original
 * structural-diff broadcast verbatim. Additive: nothing filters until a shard
 * registers a `permissionFilter` (conditions/initiative don't yet).
 */

/** A sync recipient: the wire `peerId` to send to + the stable `clientId` the
 * shard's `permissionFilter` keys on. */
export interface ShardRecipient {
  peerId: string
  clientId: string
}

export interface ShardBroadcasterOptions {
  /** Live connected-peer list, used only when a shard has a `permissionFilter`. */
  getRecipients?: () => ShardRecipient[]
  /**
   * Phase 31 — coalesce window (ms). When > 0, rapid `onChange`s on a shard
   * (e.g. a token drag emitting a frame per pointer-move) collapse into a single
   * delta computed from the LATEST value, restoring the throttle the old
   * per-feature broadcasters had. 0/undefined → broadcast immediately on each
   * change (the default; tests rely on synchronous delivery).
   */
  coalesceMs?: number
}

/** Build a wire envelope. Sync deltas carry their ordering in `delta.sequence`;
 * the envelope `sequence`/`timestamp`/`sender*` fields are unused by the sync
 * path and filled by the real transport when it ships (31e+). */
function envelope(type: NetworkMessage['type'], payload: unknown): NetworkMessage {
  return { type, payload, senderId: '', senderName: '', timestamp: 0, sequence: 0 }
}

export function createShardBroadcaster(
  transport: TransportAdapter,
  opts?: ShardBroadcasterOptions
): { start: () => void; stop: () => void } {
  const unsubscribes: Array<() => void> = []
  /** Live monotonic sequence per shard name; reused by the resync reply. */
  const seqByShard = new Map<string, number>()
  const coalesceMs = opts?.coalesceMs ?? 0

  function start(): void {
    for (const shard of getShards()) {
      let prev = shard.read()
      seqByShard.set(shard.name, 0)
      let timer: ReturnType<typeof setTimeout> | null = null

      // Diff the LATEST value against prev and ship it. Called immediately
      // (coalesceMs=0) or once per coalesce window after a burst of changes.
      const flush = (): void => {
        timer = null
        const next = shard.read()
        const seq = (seqByShard.get(shard.name) ?? 0) + 1

        // Permission-aware path: a filtered shard with a recipient list ships a
        // per-recipient full `replace`. Bump the shared sequence once so the
        // applier's monotonic check holds identically across every recipient.
        if (shard.permissionFilter && opts?.getRecipients) {
          seqByShard.set(shard.name, seq)
          prev = next
          for (const recipient of opts.getRecipients()) {
            const filtered = shard.permissionFilter(next, recipient.clientId)
            const delta: Delta = { kind: 'replace', payload: filtered, sequence: seq }
            transport.send(recipient.peerId, envelope('sync:delta', { shard: shard.name, delta }))
          }
          return
        }

        // Unfiltered path (conditions/initiative today): structural diff to all.
        const delta = shard.diff(prev, next)
        prev = next
        if (!delta) return
        seqByShard.set(shard.name, seq)
        delta.sequence = seq
        transport.broadcast(envelope('sync:delta', { shard: shard.name, delta }))
      }

      const off = shard.onChange(() => {
        if (coalesceMs > 0) {
          // Coalesce a burst into one flush of the final value.
          if (timer) return
          timer = setTimeout(flush, coalesceMs)
        } else {
          flush()
        }
      })
      unsubscribes.push(() => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        off()
      })
    }

    // Answer resync requests with a full replace at the shard's live sequence.
    const offMsg = transport.onMessage((fromPeerId, message) => {
      if (message.type !== 'sync:resync-request') return
      const { shard: shardName } = message.payload as { shard: string }
      const shard = getShards().find((s) => s.name === shardName)
      if (!shard) return
      const sequence = seqByShard.get(shardName) ?? 0

      // Filtered shard: NEVER reply with the raw (DM-level) value. Resolve the
      // requester's clientId from the recipient list by its peerId; if it can't
      // be resolved (unknown requester), pass `fromPeerId` — which the filter
      // can't match to a connected peer, so it strips DM-only data
      // (deny-by-default). Closes the resync wire-leak that previously fell
      // through to an unfiltered `shard.read()` for an unresolved requester.
      if (shard.permissionFilter) {
        const requester = opts?.getRecipients?.().find((r) => r.peerId === fromPeerId)
        const filtered = shard.permissionFilter(shard.read(), requester?.clientId ?? fromPeerId)
        const delta: Delta = { kind: 'replace', payload: filtered, sequence }
        transport.send(fromPeerId, envelope('sync:delta', { shard: shardName, delta }))
        return
      }

      // Unfiltered shard (walls, initiative, …): reply with the full value.
      const delta: Delta = { kind: 'replace', payload: shard.read(), sequence }
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
