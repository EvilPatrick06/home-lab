import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  BastionSaveSchema,
  CampaignSaveSchema,
  CharacterSaveSchema,
  CustomCreatureSaveSchema,
  GameStateSaveSchema,
  HomebrewSaveSchema
} from '../../shared/storage-schemas'
import { applyBmoApiKeyFromSettings, applyBmoBaseUrlFromSettings } from '../bmo-config'
import { logSecurityEvent } from '../security-log'
import { loadBans, saveBans } from '../storage/ban-storage'
import { deleteBastion, loadBastion, loadBastions, saveBastion } from '../storage/bastion-storage'
import {
  addBook,
  type BookConfig,
  type BookData,
  importBook,
  loadBookConfig,
  loadBookData,
  readBookFile,
  removeBook,
  saveBookData
} from '../storage/book-storage'
import { deleteCampaign, loadCampaign, loadCampaigns, saveCampaign } from '../storage/campaign-storage'
import {
  type CharacterVersion,
  deleteCharacter,
  listCharacterVersions,
  loadCharacter,
  loadCharacters,
  restoreCharacterVersion,
  saveCharacter
} from '../storage/character-storage'
import {
  deleteCustomCreature,
  loadCustomCreature,
  loadCustomCreatures,
  saveCustomCreature
} from '../storage/custom-creature-storage'
import {
  deleteGameState,
  loadGameState as loadGameStateStorage,
  saveGameState as saveGameStateStorage
} from '../storage/game-state-storage'
import {
  deleteHomebrewEntry,
  loadAllHomebrew,
  loadHomebrewEntries,
  saveHomebrewEntry
} from '../storage/homebrew-storage'
import { deleteImage, getImage, listImages, saveImage } from '../storage/image-library-storage'
import {
  deleteMapFromLibrary,
  getMapFromLibrary,
  listMapLibrary,
  saveMapToLibrary
} from '../storage/map-library-storage'
import { AppSettingsSchema, loadSettings, saveSettings } from '../storage/settings-storage'
import { deleteShopTemplate, getShopTemplate, listShopTemplates, saveShopTemplate } from '../storage/shop-storage'
import { wipeAllData } from '../storage/wipe-storage'
import { validateUploadExtension } from '../upload-validation'
import { handle } from './_safe'

// Ensure imported types are used for type-safety
type _CharacterVersion = CharacterVersion

export function registerStorageHandlers(): void {
  // --- Character storage ---

  handle(IPC_CHANNELS.SAVE_CHARACTER, async (_event, character) => {
    const parsed = CharacterSaveSchema.safeParse(character)
    if (!parsed.success) return { success: false, error: `Invalid character data: ${parsed.error.message}` }
    const result = await saveCharacter(parsed.data)
    return { success: result.success, error: result.error }
  })

  handle(IPC_CHANNELS.LOAD_CHARACTERS, async () => {
    const result = await loadCharacters()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load characters' }
  })

  handle(IPC_CHANNELS.LOAD_CHARACTER, async (_event, id: string) => {
    const result = await loadCharacter(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load character' }
  })

  handle(IPC_CHANNELS.DELETE_CHARACTER, async (_event, id: string) => {
    const result = await deleteCharacter(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete character' }
  })

  // --- Reset All Data: wipe every file-based content directory ---
  handle(IPC_CHANNELS.WIPE_ALL_DATA, async () => {
    const result = await wipeAllData()
    return result.success
      ? { success: true, removed: result.data?.removed ?? [] }
      : { success: false, error: result.error }
  })

  handle(IPC_CHANNELS.CHARACTER_VERSIONS, async (_event, id: string) => {
    return listCharacterVersions(id)
  })

  handle(IPC_CHANNELS.CHARACTER_RESTORE_VERSION, async (_event, id: string, fileName: string) => {
    // Phase 17a (NET-12) — fileName flows into a version-file path; reject separators / traversal
    // and require the expected extension before delegating.
    if (
      typeof fileName !== 'string' ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('..') ||
      fileName.includes('\0') ||
      !/\.json$/i.test(fileName)
    ) {
      logSecurityEvent('ipc.path_traversal.denied', {
        channel: 'CHARACTER_RESTORE_VERSION',
        fileName: String(fileName)
      })
      throw new Error('Invalid version file name')
    }
    return restoreCharacterVersion(id, fileName)
  })

  // --- Campaign storage ---

  handle(IPC_CHANNELS.SAVE_CAMPAIGN, async (_event, campaign) => {
    const parsed = CampaignSaveSchema.safeParse(campaign)
    if (!parsed.success) return { success: false, error: `Invalid campaign data: ${parsed.error.message}` }
    const result = await saveCampaign(parsed.data)
    return { success: result.success, error: result.error }
  })

  handle(IPC_CHANNELS.LOAD_CAMPAIGNS, async () => {
    const result = await loadCampaigns()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load campaigns' }
  })

  handle(IPC_CHANNELS.LOAD_CAMPAIGN, async (_event, id: string) => {
    const result = await loadCampaign(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load campaign' }
  })

  handle(IPC_CHANNELS.DELETE_CAMPAIGN, async (_event, id: string) => {
    const result = await deleteCampaign(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete campaign' }
  })

  // --- Bastion storage ---

  handle(IPC_CHANNELS.SAVE_BASTION, async (_event, bastion) => {
    const parsed = BastionSaveSchema.safeParse(bastion)
    if (!parsed.success) return { success: false, error: `Invalid bastion data: ${parsed.error.message}` }
    const result = await saveBastion(parsed.data)
    return { success: result.success, error: result.error }
  })

  handle(IPC_CHANNELS.LOAD_BASTIONS, async () => {
    const result = await loadBastions()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load bastions' }
  })

  handle(IPC_CHANNELS.LOAD_BASTION, async (_event, id: string) => {
    const result = await loadBastion(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load bastion' }
  })

  handle(IPC_CHANNELS.DELETE_BASTION, async (_event, id: string) => {
    const result = await deleteBastion(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete bastion' }
  })

  // --- Custom creature storage ---

  handle(IPC_CHANNELS.SAVE_CUSTOM_CREATURE, async (_event, creature) => {
    const parsed = CustomCreatureSaveSchema.safeParse(creature)
    if (!parsed.success) return { success: false, error: `Invalid creature data: ${parsed.error.message}` }
    const result = await saveCustomCreature(parsed.data)
    return { success: result.success, error: result.error }
  })

  handle(IPC_CHANNELS.LOAD_CUSTOM_CREATURES, async () => {
    const result = await loadCustomCreatures()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load custom creatures' }
  })

  handle(IPC_CHANNELS.LOAD_CUSTOM_CREATURE, async (_event, id: string) => {
    const result = await loadCustomCreature(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load custom creature' }
  })

  handle(IPC_CHANNELS.DELETE_CUSTOM_CREATURE, async (_event, id: string) => {
    const result = await deleteCustomCreature(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete custom creature' }
  })

  // --- Game state storage ---

  handle(IPC_CHANNELS.SAVE_GAME_STATE, async (_event, campaignId: string, state: Record<string, unknown>) => {
    const parsed = GameStateSaveSchema.safeParse(state)
    if (!parsed.success) return { success: false, error: `Invalid state data: ${parsed.error.message}` }
    const result = await saveGameStateStorage(campaignId, parsed.data)
    return { success: result.success, error: result.error }
  })

  handle(IPC_CHANNELS.LOAD_GAME_STATE, async (_event, campaignId: string) => {
    const result = await loadGameStateStorage(campaignId)
    if (result.success) {
      return result.data
    }
    return null
  })

  handle(IPC_CHANNELS.DELETE_GAME_STATE, async (_event, campaignId: string) => {
    const result = await deleteGameState(campaignId)
    if (result.success) {
      return result.data
    }
    return false
  })

  // --- Homebrew storage ---

  handle(IPC_CHANNELS.SAVE_HOMEBREW, async (_event, entry) => {
    const parsed = HomebrewSaveSchema.safeParse(entry)
    if (!parsed.success) return { success: false, error: `Invalid homebrew data: ${parsed.error.message}` }
    const result = await saveHomebrewEntry(parsed.data)
    return { success: result.success, error: result.error }
  })

  handle(IPC_CHANNELS.LOAD_HOMEBREW_BY_CATEGORY, async (_event, category: string) => {
    const result = await loadHomebrewEntries(category)
    if (result.success) return result.data
    return { success: false, error: result.error ?? 'Failed to load homebrew entries' }
  })

  handle(IPC_CHANNELS.LOAD_ALL_HOMEBREW, async () => {
    const result = await loadAllHomebrew()
    if (result.success) return result.data
    return { success: false, error: result.error ?? 'Failed to load all homebrew' }
  })

  handle(IPC_CHANNELS.DELETE_HOMEBREW, async (_event, category: string, id: string) => {
    const result = await deleteHomebrewEntry(category, id)
    if (result.success) return result.data
    return { success: false, error: result.error ?? 'Failed to delete homebrew entry' }
  })

  // --- Settings storage ---

  handle(IPC_CHANNELS.LOAD_SETTINGS, async () => {
    const result = await loadSettings()
    return result.data ?? {}
  })

  handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, settings: unknown) => {
    const parsed = AppSettingsSchema.safeParse(settings)
    if (!parsed.success) {
      return { success: false, error: `Invalid settings: ${parsed.error.message}` } as const
    }
    const result = await saveSettings(parsed.data)
    if (result.success) {
      applyBmoBaseUrlFromSettings(parsed.data)
      applyBmoApiKeyFromSettings(parsed.data)
    }
    return result
  })

  // --- Ban storage ---

  handle(IPC_CHANNELS.LOAD_BANS, async (_event, campaignId: string) => {
    const result = await loadBans(campaignId)
    return result.data ?? { peerIds: [], names: [] }
  })

  handle(
    IPC_CHANNELS.SAVE_BANS,
    async (
      _event,
      campaignId: string,
      banData: {
        peerIds: string[]
        names: string[]
        clients?: Array<{ clientId: string; lastAlias: string; bannedAt: number }>
      }
    ) => {
      return await saveBans(campaignId, banData)
    }
  )

  // --- Map Library storage ---

  handle(IPC_CHANNELS.MAP_LIBRARY_SAVE, async (_event, id: string, name: string, data: Record<string, unknown>) => {
    return saveMapToLibrary(id, name, data)
  })

  handle(IPC_CHANNELS.MAP_LIBRARY_LIST, async () => {
    return listMapLibrary()
  })

  handle(IPC_CHANNELS.MAP_LIBRARY_GET, async (_event, id: string) => {
    return getMapFromLibrary(id)
  })

  handle(IPC_CHANNELS.MAP_LIBRARY_DELETE, async (_event, id: string) => {
    return deleteMapFromLibrary(id)
  })

  // --- Shop Template storage ---

  handle(
    IPC_CHANNELS.SHOP_TEMPLATE_SAVE,
    async (_event, template: { id: string; name: string; inventory: unknown[]; markup: number }) => {
      return saveShopTemplate(template)
    }
  )

  handle(IPC_CHANNELS.SHOP_TEMPLATE_LIST, async () => {
    return listShopTemplates()
  })

  handle(IPC_CHANNELS.SHOP_TEMPLATE_GET, async (_event, id: string) => {
    return getShopTemplate(id)
  })

  handle(IPC_CHANNELS.SHOP_TEMPLATE_DELETE, async (_event, id: string) => {
    return deleteShopTemplate(id)
  })

  // --- Image Library storage ---

  handle(
    IPC_CHANNELS.IMAGE_LIBRARY_SAVE,
    async (_event, id: string, name: string, buffer: ArrayBuffer, extension: string) => {
      const buf = Buffer.from(buffer)
      // Phase 20f — reject files whose magic bytes don't match the claimed extension.
      const mismatch = validateUploadExtension(buf, extension)
      if (mismatch) return { success: false, error: mismatch }
      return saveImage(id, name, buf, extension)
    }
  )

  handle(IPC_CHANNELS.IMAGE_LIBRARY_LIST, async () => {
    return listImages()
  })

  handle(IPC_CHANNELS.IMAGE_LIBRARY_GET, async (_event, id: string) => {
    return getImage(id)
  })

  handle(IPC_CHANNELS.IMAGE_LIBRARY_DELETE, async (_event, id: string) => {
    return deleteImage(id)
  })

  // --- Book storage ---

  handle(IPC_CHANNELS.BOOK_LOAD_CONFIG, async () => {
    return loadBookConfig()
  })

  handle(IPC_CHANNELS.BOOK_ADD, async (_event, config: BookConfig) => {
    return addBook(config)
  })

  handle(IPC_CHANNELS.BOOK_REMOVE, async (_event, bookId: string) => {
    return removeBook(bookId)
  })

  handle(IPC_CHANNELS.BOOK_IMPORT, async (_event, sourcePath: string, title: string, bookId: string) => {
    // Phase 17a (NET-13) — reject obvious traversal / null-byte payloads in the renderer-supplied
    // source path (it's a user-picked file; full dialog-allowlist integration is a follow-up).
    if (typeof sourcePath !== 'string' || sourcePath.includes('..') || sourcePath.includes('\0')) {
      throw new Error('Invalid source path')
    }
    return importBook(sourcePath, title, bookId)
  })

  handle(IPC_CHANNELS.BOOK_READ_FILE, async (_event, filePath: string) => {
    // Phase 17a (NET-13) — reject traversal / null-byte payloads before reading.
    if (typeof filePath !== 'string' || filePath.includes('..') || filePath.includes('\0')) {
      throw new Error('Invalid book file path')
    }
    const result = await readBookFile(filePath)
    if (result.success && result.data) {
      // Must slice to the Buffer's actual range — Buffer.buffer returns the shared pool ArrayBuffer
      const buf = result.data
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      return { success: true, data: arrayBuffer }
    }
    return { success: false, error: result.error }
  })

  handle(IPC_CHANNELS.BOOK_LOAD_DATA, async (_event, bookId: string) => {
    return loadBookData(bookId)
  })

  handle(IPC_CHANNELS.BOOK_SAVE_DATA, async (_event, bookId: string, data: BookData) => {
    return saveBookData(bookId, data)
  })
}
