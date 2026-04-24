import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
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
import { type AppSettings, loadSettings, saveSettings } from '../storage/settings-storage'
import { deleteShopTemplate, getShopTemplate, listShopTemplates, saveShopTemplate } from '../storage/shop-storage'

// Ensure imported types are used for type-safety
type _CharacterVersion = CharacterVersion

export function registerStorageHandlers(): void {
  // --- Character storage ---

  ipcMain.handle(IPC_CHANNELS.SAVE_CHARACTER, async (_event, character) => {
    const result = await saveCharacter(character)
    return { success: result.success, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_CHARACTERS, async () => {
    const result = await loadCharacters()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load characters' }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_CHARACTER, async (_event, id: string) => {
    const result = await loadCharacter(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load character' }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_CHARACTER, async (_event, id: string) => {
    const result = await deleteCharacter(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete character' }
  })

  ipcMain.handle(IPC_CHANNELS.CHARACTER_VERSIONS, async (_event, id: string) => {
    return listCharacterVersions(id)
  })

  ipcMain.handle(IPC_CHANNELS.CHARACTER_RESTORE_VERSION, async (_event, id: string, fileName: string) => {
    return restoreCharacterVersion(id, fileName)
  })

  // --- Campaign storage ---

  ipcMain.handle(IPC_CHANNELS.SAVE_CAMPAIGN, async (_event, campaign) => {
    const result = await saveCampaign(campaign)
    return { success: result.success, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_CAMPAIGNS, async () => {
    const result = await loadCampaigns()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load campaigns' }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_CAMPAIGN, async (_event, id: string) => {
    const result = await loadCampaign(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load campaign' }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_CAMPAIGN, async (_event, id: string) => {
    const result = await deleteCampaign(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete campaign' }
  })

  // --- Bastion storage ---

  ipcMain.handle(IPC_CHANNELS.SAVE_BASTION, async (_event, bastion) => {
    const result = await saveBastion(bastion)
    return { success: result.success, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_BASTIONS, async () => {
    const result = await loadBastions()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load bastions' }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_BASTION, async (_event, id: string) => {
    const result = await loadBastion(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load bastion' }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_BASTION, async (_event, id: string) => {
    const result = await deleteBastion(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete bastion' }
  })

  // --- Custom creature storage ---

  ipcMain.handle(IPC_CHANNELS.SAVE_CUSTOM_CREATURE, async (_event, creature) => {
    const result = await saveCustomCreature(creature)
    return { success: result.success, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_CUSTOM_CREATURES, async () => {
    const result = await loadCustomCreatures()
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load custom creatures' }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_CUSTOM_CREATURE, async (_event, id: string) => {
    const result = await loadCustomCreature(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to load custom creature' }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_CUSTOM_CREATURE, async (_event, id: string) => {
    const result = await deleteCustomCreature(id)
    if (result.success) {
      return result.data
    }
    return { success: false, error: result.error ?? 'Failed to delete custom creature' }
  })

  // --- Game state storage ---

  ipcMain.handle(IPC_CHANNELS.SAVE_GAME_STATE, async (_event, campaignId: string, state: Record<string, unknown>) => {
    const result = await saveGameStateStorage(campaignId, state)
    return { success: result.success, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_GAME_STATE, async (_event, campaignId: string) => {
    const result = await loadGameStateStorage(campaignId)
    if (result.success) {
      return result.data
    }
    return null
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_GAME_STATE, async (_event, campaignId: string) => {
    const result = await deleteGameState(campaignId)
    if (result.success) {
      return result.data
    }
    return false
  })

  // --- Homebrew storage ---

  ipcMain.handle(IPC_CHANNELS.SAVE_HOMEBREW, async (_event, entry) => {
    const result = await saveHomebrewEntry(entry)
    return { success: result.success, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_HOMEBREW_BY_CATEGORY, async (_event, category: string) => {
    const result = await loadHomebrewEntries(category)
    if (result.success) return result.data
    return { success: false, error: result.error ?? 'Failed to load homebrew entries' }
  })

  ipcMain.handle(IPC_CHANNELS.LOAD_ALL_HOMEBREW, async () => {
    const result = await loadAllHomebrew()
    if (result.success) return result.data
    return { success: false, error: result.error ?? 'Failed to load all homebrew' }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_HOMEBREW, async (_event, category: string, id: string) => {
    const result = await deleteHomebrewEntry(category, id)
    if (result.success) return result.data
    return { success: false, error: result.error ?? 'Failed to delete homebrew entry' }
  })

  // --- Settings storage ---

  ipcMain.handle(IPC_CHANNELS.LOAD_SETTINGS, async () => {
    return loadSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, settings: AppSettings) => {
    await saveSettings(settings)
    return { success: true }
  })

  // --- Map Library storage ---

  ipcMain.handle(
    IPC_CHANNELS.MAP_LIBRARY_SAVE,
    async (_event, id: string, name: string, data: Record<string, unknown>) => {
      return saveMapToLibrary(id, name, data)
    }
  )

  ipcMain.handle(IPC_CHANNELS.MAP_LIBRARY_LIST, async () => {
    return listMapLibrary()
  })

  ipcMain.handle(IPC_CHANNELS.MAP_LIBRARY_GET, async (_event, id: string) => {
    return getMapFromLibrary(id)
  })

  ipcMain.handle(IPC_CHANNELS.MAP_LIBRARY_DELETE, async (_event, id: string) => {
    return deleteMapFromLibrary(id)
  })

  // --- Shop Template storage ---

  ipcMain.handle(
    IPC_CHANNELS.SHOP_TEMPLATE_SAVE,
    async (_event, template: { id: string; name: string; inventory: unknown[]; markup: number }) => {
      return saveShopTemplate(template)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SHOP_TEMPLATE_LIST, async () => {
    return listShopTemplates()
  })

  ipcMain.handle(IPC_CHANNELS.SHOP_TEMPLATE_GET, async (_event, id: string) => {
    return getShopTemplate(id)
  })

  ipcMain.handle(IPC_CHANNELS.SHOP_TEMPLATE_DELETE, async (_event, id: string) => {
    return deleteShopTemplate(id)
  })

  // --- Image Library storage ---

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_LIBRARY_SAVE,
    async (_event, id: string, name: string, buffer: ArrayBuffer, extension: string) => {
      return saveImage(id, name, Buffer.from(buffer), extension)
    }
  )

  ipcMain.handle(IPC_CHANNELS.IMAGE_LIBRARY_LIST, async () => {
    return listImages()
  })

  ipcMain.handle(IPC_CHANNELS.IMAGE_LIBRARY_GET, async (_event, id: string) => {
    return getImage(id)
  })

  ipcMain.handle(IPC_CHANNELS.IMAGE_LIBRARY_DELETE, async (_event, id: string) => {
    return deleteImage(id)
  })

  // --- Book storage ---

  ipcMain.handle(IPC_CHANNELS.BOOK_LOAD_CONFIG, async () => {
    return loadBookConfig()
  })

  ipcMain.handle(IPC_CHANNELS.BOOK_ADD, async (_event, config: BookConfig) => {
    return addBook(config)
  })

  ipcMain.handle(IPC_CHANNELS.BOOK_REMOVE, async (_event, bookId: string) => {
    return removeBook(bookId)
  })

  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT, async (_event, sourcePath: string, title: string, bookId: string) => {
    return importBook(sourcePath, title, bookId)
  })

  ipcMain.handle(IPC_CHANNELS.BOOK_READ_FILE, async (_event, filePath: string) => {
    const result = await readBookFile(filePath)
    if (result.success && result.data) {
      // Must slice to the Buffer's actual range — Buffer.buffer returns the shared pool ArrayBuffer
      const buf = result.data
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      return { success: true, data: arrayBuffer }
    }
    return { success: false, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.BOOK_LOAD_DATA, async (_event, bookId: string) => {
    return loadBookData(bookId)
  })

  ipcMain.handle(IPC_CHANNELS.BOOK_SAVE_DATA, async (_event, bookId: string, data: BookData) => {
    return saveBookData(bookId, data)
  })
}
