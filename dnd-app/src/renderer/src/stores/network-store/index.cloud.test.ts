import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkMessage } from '../../network'
import { getPeerId } from '../../network'
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
