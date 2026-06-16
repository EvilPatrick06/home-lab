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
  wipeAllData: () => Promise<{ success: boolean; removed?: string[]; error?: string }>
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
  /** Suggested filename / path the native dialog opens with (S-13). */
  defaultPath?: string
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

interface BanClientEntry {
  clientId: string
  lastAlias: string
  bannedAt: number
}

interface BanData {
  peerIds: string[]
  names: string[]
  clients?: BanClientEntry[]
}

interface BanAPI {
  loadBans: (campaignId: string) => Promise<BanData>
  saveBans: (campaignId: string, banData: BanData) => Promise<{ success: boolean }>
}

interface FileAPI {
  readFile: (path: string) => Promise<string>
  readFileBinary: (path: string) => Promise<ArrayBuffer>
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
  ollamaHasUsableModel: boolean
  claude: boolean
  openai: boolean
  gemini: boolean
}

interface AiConfigData {
  ollamaModel?: string
  ollamaUrl?: string
  provider?: string
  model?: string
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  contextLength?: number
  ollamaKvCacheType?: 'q8_0' | 'q4_0'
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
  configure: (config: AiConfigData) => Promise<{ success: boolean; error?: string }>
  getConfig: () => Promise<AiConfigData>
  checkProviders: () => Promise<AiProviderStatus>
  buildIndex: () => Promise<{ success: boolean; chunkCount?: number; error?: string }>
  loadIndex: () => Promise<boolean>
  getChunkCount: () => Promise<number>
  prepareScene: (campaignId: string, characterIds: string[]) => Promise<{ success: boolean; streamId?: string | null }>
  getSceneStatus: (
    campaignId: string
  ) => Promise<{ status: 'idle' | 'preparing' | 'ready' | 'error'; streamId: string | null; error?: string }>
  cancelScene: (campaignId: string) => Promise<{ success: boolean; error?: string }>
  chatStream: (request: {
    campaignId: string
    message: string
    characterIds: string[]
    actingCharacterId?: string
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
  saveConversation: (campaignId: string) => Promise<{ success: boolean; summary?: string | null }>
  restoreConversation: (campaignId: string, data: Record<string, unknown>) => Promise<{ success: boolean }>
  loadConversation: (campaignId: string) => Promise<{ success: boolean; data?: unknown }>
  peekConversation: (campaignId: string) => Promise<{ success: boolean; data?: unknown }>
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
  validateApiKey: (provider: string, apiKey: string) => Promise<{ success: boolean; valid?: boolean; error?: string }>
  listCloudModels: (provider: string, apiKey?: string) => Promise<Array<{ id: string; name: string; desc?: string }>>
  syncWorldState: (campaignId: string, worldState: unknown) => Promise<{ success: boolean; error?: string }>
  syncCombatState: (campaignId: string, combatState: unknown) => Promise<{ success: boolean; error?: string }>
  getTokenBudget: (campaignId?: string) => Promise<{
    rulebookChunks: number
    srdData: number
    characterData: number
    campaignData: number
    creatures: number
    gameState: number
    memory: number
    total: number
  } | null>
  getTokenMeter: () => Promise<{ conversationBudget: number; contextWindow: number }>
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
  setNpcFields: (
    campaignId: string,
    npcName: string,
    fields: { faction?: string; location?: string; secretMotivation?: string }
  ) => Promise<{ success: boolean }>
  updateQuestLog: (
    campaignId: string,
    operation: 'add' | 'update' | 'complete' | 'remove',
    name: string,
    description?: string
  ) => Promise<{ success: boolean; error?: string }>
  adjustFactionStanding: (campaignId: string, factionName: string, delta: number) => Promise<{ success: boolean }>
  generateEndOfSessionRecap: (campaignId: string) => Promise<{ success: boolean; data?: string; error?: string }>
  // Memory files
  listMemoryFiles: (campaignId: string) => Promise<Array<{ name: string; size: number }>>
  readMemoryFile: (campaignId: string, fileName: string) => Promise<string>
  clearMemory: (campaignId: string) => Promise<void>
  // Vision / Map Analysis
  analyzeMap: (gameState: Record<string, unknown>) => Promise<{
    success: boolean
    analysis?: string
    error?: string
  }>
  // Proactive Triggers
  triggerStateUpdate: (state: Record<string, unknown>) => Promise<{
    success: boolean
    fired?: Array<{
      triggerId: string
      triggerName: string
      action: string
      actionPayload: Record<string, unknown>
    }>
    error?: string
  }>
  setTriggerObserverEnabled: (enabled: boolean) => Promise<{ enabled: boolean }>
  getTriggerObserverEnabled: () => Promise<{ enabled: boolean }>
  onTriggerFired: (
    cb: (data: {
      triggerId: string
      triggerName: string
      action: string
      actionPayload: Record<string, unknown>
    }) => void
  ) => void
  removeTriggerListener: () => void
  // Event listeners — each returns a per-listener unsubscribe (PHASE-05 05A)
  onStreamChunk: (cb: (data: AiStreamChunkData) => void) => () => void
  onStreamDone: (cb: (data: AiStreamDoneData) => void) => () => void
  onStreamError: (cb: (data: AiStreamErrorData) => void) => () => void
  onIndexProgress: (cb: (data: AiIndexProgressData) => void) => () => void
  onOllamaProgress: (cb: (data: OllamaProgressData) => void) => () => void
  onStreamFileRead: (cb: (data: { streamId: string; path: string; status: string }) => void) => () => void
  onStreamWebSearch: (cb: (data: { streamId: string; query: string; status: string }) => void) => () => void
  onStreamStatus: (cb: (data: { streamId: string; status: string; from?: string; to?: string }) => void) => () => void
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
  onStatus: (cb: (status: UpdateStatusData) => void) => () => void
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
  /** BMO Pi HTTP API base. When set, overrides BMO_PI_URL for bridge + cloud sync + CSP. */
  bmoPiBaseUrl?: string
  /** v2.1.16 auto-update preferences (all default false / opt-in). */
  autoCheckUpdates?: boolean
  autoDownloadUpdates?: boolean
  autoRestartAfterUpdate?: boolean
  autoInstallSilent?: boolean
  /** Persisted UI language (e.g. 'en', 'es'). */
  language?: string
  /** ISO timestamp of the last successful cloud backup (drives the staleness nudge). */
  lastBackupTime?: string
  /** Auto-run a cloud backup on launch when stale (default on; no-op unless cloud configured). */
  autoBackupOnLaunch?: boolean
}

interface SettingsAPI {
  saveSettings: (settings: AppSettingsData) => Promise<{ success: boolean; error?: string }>
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
  drawings?: unknown
  lastPage?: number
}

interface BooksAPI {
  loadConfig: () => Promise<BookConfigEntry[]>
  list?: () => Promise<{ success: boolean; data?: BookConfigEntry[]; error?: string }>
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

interface CloudSyncStatusResult {
  success: boolean
  configured: boolean
  remotes: string[]
  version?: string
  error?: string
}

interface CloudSyncResult {
  success: boolean
  message?: string
  error?: string
  details?: Record<string, unknown>
}

interface CampaignBackupResult extends CloudSyncResult {
  campaignId: string
  campaignName: string
}

interface CloudSyncAPI {
  getStatus: () => Promise<CloudSyncStatusResult>
  backupCampaign: (campaignId: string, campaignName: string) => Promise<CampaignBackupResult>
  checkCampaignStatus: (
    campaignId: string
  ) => Promise<CloudSyncResult & { campaignId: string; hasRemoteData?: boolean; lastSync?: string }>
  listRemoteCampaigns: () => Promise<
    CloudSyncResult & { campaigns?: Array<{ id: string; name: string; modified?: string }> }
  >
  restoreCampaign: (campaignId: string) => Promise<CloudSyncResult & { campaignId: string }>
}

interface SoundsAPI {
  /** Resolve a bundled-sound rel-path (`dice/d20-1.mp3`) to a cached on-disk
   * path, downloading + caching it from the Pi first if absent. Null on failure
   * (offline, no endpoint, malformed rel). */
  cacheGet: (rel: string) => Promise<string | null>
  /** Background-download every manifest clip into the disk cache (bounded
   * concurrency). Fire-and-forget; resolves once kicked off. */
  prewarm: () => Promise<{ ok: boolean }>
}

interface DiscordConfig {
  enabled: boolean
  botToken: string
  webhookUrl: string
  channelId?: string
  userId?: string
  dmMode: 'webhook' | 'bot-api'
}

interface DiscordAPI {
  getConfig: () => Promise<DiscordConfig>
  saveConfig: (config: DiscordConfig) => Promise<{ success: boolean; error?: string }>
  testConnection: () => Promise<{ success: boolean; error?: string }>
  sendMessage: (text: string, campaignName?: string) => Promise<{ success: boolean; error?: string }>
}

interface LanGameEntry {
  source: 'lan'
  invite_code: string
  name: string
  host_display_name: string
  host_client_id: string
  current_players: number
  max_players: number
  current_spectators: number
  max_spectators: number
  game_system: string
  is_private: boolean
  peer_id: string
  port: number
  host?: string
  addresses?: string[]
}

interface LanRemovedEntry {
  source: 'lan'
  peer_id: string
  invite_code?: string
}

interface LanAPI {
  startScan: () => Promise<{ ok: boolean; error?: string }>
  stopScan: () => Promise<{ ok: boolean }>
  publish: (entry: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  unpublish: () => Promise<{ ok: boolean }>
  onGameFound: (cb: (entry: LanGameEntry) => void) => () => void
  onGameRemoved: (cb: (entry: LanRemovedEntry) => void) => () => void
  onBmoResolvedUrl: (cb: (payload: { url: string | null }) => void) => () => void
  onBmoSignalingStatus: (cb: (payload: { reachable: boolean | null; host: string; port: number }) => void) => () => void
  probeSignaling: () => Promise<{ ok: boolean }>
}

// Raw Pi registry entry (no `source` tag — the renderer adds it). Mirrors
// RegistryGameEntryRaw in src/main/registry-bridge.ts.
interface RegistryGameEntryRaw {
  invite_code: string
  name: string
  host_display_name: string
  host_client_id: string
  current_players: number
  max_players: number
  current_spectators: number
  max_spectators: number
  game_system: string
  is_private: boolean
  hosting_mode?: 'p2p' | 'cloud'
  peer_id: string
  created_at: number
  banned_from_this_game: boolean
}

// Live-feed push event forwarded over REGISTRY_EVENT (matches RegistryPushEvent
// in src/main/registry-bridge.ts).
type RegistryPushEvent =
  | { type: 'snapshot'; games: RegistryGameEntryRaw[] }
  | { type: 'added'; game: RegistryGameEntryRaw }
  | { type: 'updated'; game: RegistryGameEntryRaw }
  | { type: 'removed'; inviteCode: string }
  | { type: 'error'; error: string }

interface RegistryAPI {
  announce: (payload: Record<string, unknown>, baseOverride?: string) => Promise<{ ok: boolean; error?: string }>
  update: (
    inviteCode: string,
    patch: Record<string, unknown>,
    baseOverride?: string
  ) => Promise<{ ok: boolean; error?: string }>
  heartbeat: (inviteCode: string, baseOverride?: string) => Promise<{ ok: boolean }>
  deregister: (inviteCode: string, baseOverride?: string) => Promise<{ ok: boolean }>
  list: (
    clientId: string | null,
    baseOverride?: string
  ) => Promise<{ ok: true; games: RegistryGameEntryRaw[] } | { ok: false; error: string }>
  subscribe: (subscriptionId: string, clientId: string | null) => Promise<{ ok: boolean }>
  unsubscribe: (subscriptionId: string) => Promise<{ ok: boolean }>
  onEvent: (cb: (payload: { subscriptionId: string; event: RegistryPushEvent }) => void) => () => void
}

interface LibraryManifest {
  version: string
  files: Record<string, { sha256: string; size: number }>
}

interface LibraryAPI {
  manifest: () => Promise<LibraryManifest | null>
  file: (rel: string) => Promise<string | null>
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
        cloudSync: CloudSyncAPI
        discord: DiscordAPI
        lan: LanAPI
        registry: RegistryAPI
        library: LibraryAPI
        sounds: SoundsAPI
        getVersion: () => Promise<string>
        // Security audit (20g)
        logSecurityEvent: (event: string, details?: Record<string, unknown>) => Promise<void>
        // BMO Pi Bridge
        bmoStartDm: (campaignId: string) => Promise<{ ok?: boolean; error?: string }>
        bmoStopDm: () => Promise<{ ok?: boolean; error?: string; recap?: string }>
        bmoNarrate: (text: string, npc?: string, emotion?: string) => Promise<{ ok?: boolean; error?: string }>
        bmoDmStatus: () => Promise<{ running: boolean; active: boolean; players: string[] }>
      }
  }
}
