import { describe, expect, it, vi } from 'vitest'
import type { NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'
import { MemoryHub, MemoryTransport } from '../transport/memory-transport'
import { createShardBroadcaster } from './broadcaster'
import { applyDelta, structuralDiff } from './diff'
import { registerShard } from './registry'
import type { Delta, Shard } from './shard'

function makePeer(peerId: string, isHost = false): PeerInfo {
  return {
    peerId,
    clientId: `c-${peerId}`,
    role: isHost ? 'host' : 'player',
    displayName: peerId,
    characterId: null,
    characterName: null,
    isReady: false,
    isHost
  }
}

/**
 * Test shard backed by a mutable box + manual change-emit. `set()` mutates the
 * value and fires subscribers (simulating a local store change the broadcaster
 * observes). The registry is module-level with no reset, so each test passes a
 * unique `name` to avoid cross-test collisions.
 */
function makeBoxShard<T>(
  name: string,
  initial: T
): {
  shard: Shard<T>
  set: (next: T) => void
  get: () => T
} {
  let value = initial
  const subs = new Set<(v: T) => void>()
  const shard: Shard<T> = {
    name,
    read: () => value,
    onChange: (cb) => {
      subs.add(cb)
      return () => {
        subs.delete(cb)
      }
    },
    diff: (prev, next) => structuralDiff(prev, next),
    applyDelta: (delta) => {
      value = applyDelta(value, delta)
    }
  }
  return {
    shard,
    set: (next) => {
      value = next
      for (const cb of subs) cb(next)
    },
    get: () => value
  }
}

function syncDeltas(recv: ReturnType<typeof vi.fn>): SyncDeltaCapture[] {
  return recv.mock.calls
    .map((c) => c[1] as NetworkMessage)
    .filter((m) => m.type === 'sync:delta')
    .map((m) => m.payload as SyncDeltaCapture)
}

interface SyncDeltaCapture {
  shard: string
  delta: Delta
}

describe('createShardBroadcaster (Phase 31c)', () => {
  it('ships a delta with an incrementing sequence on each change', () => {
    const { shard, set } = makeBoxShard('bc-counter', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))
    const recv = vi.fn()
    client.onMessage(recv)

    const broadcaster = createShardBroadcaster(host)
    broadcaster.start()

    set({ hp: 9 })
    set({ hp: 8 })

    const deltas = syncDeltas(recv).filter((d) => d.shard === 'bc-counter')
    expect(deltas).toHaveLength(2)
    expect(deltas[0].delta.sequence).toBe(1)
    expect(deltas[1].delta.sequence).toBe(2)

    broadcaster.stop()
  })

  it('ships nothing when the diff is null (no-op change)', () => {
    const { shard, set } = makeBoxShard('bc-noop', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))
    const recv = vi.fn()
    client.onMessage(recv)

    const broadcaster = createShardBroadcaster(host)
    broadcaster.start()

    // Re-emit a deep-equal value: structuralDiff → null → no broadcast.
    set({ hp: 10 })

    expect(syncDeltas(recv).filter((d) => d.shard === 'bc-noop')).toHaveLength(0)

    broadcaster.stop()
  })

  it('answers a resync-request with a full replace at the live sequence', () => {
    const { shard, set } = makeBoxShard('bc-resync', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))
    const recv = vi.fn()
    client.onMessage(recv)

    const broadcaster = createShardBroadcaster(host)
    broadcaster.start()

    set({ hp: 9 }) // seq 1
    set({ hp: 8 }) // seq 2

    // Client asks for a resync; broadcaster replies with a replace at seq 2.
    client.send('host', {
      type: 'sync:resync-request',
      payload: { shard: 'bc-resync' },
      senderId: 'client',
      senderName: 'client',
      timestamp: 0,
      sequence: 0
    })

    const replies = syncDeltas(recv).filter((d) => d.shard === 'bc-resync' && d.delta.kind === 'replace')
    expect(replies).toHaveLength(1)
    expect(replies[0].delta.payload).toEqual({ hp: 8 })
    expect(replies[0].delta.sequence).toBe(2)

    broadcaster.stop()
  })

  it('stop() halts further broadcasts', () => {
    const { shard, set } = makeBoxShard('bc-stop', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))
    const recv = vi.fn()
    client.onMessage(recv)

    const broadcaster = createShardBroadcaster(host)
    broadcaster.start()
    broadcaster.stop()

    set({ hp: 5 })

    expect(syncDeltas(recv).filter((d) => d.shard === 'bc-stop')).toHaveLength(0)
  })
})
