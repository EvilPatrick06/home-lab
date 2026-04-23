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
  NOTIFICATION_CONFIG: 'notification-config',
  AUTOSAVE_CONFIG: 'autosave:config',
  LIBRARY_RECENT: 'library-recent',
  LIBRARY_FAVORITES: 'library-favorites',
  DICE_TRAY_POSITION: 'dice-tray-position',
  NARRATION_TTS: 'narration-tts-enabled',
  ENCOUNTER_PRESETS: 'encounter-presets',
  AUDIO: 'dnd-vtt-audio'
} as const

// Dynamic keys (campaign/character-specific)
export const dynamicKeys = {
  lobbyChat: (campaignId: string) => `lobby-chat-${campaignId}`,
  autosaveVersions: (campaignId: string) => `autosave:${campaignId}:versions`,
  autosaveVersion: (campaignId: string, versionId: string) => `autosave:${campaignId}:${versionId}`,
  macroStorage: (characterId: string) => `macro-storage-${characterId}`,
  builderDraft: (characterId: string) => `builder-draft-${characterId}`
} as const
