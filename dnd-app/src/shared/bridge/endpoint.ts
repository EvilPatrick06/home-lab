/**
 * BridgeEndpoint — the symmetric RPC + event engine that runs on BOTH sides of
 * the native ↔ WebView bridge. It is transport-agnostic: construct it with a
 * `send(data: string)` function (e.g. `webViewRef.injectJavaScript(...)` on the
 * native side, or `window.ReactNativeWebView.postMessage(...)` on the web side),
 * and feed inbound strings to `receive(data)`.
 *
 *   call(method, ...args)   → Promise resolved by the peer's registered handler
 *   handle(method, fn)      → register an RPC handler this side answers
 *   emit(name, payload)     → fire-and-forget sequenced event to the peer
 *   on(name, cb)            → subscribe to peer events; returns an unsubscribe
 *   requestResync()         → ask the peer to replay events since our lastSeq
 *
 * Ordering & resilience:
 *   - Events carry a monotonic seq. If the receiver sees a gap (seq jumps ahead)
 *     it auto-requests a resync. Each endpoint keeps the last
 *     BRIDGE_EVENT_BUFFER_SIZE events it emitted so it can replay on demand
 *     (e.g. after the WebView reloads), mirroring the multiplayer replay buffer.
 *   - RPCs time out (default 15s) so a dropped peer can't leak pending promises.
 */

import {
  BRIDGE_EVENT_BUFFER_SIZE,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_RPC_TIMEOUT_MS,
  type BridgeFrame,
  type BridgeRole,
  decodeFrame,
  encodeFrame
} from './protocol'

type RpcHandler = (...args: readonly unknown[]) => unknown | Promise<unknown>
type EventListener = (payload: unknown) => void

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface BridgeEndpointOptions {
  role: BridgeRole
  send: (data: string) => void
  /** Override the RPC timeout (ms). */
  rpcTimeoutMs?: number
  /** Optional logger for transport-level faults (decode errors, etc.). */
  onError?: (err: Error) => void
}

export class BridgeEndpoint {
  private readonly role: BridgeRole
  private readonly send: (data: string) => void
  private readonly rpcTimeoutMs: number
  private readonly onError: (err: Error) => void

  private nextCallId = 1
  private readonly pending = new Map<number, PendingCall>()
  private readonly handlers = new Map<string, RpcHandler>()
  private readonly listeners = new Map<string, Set<EventListener>>()

  private emitSeq = 0
  private readonly emitted = new Map<number, BridgeFrame>()
  private lastReceivedSeq = 0

  constructor(opts: BridgeEndpointOptions) {
    this.role = opts.role
    this.send = opts.send
    this.rpcTimeoutMs = opts.rpcTimeoutMs ?? BRIDGE_RPC_TIMEOUT_MS
    this.onError = opts.onError ?? (() => {})
  }

  /** Announce protocol version/role to the peer. Optional but lets each side
   * detect a version mismatch early. */
  hello(): void {
    this.post({ k: 'hello', protocol: BRIDGE_PROTOCOL_VERSION, role: this.role })
  }

  // ── RPC ────────────────────────────────────────────────────────────────────
  call<T = unknown>(method: string, ...args: readonly unknown[]): Promise<T> {
    const id = this.nextCallId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`bridge: RPC "${method}" timed out after ${this.rpcTimeoutMs}ms`))
      }, this.rpcTimeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.post({ k: 'rpc-req', id, method, args })
    })
  }

  handle(method: string, fn: RpcHandler): void {
    this.handlers.set(method, fn)
  }

  /** Bulk-register handlers from an object map (method name → fn). */
  handleAll(map: Record<string, RpcHandler>): void {
    for (const [method, fn] of Object.entries(map)) this.handlers.set(method, fn)
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  emit(name: string, payload: unknown): void {
    const seq = ++this.emitSeq
    const frame: BridgeFrame = { k: 'event', seq, name, payload }
    this.emitted.set(seq, frame)
    if (this.emitted.size > BRIDGE_EVENT_BUFFER_SIZE) {
      // Drop the oldest retained event (Map preserves insertion order).
      const oldest = this.emitted.keys().next().value
      if (oldest !== undefined) this.emitted.delete(oldest)
    }
    this.post(frame)
  }

  on(name: string, cb: EventListener): () => void {
    let set = this.listeners.get(name)
    if (!set) {
      set = new Set()
      this.listeners.set(name, set)
    }
    set.add(cb)
    return () => {
      set?.delete(cb)
    }
  }

  /** Ask the peer to replay every event after our last received seq. Call after
   * a reconnect / WebView reload to recover missed state notifications. */
  requestResync(): void {
    this.post({ k: 'resync', sinceSeq: this.lastReceivedSeq })
  }

  // ── Inbound ──────────────────────────────────────────────────────────────────
  receive(data: string): void {
    let frame: BridgeFrame
    try {
      frame = decodeFrame(data)
    } catch (err) {
      this.onError(err as Error)
      return
    }
    switch (frame.k) {
      case 'hello':
        if (frame.protocol !== BRIDGE_PROTOCOL_VERSION) {
          this.onError(new Error(`bridge: protocol mismatch (peer ${frame.protocol}, self ${BRIDGE_PROTOCOL_VERSION})`))
        }
        return
      case 'rpc-req':
        void this.dispatchRpc(frame.id, frame.method, frame.args)
        return
      case 'rpc-ok': {
        const pend = this.pending.get(frame.id)
        if (!pend) return
        clearTimeout(pend.timer)
        this.pending.delete(frame.id)
        pend.resolve(frame.result)
        return
      }
      case 'rpc-err': {
        const pend = this.pending.get(frame.id)
        if (!pend) return
        clearTimeout(pend.timer)
        this.pending.delete(frame.id)
        pend.reject(new Error(frame.error))
        return
      }
      case 'event':
        this.handleEvent(frame.seq, frame.name, frame.payload)
        return
      case 'resync':
        this.replayEventsSince(frame.sinceSeq)
        return
      default: {
        // Exhaustiveness guard: unknown frame kinds are logged and dropped.
        const exhaustive: never = frame
        this.onError(new Error(`bridge: unhandled frame ${JSON.stringify(exhaustive)}`))
      }
    }
  }

  private async dispatchRpc(id: number, method: string, args: readonly unknown[]): Promise<void> {
    const fn = this.handlers.get(method)
    if (!fn) {
      this.post({ k: 'rpc-err', id, error: `bridge: no handler for "${method}"` })
      return
    }
    try {
      const result = await fn(...args)
      this.post({ k: 'rpc-ok', id, result })
    } catch (err) {
      this.post({ k: 'rpc-err', id, error: (err as Error)?.message ?? String(err) })
    }
  }

  private handleEvent(seq: number, name: string, payload: unknown): void {
    // Detect a forward gap (missed events) and request a targeted resync. We
    // still deliver the event we just got so live updates aren't blocked.
    if (seq > this.lastReceivedSeq + 1 && this.lastReceivedSeq !== 0) {
      this.requestResync()
    }
    if (seq > this.lastReceivedSeq) this.lastReceivedSeq = seq
    const set = this.listeners.get(name)
    if (!set) return
    for (const cb of set) {
      try {
        cb(payload)
      } catch (err) {
        this.onError(err as Error)
      }
    }
  }

  private replayEventsSince(sinceSeq: number): void {
    for (const [seq, frame] of this.emitted) {
      if (seq > sinceSeq) this.post(frame)
    }
  }

  private post(frame: BridgeFrame): void {
    try {
      this.send(encodeFrame(frame))
    } catch (err) {
      this.onError(err as Error)
    }
  }

  /** Reject all in-flight RPCs (e.g. when the WebView is torn down). */
  dispose(): void {
    for (const [, pend] of this.pending) {
      clearTimeout(pend.timer)
      pend.reject(new Error('bridge: endpoint disposed'))
    }
    this.pending.clear()
    this.listeners.clear()
    this.handlers.clear()
  }
}
