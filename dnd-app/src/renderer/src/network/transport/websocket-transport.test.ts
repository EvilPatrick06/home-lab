import { describe, expect, it, vi } from 'vitest'
import type { MessageType, NetworkMessage } from '../message-types'
import type { PeerInfo } from '../state-types'
import { createWebSocketTransport, type RelaySocket } from './websocket-transport'

/** A fake RelaySocket that records emits and lets the test fire inbound events. */
function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>()
  const emits: Array<{ event: string; payload: unknown }> = []
  let disconnected = false
  const socket: RelaySocket = {
    on: (event, listener) => handlers.set(event, listener),
    emit: (event, payload) => emits.push({ event, payload }),
    disconnect: () => {
      disconnected = true
    }
  }
  return {
    socket,
    emits,
    fire: (event: string, payload?: unknown) => handlers.get(event)?.(payload),
    isDisconnected: () => disconnected,
    lastEmit: (event: string) => [...emits].reverse().find((e) => e.event === event)
  }
}

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

function setup(self = makePeer('host', true)) {
  const fake = makeFakeSocket()
  const transport = createWebSocketTransport({
    url: 'wss://pi.test',
    code: 'ROOM',
    self,
    apiKey: 'secret',
    socketFactory: () => fake.socket
  })
  return { fake, transport }
}

describe('WebSocketTransport', () => {
  it('emits a join with the local identity on construct', () => {
    const { fake } = setup(makePeer('host', true))
    const join = fake.lastEmit('join')
    expect(join?.payload).toEqual({
      code: 'ROOM',
      peer_id: 'host',
      client_id: 'c-host',
      role: 'host',
      display_name: 'host'
    })
  })

  it('passes apiKey through the socket factory auth', () => {
    const seen: Array<Record<string, unknown>> = []
    createWebSocketTransport({
      url: 'wss://pi.test',
      code: 'ROOM',
      self: makePeer('host', true),
      apiKey: 'secret',
      socketFactory: (_url, auth) => {
        seen.push(auth)
        return { on: () => {}, emit: () => {}, disconnect: () => {} }
      }
    })
    expect(seen[0]).toEqual({ api_key: 'secret' })
  })

  it('send → relay with target_peer_id', () => {
    const { fake, transport } = setup()
    transport.send('p1', makeMsg('host'))
    const relay = fake.lastEmit('relay')
    expect(relay?.payload).toMatchObject({ target_peer_id: 'p1' })
    expect((relay?.payload as { message: NetworkMessage }).message.senderId).toBe('host')
  })

  it('broadcast → relay with no routing hint', () => {
    const { fake, transport } = setup()
    transport.broadcast(makeMsg('host'))
    const relay = fake.lastEmit('relay')
    expect(relay?.payload).not.toHaveProperty('target_peer_id')
    expect(relay?.payload).not.toHaveProperty('exclude_peer_id')
  })

  it('broadcastExcluding → relay with exclude_peer_id', () => {
    const { fake, transport } = setup()
    transport.broadcastExcluding('p2', makeMsg('host'))
    expect(fake.lastEmit('relay')?.payload).toMatchObject({ exclude_peer_id: 'p2' })
  })

  it('inbound message → onMessage(fromPeerId, message)', () => {
    const { fake, transport } = setup()
    const recv = vi.fn()
    transport.onMessage(recv)
    fake.fire('message', { from_peer_id: 'p1', message: makeMsg('p1', 'sync:delta') })
    expect(recv).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'sync:delta' }))
  })

  it('inbound peers list → onPeerJoin for each, mapped to PeerInfo', () => {
    const { fake, transport } = setup()
    const join = vi.fn()
    transport.onPeerJoin(join)
    fake.fire('peers', {
      peers: [
        { peer_id: 'host', client_id: 'c-host', role: 'host', display_name: 'DM' },
        { peer_id: 'p1', client_id: 'c-p1', role: 'player', display_name: 'Alice' }
      ],
      host_peer_id: 'host'
    })
    expect(join).toHaveBeenCalledTimes(2)
    expect(join).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'host', isHost: true, displayName: 'DM' }))
    expect(join).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'p1', isHost: false, role: 'player' }))
  })

  it('inbound peer-joined → onPeerJoin', () => {
    const { fake, transport } = setup()
    const join = vi.fn()
    transport.onPeerJoin(join)
    fake.fire('peer-joined', { peer_id: 'p2', client_id: 'c-p2', role: 'player', display_name: 'Bob' })
    expect(join).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'p2' }))
  })

  it('inbound peer-left → onPeerLeave(peerId)', () => {
    const { fake, transport } = setup()
    const leave = vi.fn()
    transport.onPeerLeave(leave)
    fake.fire('peer-left', { peer_id: 'p1', was_host: false })
    expect(leave).toHaveBeenCalledWith('p1')
  })

  it('disconnect(peerId) → kick emit', () => {
    const { fake, transport } = setup()
    transport.disconnect('p1')
    expect(fake.lastEmit('kick')?.payload).toEqual({ peer_id: 'p1' })
  })

  it('close() disconnects the socket and stops dispatching', () => {
    const { fake, transport } = setup()
    const recv = vi.fn()
    transport.onMessage(recv)
    transport.close()
    expect(fake.isDisconnected()).toBe(true)
    fake.fire('message', { from_peer_id: 'p1', message: makeMsg('p1') })
    expect(recv).not.toHaveBeenCalled()
  })

  it('unsubscribe removes the callback', () => {
    const { fake, transport } = setup()
    const recv = vi.fn()
    const off = transport.onMessage(recv)
    off()
    fake.fire('message', { from_peer_id: 'p1', message: makeMsg('p1') })
    expect(recv).not.toHaveBeenCalled()
  })
})
