import { beforeEach, describe, expect, it, vi } from 'vitest'

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn(),
  clear: vi.fn()
}

vi.stubGlobal('localStorage', localStorageMock)

// PHASE-20 20F: the store syncs the toggle to the main-process gate via
// window.api.bmoSetNarrationEnabled — provide a fresh spy per test.
let bmoSetSpy: ReturnType<typeof vi.fn>
let bmoBargeSpy: ReturnType<typeof vi.fn>

describe('useNarrationTtsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.store = {}
    vi.resetModules()
    bmoSetSpy = vi.fn()
    bmoBargeSpy = vi.fn()
    vi.stubGlobal('window', {
      api: { bmoSetNarrationEnabled: bmoSetSpy, bmoSetBargeInEnabled: bmoBargeSpy }
    })
  })

  it('defaults auto narration to off', async () => {
    const { useNarrationTtsStore } = await import('./use-narration-tts-store')

    expect(useNarrationTtsStore.getState().enabled).toBe(false)
  })

  it('loads the saved setting from localStorage', async () => {
    localStorageMock.store['dnd-vtt-ai-narration-tts'] = 'true'

    const { useNarrationTtsStore } = await import('./use-narration-tts-store')

    expect(useNarrationTtsStore.getState().enabled).toBe(true)
  })

  it('persists changes to localStorage', async () => {
    const { useNarrationTtsStore } = await import('./use-narration-tts-store')

    useNarrationTtsStore.getState().setEnabled(true)

    expect(localStorageMock.setItem).toHaveBeenCalledWith('dnd-vtt-ai-narration-tts', 'true')
    expect(useNarrationTtsStore.getState().enabled).toBe(true)
  })

  it('syncs the toggle to the main-process gate on set', async () => {
    const { useNarrationTtsStore } = await import('./use-narration-tts-store')
    bmoSetSpy.mockClear() // ignore the module-init sync
    useNarrationTtsStore.getState().setEnabled(true)
    expect(bmoSetSpy).toHaveBeenCalledWith(true)
  })

  it('syncs the persisted value to main at module init', async () => {
    localStorageMock.store['dnd-vtt-ai-narration-tts'] = 'true'
    await import('./use-narration-tts-store')
    expect(bmoSetSpy).toHaveBeenCalledWith(true)
  })

  // PHASE-21 21B: barge-in toggle (default off, persisted, synced to main).
  it('defaults bargeIn to off', async () => {
    const { useNarrationTtsStore } = await import('./use-narration-tts-store')
    expect(useNarrationTtsStore.getState().bargeIn).toBe(false)
  })

  it('persists + syncs bargeIn on set', async () => {
    const { useNarrationTtsStore } = await import('./use-narration-tts-store')
    bmoBargeSpy.mockClear()
    useNarrationTtsStore.getState().setBargeIn(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('dnd-vtt-ai-narration-barge-in', 'true')
    expect(useNarrationTtsStore.getState().bargeIn).toBe(true)
    expect(bmoBargeSpy).toHaveBeenCalledWith(true)
  })

  it('loads + syncs persisted bargeIn at module init', async () => {
    localStorageMock.store['dnd-vtt-ai-narration-barge-in'] = 'true'
    const { useNarrationTtsStore } = await import('./use-narration-tts-store')
    expect(useNarrationTtsStore.getState().bargeIn).toBe(true)
    expect(bmoBargeSpy).toHaveBeenCalledWith(true)
  })
})
