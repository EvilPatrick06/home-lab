import { validateMessage } from '../host-message-handlers'
import type { MessageType, NetworkMessage } from '../message-types'
import { auditSecurityEvent } from '../security-audit'
import type { TransportAdapter } from '../transport/transport-adapter'

/**
 * Phase 30a — `GameAuthority`: the transport-agnostic owner of authoritative
 * game state.
 *
 * It listens on a `TransportAdapter` for inbound intents (peer → host messages),
 * validates them (reusing `validateMessage` — structural + the 20g audit on
 * rejection), and dispatches each to a registered per-type handler. The handler
 * mutates the authoritative state and uses the provided `IntentContext` to emit
 * outbound messages back over the same transport.
 *
 * It imports NO PeerJS — only the `TransportAdapter` seam. In production it runs
 * over `P2PTransport`; in tests over `MemoryTransport`; and in Phase 32 the SAME
 * class runs on the Pi over a WebSocket transport. This is the seam that lets
 * "host" (network) decouple from "DM" (game role) in 30d.
 *
 * 30a is additive: this builds + tests the authority over a transport. Wiring it
 * into the live host path (replacing the direct host-manager dispatch) is 30c.
 */
export interface IntentContext {
  /** The peer the intent came from. */
  readonly peerId: string
  /** Broadcast an outbound message to every connected peer. */
  broadcast: (message: NetworkMessage) => void
  /** Broadcast to everyone except one peer (e.g. the originator). */
  broadcastExcluding: (excludePeerId: string, message: NetworkMessage) => void
  /** Send to a single peer. */
  send: (peerId: string, message: NetworkMessage) => void
}

export type IntentHandler = (message: NetworkMessage, ctx: IntentContext) => void

export class GameAuthority {
  private readonly handlers = new Map<MessageType, IntentHandler>()
  private unsubscribe: (() => void) | null = null

  constructor(private readonly transport: TransportAdapter) {}

  /** Register the handler for an intent type. Last registration wins. */
  register(type: MessageType, handler: IntentHandler): void {
    this.handlers.set(type, handler)
  }

  /** Begin consuming inbound intents from the transport. Idempotent. */
  start(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.transport.onMessage((peerId, message) => this.handleIntent(peerId, message))
  }

  /** Stop consuming. The transport itself is not closed (caller owns it). */
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private handleIntent(peerId: string, message: NetworkMessage): void {
    // Reuse the structural validator; it audits the rejection (20g) itself.
    if (!validateMessage(message)) return
    const handler = this.handlers.get(message.type)
    if (!handler) {
      auditSecurityEvent('authority.unhandled_intent', { peerId, type: message.type })
      return
    }
    handler(message, {
      peerId,
      broadcast: (m) => this.transport.broadcast(m),
      broadcastExcluding: (exclude, m) => this.transport.broadcastExcluding(exclude, m),
      send: (p, m) => this.transport.send(p, m)
    })
  }
}
