import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./log', () => ({ logToFile: vi.fn() }))
vi.mock('./bmo-config', () => ({ getBmoBaseUrl: () => 'http://127.0.0.1:5000' }))

import { getDmStatus, startDiscordDm } from './bmo-bridge'

describe('bmoPiFetch retry/backoff (Phase 28c.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
