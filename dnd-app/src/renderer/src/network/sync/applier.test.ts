import { describe, expect, it, vi } from 'vitest'
import type { NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'
import { MemoryHub, MemoryTransport } from '../transport/memory-transport'
import type { TransportAdapter } from '../transport/transport-adapter'
import { createShardApplier } from './applier'
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

function deltaMsg(shard: string, delta: Delta): NetworkMessage {
  return {
    type: 'sync:delta',
    payload: { shard, delta },
    senderId: 'host',
    senderName: 'host',
    timestamp: 0,
    sequence: 0
  }
}

describe('createShardApplier (Phase 31d)', () => {
  it('applies an in-order patch delta to its shard value', () => {
    const { shard, get } = makeBoxShard('ap-inorder', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))

    const applier = createShardApplier(client)
    applier.start()

    const patch = structuralDiff({ hp: 10 }, { hp: 9 })
    expect(patch).not.toBeNull()
    if (patch) {
      patch.sequence = 1
      host.send('client', deltaMsg('ap-inorder', patch))
    }

    expect(get()).toEqual({ hp: 9 })
    applier.stop()
  })

  it('always accepts a replace delta and re-anchors the sequence', () => {
    const { shard, get } = makeBoxShard('ap-replace', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))

    const applier = createShardApplier(client)
    applier.start()

    // Replace at seq 5 (out of "in-order" range) is still accepted.
    host.send('client', deltaMsg('ap-replace', { kind: 'replace', payload: { hp: 3 }, sequence: 5 }))
    expect(get()).toEqual({ hp: 3 })

    // A patch at seq 6 is now in-order relative to the replace and applies.
    const patch = structuralDiff({ hp: 3 }, { hp: 2 })
    if (patch) {
      patch.sequence = 6
      host.send('client', deltaMsg('ap-replace', patch))
    }
    expect(get()).toEqual({ hp: 2 })

    applier.stop()
  })

  it('on a sequence gap drops the patch and sends a resync-request', () => {
    const { shard, get } = makeBoxShard('ap-gap', { hp: 10 })
    registerShard(shard)

    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))
    const hostRecv = vi.fn()
    host.onMessage(hostRecv)

    const applier = createShardApplier(client)
    applier.start()

    // First in-order patch (seq 1) applies.
    const p1 = structuralDiff({ hp: 10 }, { hp: 9 })
    if (p1) {
      p1.sequence = 1
      host.send('client', deltaMsg('ap-gap', p1))
    }
    expect(get()).toEqual({ hp: 9 })

    // Skip seq 2 → deliver seq 3: gap. Patch is dropped, value unchanged.
    const p3 = structuralDiff({ hp: 9 }, { hp: 7 })
    if (p3) {
      p3.sequence = 3
      host.send('client', deltaMsg('ap-gap', p3))
    }
    expect(get()).toEqual({ hp: 9 }) // unchanged — gapped patch not applied

    const resyncReqs = hostRecv.mock.calls
      .map((c) => c[1] as NetworkMessage)
      .filter((m) => m.type === 'sync:resync-request' && (m.payload as { shard: string }).shard === 'ap-gap')
    expect(resyncReqs).toHaveLength(1)

    applier.stop()
  })

  it('end-to-end: a gap triggers a resync-request and the broadcaster replace recovers the applier', () => {
    // Real broadcaster + real applier over a drop-capable host transport. The
    // shard's source (read/diff/onChange) is the host's authoritative box; its
    // `applyDelta` writes to a SEPARATE client mirror box so recovery is
    // observable independent of the host source. We drop the broadcaster's
    // seq-2 frame on the wire → the applier sees a gap, requests a resync, and
    // the broadcaster's full replace re-anchors the mirror to the host value.
    let source = { hp: 10 }
    let mirror = { hp: 10 }
    const subs = new Set<(v: { hp: number }) => void>()
    const shard: Shard<{ hp: number }> = {
      name: 'ap-e2e',
      read: () => source,
      onChange: (cb) => {
        subs.add(cb)
        return () => {
          subs.delete(cb)
        }
      },
      diff: (prev, next) => structuralDiff(prev, next),
      applyDelta: (delta) => {
        mirror = applyDelta(mirror, delta)
      }
    }
    registerShard(shard)
    const setSource = (next: { hp: number }): void => {
      source = next
      for (const cb of subs) cb(next)
    }

    const hub = new MemoryHub()
    const realHost = new MemoryTransport(hub, makePeer('host', true))
    const client = new MemoryTransport(hub, makePeer('client'))

    // Wrap the host transport so one broadcast can be suppressed (a dropped
    // frame), forcing a sequence gap at the applier. Everything else passes
    // through to the real transport.
    let dropNextBroadcast = false
    const droppingHost: TransportAdapter = {
      send: (peerId, m) => realHost.send(peerId, m),
      broadcast: (m) => {
        if (dropNextBroadcast) {
          dropNextBroadcast = false
          return
        }
        realHost.broadcast(m)
      },
      broadcastExcluding: (id, m) => realHost.broadcastExcluding(id, m),
      onMessage: (cb) => realHost.onMessage(cb),
      onPeerJoin: (cb) => realHost.onPeerJoin(cb),
      onPeerLeave: (cb) => realHost.onPeerLeave(cb),
      disconnect: (id) => realHost.disconnect(id),
      close: () => realHost.close()
    }

    const broadcaster = createShardBroadcaster(droppingHost)
    const applier = createShardApplier(client)
    broadcaster.start()
    applier.start()

    setSource({ hp: 9 }) // seq 1 → broadcast + applied to mirror
    expect(mirror).toEqual({ hp: 9 })

    dropNextBroadcast = true
    setSource({ hp: 8 }) // seq 2 → dropped on the wire; mirror stays { hp: 9 }
    expect(mirror).toEqual({ hp: 9 })

    // seq 3 → gap at the applier. It requests a resync; the broadcaster replies
    // with a replace of the host's live value at the live seq. The whole
    // round-trip is synchronous over MemoryTransport, so by the time setSource
    // returns the mirror has re-anchored to the host's authoritative value.
    setSource({ hp: 6 })
    expect(mirror).toEqual({ hp: 6 })

    broadcaster.stop()
    applier.stop()
  })
})
