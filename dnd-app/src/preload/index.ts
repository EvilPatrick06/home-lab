import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const api = {
  // Character storage
  saveCharacter: (character: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CHARACTER, character),
  loadCharacters: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CHARACTERS),
  loadCharacter: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CHARACTER, id),
  deleteCharacter: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CHARACTER, id),
  listCharacterVersions: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_VERSIONS, id),
  restoreCharacterVersion: (id: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_RESTORE_VERSION, id, fileName),

  // Campaign storage
  saveCampaign: (campaign: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CAMPAIGN, campaign),
  loadCampaigns: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CAMPAIGNS),
  loadCampaign: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CAMPAIGN, id),
  deleteCampaign: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CAMPAIGN, id),

  // Bastion storage
  saveBastion: (bastion: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_BASTION, bastion),
  loadBastions: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_BASTIONS),
  loadBastion: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_BASTION, id),
  deleteBastion: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_BASTION, id),

  // Custom creature storage
  saveCustomCreature: (creature: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_CUSTOM_CREATURE, creature),
  loadCustomCreatures: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CUSTOM_CREATURES),
  loadCustomCreature: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CUSTOM_CREATURE, id),
  deleteCustomCreature: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CUSTOM_CREATURE, id),

  // Homebrew storage
  saveHomebrew: (entry: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_HOMEBREW, entry),
  loadHomebrewByCategory: (category: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_HOMEBREW_BY_CATEGORY, category),
  loadAllHomebrew: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_ALL_HOMEBREW),
  deleteHomebrew: (category: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_HOMEBREW, category, id),

  // File dialogs
  showSaveDialog: (options: { title: string; filters: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE, options),
  showOpenDialog: (options: { title: string; filters: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN, options),

  // Game state storage
  saveGameState: (campaignId: string, state: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_GAME_STATE, campaignId, state),
  loadGameState: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_GAME_STATE, campaignId),
  deleteGameState: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_GAME_STATE, campaignId),

  // Ban storage
  loadBans: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_BANS, campaignId),
  saveBans: (campaignId: string, banData: { peerIds: string[]; names: string[] }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_BANS, campaignId, banData),

  // File I/O
  readFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ, path),
  readFileBinary: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_BINARY, path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE, path, content),
  writeFileBinary: (path: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_BINARY, path, buffer),

  // Window controls
  toggleFullscreen: () => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_FULLSCREEN),
  isFullscreen: () => ipcRenderer.invoke(IPC_CHANNELS.IS_FULLSCREEN),
  openDevTools: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_DEVTOOLS),

  // AI DM
  ai: {
    configure: (config: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIGURE, config),
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CONFIG),
    checkProviders: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CHECK_PROVIDERS),
    buildIndex: () => ipcRenderer.invoke(IPC_CHANNELS.AI_BUILD_INDEX),
    loadIndex: () => ipcRenderer.invoke(IPC_CHANNELS.AI_LOAD_INDEX),
    getChunkCount: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CHUNK_COUNT),
    prepareScene: (campaignId: string, characterIds: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PREPARE_SCENE, campaignId, characterIds),
    getSceneStatus: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_SCENE_STATUS, campaignId),
    chatStream: (request: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_STREAM, request),
    cancelStream: (streamId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_STREAM, streamId),
    applyMutations: (characterId: string, changes: unknown[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_APPLY_MUTATIONS, characterId, changes),
    longRest: (characterId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LONG_REST, characterId),
    shortRest: (characterId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_SHORT_REST, characterId),
    saveConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_CONVERSATION, campaignId),
    restoreConversation: (campaignId: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RESTORE_CONVERSATION, campaignId, data),
    loadConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LOAD_CONVERSATION, campaignId),
    deleteConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_CONVERSATION, campaignId),
    // Cloud provider models
    listCloudModels: (providerType: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_CLOUD_MODELS, providerType),
    validateApiKey: (providerType: string, apiKey: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_VALIDATE_API_KEY, providerType, apiKey),
    // Ollama management
    detectOllama: () => ipcRenderer.invoke(IPC_CHANNELS.AI_DETECT_OLLAMA),
    getVram: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_VRAM),
    downloadOllama: () => ipcRenderer.invoke(IPC_CHANNELS.AI_DOWNLOAD_OLLAMA),
    installOllama: (installerPath: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_INSTALL_OLLAMA, installerPath),
    startOllama: () => ipcRenderer.invoke(IPC_CHANNELS.AI_START_OLLAMA),
    pullModel: (model: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_PULL_MODEL, model),
    getCuratedModels: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CURATED_MODELS),
    listInstalledModels: () => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_INSTALLED_MODELS),
    listInstalledModelsDetailed: () => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_INSTALLED_MODELS_DETAILED),
    checkOllamaUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.AI_OLLAMA_CHECK_UPDATE),
    updateOllama: () => ipcRenderer.invoke(IPC_CHANNELS.AI_OLLAMA_UPDATE),
    deleteModel: (model: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_MODEL, model),
    getTokenBudget: () => ipcRenderer.invoke(IPC_CHANNELS.AI_TOKEN_BUDGET),
    previewTokenBudget: (campaignId: string, characterIds: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TOKEN_BUDGET_PREVIEW, campaignId, characterIds),
    // Live state sync
    syncWorldState: (campaignId: string, state: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SYNC_WORLD_STATE, campaignId, state),
    syncCombatState: (campaignId: string, state: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SYNC_COMBAT_STATE, campaignId, state),
    // NPC relationship tracking
    logNpcInteraction: (campaignId: string, npcName: string, summary: string, attitudeAfter: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_LOG_NPC_INTERACTION, campaignId, npcName, summary, attitudeAfter),
    setNpcRelationship: (
      campaignId: string,
      npcName: string,
      targetNpcName: string,
      relationship: string,
      disposition: string
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI_SET_NPC_RELATIONSHIP,
        campaignId,
        npcName,
        targetNpcName,
        relationship,
        disposition
      ),
    // Memory files
    listMemoryFiles: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_MEMORY_FILES, campaignId),
    readMemoryFile: (campaignId: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_READ_MEMORY_FILE, campaignId, fileName),
    clearMemory: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CLEAR_MEMORY, campaignId),
    // Vision / Map Analysis
    captureMap: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CAPTURE_MAP),
    analyzeMap: (gameState: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_ANALYZE_MAP, gameState),
    // Proactive Triggers
    triggerStateUpdate: (state: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TRIGGER_STATE_UPDATE, state),
    onTriggerFired: (
      cb: (data: {
        triggerId: string
        triggerName: string
        action: string
        actionPayload: Record<string, unknown>
      }) => void
    ) => {
      ipcRenderer.on('ai:trigger-fired', (_e, data) => cb(data))
    },
    removeTriggerListener: () => {
      ipcRenderer.removeAllListeners('ai:trigger-fired')
    },
    // Event listeners (main → renderer)
    onStreamChunk: (cb: (data: { streamId: string; text: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_CHUNK, (_e, data) => cb(data))
    },
    onStreamDone: (
      cb: (data: {
        streamId: string
        fullText: string
        displayText: string
        statChanges: unknown[]
        dmActions: unknown[]
        ruleCitations?: Array<{ source: string; rule: string; text: string }>
      }) => void
    ) => {
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_DONE, (_e, data) => cb(data))
    },
    onStreamError: (cb: (data: { streamId: string; error: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_ERROR, (_e, data) => cb(data))
    },
    onIndexProgress: (cb: (data: { percent: number; stage: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_INDEX_PROGRESS, (_e, data) => cb(data))
    },
    onOllamaProgress: (cb: (data: { type: string; percent: number }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_OLLAMA_PROGRESS, (_e, data) => cb(data))
    },
    onStreamFileRead: (cb: (data: { streamId: string; path: string; status: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_FILE_READ, (_e, data) => cb(data))
    },
    onStreamWebSearch: (cb: (data: { streamId: string; query: string; status: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_WEB_SEARCH, (_e, data) => cb(data))
    },
    approveWebSearch: (streamId: string, approved: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WEB_SEARCH_APPROVE, streamId, approved),
    removeAllAiListeners: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_STREAM_CHUNK)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_STREAM_DONE)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_STREAM_ERROR)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_INDEX_PROGRESS)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_OLLAMA_PROGRESS)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_STREAM_FILE_READ)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_STREAM_WEB_SEARCH)
    }
  },

  // App updates
  update: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    onStatus: (cb: (status: { state: string; version?: string; percent?: number; message?: string }) => void) => {
      const listener = (
        _e: IpcRendererEvent,
        status: { state: string; version?: string; percent?: number; message?: string }
      ) => cb(status)
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, listener)
    },
    removeStatusListener: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_STATUS)
    }
  },

  // Auto-update

  // Settings
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_SETTINGS),

  // Audio
  audioUploadCustom: (
    campaignId: string,
    fileName: string,
    buffer: ArrayBuffer,
    displayName: string,
    category: string
  ) => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM, campaignId, fileName, buffer, displayName, category),
  audioListCustom: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_LIST_CUSTOM, campaignId),
  audioDeleteCustom: (campaignId: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_DELETE_CUSTOM, campaignId, fileName),
  audioGetCustomPath: (campaignId: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH, campaignId, fileName),
  audioPickFile: () => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_PICK_FILE),

  // App info
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  // Game data
  game: {
    loadJson: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, path.replace(/^\.\//, '')),

    // Character data
    loadSpecies: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/species.json'),
    loadSpeciesTraits: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/species-traits.json'),
    loadClasses: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/classes.json'),
    loadBackgrounds: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/backgrounds.json'),
    loadClassFeatures: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/class-features.json'),
    loadFeats: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/feats.json'),
    loadSubclasses: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/subclasses.json'),
    loadStartingEquipment: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/starting-equipment.json'),
    loadSpeciesSpells: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/species-spells.json'),
    loadAbilityScoreConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/ability-score-config.json'),
    loadPresetIcons: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/preset-icons.json'),
    loadLanguageD12Table: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/character/language-d12-table.json'),

    // Spell data
    loadSpells: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/spells/spells.json'),

    // Equipment data
    loadEquipment: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/equipment.json'),
    loadLightSources: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/light-sources.json'),
    loadMagicItems: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/magic-items.json'),
    loadMounts: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/mounts.json'),
    loadSentientItems: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/sentient-items.json'),
    loadTrinkets: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/trinkets.json'),
    loadVariantItems: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/variant-items.json'),
    loadWearableItems: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/wearable-items.json'),
    loadCurrencyConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/equipment/currency-config.json'),

    // Creature data
    loadMonsters: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/monsters.json'),
    loadNpcs: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/npcs.json'),
    loadCreatures: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/creatures.json'),
    loadCreatureTypes: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/creature-types.json'),
    loadNpcNames: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/generation-tables/npc-names.json'),
    loadNpcAppearance: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/generation-tables/npc-appearance.json'),
    loadNpcMannerisms: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/generation-tables/npc-mannerisms.json'),
    loadAlignmentDescriptions: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/generation-tables/alignment-descriptions.json'),
    loadPersonalityTables: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/dm/npcs/generation-tables/personality-tables.json'),

    // Encounter data
    loadChaseTables: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/encounters/chase-tables.json'),
    loadEncounterBudgets: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/encounters/encounter-budgets.json'),
    loadEncounterPresets: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/encounters/encounter-presets.json'),
    loadRandomTables: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/encounters/random-tables.json'),

    // Hazard data
    loadConditions: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/conditions.json'),
    loadCurses: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/curses.json'),
    loadDiseases: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/diseases.json'),
    loadEnvironmentalEffects: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/environmental-effects.json'),
    loadHazards: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/hazards.json'),
    loadPoisons: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/poisons.json'),
    loadTraps: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/traps.json'),
    loadSupernaturalGifts: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/hazards/supernatural-gifts.json'),

    // Bastion data
    loadBastionEvents: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/bastions/bastion-events.json'),
    loadBastionFacilities: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/bastions/bastion-facilities.json'),

    // World data
    loadCalendarPresets: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/calendar-presets.json'),
    loadCraftingTools: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/crafting.json'),
    loadDowntime: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/downtime.json'),
    loadSettlements: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/settlements.json'),
    loadSiegeEquipment: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/siege-equipment.json'),
    loadTreasureTables: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/treasure-tables.json'),
    loadWeatherGeneration: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/weather-generation.json'),
    loadBuiltInMaps: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/built-in-maps.json'),
    loadSessionZeroConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/session-zero-config.json'),
    loadAdventureSeeds: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/world/adventure-seeds.json'),

    // Mechanics data
    loadEffectDefinitions: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/effect-definitions.json'),
    loadFightingStyles: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/fighting-styles.json'),
    loadLanguages: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/languages.json'),
    loadSkills: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/skills.json'),
    loadSpellSlots: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/spell-slots.json'),
    loadWeaponMastery: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/weapon-mastery.json'),
    loadXpThresholds: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/xp-thresholds.json'),
    loadClassResources: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/class-resources.json'),
    loadSpeciesResources: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/species-resources.json'),
    loadDiceTypes: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/dice-types.json'),
    loadLightingTravel: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/mechanics/lighting-travel.json'),

    // Audio data (outside 5e/)
    loadSoundEvents: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/audio/sound-events.json'),
    loadAmbientTracks: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/audio/ambient-tracks.json'),

    // UI data (outside 5e/)
    loadKeyboardShortcuts: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/ui/keyboard-shortcuts.json'),
    loadThemes: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/ui/themes.json'),
    loadDiceColors: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/ui/dice-colors.json'),
    loadDmTabs: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/ui/dm-tabs.json'),
    loadNotificationTemplates: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/ui/notification-templates.json'),
    loadRarityOptions: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/ui/rarity-options.json'),

    // AI data
    loadModeration: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LOAD_JSON, 'data/5e/game/ai/moderation.json')
  },

  // Map Library
  mapLibrary: {
    save: (id: string, name: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAP_LIBRARY_SAVE, id, name, data),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MAP_LIBRARY_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MAP_LIBRARY_GET, id),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MAP_LIBRARY_DELETE, id)
  },

  // Shop Templates
  shopTemplates: {
    save: (template: { id: string; name: string; inventory: unknown[]; markup: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHOP_TEMPLATE_SAVE, template),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SHOP_TEMPLATE_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SHOP_TEMPLATE_GET, id),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SHOP_TEMPLATE_DELETE, id)
  },

  // Image Library
  imageLibrary: {
    save: (id: string, name: string, buffer: ArrayBuffer, extension: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIBRARY_SAVE, id, name, buffer, extension),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIBRARY_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIBRARY_GET, id),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIBRARY_DELETE, id)
  },

  // Books
  books: {
    loadConfig: () => ipcRenderer.invoke(IPC_CHANNELS.BOOK_LOAD_CONFIG),
    add: (config: {
      id: string
      title: string
      path: string
      type: 'core' | 'custom'
      coverPath?: string
      addedAt: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_ADD, config),
    remove: (bookId: string) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_REMOVE, bookId),
    import: (sourcePath: string, title: string, bookId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT, sourcePath, title, bookId),
    readFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_READ_FILE, filePath),
    loadData: (bookId: string) => ipcRenderer.invoke(IPC_CHANNELS.BOOK_LOAD_DATA, bookId),
    saveData: (bookId: string, data: { bookmarks: unknown[]; annotations: unknown[] }) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_SAVE_DATA, bookId, data)
  },

  // Plugins
  plugins: {
    scan: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SCAN),
    enable: (pluginId: string) => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_ENABLE, pluginId),
    disable: (pluginId: string) => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_DISABLE, pluginId),
    loadContent: (pluginId: string, manifest: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LOAD_CONTENT, pluginId, manifest),
    getEnabled: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_ENABLED),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_INSTALL),
    uninstall: (pluginId: string) => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_UNINSTALL, pluginId),
    storageGet: (pluginId: string, key: string) => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_STORAGE_GET, pluginId, key),
    storageSet: (pluginId: string, key: string, value: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_STORAGE_SET, pluginId, key, value),
    storageDelete: (pluginId: string, key: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_STORAGE_DELETE, pluginId, key)
  },

  // BMO Pi Bridge
  bmoStartDm: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.BMO_START_DM, campaignId),
  bmoStopDm: () => ipcRenderer.invoke(IPC_CHANNELS.BMO_STOP_DM),
  bmoNarrate: (text: string, npc?: string, emotion?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BMO_NARRATE, text, npc, emotion),
  bmoDmStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BMO_STATUS),

  // Discord Integration
  discord: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.DISCORD_GET_CONFIG),
    saveConfig: (config: {
      enabled: boolean
      botToken: string
      webhookUrl: string
      channelId?: string
      userId?: string
      dmMode: 'webhook' | 'bot-api'
    }) => ipcRenderer.invoke(IPC_CHANNELS.DISCORD_SAVE_CONFIG, config),
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.DISCORD_TEST_CONNECTION),
    sendMessage: (text: string, campaignName?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DISCORD_SEND_MESSAGE, text, campaignName)
  },

  // Cloud Sync (Google Drive via Rclone on Pi)
  cloudSync: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_STATUS),
    backupCampaign: (campaignId: string, campaignName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_BACKUP, campaignId, campaignName),
    checkCampaignStatus: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_CHECK_STATUS, campaignId),
    listRemoteCampaigns: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_LIST_CAMPAIGNS)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch {
    /* console suppressed in preload */
  }
} else {
  ;(window as unknown as Record<string, unknown>).api = api
}
