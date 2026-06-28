import { describe, expect, it, vi } from 'vitest'
import { BridgeEndpoint } from './endpoint'
import { decodeFrame, encodeFrame } from './protocol'

/**
 * Wire two endpoints together through an in-memory transport. By default
 * delivery is synchronous; `controlled` mode queues frames so a test can model
 * a dropped/reconnecting peer.
 */
function pair(opts: { controlled?: boolean } = {}): {
  native: BridgeEndpoint
  web: BridgeEndpoint
  deliver: () => void
  queues: { toNative: string[]; toWeb: string[] }
} {
  const queues = { toNative: [] as string[], toWeb: [] as string[] }
  let web!: BridgeEndpoint
  let native!: BridgeEndpoint

  native = new BridgeEndpoint({
    role: 'native',
    send: (d) => {
      if (opts.controlled) queues.toWeb.push(d)
      else web.receive(d)
    }
  })
  web = new BridgeEndpoint({
    role: 'web',
    send: (d) => {
      if (opts.controlled) queues.toNative.push(d)
      else native.receive(d)
    }
  })

  const deliver = (): void => {
    while (queues.toWeb.length || queues.toNative.length) {
      const a = queues.toWeb.shift()
      if (a !== undefined) web.receive(a)
      const b = queues.toNative.shift()
      if (b !== undefined) native.receive(b)
    }
  }
  return { native, web, deliver, queues }
}

describe('bridge protocol codec', () => {
  it('round-trips every frame kind', () => {
    const frames = [
      { k: 'hello', protocol: 1, role: 'web' },
      { k: 'rpc-req', id: 7, method: 'loadCharacter', args: ['abc', { deep: [1, 2, 3] }] },
      { k: 'rpc-ok', id: 7, result: { name: 'Aragorn', hp: 42 } },
      { k: 'rpc-err', id: 8, error: 'boom' },
      { k: 'event', seq: 3, name: 'character:hpChanged', payload: { tokenId: 't1', delta: -5 } },
      { k: 'resync', sinceSeq: 12 }
    ] as const
    for (const f of frames) {
      expect(decodeFrame(encodeFrame(f))).toEqual(f)
    }
  })

  it('encodes binary-ish payloads (Uint8Array) losslessly', () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128, 42])
    const frame = { k: 'rpc-ok', id: 1, result: bytes } as const
    const decoded = decodeFrame(encodeFrame(frame)) as { result: Uint8Array }
    expect(Array.from(decoded.result)).toEqual(Array.from(bytes))
  })

  it('rejects a corrupt frame', () => {
    expect(() => decodeFrame('not-valid-base64-!!')).toThrow()
  })
})

describe('BridgeEndpoint RPC', () => {
  it('resolves a call via the peer handler', async () => {
    const { native, web } = pair()
    native.handle('loadCharacter', (id) => ({ id, name: 'Bilbo' }))
    await expect(web.call('loadCharacter', 'c1')).resolves.toEqual({ id: 'c1', name: 'Bilbo' })
  })

  it('supports async handlers and multiple args', async () => {
    const { native, web } = pair()
    native.handle('saveGameState', async (campaignId, state) => {
      await Promise.resolve()
      return { success: true, campaignId, keys: Object.keys(state as object) }
    })
    await expect(web.call('saveGameState', 'camp1', { a: 1, b: 2 })).resolves.toEqual({
      success: true,
      campaignId: 'camp1',
      keys: ['a', 'b']
    })
  })

  it('rejects when the handler throws', async () => {
    const { native, web } = pair()
    native.handle('explode', () => {
      throw new Error('kaboom')
    })
    await expect(web.call('explode')).rejects.toThrow('kaboom')
  })

  it('rejects when no handler is registered', async () => {
    const { web } = pair()
    await expect(web.call('missing')).rejects.toThrow(/no handler/)
  })

  it('times out a call with no response', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn()
      const ep = new BridgeEndpoint({ role: 'web', send, rpcTimeoutMs: 200 })
      const p = ep.call('hang')
      const assertion = expect(p).rejects.toThrow(/timed out/)
      await vi.advanceTimersByTimeAsync(500)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('BridgeEndpoint events', () => {
  it('delivers events to subscribers', () => {
    const { native, web } = pair()
    const received: unknown[] = []
    web.on('session:ended', (p) => received.push(p))
    native.emit('session:ended', { reason: 'host-left' })
    native.emit('session:ended', { reason: 'kicked' })
    expect(received).toEqual([{ reason: 'host-left' }, { reason: 'kicked' }])
  })

  it('unsubscribes cleanly', () => {
    const { native, web } = pair()
    const received: unknown[] = []
    const off = web.on('tick', (p) => received.push(p))
    native.emit('tick', 1)
    off()
    native.emit('tick', 2)
    expect(received).toEqual([1])
  })

  it('replays missed events on resync after a gap', () => {
    const { native, web, deliver, queues } = pair({ controlled: true })
    const received: number[] = []
    web.on('seqtest', (p) => received.push(p as number))

    // Deliver the first event so the web side learns seq=1.
    native.emit('seqtest', 1)
    deliver()
    expect(received).toEqual([1])

    // Native emits 2 & 3, but the transport "drops" them before delivery.
    native.emit('seqtest', 2)
    native.emit('seqtest', 3)
    queues.toWeb.length = 0 // simulate dropped frames

    // Native emits 4; delivering it makes the web side notice the 1→4 gap and
    // request a resync, which replays 2,3,4.
    native.emit('seqtest', 4)
    deliver()

    expect(received).toContain(2)
    expect(received).toContain(3)
    expect(received).toContain(4)
  })
})
