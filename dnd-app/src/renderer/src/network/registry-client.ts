/**
 * Pi game-registry client (renderer-side façade). (Phase 29g; main-process
 * proxy refactor.)
 *
 * The registry REST surface (`/api/games*`) is no longer fetched directly from
 * the renderer. Every call here delegates to `window.api.registry.*`, which the
 * MAIN process performs against the resolved Pi base URL (registry-bridge.ts).
 * This keeps the renderer free of any direct http(s) connection to the Pi for
 * game discovery (better CSP posture + off-LAN Cloudflare-Access handling).
 *
 * What this module still does:
 * - announce a hosted game on host-start (`announceGame`)
 * - keep it alive with a 30s heartbeat (`startHeartbeat`)
 * - PATCH the entry when player/spectator counts change (`updateGame`)
 * - DELETE on stop-hosting (`deregisterGame`)
 * - subscribe to live updates (`subscribeToRegistry`) — the main process POLLS
 *   the registry every 4s (Node has no EventSource) and pushes added/updated/
 *   removed deltas + an initial snapshot here via an IPC event
 * - fetch a one-shot listing (`listGames`)
 *
 * The exported signatures, the `RegistryGameEntry` / `RegistryEvent` types, and
 * the `source: 'pi'` tagging are unchanged, so callers (host-announce.ts,
 * JoinGamePage.tsx) need no edits. `resolveBmoBaseUrl` / `isOnPiLan` /
 * `resolveConnectionMode` stay here because other modules depend on them.
 */

const DEFAULT_BASE_URL = 'https://bmo.mybmoai.work'
const HEARTBEAT_INTERVAL_MS = 30_000

// Phase 29g+ auto-discovery: the main process publishes the BMO Pi base URL it
// discovered via _bmo._tcp mDNS browse. We cache it here so `resolveBmoBaseUrl`
// (used by other modules) returns the resolved IP without the OS resolving
// `bmo.local` (Windows requires Bonjour Print Services for that).
let discoveredBmoUrl: string | null = null

if (typeof window !== 'undefined' && window.api?.lan?.onBmoResolvedUrl) {
  window.api.lan.onBmoResolvedUrl(({ url }) => {
    discoveredBmoUrl = url
  })
}

export interface RegistryGameEntry {
  source: 'pi'
  invite_code: string
  name: string
  host_display_name: string
  host_client_id: string
  current_players: number
  max_players: number
  current_spectators: number
  max_spectators: number
  game_system: string
  is_private: boolean
  /** 'p2p' (WebRTC mesh) or 'cloud' (Pi relay) — the transport the host is on.
   * A joiner MUST match it to rendezvous. */
  hosting_mode?: 'p2p' | 'cloud'
  peer_id: string
  created_at: number
  banned_from_this_game: boolean
}

export interface RegistryAnnouncePayload {
  invite_code: string
  name: string
  host_display_name: string
  host_client_id: string
  current_players: number
  max_players: number
  current_spectators: number
  max_spectators: number
  game_system: string
  is_private: boolean
  peer_id: string
  /** Phase 32 — 'p2p' (WebRTC mesh) or 'cloud' (Pi relay). Optional; the Pi
   * registry tolerates extra fields, and the game-list UI can badge cloud games. */
  hosting_mode?: 'p2p' | 'cloud'
}

export type RegistryEvent =
  | { type: 'snapshot'; games: RegistryGameEntry[] }
  | { type: 'added'; game: RegistryGameEntry }
  | { type: 'updated'; game: RegistryGameEntry }
  | { type: 'removed'; inviteCode: string }

export interface RegistryClientConfig {
  baseUrl?: string
}

function resolveBase(input?: string | null): string {
  const raw = (input ?? '').trim()
  if (!raw) return DEFAULT_BASE_URL
  return raw.replace(/\/+$/, '')
}

/** Resolve the BMO Pi base URL (settings → mDNS → default). Exported so the
 * Phase 32 cloud relay reuses the exact same precedence the registry client uses. */
export async function resolveBmoBaseUrl(override?: string): Promise<string> {
  return getBaseUrl(override)
}

/**
 * True when a Pi was discovered on the local network (mDNS resolved a LAN URL).
 * Used to choose the multiplayer transport: on-LAN we can do direct WebRTC P2P;
 * OFF-LAN, WebRTC NAT traversal is unreliable (STUN-only, no reachable TURN —
 * the Pi's coturn can't traverse the HTTP-only tunnel), so we route through the
 * Pi Socket.IO cloud relay instead (it only needs :5000, which the tunnel
 * proxies). `discoveredBmoUrl` is set by the main process's reachability-probed
 * mDNS discovery (it stays null off-LAN, or when the LAN Pi is unreachable).
 */
export function isOnPiLan(): boolean {
  return discoveredBmoUrl !== null
}

/**
 * Pick the connection transport for a join/host. An explicit hosting mode (e.g.
 * from a registry entry the joiner is connecting to) always wins — both sides
 * must agree on the transport to rendezvous. Otherwise: on-LAN → 'p2p' (direct,
 * low-latency), off-LAN → 'cloud' (the relay, which works behind any NAT).
 */
export function resolveConnectionMode(explicit?: 'p2p' | 'cloud'): 'p2p' | 'cloud' {
  if (explicit) return explicit
  return isOnPiLan() ? 'p2p' : 'cloud'
}

async function getBaseUrl(override?: string): Promise<string> {
  if (override) return resolveBase(override)
  if (typeof window === 'undefined' || !window.api?.loadSettings) {
    return discoveredBmoUrl ? resolveBase(discoveredBmoUrl) : DEFAULT_BASE_URL
  }
  try {
    const settings = await window.api.loadSettings()
    if (settings?.bmoPiBaseUrl?.trim()) {
      return resolveBase(settings.bmoPiBaseUrl)
    }
    // No explicit override → prefer the mDNS-discovered URL so Windows
    // users without Bonjour Print Services can still reach the Pi.
    return discoveredBmoUrl ? resolveBase(discoveredBmoUrl) : DEFAULT_BASE_URL
  } catch {
    return discoveredBmoUrl ? resolveBase(discoveredBmoUrl) : DEFAULT_BASE_URL
  }
}

function withSourceTag(entry: Omit<RegistryGameEntry, 'source'>): RegistryGameEntry {
  return { ...entry, source: 'pi' }
}

// The renderer used to forward `config.baseUrl` directly into the fetch URL.
// Now main resolves the base from settings/mDNS itself; an explicit override
// (e.g. the integration test pointing at a specific registry) is still honored
// by passing it through as the IPC `baseOverride` arg.
function overrideFrom(config: RegistryClientConfig): string | undefined {
  return config.baseUrl
}

export async function announceGame(
  payload: RegistryAnnouncePayload,
  config: RegistryClientConfig = {}
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.api?.registry) {
    return { ok: false, error: 'registry bridge unavailable' }
  }
  return window.api.registry.announce(payload as unknown as Record<string, unknown>, overrideFrom(config))
}

export async function updateGame(
  inviteCode: string,
  patch: Partial<RegistryAnnouncePayload>,
  config: RegistryClientConfig = {}
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.api?.registry) {
    return { ok: false, error: 'registry bridge unavailable' }
  }
  return window.api.registry.update(inviteCode, patch as Record<string, unknown>, overrideFrom(config))
}

async function heartbeatGame(inviteCode: string, config: RegistryClientConfig = {}): Promise<{ ok: boolean }> {
  if (typeof window === 'undefined' || !window.api?.registry) return { ok: false }
  return window.api.registry.heartbeat(inviteCode, overrideFrom(config))
}

export async function deregisterGame(inviteCode: string, config: RegistryClientConfig = {}): Promise<{ ok: boolean }> {
  if (typeof window === 'undefined' || !window.api?.registry) return { ok: false }
  return window.api.registry.deregister(inviteCode, overrideFrom(config))
}

export async function listGames(
  clientId: string | null,
  config: RegistryClientConfig = {}
): Promise<RegistryGameEntry[]> {
  if (typeof window === 'undefined' || !window.api?.registry) {
    throw new Error('registry bridge unavailable')
  }
  const result = await window.api.registry.list(clientId, overrideFrom(config))
  if (!result.ok) throw new Error(result.error)
  return result.games.map(withSourceTag)
}

export function startHeartbeat(inviteCode: string, config: RegistryClientConfig = {}): () => void {
  const handle = setInterval(() => {
    void heartbeatGame(inviteCode, config)
  }, HEARTBEAT_INTERVAL_MS)
  return () => clearInterval(handle)
}

// Monotonic subscription ids so concurrent browse views never collide.
let subscriptionSeq = 0

/**
 * Subscribe to the Pi registry's live feed. The main process POLLS the registry
 * every 4s and pushes `snapshot` / `added` / `updated` / `removed` deltas here
 * over IPC (Node has no EventSource, so polling replaces the old SSE stream).
 *
 * Returns an unsubscribe function that tells main to stop polling and removes
 * the IPC listener.
 */
export function subscribeToRegistry(
  clientId: string | null,
  onEvent: (event: RegistryEvent) => void,
  onError: (error: Error) => void,
  _config: RegistryClientConfig = {}
): () => void {
  if (typeof window === 'undefined' || !window.api?.registry) {
    onError(new Error('registry bridge unavailable'))
    return () => undefined
  }

  const subscriptionId = `reg-${Date.now()}-${subscriptionSeq++}`
  let cancelled = false

  const removeListener = window.api.registry.onEvent(({ subscriptionId: id, event }) => {
    if (cancelled || id !== subscriptionId) return
    switch (event.type) {
      case 'snapshot':
        onEvent({ type: 'snapshot', games: event.games.map(withSourceTag) })
        break
      case 'added':
        onEvent({ type: 'added', game: withSourceTag(event.game) })
        break
      case 'updated':
        onEvent({ type: 'updated', game: withSourceTag(event.game) })
        break
      case 'removed':
        onEvent({ type: 'removed', inviteCode: event.inviteCode })
        break
      case 'error':
        onError(new Error(event.error))
        break
    }
  })

  void window.api.registry.subscribe(subscriptionId, clientId).catch((err: unknown) => {
    onError(err instanceof Error ? err : new Error(String(err)))
  })

  return () => {
    cancelled = true
    removeListener()
    void window.api.registry.unsubscribe(subscriptionId).catch(() => undefined)
  }
}
