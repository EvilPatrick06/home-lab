import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AdvanceChapter,
  EntityStoreConfigPatch,
  EntityUpsertPayload,
  OracleFateCheckRequest,
  OracleSetChaosRequest,
  QuestObjectiveUpdate,
  WorldDelta
} from '../shared/ipc-schemas'

// PHASE-28 28C — payload of the AI_QUEST_STATE_CHANGED main→renderer event.
interface QuestStateChangedEvent {
  campaignId: string
  applied: Array<{
    questId: string
    objectiveId: string
    result: 'completed' | 'failed'
    quest: string
    objective: string
    evidence?: string
  }>
  pendingChapterAdvance?: { proposedAt: string; reason: string }
}

const api = {
  // Character storage
  saveCharacter: (character: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CHARACTER, character),
  loadCharacters: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CHARACTERS),
  loadCharacter: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CHARACTER, id),
  deleteCharacter: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_CHARACTER, id),
  // Reset All Data — wipe every file-based content directory under userData.
  wipeAllData: () => ipcRenderer.invoke(IPC_CHANNELS.WIPE_ALL_DATA),
  listCharacterVersions: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_VERSIONS, id),
  restoreCharacterVersion: (id: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_RESTORE_VERSION, id, fileName),

  // Campaign storage
  listCampaignVersions: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CAMPAIGN_VERSIONS, id),
  restoreCampaignVersion: (id: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CAMPAIGN_RESTORE_VERSION, id, fileName),
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
  showSaveDialog: (options: {
    title: string
    filters: Array<{ name: string; extensions: string[] }>
    defaultPath?: string
  }) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SAVE, options),
  showOpenDialog: (options: { title: string; filters: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN, options),

  // Game state storage
  saveGameState: (campaignId: string, state: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_GAME_STATE, campaignId, state),
  loadGameState: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_GAME_STATE, campaignId),
  deleteGameState: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_GAME_STATE, campaignId),

  // Ban storage
  loadBans: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_BANS, campaignId),
  saveBans: (
    campaignId: string,
    banData: {
      peerIds: string[]
      names: string[]
      clients?: Array<{ clientId: string; lastAlias: string; bannedAt: number }>
    }
  ) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_BANS, campaignId, banData),

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
    // PHASE-24 24C: rule-embedding vector store.
    getEmbedIndexStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AI_EMBED_INDEX_STATUS),
    rebuildEmbedIndex: () => ipcRenderer.invoke(IPC_CHANNELS.AI_EMBED_INDEX_REBUILD),
    prepareScene: (campaignId: string, characterIds: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PREPARE_SCENE, campaignId, characterIds),
    getSceneStatus: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_SCENE_STATUS, campaignId),
    cancelScene: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_SCENE, campaignId),
    chatStream: (request: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_STREAM, request),
    cancelStream: (streamId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_STREAM, streamId),
    // PHASE-32 32D — X-card rewind: forget the last AI narration.
    xCardRewind: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_XCARD_REWIND, campaignId),
    applyMutations: (characterId: string, changes: unknown[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_APPLY_MUTATIONS, characterId, changes),
    longRest: (characterId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LONG_REST, characterId),
    shortRest: (characterId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_SHORT_REST, characterId),
    saveConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_CONVERSATION, campaignId),
    restoreConversation: (campaignId: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RESTORE_CONVERSATION, campaignId, data),
    loadConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LOAD_CONVERSATION, campaignId),
    peekConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_PEEK_CONVERSATION, campaignId),
    deleteConversation: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_CONVERSATION, campaignId),
    // PHASE-31 31A — the end-of-session recap entry was declared in index.d.ts but never wired here,
    // so the modal button always threw. Wire it through to the (PHASE-13-sanitized) handler.
    generateEndOfSessionRecap: (campaignId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_END_OF_SESSION_RECAP, campaignId),
    // PHASE-31 31B/31C — "Previously on…" recap + private campaign Q&A archivist.
    generateSessionStartRecap: (campaignId: string, force?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_SESSION_START_RECAP, { campaignId, force }),
    campaignQaAsk: (campaignId: string, question: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CAMPAIGN_QA_ASK, { campaignId, question }),
    campaignQaHistory: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CAMPAIGN_QA_HISTORY, campaignId),
    campaignQaClear: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CAMPAIGN_QA_CLEAR, campaignId),
    // PHASE-34 — battlemap generation.
    generateBattlemap: (request: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_BATTLEMAP, request),
    // Cloud provider models
    listCloudModels: (providerType: string, apiKey?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_CLOUD_MODELS, providerType, apiKey),
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
    getTokenBudget: (campaignId?: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_TOKEN_BUDGET, campaignId),
    getContextInspector: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CONTEXT_INSPECTOR, campaignId),
    getConnectionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CONNECTION_STATUS),
    getTokenMeter: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_TOKEN_METER),
    previewTokenBudget: (campaignId: string, characterIds: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TOKEN_BUDGET_PREVIEW, campaignId, characterIds),
    // Live state sync
    syncWorldState: (campaignId: string, state: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SYNC_WORLD_STATE, campaignId, state),
    syncCombatState: (campaignId: string, state: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SYNC_COMBAT_STATE, campaignId, state),
    // Scene memory (PHASE-26)
    sceneMemoryGet: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_SCENE_MEMORY_GET, campaignId),
    sceneMemorySetEnabled: (campaignId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SCENE_MEMORY_SET_ENABLED, campaignId, enabled),
    endScene: (campaignId: string, label?: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_END_SCENE, campaignId, label),
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
    setNpcFields: (
      campaignId: string,
      npcName: string,
      fields: { faction?: string; location?: string; secretMotivation?: string }
    ) => ipcRenderer.invoke(IPC_CHANNELS.AI_SET_NPC_FIELDS, campaignId, npcName, fields),
    updateQuestLog: (
      campaignId: string,
      operation: 'add' | 'update' | 'complete' | 'remove',
      name: string,
      description?: string,
      chapterQuest?: boolean
    ) => ipcRenderer.invoke(IPC_CHANNELS.AI_UPDATE_QUEST_LOG, campaignId, operation, name, description, chapterQuest),
    adjustFactionStanding: (campaignId: string, factionName: string, delta: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ADJUST_FACTION_STANDING, campaignId, factionName, delta),
    // Structured quest log (PHASE-28)
    getQuestLog: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_QUEST_LOG, campaignId),
    updateQuestObjective: (campaignId: string, payload: QuestObjectiveUpdate) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_UPDATE_QUEST_OBJECTIVE, campaignId, payload),
    advanceChapter: (campaignId: string, payload: AdvanceChapter) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ADVANCE_CHAPTER, campaignId, payload),
    // PHASE-37 — seed a pack's starter quests into the quest log.
    seedQuests: (
      campaignId: string,
      quests: Array<{ name: string; description?: string; objectives?: string[]; chapterQuest?: boolean }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.AI_SEED_QUESTS, { campaignId, quests }),
    // Dice oracle (PHASE-28)
    oracleFateCheck: (campaignId: string, payload: OracleFateCheckRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ORACLE_FATE_CHECK, campaignId, payload),
    oracleSetChaos: (campaignId: string, payload: OracleSetChaosRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ORACLE_SET_CHAOS, campaignId, payload),
    // Entity records & lore injection (PHASE-25)
    getEntities: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_ENTITIES_GET, campaignId),
    upsertEntity: (campaignId: string, payload: EntityUpsertPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ENTITY_UPSERT, campaignId, payload),
    deleteEntity: (campaignId: string, idOrName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ENTITY_DELETE, campaignId, idOrName),
    setEntitiesConfig: (campaignId: string, patch: EntityStoreConfigPatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ENTITIES_SET_CONFIG, campaignId, patch),
    // World-state store (PHASE-27)
    getWorldState: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_WORLD_STATE_GET, campaignId),
    setWorldStateEnabled: (campaignId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WORLD_STATE_SET_ENABLED, campaignId, enabled),
    applyWorldDelta: (campaignId: string, delta: WorldDelta) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WORLD_DELTA, campaignId, delta),
    // Memory files
    listMemoryFiles: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_MEMORY_FILES, campaignId),
    readMemoryFile: (campaignId: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_READ_MEMORY_FILE, campaignId, fileName),
    clearMemory: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_CLEAR_MEMORY, campaignId),
    // Vision / Map Analysis
    analyzeMap: (gameState: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_ANALYZE_MAP, gameState),
    // Proactive Triggers
    triggerStateUpdate: (state: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TRIGGER_STATE_UPDATE, state),
    setTriggerObserverEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.AI_TRIGGER_SET_ENABLED, enabled),
    getTriggerObserverEnabled: () => ipcRenderer.invoke(IPC_CHANNELS.AI_TRIGGER_GET_ENABLED),
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
    // Event listeners (main → renderer). Each returns a per-listener unsubscribe (mirrors
    // update.onStatus) so consumers can detach exactly their own handler instead of nuking
    // every AI listener in the window. (PHASE-05 05A)
    onStreamChunk: (cb: (data: { streamId: string; text: string }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { streamId: string; text: string }): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_CHUNK, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_CHUNK, listener)
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
      const listener = (
        _e: IpcRendererEvent,
        data: {
          streamId: string
          fullText: string
          displayText: string
          statChanges: unknown[]
          dmActions: unknown[]
          ruleCitations?: Array<{ source: string; rule: string; text: string }>
        }
      ): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_DONE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_DONE, listener)
    },
    onStreamError: (cb: (data: { streamId: string; error: string }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { streamId: string; error: string }): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_ERROR, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_ERROR, listener)
    },
    // PHASE-28 28C — quest auto-tick / chapter-advance proposal notifications (DM-side).
    onQuestStateChanged: (cb: (data: QuestStateChangedEvent) => void) => {
      const listener = (_e: IpcRendererEvent, data: QuestStateChangedEvent): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_QUEST_STATE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_QUEST_STATE_CHANGED, listener)
    },
    onIndexProgress: (cb: (data: { percent: number; stage: string }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { percent: number; stage: string }): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_INDEX_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_INDEX_PROGRESS, listener)
    },
    onEmbedIndexProgress: (cb: (data: { percent: number }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { percent: number }): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_EMBED_INDEX_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_EMBED_INDEX_PROGRESS, listener)
    },
    onOllamaProgress: (cb: (data: { type: string; percent: number }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { type: string; percent: number }): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_OLLAMA_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_OLLAMA_PROGRESS, listener)
    },
    onStreamFileRead: (cb: (data: { streamId: string; path: string; status: string }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { streamId: string; path: string; status: string }): void =>
        cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_FILE_READ, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_FILE_READ, listener)
    },
    onStreamWebSearch: (cb: (data: { streamId: string; query: string; status: string }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { streamId: string; query: string; status: string }): void =>
        cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_WEB_SEARCH, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_WEB_SEARCH, listener)
    },
    onStreamStatus: (cb: (data: { streamId: string; status: string; from?: string; to?: string }) => void) => {
      const listener = (
        _e: IpcRendererEvent,
        data: { streamId: string; status: string; from?: string; to?: string }
      ): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_STATUS, listener)
    },
    onConnectionStatus: (cb: (data: { status: string; consecutiveFailures: number }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { status: string; consecutiveFailures: number }): void => cb(data)
      ipcRenderer.on(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED, listener)
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
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_STREAM_STATUS)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED)
    }
  },

  // PHASE-33 — AI image generation (opt-in; off by default).
  aiImage: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_GET_CONFIG),
    configure: (config: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_CONFIGURE, config),
    checkProviders: () => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_CHECK_PROVIDERS),
    generate: (request: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_GENERATE, request),
    onProgress: (cb: (data: { progress: number; etaSeconds: number }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_IMAGE_PROGRESS, (_e, data) => cb(data))
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_IMAGE_PROGRESS)
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

  // OS file association (.dndvtt)
  files: {
    consumePending: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_CONSUME_PENDING) as Promise<{ path: string | null }>,
    onOpenRequest: (cb: (data: { path: string }) => void) => {
      const listener = (_e: IpcRendererEvent, data: { path: string }) => cb(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_OPEN_REQUEST, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FILE_OPEN_REQUEST, listener)
    }
  },

  // Auto-update

  // LAN discovery (mDNS / Bonjour) — Phase 29g
  lan: {
    startScan: () => ipcRenderer.invoke(IPC_CHANNELS.LAN_START_SCAN),
    stopScan: () => ipcRenderer.invoke(IPC_CHANNELS.LAN_STOP_SCAN),
    publish: (entry: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.LAN_PUBLISH, entry),
    unpublish: () => ipcRenderer.invoke(IPC_CHANNELS.LAN_UNPUBLISH),
    onGameFound: (cb: (entry: Record<string, unknown>) => void) => {
      const listener = (_e: IpcRendererEvent, entry: Record<string, unknown>) => cb(entry)
      ipcRenderer.on(IPC_CHANNELS.LAN_GAME_FOUND, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LAN_GAME_FOUND, listener)
    },
    onGameRemoved: (cb: (entry: Record<string, unknown>) => void) => {
      const listener = (_e: IpcRendererEvent, entry: Record<string, unknown>) => cb(entry)
      ipcRenderer.on(IPC_CHANNELS.LAN_GAME_REMOVED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LAN_GAME_REMOVED, listener)
    },
    // Phase 29g+ auto-discovery: main publishes the BMO Pi base URL it
    // resolved via _bmo._tcp mDNS browse. Renderer's registry-client
    // listens and uses it when no explicit Settings override is set.
    onBmoResolvedUrl: (cb: (payload: { url: string | null }) => void) => {
      const listener = (_e: IpcRendererEvent, payload: { url: string | null }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BMO_RESOLVED_URL, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BMO_RESOLVED_URL, listener)
    },
    // Reachability of the Pi's WebRTC signaling server (bmo-peerjs :9000).
    // `reachable: null` = probe not applicable (off-LAN tunnel target).
    onBmoSignalingStatus: (cb: (payload: { reachable: boolean | null; host: string; port: number }) => void) => {
      const listener = (_e: IpcRendererEvent, payload: { reachable: boolean | null; host: string; port: number }) =>
        cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BMO_SIGNALING_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BMO_SIGNALING_STATUS, listener)
    },
    // Trigger an immediate signaling probe (result arrives via the
    // onBmoSignalingStatus broadcast). Used by the Multiplayer settings badge.
    probeSignaling: () => ipcRenderer.invoke(IPC_CHANNELS.BMO_PROBE_SIGNALING)
  },

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

  // App log access (for bug reports) — reveal app.log in the OS file manager / get its path.
  log: {
    openFolder: (): Promise<{ ok: boolean; path: string }> => ipcRenderer.invoke(IPC_CHANNELS.LOG_OPEN_FOLDER),
    getPath: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.LOG_GET_PATH)
  },

  // Security audit (20g) — forward a renderer-side security event to the
  // main-process audit log. Fire-and-forget from the caller's perspective.
  logSecurityEvent: (event: string, details?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOG_SECURITY_EVENT, { event, details }),

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
    readData: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIBRARY_READ_DATA, id),
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
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_SAVE_DATA, bookId, data),
    saveBytes: (bookId: string, title: string, ext: string, bytes: ArrayBuffer) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_SAVE_BYTES, bookId, title, ext, bytes)
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
  // PHASE-21 21B: single payload object (text + optional npc/emotion/speaker/interrupt).
  bmoNarrate: (payload: { text: string; npc?: string; emotion?: string; speaker?: string; interrupt?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BMO_NARRATE, payload),
  // PHASE-21 21B: barge-in — cancel current narration + flush the Pi queue.
  bmoNarrateCancel: () => ipcRenderer.invoke(IPC_CHANNELS.BMO_NARRATE_CANCEL),
  bmoDmStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BMO_STATUS),
  // PHASE-31 31E: live/last Discord session recap.
  bmoDiscordRecap: (mode?: 'live' | 'last') => ipcRenderer.invoke(IPC_CHANNELS.BMO_DISCORD_RECAP, mode ?? 'live'),
  // PHASE-36 36D: play-by-post turn queue (one object arg each).
  bmoPbpStart: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_PBP_START, payload),
  bmoPbpAdvance: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_PBP_ADVANCE, payload),
  bmoPbpSkip: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_PBP_SKIP, payload),
  bmoPbpSetScene: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_PBP_SET_SCENE, payload),
  bmoPbpStop: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_PBP_STOP, payload),
  bmoPbpStatus: (payload: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_PBP_STATUS, payload),
  // PHASE-20 20F: push the Speak-narration toggle to the main-process gate.
  bmoSetNarrationEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.BMO_SET_NARRATION_ENABLED, enabled),
  // PHASE-21 21B: push the barge-in toggle to the main-process gate.
  bmoSetBargeInEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.BMO_SET_BARGE_IN_ENABLED, enabled),
  // PHASE-21 21C: per-NPC voice-cast management.
  bmoVoiceCastGet: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.BMO_VOICE_CAST_GET, { campaignId }),
  bmoVoiceCastSet: (payload: {
    campaignId: string
    speaker: string
    voiceId?: string
    speed?: number
    pitch?: number
  }) => ipcRenderer.invoke(IPC_CHANNELS.BMO_VOICE_CAST_SET, payload),
  bmoVoiceCastReset: (campaignId: string, speaker: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BMO_VOICE_CAST_RESET, { campaignId, speaker }),
  // main→renderer narrate-failure status (wrapped listener + exact unsubscribe).
  onBmoNarrationStatus: (cb: (status: unknown) => void): (() => void) => {
    const listener = (_e: unknown, data: unknown): void => cb(data)
    ipcRenderer.on(IPC_CHANNELS.BMO_NARRATION_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BMO_NARRATION_STATUS, listener)
  },

  // PHASE-22 22D/22E: VTT→Pi push invokes + Pi→VTT event listeners (PHASE-05 pattern).
  bmoSyncInitiative: (initiative: {
    entries: { entityName: string; entityType: string; isActive: boolean }[]
    currentIndex: number
    round: number
  }) => ipcRenderer.invoke(IPC_CHANNELS.BMO_SYNC_INITIATIVE, initiative),
  bmoSyncGameState: (state: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.BMO_SYNC_SEND_STATE, state),
  onBmoSyncEvent: (cb: (event: unknown) => void): (() => void) => {
    const listener = (_e: unknown, data: unknown): void => cb(data)
    ipcRenderer.on(IPC_CHANNELS.BMO_SYNC_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BMO_SYNC_EVENT, listener)
  },
  onBmoSyncInitiative: (cb: (event: unknown) => void): (() => void) => {
    const listener = (_e: unknown, data: unknown): void => cb(data)
    ipcRenderer.on(IPC_CHANNELS.BMO_SYNC_INITIATIVE_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BMO_SYNC_INITIATIVE_EVENT, listener)
  },

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
    listRemoteCampaigns: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_LIST_CAMPAIGNS),
    restoreCampaign: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_SYNC_RESTORE, campaignId)
  },

  // Account (Discord OAuth login + cloud-sync session). The desktop login runs
  // the loopback OAuth flow in the main process; the renderer only sees status.
  account: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_GET_STATUS),
    login: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_LOGIN),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_LOGOUT),
    getToken: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_GET_TOKEN)
  },

  // Cloud sync engine — per-user, per-entity. Routes through main (which holds
  // the bearer token) to the Pi /api/sync/*.
  sync: {
    manifest: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_MANIFEST),
    getObject: (domain: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_OBJECT, domain, id),
    putObject: (domain: string, id: string, version: number, mtime: number, hash: string | null, bytes: ArrayBuffer) =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_PUT_OBJECT, domain, id, version, mtime, hash, bytes),
    deleteObject: (domain: string, id: string, version: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_DELETE_OBJECT, domain, id, version)
  },

  // Pi game registry — all REST runs in the main process; the live feed is
  // main-process polling pushed via REGISTRY_EVENT.
  registry: {
    announce: (payload: Record<string, unknown>, baseOverride?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_ANNOUNCE, payload, baseOverride),
    update: (inviteCode: string, patch: Record<string, unknown>, baseOverride?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_UPDATE, inviteCode, patch, baseOverride),
    heartbeat: (inviteCode: string, baseOverride?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_HEARTBEAT, inviteCode, baseOverride),
    deregister: (inviteCode: string, baseOverride?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_DEREGISTER, inviteCode, baseOverride),
    list: (clientId: string | null, baseOverride?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_LIST, clientId, baseOverride),
    subscribe: (subscriptionId: string, clientId: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_SUBSCRIBE, subscriptionId, clientId),
    unsubscribe: (subscriptionId: string) => ipcRenderer.invoke(IPC_CHANNELS.REGISTRY_UNSUBSCRIBE, subscriptionId),
    onEvent: (cb: (payload: { subscriptionId: string; event: Record<string, unknown> }) => void) => {
      const listener = (_e: IpcRendererEvent, payload: { subscriptionId: string; event: Record<string, unknown> }) =>
        cb(payload)
      ipcRenderer.on(IPC_CHANNELS.REGISTRY_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.REGISTRY_EVENT, listener)
    }
  },

  // PHASE-53B — ephemeral coturn credentials minted by the Pi relay; the main
  // process performs the fetch so the renderer keeps zero direct http to the Pi.
  turn: {
    getCredentials: (baseOverride?: string) => ipcRenderer.invoke(IPC_CHANNELS.TURN_CREDENTIALS, baseOverride)
  },

  // Pi 5e library — manifest + file fetches run in the main process; the
  // renderer keeps the content-hash cache + bundled fallback.
  library: {
    manifest: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_MANIFEST),
    file: (rel: string) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_FILE, rel)
  },

  // Sound cache (thin installer — bundled MP3s dropped, fetched from the Pi on
  // demand and served from a disk cache under userData/sound-cache).
  sounds: {
    cacheGet: (rel: string): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.SOUND_CACHE_GET, rel),
    prewarm: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.SOUND_CACHE_PREWARM)
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
