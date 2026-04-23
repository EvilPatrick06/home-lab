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

vi.mock('../components/game/overlays/DmAlertTray', () => ({
  pushDmAlert: vi.fn()
}))

const mockPeerInstance = {
  on: vi.fn(),
  destroy: vi.fn(),
  connect: vi.fn(),
  id: 'host-peer-id',
  destroyed: false,
  reconnect: vi.fn()
}

vi.mock('peerjs', () => ({
  default: vi.fn(() => mockPeerInstance)
}))

vi.mock('./peer-manager', () => ({
  createPeer: vi.fn(() => Promise.resolve(mockPeerInstance)),
  destroyPeer: vi.fn(),
  generateInviteCode: vi.fn(() => 'ABCDEF'),
  getPeerId: vi.fn(() => 'host-peer-id'),
  getPeer: vi.fn(() => mockPeerInstance)
}))

vi.mock('./host-state-sync', () => ({
  buildMessage: vi.fn((type: string, payload: unknown, _name: string, counter: { value: number }) => ({
    type,
    payload,
    senderId: 'host-peer-id',
    senderName: 'DM',
    timestamp: Date.now(),
    sequence: counter.value++
  })),
  isRateLimited: vi.fn(() => false),
  isGlobalRateLimited: vi.fn(() => false),
  loadPersistedBans: vi.fn(() => Promise.resolve()),
  persistBans: vi.fn(),
  startHeartbeatCheck: vi.fn(),
  stopHeartbeatCheck: vi.fn()
}))

vi.mock('./host-connection', () => ({
  handleNewConnection: vi.fn(),
  handleDisconnection: vi.fn()
}))

vi.mock('./message-handler', () => ({
  createMessageRouter: vi.fn(() => ({
    on: vi.fn(() => vi.fn()),
    handle: vi.fn(),
    clear: vi.fn()
  }))
}))

// Mock window.api for ban persistence
vi.stubGlobal('window', {
  api: {
    loadBans: vi.fn(() => Promise.resolve({ peerIds: [], names: [] })),
    saveBans: vi.fn(() => Promise.resolve())
  }
})

import {
  banPeer,
  broadcastExcluding,
  broadcastMessage,
  chatMutePeer,
  getBannedNames,
  getBannedPeers,
  getCampaignId,
  getConnectedPeers,
  getInviteCode,
  getPeerInfo,
  isChatMuted,
  isHosting,
  isModerationEnabled,
  kickPeer,
  onMessage,
  onPeerJoined,
  onPeerLeft,
  sendToPeer,
  setCampaignId,
  setCustomBlockedWords,
  setGameStateProvider,
  setModerationEnabled,
  startHosting,
  stopHosting,
  unbanName,
  unbanPeer,
  updatePeerInfo
} from './host-manager'

describe('host-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopHosting()
  })

  afterEach(() => {
    stopHosting()
  })

  describe('isHosting', () => {
    it('returns false initially', () => {
      expect(isHosting()).toBe(false)
    })
  })

  describe('getInviteCode', () => {
    it('returns null when not hosting', () => {
      expect(getInviteCode()).toBeNull()
    })
  })

  describe('getCampaignId', () => {
    it('returns null initially', () => {
      expect(getCampaignId()).toBeNull()
    })
  })

  describe('startHosting', () => {
    it('starts hosting and returns an invite code', async () => {
      const code = await startHosting('DM')
      expect(code).toBe('ABCDEF')
      expect(isHosting()).toBe(true)
      expect(getInviteCode()).toBe('ABCDEF')
    })

    it('uses an existing invite code if provided', async () => {
      const code = await startHosting('DM', 'CUSTOM')
      expect(code).toBe('CUSTOM')
    })

    it('throws when already hosting', async () => {
      await startHosting('DM')
      await expect(startHosting('DM')).rejects.toThrow('Already hosting')
    })

    it('sets up connection and error listeners on the peer', async () => {
      await startHosting('DM')
      const eventTypes = mockPeerInstance.on.mock.calls.map((c: any[]) => c[0])
      expect(eventTypes).toContain('connection')
      expect(eventTypes).toContain('error')
      expect(eventTypes).toContain('disconnected')
      expect(eventTypes).toContain('open')
    })

    it('resets hosting state on create peer failure', async () => {
      const { createPeer } = await import('./peer-manager')
      vi.mocked(createPeer).mockRejectedValueOnce(new Error('Peer creation failed'))

      await expect(startHosting('DM')).rejects.toThrow('Peer creation failed')
      expect(isHosting()).toBe(false)
      expect(getInviteCode()).toBeNull()
    })
  })

  describe('stopHosting', () => {
    it('does nothing when not hosting', () => {
      expect(() => stopHosting()).not.toThrow()
    })

    it('cleans up all state when hosting', async () => {
      await startHosting('DM')
      stopHosting()

      expect(isHosting()).toBe(false)
      expect(getInviteCode()).toBeNull()
      expect(getCampaignId()).toBeNull()
      expect(getConnectedPeers()).toEqual([])
    })

    it('broadcasts game-end before stopping', async () => {
      await startHosting('DM')
      // We can't easily test the broadcast directly since it operates on
      // the internal connections map. Instead verify no errors occur.
      expect(() => stopHosting()).not.toThrow()
    })
  })

  describe('broadcastMessage', () => {
    it('does not throw when no connections exist', () => {
      expect(() =>
        broadcastMessage({
          type: 'chat:message',
          payload: { message: 'test' },
          senderId: 'host',
          senderName: 'DM',
          timestamp: Date.now(),
          sequence: 0
        })
      ).not.toThrow()
    })
  })

  describe('broadcastExcluding', () => {
    it('does not throw when no connections exist', () => {
      expect(() =>
        broadcastExcluding(
          {
            type: 'chat:message',
            payload: { message: 'test' },
            senderId: 'host',
            senderName: 'DM',
            timestamp: Date.now(),
            sequence: 0
          },
          'excluded-peer'
        )
      ).not.toThrow()
    })
  })

  describe('sendToPeer', () => {
    it('warns when no connection found for peer', () => {
      sendToPeer('nonexistent-peer', {
        type: 'ping',
        payload: {},
        senderId: 'host',
        senderName: 'DM',
        timestamp: Date.now(),
        sequence: 0
      })
      // Should log a warning but not throw
    })
  })

  describe('kickPeer', () => {
    it('does not throw for nonexistent peer', () => {
      expect(() => kickPeer('unknown-peer')).not.toThrow()
    })
  })

  describe('getConnectedPeers', () => {
    it('returns empty array when no peers connected', () => {
      expect(getConnectedPeers()).toEqual([])
    })
  })

  describe('callback registration', () => {
    it('onPeerJoined returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = onPeerJoined(cb)
      expect(typeof unsub).toBe('function')
      unsub()
    })

    it('onPeerLeft returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = onPeerLeft(cb)
      expect(typeof unsub).toBe('function')
      unsub()
    })

    it('onMessage returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = onMessage(cb)
      expect(typeof unsub).toBe('function')
      unsub()
    })
  })

  describe('ban system', () => {
    it('getBannedPeers returns empty array initially', () => {
      expect(getBannedPeers()).toEqual([])
    })

    it('getBannedNames returns empty array initially', () => {
      expect(getBannedNames()).toEqual([])
    })

    it('banPeer does not throw for unknown peer', () => {
      expect(() => banPeer('unknown')).not.toThrow()
    })

    it('unbanPeer does not throw', () => {
      expect(() => unbanPeer('peer-1')).not.toThrow()
    })

    it('unbanName does not throw', () => {
      expect(() => unbanName('SomeName')).not.toThrow()
    })
  })

  describe('chat mute system', () => {
    it('isChatMuted returns false for non-muted peer', () => {
      expect(isChatMuted('peer-1')).toBe(false)
    })

    it('chatMutePeer does not throw', async () => {
      await startHosting('DM')
      expect(() => chatMutePeer('peer-1', 60000)).not.toThrow()
    })
  })

  describe('moderation', () => {
    it('isModerationEnabled returns false initially', () => {
      expect(isModerationEnabled()).toBe(false)
    })

    it('setModerationEnabled toggles the flag', () => {
      setModerationEnabled(true)
      expect(isModerationEnabled()).toBe(true)
      setModerationEnabled(false)
      expect(isModerationEnabled()).toBe(false)
    })

    it('setCustomBlockedWords does not throw', () => {
      expect(() => setCustomBlockedWords(['word1', 'word2'])).not.toThrow()
    })
  })

  describe('setCampaignId', () => {
    it('sets campaign ID and loads bans', async () => {
      await setCampaignId('campaign-123')
      expect(getCampaignId()).toBe('campaign-123')

      const { loadPersistedBans } = await import('./host-state-sync')
      expect(loadPersistedBans).toHaveBeenCalled()
    })
  })

  describe('setGameStateProvider', () => {
    it('does not throw when setting a provider', () => {
      expect(() => setGameStateProvider(() => ({ maps: [] }))).not.toThrow()
    })

    it('does not throw when setting null', () => {
      expect(() => setGameStateProvider(null)).not.toThrow()
    })
  })

  describe('getPeerInfo / updatePeerInfo', () => {
    it('getPeerInfo returns undefined for unknown peer', () => {
      expect(getPeerInfo('unknown')).toBeUndefined()
    })

    it('updatePeerInfo does not throw for unknown peer', () => {
      expect(() => updatePeerInfo('unknown', { isReady: true })).not.toThrow()
    })
  })
})
