/**
 * Main-process Pi game-registry client.
 *
 * Performs the registry REST surface (POST/PATCH/POST-heartbeat/DELETE/GET on
 * `/api/games*`) against `getBmoBaseUrl()` from the MAIN process, so the
 * renderer never opens a direct http(s) connection to the Pi for game
 * discovery. Each request is time-boxed with a ~5s AbortController so an
 * unreachable Pi (stale LAN IP, down tunnel, AP isolation) fails fast and the
 * caller can fall back.
 *
 * For the live feed there is no Node EventSource, so this REPLACES the
 * renderer's SSE subscription with main-process POLLING of `GET /api/games`
 * every 4s while subscribed. Each poll diffs against the last snapshot and
 * emits added/updated/removed deltas (plus an initial full snapshot on the
 * first poll) to the renderer via an IPC push event. The registry GCs stale
 * entries on its own, so polling is the pragmatic equivalent of the SSE feed.
 *
 * Off-LAN requests carry the Cloudflare Access service-token headers
 * (`getBmoAccessHeaders`) so the tunnel-fronted registry is reachable without
 * per-user setup; on-LAN the headers are simply ignored.
 */

import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getBmoAccessHeaders, getBmoBaseUrl } from './bmo-config'

// Time-box every registry fetch. Without this, a request to an unreachable Pi
// hangs for the full OS TCP timeout — tens of seconds on Windows — stalling
// host-start (announce), freezing the public-game browse, and making
// "Check Status" appear hung. A short ceiling fails fast so the caller can
// fall back (host proceeds without the public listing; the browse shows
// "no Pi" instead of spinning).
const REGISTRY_TIMEOUT_MS = 5_000

// Poll cadence for the live feed (replaces the renderer SSE). 4s keeps the
// browse list fresh without hammering the Pi; the registry GCs stale entries.
const POLL_INTERVAL_MS = 4_000

export interface RegistryGameEntryRaw {
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
  hosting_mode?: 'p2p' | 'cloud'
}

/** Push events forwarded to the renderer over IPC (REGISTRY_EVENT). The
 * `subscriptionId` lets the renderer demux concurrent subscribers if needed;
 * today there is a single browse view. */
export type RegistryPushEvent =
  | { type: 'snapshot'; games: RegistryGameEntryRaw[] }
  | { type: 'added'; game: RegistryGameEntryRaw }
  | { type: 'updated'; game: RegistryGameEntryRaw }
  | { type: 'removed'; inviteCode: string }
  | { type: 'error'; error: string }

function baseUrl(override?: string): string {
  const raw = (override ?? '').trim()
  if (raw) return raw.replace(/\/+$/, '')
  return getBmoBaseUrl()
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS)
  try {
    return await fetch(input, {
      ...init,
      headers: { ...getBmoAccessHeaders(), ...(init.headers ?? {}) },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function announceGame(
  payload: RegistryAnnouncePayload,
  baseOverride?: string
): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl(baseOverride)
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
  baseOverride?: string
): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl(baseOverride)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games/${encodeURIComponent(inviteCode)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function heartbeatGame(inviteCode: string, baseOverride?: string): Promise<{ ok: boolean }> {
  const base = baseUrl(baseOverride)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games/${encodeURIComponent(inviteCode)}/heartbeat`, {
      method: 'POST'
    })
    return { ok: resp.ok }
  } catch {
    return { ok: false }
  }
}

export async function deregisterGame(inviteCode: string, baseOverride?: string): Promise<{ ok: boolean }> {
  const base = baseUrl(baseOverride)
  try {
    const resp = await fetchWithTimeout(`${base}/api/games/${encodeURIComponent(inviteCode)}`, {
      method: 'DELETE'
    })
    return { ok: resp.ok }
  } catch {
    return { ok: false }
  }
}

export async function listGames(clientId: string | null, baseOverride?: string): Promise<RegistryGameEntryRaw[]> {
  const base = baseUrl(baseOverride)
  const params = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
  const resp = await fetchWithTimeout(`${base}/api/games${params}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = (await resp.json()) as { games?: RegistryGameEntryRaw[] }
  return data.games ?? []
}

// ── Live-feed polling (replaces renderer EventSource SSE) ────────────────

interface PollState {
  clientId: string | null
  timer: ReturnType<typeof setTimeout> | null
  cancelled: boolean
  snapshot: Map<string, RegistryGameEntryRaw>
  initial: boolean
}

const pollers = new Map<string, PollState>()

function broadcastEvent(subscriptionId: string, event: RegistryPushEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.REGISTRY_EVENT, { subscriptionId, event })
    }
  }
}

/** Shallow-equality compare of the fields that matter for an "updated" diff. */
function entriesDiffer(a: RegistryGameEntryRaw, b: RegistryGameEntryRaw): boolean {
  return (
    a.name !== b.name ||
    a.host_display_name !== b.host_display_name ||
    a.current_players !== b.current_players ||
    a.max_players !== b.max_players ||
    a.current_spectators !== b.current_spectators ||
    a.max_spectators !== b.max_spectators ||
    a.is_private !== b.is_private ||
    a.hosting_mode !== b.hosting_mode ||
    a.peer_id !== b.peer_id ||
    a.banned_from_this_game !== b.banned_from_this_game
  )
}

async function pollOnce(subscriptionId: string, state: PollState): Promise<void> {
  let games: RegistryGameEntryRaw[]
  try {
    games = await listGames(state.clientId)
  } catch (err) {
    broadcastEvent(subscriptionId, {
      type: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
    return
  }
  if (state.cancelled) return

  if (state.initial) {
    state.initial = false
    state.snapshot = new Map(games.map((g) => [g.invite_code, g]))
    broadcastEvent(subscriptionId, { type: 'snapshot', games })
    return
  }

  const next = new Map(games.map((g) => [g.invite_code, g]))
  // Added / updated.
  for (const [code, game] of next) {
    const prev = state.snapshot.get(code)
    if (!prev) {
      broadcastEvent(subscriptionId, { type: 'added', game })
    } else if (entriesDiffer(prev, game)) {
      broadcastEvent(subscriptionId, { type: 'updated', game })
    }
  }
  // Removed.
  for (const code of state.snapshot.keys()) {
    if (!next.has(code)) {
      broadcastEvent(subscriptionId, { type: 'removed', inviteCode: code })
    }
  }
  state.snapshot = next
}

function scheduleNext(subscriptionId: string, state: PollState): void {
  if (state.cancelled) return
  state.timer = setTimeout(async () => {
    if (state.cancelled) return
    await pollOnce(subscriptionId, state)
    scheduleNext(subscriptionId, state)
  }, POLL_INTERVAL_MS)
}

/** Start polling the registry for `subscriptionId`. Fires an immediate poll
 * (emitting the initial snapshot) then re-polls every {@link POLL_INTERVAL_MS}.
 * Idempotent: re-subscribing the same id restarts the poller from a fresh
 * snapshot. */
export function subscribeToRegistry(subscriptionId: string, clientId: string | null): void {
  unsubscribeFromRegistry(subscriptionId)
  const state: PollState = {
    clientId,
    timer: null,
    cancelled: false,
    snapshot: new Map(),
    initial: true
  }
  pollers.set(subscriptionId, state)
  // Fire the first poll on the next tick, then schedule the recurring loop.
  void (async () => {
    await pollOnce(subscriptionId, state)
    scheduleNext(subscriptionId, state)
  })()
}

/** Stop polling for `subscriptionId`. Safe to call for an unknown id. */
export function unsubscribeFromRegistry(subscriptionId: string): void {
  const state = pollers.get(subscriptionId)
  if (!state) return
  state.cancelled = true
  if (state.timer) clearTimeout(state.timer)
  pollers.delete(subscriptionId)
}
