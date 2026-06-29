export const SETTINGS_KEYS = {
  ACCESSIBILITY: 'dnd-vtt-accessibility',
  THEME: 'dnd-vtt-theme',
  DISPLAY_NAME: 'dnd-vtt-display-name',
  LAST_SESSION: 'dnd-vtt-last-session',
  JOINED_SESSIONS: 'dnd-vtt-joined-sessions',
  AUTO_REJOIN: 'dnd-vtt-auto-rejoin',
  GRID_OPACITY: 'dnd-vtt-grid-opacity',
  GRID_COLOR: 'dnd-vtt-grid-color',
  DICE_MODE: 'dnd-vtt-dice-mode',
  BOTTOM_BAR_HEIGHT: 'dnd-vtt-bottom-bar-height',
  SIDEBAR_WIDTH: 'dnd-vtt-sidebar-width',
  NOTIFICATION_CONFIG: 'dnd-vtt-notification-config',
  AUTOSAVE_CONFIG: 'autosave:config',
  LIBRARY_RECENT: 'dnd-vtt-library-recent',
  LIBRARY_FAVORITES: 'dnd-vtt-library-favorites',
  DICE_TRAY_POSITION: 'dnd-vtt-dice-tray-position',
  NARRATION_TTS: 'dnd-vtt-narration-tts-enabled',
  ENCOUNTER_PRESETS: 'dnd-vtt-encounter-presets',
  AUDIO: 'dnd-vtt-audio',
  SCENE_MODE_PREFS: 'dnd-vtt-scene-mode-prefs',
  LOBBY_DICE_COLORS: 'dnd-vtt-lobby-dice-colors'
} as const

// Dynamic keys (campaign/character-specific)
export const dynamicKeys = {
  lobbyChat: (campaignId: string) => `dnd-vtt-lobby-chat-${campaignId}`,
  autosaveVersions: (campaignId: string) => `autosave:${campaignId}:versions`,
  autosaveVersion: (campaignId: string, versionId: string) => `autosave:${campaignId}:${versionId}`,
  macroStorage: (characterId: string) => `dnd-vtt-macro-storage-${characterId}`,
  builderDraft: (characterId: string) => `dnd-vtt-builder-draft-${characterId}`
} as const
