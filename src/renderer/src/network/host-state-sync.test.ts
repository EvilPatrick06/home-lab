import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  getPeerId: vi.fn(() => 'test-peer-id')
}))

// Mock window.api for ban persistence
const mockLoadBans = vi.fn()
const mockSaveBans = vi.fn()
vi.stubGlobal('window', {
  api: {
    loadBans: mockLoadBans,
    saveBans: mockSaveBans
  }
})

import type { SyncStateAccessors } from './host-state-sync'
import {
  buildMessage,
  isGlobalRateLimited,
  isRateLimited,
  loadPersistedBans,
  persistBans,
  startHeartbeatCheck,
  stopHeartbeatCheck
} from './host-state-sync'

describe('buildMessage', () => {
  it('creates a message with the correct structure', () => {
    const counter = { value: 0 }
    const msg = buildMessage('chat:message', { message: 'hello' }, 'Alice', counter)

    expect(msg.type).toBe('chat:message')
    expect(msg.payload).toEqual({ message: 'hello' })
    expect(msg.senderId).toBe('test-peer-id')
    expect(msg.senderName).toBe('Alice')
    expect(typeof msg.timestamp).toBe('number')
    expect(msg.sequence).toBe(0)
  })

  it('increments the sequence counter on each call', () => {
    const counter = { value: 0 }
    buildMessage('ping', {}, 'Host', counter)
    buildMessage('pong', {}, 'Host', counter)
    const msg = buildMessage('chat:message', { message: 'test' }, 'Host', counter)

    expect(msg.sequence).toBe(2)
    expect(counter.value).toBe(3)
  })

  it('uses empty string for senderId when getPeerId returns null', async () => {
    const { getPeerId } = await import('./peer-manager')
    vi.mocked(getPeerId).mockReturnValueOnce(null)

    const counter = { value: 0 }
    const msg = buildMessage('ping', {}, 'Host', counter)
    expect(msg.senderId).toBe('')
  })
})

describe('isRateLimited', () => {
  it('returns false when under the rate limit', () => {
    const rates = new Map<string, number[]>()
    const result = isRateLimited('peer-1', rates)
    expect(result).toBe(false)
  })

  it('tracks timestamps for each peer', () => {
    const rates = new Map<string, number[]>()
    isRateLimited('peer-1', rates)
    expect(rates.has('peer-1')).toBe(true)
    expect(rates.get('peer-1')!.length).toBe(1)
  })

  it('returns true when exceeding MAX_MESSAGES_PER_WINDOW', () => {
    const rates = new Map<string, number[]>()
    // MAX_MESSAGES_PER_WINDOW is 10
    for (let i = 0; i < 10; i++) {
      isRateLimited('peer-1', rates)
    }
    // The 11th call should be rate limited
    const result = isRateLimited('peer-1', rates)
    expect(result).toBe(true)
  })

  it('tracks separate rates for different peers', () => {
    const rates = new Map<string, number[]>()
    for (let i = 0; i < 10; i++) {
      isRateLimited('peer-1', rates)
    }
    // peer-2 should not be rate limited
    expect(isRateLimited('peer-2', rates)).toBe(false)
  })
})

describe('isGlobalRateLimited', () => {
  it('returns false when under the global limit', () => {
    const ref = { value: [] as number[] }
    const result = isGlobalRateLimited(ref)
    expect(result).toBe(false)
  })

  it('adds a timestamp on each call', () => {
    const ref = { value: [] as number[] }
    isGlobalRateLimited(ref)
    expect(ref.value.length).toBe(1)
    isGlobalRateLimited(ref)
    expect(ref.value.length).toBe(2)
  })

  it('returns true when exceeding MAX_GLOBAL_MESSAGES_PER_SECOND', () => {
    const ref = { value: [] as number[] }
    // MAX_GLOBAL_MESSAGES_PER_SECOND is 200
    for (let i = 0; i < 200; i++) {
      isGlobalRateLimited(ref)
    }
    const result = isGlobalRateLimited(ref)
    expect(result).toBe(true)
  })
})

describe('loadPersistedBans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads peer ID bans and name bans from API', async () => {
    mockLoadBans.mockResolvedValue({
      peerIds: ['banned-1', 'banned-2'],
      names: ['BadPlayer']
    })

    const bannedPeers = new Set<string>()
    const bannedNames = new Set<string>()
    const ref = { value: false }

    await loadPersistedBans('campaign-1', bannedPeers, bannedNames, ref)

    expect(bannedPeers.has('banned-1')).toBe(true)
    expect(bannedPeers.has('banned-2')).toBe(true)
    expect(bannedNames.has('badplayer')).toBe(true) // lowercased
    expect(ref.value).toBe(true)
  })

  it('skips loading if bans already loaded', async () => {
    const bannedPeers = new Set<string>()
    const bannedNames = new Set<string>()
    const ref = { value: true }

    await loadPersistedBans('campaign-1', bannedPeers, bannedNames, ref)

    expect(mockLoadBans).not.toHaveBeenCalled()
  })

  it('handles API errors gracefully', async () => {
    mockLoadBans.mockRejectedValue(new Error('Storage error'))

    const bannedPeers = new Set<string>()
    const bannedNames = new Set<string>()
    const ref = { value: false }

    await expect(loadPersistedBans('campaign-1', bannedPeers, bannedNames, ref)).resolves.not.toThrow()
    expect(ref.value).toBe(false)
  })

  it('handles empty ban lists', async () => {
    mockLoadBans.mockResolvedValue({ peerIds: [], names: [] })

    const bannedPeers = new Set<string>()
    const bannedNames = new Set<string>()
    const ref = { value: false }

    await loadPersistedBans('campaign-1', bannedPeers, bannedNames, ref)

    expect(bannedPeers.size).toBe(0)
    expect(bannedNames.size).toBe(0)
    expect(ref.value).toBe(true)
  })
})

describe('persistBans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves bans via API', () => {
    mockSaveBans.mockResolvedValue(undefined)

    const bannedPeers = new Set(['peer-1', 'peer-2'])
    const bannedNames = new Set(['badplayer'])

    persistBans('campaign-1', bannedPeers, bannedNames)

    expect(mockSaveBans).toHaveBeenCalledWith('campaign-1', {
      peerIds: ['peer-1', 'peer-2'],
      names: ['badplayer']
    })
  })

  it('does nothing when campaignId is null', () => {
    persistBans(null, new Set(), new Set())
    expect(mockSaveBans).not.toHaveBeenCalled()
  })

  it('does not throw when saveBans rejects', () => {
    mockSaveBans.mockRejectedValue(new Error('Write error'))
    expect(() => {
      persistBans('campaign-1', new Set(['peer-1']), new Set())
    }).not.toThrow()
  })
})

describe('heartbeat check', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopHeartbeatCheck()
  })

  afterEach(() => {
    stopHeartbeatCheck()
    vi.useRealTimers()
  })

  it('startHeartbeatCheck starts an interval', () => {
    const state: SyncStateAccessors = {
      connections: new Map(),
      peerInfoMap: new Map(),
      lastHeartbeat: new Map(),
      messageCallbacks: new Set(),
      buildMessage: vi.fn(),
      handleDisconnection: vi.fn()
    }

    startHeartbeatCheck(state)
    // Should not throw and should set up the interval
    stopHeartbeatCheck()
  })

  it('stopHeartbeatCheck clears the interval', () => {
    const state: SyncStateAccessors = {
      connections: new Map(),
      peerInfoMap: new Map(),
      lastHeartbeat: new Map(),
      messageCallbacks: new Set(),
      buildMessage: vi.fn(),
      handleDisconnection: vi.fn()
    }

    startHeartbeatCheck(state)
    stopHeartbeatCheck()
    // Calling stop again should be safe
    stopHeartbeatCheck()
  })

  it('removes stale peers after HEARTBEAT_REMOVE_MS', () => {
    const mockConn = { close: vi.fn() }
    const connections = new Map([['stale-peer', mockConn as never]])
    const peerInfoMap = new Map()
    const lastHeartbeat = new Map([['stale-peer', Date.now() - 130_000]]) // 130s ago, > 120s threshold
    const handleDisconnection = vi.fn()

    const state: SyncStateAccessors = {
      connections,
      peerInfoMap,
      lastHeartbeat,
      messageCallbacks: new Set(),
      buildMessage: vi.fn(),
      handleDisconnection
    }

    startHeartbeatCheck(state)
    vi.advanceTimersByTime(10_000) // Trigger the interval

    expect(handleDisconnection).toHaveBeenCalledWith('stale-peer')
    expect(mockConn.close).toHaveBeenCalled()
    expect(lastHeartbeat.has('stale-peer')).toBe(false)
  })

  it('marks peers as disconnected after HEARTBEAT_TIMEOUT_MS but before HEARTBEAT_REMOVE_MS', () => {
    const peerInfo = {
      peerId: 'timeout-peer',
      displayName: 'Bob',
      isHost: false,
      isReady: false,
      characterId: null,
      characterName: null
    }
    const peerInfoMap = new Map([['timeout-peer', peerInfo]])
    const lastHeartbeat = new Map([['timeout-peer', Date.now() - 50_000]]) // 50s ago, > 45s timeout but < 120s remove
    const buildMessageFn = vi.fn().mockReturnValue({ type: 'player:leave', payload: {} })
    const cb = vi.fn()

    const state: SyncStateAccessors = {
      connections: new Map(),
      peerInfoMap,
      lastHeartbeat,
      messageCallbacks: new Set([cb]),
      buildMessage: buildMessageFn,
      handleDisconnection: vi.fn()
    }

    startHeartbeatCheck(state)
    vi.advanceTimersByTime(10_000)

    expect(cb).toHaveBeenCalled()
    // The peer should be marked as disconnected
    const updated = peerInfoMap.get('timeout-peer')
    expect(updated).toBeDefined()
  })

  it('does not fire callbacks for already-disconnected peers', () => {
    const peerInfo = {
      peerId: 'timeout-peer',
      displayName: 'Bob',
      isHost: false,
      isReady: false,
      characterId: null,
      characterName: null,
      isDisconnected: true
    }
    const peerInfoMap = new Map([['timeout-peer', peerInfo as never]])
    const lastHeartbeat = new Map([['timeout-peer', Date.now() - 50_000]])
    const cb = vi.fn()

    const state: SyncStateAccessors = {
      connections: new Map(),
      peerInfoMap,
      lastHeartbeat,
      messageCallbacks: new Set([cb]),
      buildMessage: vi.fn(),
      handleDisconnection: vi.fn()
    }

    startHeartbeatCheck(state)
    vi.advanceTimersByTime(10_000)

    expect(cb).not.toHaveBeenCalled()
  })
})
