/**
 * Pi game-registry client. (Phase 29g)
 *
 * Wraps the BMO Pi REST + SSE surface implemented in 29f
 * (`/api/games`, `/api/games/stream`, etc). Knows how to:
 *
 * - announce a hosted game on host-start (`announceGame`)
 * - keep it alive with a 30s heartbeat (`startHeartbeat`)
 * - PATCH the entry when player/spectator counts change (`updateGame`)
 * - DELETE on stop-hosting (`deregisterGame`)
 * - subscribe to live updates with auto-reconnect SSE (`subscribeToRegistry`)
 * - fetch a one-shot listing if SSE isn't reachable (`listGames`)
 *
 * The Pi base URL is read from `settings.bmoPiBaseUrl` (falls back to
 * the public Cloudflare Tunnel hostname so off-LAN players reach the
 * registry without any local network setup). Network errors are
 * surfaced to the caller — the UI distinguishes "no Pi reachable"
 * from "registry empty" via the `onError` callback.
 */

const DEFAULT_BASE_URL = 'https://bmo.mybmoai.work'
const HEARTBEAT_INTERVAL_MS = 30_000
const BACKOFF_LADDER_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]

// Time-box every registry fetch. Without this, a request to an unreachable Pi
// (a stale/adopted LAN IP, a down tunnel, client/AP isolation) hangs for the
// full OS TCP timeout — tens of seconds on Windows. That made host-start stall
// on the announce, the public-game browse freeze, and "Check Status" appear
// hung. A short ceiling fails fast so the caller can fall back (host proceeds
// without the public listing; the browse shows "no Pi" instead of spinning).
const REGISTRY_TIMEOUT_MS = 5_000

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Phase 29g+ auto-discovery: the main process publishes the BMO Pi
// base URL it discovered via _bmo._tcp mDNS browse. We cache it here
// so renderer fetches use the resolved IP without needing the OS to
// resolve `bmo.local` (Windows requires Bonjour Print Services for
// that, which most users don't have installed).
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

function withSourceTag(
  entry: Omit<RegistryGameEntry, 'source'> & Partial<Pick<RegistryGameEntry, 'source'>>
): RegistryGameEntry {
  return { ...entry, source: 'pi' }
}

export async function announceGame(
  payload: RegistryAnnouncePayload,
  config: RegistryClientConfig = {}
): Promise<{ ok: boolean; error?: string }> {
  const base = await getBaseUrl(config.baseUrl)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      return { ok: false, error: `HTTP ${resp.status}: ${detail || resp.statusText}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function updateGame(
  inviteCode: string,
  patch: Partial<RegistryAnnouncePayload>,
  config: RegistryClientConfig = {}
): Promise<{ ok: boolean; error?: string }> {
  const base = await getBaseUrl(config.baseUrl)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games/${encodeURIComponent(inviteCode)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function heartbeatGame(inviteCode: string, config: RegistryClientConfig = {}): Promise<{ ok: boolean }> {
  const base = await getBaseUrl(config.baseUrl)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games/${encodeURIComponent(inviteCode)}/heartbeat`, {
      method: 'POST'
    })
    return { ok: resp.ok }
  } catch {
    return { ok: false }
  }
}

export async function deregisterGame(inviteCode: string, config: RegistryClientConfig = {}): Promise<{ ok: boolean }> {
  const base = await getBaseUrl(config.baseUrl)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games/${encodeURIComponent(inviteCode)}`, {
      method: 'DELETE'
    })
    return { ok: resp.ok }
  } catch {
    return { ok: false }
  }
}

export async function listGames(
  clientId: string | null,
  config: RegistryClientConfig = {}
): Promise<RegistryGameEntry[]> {
  const base = await getBaseUrl(config.baseUrl)
  const params = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
  const resp = await fetchWithTimeout(`${base}/api/games${params}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = (await resp.json()) as { games?: Array<Omit<RegistryGameEntry, 'source'>> }
  return (data.games ?? []).map(withSourceTag)
}

export function startHeartbeat(inviteCode: string, config: RegistryClientConfig = {}): () => void {
  const handle = setInterval(() => {
    void heartbeatGame(inviteCode, config)
  }, HEARTBEAT_INTERVAL_MS)
  return () => clearInterval(handle)
}

/**
 * Subscribe to the Pi's `/api/games/stream` SSE feed. Reconnects with
 * an exponential backoff ladder (1s, 2s, 4s, 8s, 16s, 30s cap).
 *
 * Returns an unsubscribe function that closes the EventSource and
 * stops further reconnect attempts.
 */
export function subscribeToRegistry(
  clientId: string | null,
  onEvent: (event: RegistryEvent) => void,
  onError: (error: Error) => void,
  config: RegistryClientConfig = {}
): () => void {
  let source: EventSource | null = null
  let attempt = 0
  let cancelled = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleReconnect(): void {
    if (cancelled) return
    const delay = BACKOFF_LADDER_MS[Math.min(attempt, BACKOFF_LADDER_MS.length - 1)]
    attempt++
    reconnectTimer = setTimeout(() => {
      void connect()
    }, delay)
  }

  async function connect(): Promise<void> {
    if (cancelled) return
    const base = await getBaseUrl(config.baseUrl)
    const params = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
    const url = `${base}/api/games/stream${params}`
    try {
      source = new EventSource(url)
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      scheduleReconnect()
      return
    }
    source.addEventListener('open', () => {
      attempt = 0
    })
    source.addEventListener('games:full', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as { games?: Array<Omit<RegistryGameEntry, 'source'>> }
        onEvent({ type: 'snapshot', games: (parsed.games ?? []).map(withSourceTag) })
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    })
    source.addEventListener('games:added', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as Omit<RegistryGameEntry, 'source'>
        onEvent({ type: 'added', game: withSourceTag(parsed) })
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    })
    source.addEventListener('games:updated', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as Omit<RegistryGameEntry, 'source'>
        onEvent({ type: 'updated', game: withSourceTag(parsed) })
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    })
    source.addEventListener('games:removed', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as { invite_code: string }
        onEvent({ type: 'removed', inviteCode: parsed.invite_code })
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    })
    source.addEventListener('error', () => {
      if (cancelled) return
      onError(new Error('SSE connection error'))
      source?.close()
      source = null
      scheduleReconnect()
    })
  }

  void connect()

  return () => {
    cancelled = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    source?.close()
    source = null
  }
}
