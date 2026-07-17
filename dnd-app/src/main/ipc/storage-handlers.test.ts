import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') },
  ipcMain: { handle: mockHandle }
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    SAVE_CHARACTER: 'storage:save-character',
    LOAD_CHARACTERS: 'storage:load-characters',
    LOAD_CHARACTER: 'storage:load-character',
    DELETE_CHARACTER: 'storage:delete-character',
    CHARACTER_VERSIONS: 'storage:character-versions',
    CHARACTER_RESTORE_VERSION: 'storage:character-restore-version',
    SAVE_CAMPAIGN: 'storage:save-campaign',
    LOAD_CAMPAIGNS: 'storage:load-campaigns',
    LOAD_CAMPAIGN: 'storage:load-campaign',
    DELETE_CAMPAIGN: 'storage:delete-campaign',
    SAVE_BASTION: 'storage:save-bastion',
    LOAD_BASTIONS: 'storage:load-bastions',
    LOAD_BASTION: 'storage:load-bastion',
    DELETE_BASTION: 'storage:delete-bastion',
    SAVE_CUSTOM_CREATURE: 'storage:save-custom-creature',
    LOAD_CUSTOM_CREATURES: 'storage:load-custom-creatures',
    LOAD_CUSTOM_CREATURE: 'storage:load-custom-creature',
    DELETE_CUSTOM_CREATURE: 'storage:delete-custom-creature',
    SAVE_GAME_STATE: 'storage:save-game-state',
    LOAD_GAME_STATE: 'storage:load-game-state',
    DELETE_GAME_STATE: 'storage:delete-game-state',
    SAVE_HOMEBREW: 'storage:save-homebrew',
    LOAD_HOMEBREW_BY_CATEGORY: 'storage:load-homebrew-by-category',
    LOAD_ALL_HOMEBREW: 'storage:load-all-homebrew',
    DELETE_HOMEBREW: 'storage:delete-homebrew',
    SAVE_SETTINGS: 'storage:save-settings',
    LOAD_SETTINGS: 'storage:load-settings',
    BOOK_IMPORT: 'storage:book-import',
    BOOK_ADD: 'storage:book-add',
    BOOK_READ_FILE: 'storage:book-read-file'
  }
}))

const importBookMock = vi.hoisted(() => vi.fn(async () => ({ success: true })))
vi.mock('../storage/book-storage', () => ({
  importBook: importBookMock,
  addBook: vi.fn(),
  loadBookConfig: vi.fn(),
  loadBookData: vi.fn(),
  readBookFile: vi.fn(),
  removeBook: vi.fn(),
  saveBookData: vi.fn(),
  // Faithful re-implementation of the real predicate (src/main/storage/book-storage.ts)
  // so the BOOK_IMPORT handler's book-id guard resolves against the mock. Without this
  // export the handler threw "No isSafeBookId export is defined on the mock" (regression
  // from baf05530, which added the guard but left this mock untouched).
  isSafeBookId: (bookId: unknown): bookId is string =>
    typeof bookId === 'string' &&
    bookId.length > 0 &&
    !bookId.includes('/') &&
    !bookId.includes('\\') &&
    !bookId.includes('..') &&
    !bookId.includes('\0')
}))

vi.mock('../storage/character-storage', () => ({
  saveCharacter: vi.fn(() => ({ success: true })),
  loadCharacters: vi.fn(() => ({ success: true, data: [] })),
  loadCharacter: vi.fn(() => ({ success: true, data: null })),
  deleteCharacter: vi.fn(() => ({ success: true, data: true })),
  listCharacterVersions: vi.fn(() => ({ success: true, data: [] })),
  restoreCharacterVersion: vi.fn(() => ({ success: true, data: {} }))
}))

vi.mock('../storage/campaign-storage', () => ({
  saveCampaign: vi.fn(() => ({ success: true })),
  loadCampaigns: vi.fn(() => ({ success: true, data: [] })),
  loadCampaign: vi.fn(() => ({ success: true, data: null })),
  deleteCampaign: vi.fn(() => ({ success: true, data: true }))
}))

vi.mock('../storage/bastion-storage', () => ({
  saveBastion: vi.fn(() => ({ success: true })),
  loadBastions: vi.fn(() => ({ success: true, data: [] })),
  loadBastion: vi.fn(() => ({ success: true, data: null })),
  deleteBastion: vi.fn(() => ({ success: true, data: true }))
}))

vi.mock('../storage/custom-creature-storage', () => ({
  saveCustomCreature: vi.fn(() => ({ success: true })),
  loadCustomCreatures: vi.fn(() => ({ success: true, data: [] })),
  loadCustomCreature: vi.fn(() => ({ success: true, data: null })),
  deleteCustomCreature: vi.fn(() => ({ success: true, data: true }))
}))

vi.mock('../storage/game-state-storage', () => ({
  saveGameState: vi.fn(() => ({ success: true })),
  loadGameState: vi.fn(() => ({ success: true, data: null })),
  deleteGameState: vi.fn(() => ({ success: true, data: true }))
}))

vi.mock('../storage/homebrew-storage', () => ({
  saveHomebrewEntry: vi.fn(() => ({ success: true })),
  loadHomebrewEntries: vi.fn(() => ({ success: true, data: [] })),
  loadAllHomebrew: vi.fn(() => ({ success: true, data: [] })),
  deleteHomebrewEntry: vi.fn(() => ({ success: true, data: true }))
}))

vi.mock('../storage/settings-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage/settings-storage')>()
  return {
    ...actual,
    loadSettings: vi.fn(() => ({ success: true, data: { version: 1 } })),
    saveSettings: vi.fn(() => ({ success: true }))
  }
})

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerStorageHandlers } from './storage-handlers'

describe('storage-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register all storage IPC handlers', () => {
    registerStorageHandlers()

    const registeredChannels = mockHandle.mock.calls.map((call) => call[0])

    // Character handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_CHARACTER)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_CHARACTERS)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_CHARACTER)
    expect(registeredChannels).toContain(IPC_CHANNELS.DELETE_CHARACTER)
    expect(registeredChannels).toContain(IPC_CHANNELS.CHARACTER_VERSIONS)
    expect(registeredChannels).toContain(IPC_CHANNELS.CHARACTER_RESTORE_VERSION)

    // Campaign handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_CAMPAIGN)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_CAMPAIGNS)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_CAMPAIGN)
    expect(registeredChannels).toContain(IPC_CHANNELS.DELETE_CAMPAIGN)

    // Bastion handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_BASTION)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_BASTIONS)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_BASTION)
    expect(registeredChannels).toContain(IPC_CHANNELS.DELETE_BASTION)

    // Custom creature handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_CUSTOM_CREATURE)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_CUSTOM_CREATURES)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_CUSTOM_CREATURE)
    expect(registeredChannels).toContain(IPC_CHANNELS.DELETE_CUSTOM_CREATURE)

    // Game state handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_GAME_STATE)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_GAME_STATE)
    expect(registeredChannels).toContain(IPC_CHANNELS.DELETE_GAME_STATE)

    // Homebrew handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_HOMEBREW)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_HOMEBREW_BY_CATEGORY)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_ALL_HOMEBREW)
    expect(registeredChannels).toContain(IPC_CHANNELS.DELETE_HOMEBREW)

    // Settings handlers
    expect(registeredChannels).toContain(IPC_CHANNELS.SAVE_SETTINGS)
    expect(registeredChannels).toContain(IPC_CHANNELS.LOAD_SETTINGS)
  })

  it('should register exactly 53 handlers', () => {
    registerStorageHandlers()
    // 53 = 51 prior handlers + CAMPAIGN_VERSIONS + CAMPAIGN_RESTORE_VERSION
    // (campaign version history list/restore — mirrors the character version API).
    expect(mockHandle).toHaveBeenCalledTimes(53)
  })

  describe('SAVE_CHARACTER handler', () => {
    it('should delegate to saveCharacter and return result', async () => {
      registerStorageHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.SAVE_CHARACTER)![1]

      const result = await handler({}, { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Hero' })
      expect(result).toEqual({ success: true, error: undefined })
    })
  })

  describe('LOAD_CHARACTERS handler', () => {
    it('should delegate to loadCharacters and return data', async () => {
      registerStorageHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.LOAD_CHARACTERS)![1]

      const result = await handler({})
      expect(result).toEqual([])
    })
  })

  describe('LOAD_SETTINGS handler', () => {
    it('should delegate to loadSettings', async () => {
      registerStorageHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.LOAD_SETTINGS)![1]

      const result = await handler({})
      expect(result).toEqual({ version: 1 })
    })
  })

  describe('SAVE_SETTINGS handler', () => {
    it('should delegate to saveSettings and return success', async () => {
      registerStorageHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.SAVE_SETTINGS)![1]

      const result = await handler({}, { turnServers: [] })
      expect(result).toEqual({ success: true })
    })
  })

  describe('BOOK_IMPORT dialog-allowlist enforcement (PHASE-13 13B)', () => {
    const bookImportHandler = (): any => {
      registerStorageHandlers()
      return mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.BOOK_IMPORT)![1]
    }

    it('rejects a path that was never registered via a dialog', async () => {
      const handler = bookImportHandler()
      const res = await handler({}, '/tmp/never-picked.pdf', 'Book', 'b1')
      expect(res).toEqual({ success: false, error: 'Invalid source path: not a dialog-selected file' })
      expect(importBookMock).not.toHaveBeenCalled()
    })

    it('accepts a path after it is registered via addDialogPath', async () => {
      const { addDialogPath } = await import('./dialog-allowlist')
      addDialogPath('/tmp/picked.pdf')
      const handler = bookImportHandler()
      const res = await handler({}, '/tmp/picked.pdf', 'Book', 'b1')
      expect(res).toEqual({ success: true })
      expect(importBookMock).toHaveBeenCalledWith('/tmp/picked.pdf', 'Book', 'b1')
    })

    it('accepts a userData-subtree path without dialog registration', async () => {
      const handler = bookImportHandler()
      const res = await handler({}, '/tmp/test-userdata/books/x.pdf', 'Book', 'b1')
      expect(res).toEqual({ success: true })
    })
  })

  describe('BOOK_READ_FILE allowlist enforcement (SECURITY 2026-07-17)', () => {
    const bookReadHandler = (): any => {
      registerStorageHandlers()
      return mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.BOOK_READ_FILE)![1]
    }

    it('rejects an absolute .pdf path outside userData (no ".." needed to escape)', async () => {
      const { readBookFile } = await import('../storage/book-storage')
      const handler = bookReadHandler()
      const res = await handler({}, '/home/victim/secret.pdf')
      expect(res).toEqual({ success: false, error: 'Invalid book file path: outside app storage' })
      expect(vi.mocked(readBookFile)).not.toHaveBeenCalled()
    })

    it('still reads a userData-subtree book path (positive control)', async () => {
      const { readBookFile } = await import('../storage/book-storage')
      vi.mocked(readBookFile).mockResolvedValue({ success: true, data: Buffer.from('pdf-bytes') })
      const handler = bookReadHandler()
      const res = await handler({}, '/tmp/test-userdata/books/b1.pdf')
      expect(res.success).toBe(true)
      expect(new Uint8Array(res.data)).toEqual(new Uint8Array(Buffer.from('pdf-bytes')))
    })

    it('still rejects traversal payloads (existing lexical guard)', async () => {
      const handler = bookReadHandler()
      const res = await handler({}, '/tmp/test-userdata/../etc/x.pdf')
      expect(res).toEqual({ success: false, error: 'Invalid book file path' })
    })
  })

  describe('BOOK_ADD path validation (SECURITY 2026-07-17)', () => {
    const bookAddHandler = (): any => {
      registerStorageHandlers()
      return mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.BOOK_ADD)![1]
    }

    const base = { title: 'Book', type: 'custom' as const, addedAt: '2026-07-17T00:00:00Z' }

    it('rejects a config whose path points outside app storage', async () => {
      const { addBook } = await import('../storage/book-storage')
      const handler = bookAddHandler()
      const res = await handler({}, { ...base, id: 'b1', path: '/home/victim/anything.pdf' })
      expect(res).toEqual({ success: false, error: 'Invalid book path: outside app storage' })
      expect(vi.mocked(addBook)).not.toHaveBeenCalled()
    })

    it('rejects an unsafe book id', async () => {
      const handler = bookAddHandler()
      const res = await handler({}, { ...base, id: '../evil', path: '/tmp/test-userdata/books/x.pdf' })
      expect(res).toEqual({ success: false, error: 'Invalid book id' })
    })

    it('accepts a userData-subtree book path', async () => {
      const { addBook } = await import('../storage/book-storage')
      vi.mocked(addBook).mockResolvedValue({ success: true })
      const handler = bookAddHandler()
      const res = await handler({}, { ...base, id: 'b1', path: '/tmp/test-userdata/books/b1.pdf' })
      expect(res).toEqual({ success: true })
    })
  })
})
