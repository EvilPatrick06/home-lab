/**
 * Console.log Replacement Utility — replaces console.log/warn/error/debug/info
 * in source files with structured logging.
 *
 * - Main process: uses logToFile() from src/main/index.ts
 * - Renderer process: uses logger from src/renderer/src/services/logger.ts
 * - Preload: silently removes console.error in catch blocks
 * - Test files: skipped entirely
 *
 * Modular design: exports reusable functions.
 *
 * Usage:
 *   node Tests/replace-console-logs.js               # apply replacements
 *   node Tests/replace-console-logs.js --dry-run       # preview only
 *   node Tests/replace-console-logs.js --count         # just count occurrences
 *
 * Programmatic:
 *   const { replaceConsoleLogs } = require('./replace-console-logs')
 *   replaceConsoleLogs({ dryRun: true })
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function isTestFile(filePath) {
  return filePath.includes('.test.') || filePath.includes('__test') || filePath.includes('__mock')
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
 * Count console.* usages across the codebase (excluding tests).
 * @returns {{ total: number, byProcess: { main: number, renderer: number, preload: number } }}
 */
function countConsoleLogs() {
  const files = getAllSourceFiles(path.join(ROOT, 'src'))
  const regex = /\bconsole\.(log|warn|error|debug|info)\s*\(/g
  let main = 0, renderer = 0, preload = 0

  for (const f of files) {
    if (isTestFile(f)) continue
    const content = fs.readFileSync(f, 'utf-8')
    const matches = content.match(regex) || []
    if (matches.length === 0) continue

    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    if (rel.startsWith('src/main/')) main += matches.length
    else if (rel.startsWith('src/preload/')) preload += matches.length
    else if (rel.startsWith('src/renderer/')) renderer += matches.length
  }

  return { total: main + renderer + preload, byProcess: { main, renderer, preload } }
}

/**
 * Replace console.* calls with structured logging.
 * @param {object} opts — { dryRun?: boolean }
 * @returns {{ filesModified: number, replacements: number, details: string[] }}
 */
function replaceConsoleLogs(opts = {}) {
  const dryRun = opts.dryRun || false
  let filesModified = 0
  let replacements = 0
  const details = []

  // ── Renderer files ──
  const rendererFiles = getAllSourceFiles(path.join(ROOT, 'src/renderer/src'))
  for (const f of rendererFiles) {
    if (isTestFile(f)) continue
    // Skip the logger itself
    if (f.replace(/\\/g, '/').endsWith('utils/logger.ts')) continue

    let content = fs.readFileSync(f, 'utf-8')
    const regex = /\bconsole\.(log|warn|error|debug|info)\s*\(/g
    if (!regex.test(content)) continue

    // Reset regex
    const original = content

    // Replace console.X( with logger.X(
    content = content.replace(/\bconsole\.(log|warn|error|debug|info)\s*\(/g, (match, method) => {
      replacements++
      return `logger.${method}(`
    })

    if (content !== original) {
      // Add import if not already present
      if (!content.includes("import { logger }")) {
        // Calculate relative import path
        const fileDir = path.dirname(f).replace(/\\/g, '/')
        const loggerPath = path.join(ROOT, 'src/renderer/src/utils/logger.ts').replace(/\\/g, '/')
        let relImport = path.relative(fileDir, loggerPath).replace(/\\/g, '/').replace(/\.ts$/, '')
        if (!relImport.startsWith('.')) relImport = './' + relImport

        // Add import after last existing import
        const importLines = content.split('\n')
        let lastImportIdx = -1
        for (let i = 0; i < importLines.length; i++) {
          if (/^import\s/.test(importLines[i]) || /^} from /.test(importLines[i])) {
            lastImportIdx = i
          }
        }
        if (lastImportIdx >= 0) {
          importLines.splice(lastImportIdx + 1, 0, `import { logger } from '${relImport}'`)
          content = importLines.join('\n')
        }
      }

      const rel = path.relative(ROOT, f).replace(/\\/g, '/')
      details.push(rel)
      if (!dryRun) fs.writeFileSync(f, content, 'utf-8')
      filesModified++
    }
  }

  // ── Main process files ──
  const mainFiles = getAllSourceFiles(path.join(ROOT, 'src/main'))
  for (const f of mainFiles) {
    if (isTestFile(f)) continue
    // Skip index.ts (where logToFile is defined)
    if (f.replace(/\\/g, '/').endsWith('main/index.ts')) continue

    let content = fs.readFileSync(f, 'utf-8')
    const regex = /\bconsole\.(log|warn|error|debug|info)\s*\(/g
    if (!regex.test(content)) continue

    const original = content
    const methodToLevel = { log: 'INFO', info: 'INFO', warn: 'WARN', error: 'ERROR', debug: 'DEBUG' }

    // Replace console.X(...) with logToFile('LEVEL', ...)
    // This is trickier — we need to handle the args differently
    // For simplicity, replace console.error('msg', err) → logToFile('ERROR', 'msg')
    content = content.replace(/\bconsole\.(log|warn|error|debug|info)\s*\(([^)]*)\)/g, (match, method, args) => {
      const level = methodToLevel[method]
      replacements++
      // Convert args: first arg is message, rest are data
      const trimmed = args.trim()
      if (!trimmed) return `logToFile('${level}', '')`
      return `logToFile('${level}', ${trimmed})`
    })

    if (content !== original) {
      // Add import if not already present
      if (!content.includes("import { logToFile }") && !content.includes("logToFile }")) {
        const importLines = content.split('\n')
        let lastImportIdx = -1
        for (let i = 0; i < importLines.length; i++) {
          if (/^import\s/.test(importLines[i])) lastImportIdx = i
        }
        if (lastImportIdx >= 0) {
          const fileDir = path.dirname(f).replace(/\\/g, '/')
          const indexPath = path.join(ROOT, 'src/main/index.ts').replace(/\\/g, '/')
          let relImport = path.relative(fileDir, indexPath).replace(/\\/g, '/').replace(/\.ts$/, '')
          if (!relImport.startsWith('.')) relImport = './' + relImport
          importLines.splice(lastImportIdx + 1, 0, `import { logToFile } from '${relImport}'`)
          content = importLines.join('\n')
        }
      }

      const rel = path.relative(ROOT, f).replace(/\\/g, '/')
      details.push(rel)
      if (!dryRun) fs.writeFileSync(f, content, 'utf-8')
      filesModified++
    }
  }

  // ── Preload ──
  const preloadFile = path.join(ROOT, 'src/preload/index.ts')
  if (fs.existsSync(preloadFile)) {
    let content = fs.readFileSync(preloadFile, 'utf-8')
    const original = content
    // In preload, just silence console.error to void
    content = content.replace(/\bconsole\.(error|log|warn)\s*\([^)]*\)/g, () => {
      replacements++
      return '/* console suppressed in preload */'
    })
    if (content !== original) {
      details.push('src/preload/index.ts')
      if (!dryRun) fs.writeFileSync(preloadFile, content, 'utf-8')
      filesModified++
    }
  }

  return { filesModified, replacements, details }
}

// ── CLI entry point ──

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const countOnly = process.argv.includes('--count')

  if (countOnly) {
    const counts = countConsoleLogs()
    console.log(`Total console.* calls: ${counts.total}`)
    console.log(`  Main:     ${counts.byProcess.main}`)
    console.log(`  Renderer: ${counts.byProcess.renderer}`)
    console.log(`  Preload:  ${counts.byProcess.preload}`)
    process.exit(0)
  }

  console.log(`=== Console.log Replacement ${dryRun ? '(DRY RUN)' : ''} ===\n`)

  const result = replaceConsoleLogs({ dryRun })
  console.log(`Modified ${result.filesModified} files (${result.replacements} replacements)`)
  if (result.details.length) {
    console.log('\nFiles modified:')
    for (const d of result.details) console.log(`  ${d}`)
  }
}

module.exports = { countConsoleLogs, replaceConsoleLogs, getAllSourceFiles, ROOT }
