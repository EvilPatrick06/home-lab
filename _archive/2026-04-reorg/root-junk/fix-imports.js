const fs = require('fs')
const path = require('path')

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
  if (!fs.existsSync(file)) continue
  let c = fs.readFileSync(file, 'utf8')
  if (c.includes("@constants")) {
    const depth = rel.split('/').length - 4
    const prefix = depth > 0 ? '../'.repeat(depth) : './'
    const newPath = prefix + 'constants'
    c = c.replace(/from '@constants'/g, `from '${newPath}'`)
    fs.writeFileSync(file, c)
    console.log('Fixed imports in ' + file)
  }
}
