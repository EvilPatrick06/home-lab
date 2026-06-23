import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the registry + LAN side-effects so we can drive the announce outcome.
const { announceGame, startHeartbeat } = vi.hoisted(() => ({
  announceGame: vi.fn(),
  startHeartbeat: vi.fn(() => () => undefined)
}))
vi.mock('./registry-client', () => ({
  announceGame,
  startHeartbeat,
  deregisterGame: vi.fn(async () => ({ ok: true })),
  updateGame: vi.fn(async () => ({ ok: true }))
}))
vi.mock('./lan-discovery', () => ({
  publishLan: vi.fn(async () => undefined),
  unpublishLan: vi.fn(async () => undefined)
}))

import { startHostAnnounce, stopHostAnnounce } from './host-announce'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    invite_code: 'ABC123',
    name: 'Test Game',
    host_display_name: 'DM',
    host_client_id: 'client-1',
    current_players: 1,
    max_players: 8,
    current_spectators: 0,
    max_spectators: 5,
    game_system: 'dnd5e',
    is_private: false,
    peer_id: 'peer-1',
    ...overrides
    // biome-ignore lint/suspicious/noExplicitAny: test payload builder
  } as any
}

describe('startHostAnnounce — result propagation (taskId-12)', () => {
  beforeEach(async () => {
    announceGame.mockReset()
    startHeartbeat.mockClear()
    await stopHostAnnounce()
  })

  it('returns ok:true when a public game registers successfully', async () => {
    announceGame.mockResolvedValue({ ok: true })
    const result = await startHostAnnounce(payload())
    expect(result).toEqual({ ok: true })
    expect(announceGame).toHaveBeenCalledTimes(1)
  })

  it('propagates the failure (instead of swallowing it) when the registry POST fails', async () => {
    announceGame.mockResolvedValue({ ok: false, error: 'HTTP 503: unreachable' })
    const result = await startHostAnnounce(payload())
    expect(result.ok).toBe(false)
    expect(result.error).toBe('HTTP 503: unreachable')
  })

  it('reports ok:true for a private game without hitting the registry', async () => {
    const result = await startHostAnnounce(payload({ is_private: true }))
    expect(result).toEqual({ ok: true })
    expect(announceGame).not.toHaveBeenCalled()
  })

  // PHASE-46 F1 — a transport that resolves a null/garbage value (the old web
  // shim returned bare `null`) must become an honest failure, NOT a thrown
  // "Cannot read properties of null (reading 'ok')".
  it('coerces a null announce result into an honest failure (no null-deref)', async () => {
    announceGame.mockResolvedValue(null as unknown as { ok: boolean })
    const result = await startHostAnnounce(payload())
    expect(result.ok).toBe(false)
    expect(result.error).toBe('registry unreachable')
  })

  it('coerces an undefined / shapeless announce result into an honest failure', async () => {
    announceGame.mockResolvedValue(undefined as unknown as { ok: boolean })
    const result = await startHostAnnounce(payload())
    expect(result.ok).toBe(false)
    expect(result.error).toBe('registry unreachable')
  })
})
