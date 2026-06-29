/**
 * BMO Pi Bridge — HTTP client for controlling BMO services on the Raspberry Pi.
 * Used to start/stop Discord DM sessions and send narration from the VTT.
 *
 * Also hosts a sync receiver HTTP server that accepts callbacks from the Pi
 * Discord bot, forwarding events to the renderer process via IPC.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { InitiativeSyncSchema, SyncEventSchema } from '../shared/ipc-schemas'
import { getBmoAccessHeaders, getBmoApiKey, getBmoBaseUrl } from './bmo-config'
import { logToFile } from './log'

const TIMEOUT_MS = 15_000
const SYNC_RECEIVER_PORT = parseInt(process.env.BMO_SYNC_PORT || '5001', 10)
// Phase 28a.2 / PHASE-22 22D — loopback by default. The env override BMO_SYNC_BIND
// always wins; otherwise the keyed opt-in setting (applySyncBindFromSettings) may
// raise it to 0.0.0.0 for LAN reach. Never 0.0.0.0 without a shared secret.
const SYNC_BIND_ENV =
  process.env.BMO_SYNC_BIND && process.env.BMO_SYNC_BIND.trim() !== '' ? process.env.BMO_SYNC_BIND : ''
let SYNC_BIND = SYNC_BIND_ENV || '127.0.0.1'

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

// Security coupling (SEC log 2026-06-22): a non-loopback bind reach REQUIRES a
// configured shared secret. Returns the requested host when it is loopback or a
// key exists; otherwise refuses the non-loopback bind and forces loopback. This
// closes the gap where the BMO_SYNC_BIND env override bound 0.0.0.0 with no key
// (the settings path already required a key; the env path did not).
export function enforceKeyedBind(requested: string): string {
  if (isLoopbackHost(requested) || getBmoApiKey()) return requested
  logToFile(
    'ERROR',
    `[bmo-bridge] Refusing to bind sync receiver to non-loopback host ${requested} with no shared secret configured — forcing 127.0.0.1. Set BMO_API_KEY (or bmoApiKey in settings) to enable LAN reach.`
  )
  return '127.0.0.1'
}
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
  seenEventIds.clear()
}

interface BridgeResponse {
  ok?: boolean
  error?: string
  statusCode?: number
  [key: string]: unknown
}

// Phase 28c.1 — track consecutive bridge failures so we can warn once.
let consecutiveBmoFailures = 0

// PHASE-20 20F (F2): the single automatic narration gate lives in the main
// process (it has the parsed npc/emotion). Default OFF — narration is opt-in;
// the renderer's narration-tts store pushes the real value via IPC on load + set.
let narrationEnabled = false
export function setNarrationEnabled(v: boolean): void {
  narrationEnabled = v
}
export function isNarrationEnabled(): boolean {
  return narrationEnabled
}

// PHASE-21 21B (F7): barge-in. Default OFF — new narration replaces stale audio
// only when the DM opts in. The renderer's narration-tts store pushes the value
// via IPC, mirroring narrationEnabled.
let bargeInEnabled = false
export function setBargeInEnabled(v: boolean): void {
  bargeInEnabled = v
}
export function isBargeInEnabled(): boolean {
  return bargeInEnabled
}

// PHASE-22 22D (F6): resolve the sync-receiver bind host. Precedence: env
// BMO_SYNC_BIND always wins; else a keyed opt-in (LAN setting ON + a shared
// secret configured) → 0.0.0.0; else loopback. Returns the chosen host (and, when
// it changes while the receiver is up, restarts it on the new host).
export function applySyncBindFromSettings(settings: { bmoSyncLanEnabled?: boolean } | null | undefined): string {
  let host = '127.0.0.1'
  if (SYNC_BIND_ENV) {
    host = enforceKeyedBind(SYNC_BIND_ENV)
  } else if (settings?.bmoSyncLanEnabled === true) {
    if (getBmoApiKey()) {
      host = '0.0.0.0'
    } else {
      logToFile('WARN', '[bmo-bridge] LAN sync bind requested but no shared secret configured — staying on loopback')
    }
  }
  if (host !== SYNC_BIND) {
    SYNC_BIND = host
    if (syncServer) {
      void stopSyncReceiver().then(() => startSyncReceiver())
    }
  }
  return SYNC_BIND
}
function notifyBmoUnreachable(): void {
  // PHASE-22 22D (F4): emit a dedicated `bmo_unreachable` event — the renderer owns
  // the (truthful) wording. The old version faked a `discord_message` on a dead
  // channel with a "paused" lie.
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(IPC_CHANNELS.BMO_SYNC_EVENT, {
      type: 'bmo_unreachable',
      payload: {},
      timestamp: Date.now()
    } satisfies SyncEvent)
  }
}

/** Standard sync event types sent from the Pi Discord bot. `bmo_unreachable` is
 *  main-internal (never from the Pi) but in the union so the renderer type is complete. */
export interface SyncEvent {
  type:
    | 'discord_message'
    | 'initiative_sync'
    | 'state_request'
    | 'player_join'
    | 'player_leave'
    | 'discord_roll'
    | 'bmo_unreachable'
  payload: Record<string, unknown>
  timestamp: number
  /** Idempotency key (BMO stamps a uuid; the bridge dedups retries on it). */
  eventId?: string
}

// Dedup BMO sync events by eventId. BMO retries the POST on a transient failure
// with the SAME eventId, so without this a roll/message could be applied twice
// (e.g. the VTT processed the event but BMO never saw the 200 and retried). A
// bounded insertion-ordered Set caps memory; older ids age out.
const SEEN_EVENT_IDS_MAX = 500
const seenEventIds = new Set<string>()
/** True if this eventId was already handled. First sighting records the id. */
function isDuplicateSyncEvent(eventId: string | undefined): boolean {
  if (!eventId) return false // pre-retry BMO builds send none → never dedup
  if (seenEventIds.has(eventId)) return true
  seenEventIds.add(eventId)
  if (seenEventIds.size > SEEN_EVENT_IDS_MAX) {
    const oldest = seenEventIds.values().next().value
    if (oldest !== undefined) seenEventIds.delete(oldest)
  }
  return false
}

/** PHASE-31 31E — per-call overrides: a longer timeout (recap LLM call) + retry suppression. */
interface FetchOpts {
  timeoutMs?: number
  retry?: boolean
}

async function bmoPiFetchOnce(path: string, options?: RequestInit, opts?: FetchOpts): Promise<BridgeResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? TIMEOUT_MS)

  try {
    const res = await fetch(`${getBmoBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getBmoAccessHeaders(),
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
async function bmoPiFetch(path: string, options?: RequestInit, opts?: FetchOpts): Promise<BridgeResponse> {
  // retry:false ⇒ a single attempt (a retried recap would re-bill the cloud LLM — F6).
  const maxAttempts = opts?.retry === false ? 0 : RETRY_BACKOFF_MS.length
  let last: BridgeResponse = { ok: false, error: 'unknown' }
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    last = await bmoPiFetchOnce(path, options, opts)
    if (last.ok) {
      consecutiveBmoFailures = 0
      return last
    }
    // A 4xx means the Pi answered and is healthy (e.g. 404 "no active DM
    // session"). PHASE-20 20F (F6): don't retry AND don't count it toward
    // "BMO unreachable" — reset the counter and return.
    if (typeof last.statusCode === 'number' && last.statusCode >= 400 && last.statusCode < 500) {
      consecutiveBmoFailures = 0
      return last
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]))
    }
  }
  // Only reached on network errors / 5xx (genuine unreachability).
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

/**
 * PHASE-31 31E — fetch a recap of the live Discord DM session WITHOUT ending it
 * (`mode='live'`), or the most recent stored summary (`mode='last'`). A long timeout
 * (50s > the Pi's 45s recap budget) and NO retry — a retried timeout would re-bill the LLM.
 */
export async function getDiscordRecap(mode: 'live' | 'last' = 'live'): Promise<BridgeResponse> {
  const path = `/api/discord/dm/recap${mode === 'last' ? '?mode=last' : ''}`
  return bmoPiFetch(path, { method: 'GET' }, { timeoutMs: 50_000, retry: false })
}

export interface NarrationOpts {
  npc?: string
  emotion?: string
  speaker?: string
  interrupt?: boolean
}

export async function sendNarration(text: string, opts: NarrationOpts = {}): Promise<BridgeResponse> {
  // PHASE-20 20F (F4): a per-request event_id makes narrate idempotent — the Pi
  // control server de-dupes retries instead of double-speaking.
  // PHASE-21 21B/21C: opts carries speaker (per-NPC casting) + interrupt (barge-in).
  return bmoPiFetch('/api/discord/dm/narrate', {
    method: 'POST',
    body: JSON.stringify({ text, ...opts, event_id: randomUUID() })
  })
}

// PHASE-21 21B (F7): barge-in — flush the Pi narration queue + stop playback.
export async function cancelNarration(): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/narrate/cancel', { method: 'POST' })
}

// PHASE-21 21C: per-NPC voice-cast management (shared JSON on the Pi, no bot hop).
export async function getVoiceCast(campaignId: string): Promise<BridgeResponse> {
  return bmoPiFetch(`/api/discord/dm/voices?campaign_id=${encodeURIComponent(campaignId)}`)
}

export async function setVoiceCast(payload: {
  campaignId: string
  speaker: string
  voiceId?: string
  speed?: number
  pitch?: number
}): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/voices', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: payload.campaignId,
      speaker: payload.speaker,
      voice_id: payload.voiceId,
      speed: payload.speed,
      pitch: payload.pitch
    })
  })
}

export async function resetVoiceCast(campaignId: string, speaker: string): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/voices', {
    method: 'DELETE',
    body: JSON.stringify({ campaign_id: campaignId, speaker })
  })
}

export async function getDmStatus(): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/dm/status')
}

// ─── PHASE-36 36D: play-by-post turn queue ───
// Every advance/skip carries a fresh event_id so bmoPiFetch's 5xx/network retry can never
// double-advance the queue (the Pi de-dupes on event_id); expected_turn_index adds optimistic
// concurrency against two distinct advance intents racing.
export interface PbpStartPayload {
  campaignId: string
  scene: string
  participants: Array<{ name: string; character?: string }>
  channelId?: string
  reminderHours?: number
  autoSkip?: boolean
}

export async function pbpStart(p: PbpStartPayload): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/pbp/start', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: p.campaignId,
      scene: p.scene,
      participants: p.participants,
      channel_id: p.channelId,
      reminder_hours: p.reminderHours,
      auto_skip: p.autoSkip
    })
  })
}

export async function pbpAdvance(
  campaignId: string,
  opts: { expectedTurnIndex?: number; excerpt?: string } = {}
): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/pbp/advance', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: campaignId,
      event_id: randomUUID(),
      expected_turn_index: opts.expectedTurnIndex,
      excerpt: opts.excerpt
    })
  })
}

export async function pbpSkip(campaignId: string, opts: { expectedTurnIndex?: number } = {}): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/pbp/skip', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: campaignId,
      event_id: randomUUID(),
      expected_turn_index: opts.expectedTurnIndex
    })
  })
}

export async function pbpSetScene(
  campaignId: string,
  scene: string,
  participants?: PbpStartPayload['participants']
): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/pbp/scene', {
    method: 'POST',
    body: JSON.stringify({ campaign_id: campaignId, scene, participants })
  })
}

export async function pbpStop(campaignId: string): Promise<BridgeResponse> {
  return bmoPiFetch('/api/discord/pbp/stop', { method: 'POST', body: JSON.stringify({ campaign_id: campaignId }) })
}

export async function pbpStatus(campaignId: string): Promise<BridgeResponse> {
  return bmoPiFetch(`/api/discord/pbp/status?campaign_id=${encodeURIComponent(campaignId)}`)
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

// Constant-time secret comparison. Hash both sides to equal-length digests so
// neither the byte-by-byte short-circuit of `!==` nor a raw length difference
// leaks information about the configured key (defense-in-depth; SEC log 2026-06-22).
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
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
      // `/api/v1/sync/health` is the versioned alias (mirrors BMO's /api/v1/* aliases); both
      // map to the same response. `apiVersion` advertises the contract; `version` is retained.
      if (req.method === 'GET' && (req.url === '/api/sync/health' || req.url === '/api/v1/sync/health')) {
        sendJson(res, 200, { ok: true, version: '1.0.0', apiVersion: 'v1' })
        return
      }

      // State request — Pi is asking for current VTT state. Triggers the renderer
      // to serialize + push full game state, so it carries the SAME rate-limit +
      // (key-present) Bearer gate as the POST surface; otherwise any unauthenticated
      // LAN host could repeatedly force a state push (auth inconsistency + DoS).
      if (req.method === 'GET' && req.url === '/api/sync/state') {
        // 1) Rate limit per source IP (same bucket as POST).
        const ip = clientIp(req)
        if (!rateLimitOk(ip)) {
          sendJson(res, 429, { error: 'rate limit exceeded' }, { 'Retry-After': '60' })
          return
        }
        // 2) Bearer auth when a key is configured (Pi already sends it on POSTs).
        const expected = getBmoApiKey()
        if (expected) {
          const token = getBearerToken(req)
          if (!token || !timingSafeEqualStr(token, expected)) {
            sendJson(res, 401, { error: 'unauthorized' })
            return
          }
        }
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
          if (!token || !timingSafeEqualStr(token, expected)) {
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
          // Dedup retried events: ack with 200 (so BMO stops retrying) but do
          // NOT re-forward to the renderer — the first delivery already applied it.
          if (isDuplicateSyncEvent(parsed.data.eventId)) {
            logToFile(
              'INFO',
              `[bmo-bridge] Duplicate sync event ${parsed.data.eventId} (${parsed.data.type}) — acked, not re-forwarded`
            )
            sendJson(res, 200, { ok: true, duplicate: true })
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
        // PHASE-22 22D (F4): dedicated main→renderer channel — BMO_SYNC_INITIATIVE
        // stays invoke-only (renderer→main push), no more double-use.
        forwardToRenderer(IPC_CHANNELS.BMO_SYNC_INITIATIVE_EVENT, parsed.data)
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
  // SEC log 2026-06-22 — final authoritative guard: never bind non-loopback
  // without a configured shared secret, regardless of how SYNC_BIND was set.
  SYNC_BIND = enforceKeyedBind(SYNC_BIND)
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
