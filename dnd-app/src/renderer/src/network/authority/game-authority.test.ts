import { describe, expect, it, vi } from 'vitest'
import type { NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'
import { MemoryHub, MemoryTransport } from '../transport/memory-transport'
import { GameAuthority } from './game-authority'

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

function makeChat(text: string, from = 'c1'): NetworkMessage {
  return {
    type: 'chat:message',
    payload: { message: text },
    senderId: from,
    senderName: from,
    timestamp: 0,
    sequence: 0
  }
}

function setup() {
  const hub = new MemoryHub()
  const hostT = new MemoryTransport(hub, makePeer('host', true))
  const clientT = new MemoryTransport(hub, makePeer('c1'))
  const authority = new GameAuthority(hostT)
  return { hub, hostT, clientT, authority }
}

describe('GameAuthority', () => {
  it('validates, dispatches to the registered handler, and broadcasts the result', () => {
    const { clientT, authority } = setup()
    const seen: string[] = []
    authority.register('chat:message', (msg, ctx) => {
      seen.push((msg.payload as { message: string }).message)
      ctx.broadcast({ ...msg, senderId: 'host', senderName: 'DM' })
    })
    authority.start()
    const clientRecv = vi.fn()
    clientT.onMessage(clientRecv)

    clientT.send('host', makeChat('hello'))

    expect(seen).toEqual(['hello'])
    // The handler's broadcast went back out over the transport and reached the client.
    expect(clientRecv).toHaveBeenCalledTimes(1)
    expect(clientRecv).toHaveBeenCalledWith('host', expect.objectContaining({ senderName: 'DM' }))
  })

  it('rejects a structurally-invalid intent (handler not called)', () => {
    const { clientT, authority } = setup()
    const handler = vi.fn()
    authority.register('chat:message', handler)
    authority.start()

    // payload.message is a number, not a string → validateMessage drops it.
    const bad: NetworkMessage = {
      type: 'chat:message',
      payload: { message: 123 },
      senderId: 'c1',
      senderName: 'c1',
      timestamp: 0,
      sequence: 0
    }
    clientT.send('host', bad)

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not dispatch a valid intent with no registered handler', () => {
    const { clientT, authority } = setup()
    const chatHandler = vi.fn()
    authority.register('chat:message', chatHandler)
    authority.start()

    const whisper: NetworkMessage = {
      type: 'chat:whisper',
      payload: { targetPeerId: 'host', message: 'psst' },
      senderId: 'c1',
      senderName: 'c1',
      timestamp: 0,
      sequence: 0
    }
    clientT.send('host', whisper)

    expect(chatHandler).not.toHaveBeenCalled()
  })

  it('falls back to registerDefault for types with no specific handler (30c)', () => {
    const { clientT, authority } = setup()
    const specific = vi.fn()
    const fallback = vi.fn()
    authority.register('chat:message', specific)
    authority.registerDefault(fallback)
    authority.start()

    // chat:message → specific handler
    clientT.send('host', makeChat('hi'))
    expect(specific).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()

    // a valid whisper has no specific handler → default handler
    const whisper: NetworkMessage = {
      type: 'chat:whisper',
      payload: { targetPeerId: 'host', message: 'psst' },
      senderId: 'c1',
      senderName: 'c1',
      timestamp: 0,
      sequence: 0
    }
    clientT.send('host', whisper)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledWith(whisper, expect.objectContaining({ peerId: 'c1' }))
  })

  it('stop() detaches the listener', () => {
    const { clientT, authority } = setup()
    const handler = vi.fn()
    authority.register('chat:message', handler)
    authority.start()
    authority.stop()

    clientT.send('host', makeChat('after-stop'))

    expect(handler).not.toHaveBeenCalled()
  })
})
