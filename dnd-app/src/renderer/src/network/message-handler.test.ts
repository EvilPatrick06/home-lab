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

import { createMessageRouter } from './message-handler'
import type { NetworkMessage } from './types'

function makeMessage(type: NetworkMessage['type'], payload: unknown = {}): NetworkMessage {
  return {
    type,
    payload,
    senderId: 'peer-1',
    senderName: 'Alice',
    timestamp: Date.now(),
    sequence: 0
  }
}

describe('createMessageRouter', () => {
  it('returns an object with on, handle, and clear methods', () => {
    const router = createMessageRouter()
    expect(typeof router.on).toBe('function')
    expect(typeof router.handle).toBe('function')
    expect(typeof router.clear).toBe('function')
  })

  it('dispatches messages to registered handlers', () => {
    const router = createMessageRouter()
    const handler = vi.fn()
    router.on('chat:message', handler)

    const msg = makeMessage('chat:message', { message: 'hello' })
    router.handle(msg)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(msg)
  })

  it('does not dispatch to handlers for different types', () => {
    const router = createMessageRouter()
    const chatHandler = vi.fn()
    const joinHandler = vi.fn()
    router.on('chat:message', chatHandler)
    router.on('player:join', joinHandler)

    router.handle(makeMessage('chat:message', { message: 'hi' }))

    expect(chatHandler).toHaveBeenCalledTimes(1)
    expect(joinHandler).not.toHaveBeenCalled()
  })

  it('dispatches to multiple handlers for the same type', () => {
    const router = createMessageRouter()
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    router.on('ping', handler1)
    router.on('ping', handler2)

    router.handle(makeMessage('ping'))

    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('on() returns an unsubscribe function', () => {
    const router = createMessageRouter()
    const handler = vi.fn()
    const unsub = router.on('chat:message', handler)

    expect(typeof unsub).toBe('function')

    unsub()
    router.handle(makeMessage('chat:message', { message: 'test' }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribing one handler does not affect other handlers', () => {
    const router = createMessageRouter()
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const unsub1 = router.on('chat:message', handler1)
    router.on('chat:message', handler2)

    unsub1()
    router.handle(makeMessage('chat:message', { message: 'test' }))

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('clear() removes all handlers', () => {
    const router = createMessageRouter()
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    router.on('chat:message', handler1)
    router.on('player:join', handler2)

    router.clear()

    router.handle(makeMessage('chat:message', { message: 'test' }))
    router.handle(makeMessage('player:join', { displayName: 'Bob' }))

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })

  it('handles messages with no registered handler without throwing', () => {
    const router = createMessageRouter()
    expect(() => {
      router.handle(makeMessage('ping'))
    }).not.toThrow()
  })

  it('catches and logs errors thrown by handlers', () => {
    const router = createMessageRouter()
    const errorHandler = vi.fn(() => {
      throw new Error('Handler error')
    })
    const goodHandler = vi.fn()

    router.on('chat:message', errorHandler)
    router.on('chat:message', goodHandler)

    expect(() => {
      router.handle(makeMessage('chat:message', { message: 'test' }))
    }).not.toThrow()

    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(goodHandler).toHaveBeenCalledTimes(1)
  })

  it('cleans up handler set when last handler is unsubscribed', () => {
    const router = createMessageRouter()
    const handler = vi.fn()
    const unsub = router.on('chat:message', handler)

    unsub()

    // After unsubscribing the only handler, handle should log "no handler"
    // rather than iterating an empty set
    router.handle(makeMessage('chat:message', { message: 'test' }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('can re-register a handler after unsubscribing', () => {
    const router = createMessageRouter()
    const handler = vi.fn()

    const unsub = router.on('ping', handler)
    unsub()

    router.on('ping', handler)
    router.handle(makeMessage('ping'))

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
