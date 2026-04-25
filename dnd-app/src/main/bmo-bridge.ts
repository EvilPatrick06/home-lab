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

interface BridgeResponse {
  ok?: boolean
  error?: string
  [key: string]: unknown
}

/** Standard sync event types sent from the Pi Discord bot */
export interface SyncEvent {
  type: 'discord_message' | 'initiative_sync' | 'state_request' | 'player_join' | 'player_leave' | 'discord_roll'
  payload: Record<string, unknown>
  timestamp: number
}

async function bmoPiFetch(path: string, options?: RequestInit): Promise<BridgeResponse> {
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
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
    }
    return await res.json()
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
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
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
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
        'Access-Control-Allow-Origin': '*',
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

  syncServer.listen(port, '0.0.0.0', () => {
    logToFile('INFO', `[bmo-bridge] Sync receiver listening on port ${port}`)
  })

  syncServer.on('error', (err) => {
    logToFile('ERROR', `[bmo-bridge] Sync receiver failed to start: ${err.message}`)
    syncServer = null
  })
}

/** Stop the sync receiver HTTP server */
export function stopSyncReceiver(): void {
  if (syncServer) {
    syncServer.close()
    syncServer = null
    logToFile('INFO', '[bmo-bridge] Sync receiver stopped')
  }
}
