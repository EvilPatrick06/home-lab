import { beforeEach, describe, expect, it, vi } from 'vitest'

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((k: string) => localStorageMock.store[k] ?? null),
  setItem: vi.fn((k: string, v: string) => {
    localStorageMock.store[k] = v
  }),
  removeItem: vi.fn(),
  clear: vi.fn()
}
vi.stubGlobal('localStorage', localStorageMock)

describe('useDiscordSyncStore (PHASE-22 22E)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.store = {}
    vi.resetModules()
  })

  it('defaults syncToDiscordEnabled to false', async () => {
    const { useDiscordSyncStore } = await import('./use-discord-sync-store')
    expect(useDiscordSyncStore.getState().syncToDiscordEnabled).toBe(false)
  })

  it('loads + persists the toggle', async () => {
    localStorageMock.store['dnd-vtt:discord-sync-enabled'] = 'true'
    const { useDiscordSyncStore } = await import('./use-discord-sync-store')
    expect(useDiscordSyncStore.getState().syncToDiscordEnabled).toBe(true)
    useDiscordSyncStore.getState().setSyncToDiscordEnabled(false)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('dnd-vtt:discord-sync-enabled', 'false')
    expect(useDiscordSyncStore.getState().syncToDiscordEnabled).toBe(false)
  })

  it('keeps activity newest-first and bounded to 100', async () => {
    const { useDiscordSyncStore } = await import('./use-discord-sync-store')
    for (let i = 0; i < 105; i++) {
      useDiscordSyncStore.getState().addActivity({ kind: 'message', summary: `m${i}` })
    }
    const { activity } = useDiscordSyncStore.getState()
    expect(activity.length).toBe(100)
    expect(activity[0].summary).toBe('m104') // newest first
    expect(activity.every((a) => a.id && a.at)).toBe(true)
  })

  it('clearActivity empties the feed', async () => {
    const { useDiscordSyncStore } = await import('./use-discord-sync-store')
    useDiscordSyncStore.getState().addActivity({ kind: 'info', summary: 'x' })
    useDiscordSyncStore.getState().clearActivity()
    expect(useDiscordSyncStore.getState().activity).toEqual([])
  })
})
