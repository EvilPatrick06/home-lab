const fs = require('fs')
const path = require('path')
const glob = require('glob')

const replacements = [
  { match: /'dnd-vtt-accessibility'/g, repl: 'SETTINGS_KEYS.ACCESSIBILITY' },
  { match: /'dnd-vtt-theme'/g, repl: 'SETTINGS_KEYS.THEME' },
  { match: /'dnd-vtt-display-name'/g, repl: 'SETTINGS_KEYS.DISPLAY_NAME' },
  { match: /'dnd-vtt-last-session'/g, repl: 'SETTINGS_KEYS.LAST_SESSION' },
  { match: /'dnd-vtt-joined-sessions'/g, repl: 'SETTINGS_KEYS.JOINED_SESSIONS' },
  { match: /'dnd-vtt-auto-rejoin'/g, repl: 'SETTINGS_KEYS.AUTO_REJOIN' },
  { match: /'dnd-vtt-grid-opacity'/g, repl: 'SETTINGS_KEYS.GRID_OPACITY' },
  { match: /'dnd-vtt-grid-color'/g, repl: 'SETTINGS_KEYS.GRID_COLOR' },
  { match: /'dnd-vtt-dice-mode'/g, repl: 'SETTINGS_KEYS.DICE_MODE' },
  { match: /'dnd-vtt-bottom-bar-height'/g, repl: 'SETTINGS_KEYS.BOTTOM_BAR_HEIGHT' },
  { match: /'dnd-vtt-sidebar-width'/g, repl: 'SETTINGS_KEYS.SIDEBAR_WIDTH' },
  { match: /'notification-config'/g, repl: 'SETTINGS_KEYS.NOTIFICATION_CONFIG' },
  { match: /'autosave:config'/g, repl: 'SETTINGS_KEYS.AUTOSAVE_CONFIG' },
  { match: /'library-recent'/g, repl: 'SETTINGS_KEYS.LIBRARY_RECENT' },
  { match: /'library-favorites'/g, repl: 'SETTINGS_KEYS.LIBRARY_FAVORITES' },
  { match: /'dice-tray-position'/g, repl: 'SETTINGS_KEYS.DICE_TRAY_POSITION' },
  { match: /'narration-tts-enabled'/g, repl: 'SETTINGS_KEYS.NARRATION_TTS' },
  { match: /'encounter-presets'/g, repl: 'SETTINGS_KEYS.ENCOUNTER_PRESETS' },
  { match: /'dnd-vtt-audio'/g, repl: 'SETTINGS_KEYS.AUDIO' },
  // dynamic replacements
  { match: /'lobby-chat-\$\{campaignId\}'|`lobby-chat-\$\{campaignId\}`/g, repl: 'dynamicKeys.lobbyChat(campaignId)' },
  { match: /'autosave:\$\{campaignId\}:versions'|`autosave:\$\{campaignId\}:versions`/g, repl: 'dynamicKeys.autosaveVersions(campaignId)' },
  { match: /'autosave:\$\{campaignId\}:\$\{versionId\}'|`autosave:\$\{campaignId\}:\$\{versionId\}`/g, repl: 'dynamicKeys.autosaveVersion(campaignId, versionId)' },
  { match: /'macro-storage-\$\{characterId\}'|`macro-storage-\$\{characterId\}`/g, repl: 'dynamicKeys.macroStorage(characterId)' },
  { match: /'builder-draft-\$\{characterId\}'|`builder-draft-\$\{characterId\}`/g, repl: 'dynamicKeys.builderDraft(characterId)' }
]

const targetFiles = [
  'src/renderer/src/stores/use-accessibility-store.ts',
  'src/renderer/src/services/theme-manager.ts',
  'src/renderer/src/pages/SettingsPage.tsx',
  'src/renderer/src/components/game/GameLayout.tsx',
  'src/renderer/src/services/notification-service.ts',
  'src/renderer/src/services/io/auto-save.ts',
  'src/renderer/src/stores/use-library-store.ts',
  'src/renderer/src/stores/use-lobby-store.ts',
  'src/renderer/src/components/game/dice3d/DiceTray.tsx',
  'src/renderer/src/stores/use-narration-tts-store.ts',
  'src/renderer/src/stores/use-macro-store.ts',
  'src/renderer/src/stores/use-builder-store.ts',
  'src/renderer/src/services/io/builder-auto-save.ts',
  'src/renderer/src/components/game/modals/EncounterBuilderModal.tsx',
  'src/renderer/src/constants/app-constants.ts',
  'src/renderer/src/services/sound-manager.ts'
]

for (const rel of targetFiles) {
  const file = path.join('c:/Users/evilp/dnd', rel)
  if (!fs.existsSync(file)) {
    console.log('Skipping missing file: ' + file)
    continue
  }
  let c = fs.readFileSync(file, 'utf8')
  let changed = false
  for (const r of replacements) {
    if (c.match(r.match)) {
      c = c.replace(r.match, r.repl)
      changed = true
    }
  }

  if (changed) {
    let importStatement = ''
    if (c.includes('SETTINGS_KEYS') && c.includes('dynamicKeys')) {
      importStatement = `import { SETTINGS_KEYS, dynamicKeys } from '@constants'\n`
    } else if (c.includes('SETTINGS_KEYS')) {
      importStatement = `import { SETTINGS_KEYS } from '@constants'\n`
    } else if (c.includes('dynamicKeys')) {
      importStatement = `import { dynamicKeys } from '@constants'\n`
    }

    if (!c.includes("import { SETTINGS_KEYS") && !c.includes("import { dynamicKeys")) {
      c = importStatement + c
    }
    fs.writeFileSync(file, c)
    console.log('Modified: ' + file)
  }
}
