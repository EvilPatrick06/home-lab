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

describe('useNarrationTtsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.store = {}
    vi.resetModules()
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
})
