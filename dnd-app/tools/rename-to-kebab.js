/**
 * File Rename Utility — renames camelCase/PascalCase .ts files to kebab-case
 * and updates all import paths across the codebase.
 *
 * Modular design: exports reusable functions so other scripts or AI agents
 * can call them programmatically.
 *
 * Usage:
 *   node Tests/rename-to-kebab.js                    # run all renames
 *   node Tests/rename-to-kebab.js --dry-run           # preview only
 *
 * Programmatic:
 *   const { renameFiles, updateImports } = require('./rename-to-kebab')
 *   renameFiles(renames, { dryRun: true })
 *   updateImports(renames, { srcDir: 'src' })
 */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

// ── Helpers (exported for reuse) ──

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getAllSourceFiles(dir, exts = ['.ts', '.tsx']) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...getAllSourceFiles(p, exts))
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      results.push(p)
    }
  }
  return results
}

/**
 * Rename files using git mv.
 * @param {Array<[string,string]>} renames — Array of [oldRelPath, newRelPath]
 * @param {object} opts — { dryRun?: boolean, root?: string }
 * @returns {{ renamed: string[], skipped: string[], errors: string[] }}
 */
function renameFiles(renames, opts = {}) {
  const root = opts.root || ROOT
  const dryRun = opts.dryRun || false
  const renamed = []
  const skipped = []
  const errors = []

  for (const [oldPath, newPath] of renames) {
    const fullOld = path.join(root, oldPath)
    if (!fs.existsSync(fullOld)) {
      skipped.push(oldPath)
      continue
    }
    if (dryRun) {
      renamed.push(`${oldPath} -> ${newPath}`)
      continue
    }
    try {
      execSync(`git mv "${oldPath}" "${newPath}"`, { cwd: root, encoding: 'utf-8' })
      renamed.push(`${oldPath} -> ${newPath}`)
    } catch (e) {
      errors.push(`${oldPath}: ${e.message.slice(0, 200)}`)
    }
  }
  return { renamed, skipped, errors }
}

/**
 * Update import paths in all source files after renames.
 * @param {Array<[string,string]>} renames — Array of [oldRelPath, newRelPath]
 * @param {object} opts — { srcDir?: string, root?: string, dryRun?: boolean }
 * @returns {{ updatedFiles: number, totalReplacements: number }}
 */
function updateImports(renames, opts = {}) {
  const root = opts.root || ROOT
  const srcDir = opts.srcDir || 'src'
  const dryRun = opts.dryRun || false

  const sourceFiles = getAllSourceFiles(path.join(root, srcDir))
  let updatedFiles = 0
  let totalReplacements = 0

  for (const file of sourceFiles) {
    let content = fs.readFileSync(file, 'utf-8')
    let modified = false

    for (const [oldPath, newPath] of renames) {
      const oldBase = path.basename(oldPath, path.extname(oldPath))
      const newBase = path.basename(newPath, path.extname(newPath))

      const importRegex = new RegExp(
        `((?:from\\s+|import\\s*\\(|require\\s*\\()['"])([^'"]*\\/)` + escapeRegExp(oldBase) + `(['"])`,
        'g'
      )

      const newContent = content.replace(importRegex, (match, p1, p2, p3) => {
        totalReplacements++
        return `${p1}${p2}${newBase}${p3}`
      })
      if (newContent !== content) {
        content = newContent
        modified = true
      }
    }

    if (modified && !dryRun) {
      fs.writeFileSync(file, content, 'utf-8')
    }
    if (modified) updatedFiles++
  }

  return { updatedFiles, totalReplacements }
}

// ── Rename definitions (Phase 4 — already applied) ──

const PHASE_4_RENAMES = [
  // Storage files
  ['src/main/storage/aiConversationStorage.ts', 'src/main/storage/ai-conversation-storage.ts'],
  ['src/main/storage/bastionStorage.ts', 'src/main/storage/bastion-storage.ts'],
  ['src/main/storage/campaignStorage.ts', 'src/main/storage/campaign-storage.ts'],
  ['src/main/storage/characterStorage.ts', 'src/main/storage/character-storage.ts'],
  ['src/main/storage/customCreatureStorage.ts', 'src/main/storage/custom-creature-storage.ts'],
  ['src/main/storage/gameStateStorage.ts', 'src/main/storage/game-state-storage.ts'],
  ['src/main/storage/homebrewStorage.ts', 'src/main/storage/homebrew-storage.ts'],
  ['src/main/storage/settingsStorage.ts', 'src/main/storage/settings-storage.ts'],
  // Map overlay files
  ['src/renderer/src/components/game/map/AoEOverlay.ts', 'src/renderer/src/components/game/map/aoe-overlay.ts'],
  ['src/renderer/src/components/game/map/AudioEmitterOverlay.ts', 'src/renderer/src/components/game/map/audio-emitter-overlay.ts'],
  ['src/renderer/src/components/game/map/CombatAnimations.ts', 'src/renderer/src/components/game/map/combat-animations.ts'],
  ['src/renderer/src/components/game/map/FogOverlay.ts', 'src/renderer/src/components/game/map/fog-overlay.ts'],
  ['src/renderer/src/components/game/map/GridLayer.ts', 'src/renderer/src/components/game/map/grid-layer.ts'],
  ['src/renderer/src/components/game/map/LightingOverlay.ts', 'src/renderer/src/components/game/map/lighting-overlay.ts'],
  ['src/renderer/src/components/game/map/MeasurementTool.ts', 'src/renderer/src/components/game/map/measurement-tool.ts'],
  ['src/renderer/src/components/game/map/MovementOverlay.ts', 'src/renderer/src/components/game/map/movement-overlay.ts'],
  ['src/renderer/src/components/game/map/TokenSprite.ts', 'src/renderer/src/components/game/map/token-sprite.ts'],
  ['src/renderer/src/components/game/map/WallLayer.ts', 'src/renderer/src/components/game/map/wall-layer.ts'],
  ['src/renderer/src/components/game/map/WeatherOverlay.ts', 'src/renderer/src/components/game/map/weather-overlay.ts'],
  // Dice files
  ['src/renderer/src/components/game/dice3d/DiceMeshes.ts', 'src/renderer/src/components/game/dice3d/dice-meshes.ts'],
  ['src/renderer/src/components/game/dice3d/DicePhysics.ts', 'src/renderer/src/components/game/dice3d/dice-physics.ts'],
  // Hooks
  ['src/renderer/src/hooks/useAutoSave.ts', 'src/renderer/src/hooks/use-auto-save.ts'],
  ['src/renderer/src/hooks/useToast.ts', 'src/renderer/src/hooks/use-toast.ts'],
  // Stores
  ['src/renderer/src/stores/useAiDmStore.ts', 'src/renderer/src/stores/use-ai-dm-store.ts'],
  ['src/renderer/src/stores/useBastionStore.ts', 'src/renderer/src/stores/use-bastion-store.ts'],
  ['src/renderer/src/stores/useBuilderStore.ts', 'src/renderer/src/stores/use-builder-store.ts'],
  ['src/renderer/src/stores/useCampaignStore.ts', 'src/renderer/src/stores/use-campaign-store.ts'],
  ['src/renderer/src/stores/useCharacterStore.ts', 'src/renderer/src/stores/use-character-store.ts'],
  ['src/renderer/src/stores/useDataStore.ts', 'src/renderer/src/stores/use-data-store.ts'],
  ['src/renderer/src/stores/useGameStore.ts', 'src/renderer/src/stores/use-game-store.ts'],
  ['src/renderer/src/stores/useLevelUpStore.ts', 'src/renderer/src/stores/use-level-up-store.ts'],
  ['src/renderer/src/stores/useLobbyStore.ts', 'src/renderer/src/stores/use-lobby-store.ts'],
  ['src/renderer/src/stores/useNetworkStore.ts', 'src/renderer/src/stores/use-network-store.ts'],
]

// ── CLI entry point ──

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  console.log(`=== File Rename Utility ${dryRun ? '(DRY RUN)' : ''} ===\n`)

  console.log('Step 1: Renaming files...')
  const { renamed, skipped, errors } = renameFiles(PHASE_4_RENAMES, { dryRun })
  for (const r of renamed) console.log(`  ${r}`)
  if (skipped.length) console.log(`  Skipped ${skipped.length} (already renamed)`)
  if (errors.length) console.log(`  Errors: ${errors.join('\n  ')}`)

  console.log('\nStep 2: Updating import paths...')
  const { updatedFiles, totalReplacements } = updateImports(PHASE_4_RENAMES, { dryRun })
  console.log(`  Updated ${updatedFiles} files (${totalReplacements} replacements)`)

  console.log('\nDone.')
}

// ── Module exports ──

module.exports = {
  renameFiles,
  updateImports,
  getAllSourceFiles,
  escapeRegExp,
  PHASE_4_RENAMES,
  ROOT
}
