import { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  announceGame,
  deregisterGame,
  heartbeatGame,
  listGames,
  type RegistryGameEntryRaw,
  type RegistryPushEvent,
  subscribeToRegistry,
  unsubscribeFromRegistry,
  updateGame
} from './registry-bridge'

// Capture everything the bridge would push to renderer windows. The electron
// mock's BrowserWindow has no getAllWindows, so we supply one fake window whose
// webContents.send records (channel, payload).
const sent: Array<{ channel: string; payload: unknown }> = []
const fakeWin = {
  isDestroyed: () => false,
  webContents: {
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    }
  }
}

function pushedEvents(subscriptionId: string): RegistryPushEvent[] {
  return sent
    .filter((s) => s.channel === 'registry:event')
    .map((s) => s.payload as { subscriptionId: string; event: RegistryPushEvent })
    .filter((p) => p.subscriptionId === subscriptionId)
    .map((p) => p.event)
}

function entry(overrides: Partial<RegistryGameEntryRaw> & { invite_code: string }): RegistryGameEntryRaw {
  return {
    name: 'Table',
    host_display_name: 'Host',
    host_client_id: 'host-1',
    current_players: 1,
    max_players: 6,
    current_spectators: 0,
    max_spectators: 4,
    game_system: '5e',
    is_private: false,
    peer_id: `peer-${overrides.invite_code}`,
    created_at: 0,
    banned_from_this_game: false,
    ...overrides
  }
}

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  sent.length = 0
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([fakeWin] as unknown as BrowserWindow[])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('registry-bridge REST', () => {
  it('announceGame POSTs and returns ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' } as Response)
    const res = await announceGame(
      {
        invite_code: 'AAA',
        name: 'T',
        host_display_name: 'H',
        host_client_id: 'c',
        current_players: 1,
        max_players: 6,
        current_spectators: 0,
        max_spectators: 4,
        game_system: '5e',
        is_private: false,
        peer_id: 'p'
      },
      'http://pi.test'
    )
    expect(res.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://pi.test/api/games')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('announceGame surfaces an HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'boom', text: async () => '' } as Response)
    const res = await announceGame(
      {
        invite_code: 'AAA',
        name: 'T',
        host_display_name: 'H',
        host_client_id: 'c',
        current_players: 1,
        max_players: 6,
        current_spectators: 0,
        max_spectators: 4,
        game_system: '5e',
        is_private: false,
        peer_id: 'p'
      },
      'http://pi.test'
    )
    expect(res.ok).toBe(false)
    expect(res.error).toContain('500')
  })

  it('updateGame PATCHes the invite code', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    const res = await updateGame('AB CD', { current_players: 2 }, 'http://pi.test')
    expect(res.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('http://pi.test/api/games/AB%20CD')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PATCH')
  })

  it('heartbeatGame POSTs to /heartbeat', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response)
    const res = await heartbeatGame('AAA', 'http://pi.test')
    expect(res.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('http://pi.test/api/games/AAA/heartbeat')
  })

  it('deregisterGame DELETEs', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response)
    const res = await deregisterGame('AAA', 'http://pi.test')
    expect(res.ok).toBe(true)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('listGames returns the raw entries', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ games: [entry({ invite_code: 'AAA' })] }))
    const games = await listGames('client-1', 'http://pi.test')
    expect(games).toHaveLength(1)
    expect(games[0].invite_code).toBe('AAA')
    expect(fetchMock.mock.calls[0][0]).toBe('http://pi.test/api/games?client_id=client-1')
  })

  it('listGames throws on a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    await expect(listGames(null, 'http://pi.test')).rejects.toThrow('503')
  })
})

describe('registry-bridge polling live feed', () => {
  it('emits an initial snapshot then added/updated/removed deltas', async () => {
    vi.useFakeTimers()
    const subId = 'sub-test-1'

    // Poll #1 → snapshot of [AAA]. Poll #2 → AAA updated + BBB added.
    // Poll #3 → BBB removed (only AAA remains, unchanged).
    fetchMock
      .mockResolvedValueOnce(jsonOk({ games: [entry({ invite_code: 'AAA', current_players: 1 })] }))
      .mockResolvedValueOnce(
        jsonOk({ games: [entry({ invite_code: 'AAA', current_players: 3 }), entry({ invite_code: 'BBB' })] })
      )
      .mockResolvedValueOnce(jsonOk({ games: [entry({ invite_code: 'AAA', current_players: 3 })] }))

    subscribeToRegistry(subId, null)
    // First poll fires on the next microtask/tick of the async IIFE.
    await vi.advanceTimersByTimeAsync(0)
    expect(pushedEvents(subId)[0]).toEqual({
      type: 'snapshot',
      games: [expect.objectContaining({ invite_code: 'AAA', current_players: 1 })]
    })

    // Poll #2 (after 4s): AAA updated, BBB added.
    await vi.advanceTimersByTimeAsync(4_000)
    const afterSecond = pushedEvents(subId)
    expect(afterSecond.some((e) => e.type === 'updated' && e.game.invite_code === 'AAA')).toBe(true)
    expect(afterSecond.some((e) => e.type === 'added' && e.game.invite_code === 'BBB')).toBe(true)

    // Poll #3 (after another 4s): BBB removed, AAA unchanged → no extra update.
    await vi.advanceTimersByTimeAsync(4_000)
    const afterThird = pushedEvents(subId)
    expect(afterThird.some((e) => e.type === 'removed' && e.inviteCode === 'BBB')).toBe(true)

    unsubscribeFromRegistry(subId)
  })

  it('emits an error event when a poll fails', async () => {
    vi.useFakeTimers()
    const subId = 'sub-err'
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    subscribeToRegistry(subId, null)
    await vi.advanceTimersByTimeAsync(0)
    const events = pushedEvents(subId)
    expect(events.some((e) => e.type === 'error' && e.error.includes('network down'))).toBe(true)
    unsubscribeFromRegistry(subId)
  })

  it('stops polling after unsubscribe', async () => {
    vi.useFakeTimers()
    const subId = 'sub-stop'
    fetchMock.mockResolvedValue(jsonOk({ games: [] }))
    subscribeToRegistry(subId, null)
    await vi.advanceTimersByTimeAsync(0)
    const callsAfterFirst = fetchMock.mock.calls.length
    unsubscribeFromRegistry(subId)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
  })
})
