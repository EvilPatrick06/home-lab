// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Track the unsubscribes setupListeners hands back so tests can assert lifecycle ──
const unsubscribes: Array<ReturnType<typeof vi.fn>> = []
const setupListeners = vi.fn(() => {
  const unsub = vi.fn()
  unsubscribes.push(unsub)
  return unsub
})

// Stable singleton store object — identity must NOT change across rerenders, so
// `aiDmStore.setupListeners` stays a stable effect dependency.
const aiDmStoreValue = {
  messages: [] as unknown[],
  isTyping: false,
  paused: false,
  setupListeners,
  initFromCampaign: vi.fn()
}

vi.mock('../stores/use-ai-dm-store', () => ({
  useAiDmStore: Object.assign(
    vi.fn(() => aiDmStoreValue),
    {
      getState: vi.fn(() => ({ messages: [], sceneStatus: 'idle', setScene: vi.fn() })),
      setState: vi.fn()
    }
  )
}))

vi.mock('../stores/use-game-store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => ({ allies: [], addSidebarEntry: vi.fn() })),
    { getState: vi.fn(() => ({ maps: [], activeMapId: null, updateToken: vi.fn(), addSidebarEntry: vi.fn() })) }
  )
}))

vi.mock('../stores/use-lobby-store', () => ({
  useLobbyStore: Object.assign(
    vi.fn(() => ({})),
    { getState: vi.fn(() => ({ players: [], chatMessages: [] })) }
  )
}))

vi.mock('../stores/use-narration-tts-store', () => ({
  useNarrationTtsStore: Object.assign(
    vi.fn((sel?: (s: { enabled: boolean }) => unknown) => (sel ? sel({ enabled: false }) : { enabled: false })),
    { getState: vi.fn(() => ({ enabled: false })) }
  )
}))

vi.mock('../components/game/overlays/DmAlertTray', () => ({ pushDmAlert: vi.fn() }))
vi.mock('../i18n', () => ({ i18n: { t: (k: string) => k } }))
vi.mock('../network', () => ({ startGameSync: vi.fn(), stopGameSync: vi.fn() }))
vi.mock('../services/ai-dm-routing', () => ({ configureAiFromCampaign: vi.fn() }))
vi.mock('../services/bmo-narration', () => ({ speakNarrationThroughBmo: vi.fn() }))
vi.mock('../services/io/ai-memory-sync', () => ({ startAiMemorySync: vi.fn(), stopAiMemorySync: vi.fn() }))
vi.mock('../services/io/game-auto-save', () => ({
  loadPersistedGameState: vi.fn(),
  startAutoSave: vi.fn(),
  stopAutoSave: vi.fn()
}))
vi.mock('../services/sound-manager', () => ({ init: vi.fn() }))
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { useGameEffects } from './use-game-effects'

type CampaignLike = { id: string; aiDm: { enabled: boolean }; players: unknown[] }
const makeCampaign = (enabled = true): CampaignLike => ({ id: 'c1', aiDm: { enabled }, players: [] })

const baseProps = (campaign: CampaignLike) => ({
  campaign: campaign as never,
  isDM: true,
  addChatMessage: vi.fn(),
  sendMessage: vi.fn(),
  aiInitRef: { current: false },
  activeMap: null,
  setIsFullscreen: vi.fn()
})

beforeEach(() => {
  unsubscribes.length = 0
  setupListeners.mockClear()
  ;(window as unknown as { api: unknown }).api = {
    isFullscreen: vi.fn().mockResolvedValue(false),
    toggleFullscreen: vi.fn().mockResolvedValue(undefined),
    ai: {
      getSceneStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      loadConversation: vi.fn().mockResolvedValue({ success: false }),
      saveConversation: vi.fn().mockResolvedValue(undefined)
    }
  }
})

afterEach(() => vi.clearAllMocks())

describe('useGameEffects — AI stream listener lifecycle (05C)', () => {
  it('can be imported', () => {
    expect(typeof useGameEffects).toBe('function')
  })

  it('A: a campaign-object identity change (same id+enabled) does NOT tear down listeners (F1)', () => {
    const { rerender } = renderHook((props) => useGameEffects(props), {
      initialProps: baseProps(makeCampaign(true))
    })
    expect(setupListeners).toHaveBeenCalledTimes(1)

    // New campaign OBJECT, same id + same aiDm.enabled (what saveCampaign produces).
    rerender(baseProps(makeCampaign(true)))
    expect(setupListeners).toHaveBeenCalledTimes(1) // not re-registered
    expect(unsubscribes[0]).not.toHaveBeenCalled() // not torn down
  })

  it('B: flipping aiDm.enabled off tears down; back on re-registers', () => {
    const { rerender } = renderHook((props) => useGameEffects(props), {
      initialProps: baseProps(makeCampaign(true))
    })
    expect(setupListeners).toHaveBeenCalledTimes(1)

    rerender(baseProps(makeCampaign(false)))
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1) // disabled → cleaned up

    rerender(baseProps(makeCampaign(true)))
    expect(setupListeners).toHaveBeenCalledTimes(2) // re-enabled → re-registered
  })

  it('C: unmount calls the listener unsubscribe (no leak on leaving the game)', () => {
    const { unmount } = renderHook((props) => useGameEffects(props), {
      initialProps: baseProps(makeCampaign(true))
    })
    expect(setupListeners).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1)
  })
})
