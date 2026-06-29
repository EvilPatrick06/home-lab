export {}

// PHASE-36 36D: play-by-post turn-queue wire shapes (mirror the Pi's response).
interface PbpParticipant {
  name: string
  character?: string | null
  discord_user_id?: string | null
  discord_display?: string | null
}
interface PbpSession {
  active: boolean
  scene: string
  participants: PbpParticipant[]
  turn_index: number
  round: number
  reminder_hours: number
  auto_skip: boolean
  turn_started_at: string
  reminded_at?: string | null
}
interface PbpBridgeResponse {
  ok?: boolean
  error?: string
  statusCode?: number
  result?: string
  session?: PbpSession | null
  overdue?: boolean
}

interface CharacterVersion {
  fileName: string
  timestamp: string
  sizeBytes: number
}

interface CampaignVersion {
  fileName: string
  timestamp: string
  sizeBytes: number
}

// Entity records & lore injection (PHASE-25). Shapes mirror entity-store.ts /
// ipc-schemas.ts (kept inline to match this file's self-contained ambient style).
interface EntityRecordData {
  id: string
  name: string
  kind: 'npc' | 'location' | 'item' | 'faction'
  summary: string
  details: string
  aliases: string[]
  keywords: string[]
  injection: 'auto' | 'always' | 'never'
  source: 'ai' | 'extraction' | 'dm'
  locked: boolean
  mentions: number
  createdAt: string
  updatedAt: string
  lastSeenAt: string
}
interface EntityStoreConfigData {
  enabled: boolean
  autoExtract: boolean
  loreMode: 'all' | 'triggered'
}
interface EntityUpsertPayloadData {
  kind: 'npc' | 'location' | 'item' | 'faction'
  name: string
  summary?: string
  details?: string
  aliases?: string[]
  keywords?: string[]
  injection?: 'auto' | 'always' | 'never'
  source?: 'ai' | 'dm'
}
interface EntityStoreConfigPatchData {
  enabled?: boolean
  autoExtract?: boolean
  loreMode?: 'all' | 'triggered'
}

// World-state store (PHASE-27). Shapes mirror world-state-store.ts / ipc-schemas.ts; kept
// loose here (the IPC zod validates precisely) to match this file's self-contained style.
interface WorldStoreData {
  version: number
  enabled: boolean
  partyLocationId: string | null
  locations: unknown[]
  npcs: unknown[]
  facts: unknown[]
  updatedAt: string
}
interface WorldDeltaData {
  op: 'discover_location' | 'move_party' | 'link_locations' | 'set_npc_opinion' | 'record_fact'
  name?: string
  type?: string
  description?: string
  connectsTo?: string
  exitLabel?: string
  locationName?: string
  fromName?: string
  toName?: string
  label?: string
  npcName?: string
  characterName?: string
  delta?: number
  score?: number
  summary?: string
  text?: string
  tags?: string[]
}

// Structured quest log (PHASE-28). Mirrors quest-log.ts; kept loose (the IPC zod validates).
interface QuestObjectiveData {
  id: string
  text: string
  status: 'pending' | 'completed' | 'failed'
  completedAt?: string
  evidence?: string
}
interface QuestRecordData {
  id: string
  name: string
  description: string
  status: 'active' | 'completed' | 'failed' | 'abandoned'
  chapterQuest: boolean
  objectives: QuestObjectiveData[]
  createdAt: string
  updatedAt: string
}
interface QuestLogData {
  version: number
  chapter: { number: number; title?: string; goal?: string; startedAt: string }
  pendingChapterAdvance?: { proposedAt: string; reason: string }
  quests: QuestRecordData[]
}
interface QuestObjectiveUpdateData {
  questName: string
  operation: 'add' | 'complete' | 'fail' | 'reopen'
  objective: string
  evidence?: string
}
interface AdvanceChapterData {
  title?: string
  goal?: string
  reason?: string
}

// Dice oracle (PHASE-28). Mirrors oracle.ts.
type OracleLikelihood = 'impossible' | 'very-unlikely' | 'unlikely' | 'even' | 'likely' | 'very-likely' | 'sure-thing'
interface OracleFateCheckResultData {
  question: string
  likelihood: OracleLikelihood
  chaos: number
  roll: number
  threshold: number
  answer: 'yes' | 'no' | 'exceptional-yes' | 'exceptional-no'
  randomEvent?: { focus: string; meaning: [string, string] }
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
  listCampaignVersions: (id: string) => Promise<{ success: boolean; data?: CampaignVersion[] }>
  restoreCampaignVersion: (
    id: string,
    fileName: string
  ) => Promise<{ success: boolean; data?: Record<string, unknown> }>
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
  // PHASE-14 14C — whether this turn's context was trimmed + its token estimate (DM alerting).
  contextTruncated?: boolean
  tokenEstimate?: number
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
  structuredExtraction?: string
  ragEmbeddingsEnabled?: boolean
  ragEmbeddingModel?: string
  ragCampaignDocsEnabled?: boolean
  // PHASE-29: per-task routing + local-endpoint flavor.
  routing?: { enabled: boolean; smallModel: string; overrides?: Record<string, string> }
  localEndpointFlavor?: 'ollama' | 'llamacpp'
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

// PHASE-33 — AI image generation (all config fields optional, like AiConfigData).
interface AiImageConfigData {
  enabled?: boolean
  provider?: 'sd-webui' | 'openai' | 'gemini'
  fallbackProvider?: 'sd-webui' | 'openai' | 'gemini' | 'none'
  sdWebuiUrl?: string
  sdModel?: string
  sdSteps?: number
  sdSampler?: string
  sdCfgScale?: number
  openaiModel?: string
  openaiQuality?: 'low' | 'medium' | 'high' | 'auto'
  geminiModel?: string
  size?: '1024x1024' | '1024x1536' | '1536x1024'
}
interface AiImageGenerateResult {
  success: boolean
  error?: string
  disabled?: boolean
  imageId?: string
  dataUrl?: string
  provider?: string
  model?: string
  usedFallback?: boolean
}
interface AiImageAPI {
  getConfig: () => Promise<AiImageConfigData>
  configure: (config: AiImageConfigData) => Promise<{ success: boolean; error?: string }>
  checkProviders: () => Promise<{ sdWebui: boolean; openai: boolean; gemini: boolean }>
  generate: (request: {
    subjectType: string
    description: string
    stylePreset?: string
    negativePrompt?: string
    size?: string
  }) => Promise<AiImageGenerateResult>
  onProgress: (cb: (data: { progress: number; etaSeconds: number }) => void) => void
  removeProgressListener: () => void
}

interface AiAPI {
  configure: (config: AiConfigData) => Promise<{ success: boolean; error?: string }>
  getConfig: () => Promise<AiConfigData>
  checkProviders: () => Promise<AiProviderStatus>
  buildIndex: () => Promise<{ success: boolean; chunkCount?: number; error?: string }>
  loadIndex: () => Promise<boolean>
  getChunkCount: () => Promise<number>
  getEmbedIndexStatus: () => Promise<{
    status: 'disabled' | 'idle' | 'building' | 'ready' | 'error'
    model?: string
    chunkCount?: number
    percent?: number
    error?: string
  }>
  rebuildEmbedIndex: () => Promise<{ success: boolean; error?: string }>
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
  // PHASE-32 32D — X-card rewind.
  xCardRewind: (campaignId: string) => Promise<{ success: boolean; removed: boolean; error?: string }>
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
  // Scene memory (PHASE-26)
  sceneMemoryGet: (campaignId: string) => Promise<{
    success: boolean
    data?: {
      enabled: boolean
      sceneSummaryCount: number
      sessionSummaryCount: number
      hasCampaignSummary: boolean
      currentSceneMessageCount: number
    }
    error?: string
  }>
  sceneMemorySetEnabled: (campaignId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
  endScene: (campaignId: string, label?: string) => Promise<{ success: boolean; summarized?: boolean; error?: string }>
  getTokenBudget: (campaignId?: string) => Promise<{
    rulebookChunks: number
    srdData: number
    characterData: number
    campaignData: number
    campaignDocs: number
    creatures: number
    gameState: number
    memory: number
    total: number
  } | null>
  getTokenMeter: () => Promise<{ conversationBudget: number; contextWindow: number }>
  getContextInspector: (campaignId: string) => Promise<{
    breakdown: {
      rulebookChunks: number
      srdData: number
      characterData: number
      campaignData: number
      campaignDocs: number
      creatures: number
      gameState: number
      memory: number
      total: number
      truncated?: boolean
    } | null
    contextTruncated: boolean
    lastTokenEstimate: number
    contextWindow: number | null
    conversationBudget: number
    chunkIds: string[]
  }>
  getConnectionStatus: () => Promise<{
    status: 'connected' | 'degraded' | 'disconnected'
    consecutiveFailures: number
  }>
  previewTokenBudget: (
    campaignId: string,
    characterIds: string[]
  ) => Promise<{
    rulebookChunks: number
    srdData: number
    characterData: number
    campaignData: number
    campaignDocs: number
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
    description?: string,
    chapterQuest?: boolean
  ) => Promise<{ success: boolean; error?: string }>
  adjustFactionStanding: (campaignId: string, factionName: string, delta: number) => Promise<{ success: boolean }>
  // Structured quest log (PHASE-28)
  getQuestLog: (campaignId: string) => Promise<{ success: boolean; data?: QuestLogData; error?: string }>
  updateQuestObjective: (
    campaignId: string,
    payload: QuestObjectiveUpdateData
  ) => Promise<{ success: boolean; data?: QuestLogData; error?: string }>
  advanceChapter: (
    campaignId: string,
    payload: AdvanceChapterData
  ) => Promise<{ success: boolean; data?: QuestLogData; error?: string }>
  // PHASE-37 — seed pack quests
  seedQuests: (
    campaignId: string,
    quests: Array<{ name: string; description?: string; objectives?: string[]; chapterQuest?: boolean }>
  ) => Promise<{ success: boolean; added?: number; error?: string }>
  // Dice oracle (PHASE-28)
  oracleFateCheck: (
    campaignId: string,
    payload: { question: string; likelihood: OracleLikelihood }
  ) => Promise<{ success: boolean; result?: OracleFateCheckResultData; error?: string }>
  oracleSetChaos: (
    campaignId: string,
    payload: { value?: number; delta?: number }
  ) => Promise<{ success: boolean; chaos?: number; error?: string }>
  // Entity records & lore injection (PHASE-25)
  getEntities: (
    campaignId: string
  ) => Promise<{ success: boolean; config?: EntityStoreConfigData; records?: EntityRecordData[] }>
  upsertEntity: (
    campaignId: string,
    payload: EntityUpsertPayloadData
  ) => Promise<{ success: boolean; applied?: boolean; detail?: string; error?: string }>
  deleteEntity: (
    campaignId: string,
    idOrName: string
  ) => Promise<{ success: boolean; deleted?: boolean; error?: string }>
  setEntitiesConfig: (
    campaignId: string,
    patch: EntityStoreConfigPatchData
  ) => Promise<{ success: boolean; config?: EntityStoreConfigData; error?: string }>
  // World-state store (PHASE-27)
  getWorldState: (campaignId: string) => Promise<{ success: boolean; store?: WorldStoreData; error?: string }>
  setWorldStateEnabled: (campaignId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
  applyWorldDelta: (
    campaignId: string,
    delta: WorldDeltaData
  ) => Promise<{ success: boolean; applied?: boolean; detail?: string; error?: string }>
  generateEndOfSessionRecap: (campaignId: string) => Promise<{ success: boolean; data?: string; error?: string }>
  // PHASE-31 31B/31C — recap + campaign Q&A archivist.
  generateSessionStartRecap: (
    campaignId: string,
    force?: boolean
  ) => Promise<{ success: boolean; data?: { text: string; generatedAt: string; cached: boolean }; error?: string }>
  campaignQaAsk: (
    campaignId: string,
    question: string
  ) => Promise<{ success: boolean; data?: { answer: string; askedAt: string }; error?: string }>
  campaignQaHistory: (campaignId: string) => Promise<{
    success: boolean
    data?: Array<{ id: string; question: string; answer: string; timestamp: string }>
    error?: string
  }>
  campaignQaClear: (campaignId: string) => Promise<{ success: boolean; error?: string }>
  // PHASE-34 — battlemap generation.
  generateBattlemap: (request: {
    campaignId: string
    prompt: string
    theme?: string
    widthCells?: number
    heightCells?: number
  }) => Promise<{ success: boolean; spec?: unknown; warnings?: string[]; error?: string }>
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
  // PHASE-28 28C — quest auto-tick / chapter-advance proposal notifications (DM-side).
  onQuestStateChanged: (
    cb: (data: {
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
    }) => void
  ) => () => void
  onIndexProgress: (cb: (data: AiIndexProgressData) => void) => () => void
  onEmbedIndexProgress: (cb: (data: { percent: number }) => void) => () => void
  onOllamaProgress: (cb: (data: OllamaProgressData) => void) => () => void
  onStreamFileRead: (cb: (data: { streamId: string; path: string; status: string }) => void) => () => void
  onStreamWebSearch: (cb: (data: { streamId: string; query: string; status: string }) => void) => () => void
  onStreamStatus: (cb: (data: { streamId: string; status: string; from?: string; to?: string }) => void) => () => void
  onConnectionStatus: (
    cb: (data: { status: 'connected' | 'degraded' | 'disconnected'; consecutiveFailures: number }) => void
  ) => () => void
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
  readData: (id: string) => Promise<{ success: boolean; data?: { dataUrl: string; name: string }; error?: string }>
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
  saveBytes: (
    bookId: string,
    title: string,
    ext: string,
    bytes: ArrayBuffer
  ) => Promise<{ success: boolean; error?: string }>
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

interface AccountUser {
  id: string
  username: string | null
  global_name: string | null
  avatar: string | null
  email: string | null
  quota_bytes?: number
  used_bytes?: number
  created_at?: number
}

interface AccountStatus {
  configured: boolean
  signedIn: boolean
  user: AccountUser | null
}

interface AccountLoginResult {
  ok: boolean
  error?: string
  user?: AccountUser | null
}

interface AccountAPI {
  getStatus: () => Promise<AccountStatus>
  login: () => Promise<AccountLoginResult>
  logout: () => Promise<{ ok: boolean }>
  /** Bearer token for direct (web) sync calls; null on desktop (token stays in main). */
  getToken: () => Promise<string | null>
}

interface SyncObjectMeta {
  domain: string
  id: string
  hash: string | null
  version: number
  mtime: number
  size: number
  deleted: boolean
}

interface SyncAPI {
  manifest: () => Promise<{ ok: boolean; objects: SyncObjectMeta[]; error?: string }>
  getObject: (domain: string, id: string) => Promise<ArrayBuffer | null>
  putObject: (
    domain: string,
    id: string,
    version: number,
    mtime: number,
    hash: string | null,
    bytes: ArrayBuffer
  ) => Promise<{ accepted: boolean; winner?: SyncObjectMeta }>
  deleteObject: (domain: string, id: string, version: number) => Promise<{ accepted: boolean; winner?: SyncObjectMeta }>
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

interface TurnAPI {
  getCredentials(
    baseOverride?: string
  ): Promise<{ username: string; credential: string; ttl: number; urls: string[]; realm?: string } | null>
}

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
        aiImage: AiImageAPI
        update: UpdateAPI
        game: GameDataAPI
        mapLibrary: MapLibraryAPI
        shopTemplates: ShopTemplateAPI
        imageLibrary: ImageLibraryAPI
        books: BooksAPI
        plugins: PluginAPI
        cloudSync: CloudSyncAPI
        account: AccountAPI
        sync: SyncAPI
        discord: DiscordAPI
        lan: LanAPI
        registry: RegistryAPI
        library: LibraryAPI
        sounds: SoundsAPI
        files: {
          consumePending: () => Promise<{ path: string | null }>
          onOpenRequest: (cb: (data: { path: string }) => void) => () => void
        }
        turn: TurnAPI
        getVersion: () => Promise<string>
        log: {
          openFolder: () => Promise<{ ok: boolean; path: string }>
          getPath: () => Promise<string>
        }
        // Security audit (20g)
        logSecurityEvent: (event: string, details?: Record<string, unknown>) => Promise<void>
        // BMO Pi Bridge
        bmoStartDm: (campaignId: string) => Promise<{
          ok?: boolean
          error?: string
          reason?: string
          voice_channel_id?: number
          text_channel_id?: number
          campaign_id?: string
        }>
        bmoStopDm: () => Promise<{ ok?: boolean; error?: string; recap?: string; already_stopping?: boolean }>
        bmoNarrate: (payload: {
          text: string
          npc?: string
          emotion?: string
          speaker?: string
          interrupt?: boolean
        }) => Promise<{ ok?: boolean; error?: string; result?: string }>
        bmoNarrateCancel: () => Promise<{ ok?: boolean; cancelled?: boolean; flushed?: number; error?: string }>
        // PHASE-20 20F: truthful BridgeResponse-shaped status union (failure shapes are real).
        bmoDmStatus: () => Promise<{
          ok?: boolean
          error?: string
          statusCode?: number
          running?: boolean
          active?: boolean
          players?: string[]
          voice_connected?: boolean
          initiative_round?: number
          initiative_order?: { name: string; total: number }[]
          queue_len?: number
          last_narration_status?: string | null
          last_session_end?: { reason: string; at: string } | null
          recap?: string
        }>
        // PHASE-31 31E — live/last Discord session recap.
        bmoDiscordRecap: (mode?: 'live' | 'last') => Promise<{
          ok?: boolean
          error?: string
          statusCode?: number
          recap?: string
          session_id?: number
          ended_at?: string | null
        }>
        // PHASE-36 36D: play-by-post turn queue.
        bmoPbpStart: (payload: {
          campaignId: string
          scene: string
          participants: Array<{ name: string; character?: string }>
          channelId?: string
          reminderHours?: number
          autoSkip?: boolean
        }) => Promise<PbpBridgeResponse>
        bmoPbpAdvance: (payload: {
          campaignId: string
          expectedTurnIndex?: number
          excerpt?: string
        }) => Promise<PbpBridgeResponse>
        bmoPbpSkip: (payload: { campaignId: string; expectedTurnIndex?: number }) => Promise<PbpBridgeResponse>
        bmoPbpSetScene: (payload: {
          campaignId: string
          scene: string
          participants?: Array<{ name: string; character?: string }>
        }) => Promise<PbpBridgeResponse>
        bmoPbpStop: (payload: { campaignId: string }) => Promise<PbpBridgeResponse>
        bmoPbpStatus: (payload: { campaignId: string }) => Promise<PbpBridgeResponse>
        bmoSetNarrationEnabled: (enabled: boolean) => Promise<{ success: boolean }>
        bmoSetBargeInEnabled: (enabled: boolean) => Promise<{ success: boolean }>
        bmoVoiceCastGet: (campaignId: string) => Promise<{
          ok?: boolean
          error?: string
          cast?: { speaker: string; backend: string; voice_id: string; speed: number; pitch: number }[]
          pool?: string[]
          backend?: string
        }>
        bmoVoiceCastSet: (payload: {
          campaignId: string
          speaker: string
          voiceId?: string
          speed?: number
          pitch?: number
        }) => Promise<{ ok?: boolean; error?: string; entry?: { speaker: string; voice_id: string } }>
        bmoVoiceCastReset: (
          campaignId: string,
          speaker: string
        ) => Promise<{ ok?: boolean; error?: string; reset?: boolean }>
        onBmoNarrationStatus: (
          cb: (status: { ok: boolean; result?: string; error?: string; statusCode?: number }) => void
        ) => () => void
        // PHASE-22 22D/22E: VTT→Pi push + Pi→VTT event listeners.
        bmoSyncInitiative: (initiative: {
          entries: { entityName: string; entityType: string; isActive: boolean }[]
          currentIndex: number
          round: number
        }) => Promise<{ ok?: boolean; error?: string; statusCode?: number }>
        bmoSyncGameState: (
          state: Record<string, unknown>
        ) => Promise<{ ok?: boolean; error?: string; statusCode?: number }>
        onBmoSyncEvent: (
          cb: (event: { type: string; payload: Record<string, unknown>; timestamp: number; eventId?: string }) => void
        ) => () => void
        onBmoSyncInitiative: (
          cb: (event: {
            entries: { entityName: string; entityType: string; isActive: boolean }[]
            currentIndex: number
            round: number
          }) => void
        ) => () => void
      }
  }
}
