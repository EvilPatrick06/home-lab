// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── mocks ───────────────────────────────────────────────────────────
const { pushDmAlert } = vi.hoisted(() => ({ pushDmAlert: vi.fn() }))
vi.mock('../components/game/overlays/DmAlertTray', () => ({ pushDmAlert }))
vi.mock('../i18n', () => ({ useT: () => ({ t: (k: string, p?: unknown) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }))
vi.mock('../services/game/token-stats', () => ({ getTokenStats: () => ({ maxHP: 10 }) }))
vi.mock('../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const h = vi.hoisted(() => ({
  gameState: {
    initiative: { entries: [{ entityName: 'Aria', entityType: 'player', isActive: true }], currentIndex: 0, round: 1 },
    maps: [] as unknown[],
    activeMapId: null as unknown
  },
  subscriber: null as null | ((s: unknown) => void),
  unsubGame: vi.fn()
}))
vi.mock('../stores/use-game-store', () => ({
  useGameStore: {
    getState: () => h.gameState,
    subscribe: (cb: (s: unknown) => void) => {
      h.subscriber = cb
      return h.unsubGame
    }
  }
}))

import { useDiscordSyncStore } from '../stores/use-discord-sync-store'
import { useDiscordSync } from './use-discord-sync'

let eventCb: ((e: unknown) => void) | undefined
let _initCb: ((e: unknown) => void) | undefined
const offEvent = vi.fn()
const offInit = vi.fn()
const bmoSyncInitiative = vi.fn().mockResolvedValue({ ok: true })
const bmoSyncGameState = vi.fn().mockResolvedValue({ ok: true })

beforeEach(() => {
  vi.clearAllMocks()
  eventCb = undefined
  _initCb = undefined
  h.subscriber = null
  useDiscordSyncStore.setState({ activity: [], syncToDiscordEnabled: false })
  vi.stubGlobal('window', {
    api: {
      onBmoSyncEvent: (cb: (e: unknown) => void) => {
        eventCb = cb
        return offEvent
      },
      onBmoSyncInitiative: (cb: (e: unknown) => void) => {
        _initCb = cb
        return offInit
      },
      bmoSyncInitiative,
      bmoSyncGameState
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDiscordSync (PHASE-22 22E)', () => {
  it('does not subscribe for non-DM', () => {
    renderHook(() => useDiscordSync({ isDM: false, campaignId: 'c1' }))
    expect(eventCb).toBeUndefined()
  })

  it('maps inbound events to the activity feed', () => {
    renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    act(() => eventCb?.({ type: 'discord_message', payload: { author: 'alice', text: 'I attack' } }))
    act(() => eventCb?.({ type: 'discord_roll', payload: { rollerName: 'bob', formula: '1d20', total: 17 } }))
    const activity = useDiscordSyncStore.getState().activity
    expect(activity.some((a) => a.kind === 'message' && a.summary.includes('alice'))).toBe(true)
    expect(activity.some((a) => a.kind === 'roll' && a.summary.includes('17'))).toBe(true)
  })

  it('alerts on join/leave', () => {
    renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    act(() => eventCb?.({ type: 'player_join', payload: { playerName: 'carol' } }))
    expect(pushDmAlert).toHaveBeenCalledWith('info', expect.stringContaining('playerJoined'))
  })

  it('dedups the unreachable alert within 60s', () => {
    renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    act(() => eventCb?.({ type: 'bmo_unreachable', payload: {} }))
    act(() => eventCb?.({ type: 'bmo_unreachable', payload: {} }))
    const warnings = pushDmAlert.mock.calls.filter((c) => c[0] === 'warning')
    expect(warnings.length).toBe(1)
  })

  it('answers state_request immediately even when the toggle is off', () => {
    renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    act(() => eventCb?.({ type: 'state_request', payload: {} }))
    expect(bmoSyncInitiative).toHaveBeenCalledTimes(1)
    expect(bmoSyncGameState).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes both listeners on unmount', () => {
    const { unmount } = renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    unmount()
    expect(offEvent).toHaveBeenCalled()
    expect(offInit).toHaveBeenCalled()
  })

  it('does NOT push outbound while the toggle is off', () => {
    renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    expect(h.subscriber).toBeNull() // outbound effect not armed
  })

  it('debounce-pushes initiative once when the toggle is on and initiative changes', () => {
    vi.useFakeTimers()
    useDiscordSyncStore.setState({ syncToDiscordEnabled: true })
    renderHook(() => useDiscordSync({ isDM: true, campaignId: 'c1' }))
    expect(h.subscriber).not.toBeNull()
    bmoSyncInitiative.mockClear()
    act(() => {
      h.subscriber?.({ ...h.gameState, initiative: { entries: [], currentIndex: 0, round: 2 } })
    })
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(bmoSyncInitiative).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
