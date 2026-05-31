import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./log', () => ({ logToFile: vi.fn() }))

// `getBmoApiKey` is read from bmo-config; we mock it via vi.hoisted so the
// reference survives vi.mock's hoist pass, then individual tests can toggle
// whether the sync receiver is in authenticated mode.
const { getBmoApiKey } = vi.hoisted(() => ({
  getBmoApiKey: vi.fn<() => string | undefined>(() => undefined)
}))
vi.mock('./bmo-config', () => ({
  getBmoBaseUrl: () => 'http://127.0.0.1:5000',
  getBmoApiKey
}))

import {
  __resetSyncReceiverState,
  getDmStatus,
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
})
