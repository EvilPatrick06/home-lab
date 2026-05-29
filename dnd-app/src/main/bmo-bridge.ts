/**
 * BMO Pi Bridge — HTTP client for controlling BMO services on the Raspberry Pi.
 * Used to start/stop Discord DM sessions and send narration from the VTT.
 *
 * Also hosts a sync receiver HTTP server that accepts callbacks from the Pi
 * Discord bot, forwarding events to the renderer process via IPC.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { InitiativeSyncSchema, SyncEventSchema } from '../shared/ipc-schemas'
import { getBmoApiKey, getBmoBaseUrl } from './bmo-config'
import { logToFile } from './log'

const TIMEOUT_MS = 15_000
const SYNC_RECEIVER_PORT = parseInt(process.env.BMO_SYNC_PORT || '5001', 10)
// Phase 28a.2 — loopback by default; override via BMO_SYNC_BIND for
// scenarios where an SSH/Tailscale tunnel rewrites the destination IP.
const SYNC_BIND =
  process.env.BMO_SYNC_BIND && process.env.BMO_SYNC_BIND.trim() !== '' ? process.env.BMO_SYNC_BIND : '127.0.0.1'
// Phase 28a.2 — cap inbound sync-receiver bodies (Pi callbacks are small JSON).
const MAX_BODY_BYTES = 64 * 1024
// Phase 28c.1 — retry schedule for transient BMO failures (not 4xx).
const RETRY_BACKOFF_MS = [200, 800, 2000]

// Phase 28a.2 — token-bucket rate limit per source IP (60 req/min, 1 req/s refill).
const RATE_LIMIT_CAPACITY = 60
const RATE_LIMIT_REFILL_PER_MS = 1 / 1000 // 1 token per second
const RATE_LIMIT_GC_MS = 5 * 60 * 1000
const rateLimit = new Map<string, { tokens: number; lastRefill: number }>()

function rateLimitOk(ip: string): boolean {
  const now = Date.now()
  // GC stale entries on every check (cheap — Map size is small for a local receiver).
  for (const [key, bucket] of rateLimit) {
    if (now - bucket.lastRefill > RATE_LIMIT_GC_MS) rateLimit.delete(key)
  }

  let bucket = rateLimit.get(ip)
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_CAPACITY, lastRefill: now }
    rateLimit.set(ip, bucket)
  } else {
    const elapsed = now - bucket.lastRefill
    bucket.tokens = Math.min(RATE_LIMIT_CAPACITY, bucket.tokens + elapsed * RATE_LIMIT_REFILL_PER_MS)
    bucket.lastRefill = now
  }

  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

// Exposed for tests so they can reset the bucket map between cases.
export function __resetSyncReceiverState(): void {
  rateLimit.clear()
  apiKeyWarningLogged = false
}

interface BridgeResponse {
  ok?: boolean
  error?: string
  statusCode?: number
  [key: string]: unknown
}

// Phase 28c.1 — track consecutive bridge failures so we can warn once.
let consecutiveBmoFailures = 0
function notifyBmoUnreachable(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(IPC_CHANNELS.BMO_SYNC_EVENT, {
      type: 'discord_message',
      payload: { system: true, text: 'BMO unreachable — Discord sync paused' },
      timestamp: Date.now()
    } satisfies SyncEvent)
  }
}

/** Standard sync event types sent from the Pi Discord bot */
export interface SyncEvent {
  type: 'discord_message' | 'initiative_sync' | 'state_request' | 'player_join' | 'player_leave' | 'discord_roll'
  payload: Record<string, unknown>
  timestamp: number
}

async function bmoPiFetchOnce(path: string, options?: RequestInit): Promise<BridgeResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${getBmoBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}`, statusCode: res.status }
    }
    const data = (await res.json()) as Record<string, unknown>
    return { ok: true, ...data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Phase 28c.1 — BMO fetch with retry/backoff. Retries transient failures
 * (network error / 5xx) up to 3 times (200/800/2000ms); never retries a 4xx.
 * After 3 consecutive total failures, emits a one-shot "BMO unreachable" toast;
 * the counter resets on the first success.
 */
async function bmoPiFetch(path: string, options?: RequestInit): Promise<BridgeResponse> {
  let last: BridgeResponse = { ok: false, error: 'unknown' }
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    last = await bmoPiFetchOnce(path, options)
    if (last.ok) {
      consecutiveBmoFailures = 0
      return last
    }
    // Don't retry client errors (4xx) — they won't succeed on retry.
    if (typeof last.statusCode === 'number' && last.statusCode >= 400 && last.statusCode < 500) break
    if (attempt < RETRY_BACKOFF_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]))
    }
  }
  consecutiveBmoFailures++
  if (consecutiveBmoFailures === 3) notifyBmoUnreachable()
  return last
}

export async function startDiscordDm(campaignId: string): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/start', {
    method: 'POST',
    body: JSON.stringify({ campaign_id: campaignId })
  })
}

export async function stopDiscordDm(): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/stop', { method: 'POST' })
}

export async function sendNarration(text: string, npc?: string, emotion?: string): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/narrate', {
    method: 'POST',
    body: JSON.stringify({ text, npc, emotion })
  })
}

export async function getDmStatus(): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/status')
}

// ─── VTT → Pi: Push state to the Discord bot ───

/** Push the current initiative order to the Pi so Discord players can see it */
export async function sendInitiativeToPi(initiative: {
  entries: Array<{ entityName: string; entityType: string; isActive: boolean }>
  currentIndex: number
  round: number
}): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/sync/initiative', {
    method: 'POST',
    body: JSON.stringify(initiative)
  })
}

/** Push a condensed game state snapshot to the Pi for Discord context */
export async function sendGameStateToPi(state: {
  mapName?: string
  ambientLight?: string
  activeCreatures?: Array<{ label: string; hp: number; maxHp: number; conditions: string[] }>
  partyHp?: Array<{ name: string; hp: number; maxHp: number; conditions: string[] }>
}): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/sync/state', {
    method: 'POST',
    body: JSON.stringify(state)
  })
}

// ─── Pi → VTT: Sync receiver HTTP server ───

let syncServer: ReturnType<typeof createServer> | null = null
let apiKeyWarningLogged = false

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let aborted = false
    req.on('data', (chunk: Buffer) => {
      if (aborted) return
      total += chunk.length
      // Phase 28a.2 — reject oversized bodies before buffering the whole thing.
      // Drain (don't destroy) the rest of the stream so the response can still
      // be written cleanly with a 413 over the same connection.
      if (total > MAX_BODY_BYTES) {
        aborted = true
        reject(new Error('PAYLOAD_TOO_LARGE'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => {
      if (!aborted) reject(err)
    })
  })
}

// Phase 28a.2 — the sync receiver binds to loopback only and serves a localhost
// origin, so the CORS header reflects that rather than a wildcard.
const SYNC_CORS_ORIGIN = 'http://127.0.0.1'

function sendJson(res: ServerResponse, status: number, data: unknown, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': SYNC_CORS_ORIGIN,
    ...extraHeaders
  })
  res.end(JSON.stringify(data))
}

function forwardToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, data)
  }
}

function getContentType(req: IncomingMessage): string {
  const raw = req.headers['content-type']
  if (!raw) return ''
  return Array.isArray(raw) ? raw[0].toLowerCase() : raw.toLowerCase()
}

function isJsonContentType(req: IncomingMessage): boolean {
  return getContentType(req).split(';')[0].trim() === 'application/json'
}

function getBearerToken(req: IncomingMessage): string | null {
  const raw = req.headers.authorization
  if (!raw) return null
  const value = Array.isArray(raw) ? raw[0] : raw
  const m = value.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

/**
 * Start the sync receiver HTTP server.
 * The Pi Discord bot sends POST requests to these endpoints:
 *
 * POST /api/sync           — Generic sync event (messages, rolls, player join/leave)
 * POST /api/sync/initiative — Initiative state from Discord (player rolls in Discord)
 * GET  /api/sync/health     — Health check
 */
export function startSyncReceiver(port = SYNC_RECEIVER_PORT): void {
  if (syncServer) {
    logToFile('WARN', '[bmo-bridge] Sync receiver already running')
    return
  }

  // Phase 28a.4 — warn once at startup when no shared secret is configured.
  if (!getBmoApiKey() && !apiKeyWarningLogged) {
    logToFile('WARN', '[bmo-bridge] WARN: no BMO_API_KEY configured; sync receiver is unauthenticated')
    apiKeyWarningLogged = true
  }

  syncServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': SYNC_CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      })
      res.end()
      return
    }

    try {
      // Health check — intentionally open: no auth, no rate limit, no validation.
      if (req.method === 'GET' && req.url === '/api/sync/health') {
        sendJson(res, 200, { ok: true, version: '1.0.0' })
        return
      }

      // State request — Pi is asking for current VTT state. Still GET, keep open
      // so an unauthenticated probe can also trigger a state push if desired.
      if (req.method === 'GET' && req.url === '/api/sync/state') {
        forwardToRenderer(IPC_CHANNELS.BMO_SYNC_EVENT, {
          type: 'state_request',
          payload: {},
          timestamp: Date.now()
        } satisfies SyncEvent)
        sendJson(res, 200, { ok: true, message: 'State request forwarded' })
        return
      }

      // ── POST endpoints: full hardening sweep ──────────────────────
      if (req.method === 'POST' && (req.url === '/api/sync' || req.url === '/api/sync/initiative')) {
        // 1) Rate limit per source IP.
        const ip = clientIp(req)
        if (!rateLimitOk(ip)) {
          sendJson(res, 429, { error: 'rate limit exceeded' }, { 'Retry-After': '60' })
          return
        }

        // 2) Content-Type must be application/json (case-insensitive).
        if (!isJsonContentType(req)) {
          sendJson(res, 415, { error: 'unsupported media type; expected application/json' })
          return
        }

        // 3) Bearer auth when a key is configured.
        const expected = getBmoApiKey()
        if (expected) {
          const token = getBearerToken(req)
          if (!token || token !== expected) {
            sendJson(res, 401, { error: 'unauthorized' })
            return
          }
        }

        // 4) Read body with size cap.
        let body: string
        try {
          body = await readBody(req)
        } catch (err) {
          if (err instanceof Error && err.message === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { error: 'payload too large' })
            return
          }
          throw err
        }

        // 5) JSON parse.
        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(body)
        } catch {
          sendJson(res, 400, { error: 'invalid JSON' })
          return
        }

        // 6) Zod validation against the appropriate schema.
        if (req.url === '/api/sync') {
          const parsed = SyncEventSchema.safeParse(parsedJson)
          if (!parsed.success) {
            sendJson(res, 400, { error: 'invalid payload', issues: parsed.error.issues })
            return
          }
          logToFile('INFO', `[bmo-bridge] Sync event: ${parsed.data.type}`)
          forwardToRenderer(IPC_CHANNELS.BMO_SYNC_EVENT, parsed.data)
          sendJson(res, 200, { ok: true })
          return
        }

        // /api/sync/initiative
        const parsed = InitiativeSyncSchema.safeParse(parsedJson)
        if (!parsed.success) {
          sendJson(res, 400, { error: 'invalid payload', issues: parsed.error.issues })
          return
        }
        logToFile('INFO', '[bmo-bridge] Initiative sync from Discord')
        forwardToRenderer(IPC_CHANNELS.BMO_SYNC_INITIATIVE, parsed.data)
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (err) {
      logToFile('ERROR', `[bmo-bridge] Sync receiver error: ${err}`)
      sendJson(res, 500, { error: 'Internal error' })
    }
  })

  // Phase 28a.2 — bind to loopback (or BMO_SYNC_BIND override) so the
  // receiver isn't reachable off-box. The Pi bot connects via SSH tunnel /
  // localhost forward.
  syncServer.listen(port, SYNC_BIND, () => {
    logToFile('INFO', `[bmo-bridge] Sync receiver listening on ${SYNC_BIND}:${port}`)
  })

  syncServer.on('error', (err) => {
    logToFile('ERROR', `[bmo-bridge] Sync receiver failed to start: ${err.message}`)
    syncServer = null
  })
}

/**
 * Stop the sync receiver HTTP server. Phase 28c.3 — resolves only after the
 * server has fully closed (forcing open keep-alive connections shut first) so a
 * before-quit handler can await a clean shutdown.
 */
export function stopSyncReceiver(): Promise<void> {
  return new Promise((resolve) => {
    if (!syncServer) {
      resolve()
      return
    }
    const server = syncServer
    syncServer = null
    // Node 18.2+ — terminate idle/active keep-alive sockets so close() resolves.
    server.closeAllConnections?.()
    server.close(() => {
      logToFile('INFO', '[bmo-bridge] Sync receiver stopped')
      resolve()
    })
  })
}
