/**
 * Phase 32d — cloud (Pi-relayed) session helper.
 *
 * Builds a `WebSocketTransport` to the Pi `/game` relay so the network store's
 * cloud branch stays small. The store wires `GameAuthority` / broadcaster /
 * applier over the returned transport exactly as it does over
 * `createP2PTransport()` — only the wire underneath differs.
 *
 * A cloud session has no PeerJS peer, so we generate a stable peer id here; the
 * store installs `setHostOutboundOverride` (host-manager) + `setPeerIdOverride`
 * (peer-manager) so the existing host dispatch reroutes to the relay unchanged.
 */

import type { PeerInfo } from '../../network'
import { resolveBmoBaseUrl } from '../../network/registry-client'
import type { TransportAdapter } from '../../network/transport/transport-adapter'
import { createWebSocketTransport, type RelaySocket } from '../../network/transport/websocket-transport'
import { getOrCreateClientId } from '../../utils/client-id'

export type CloudSocketFactory = (url: string, auth: Record<string, unknown>) => RelaySocket

let socketFactoryOverride: CloudSocketFactory | null = null

/** Test seam — inject a fake socket factory so cloud-session/store tests run
 * without a real Pi connection. Pass null to restore the `socket.io-client`
 * default. */
export function __setCloudSocketFactoryForTests(factory: CloudSocketFactory | null): void {
  socketFactoryOverride = factory
}

function genCloudPeerId(): string {
  // crypto.randomUUID is always available in the Electron renderer + the Node
  // test env (same as getOrCreateClientId); no Math.random fallback (forbidden 28e.3).
  return `cloud-${crypto.randomUUID()}`
}

export interface CloudSessionHandle {
  transport: TransportAdapter
  self: PeerInfo
}

/**
 * Resolve the Pi base URL (settings → mDNS → default) and build the relay
 * transport. `role` is 'host' for the DM/host client (claims the relay's host
 * slot) or 'player' for a joiner.
 */
export async function connectCloudSession(args: {
  inviteCode: string
  displayName: string
  role: 'host' | 'player'
  apiKey?: string
  baseUrlOverride?: string
}): Promise<CloudSessionHandle> {
  const base = await resolveBmoBaseUrl(args.baseUrlOverride)
  const self: PeerInfo = {
    peerId: genCloudPeerId(),
    clientId: getOrCreateClientId(),
    role: args.role,
    displayName: args.displayName,
    characterId: null,
    characterName: null,
    isReady: false,
    isHost: args.role === 'host',
    isDM: args.role === 'host'
  }
  const transport = createWebSocketTransport({
    url: base,
    code: args.inviteCode,
    self,
    apiKey: args.apiKey,
    socketFactory: socketFactoryOverride ?? undefined
  })
  return { transport, self }
}
