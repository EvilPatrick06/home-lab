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
  initial: T,
  permissionFilter?: (value: T, recipientClientId: string) => T
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
    },
    ...(permissionFilter ? { permissionFilter } : {})
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

  it('coalesces a burst of changes into one delta of the final value (coalesceMs)', () => {
    vi.useFakeTimers()
    try {
      const { shard, set } = makeBoxShard('bc-coalesce', { hp: 10 })
      registerShard(shard)

      const hub = new MemoryHub()
      const host = new MemoryTransport(hub, makePeer('host', true))
      const client = new MemoryTransport(hub, makePeer('client'))
      const recv = vi.fn()
      client.onMessage(recv)

      const broadcaster = createShardBroadcaster(host, { coalesceMs: 50 })
      broadcaster.start()

      // Three rapid changes within the window (e.g. a token drag).
      set({ hp: 9 })
      set({ hp: 8 })
      set({ hp: 7 })
      // Nothing shipped yet — debounced.
      expect(syncDeltas(recv).filter((d) => d.shard === 'bc-coalesce')).toHaveLength(0)

      vi.advanceTimersByTime(50)

      const deltas = syncDeltas(recv).filter((d) => d.shard === 'bc-coalesce')
      expect(deltas).toHaveLength(1) // one coalesced delta
      expect(deltas[0].delta.sequence).toBe(1) // one sequence bump
      expect(applyDelta({ hp: 10 }, deltas[0].delta)).toEqual({ hp: 7 }) // the FINAL value

      broadcaster.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop() cancels a pending coalesced flush', () => {
    vi.useFakeTimers()
    try {
      const { shard, set } = makeBoxShard('bc-coalesce-stop', { hp: 10 })
      registerShard(shard)
      const hub = new MemoryHub()
      const host = new MemoryTransport(hub, makePeer('host', true))
      const client = new MemoryTransport(hub, makePeer('client'))
      const recv = vi.fn()
      client.onMessage(recv)
      const broadcaster = createShardBroadcaster(host, { coalesceMs: 50 })
      broadcaster.start()
      set({ hp: 9 })
      broadcaster.stop() // before the window elapses
      vi.advanceTimersByTime(50)
      expect(syncDeltas(recv).filter((d) => d.shard === 'bc-coalesce-stop')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
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

describe('createShardBroadcaster permission filtering (Phase 31j)', () => {
  it('ships a per-recipient filtered replace to each peer on a filtered shard', () => {
    // Filter strips `secret` for the DM-less player ('c-bob') but keeps it for
    // the privileged client ('c-alice').
    const { shard, set } = makeBoxShard<{ hp: number; secret?: string }>(
      'bc-filtered',
      { hp: 10, secret: 'top' },
      (value, clientId) => (clientId === 'c-alice' ? value : { hp: value.hp })
    )
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const alice = new MemoryTransport(hub, makePeer('alice'))
    const bob = new MemoryTransport(hub, makePeer('bob'))
    const recvAlice = vi.fn()
    const recvBob = vi.fn()
    alice.onMessage(recvAlice)
    bob.onMessage(recvBob)

    const broadcaster = createShardBroadcaster(host, {
      getRecipients: () => [
        { peerId: 'alice', clientId: 'c-alice' },
        { peerId: 'bob', clientId: 'c-bob' }
      ]
    })
    broadcaster.start()

    set({ hp: 9, secret: 'newtop' })

    const aliceDeltas = syncDeltas(recvAlice).filter((d) => d.shard === 'bc-filtered')
    const bobDeltas = syncDeltas(recvBob).filter((d) => d.shard === 'bc-filtered')

    expect(aliceDeltas).toHaveLength(1)
    expect(bobDeltas).toHaveLength(1)
    // Both are full replaces sharing one sequence.
    expect(aliceDeltas[0].delta.kind).toBe('replace')
    expect(bobDeltas[0].delta.kind).toBe('replace')
    expect(aliceDeltas[0].delta.sequence).toBe(1)
    expect(bobDeltas[0].delta.sequence).toBe(1)
    // Alice sees the secret; Bob's is stripped.
    expect(aliceDeltas[0].delta.payload).toEqual({ hp: 9, secret: 'newtop' })
    expect(bobDeltas[0].delta.payload).toEqual({ hp: 9 })

    broadcaster.stop()
  })

  it('bumps the shared sequence once per change across recipients', () => {
    const { shard, set } = makeBoxShard<{ n: number; secret?: string }>(
      'bc-filtered-seq',
      { n: 0, secret: 's' },
      (value, clientId) => (clientId === 'c-alice' ? value : { n: value.n })
    )
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const alice = new MemoryTransport(hub, makePeer('alice'))
    const bob = new MemoryTransport(hub, makePeer('bob'))
    const recvAlice = vi.fn()
    const recvBob = vi.fn()
    alice.onMessage(recvAlice)
    bob.onMessage(recvBob)

    const broadcaster = createShardBroadcaster(host, {
      getRecipients: () => [
        { peerId: 'alice', clientId: 'c-alice' },
        { peerId: 'bob', clientId: 'c-bob' }
      ]
    })
    broadcaster.start()

    set({ n: 1, secret: 's' })
    set({ n: 2, secret: 's' })

    const aliceSeqs = syncDeltas(recvAlice)
      .filter((d) => d.shard === 'bc-filtered-seq')
      .map((d) => d.delta.sequence)
    const bobSeqs = syncDeltas(recvBob)
      .filter((d) => d.shard === 'bc-filtered-seq')
      .map((d) => d.delta.sequence)

    expect(aliceSeqs).toEqual([1, 2])
    expect(bobSeqs).toEqual([1, 2])

    broadcaster.stop()
  })

  it('answers a resync-request with a filtered replace for the requester', () => {
    const { shard, set } = makeBoxShard<{ hp: number; secret?: string }>(
      'bc-filtered-resync',
      { hp: 10, secret: 'top' },
      (value, clientId) => (clientId === 'c-alice' ? value : { hp: value.hp })
    )
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const bob = new MemoryTransport(hub, makePeer('bob'))
    const recvBob = vi.fn()
    bob.onMessage(recvBob)

    const broadcaster = createShardBroadcaster(host, {
      getRecipients: () => [
        { peerId: 'alice', clientId: 'c-alice' },
        { peerId: 'bob', clientId: 'c-bob' }
      ]
    })
    broadcaster.start()

    set({ hp: 8, secret: 'top' }) // seq 1

    bob.send('host', {
      type: 'sync:resync-request',
      payload: { shard: 'bc-filtered-resync' },
      senderId: 'bob',
      senderName: 'bob',
      timestamp: 0,
      sequence: 0
    })

    const replies = syncDeltas(recvBob).filter((d) => d.shard === 'bc-filtered-resync' && d.delta.kind === 'replace')
    // The replace reply (resync) is the last entry; bob never sees the secret.
    const resyncReply = replies[replies.length - 1]
    expect(resyncReply.delta.payload).toEqual({ hp: 8 })
    expect(resyncReply.delta.sequence).toBe(1)

    broadcaster.stop()
  })

  it('resync from an UNRESOLVED requester gets the filtered value, never the raw (deny-by-default)', () => {
    // SECURITY: a filtered shard must not leak DM-level data on the resync path
    // to a requester not in the recipient list (previously fell through to an
    // unfiltered shard.read()).
    const { shard, set } = makeBoxShard<{ hp: number; secret?: string }>(
      'bc-resync-ghost',
      { hp: 10, secret: 'top' },
      (value, clientId) => (clientId === 'c-alice' ? value : { hp: value.hp })
    )
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const ghost = new MemoryTransport(hub, makePeer('ghost'))
    const recv = vi.fn()
    ghost.onMessage(recv)

    // getRecipients does NOT include 'ghost' → the requester is unresolved.
    const broadcaster = createShardBroadcaster(host, {
      getRecipients: () => [{ peerId: 'alice', clientId: 'c-alice' }]
    })
    broadcaster.start()
    set({ hp: 9, secret: 'newtop' }) // seq 1

    ghost.send('host', {
      type: 'sync:resync-request',
      payload: { shard: 'bc-resync-ghost' },
      senderId: 'ghost',
      senderName: 'ghost',
      timestamp: 0,
      sequence: 0
    })

    const replies = syncDeltas(recv).filter((d) => d.shard === 'bc-resync-ghost' && d.delta.kind === 'replace')
    expect(replies).toHaveLength(1)
    // The unresolved requester gets the stripped value — NOT the secret.
    expect(replies[0].delta.payload).toEqual({ hp: 9 })
    expect(replies[0].delta.payload).not.toHaveProperty('secret')

    broadcaster.stop()
  })

  it('falls back to an unfiltered broadcast when no getRecipients is supplied', () => {
    // Filtered shard but no recipient list → behavior-preserving: structural
    // diff broadcast to all, no filtering applied.
    const { shard, set } = makeBoxShard<{ hp: number; secret?: string }>(
      'bc-filtered-nofallback',
      { hp: 10, secret: 'top' },
      (value) => ({ hp: value.hp })
    )
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))
    const recv = vi.fn()
    client.onMessage(recv)

    const broadcaster = createShardBroadcaster(host)
    broadcaster.start()

    set({ hp: 9, secret: 'top' })

    const deltas = syncDeltas(recv).filter((d) => d.shard === 'bc-filtered-nofallback')
    expect(deltas).toHaveLength(1)
    // Structural diff (patch), not a per-recipient replace — secret survives.
    expect(deltas[0].delta.kind).toBe('patch')

    broadcaster.stop()
  })
})
