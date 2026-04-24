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

  // === AI DM: Streaming Chat ===
  AI_CHAT_STREAM: 'ai:chat-stream',
  AI_CANCEL_STREAM: 'ai:cancel-stream',
  AI_APPLY_MUTATIONS: 'ai:apply-mutations',
  AI_LONG_REST: 'ai:long-rest',
  AI_SHORT_REST: 'ai:short-rest',

  // === AI DM: Scene ===
  AI_PREPARE_SCENE: 'ai:prepare-scene',
  AI_GET_SCENE_STATUS: 'ai:get-scene-status',

  // === AI DM: Conversation Persistence ===
  AI_SAVE_CONVERSATION: 'ai:save-conversation',
  AI_LOAD_CONVERSATION: 'ai:load-conversation',
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

  // === AI DM: NPC Relationship Tracking ===
  AI_LOG_NPC_INTERACTION: 'ai:log-npc-interaction',
  AI_SET_NPC_RELATIONSHIP: 'ai:set-npc-relationship',

  // === AI DM: Connection Status ===
  AI_CONNECTION_STATUS: 'ai:connection-status',
  AI_TOKEN_BUDGET: 'ai:token-budget',
  AI_TOKEN_BUDGET_PREVIEW: 'ai:token-budget-preview',

  // === AI DM: Events (main → renderer) ===
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_DONE: 'ai:stream-done',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_INDEX_PROGRESS: 'ai:index-progress',
  AI_OLLAMA_PROGRESS: 'ai:ollama-progress',
  AI_STREAM_FILE_READ: 'ai:stream-file-read',
  AI_STREAM_WEB_SEARCH: 'ai:stream-web-search',
  AI_WEB_SEARCH_APPROVE: 'ai:web-search-approve',

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

  // === Storage: Character Versions ===
  CHARACTER_VERSIONS: 'storage:character-versions',
  CHARACTER_RESTORE_VERSION: 'storage:character-restore-version',

  // === App Info ===
  APP_VERSION: 'app:version',

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
  CLOUD_SYNC_LIST_CAMPAIGNS: 'cloud:sync-list-campaigns'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
