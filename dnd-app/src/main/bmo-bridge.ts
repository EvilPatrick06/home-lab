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
import { getBmoBaseUrl } from './bmo-config'
import { logToFile } from './log'

const TIMEOUT_MS = 15_000
const SYNC_RECEIVER_PORT = parseInt(process.env.BMO_SYNC_PORT || '5001', 10)
// Phase 28a.2 — cap inbound sync-receiver bodies (Pi callbacks are small JSON).
const MAX_SYNC_BODY_BYTES = 256 * 1024
// Phase 28c.1 — retry schedule for transient BMO failures (not 4xx).
const RETRY_BACKOFF_MS = [200, 800, 2000]

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      // Phase 28a.2 — reject oversized bodies before buffering the whole thing.
      if (total > MAX_SYNC_BODY_BYTES) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// Phase 28a.2 — the sync receiver binds to loopback only and serves a localhost
// origin, so the CORS header reflects that rather than a wildcard.
const SYNC_CORS_ORIGIN = 'http://127.0.0.1'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': SYNC_CORS_ORIGIN })
  res.end(JSON.stringify(data))
}

function forwardToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, data)
  }
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

  syncServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': SYNC_CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }

    try {
      // Health check
      if (req.method === 'GET' && req.url === '/api/sync/health') {
        sendJson(res, 200, { ok: true, version: '1.0.0' })
        return
      }

      // Generic sync event
      if (req.method === 'POST' && req.url === '/api/sync') {
        const body = await readBody(req)
        const event: SyncEvent = JSON.parse(body)
        logToFile('INFO', `[bmo-bridge] Sync event: ${event.type}`)
        forwardToRenderer(IPC_CHANNELS.BMO_SYNC_EVENT, event)
        sendJson(res, 200, { ok: true })
        return
      }

      // Initiative sync from Discord
      if (req.method === 'POST' && req.url === '/api/sync/initiative') {
        const body = await readBody(req)
        const data = JSON.parse(body)
        logToFile('INFO', '[bmo-bridge] Initiative sync from Discord')
        forwardToRenderer(IPC_CHANNELS.BMO_SYNC_INITIATIVE, data)
        sendJson(res, 200, { ok: true })
        return
      }

      // State request — Pi is asking for current VTT state
      if (req.method === 'GET' && req.url === '/api/sync/state') {
        // Forward a state request event; the renderer will respond with a push
        forwardToRenderer(IPC_CHANNELS.BMO_SYNC_EVENT, {
          type: 'state_request',
          payload: {},
          timestamp: Date.now()
        } satisfies SyncEvent)
        sendJson(res, 200, { ok: true, message: 'State request forwarded' })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (err) {
      logToFile('ERROR', `[bmo-bridge] Sync receiver error: ${err}`)
      sendJson(res, 500, { error: 'Internal error' })
    }
  })

  // Phase 28a.2 — bind to loopback so the receiver isn't reachable off-box.
  // The Pi bot connects via an SSH tunnel / localhost forward.
  syncServer.listen(port, '127.0.0.1', () => {
    logToFile('INFO', `[bmo-bridge] Sync receiver listening on 127.0.0.1:${port}`)
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
