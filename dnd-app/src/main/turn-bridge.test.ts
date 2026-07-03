import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SECURITY 2026-07-02 — the CF-Access service token must be gated on the trust
 * of the ACTUAL fetch target, not the resolved base. These tests pin that the
 * bridge asks bmo-config about the exact URL it is about to fetch, and that a
 * malformed override falls back to the resolved base.
 */

const mocks = vi.hoisted(() => ({
  getBmoBaseUrl: vi.fn(() => 'https://trusted.example'),
  getBmoAccessHeadersForUrl: vi.fn((url: string) =>
    url === 'https://trusted.example' ? { 'CF-Access-Client-Id': 'id', 'CF-Access-Client-Secret': 'secret' } : {}
  )
}))

vi.mock('./bmo-config', () => mocks)

import { fetchTurnCredentials } from './turn-bridge'

const fetchMock = vi.fn()

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

const CREDS = { username: 'u', credential: 'c', ttl: 60, urls: ['turn:pi:3478'] }

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('turn-bridge credential trust follows the ACTUAL fetch target', () => {
  it('attaches CF-Access headers when fetching the trusted resolved base', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk(CREDS))
    const creds = await fetchTurnCredentials()
    expect(creds?.username).toBe('u')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://trusted.example/api/turn-credentials')
    expect(mocks.getBmoAccessHeadersForUrl).toHaveBeenCalledWith('https://trusted.example')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['CF-Access-Client-Id']).toBe('id')
  })

  it('computes trust from the override target — an untrusted override gets NO credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk(CREDS))
    await fetchTurnCredentials('https://attacker.example')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://attacker.example/api/turn-credentials')
    expect(mocks.getBmoAccessHeadersForUrl).toHaveBeenCalledWith('https://attacker.example')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toEqual({})
  })

  it('ignores a malformed override and falls back to the resolved base', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk(CREDS))
    await fetchTurnCredentials('not a url')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://trusted.example/api/turn-credentials')
  })

  it('ignores a non-http(s) override and falls back to the resolved base', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk(CREDS))
    await fetchTurnCredentials('file:///etc/passwd')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://trusted.example/api/turn-credentials')
  })
})
