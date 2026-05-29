// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistryAnnouncePayload } from './registry-client'

// Verifies the fail-closed BMO integration: the registry client sends the
// configured BMO API key as `Authorization: Bearer` on header-capable requests
// and as an `api_key` query param on the SSE stream (EventSource can't set
// headers).

const PAYLOAD: RegistryAnnouncePayload = {
  invite_code: 'ABCD',
  name: 'Test Game',
  host_display_name: 'DM',
  host_client_id: 'client-1',
  current_players: 1,
  max_players: 5,
  current_spectators: 0,
  max_spectators: 0,
  game_system: 'dnd5e',
  is_private: false,
  peer_id: 'peer-1'
}

let fetchMock: ReturnType<typeof vi.fn>
let esUrls: string[]

function setSettings(settings: Record<string, unknown>): void {
  ;(window as unknown as { api: { loadSettings: () => Promise<unknown> } }).api = {
    loadSettings: vi.fn().mockResolvedValue(settings)
  }
}

beforeEach(() => {
  esUrls = []
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '',
    json: async () => ({ games: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  class StubEventSource {
    url: string
    constructor(url: string) {
      this.url = url
      esUrls.push(url)
    }
    addEventListener(): void {}
    close(): void {}
  }
  vi.stubGlobal('EventSource', StubEventSource as unknown as typeof EventSource)
  setSettings({ bmoPiBaseUrl: 'http://test.local', bmoApiKey: 'secret-key' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('registry-client BMO auth', () => {
  it('sends Authorization: Bearer on announce when a key is configured', async () => {
    const { announceGame } = await import('./registry-client')
    await announceGame(PAYLOAD)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers.Authorization).toBe('Bearer secret-key')
  })

  it('omits Authorization when no key is configured', async () => {
    setSettings({ bmoPiBaseUrl: 'http://test.local' })
    const { listGames } = await import('./registry-client')
    await listGames(null)
    const init = (fetchMock.mock.calls[0][1] ?? {}) as { headers?: Record<string, string> }
    expect(init.headers?.Authorization).toBeUndefined()
  })

  it('appends api_key to the SSE stream URL (EventSource cannot set headers)', async () => {
    const { subscribeToRegistry } = await import('./registry-client')
    const stop = subscribeToRegistry(
      'client-1',
      () => {},
      () => {}
    )
    await vi.waitFor(() => expect(esUrls.length).toBeGreaterThan(0))
    expect(esUrls[0]).toContain('api_key=secret-key')
    expect(esUrls[0]).toContain('client_id=client-1')
    stop()
  })

  it('omits api_key from the SSE URL when no key is configured', async () => {
    setSettings({ bmoPiBaseUrl: 'http://test.local' })
    const { subscribeToRegistry } = await import('./registry-client')
    const stop = subscribeToRegistry(
      null,
      () => {},
      () => {}
    )
    await vi.waitFor(() => expect(esUrls.length).toBeGreaterThan(0))
    expect(esUrls[0]).not.toContain('api_key=')
    stop()
  })
})
