import { describe, expect, it, vi } from 'vitest'
import type { MessageType, NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'
import { MemoryHub, MemoryTransport } from './memory-transport'

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

function makeMsg(from: string, type: MessageType = 'chat:message'): NetworkMessage {
  return { type, payload: { text: from }, senderId: from, senderName: from, timestamp: 0, sequence: 0 }
}

describe('MemoryTransport', () => {
  it('send delivers only to the addressed peer', () => {
    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const a = new MemoryTransport(hub, makePeer('a'))
    const b = new MemoryTransport(hub, makePeer('b'))
    const aRecv = vi.fn()
    const bRecv = vi.fn()
    a.onMessage(aRecv)
    b.onMessage(bRecv)

    host.send('a', makeMsg('host'))

    expect(aRecv).toHaveBeenCalledTimes(1)
    expect(aRecv).toHaveBeenCalledWith('host', expect.objectContaining({ senderId: 'host' }))
    expect(bRecv).not.toHaveBeenCalled()
  })

  it('broadcast reaches every other peer but not the sender', () => {
    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const a = new MemoryTransport(hub, makePeer('a'))
    const b = new MemoryTransport(hub, makePeer('b'))
    const hostRecv = vi.fn()
    const aRecv = vi.fn()
    const bRecv = vi.fn()
    host.onMessage(hostRecv)
    a.onMessage(aRecv)
    b.onMessage(bRecv)

    host.broadcast(makeMsg('host'))

    expect(aRecv).toHaveBeenCalledTimes(1)
    expect(bRecv).toHaveBeenCalledTimes(1)
    expect(hostRecv).not.toHaveBeenCalled()
  })

  it('broadcastExcluding skips the excluded peer and the sender', () => {
    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const a = new MemoryTransport(hub, makePeer('a'))
    const b = new MemoryTransport(hub, makePeer('b'))
    const aRecv = vi.fn()
    const bRecv = vi.fn()
    a.onMessage(aRecv)
    b.onMessage(bRecv)

    host.broadcastExcluding('a', makeMsg('host'))

    expect(aRecv).not.toHaveBeenCalled()
    expect(bRecv).toHaveBeenCalledTimes(1)
  })

  it('fires onPeerJoin on existing endpoints when a new peer registers', () => {
    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const joined = vi.fn()
    host.onPeerJoin(joined)

    const a = makePeer('a')
    new MemoryTransport(hub, a)

    expect(joined).toHaveBeenCalledTimes(1)
    expect(joined).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'a' }))
  })

  it('fires onPeerLeave when a peer closes', () => {
    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const a = new MemoryTransport(hub, makePeer('a'))
    const left = vi.fn()
    host.onPeerLeave(left)

    a.close()

    expect(left).toHaveBeenCalledTimes(1)
    expect(left).toHaveBeenCalledWith('a')
  })

  it('unsubscribe stops further message delivery', () => {
    const hub = new MemoryHub()
    const host = new MemoryTransport(hub, makePeer('host', true))
    const a = new MemoryTransport(hub, makePeer('a'))
    const recv = vi.fn()
    const off = a.onMessage(recv)

    host.send('a', makeMsg('host'))
    off()
    host.send('a', makeMsg('host'))

    expect(recv).toHaveBeenCalledTimes(1)
  })
})
