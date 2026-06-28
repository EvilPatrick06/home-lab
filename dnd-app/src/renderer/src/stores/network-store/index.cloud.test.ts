import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkMessage } from '../../network'
import { getPeerId, onClientMessage, onHostMessage } from '../../network'
import { applyDelta, structuralDiff } from '../../network/sync/diff'
import { registerShard } from '../../network/sync/registry'
import type { Shard } from '../../network/sync/shard'
import type { RelaySocket } from '../../network/transport/websocket-transport'
import { __setCloudSocketFactoryForTests } from './cloud-session'
import { useNetworkStore } from './index'

// No window.api.loadSettings → resolveBmoBaseUrl falls back to the default URL
// (resolves synchronously, no network).
vi.stubGlobal('window', { api: {} })

interface FakeSocket extends RelaySocket {
  emits: Array<{ event: string; payload: unknown }>
  fire: (event: string, payload?: unknown) => void
  lastEmit: (event: string) => { event: string; payload: unknown } | undefined
  disconnected: boolean
}

function makeFakeSocket(): FakeSocket {
  const handlers = new Map<string, (payload?: unknown) => void>()
  const emits: Array<{ event: string; payload: unknown }> = []
  const s = {
    emits,
    disconnected: false,
    on: (event: string, listener: (payload?: unknown) => void) => handlers.set(event, listener),
    emit: (event: string, payload?: unknown) => emits.push({ event, payload }),
    disconnect() {
      s.disconnected = true
    },
    fire: (event: string, payload?: unknown) => handlers.get(event)?.(payload),
    lastEmit: (event: string) => [...emits].reverse().find((e) => e.event === event)
  }
  return s
}

let socket: FakeSocket

beforeEach(() => {
  socket = makeFakeSocket()
  __setCloudSocketFactoryForTests(() => socket)
})

afterEach(async () => {
  // Tear down whatever session a test started so module-level overrides reset.
  const st = useNetworkStore.getState()
  if (st.role === 'host') st.stopHosting()
  else if (st.role === 'client') st.disconnect()
  __setCloudSocketFactoryForTests(null)
})

describe('network store — cloud host', () => {
  it('hostGame(cloud) opens the relay, claims DM, sets cloud mode + peer-id override', async () => {
    const code = await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
    const st = useNetworkStore.getState()
    expect(code).toBe('ROOM42')
    expect(st.connectionMode).toBe('cloud')
    expect(st.role).toBe('host')
    expect(st.localIsDM).toBe(true)
    expect(st.localPeerId).toMatch(/^cloud-/)
    // A join was announced to the relay with our identity.
    const join = socket.lastEmit('join')
    expect(join?.payload).toMatchObject({ code: 'ROOM42', role: 'host', display_name: 'DM' })
    // The peer-id override is active so host dispatch stamps the cloud id.
    expect(getPeerId()).toBe(st.localPeerId)
  })

  it('host outbound (sendMessage broadcast) routes through the relay', async () => {
    await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
    socket.emits.length = 0
    useNetworkStore.getState().sendMessage('chat:message', { text: 'hi' })
    const relay = socket.lastEmit('relay')
    expect(relay).toBeDefined()
    expect((relay?.payload as { message: NetworkMessage }).message.type).toBe('chat:message')
  })

  it('peer-joined adds the peer + ships a state snapshot; peer-left removes it', async () => {
    await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
    socket.emits.length = 0
    socket.fire('peer-joined', { peer_id: 'p1', client_id: 'c1', role: 'player', display_name: 'Alice' })
    expect(useNetworkStore.getState().peers.map((p) => p.peerId)).toContain('p1')
    // Snapshot was sent point-to-point to the joiner.
    const relay = socket.lastEmit('relay')
    expect(relay?.payload).toMatchObject({ target_peer_id: 'p1' })
    socket.fire('peer-left', { peer_id: 'p1', was_host: false })
    expect(useNetworkStore.getState().peers.map((p) => p.peerId)).not.toContain('p1')
  })

  it('reconnect under a new peerId but same clientId replaces the roster entry + snapshots the live peer (MP-EN-1)', async () => {
    await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
    socket.fire('peer-joined', {
      peer_id: 'cloud-old',
      client_id: 'stable-1',
      role: 'player',
      display_name: 'Alice'
    })
    expect(useNetworkStore.getState().peers.map((p) => p.peerId)).toEqual(['cloud-old'])
    socket.emits.length = 0
    // The Phase-54A relay emits a paired peer-left(old)+peer-joined(new) on a
    // reconnect, but even on the raw peer-joined the clientId dedupe must
    // collapse the stale entry — this is the case the live v2.6.3 build failed.
    socket.fire('peer-joined', {
      peer_id: 'cloud-new',
      client_id: 'stable-1',
      role: 'player',
      display_name: 'Alice'
    })
    const peers = useNetworkStore.getState().peers
    expect(peers.map((p) => p.peerId)).toEqual(['cloud-new']) // replaced, not duplicated
    expect(peers.filter((p) => p.clientId === 'stable-1')).toHaveLength(1)
    // The fresh state snapshot routed to the LIVE (new) peer connection, so the
    // per-recipient permission-filtered shards reach it.
    const relay = socket.lastEmit('relay')
    expect(relay?.payload).toMatchObject({ target_peer_id: 'cloud-new' })
  })

  it('stopHosting clears the relay overrides + resets to p2p', async () => {
    await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
    useNetworkStore.getState().stopHosting()
    const st = useNetworkStore.getState()
    expect(st.connectionMode).toBe('p2p')
    expect(st.role).toBe('none')
    expect(socket.disconnected).toBe(true)
    // Peer-id override cleared → falls back to the (null) PeerJS id.
    expect(getPeerId()).toBeNull()
  })
})

describe('network store — cloud client', () => {
  it('joinGame(cloud) connects + sends intents point-to-point to the host', async () => {
    await useNetworkStore.getState().joinGame('ROOM42', 'Alice', 'cloud')
    const st = useNetworkStore.getState()
    expect(st.connectionMode).toBe('cloud')
    expect(st.role).toBe('client')
    expect(st.localPeerId).toMatch(/^cloud-/)
    expect(socket.lastEmit('join')?.payload).toMatchObject({ role: 'player' })
    // Learn the host from the relay's peers list.
    socket.fire('peers', {
      peers: [{ peer_id: 'host1', client_id: 'ch', role: 'host', display_name: 'DM' }],
      host_peer_id: 'host1'
    })
    socket.emits.length = 0
    useNetworkStore.getState().sendMessage('chat:message', { text: 'rolling' })
    const relay = socket.lastEmit('relay')
    expect(relay?.payload).toMatchObject({ target_peer_id: 'host1' })
  })

  it('host leaving the relay tears the cloud client down into a disconnected state', async () => {
    await useNetworkStore.getState().joinGame('ROOM42', 'Alice', 'cloud')
    // Learn the host from the relay's peers list (role:'host' → isHost:true).
    socket.fire('peers', {
      peers: [{ peer_id: 'host1', client_id: 'ch', role: 'host', display_name: 'DM' }],
      host_peer_id: 'host1'
    })
    expect(useNetworkStore.getState().peers.some((p) => p.isHost)).toBe(true)
    // The Pi relay reports the host socket dropped.
    socket.fire('peer-left', { peer_id: 'host1', was_host: true })
    const st = useNetworkStore.getState()
    expect(st.connectionState).toBe('disconnected')
    expect(st.role).toBe('none')
    expect(st.peers).toEqual([])
    expect(st.error).toBe('Host left the session')
    expect(st.connectionMode).toBe('p2p')
    // Relay socket was closed during teardown.
    expect(socket.disconnected).toBe(true)
  })

  it('a non-host peer leaving only removes that peer (client stays connected)', async () => {
    await useNetworkStore.getState().joinGame('ROOM42', 'Alice', 'cloud')
    socket.fire('peers', {
      peers: [
        { peer_id: 'host1', client_id: 'ch', role: 'host', display_name: 'DM' },
        { peer_id: 'p2', client_id: 'c2', role: 'player', display_name: 'Bob' }
      ],
      host_peer_id: 'host1'
    })
    socket.fire('peer-left', { peer_id: 'p2', was_host: false })
    const st = useNetworkStore.getState()
    expect(st.connectionState).toBe('connected')
    expect(st.role).toBe('client')
    expect(st.peers.map((p) => p.peerId)).not.toContain('p2')
    expect(st.peers.map((p) => p.peerId)).toContain('host1')
  })
})

// TR-1 — the cloud relay dispatches inbound through the store handler / GameAuthority
// directly, which bypasses the host-manager / client-manager `onMessage` buses that
// every UI bridge (chat, character-select/update, moderation, chat-timeout) subscribes
// to. The cloud paths now RE-EMIT each inbound frame onto those buses so the bridges
// fire exactly as they do over P2P. These tests pin that re-emit.
describe('network store — cloud TR-1 bridge re-emit', () => {
  function chatFrame(senderId: string): NetworkMessage {
    return {
      type: 'chat:message',
      payload: { message: 'hello', isSystem: false },
      senderId,
      senderName: senderId,
      timestamp: Date.now(),
      sequence: 1
    }
  }

  it('cloud CLIENT re-emits inbound frames onto the onClientMessage bus', async () => {
    const received: NetworkMessage[] = []
    const unsub = onClientMessage((m) => received.push(m))
    try {
      await useNetworkStore.getState().joinGame('ROOM42', 'Alice', 'cloud')
      socket.fire('message', { from_peer_id: 'host1', message: chatFrame('host1') })
      expect(received.some((m) => m.type === 'chat:message')).toBe(true)
    } finally {
      unsub()
    }
  })

  it('cloud HOST re-emits inbound peer frames onto the onHostMessage bus', async () => {
    const received: Array<{ type: string; from: string }> = []
    const unsub = onHostMessage((m, from) => received.push({ type: m.type, from }))
    try {
      await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
      socket.fire('peer-joined', { peer_id: 'p1', client_id: 'c1', role: 'player', display_name: 'Alice' })
      socket.fire('message', { from_peer_id: 'p1', message: chatFrame('p1') })
      expect(received.some((r) => r.type === 'chat:message' && r.from === 'p1')).toBe(true)
    } finally {
      unsub()
    }
  })
})

// SS-1 — a cloud DM must ship permission-FILTERED shard deltas to a joined cloud
// player (the per-recipient filter keys on the peer's clientId from the live peer
// list). This pins the cloud `getRecipients` → broadcaster → relay path end-to-end.
describe('network store — cloud SS-1 filtered shard delivery', () => {
  function makeFilteredBoxShard(name: string) {
    let value: { hp: number; secret?: string } = { hp: 10, secret: 'top' }
    const subs = new Set<(v: typeof value) => void>()
    const shard: Shard<typeof value> = {
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
      // Only a recipient whose clientId is 'priv' sees the secret; everyone else
      // (a normal cloud player) gets the stripped player view.
      permissionFilter: (v, clientId) => (clientId === 'priv' ? v : { hp: v.hp })
    }
    return {
      shard,
      set: (next: typeof value) => {
        value = next
        for (const cb of subs) cb(next)
      }
    }
  }

  it('relays a per-recipient stripped sync:delta to a joined cloud player', async () => {
    const { shard, set } = makeFilteredBoxShard('ss1-cloud')
    registerShard(shard)

    await useNetworkStore.getState().hostGame('DM', 'ROOM42', 'cloud')
    socket.fire('peer-joined', { peer_id: 'p1', client_id: 'c1', role: 'player', display_name: 'Alice' })

    vi.useFakeTimers()
    try {
      socket.emits.length = 0
      set({ hp: 9, secret: 'newtop' })
      // The cloud broadcaster coalesces with a 50ms window.
      vi.advanceTimersByTime(50)
    } finally {
      vi.useRealTimers()
    }

    const delta = socket.emits
      .filter((e) => e.event === 'relay')
      .map((e) => e.payload as { message: NetworkMessage; target_peer_id?: string })
      .find((p) => p.message.type === 'sync:delta' && (p.message.payload as { shard?: string }).shard === 'ss1-cloud')

    expect(delta).toBeDefined()
    // Delivered point-to-point to the joined player…
    expect(delta?.target_peer_id).toBe('p1')
    // …and the player NEVER receives the DM-only `secret`.
    const payload = delta?.message.payload as { delta: { kind: string; payload: { hp: number; secret?: string } } }
    expect(payload.delta.kind).toBe('replace')
    expect(payload.delta.payload).toEqual({ hp: 9 })
    expect(payload.delta.payload).not.toHaveProperty('secret')
  })
})
