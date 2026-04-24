import { describe, expect, it, vi } from 'vitest'

vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn()
  }
}))

vi.mock('./peer-manager', () => ({
  getPeerId: vi.fn(() => 'host-peer-id')
}))

vi.mock('./schemas', () => ({
  validateNetworkMessage: vi.fn(() => ({ success: true }))
}))

vi.mock('./host-message-handlers', () => ({
  validateMessage: vi.fn(() => true),
  isClientAllowedMessageType: vi.fn(() => true),
  applyChatModeration: vi.fn(() => true)
}))

import type { HostStateAccessors } from './host-connection'
import { handleDisconnection, handleJoin, handleNewConnection } from './host-connection'
import type { NetworkMessage, PeerInfo } from './types'

function createMockState(overrides: Partial<HostStateAccessors> = {}): HostStateAccessors {
  return {
    connections: new Map(),
    peerInfoMap: new Map(),
    bannedPeers: new Set(),
    bannedNames: new Set(),
    chatMutedPeers: new Map(),
    lastHeartbeat: new Map(),
    messageRates: new Map(),
    getDisplayName: () => 'DM',
    getCampaignId: () => 'campaign-1',
    getModerationEnabled: () => false,
    getCustomBlockedWords: () => [],
    getGameStateProvider: () => null,
    router: { handle: vi.fn() },
    joinCallbacks: new Set(),
    leaveCallbacks: new Set(),
    messageCallbacks: new Set(),
    isRateLimited: vi.fn(() => false),
    isGlobalRateLimited: vi.fn(() => false),
    buildMessage: vi.fn(<T>(type: string, payload: T) => ({
      type,
      payload,
      senderId: 'host-peer-id',
      senderName: 'DM',
      timestamp: Date.now(),
      sequence: 0
    })) as HostStateAccessors['buildMessage'],
    broadcastMessage: vi.fn(),
    sendToPeer: vi.fn(),
    broadcastExcluding: vi.fn(),
    disconnectPeer: vi.fn(),
    persistBans: vi.fn(),
    getConnectedPeers: vi.fn(() => []),
    ...overrides
  }
}

function createMockConn(peerId: string) {
  return {
    peer: peerId,
    on: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
    open: true
  }
}

describe('handleNewConnection', () => {
  it('rejects banned peers immediately', () => {
    const conn = createMockConn('banned-peer')
    const state = createMockState({
      bannedPeers: new Set(['banned-peer'])
    })

    handleNewConnection(conn as never, state)

    expect(conn.close).toHaveBeenCalled()
    expect(conn.on).not.toHaveBeenCalled()
  })

  it('sets up event listeners for non-banned peers', () => {
    const conn = createMockConn('peer-1')
    const state = createMockState()

    handleNewConnection(conn as never, state)

    // Should have registered on('open'), on('data'), on('close'), on('error')
    const eventTypes = conn.on.mock.calls.map((c: any[]) => c[0])
    expect(eventTypes).toContain('open')
    expect(eventTypes).toContain('data')
    expect(eventTypes).toContain('close')
    expect(eventTypes).toContain('error')
  })

  it('handles rate-limited messages by dropping them', () => {
    const conn = createMockConn('peer-1')
    const state = createMockState({
      isRateLimited: vi.fn(() => true)
    })

    handleNewConnection(conn as never, state)

    // Find the 'data' handler
    const dataHandler = conn.on.mock.calls.find((c: any[]) => c[0] === 'data')?.[1]
    expect(dataHandler).toBeDefined()

    // Simulate receiving data
    const msg = JSON.stringify({ type: 'chat:message', payload: { message: 'spam' } })
    dataHandler(msg)

    // Router should NOT handle the message because it was rate-limited
    expect(state.router.handle).not.toHaveBeenCalled()
  })

  it('handles global rate-limited messages by dropping them', () => {
    const conn = createMockConn('peer-1')
    const state = createMockState({
      isGlobalRateLimited: vi.fn(() => true)
    })

    handleNewConnection(conn as never, state)

    const dataHandler = conn.on.mock.calls.find((c: any[]) => c[0] === 'data')?.[1]
    const msg = JSON.stringify({ type: 'chat:message', payload: { message: 'spam' } })
    dataHandler(msg)

    expect(state.router.handle).not.toHaveBeenCalled()
  })
})

describe('handleJoin', () => {
  it('registers a new peer and sends full state', () => {
    const conn = createMockConn('new-peer')
    const state = createMockState()
    const joinCb = vi.fn()
    state.joinCallbacks.add(joinCb)

    const joinMsg: NetworkMessage<{ displayName: string; characterId: string | null; characterName: string | null }> = {
      type: 'player:join',
      payload: { displayName: 'Alice', characterId: 'char-1', characterName: 'Elara' },
      senderId: 'new-peer',
      senderName: 'Alice',
      timestamp: Date.now(),
      sequence: 0
    }

    handleJoin('new-peer', conn as never, joinMsg, state)

    expect(state.connections.has('new-peer')).toBe(true)
    expect(state.peerInfoMap.has('new-peer')).toBe(true)
    expect(state.lastHeartbeat.has('new-peer')).toBe(true)
    expect(state.sendToPeer).toHaveBeenCalledWith('new-peer', expect.any(Object))
    expect(state.broadcastExcluding).toHaveBeenCalled()
    expect(joinCb).toHaveBeenCalledWith(
      expect.objectContaining({
        peerId: 'new-peer',
        displayName: 'Alice'
      })
    )
  })

  it('truncates display names exceeding MAX_DISPLAY_NAME_LENGTH', () => {
    const conn = createMockConn('new-peer')
    const state = createMockState()

    const joinMsg: NetworkMessage<{ displayName: string; characterId: string | null; characterName: string | null }> = {
      type: 'player:join',
      payload: { displayName: 'A'.repeat(100), characterId: null, characterName: null },
      senderId: 'new-peer',
      senderName: 'Long Name',
      timestamp: Date.now(),
      sequence: 0
    }

    handleJoin('new-peer', conn as never, joinMsg, state)

    const peerInfo = state.peerInfoMap.get('new-peer')
    expect(peerInfo).toBeDefined()
    // MAX_DISPLAY_NAME_LENGTH is 32
    expect(peerInfo!.displayName.length).toBeLessThanOrEqual(32)
  })

  it('rejects peers with banned display names', () => {
    const conn = createMockConn('new-peer')
    const state = createMockState({
      bannedNames: new Set(['badplayer'])
    })

    const joinMsg: NetworkMessage<{ displayName: string; characterId: string | null; characterName: string | null }> = {
      type: 'player:join',
      payload: { displayName: 'BadPlayer', characterId: null, characterName: null },
      senderId: 'new-peer',
      senderName: 'BadPlayer',
      timestamp: Date.now(),
      sequence: 0
    }

    handleJoin('new-peer', conn as never, joinMsg, state)

    expect(state.bannedPeers.has('new-peer')).toBe(true)
    expect(state.persistBans).toHaveBeenCalled()
    expect(state.disconnectPeer).toHaveBeenCalled()
    expect(state.peerInfoMap.has('new-peer')).toBe(false)
  })

  it('uses "Unknown" when displayName is missing', () => {
    const conn = createMockConn('new-peer')
    const state = createMockState()

    const joinMsg: NetworkMessage<{ displayName: string; characterId: string | null; characterName: string | null }> = {
      type: 'player:join',
      payload: { displayName: undefined as unknown as string, characterId: null, characterName: null },
      senderId: 'new-peer',
      senderName: '',
      timestamp: Date.now(),
      sequence: 0
    }

    handleJoin('new-peer', conn as never, joinMsg, state)

    const peerInfo = state.peerInfoMap.get('new-peer')
    expect(peerInfo?.displayName).toBe('Unknown')
  })

  it('includes game state from provider when available', () => {
    const conn = createMockConn('new-peer')
    const gameStateData = { maps: [], round: 1 }
    const state = createMockState({
      getGameStateProvider: () => () => gameStateData
    })

    const joinMsg: NetworkMessage<{ displayName: string; characterId: string | null; characterName: string | null }> = {
      type: 'player:join',
      payload: { displayName: 'Alice', characterId: null, characterName: null },
      senderId: 'new-peer',
      senderName: 'Alice',
      timestamp: Date.now(),
      sequence: 0
    }

    handleJoin('new-peer', conn as never, joinMsg, state)

    // buildMessage should have been called with game:state-full and a payload including gameState
    expect(state.buildMessage).toHaveBeenCalledWith(
      'game:state-full',
      expect.objectContaining({
        gameState: gameStateData
      })
    )
  })

  it('handles errors from game state provider gracefully', () => {
    const conn = createMockConn('new-peer')
    const state = createMockState({
      getGameStateProvider: () => () => {
        throw new Error('Provider error')
      }
    })

    const joinMsg: NetworkMessage<{ displayName: string; characterId: string | null; characterName: string | null }> = {
      type: 'player:join',
      payload: { displayName: 'Alice', characterId: null, characterName: null },
      senderId: 'new-peer',
      senderName: 'Alice',
      timestamp: Date.now(),
      sequence: 0
    }

    expect(() => handleJoin('new-peer', conn as never, joinMsg, state)).not.toThrow()
    expect(state.sendToPeer).toHaveBeenCalled()
  })
})

describe('handleDisconnection', () => {
  it('removes peer from all state maps', () => {
    const state = createMockState()
    const peerInfo: PeerInfo = {
      peerId: 'peer-1',
      displayName: 'Alice',
      characterId: null,
      characterName: null,
      isReady: true,
      isHost: false
    }
    state.connections.set('peer-1', {} as never)
    state.peerInfoMap.set('peer-1', peerInfo)
    state.messageRates.set('peer-1', [Date.now()])
    state.lastHeartbeat.set('peer-1', Date.now())

    handleDisconnection('peer-1', state)

    expect(state.connections.has('peer-1')).toBe(false)
    expect(state.peerInfoMap.has('peer-1')).toBe(false)
    expect(state.messageRates.has('peer-1')).toBe(false)
    expect(state.lastHeartbeat.has('peer-1')).toBe(false)
  })

  it('broadcasts a player:leave message', () => {
    const state = createMockState()
    state.peerInfoMap.set('peer-1', {
      peerId: 'peer-1',
      displayName: 'Alice',
      characterId: null,
      characterName: null,
      isReady: true,
      isHost: false
    })

    handleDisconnection('peer-1', state)

    expect(state.broadcastMessage).toHaveBeenCalled()
  })

  it('calls leave callbacks with peer info', () => {
    const state = createMockState()
    const leaveCb = vi.fn()
    state.leaveCallbacks.add(leaveCb)
    const peerInfo: PeerInfo = {
      peerId: 'peer-1',
      displayName: 'Alice',
      characterId: null,
      characterName: null,
      isReady: true,
      isHost: false
    }
    state.peerInfoMap.set('peer-1', peerInfo)

    handleDisconnection('peer-1', state)

    expect(leaveCb).toHaveBeenCalledWith(peerInfo)
  })

  it('handles unknown peer gracefully', () => {
    const state = createMockState()

    expect(() => handleDisconnection('unknown-peer', state)).not.toThrow()
    expect(state.broadcastMessage).not.toHaveBeenCalled()
  })

  it('catches errors in leave callbacks', () => {
    const state = createMockState()
    const badCb = vi.fn(() => {
      throw new Error('Callback error')
    })
    state.leaveCallbacks.add(badCb)
    state.peerInfoMap.set('peer-1', {
      peerId: 'peer-1',
      displayName: 'Alice',
      characterId: null,
      characterName: null,
      isReady: true,
      isHost: false
    })

    expect(() => handleDisconnection('peer-1', state)).not.toThrow()
    expect(badCb).toHaveBeenCalled()
  })
})
