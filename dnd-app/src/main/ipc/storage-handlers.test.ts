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
    LOAD_SETTINGS: 'storage:load-settings'
  }
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

vi.mock('../storage/settings-storage', () => ({
  loadSettings: vi.fn(() => ({ success: true, data: {} })),
  saveSettings: vi.fn(() => ({ success: true }))
}))

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

  it('should register exactly 48 handlers', () => {
    registerStorageHandlers()
    expect(mockHandle).toHaveBeenCalledTimes(48)
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
      expect(result).toEqual({})
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
})
