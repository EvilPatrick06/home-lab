// ============================================================================
// Centralized IPC Channel Definitions
// Shared between main, preload, and renderer processes.
// All IPC channel strings are defined here as constants to prevent typos
// and enable type-safe channel references across the Electron boundary.
// ============================================================================

export const IPC_CHANNELS = {
  // === Storage: Characters ===
  SAVE_CHARACTER: 'storage:save-character',
  LOAD_CHARACTER: 'storage:load-character',
  LOAD_CHARACTERS: 'storage:load-characters',
  DELETE_CHARACTER: 'storage:delete-character',

  // === Storage: Reset ===
  // Wipe every file-based content directory under userData (characters,
  // campaigns, homebrew, library assets, …) for the Settings → Reset All Data
  // action. The renderer additionally clears localStorage + in-memory stores.
  WIPE_ALL_DATA: 'storage:wipe-all-data',

  // === Storage: Campaigns ===
  SAVE_CAMPAIGN: 'storage:save-campaign',
  LOAD_CAMPAIGN: 'storage:load-campaign',
  LOAD_CAMPAIGNS: 'storage:load-campaigns',
  DELETE_CAMPAIGN: 'storage:delete-campaign',

  // === Storage: Bastions ===
  SAVE_BASTION: 'storage:save-bastion',
  LOAD_BASTION: 'storage:load-bastion',
  LOAD_BASTIONS: 'storage:load-bastions',
  DELETE_BASTION: 'storage:delete-bastion',

  // === Storage: Bans ===
  LOAD_BANS: 'storage:load-bans',
  SAVE_BANS: 'storage:save-bans',

  // === Storage: Game State ===
  SAVE_GAME_STATE: 'storage:save-game-state',
  LOAD_GAME_STATE: 'storage:load-game-state',
  DELETE_GAME_STATE: 'storage:delete-game-state',

  // === File Dialogs ===
  DIALOG_SAVE: 'dialog:show-save',
  DIALOG_OPEN: 'dialog:show-open',

  // === File I/O ===
  FS_READ: 'fs:read-file',
  FS_READ_BINARY: 'fs:read-file-binary',
  FS_WRITE: 'fs:write-file',
  FS_WRITE_BINARY: 'fs:write-file-binary',

  // === Window Control ===
  TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  IS_FULLSCREEN: 'window:is-fullscreen',
  OPEN_DEVTOOLS: 'window:open-devtools',

  // === AI DM: Configuration ===
  AI_CONFIGURE: 'ai:configure',
  AI_GET_CONFIG: 'ai:get-config',
  AI_CHECK_PROVIDERS: 'ai:check-providers',

  // === AI DM: Index Building ===
  AI_BUILD_INDEX: 'ai:build-index',
  AI_LOAD_INDEX: 'ai:load-index',
  AI_GET_CHUNK_COUNT: 'ai:get-chunk-count',
  // PHASE-24 24C: opt-in rule-embedding vector store status + rebuild.
  AI_EMBED_INDEX_STATUS: 'ai:embed-index-status',
  AI_EMBED_INDEX_REBUILD: 'ai:embed-index-rebuild',

  // === AI DM: Streaming Chat ===
  AI_CHAT_STREAM: 'ai:chat-stream',
  AI_CANCEL_STREAM: 'ai:cancel-stream',
  AI_XCARD_REWIND: 'ai:x-card-rewind', // PHASE-32 32D — forget the last AI narration

  AI_APPLY_MUTATIONS: 'ai:apply-mutations',
  AI_LONG_REST: 'ai:long-rest',
  AI_SHORT_REST: 'ai:short-rest',

  // === AI DM: Scene ===
  AI_PREPARE_SCENE: 'ai:prepare-scene',
  AI_GET_SCENE_STATUS: 'ai:get-scene-status',
  AI_CANCEL_SCENE: 'ai:cancel-scene',

  // === AI DM: Conversation Persistence ===
  AI_SAVE_CONVERSATION: 'ai:save-conversation',
  AI_RESTORE_CONVERSATION: 'ai:restore-conversation',
  AI_LOAD_CONVERSATION: 'ai:load-conversation',
  AI_PEEK_CONVERSATION: 'ai:peek-conversation',
  AI_DELETE_CONVERSATION: 'ai:delete-conversation',

  // === AI DM: Cloud Provider Models ===
  AI_LIST_CLOUD_MODELS: 'ai:list-cloud-models',
  AI_VALIDATE_API_KEY: 'ai:validate-api-key',

  // === AI DM: Ollama Management ===
  AI_DETECT_OLLAMA: 'ai:detect-ollama',
  AI_GET_VRAM: 'ai:get-vram',
  AI_DOWNLOAD_OLLAMA: 'ai:download-ollama',
  AI_INSTALL_OLLAMA: 'ai:install-ollama',
  AI_START_OLLAMA: 'ai:start-ollama',
  AI_PULL_MODEL: 'ai:pull-model',
  AI_GET_CURATED_MODELS: 'ai:get-curated-models',
  AI_LIST_INSTALLED_MODELS: 'ai:list-installed-models',
  AI_LIST_INSTALLED_MODELS_DETAILED: 'ai:list-installed-models-detailed',
  AI_OLLAMA_CHECK_UPDATE: 'ai:ollama-check-update',
  AI_OLLAMA_UPDATE: 'ai:ollama-update',
  AI_DELETE_MODEL: 'ai:delete-model',

  // === AI DM: Memory Files ===
  AI_LIST_MEMORY_FILES: 'ai:list-memory-files',
  AI_READ_MEMORY_FILE: 'ai:read-memory-file',
  AI_CLEAR_MEMORY: 'ai:clear-memory',

  // === AI DM: Live State Sync ===
  AI_SYNC_WORLD_STATE: 'ai:sync-world-state',
  AI_SYNC_COMBAT_STATE: 'ai:sync-combat-state',

  // === AI DM: Scene Memory (PHASE-26) ===
  AI_SCENE_MEMORY_GET: 'ai:scene-memory-get',
  AI_SCENE_MEMORY_SET_ENABLED: 'ai:scene-memory-set-enabled',
  AI_END_SCENE: 'ai:end-scene',

  // === AI DM: NPC Relationship Tracking ===
  AI_LOG_NPC_INTERACTION: 'ai:log-npc-interaction',
  AI_SET_NPC_RELATIONSHIP: 'ai:set-npc-relationship',
  AI_SET_NPC_FIELDS: 'ai:set-npc-fields',
  AI_UPDATE_QUEST_LOG: 'ai:update-quest-log',
  AI_ADJUST_FACTION_STANDING: 'ai:adjust-faction-standing',

  // === AI DM: Structured quest log (PHASE-28) ===
  AI_GET_QUEST_LOG: 'ai:get-quest-log',
  AI_UPDATE_QUEST_OBJECTIVE: 'ai:update-quest-objective',
  AI_ADVANCE_CHAPTER: 'ai:advance-chapter',
  AI_SEED_QUESTS: 'ai:seed-quests', // PHASE-37 — seed pack quests into the quest log

  // === AI DM: Dice oracle (PHASE-28) ===
  AI_ORACLE_FATE_CHECK: 'ai:oracle-fate-check',
  AI_ORACLE_SET_CHAOS: 'ai:oracle-set-chaos',

  // === AI DM: Entity records & lore injection (PHASE-25) ===
  AI_ENTITIES_GET: 'ai:entities-get',
  AI_ENTITY_UPSERT: 'ai:entity-upsert',
  AI_ENTITY_DELETE: 'ai:entity-delete',
  AI_ENTITIES_SET_CONFIG: 'ai:entities-set-config',

  // === AI DM: World-state store (PHASE-27) ===
  AI_WORLD_STATE_GET: 'ai:world-state-get',
  AI_WORLD_STATE_SET_ENABLED: 'ai:world-state-set-enabled',
  AI_WORLD_DELTA: 'ai:world-delta',

  // === AI DM: Connection Status ===
  AI_CONNECTION_STATUS: 'ai:connection-status',
  // PHASE-14 14A — pushed (main→renderer) whenever the derived status transitions.
  AI_CONNECTION_STATUS_CHANGED: 'ai:connection-status-changed',
  AI_TOKEN_BUDGET: 'ai:token-budget',
  AI_TOKEN_BUDGET_PREVIEW: 'ai:token-budget-preview',
  // PHASE-14 14E — richer per-campaign context snapshot for the Context Inspector panel.
  AI_GET_CONTEXT_INSPECTOR: 'ai:get-context-inspector',
  AI_GET_TOKEN_METER: 'ai:get-token-meter',
  AI_GENERATE_END_OF_SESSION_RECAP: 'ai:generate-end-of-session-recap',
  AI_GENERATE_BATTLEMAP: 'ai:generate-battlemap', // PHASE-34
  // === AI DM: Recaps & campaign Q&A (PHASE-31) ===
  AI_GENERATE_SESSION_START_RECAP: 'ai:generate-session-start-recap',
  AI_CAMPAIGN_QA_ASK: 'ai:campaign-qa-ask',
  AI_CAMPAIGN_QA_HISTORY: 'ai:campaign-qa-history',
  AI_CAMPAIGN_QA_CLEAR: 'ai:campaign-qa-clear',

  // === AI DM: Vision / Map Analysis ===
  AI_ANALYZE_MAP: 'ai:analyze-map',

  // === AI DM: Proactive Triggers ===
  AI_TRIGGER_STATE_UPDATE: 'ai:trigger-state-update',
  AI_TRIGGER_SET_ENABLED: 'ai:trigger-set-enabled',
  AI_TRIGGER_GET_ENABLED: 'ai:trigger-get-enabled',

  // === AI Image Generation (PHASE-33) ===
  AI_IMAGE_GET_CONFIG: 'ai-image:get-config',
  AI_IMAGE_CONFIGURE: 'ai-image:configure',
  AI_IMAGE_CHECK_PROVIDERS: 'ai-image:check-providers',
  AI_IMAGE_GENERATE: 'ai-image:generate',
  AI_IMAGE_PROGRESS: 'ai-image:progress', // main → renderer (sd-webui polling)

  // === AI DM: Events (main → renderer) ===
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_DONE: 'ai:stream-done',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_INDEX_PROGRESS: 'ai:index-progress',
  AI_EMBED_INDEX_PROGRESS: 'ai:embed-index-progress',
  AI_OLLAMA_PROGRESS: 'ai:ollama-progress',
  AI_STREAM_FILE_READ: 'ai:stream-file-read',
  AI_STREAM_WEB_SEARCH: 'ai:stream-web-search',
  AI_STREAM_STATUS: 'ai:stream-status',
  AI_WEB_SEARCH_APPROVE: 'ai:web-search-approve',
  AI_QUEST_STATE_CHANGED: 'ai:quest-state-changed', // PHASE-28 28C — quest auto-tick / chapter proposal

  // === App Updates ===
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',

  // === Storage: Custom Creatures ===
  SAVE_CUSTOM_CREATURE: 'storage:save-custom-creature',
  LOAD_CUSTOM_CREATURE: 'storage:load-custom-creature',
  LOAD_CUSTOM_CREATURES: 'storage:load-custom-creatures',
  DELETE_CUSTOM_CREATURE: 'storage:delete-custom-creature',

  // === Storage: Homebrew ===
  SAVE_HOMEBREW: 'storage:save-homebrew',
  LOAD_HOMEBREW_BY_CATEGORY: 'storage:load-homebrew-by-category',
  LOAD_ALL_HOMEBREW: 'storage:load-all-homebrew',
  DELETE_HOMEBREW: 'storage:delete-homebrew',

  // === Settings ===
  SAVE_SETTINGS: 'storage:save-settings',
  LOAD_SETTINGS: 'storage:load-settings',

  // === Audio: Custom Tracks ===
  AUDIO_UPLOAD_CUSTOM: 'audio:upload-custom',
  AUDIO_LIST_CUSTOM: 'audio:list-custom',
  AUDIO_DELETE_CUSTOM: 'audio:delete-custom',
  AUDIO_GET_CUSTOM_PATH: 'audio:get-custom-path',
  AUDIO_PICK_FILE: 'audio:pick-file',

  // === Sound Cache (thin installer — bundled MP3s dropped, fetched from Pi) ===
  // Renderer → main: get an absolute on-disk path for a bundled-sound rel-path,
  // downloading + caching it from the Pi first if absent (null on failure).
  SOUND_CACHE_GET: 'sound-cache:get',
  // Renderer → main: download every manifest clip into the disk cache in the
  // background (bounded concurrency). Fire-and-forget; resolves when warm.
  SOUND_CACHE_PREWARM: 'sound-cache:prewarm',

  // === Storage: Character Versions ===
  CHARACTER_VERSIONS: 'storage:character-versions',
  CHARACTER_RESTORE_VERSION: 'storage:character-restore-version',

  // === App Info ===
  APP_VERSION: 'app:version',
  LOG_OPEN_FOLDER: 'log:open-folder',
  LOG_GET_PATH: 'log:get-path',

  // === Game Data ===
  GAME_LOAD_JSON: 'game:load-json',

  // === Plugins ===
  PLUGIN_SCAN: 'plugin:scan',
  PLUGIN_ENABLE: 'plugin:enable',
  PLUGIN_DISABLE: 'plugin:disable',
  PLUGIN_LOAD_CONTENT: 'plugin:load-content',
  PLUGIN_GET_ENABLED: 'plugin:get-enabled',
  PLUGIN_INSTALL: 'plugin:install',
  PLUGIN_UNINSTALL: 'plugin:uninstall',

  // === Plugin Storage (per-plugin key-value) ===
  PLUGIN_STORAGE_GET: 'plugin:storage-get',
  PLUGIN_STORAGE_SET: 'plugin:storage-set',
  PLUGIN_STORAGE_DELETE: 'plugin:storage-delete',

  // === BMO Pi Bridge ===
  BMO_START_DM: 'bmo:start-dm',
  BMO_STOP_DM: 'bmo:stop-dm',
  BMO_NARRATE: 'bmo:narrate',
  BMO_STATUS: 'bmo:status',
  BMO_DISCORD_RECAP: 'bmo:discord-recap', // PHASE-31 31E — live/last Discord session recap
  // PHASE-20 20F: renderer→main toggle sync + main→renderer narrate-failure status.
  BMO_SET_NARRATION_ENABLED: 'bmo:set-narration-enabled',
  BMO_NARRATION_STATUS: 'bmo:narration-status',
  // PHASE-21 21B: barge-in — cancel current narration + sync the bargeIn toggle.
  BMO_NARRATE_CANCEL: 'bmo:narrate-cancel',
  BMO_SET_BARGE_IN_ENABLED: 'bmo:set-barge-in-enabled',
  // PHASE-21 21C: per-NPC voice casting (list / override / re-roll).
  BMO_VOICE_CAST_GET: 'bmo:voice-cast-get',
  BMO_VOICE_CAST_SET: 'bmo:voice-cast-set',
  BMO_VOICE_CAST_RESET: 'bmo:voice-cast-reset',
  // PHASE-36 36D: play-by-post turn queue.
  BMO_PBP_START: 'bmo:pbp-start',
  BMO_PBP_ADVANCE: 'bmo:pbp-advance',
  BMO_PBP_SKIP: 'bmo:pbp-skip',
  BMO_PBP_SET_SCENE: 'bmo:pbp-set-scene',
  BMO_PBP_STOP: 'bmo:pbp-stop',
  BMO_PBP_STATUS: 'bmo:pbp-status',

  // === BMO Pi Bridge: Sync (main → renderer, from Pi HTTP callbacks) ===
  BMO_SYNC_EVENT: 'bmo:sync-event',
  BMO_SYNC_INITIATIVE: 'bmo:sync-initiative',
  // PHASE-22 22D: dedicated main→renderer initiative channel (BMO_SYNC_INITIATIVE
  // stays renderer→main invoke-only — no channel double-use).
  BMO_SYNC_INITIATIVE_EVENT: 'bmo:sync-initiative-event',
  BMO_SYNC_SEND_STATE: 'bmo:sync-send-state',

  // === Map Library ===
  MAP_LIBRARY_SAVE: 'map-library:save',
  MAP_LIBRARY_LIST: 'map-library:list',
  MAP_LIBRARY_GET: 'map-library:get',
  MAP_LIBRARY_DELETE: 'map-library:delete',

  // === Shop Templates ===
  SHOP_TEMPLATE_SAVE: 'shop-template:save',
  SHOP_TEMPLATE_LIST: 'shop-template:list',
  SHOP_TEMPLATE_GET: 'shop-template:get',
  SHOP_TEMPLATE_DELETE: 'shop-template:delete',

  // === Image Library ===
  IMAGE_LIBRARY_SAVE: 'image-library:save',
  IMAGE_LIBRARY_LIST: 'image-library:list',
  IMAGE_LIBRARY_GET: 'image-library:get',
  IMAGE_LIBRARY_READ_DATA: 'image-library:read-data', // PHASE-35 — bytes as a data URL
  IMAGE_LIBRARY_DELETE: 'image-library:delete',

  // === Books ===
  BOOK_LOAD_CONFIG: 'book:load-config',
  BOOK_ADD: 'book:add',
  BOOK_REMOVE: 'book:remove',
  BOOK_IMPORT: 'book:import',
  BOOK_READ_FILE: 'book:read-file',
  BOOK_LOAD_DATA: 'book:load-data',
  BOOK_SAVE_DATA: 'book:save-data',

  // === Discord Integration ===
  DISCORD_GET_CONFIG: 'discord:get-config',
  DISCORD_SAVE_CONFIG: 'discord:save-config',
  DISCORD_TEST_CONNECTION: 'discord:test-connection',
  DISCORD_SEND_MESSAGE: 'discord:send-message',

  // === Cloud Sync (Google Drive via Rclone on Pi) ===
  CLOUD_SYNC_STATUS: 'cloud:sync-status',
  CLOUD_SYNC_BACKUP: 'cloud:sync-backup',
  CLOUD_SYNC_CHECK_STATUS: 'cloud:sync-check-campaign',
  CLOUD_SYNC_LIST_CAMPAIGNS: 'cloud:sync-list-campaigns',
  CLOUD_SYNC_RESTORE: 'cloud:sync-restore',

  // === Account (Discord OAuth login + cloud accounts) ===
  ACCOUNT_GET_STATUS: 'account:get-status',
  ACCOUNT_LOGIN: 'account:login',
  ACCOUNT_LOGOUT: 'account:logout',
  ACCOUNT_GET_TOKEN: 'account:get-token',

  // === Cloud Sync engine (per-user, per-entity; account-scoped) ===
  SYNC_MANIFEST: 'sync:manifest',
  SYNC_GET_OBJECT: 'sync:get-object',
  SYNC_PUT_OBJECT: 'sync:put-object',
  SYNC_DELETE_OBJECT: 'sync:delete-object',

  // === LAN Discovery (Phase 29g — mDNS / Bonjour) ===
  LAN_START_SCAN: 'lan:start-scan',
  LAN_STOP_SCAN: 'lan:stop-scan',
  LAN_PUBLISH: 'lan:publish',
  LAN_UNPUBLISH: 'lan:unpublish',
  LAN_GAME_FOUND: 'lan:game-found',
  LAN_GAME_REMOVED: 'lan:game-removed',
  // Emitted by main when the BMO Pi is discovered (or disappears) via
  // _bmo._tcp mDNS browse. Lets the renderer auto-configure the Pi base
  // URL without the user installing Bonjour Print Services on Windows.
  BMO_RESOLVED_URL: 'bmo:resolved-url',

  // Emitted by main with the reachability of the Pi's WebRTC signaling
  // server (bmo-peerjs, :9000/myapp). `reachable` is null when the probe is
  // not applicable (no LAN/http Pi target — e.g. the off-LAN tunnel default,
  // where :9000 isn't exposed) so the renderer can show "n/a" instead of a
  // misleading "down".
  BMO_SIGNALING_STATUS: 'bmo:signaling-status',

  // Renderer → main: trigger an immediate signaling-server reachability probe
  // (e.g. when the Multiplayer settings badge mounts) so the result is fresh
  // instead of waiting for the next periodic probe. Result still arrives via
  // BMO_SIGNALING_STATUS broadcast.
  BMO_PROBE_SIGNALING: 'bmo:probe-signaling',

  // === Security Audit (20g) ===
  // Renderer → main: forward a renderer-side security event (kick/ban,
  // rejected network message) to the main-process audit log. The renderer
  // can't write the log file directly, so it routes through here.
  LOG_SECURITY_EVENT: 'security:log-event',

  // === Pi Game Registry (main-process proxy) ===
  // All registry REST now runs in the MAIN process (registry-bridge.ts) so the
  // renderer never opens a direct http(s) connection to the Pi for game
  // discovery. The live feed is main-process POLLING (Node has no EventSource),
  // pushed back to the renderer via REGISTRY_EVENT.
  REGISTRY_ANNOUNCE: 'registry:announce',
  REGISTRY_UPDATE: 'registry:update',
  REGISTRY_HEARTBEAT: 'registry:heartbeat',
  REGISTRY_DEREGISTER: 'registry:deregister',
  REGISTRY_LIST: 'registry:list',
  REGISTRY_SUBSCRIBE: 'registry:subscribe',
  REGISTRY_UNSUBSCRIBE: 'registry:unsubscribe',
  // Emitted by main on each registry poll (snapshot / added / updated / removed
  // / error) for an active subscription.
  REGISTRY_EVENT: 'registry:event',

  // === Ephemeral TURN credentials (PHASE-53B, main-process proxy) ===
  TURN_CREDENTIALS: 'turn:credentials',

  // === Pi 5e Library (main-process proxy) ===
  // The Pi `/api/library/manifest` + `/api/library/file` fetches now run in the
  // MAIN process (library-bridge.ts). The renderer still owns the content-hash
  // localStorage cache + bundled-data fallback.
  LIBRARY_MANIFEST: 'library:manifest',
  LIBRARY_FILE: 'library:file'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
