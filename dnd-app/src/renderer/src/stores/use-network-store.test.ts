import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import type { RelaySocket } from '../network/transport/websocket-transport'
import { useNetworkStore } from './network-store'
import { __setCloudSocketFactoryForTests } from './network-store/cloud-session'

describe('useNetworkStore', () => {
  it('can be imported', async () => {
    const mod = await import('./network-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useNetworkStore).toBe('function')
  })

  it('store has network state properties', () => {
    // NetworkState is a type-only export (erased at runtime)
    // so we verify the store state shape instead
    const state = useNetworkStore.getState()
    expect(typeof state.role).toBe('string')
    expect(typeof state.connectionState).toBe('string')
  })

  it('has expected initial state shape', () => {
    const state = useNetworkStore.getState()
    expect(state).toHaveProperty('role')
    expect(state).toHaveProperty('connectionState')
    expect(state).toHaveProperty('inviteCode')
    expect(state).toHaveProperty('campaignId')
    expect(state).toHaveProperty('localPeerId')
    expect(state).toHaveProperty('displayName')
    expect(state).toHaveProperty('peers')
    expect(state).toHaveProperty('error')
    expect(state).toHaveProperty('disconnectReason')
    expect(state).toHaveProperty('latencyMs')
  })

  it('has expected initial state values', () => {
    const state = useNetworkStore.getState()
    expect(state.role).toBe('none')
    expect(state.connectionState).toBe('disconnected')
    expect(state.inviteCode).toBeNull()
    expect(state.campaignId).toBeNull()
    expect(state.localPeerId).toBeNull()
    expect(state.displayName).toBe('')
    expect(state.peers).toEqual([])
    expect(state.error).toBeNull()
    expect(state.disconnectReason).toBeNull()
    expect(state.latencyMs).toBeNull()
  })

  it('has expected actions', () => {
    const state = useNetworkStore.getState()
    expect(typeof state.hostGame).toBe('function')
    expect(typeof state.stopHosting).toBe('function')
    expect(typeof state.kickPlayer).toBe('function')
    expect(typeof state.joinGame).toBe('function')
    expect(typeof state.disconnect).toBe('function')
    expect(typeof state.sendMessage).toBe('function')
    expect(typeof state.setDisplayName).toBe('function')
    expect(typeof state.updatePeer).toBe('function')
    expect(typeof state.removePeer).toBe('function')
    expect(typeof state.addPeer).toBe('function')
    expect(typeof state.setConnectionState).toBe('function')
    expect(typeof state.setError).toBe('function')
    expect(typeof state.clearDisconnectReason).toBe('function')
  })
})

// ── Phase R3b — cloud host-migration ─────────────────────────────────────

/** Fake RelaySocket capturing emits + letting the test fire inbound relay events. */
function makeFakeSocket() {
  const handlers = new Map<string, (p?: unknown) => void>()
  const emits: Array<{ event: string; payload: unknown }> = []
  const socket: RelaySocket = {
    on: (e, l) => handlers.set(e, l),
    emit: (e, p) => emits.push({ event: e, payload: p }),
    disconnect: () => {}
  }
  return { socket, emits, fire: (e: string, p?: unknown) => handlers.get(e)?.(p) }
}

describe('useNetworkStore cloud host-migration', () => {
  let fake: ReturnType<typeof makeFakeSocket>

  beforeEach(() => {
    fake = makeFakeSocket()
    __setCloudSocketFactoryForTests(() => fake.socket)
    useNetworkStore.setState({
      role: 'none',
      connectionState: 'disconnected',
      peers: [],
      localPeerId: null,
      localIsDM: false,
      inviteCode: null,
      connectionMode: 'p2p',
      error: null,
      disconnectReason: null
    })
  })

  afterEach(() => {
    try {
      useNetworkStore.getState().disconnect()
    } catch {
      /* best-effort teardown */
    }
    __setCloudSocketFactoryForTests(null)
  })

  async function joinCloudWithHostPresent(extraPeers: Array<Record<string, unknown>> = []) {
    await useNetworkStore.getState().joinGame('ROOM', 'Alice', 'cloud')
    fake.fire('peers', {
      peers: [{ peer_id: 'oldhost', client_id: 'c-host', role: 'host', display_name: 'DM' }, ...extraPeers],
      host_peer_id: 'oldhost'
    })
  }

  it('promotes THIS client to cloud host when the relay re-elects it', async () => {
    await joinCloudWithHostPresent()
    const myId = useNetworkStore.getState().localPeerId
    expect(useNetworkStore.getState().peers.some((p) => p.peerId === 'oldhost' && p.isHost)).toBe(true)

    fake.fire('host-migrated', { old_host_peer_id: 'oldhost', new_host_peer_id: myId })

    const s = useNetworkStore.getState()
    expect(s.role).toBe('host')
    expect(s.localIsDM).toBe(true)
    expect(s.connectionState).toBe('connected')
    // The departed host is dropped from the peer list.
    expect(s.peers.some((p) => p.peerId === 'oldhost')).toBe(false)
  })

  it('retargets the host pointer (stays client) when another co-DM is elected', async () => {
    await joinCloudWithHostPresent([{ peer_id: 'codm2', client_id: 'c-2', role: 'player', display_name: 'Bob' }])

    fake.fire('host-migrated', { old_host_peer_id: 'oldhost', new_host_peer_id: 'codm2' })

    const s = useNetworkStore.getState()
    expect(s.role).toBe('client')
    expect(s.localIsDM).toBe(false)
    expect(s.peers.find((p) => p.peerId === 'codm2')?.isHost).toBe(true)
    expect(s.peers.some((p) => p.peerId === 'oldhost')).toBe(false)
  })

  it('tears down when the host leaves with no co-DM (bare peer-left, no migration)', async () => {
    await joinCloudWithHostPresent()

    fake.fire('peer-left', { peer_id: 'oldhost', was_host: true })

    const s = useNetworkStore.getState()
    expect(s.role).toBe('none')
    expect(s.connectionState).toBe('disconnected')
    expect(s.error).toBe('Host left the session')
  })
})
