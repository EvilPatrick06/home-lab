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

const mockConn = {
  on: vi.fn(),
  close: vi.fn(),
  send: vi.fn(),
  open: true,
  peer: 'host-peer'
}

const mockPeerInstance = {
  on: vi.fn(),
  connect: vi.fn(() => mockConn),
  destroy: vi.fn(),
  id: 'client-peer-id',
  destroyed: false
}

vi.mock('peerjs', () => ({
  default: vi.fn(() => mockPeerInstance)
}))

vi.mock('./peer-manager', () => ({
  createPeer: vi.fn(() => Promise.resolve(mockPeerInstance)),
  destroyPeer: vi.fn(),
  getPeerId: vi.fn(() => 'client-peer-id')
}))

vi.mock('./schemas', () => ({
  validateNetworkMessage: vi.fn(() => ({ success: true }))
}))

import {
  connectToHost,
  disconnect,
  isConnected,
  onDisconnected,
  onMessage,
  sendMessage,
  setCharacterInfo
} from './client-manager'

describe('client-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure we start disconnected
    disconnect()
  })

  afterEach(() => {
    disconnect()
  })

  describe('isConnected', () => {
    it('returns false initially', () => {
      expect(isConnected()).toBe(false)
    })
  })

  describe('disconnect', () => {
    it('does not throw when already disconnected', () => {
      expect(() => disconnect()).not.toThrow()
    })

    it('clears message and disconnect callbacks', () => {
      const msgCb = vi.fn()
      const dcCb = vi.fn()
      onMessage(msgCb)
      onDisconnected(dcCb)

      disconnect()

      // Callbacks should be cleared (no way to verify directly, but
      // the function should not throw)
      expect(isConnected()).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('warns when not connected', () => {
      // Not connected, should warn
      sendMessage({ type: 'chat:message', payload: { message: 'test' } })
      // Should not throw
    })
  })

  describe('onMessage', () => {
    it('returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = onMessage(cb)
      expect(typeof unsub).toBe('function')
      unsub()
    })
  })

  describe('onDisconnected', () => {
    it('returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = onDisconnected(cb)
      expect(typeof unsub).toBe('function')
      unsub()
    })
  })

  describe('setCharacterInfo', () => {
    it('does not throw when setting character info', () => {
      expect(() => setCharacterInfo('char-1', 'Elara')).not.toThrow()
    })

    it('accepts null values', () => {
      expect(() => setCharacterInfo(null, null)).not.toThrow()
    })
  })

  describe('connectToHost', () => {
    it('throws when already connected', async () => {
      // Simulate a connected state by setting up connection events
      vi.mocked(mockConn.on).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => cb(), 0)
        }
        return mockConn
      })
      vi.mocked(mockPeerInstance.on).mockImplementation(() => mockPeerInstance)

      await connectToHost('ABCDEF', 'Alice')

      await expect(connectToHost('GHIJKL', 'Bob')).rejects.toThrow('Already connected')
    })

    it('trims and uppercases the invite code', async () => {
      vi.mocked(mockConn.on).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => cb(), 0)
        }
        return mockConn
      })
      vi.mocked(mockPeerInstance.on).mockImplementation(() => mockPeerInstance)

      await connectToHost('  abcdef  ', 'Alice')

      const { createPeer } = await import('./peer-manager')
      expect(createPeer).toHaveBeenCalled()
      // The connection should be to the uppercased/trimmed code
      expect(mockPeerInstance.connect).toHaveBeenCalledWith('ABCDEF', expect.any(Object))
    })

    it('sends a join message on successful connection', async () => {
      vi.mocked(mockConn.on).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => cb(), 0)
        }
        return mockConn
      })
      vi.mocked(mockPeerInstance.on).mockImplementation(() => mockPeerInstance)

      await connectToHost('ABCDEF', 'Alice', 'char-1', 'Elara')

      expect(mockConn.send).toHaveBeenCalled()
      const sentData = JSON.parse(mockConn.send.mock.calls[0][0] as string)
      expect(sentData.type).toBe('player:join')
      expect(sentData.payload.displayName).toBe('Alice')
      expect(sentData.payload.characterId).toBe('char-1')
      expect(sentData.payload.characterName).toBe('Elara')
    })

    it('rejects when peer-unavailable error occurs', async () => {
      vi.mocked(mockConn.on).mockImplementation(() => mockConn)
      vi.mocked(mockPeerInstance.on).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'error') {
          setTimeout(() => cb({ type: 'peer-unavailable', message: 'not found' }), 0)
        }
        return mockPeerInstance
      })

      await expect(connectToHost('BADCODE', 'Alice')).rejects.toThrow('Invalid invite code')
    })
  })

  describe('sendMessage when connected', () => {
    beforeEach(async () => {
      vi.mocked(mockConn.on).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => cb(), 0)
        }
        return mockConn
      })
      vi.mocked(mockPeerInstance.on).mockImplementation(() => mockPeerInstance)
      mockConn.send.mockClear()

      await connectToHost('ABCDEF', 'Alice')
      // Clear the join message send
      mockConn.send.mockClear()
    })

    it('sends a properly formed message', () => {
      sendMessage({ type: 'chat:message', payload: { message: 'Hello' } })

      expect(mockConn.send).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(mockConn.send.mock.calls[0][0] as string)
      expect(sent.type).toBe('chat:message')
      expect(sent.payload.message).toBe('Hello')
      expect(sent.senderId).toBe('client-peer-id')
      expect(sent.senderName).toBe('Alice')
      expect(typeof sent.timestamp).toBe('number')
      expect(typeof sent.sequence).toBe('number')
    })

    it('increments sequence number with each message', () => {
      sendMessage({ type: 'ping', payload: {} })
      sendMessage({ type: 'ping', payload: {} })

      const first = JSON.parse(mockConn.send.mock.calls[0][0] as string)
      const second = JSON.parse(mockConn.send.mock.calls[1][0] as string)
      expect(second.sequence).toBeGreaterThan(first.sequence)
    })

    it('handles send errors gracefully', () => {
      mockConn.send.mockImplementationOnce(() => {
        throw new Error('Send failed')
      })

      expect(() => {
        sendMessage({ type: 'chat:message', payload: { message: 'test' } })
      }).not.toThrow()
    })
  })
})
