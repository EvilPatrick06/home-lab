export {}

interface CharacterVersion {
  fileName: string
  timestamp: string
  sizeBytes: number
}

interface CharacterAPI {
  saveCharacter: (character: Record<string, unknown>) => Promise<{ success: boolean }>
  loadCharacters: () => Promise<Record<string, unknown>[]>
  loadCharacter: (id: string) => Promise<Record<string, unknown> | null>
  deleteCharacter: (id: string) => Promise<boolean>
  listCharacterVersions: (id: string) => Promise<{ success: boolean; data?: CharacterVersion[] }>
  restoreCharacterVersion: (
    id: string,
    fileName: string
  ) => Promise<{ success: boolean; data?: Record<string, unknown> }>
}

interface CampaignAPI {
  saveCampaign: (campaign: Record<string, unknown>) => Promise<{ success: boolean }>
  loadCampaigns: () => Promise<Record<string, unknown>[]>
  loadCampaign: (id: string) => Promise<Record<string, unknown> | null>
  deleteCampaign: (id: string) => Promise<boolean>
}

interface BastionAPI {
  saveBastion: (bastion: Record<string, unknown>) => Promise<{ success: boolean }>
  loadBastions: () => Promise<Record<string, unknown>[]>
  loadBastion: (id: string) => Promise<Record<string, unknown> | null>
  deleteBastion: (id: string) => Promise<boolean>
}

interface HomebrewAPI {
  saveHomebrew: (entry: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  loadHomebrewByCategory: (category: string) => Promise<Record<string, unknown>[]>
  loadAllHomebrew: () => Promise<Record<string, unknown>[]>
  deleteHomebrew: (category: string, id: string) => Promise<boolean>
}

interface CustomCreatureAPI {
  saveCustomCreature: (creature: Record<string, unknown>) => Promise<{ success: boolean }>
  loadCustomCreatures: () => Promise<Record<string, unknown>[]>
  loadCustomCreature: (id: string) => Promise<Record<string, unknown> | null>
  deleteCustomCreature: (id: string) => Promise<boolean>
}

interface FileDialogOptions {
  title: string
  filters: Array<{ name: string; extensions: string[] }>
}

interface DialogAPI {
  showSaveDialog: (options: FileDialogOptions) => Promise<string | null>
  showOpenDialog: (options: FileDialogOptions) => Promise<string | null>
}

interface GameStateStorageAPI {
  saveGameState: (campaignId: string, state: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  loadGameState: (campaignId: string) => Promise<Record<string, unknown> | null>
  deleteGameState: (campaignId: string) => Promise<boolean>
}

interface BanData {
  peerIds: string[]
  names: string[]
}

interface BanAPI {
  loadBans: (campaignId: string) => Promise<BanData>
  saveBans: (campaignId: string, banData: BanData) => Promise<{ success: boolean }>
}

interface FileAPI {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  writeFileBinary: (path: string, buffer: ArrayBuffer) => Promise<void>
}

// AI DM types for preload bridge
interface AiStreamChunkData {
  streamId: string
  text: string
}

interface AiDmAction {
  action: string
  [key: string]: unknown
}

interface AiRuleCitation {
  source: string
  rule: string
  text: string
}

interface AiStreamDoneData {
  streamId: string
  fullText: string
  displayText: string
  statChanges: AiStatChange[]
  dmActions: AiDmAction[]
  ruleCitations?: AiRuleCitation[]
}

interface AiStreamErrorData {
  streamId: string
  error: string
}

interface AiIndexProgressData {
  percent: number
  stage: string
}

interface AiProviderStatus {
  ollama: boolean
  ollamaModels: string[]
}

interface AiConfigData {
  ollamaModel: string
  ollamaUrl: string
}

interface AiStatChange {
  type: string
  [key: string]: unknown
}

interface AiMutationResult {
  applied: AiStatChange[]
  rejected: Array<{ change: AiStatChange; reason: string }>
}

interface OllamaStatus {
  installed: boolean
  running: boolean
  path?: string
}

interface VramInfo {
  totalMB: number
}

interface CuratedModel {
  id: string
  name: string
  vramMB: number
  contextSize: number
  desc: string
}

interface OllamaProgressData {
  type: string
  percent: number
}

interface InstalledModelInfo {
  name: string
  size: number
  modifiedAt: string
  digest: string
  parameterSize?: string
  quantization?: string
  family?: string
}

interface OllamaVersionInfo {
  installed: string
  latest?: string
  updateAvailable: boolean
}

interface AiAPI {
  configure: (config: AiConfigData) => Promise<{ success: boolean }>
  getConfig: () => Promise<AiConfigData>
  checkProviders: () => Promise<AiProviderStatus>
  buildIndex: () => Promise<{ success: boolean; chunkCount?: number; error?: string }>
  loadIndex: () => Promise<boolean>
  getChunkCount: () => Promise<number>
  prepareScene: (campaignId: string, characterIds: string[]) => Promise<{ success: boolean; streamId?: string | null }>
  getSceneStatus: (
    campaignId: string
  ) => Promise<{ status: 'idle' | 'preparing' | 'ready' | 'error'; streamId: string | null }>
  chatStream: (request: {
    campaignId: string
    message: string
    characterIds: string[]
    senderName?: string
    activeCreatures?: Array<{
      label: string
      currentHP: number
      maxHP: number
      ac: number
      conditions: string[]
      monsterStatBlockId?: string
    }>
    gameState?: string
  }) => Promise<{ success: boolean; streamId?: string; error?: string }>
  cancelStream: (streamId: string) => Promise<{ success: boolean }>
  applyMutations: (characterId: string, changes: AiStatChange[]) => Promise<AiMutationResult>
  longRest: (characterId: string) => Promise<AiMutationResult>
  shortRest: (characterId: string) => Promise<AiMutationResult>
  saveConversation: (campaignId: string) => Promise<{ success: boolean }>
  loadConversation: (campaignId: string) => Promise<{ success: boolean; data?: unknown }>
  deleteConversation: (campaignId: string) => Promise<{ success: boolean }>
  // Ollama management
  detectOllama: () => Promise<OllamaStatus>
  getVram: () => Promise<VramInfo>
  downloadOllama: () => Promise<{ success: boolean; path?: string; error?: string }>
  installOllama: (installerPath: string) => Promise<{ success: boolean; error?: string }>
  startOllama: () => Promise<{ success: boolean; error?: string }>
  pullModel: (model: string) => Promise<{ success: boolean; error?: string }>
  getCuratedModels: () => Promise<CuratedModel[]>
  listInstalledModels: () => Promise<string[]>
  listInstalledModelsDetailed: () => Promise<InstalledModelInfo[]>
  checkOllamaUpdate: () => Promise<{ success: boolean; data?: OllamaVersionInfo; error?: string }>
  updateOllama: () => Promise<{ success: boolean; error?: string }>
  deleteModel: (model: string) => Promise<{ success: boolean; error?: string }>
  getTokenBudget: () => Promise<{
    rulebookChunks: number
    srdData: number
    characterData: number
    campaignData: number
    creatures: number
    gameState: number
    memory: number
    total: number
  } | null>
  previewTokenBudget: (
    campaignId: string,
    characterIds: string[]
  ) => Promise<{
    rulebookChunks: number
    srdData: number
    characterData: number
    campaignData: number
    creatures: number
    gameState: number
    memory: number
    total: number
  } | null>
  // NPC relationship tracking
  logNpcInteraction: (
    campaignId: string,
    npcName: string,
    summary: string,
    attitudeAfter: string
  ) => Promise<{ success: boolean }>
  setNpcRelationship: (
    campaignId: string,
    npcName: string,
    targetNpcName: string,
    relationship: string,
    disposition: string
  ) => Promise<{ success: boolean }>
  // Memory files
  listMemoryFiles: (campaignId: string) => Promise<Array<{ name: string; size: number }>>
  readMemoryFile: (campaignId: string, fileName: string) => Promise<string>
  clearMemory: (campaignId: string) => Promise<void>
  // Event listeners
  onStreamChunk: (cb: (data: AiStreamChunkData) => void) => void
  onStreamDone: (cb: (data: AiStreamDoneData) => void) => void
  onStreamError: (cb: (data: AiStreamErrorData) => void) => void
  onIndexProgress: (cb: (data: AiIndexProgressData) => void) => void
  onOllamaProgress: (cb: (data: OllamaProgressData) => void) => void
  onStreamFileRead: (cb: (data: { streamId: string; path: string; status: string }) => void) => void
  onStreamWebSearch: (cb: (data: { streamId: string; query: string; status: string }) => void) => void
  approveWebSearch: (streamId: string, approved: boolean) => Promise<{ success: boolean; error?: string }>
  removeAllAiListeners: () => void
}

interface WindowAPI {
  toggleFullscreen: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  openDevTools: () => Promise<void>
}

interface UpdateStatusData {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}

interface UpdateAPI {
  checkForUpdates: () => Promise<UpdateStatusData>
  downloadUpdate: () => Promise<UpdateStatusData>
  installUpdate: () => Promise<void>
  onStatus: (cb: (status: UpdateStatusData) => void) => void
  removeStatusListener: () => void
}

interface RTCIceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

interface AppSettingsData {
  turnServers?: RTCIceServerConfig[]
  userProfile?: {
    id: string
    displayName: string
    avatarPath?: string
    createdAt: string
  }
}

interface SettingsAPI {
  saveSettings: (settings: AppSettingsData) => Promise<{ success: boolean }>
  loadSettings: () => Promise<AppSettingsData>
}

interface AudioUploadResult {
  fileName: string
  displayName: string
  category: string
}

interface AudioPickResult {
  fileName: string
  buffer: ArrayBuffer
}

interface AudioAPI {
  audioUploadCustom: (
    campaignId: string,
    fileName: string,
    buffer: ArrayBuffer,
    displayName: string,
    category: string
  ) => Promise<{ success: boolean; data?: AudioUploadResult; error?: string }>
  audioListCustom: (campaignId: string) => Promise<{ success: boolean; data?: string[]; error?: string }>
  audioDeleteCustom: (campaignId: string, fileName: string) => Promise<{ success: boolean; error?: string }>
  audioGetCustomPath: (
    campaignId: string,
    fileName: string
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  audioPickFile: () => Promise<{ success: boolean; data?: AudioPickResult; error?: string }>
}

interface GameDataAPI {
  loadJson: (path: string) => Promise<unknown>

  // Character data
  loadSpecies: () => Promise<unknown[]>
  loadSpeciesTraits: () => Promise<Record<string, unknown>>
  loadClasses: () => Promise<unknown[]>
  loadBackgrounds: () => Promise<unknown[]>
  loadClassFeatures: () => Promise<Record<string, unknown>>
  loadFeats: () => Promise<unknown[]>
  loadSubclasses: () => Promise<unknown[]>
  loadStartingEquipment: () => Promise<unknown[]>
  loadSpeciesSpells: () => Promise<Record<string, unknown>>
  loadAbilityScoreConfig: () => Promise<Record<string, unknown>>
  loadPresetIcons: () => Promise<unknown[]>
  loadLanguageD12Table: () => Promise<unknown[]>

  // Spell data
  loadSpells: () => Promise<unknown[]>

  // Equipment data
  loadEquipment: () => Promise<Record<string, unknown>>
  loadLightSources: () => Promise<Record<string, unknown>>
  loadMagicItems: () => Promise<unknown[]>
  loadMounts: () => Promise<Record<string, unknown>>
  loadSentientItems: () => Promise<Record<string, unknown>>
  loadTrinkets: () => Promise<unknown[]>
  loadVariantItems: () => Promise<Record<string, unknown>>
  loadWearableItems: () => Promise<unknown[]>
  loadCurrencyConfig: () => Promise<unknown[]>

  // Creature data
  loadMonsters: () => Promise<unknown[]>
  loadNpcs: () => Promise<unknown[]>
  loadCreatures: () => Promise<unknown[]>
  loadCreatureTypes: () => Promise<Record<string, unknown>>
  loadNpcNames: () => Promise<Record<string, unknown>>
  loadNpcAppearance: () => Promise<Record<string, unknown>>
  loadNpcMannerisms: () => Promise<Record<string, unknown>>
  loadAlignmentDescriptions: () => Promise<Record<string, unknown>>
  loadPersonalityTables: () => Promise<Record<string, unknown>>

  // Encounter data
  loadChaseTables: () => Promise<Record<string, unknown>>
  loadEncounterBudgets: () => Promise<Record<string, unknown>>
  loadEncounterPresets: () => Promise<unknown[]>
  loadRandomTables: () => Promise<Record<string, unknown>>

  // Hazard data
  loadConditions: () => Promise<unknown[]>
  loadCurses: () => Promise<unknown[]>
  loadDiseases: () => Promise<unknown[]>
  loadEnvironmentalEffects: () => Promise<unknown[]>
  loadHazards: () => Promise<unknown[]>
  loadPoisons: () => Promise<unknown[]>
  loadTraps: () => Promise<unknown[]>
  loadSupernaturalGifts: () => Promise<unknown[]>

  // Bastion data
  loadBastionEvents: () => Promise<Record<string, unknown>>
  loadBastionFacilities: () => Promise<Record<string, unknown>>

  // World data
  loadCalendarPresets: () => Promise<Record<string, unknown>>
  loadCraftingTools: () => Promise<unknown[]>
  loadDowntime: () => Promise<unknown[]>
  loadSettlements: () => Promise<unknown[]>
  loadSiegeEquipment: () => Promise<unknown[]>
  loadTreasureTables: () => Promise<Record<string, unknown>>
  loadWeatherGeneration: () => Promise<Record<string, unknown>>
  loadBuiltInMaps: () => Promise<unknown[]>
  loadSessionZeroConfig: () => Promise<Record<string, unknown>>
  loadAdventureSeeds: () => Promise<Record<string, unknown>>

  // Mechanics data
  loadEffectDefinitions: () => Promise<Record<string, unknown>>
  loadFightingStyles: () => Promise<unknown[]>
  loadLanguages: () => Promise<unknown[]>
  loadSkills: () => Promise<unknown[]>
  loadSpellSlots: () => Promise<Record<string, unknown>>
  loadWeaponMastery: () => Promise<unknown[]>
  loadXpThresholds: () => Promise<unknown[]>
  loadClassResources: () => Promise<Record<string, unknown>>
  loadSpeciesResources: () => Promise<Record<string, unknown>>
  loadDiceTypes: () => Promise<unknown[]>
  loadLightingTravel: () => Promise<Record<string, unknown>>

  // Audio data
  loadSoundEvents: () => Promise<Record<string, unknown>>
  loadAmbientTracks: () => Promise<Record<string, unknown>>

  // UI data
  loadKeyboardShortcuts: () => Promise<unknown[]>
  loadThemes: () => Promise<Record<string, unknown>>
  loadDiceColors: () => Promise<Record<string, unknown>>
  loadDmTabs: () => Promise<unknown[]>
  loadNotificationTemplates: () => Promise<Record<string, unknown>>
  loadRarityOptions: () => Promise<unknown[]>

  // AI data
  loadModeration: () => Promise<Record<string, unknown>>
}

interface PluginScanResult {
  success: boolean
  data?: Array<{
    id: string
    manifest: Record<string, unknown>
    enabled: boolean
    loaded: boolean
    error?: string
  }>
  error?: string
}

interface PluginContentResult {
  success: boolean
  data?: Record<string, unknown[]>
  error?: string
}

interface PluginAPI {
  scan: () => Promise<PluginScanResult>
  enable: (pluginId: string) => Promise<{ success: boolean }>
  disable: (pluginId: string) => Promise<{ success: boolean }>
  loadContent: (pluginId: string, manifest: Record<string, unknown>) => Promise<PluginContentResult>
  getEnabled: () => Promise<string[]>
  install: () => Promise<{ success: boolean; data?: string; error?: string }>
  uninstall: (pluginId: string) => Promise<{ success: boolean; error?: string }>
  storageGet: (pluginId: string, key: string) => Promise<unknown>
  storageSet: (pluginId: string, key: string, value: unknown) => Promise<{ success: boolean }>
  storageDelete: (pluginId: string, key: string) => Promise<{ success: boolean }>
}

interface MapLibraryEntry {
  id: string
  name: string
  data: Record<string, unknown>
  savedAt: string
}

interface MapLibraryAPI {
  save: (id: string, name: string, data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  list: () => Promise<{ success: boolean; data?: Array<{ id: string; name: string; savedAt: string }>; error?: string }>
  get: (id: string) => Promise<{ success: boolean; data?: MapLibraryEntry; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
}

interface ShopTemplateEntry {
  id: string
  name: string
  inventory: unknown[]
  markup: number
  savedAt: string
}

interface ShopTemplateAPI {
  save: (template: {
    id: string
    name: string
    inventory: unknown[]
    markup: number
  }) => Promise<{ success: boolean; error?: string }>
  list: () => Promise<{
    success: boolean
    data?: Array<{ id: string; name: string; markup: number; itemCount: number; savedAt: string }>
    error?: string
  }>
  get: (id: string) => Promise<{ success: boolean; data?: ShopTemplateEntry; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
}

interface ImageLibraryAPI {
  save: (
    id: string,
    name: string,
    buffer: ArrayBuffer,
    extension: string
  ) => Promise<{ success: boolean; error?: string }>
  list: () => Promise<{
    success: boolean
    data?: Array<{ id: string; name: string; fileName: string; savedAt: string }>
    error?: string
  }>
  get: (id: string) => Promise<{ success: boolean; data?: { path: string; name: string }; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
}

interface BookConfigEntry {
  id: string
  title: string
  path: string
  type: 'core' | 'custom'
  coverPath?: string
  addedAt: string
}

interface BookmarkEntry {
  id: string
  bookId: string
  page: number
  label: string
  color?: string
  createdAt: string
}

interface AnnotationEntry {
  id: string
  bookId: string
  page: number
  text: string
  highlight?: { x: number; y: number; width: number; height: number }
  createdAt: string
}

interface BookDataEntry {
  bookmarks: BookmarkEntry[]
  annotations: AnnotationEntry[]
}

interface BooksAPI {
  loadConfig: () => Promise<BookConfigEntry[]>
  add: (config: BookConfigEntry) => Promise<{ success: boolean; error?: string }>
  remove: (bookId: string) => Promise<{ success: boolean; error?: string }>
  import: (
    sourcePath: string,
    title: string,
    bookId: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  readFile: (filePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
  loadData: (bookId: string) => Promise<BookDataEntry>
  saveData: (bookId: string, data: BookDataEntry) => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    api: CharacterAPI &
      CampaignAPI &
      BastionAPI &
      CustomCreatureAPI &
      HomebrewAPI &
      GameStateStorageAPI &
      DialogAPI &
      BanAPI &
      FileAPI &
      WindowAPI &
      SettingsAPI &
      AudioAPI & {
        ai: AiAPI
        update: UpdateAPI
        game: GameDataAPI
        mapLibrary: MapLibraryAPI
        shopTemplates: ShopTemplateAPI
        imageLibrary: ImageLibraryAPI
        books: BooksAPI
        plugins: PluginAPI
        getVersion: () => Promise<string>
        // BMO Pi Bridge
        bmoStartDm: (campaignId: string) => Promise<{ ok?: boolean; error?: string }>
        bmoStopDm: () => Promise<{ ok?: boolean; error?: string; recap?: string }>
        bmoNarrate: (text: string, npc?: string, emotion?: string) => Promise<{ ok?: boolean; error?: string }>
        bmoDmStatus: () => Promise<{ running: boolean; active: boolean; players: string[] }>
      }
  }
}
