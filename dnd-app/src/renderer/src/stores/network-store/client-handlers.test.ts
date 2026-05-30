import { describe, expect, it, vi } from 'vitest'
import type { NetworkMessage, PeerInfo } from '../../network'
import type { NetworkState } from './index'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('network client-handlers', () => {
  it('can be imported', async () => {
    const mod = await import('./client-handlers')
    expect(mod).toBeDefined()
  })

  it('exports handleClientMessage function', async () => {
    const mod = await import('./client-handlers')
    expect(mod.handleClientMessage).toBeDefined()
    expect(typeof mod.handleClientMessage).toBe('function')
  })
})

describe('handleClientMessage — dm:transfer-dm (Phase 30e)', () => {
  function peer(id: string, extra: Partial<PeerInfo> = {}): PeerInfo {
    return {
      peerId: id,
      clientId: id,
      role: 'player',
      displayName: id,
      characterId: null,
      characterName: null,
      isReady: true,
      isHost: false,
      ...extra
    }
  }

  it("sets the named peer's isDM, clears it on others, and updates localIsDM", async () => {
    const { handleClientMessage } = await import('./client-handlers')
    const { useLobbyStore } = await import('../use-lobby-store')

    // Seed lobby players so updatePlayer has something to update.
    useLobbyStore.setState({
      players: [
        {
          peerId: 'host',
          clientId: 'host',
          role: 'host',
          displayName: 'Host',
          characterId: null,
          characterName: null,
          isReady: true,
          isHost: true,
          isDM: true
        },
        {
          peerId: 'p2',
          clientId: 'p2',
          role: 'player',
          displayName: 'P2',
          characterId: null,
          characterName: null,
          isReady: true,
          isHost: false
        }
      ]
    })

    // Local store fake: localPeerId is p2 (so this client becomes the new DM).
    let peers: PeerInfo[] = [peer('host', { isHost: true, isDM: true }), peer('p2')]
    let localIsDM = false
    const get = (): NetworkState =>
      ({
        peers,
        localPeerId: 'p2',
        localIsDM,
        updatePeer: (peerId: string, updates: Partial<PeerInfo>) => {
          peers = peers.map((p) => (p.peerId === peerId ? { ...p, ...updates } : p))
        }
      }) as unknown as NetworkState
    const set = (partial: Partial<NetworkState> | ((s: NetworkState) => Partial<NetworkState>)): void => {
      const next = typeof partial === 'function' ? partial(get()) : partial
      if ('localIsDM' in next && typeof next.localIsDM === 'boolean') localIsDM = next.localIsDM
    }

    const message: NetworkMessage = {
      type: 'dm:transfer-dm',
      payload: { newDmPeerId: 'p2' },
      senderId: 'host',
      senderName: 'Host',
      timestamp: Date.now(),
      sequence: 0
    }
    handleClientMessage(message, get, set)

    expect(peers.find((p) => p.peerId === 'p2')?.isDM).toBe(true)
    expect(peers.find((p) => p.peerId === 'host')?.isDM).toBe(false)
    expect(localIsDM).toBe(true)

    const lobbyPlayers = useLobbyStore.getState().players
    expect(lobbyPlayers.find((p) => p.peerId === 'p2')?.isDM).toBe(true)
    expect(lobbyPlayers.find((p) => p.peerId === 'host')?.isDM).toBe(false)
  })

  it('leaves localIsDM false on a client that is not the new DM', async () => {
    const { handleClientMessage } = await import('./client-handlers')
    const { useLobbyStore } = await import('../use-lobby-store')
    useLobbyStore.setState({ players: [] })

    let peers: PeerInfo[] = [peer('host', { isHost: true, isDM: true }), peer('p2'), peer('p3')]
    let localIsDM = false
    const get = (): NetworkState =>
      ({
        peers,
        localPeerId: 'p3', // this client is NOT the new DM
        localIsDM,
        updatePeer: (peerId: string, updates: Partial<PeerInfo>) => {
          peers = peers.map((p) => (p.peerId === peerId ? { ...p, ...updates } : p))
        }
      }) as unknown as NetworkState
    const set = (partial: Partial<NetworkState> | ((s: NetworkState) => Partial<NetworkState>)): void => {
      const next = typeof partial === 'function' ? partial(get()) : partial
      if ('localIsDM' in next && typeof next.localIsDM === 'boolean') localIsDM = next.localIsDM
    }

    handleClientMessage(
      {
        type: 'dm:transfer-dm',
        payload: { newDmPeerId: 'p2' },
        senderId: 'host',
        senderName: 'Host',
        timestamp: Date.now(),
        sequence: 0
      },
      get,
      set
    )

    expect(peers.find((p) => p.peerId === 'p2')?.isDM).toBe(true)
    expect(localIsDM).toBe(false)
  })
})
