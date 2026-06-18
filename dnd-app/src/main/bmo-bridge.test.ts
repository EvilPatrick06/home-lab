import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// PHASE-20 20F: a send-spy window so we can assert whether the "BMO unreachable"
// sync event was broadcast (it goes through win.webContents.send).
const { sendSpy } = vi.hoisted(() => ({ sendSpy: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: sendSpy } }] }
}))
vi.mock('./log', () => ({ logToFile: vi.fn() }))

// `getBmoApiKey` is read from bmo-config; we mock it via vi.hoisted so the
// reference survives vi.mock's hoist pass, then individual tests can toggle
// whether the sync receiver is in authenticated mode.
const { getBmoApiKey } = vi.hoisted(() => ({
  getBmoApiKey: vi.fn<() => string | undefined>(() => undefined)
}))
vi.mock('./bmo-config', () => ({
  getBmoBaseUrl: () => 'http://127.0.0.1:5000',
  getBmoAccessHeaders: () => ({}),
  getBmoApiKey
}))

import { IPC_CHANNELS } from '../shared/ipc-channels'
import { SyncEventSchema } from '../shared/ipc-schemas'
import {
  __resetSyncReceiverState,
  applySyncBindFromSettings,
  cancelNarration,
  getDiscordRecap,
  getDmStatus,
  pbpAdvance,
  pbpStart,
  pbpStatus,
  sendNarration,
  startDiscordDm,
  startSyncReceiver,
  stopSyncReceiver
} from './bmo-bridge'

describe('bmoPiFetch retry/backoff (Phase 28c.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retries transient failures then succeeds on the third attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'running' }) })
    vi.stubGlobal('fetch', fetchMock)

    const p = getDmStatus()
    await vi.runAllTimersAsync()
    const result = await p

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(true)
    expect((result as { status?: string }).status).toBe('running')
  })

  it('does not retry a 4xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' })
    vi.stubGlobal('fetch', fetchMock)

    const p = startDiscordDm('11111111-1111-1111-1111-111111111111')
    await vi.runAllTimersAsync()
    const result = await p

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(400)
  })

  it('a 4xx response never trips the unreachable event (F6)', async () => {
    sendSpy.mockClear()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    vi.stubGlobal('fetch', fetchMock)
    for (let i = 0; i < 3; i++) {
      const p = getDmStatus()
      await vi.runAllTimersAsync()
      await p
    }
    const unreachable = sendSpy.mock.calls.find((c) => JSON.stringify(c).includes('unreachable'))
    expect(unreachable).toBeUndefined()
  })

  it('emits the unreachable event after 3 network failures', async () => {
    sendSpy.mockClear()
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    vi.stubGlobal('fetch', fetchMock)
    for (let i = 0; i < 3; i++) {
      const p = getDmStatus()
      await vi.runAllTimersAsync()
      await p
    }
    const unreachable = sendSpy.mock.calls.find((c) => JSON.stringify(c).includes('unreachable'))
    expect(unreachable).toBeDefined()
    // PHASE-22 22D: honest dedicated event on the sync-event channel, schema-valid.
    expect(unreachable?.[0]).toBe(IPC_CHANNELS.BMO_SYNC_EVENT)
    expect((unreachable?.[1] as { type?: string })?.type).toBe('bmo_unreachable')
    expect(SyncEventSchema.safeParse(unreachable?.[1]).success).toBe(true)
  })

  it('applySyncBindFromSettings keeps loopback without a key, raises to 0.0.0.0 with one', () => {
    // getBmoApiKey is the hoisted mock; toggle it to simulate a configured secret.
    getBmoApiKey.mockReturnValue(undefined)
    expect(applySyncBindFromSettings({ bmoSyncLanEnabled: true })).toBe('127.0.0.1')
    getBmoApiKey.mockReturnValue('shared-secret')
    expect(applySyncBindFromSettings({ bmoSyncLanEnabled: true })).toBe('0.0.0.0')
    expect(applySyncBindFromSettings({ bmoSyncLanEnabled: false })).toBe('127.0.0.1')
    getBmoApiKey.mockReturnValue(undefined)
  })

  // PHASE-31 31E — recap fetch: 50s/no-retry + mode query.
  it('getDiscordRecap("last") hits ?mode=last and does NOT retry on a 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' })
    vi.stubGlobal('fetch', fetchMock)
    const p = getDiscordRecap('last')
    await vi.runAllTimersAsync()
    const result = await p
    expect(fetchMock).toHaveBeenCalledTimes(1) // no retry — a retried recap would re-bill the LLM
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/discord/dm/recap?mode=last')
    expect(result.ok).toBe(false)
  })

  it('getDiscordRecap("live") omits the mode query and returns the recap body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, recap: 'Previously…' }) })
    vi.stubGlobal('fetch', fetchMock)
    const p = getDiscordRecap('live')
    await vi.runAllTimersAsync()
    const result = await p
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/discord/dm/recap')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('mode=last')
    expect((result as { recap?: string }).recap).toBe('Previously…')
  })

  it('sendNarration carries a unique event_id (F4 idempotency key)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: 'queued' }) })
    vi.stubGlobal('fetch', fetchMock)
    // PHASE-21 21B: single opts object (npc/emotion/speaker/interrupt).
    const p = sendNarration('hello there', { npc: 'goblin', emotion: 'angry', interrupt: true })
    await vi.runAllTimersAsync()
    await p
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.text).toBe('hello there')
    expect(body.npc).toBe('goblin')
    expect(body.interrupt).toBe(true)
    expect(typeof body.event_id).toBe('string')
    expect(body.event_id.length).toBeGreaterThan(0)
  })

  it('cancelNarration POSTs to the cancel route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, cancelled: true, flushed: 0 }) })
    vi.stubGlobal('fetch', fetchMock)
    const p = cancelNarration()
    await vi.runAllTimersAsync()
    await p
    expect(fetchMock.mock.calls[0][0]).toContain('/api/discord/dm/narrate/cancel')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })
})

// ── Sync receiver hardening (Phase 28a.2/.3/.4) ────────────────────
describe('sync receiver hardening (Phase 28a.2/.3/.4)', () => {
  const TEST_PORT = 5099
  const BASE = `http://127.0.0.1:${TEST_PORT}`

  const validEvent = {
    type: 'discord_message',
    timestamp: 1_700_000_000_000,
    payload: { text: 'hello', author: 'alice' }
  }

  beforeAll(() => {
    startSyncReceiver(TEST_PORT)
  })

  afterAll(async () => {
    await stopSyncReceiver()
  })

  beforeEach(() => {
    __resetSyncReceiverState()
    getBmoApiKey.mockReturnValue(undefined)
  })

  it('happy path: 200 on valid POST /api/sync with no auth required', async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent)
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  })

  it('dedups a retried sync event by eventId (acks the duplicate, no re-forward)', async () => {
    const event = { ...validEvent, eventId: 'evt-abc-123' }
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) }
    const first = await fetch(`${BASE}/api/sync`, opts)
    expect(first.status).toBe(200)
    expect((await first.json()) as { duplicate?: boolean }).not.toHaveProperty('duplicate', true)
    // BMO retries the same eventId after a missed 200 — must be acked but skipped.
    const second = await fetch(`${BASE}/api/sync`, opts)
    expect(second.status).toBe(200)
    expect((await second.json()) as { duplicate?: boolean }).toHaveProperty('duplicate', true)
  })

  it('does NOT dedup events without an eventId (pre-retry BMO back-compat)', async () => {
    // validEvent carries no eventId — both posts must be forwarded (no dedup).
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validEvent) }
    const a = (await (await fetch(`${BASE}/api/sync`, opts)).json()) as { duplicate?: boolean }
    const b = (await (await fetch(`${BASE}/api/sync`, opts)).json()) as { duplicate?: boolean }
    expect(a.duplicate).toBeUndefined()
    expect(b.duplicate).toBeUndefined()
  })

  it('health check stays open (no auth, no rate limit)', async () => {
    getBmoApiKey.mockReturnValue('secret-token')
    // Burst well past the bucket size; health remains 200.
    for (let i = 0; i < 75; i++) {
      const res = await fetch(`${BASE}/api/sync/health`)
      expect(res.status).toBe(200)
    }
  })

  it('serves the versioned /api/v1/sync/health alias with apiVersion', async () => {
    getBmoApiKey.mockReturnValue('secret-token')
    const res = await fetch(`${BASE}/api/v1/sync/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, version: '1.0.0', apiVersion: 'v1' })
  })

  it('returns 415 on non-JSON Content-Type', async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validEvent)
    })
    expect(res.status).toBe(415)
  })

  it('returns 413 when body exceeds 64KB cap', async () => {
    const big = 'x'.repeat(70 * 1024)
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validEvent, payload: { text: big } })
    })
    expect(res.status).toBe(413)
  })

  it('returns 401 when API key is configured and Authorization is missing', async () => {
    getBmoApiKey.mockReturnValue('secret-token')
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent)
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when Bearer token does not match', async () => {
    getBmoApiKey.mockReturnValue('secret-token')
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-token'
      },
      body: JSON.stringify(validEvent)
    })
    expect(res.status).toBe(401)
  })

  it('accepts a matching Bearer token (200)', async () => {
    getBmoApiKey.mockReturnValue('secret-token')
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token'
      },
      body: JSON.stringify(validEvent)
    })
    expect(res.status).toBe(200)
  })

  it('returns 400 with issues array when Zod validation fails', async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unknown_type', timestamp: 1, payload: {} })
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; issues: unknown[] }
    expect(body.error).toBe('invalid payload')
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it('returns 400 on malformed JSON', async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    })
    expect(res.status).toBe(400)
  })

  it('rate-limits after 60 requests with 429 + Retry-After', async () => {
    // First 60 should succeed.
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${BASE}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validEvent)
      })
      expect(res.status).toBe(200)
    }
    // 61st should be rate-limited.
    const limited = await fetch(`${BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent)
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
  })

  it('validates initiative endpoint with InitiativeSyncSchema', async () => {
    const good = await fetch(`${BASE}/api/sync/initiative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [{ entityName: 'Bob', entityType: 'pc', isActive: true }],
        currentIndex: 0,
        round: 1
      })
    })
    expect(good.status).toBe(200)

    __resetSyncReceiverState()
    const bad = await fetch(`${BASE}/api/sync/initiative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ entityName: 'Bob' }], currentIndex: 0, round: 1 })
    })
    expect(bad.status).toBe(400)
  })

  it('forwards initiative on the dedicated bmo:sync-initiative-event channel (22D)', async () => {
    sendSpy.mockClear()
    __resetSyncReceiverState()
    const res = await fetch(`${BASE}/api/sync/initiative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [{ entityName: 'Bob', entityType: 'pc', isActive: true }],
        currentIndex: 0,
        round: 1
      })
    })
    expect(res.status).toBe(200)
    const call = sendSpy.mock.calls.find((c) => c[0] === IPC_CHANNELS.BMO_SYNC_INITIATIVE_EVENT)
    expect(call).toBeDefined() // not the double-used invoke channel
  })
})

// PHASE-36 36D — play-by-post bridge functions
describe('play-by-post bridge (PHASE-36 36D)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('pbpAdvance POSTs to /api/discord/pbp/advance with a non-empty event_id + snake_case keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: 'advanced' }) })
    vi.stubGlobal('fetch', fetchMock)
    const p = pbpAdvance('c1', { expectedTurnIndex: 2 })
    await vi.runAllTimersAsync()
    await p
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/discord/pbp/advance')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.campaign_id).toBe('c1')
    expect(body.expected_turn_index).toBe(2)
    expect(typeof body.event_id).toBe('string')
    expect(body.event_id.length).toBeGreaterThan(0)
  })

  it('generates a different event_id on each advance', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const p1 = pbpAdvance('c1')
    await vi.runAllTimersAsync()
    await p1
    const p2 = pbpAdvance('c1')
    await vi.runAllTimersAsync()
    await p2
    const id1 = JSON.parse(fetchMock.mock.calls[0][1].body).event_id
    const id2 = JSON.parse(fetchMock.mock.calls[1][1].body).event_id
    expect(id1).not.toBe(id2)
  })

  it('pbpStart maps the camelCase payload to a snake_case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const p = pbpStart({
      campaignId: 'c1',
      scene: 'Crypt',
      participants: [{ name: 'A' }],
      reminderHours: 48,
      autoSkip: true
    })
    await vi.runAllTimersAsync()
    await p
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.campaign_id).toBe('c1')
    expect(body.reminder_hours).toBe(48)
    expect(body.auto_skip).toBe(true)
  })

  it('pbpStatus hits the query-string URL with the campaign id encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, session: null }) })
    vi.stubGlobal('fetch', fetchMock)
    const p = pbpStatus('c1/x')
    await vi.runAllTimersAsync()
    await p
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/discord/pbp/status?campaign_id=c1%2Fx')
  })
})
