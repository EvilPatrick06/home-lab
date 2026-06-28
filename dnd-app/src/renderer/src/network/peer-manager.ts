import Peer from 'peerjs'
import { CLOUD_ICE_SERVERS, PEER_CREATION_TIMEOUT_MS } from '../constants'
import { logger } from '../utils/logger'

export { generateInviteCode } from '../utils/invite-code'

// Module-level state (singleton pattern)
let peer: Peer | null = null
let localPeerId: string | null = null

// Configurable host for signaling server and TURN relay
let customHost: string | null = null
let customSignalingPort: number | null = 9000
let customSignalingPath: string = '/myapp'
let customSignalingSecure: boolean = false

// ICE servers — configurable TURN relay.
// Phase 20c — the previous hardcoded `dndvtt:dndvtt-relay` TURN credentials were
// repo-visible (useless as a secret, and a relay anyone could abuse). They're
// gone: with a custom host we default to STUN-only (the host may run a STUN
// listener on 3478) plus the cloud STUN fallback. Real TURN credentials are
// user-supplied at runtime via setIceConfig (Network Settings).
const getDefaultIceServers = (): RTCIceServer[] => {
  if (customHost) {
    const piStun: RTCIceServer = { urls: `stun:${customHost}:3478` }
    // LAN self-host (insecure http base): customHost is a literal LAN IP and the
    // connection uses direct host candidates (+ the Pi's own STUN by IP). The
    // public STUN servers are HOSTNAMES — on a machine whose WebRTC network service
    // can't resolve them (e.g. behind a VPN that doesn't cover that process) they
    // only spam "Failed to resolve address … -105" and delay ICE gathering before
    // the host-candidate path settles, and they aren't needed on the LAN anyway.
    // Off-LAN self-host (tunnel, secure) still needs public STUN for NAT traversal,
    // so keep it there.
    return customSignalingSecure ? [piStun, ...CLOUD_ICE_SERVERS] : [piStun]
  }
  return CLOUD_ICE_SERVERS
}

let iceServers: RTCIceServer[] = getDefaultIceServers()

/**
 * Configure a custom PeerJS signaling server (e.g. Pi via Cloudflare Tunnel).
 * Call before createPeer() to take effect.
 * @throws {Error} If the host does not use a secure (wss/https) scheme implicitly
 */
export function setSignalingServer(host: string, port?: number, path?: string, secure?: boolean): void {
  // Reject plaintext ws:// or http:// URLs passed as the host value
  if (/^https?:\/\//i.test(host) || /^wss?:\/\//i.test(host)) {
    const scheme = host.match(/^[a-z]+:\/\//i)?.[0] ?? ''
    const isInsecure = /^(http|ws):\/\//i.test(scheme)
    if (isInsecure) {
      logger.warn('setSignalingServer: insecure scheme rejected, use wss:// or https://')
      return
    }
    // Strip any scheme prefix — PeerJS expects a bare hostname
    host = host.replace(/^[a-z]+:\/\//i, '')
  }
  customHost = host
  customSignalingPort = port ?? (secure !== false ? 443 : 80)
  customSignalingPath = path ?? '/'
  customSignalingSecure = secure !== false
  userIceOverride = false
  // Update ICE servers to match the new host
  iceServers = getDefaultIceServers()
}

/**
 * Reset signaling server configuration.
 */
export function resetSignalingServer(): void {
  userIceOverride = false
  customHost = null
  customSignalingPort = 9000
  customSignalingPath = '/myapp'
  customSignalingSecure = false
  iceServers = getDefaultIceServers()
}

// Default `false` so iceTransportPolicy stays 'all' — WebRTC gathers
// direct + STUN + TURN candidates and ICE picks the best. Forcing
// 'relay' blocks direct + STUN candidates, which is the right call
// only when a working TURN server is reachable. Same-LAN hosts with
// no TURN configured were silently failing every join because no
// candidate pair could be nominated. Cloud mode flips this back on
// when needed (see configureForCloud).
let forceRelay = false

// PHASE-53B — true once the user supplies their own ICE/TURN config via
// setIceConfig; suppresses the auto-layered ephemeral TURN so we never
// clobber a user's explicit relay choice.
let userIceOverride = false

/**
 * Override ICE server configuration (e.g. with user-configured TURN servers).
 * Call before createPeer() to take effect.
 */
export function setIceConfig(servers: RTCIceServer[]): void {
  userIceOverride = servers.length > 0
  iceServers = servers.length > 0 ? servers : getDefaultIceServers()
}

/**
 * Get the current ICE server configuration.
 */
export function getIceConfig(): RTCIceServer[] {
  return iceServers
}

/**
 * Reset ICE servers to defaults.
 */
export function resetIceConfig(): void {
  userIceOverride = false
  iceServers = getDefaultIceServers()
}

/**
 * Force all WebRTC traffic through TURN relay (no direct P2P).
 * When true, sets iceTransportPolicy to 'relay' so all data routes through
 * the configured TURN server (e.g. coturn on the Pi).
 */
export function setForceRelay(relay: boolean): void {
  forceRelay = relay
}

/**
 * Get the current force-relay setting.
 */
export function getForceRelay(): boolean {
  return forceRelay
}

/**
 * Configure networking for cloud-based hosting (PeerJS cloud + public STUN).
 * Used as fallback when custom signaling server is unreachable.
 */
export function configureForCloud(): void {
  userIceOverride = false
  customHost = null
  customSignalingPort = null
  customSignalingPath = '/'
  customSignalingSecure = true
  iceServers = CLOUD_ICE_SERVERS
  forceRelay = false
}

/**
 * Configure P2P (self-host) signaling to use the Pi's OWN PeerServer
 * (bmo-peerjs) instead of the flaky public PeerJS cloud — works on AND off LAN:
 *   - on-LAN  (http base)  → `<host>:9000/myapp` over ws (the PeerServer's port)
 *   - off-LAN (https base) → `<host>:443/myapp` over wss (the Cloudflare tunnel,
 *     which routes `/myapp` → :9000; requires an Access bypass on `/myapp`)
 * Falls back to the public PeerJS cloud only when no Pi base URL is known, so a
 * user with no Pi configured can still play. `piBaseUrl` is the resolved BMO base
 * (settings → mDNS → default) from `resolveBmoBaseUrl()`.
 */
export function configureForP2P(piBaseUrl: string | null): void {
  if (!piBaseUrl) {
    resetSignalingServer() // customHost=null → public PeerJS cloud fallback
    return
  }
  try {
    const u = new URL(piBaseUrl)
    const secure = u.protocol === 'https:'
    // u.hostname is a bare host (no scheme) so setSignalingServer accepts it; the
    // PeerServer is on :9000 on the LAN and reached via :443 through the tunnel.
    setSignalingServer(u.hostname, secure ? 443 : 9000, '/myapp', secure)
  } catch {
    resetSignalingServer()
  }
}

/**
 * Reset all networking config back to defaults.
 * Called when a session ends so the next session tries configured host or cloud fallback.
 */
export function resetToDefaults(): void {
  resetSignalingServer()
  resetIceConfig()
  forceRelay = false
}

/**
 * Create a new PeerJS instance. If a customId is provided, it will be used
 * as the peer ID (used by the host with the invite code). Otherwise PeerJS
 * assigns a random ID.
 */

/**
 * PHASE-53B — fetch a short-lived coturn credential. In Electron the MAIN
 * process performs the fetch (no direct renderer->Pi http); in the web build
 * (no `window.api`) we fetch the same-origin Pi endpoint directly.
 */
async function fetchEphemeralTurn(): Promise<{ username: string; credential: string } | null> {
  try {
    const w =
      typeof window !== 'undefined'
        ? (window as unknown as {
            api?: { turn?: { getCredentials?: () => Promise<{ username?: string; credential?: string } | null> } }
          })
        : undefined
    if (w?.api?.turn?.getCredentials) {
      const c = await w.api.turn.getCredentials()
      return c?.username && c.credential ? { username: c.username, credential: c.credential } : null
    }
    if (typeof fetch === 'function') {
      const resp = await fetch('/api/turn-credentials')
      if (!resp.ok) return null
      const d = (await resp.json()) as { username?: string; credential?: string }
      return d.username && d.credential ? { username: d.username, credential: d.credential } : null
    }
  } catch (e) {
    logger.debug('[PeerManager] ephemeral TURN fetch failed (STUN-only):', e)
  }
  return null
}

/**
 * PHASE-53B — for a self-host session, layer a TURN relay candidate onto the
 * default STUN-only ICE set using an ephemeral coturn credential, so a client
 * behind restrictive NAT can still form a candidate pair. No-op when no custom
 * host is configured (cloud mode), when the user supplied their own ICE config,
 * or when the mint is unavailable (stays STUN-only; the PHASE-53A relay fallback
 * still covers a dead-end). `forceRelay` stays false — TURN is a fallback
 * candidate; ICE picks the best pair.
 */
export async function ensureEphemeralTurn(): Promise<void> {
  if (!customHost || userIceOverride) return
  const creds = await fetchEphemeralTurn()
  if (!creds) return
  const turnServer: RTCIceServer = {
    urls: [`turn:${customHost}:3478`, `turn:${customHost}:3478?transport=tcp`],
    username: creds.username,
    credential: creds.credential
  }
  const base = getDefaultIceServers().filter(
    (s) => !(Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith('turn:'))
  )
  iceServers = [...base, turnServer]
}

export function createPeer(customId?: string): Promise<Peer> {
  // PHASE-53B — ensure a self-host ICE set carries an ephemeral TURN relay
  // candidate before building the peer (no-op for cloud / user-override / no mint).
  return ensureEphemeralTurn().then(() => createPeerInner(customId))
}

function createPeerInner(customId?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    // Clean up any existing peer
    if (peer) {
      destroyPeer()
    }

    const options: Record<string, unknown> = {
      debug: import.meta.env.DEV ? 2 : 0,
      config: {
        iceServers,
        ...(forceRelay && { iceTransportPolicy: 'relay' })
      }
    }

    // Use custom signaling server if configured (e.g. Pi via Cloudflare Tunnel)
    if (customHost) {
      options.host = customHost
      options.port = customSignalingPort ?? 443
      options.path = customSignalingPath
      options.secure = customSignalingSecure
    }

    const newPeer = customId ? new Peer(customId, options) : new Peer(options)

    const timeout = setTimeout(() => {
      newPeer.destroy()
      reject(new Error('Peer creation timed out after 15 seconds'))
    }, PEER_CREATION_TIMEOUT_MS)

    newPeer.on('open', (id) => {
      clearTimeout(timeout)
      peer = newPeer
      localPeerId = id
      logger.debug('[PeerManager] Peer created with ID:', id)
      resolve(newPeer)
    })

    newPeer.on('error', (err) => {
      clearTimeout(timeout)
      logger.error('[PeerManager] Peer error:', err)

      // If the peer ID is already taken, the host should retry with a new code
      if (err.type === 'unavailable-id') {
        newPeer.destroy()
        reject(new Error('Invite code already in use. Please try again.'))
        return
      }

      // Network-level errors
      if (err.type === 'network' || err.type === 'server-error') {
        reject(new Error('Could not connect to signaling server. Check your internet connection.'))
        return
      }

      reject(err)
    })
  })
}

/**
 * Destroy the current PeerJS instance and clean up.
 */
export function destroyPeer(): void {
  if (peer) {
    logger.debug('[PeerManager] Destroying peer:', localPeerId)
    try {
      peer.destroy()
    } catch (e) {
      logger.warn('[PeerManager] Error during peer destroy:', e)
    }
    peer = null
    localPeerId = null
  }
}

/**
 * Phase 32 — cloud-relay peer-id override. A cloud-hosted/joined session has no
 * PeerJS peer, so `localPeerId` is null; the cloud session sets this so the host
 * dispatch + outgoing messages stamp the correct (generated) peer id. Cleared on
 * teardown. Null → fall back to the PeerJS `localPeerId` (the P2P default).
 */
let peerIdOverride: string | null = null

/** Set (or clear, with null) the cloud peer-id override. */
export function setPeerIdOverride(id: string | null): void {
  peerIdOverride = id
}

/**
 * Get the current peer ID, or null if no peer exists.
 */
export function getPeerId(): string | null {
  return peerIdOverride ?? localPeerId
}

/**
 * Get the raw Peer instance, or null if not created.
 */
export function getPeer(): Peer | null {
  return peer
}
