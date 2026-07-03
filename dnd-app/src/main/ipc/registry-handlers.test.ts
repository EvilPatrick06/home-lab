import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SECURITY 2026-07-02 — renderer-supplied `baseOverride` hardening. The IPC
 * layer must (a) zod-validate the argument tuple and (b) narrow the override
 * to KNOWN Pi bases (sanitizeRendererBaseOverride): an unknown/invalid
 * override is dropped so the bridge falls back to the resolved base, and an
 * arbitrary attacker URL is unexpressable over IPC.
 */

const { mockHandle, mockFetchTurnCredentials, mockListGames, mockAnnounceGame, mockHeartbeatGame } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockFetchTurnCredentials: vi.fn(),
  mockListGames: vi.fn(),
  mockAnnounceGame: vi.fn(),
  mockHeartbeatGame: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: mockHandle } }))
vi.mock('../log', () => ({ logToFile: vi.fn() }))
vi.mock('../turn-bridge', () => ({ fetchTurnCredentials: mockFetchTurnCredentials }))
vi.mock('../registry-bridge', () => ({
  announceGame: mockAnnounceGame,
  deregisterGame: vi.fn(),
  heartbeatGame: mockHeartbeatGame,
  listGames: mockListGames,
  subscribeToRegistry: vi.fn(),
  unsubscribeFromRegistry: vi.fn(),
  updateGame: vi.fn()
}))

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { BMO_PI_URL_DEFAULT } from '../bmo-config'
import { registerRegistryHandlers } from './registry-handlers'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

function handlerFor(channel: string): Handler {
  const call = mockHandle.mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`no handler registered for ${channel}`)
  return call[1] as Handler
}

const EVENT = {}

describe('registry-handlers baseOverride hardening (SECURITY 2026-07-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerRegistryHandlers()
  })

  it('drops an unknown override on TURN_CREDENTIALS (fetch falls back to the resolved base)', async () => {
    mockFetchTurnCredentials.mockResolvedValueOnce(null)
    await handlerFor(IPC_CHANNELS.TURN_CREDENTIALS)(EVENT, 'https://attacker.example')
    expect(mockFetchTurnCredentials).toHaveBeenCalledWith(undefined)
  })

  it('passes through a KNOWN Pi base override on TURN_CREDENTIALS', async () => {
    mockFetchTurnCredentials.mockResolvedValueOnce(null)
    await handlerFor(IPC_CHANNELS.TURN_CREDENTIALS)(EVENT, BMO_PI_URL_DEFAULT)
    expect(mockFetchTurnCredentials).toHaveBeenCalledWith(BMO_PI_URL_DEFAULT)
  })

  it('treats undefined / empty-string override as no-override', async () => {
    mockFetchTurnCredentials.mockResolvedValue(null)
    await handlerFor(IPC_CHANNELS.TURN_CREDENTIALS)(EVENT, undefined)
    await handlerFor(IPC_CHANNELS.TURN_CREDENTIALS)(EVENT, '')
    expect(mockFetchTurnCredentials).toHaveBeenNthCalledWith(1, undefined)
    expect(mockFetchTurnCredentials).toHaveBeenNthCalledWith(2, undefined)
  })

  it('rejects a non-string override via the zod schema (error envelope, no fetch)', async () => {
    const res = (await handlerFor(IPC_CHANNELS.TURN_CREDENTIALS)(EVENT, 42)) as { success?: boolean }
    expect(res.success).toBe(false)
    expect(mockFetchTurnCredentials).not.toHaveBeenCalled()
  })

  it('REGISTRY_LIST drops an unknown override and still lists from the resolved base', async () => {
    mockListGames.mockResolvedValueOnce([])
    const res = (await handlerFor(IPC_CHANNELS.REGISTRY_LIST)(EVENT, null, 'https://evil.example')) as {
      ok: boolean
    }
    expect(res.ok).toBe(true)
    expect(mockListGames).toHaveBeenCalledWith(null, undefined)
  })

  it('REGISTRY_ANNOUNCE sanitizes the override and rejects a non-object payload', async () => {
    mockAnnounceGame.mockResolvedValueOnce({ ok: true })
    await handlerFor(IPC_CHANNELS.REGISTRY_ANNOUNCE)(EVENT, { invite_code: 'AAA' }, 'https://evil.example')
    expect(mockAnnounceGame).toHaveBeenCalledWith({ invite_code: 'AAA' }, undefined)

    const bad = (await handlerFor(IPC_CHANNELS.REGISTRY_ANNOUNCE)(EVENT, 'not-an-object', undefined)) as {
      success?: boolean
    }
    expect(bad.success).toBe(false)
  })

  it('REGISTRY_HEARTBEAT validates the invite code', async () => {
    mockHeartbeatGame.mockResolvedValueOnce({ ok: true })
    await handlerFor(IPC_CHANNELS.REGISTRY_HEARTBEAT)(EVENT, 'ABCD', undefined)
    expect(mockHeartbeatGame).toHaveBeenCalledWith('ABCD', undefined)

    const bad = (await handlerFor(IPC_CHANNELS.REGISTRY_HEARTBEAT)(EVENT, '', undefined)) as { success?: boolean }
    expect(bad.success).toBe(false)
  })
})
