import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageType, NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'

// Mock host-manager so we don't pull in PeerJS; capture delegation.
vi.mock('../host-manager', () => ({
  sendToPeer: vi.fn(),
  broadcastMessage: vi.fn(),
  broadcastExcluding: vi.fn(),
  kickPeer: vi.fn(),
  onMessage: vi.fn(() => () => undefined),
  onPeerJoined: vi.fn(() => () => undefined),
  onPeerLeft: vi.fn(() => () => undefined),
  stopHosting: vi.fn()
}))

import * as hostManager from '../host-manager'
import { createP2PTransport } from './p2p-transport'

function makeMsg(type: MessageType = 'chat:message'): NetworkMessage {
  return { type, payload: {}, senderId: 'host', senderName: 'host', timestamp: 0, sequence: 0 }
}

function makePeer(peerId: string): PeerInfo {
  return {
    peerId,
    clientId: `c-${peerId}`,
    role: 'player',
    displayName: peerId,
    characterId: null,
    characterName: null,
    isReady: false,
    isHost: false
  }
}

describe('createP2PTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates send/broadcast to host-manager', () => {
    const t = createP2PTransport()
    const msg = makeMsg()
    t.send('p1', msg)
    t.broadcast(msg)
    expect(hostManager.sendToPeer).toHaveBeenCalledWith('p1', msg)
    expect(hostManager.broadcastMessage).toHaveBeenCalledWith(msg)
  })

  it('swaps the arg order for broadcastExcluding (excludePeerId, msg) -> (msg, excludePeerId)', () => {
    const t = createP2PTransport()
    const msg = makeMsg()
    t.broadcastExcluding('p1', msg)
    expect(hostManager.broadcastExcluding).toHaveBeenCalledWith(msg, 'p1')
  })

  it('adapts onMessage callback from (message, peerId) to (peerId, message)', () => {
    const t = createP2PTransport()
    const received: Array<[string, NetworkMessage]> = []
    t.onMessage((peerId, message) => received.push([peerId, message]))
    // Grab the callback host-manager.onMessage was registered with + fire it.
    const hostCb = vi.mocked(hostManager.onMessage).mock.calls[0][0]
    const msg = makeMsg()
    hostCb(msg, 'p1')
    expect(received).toEqual([['p1', msg]])
  })

  it('adapts onPeerLeave from PeerInfo to peerId', () => {
    const t = createP2PTransport()
    const left: string[] = []
    t.onPeerLeave((peerId) => left.push(peerId))
    const hostCb = vi.mocked(hostManager.onPeerLeft).mock.calls[0][0]
    hostCb(makePeer('p1'))
    expect(left).toEqual(['p1'])
  })

  it('passes onPeerJoin through unchanged', () => {
    const t = createP2PTransport()
    const cb = vi.fn()
    t.onPeerJoin(cb)
    expect(hostManager.onPeerJoined).toHaveBeenCalledWith(cb)
  })

  it('maps disconnect -> kickPeer and close -> stopHosting', () => {
    const t = createP2PTransport()
    t.disconnect('p1')
    t.close()
    expect(hostManager.kickPeer).toHaveBeenCalledWith('p1')
    expect(hostManager.stopHosting).toHaveBeenCalledTimes(1)
  })
})
