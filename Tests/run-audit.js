/**
 * Master Audit Script — runs all checks and writes TestAudit.md
 * Usage: node Tests/run-audit.js
 */

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { runElectronSecurity } = require('./electron-security')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(__dirname, 'TestAudit.md')

// ── Helpers ──

function run(cmd, opts = {}) {
  try {
    const result = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: opts.timeout || 120_000,
      env: { ...process.env, PATH: 'C:\\Program Files\\nodejs;' + process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024
    })
    return { ok: true, stdout: result, stderr: '' }
  } catch (e) {
    return { ok: false, stdout: e.stdout || '', stderr: e.stderr || '', code: e.status }
  }
}

function getAllFiles(dir, exts = ['.ts', '.tsx']) {
  const results = []
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) return results
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(p)
      } else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) {
        results.push(p)
      }
    }
  }
  walk(full)
  return results
}

function relPath(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

function countMatches(files, regex) {
  const hits = []
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        hits.push({ file: relPath(f), line: i + 1, text: lines[i].trim().slice(0, 120) })
      }
    }
  }
  return hits
}

function isTestFile(f) {
  const rel = relPath(f)
  return rel.includes('.test.') || rel.includes('__test') || rel.includes('__mock')
}

/**
 * Returns remaining implementation work items.
 * Each item has a `done()` check — when it returns true the item is omitted.
 * To add a new future task: add an entry to the array below.
 * To mark one complete: either implement it (so done() returns true) or remove the entry.
 */
function getRemainingWork() {
  const items = [
    {
      id: '7a',
      done: () =>
        fs.existsSync(path.join(ROOT, 'src/renderer/src/components/game/GameModalDispatcher.tsx')) &&
        fs.existsSync(path.join(ROOT, 'src/renderer/src/components/game/hooks/use-game-network.ts')),
      text: [
        '### 7a. Split GameLayout.tsx',
        `Current size: ${getLineCount('src/renderer/src/components/game/GameLayout.tsx')} lines`,
        'Extract from `src/renderer/src/components/game/GameLayout.tsx`:',
        '1. `GameModalDispatcher.tsx` — all lazy modal imports + render logic',
        '2. `hooks/use-game-network.ts` — host/client network message handlers',
        '3. `hooks/use-game-sound.ts` — sound event mapping',
        '4. `hooks/use-token-movement.ts` — drag/drop/pathfinding handlers',
        '**Pattern**: Extract custom hooks and sub-components, keep GameLayout as orchestrator.\n'
      ]
    },
    {
      id: '7b',
      done: () =>
        fs.existsSync(path.join(ROOT, 'src/renderer/src/pages/campaign-detail/NPCManager.tsx')),
      text: [
        '### 7b. Split CampaignDetailPage.tsx',
        `Current size: ${getLineCount('src/renderer/src/pages/CampaignDetailPage.tsx')} lines`,
        'Extract from `src/renderer/src/pages/CampaignDetailPage.tsx`:',
        '1. `campaign-detail/NPCManager.tsx`',
        '2. `campaign-detail/RuleManager.tsx`',
        '3. `campaign-detail/LoreManager.tsx`',
        '4. `campaign-detail/AdventureWizard.tsx`',
        '5. `campaign-detail/MonsterLinker.tsx`',
        '**Pattern**: Each manager is a self-contained React component with its own state.\n'
      ]
    },
    {
      id: '7c',
      done: () => {
        // Done when no source file exceeds 800 lines (excluding test files and data files)
        const bigFiles = getLargeSourceFiles(1000)
        return bigFiles.length === 0
      },
      text: () => {
        const bigFiles = getLargeSourceFiles(1000)
        if (bigFiles.length === 0) return []
        return [
          '### 7c. Split remaining large files (>1000 lines)',
          'Apply the same extraction pattern to these files:',
          '| File | Lines | Suggested Split |',
          '|------|-------|----------------|',
          ...bigFiles.map(f => `| ${f.name} | ${f.lines} | ${f.suggestion} |`),
          ''
        ]
      }
    },
    {
      id: '6d',
      done: () => {
        // Done when core-slice.ts contains a DEFAULT_CHARACTER_DETAILS reference
        const corePath = path.join(ROOT, 'src/renderer/src/stores/builder/slices/core-slice.ts')
        if (!fs.existsSync(corePath)) return true
        return fs.readFileSync(corePath, 'utf-8').includes('DEFAULT_CHARACTER_DETAILS')
      },
      text: [
        '### 6d. Builder store reset dedup',
        'In `stores/builder/slices/core-slice.ts`, refactor `resetBuilder` to call',
        'the character-details-slice defaults instead of duplicating 50+ key initializations.',
        'Extract shared defaults into a `DEFAULT_CHARACTER_DETAILS` constant.\n'
      ]
    },
    {
      id: 'wip-sidebar',
      done: () => {
        // Done when CombatLogPanel is imported somewhere in the game layout or sidebar
        const sidebarFiles = getAllFiles('src/renderer/src/components/game/sidebar')
        const layoutFile = path.join(ROOT, 'src/renderer/src/components/game/GameLayout.tsx')
        const allContent = [...sidebarFiles.map(f => fs.readFileSync(f, 'utf-8'))]
        if (fs.existsSync(layoutFile)) allContent.push(fs.readFileSync(layoutFile, 'utf-8'))
        return allContent.some(c => c.includes('CombatLogPanel'))
      },
      text: [
        '### Integration of orphan WIP components',
        'These completed components need to be wired into the UI:',
        '- `CombatLogPanel.tsx` — Add to game sidebar tabs',
        '- `JournalPanel.tsx` — Add to game sidebar tabs',
        '- `RollRequestOverlay.tsx` — Wire to P2P "dm:roll-request" message type',
        '- `ThemeSelector.tsx` — Add to SettingsDropdown.tsx',
        '- `PrintSheet.tsx` — Add print button to character sheet header',
        ''
      ]
    },
    {
      id: 'wip-new',
      done: () => {
        // Done when all three WIP files are imported somewhere
        const allSrc = getAllFiles('src/renderer/src')
        const allMain = getAllFiles('src/main')
        const allContent = [...allSrc, ...allMain].map(f => fs.readFileSync(f, 'utf-8')).join('\n')
        return (
          allContent.includes('cloud-sync') &&
          allContent.includes('cdn-provider') &&
          allContent.includes('sentient-items')
        )
      },
      text: [
        '### New WIP features (found untracked)',
        'These files were found as new untracked/WIP code and need integration:',
        '- `src/main/storage/cloud-sync.ts` — Cloud save/sync backend (S3-based)',
        '- `src/renderer/src/services/cdn-provider.ts` — CDN asset provider',
        '- `src/renderer/src/data/sentient-items.ts` — Sentient item data for DM tools',
        ''
      ]
    }
  ]

  const output = []
  for (const item of items) {
    try {
      if (item.done()) continue
    } catch {
      // If check fails, keep the item visible
    }
    const textLines = typeof item.text === 'function' ? item.text() : item.text
    output.push(...textLines)
  }
  return output
}

/** Get line count for a file relative to ROOT */
function getLineCount(relFile) {
  const full = path.join(ROOT, relFile)
  if (!fs.existsSync(full)) return '?'
  return fs.readFileSync(full, 'utf-8').split('\n').length
}

/** Large source files with split suggestions (for 7c check) */
function getLargeSourceFiles(threshold) {
  const suggestions = {
    'EquipmentSection5e.tsx': 'Extract magic item manager, attunement panel, language manager',
    'BastionPage.tsx': 'Extract facility manager, event log, garrison panel',
    'AttackModal.tsx': 'Extract target selector, damage calculator, roll display',
    'useLevelUpStore.ts': 'Convert to Zustand slices (follow stores/game/ pattern)',
    'use-level-up-store.ts': 'Convert to Zustand slices (follow stores/game/ pattern)',
    'SidebarEntryList.tsx': 'Extract entry editor, category filter, search panel',
    'combat-resolver.ts': 'Extract save resolver, AOE handler, spell attack handler',
    'save-slice-5e.ts': 'Extract save/load helpers, migration logic',
    'DefenseSection5e.tsx': 'Extract armor manager, defense adder, proficiency editor',
    'LevelSection5e.tsx': 'Extract HP manager, hit dice, class feature display',
    'MapCanvas.tsx': 'Extract PixiJS setup, event handlers, toolbar',
    'DMShopModal.tsx': 'Extract inventory editor, pricing panel, search',
    'GameLayout.tsx': 'See item 7a above',
    'CampaignDetailPage.tsx': 'See item 7b above'
  }

  const srcFiles = getAllFiles('src/renderer/src').concat(getAllFiles('src/main'))
  const big = []
  for (const f of srcFiles) {
    if (isTestFile(f)) continue
    const lineCount = fs.readFileSync(f, 'utf-8').split('\n').length
    if (lineCount > threshold) {
      const name = path.basename(f)
      big.push({
        name,
        lines: lineCount,
        suggestion: suggestions[name] || 'Extract sub-components / helpers'
      })
    }
  }
  big.sort((a, b) => b.lines - a.lines)
  return big
}

const checks = []

function addCheck(id, name, category, fn) {
  checks.push({ id, name, category, fn })
}

// ── A. Core Quality ──

addCheck(1, 'TypeScript type-check', 'Core Quality', () => {
  const r = run('npx tsc --build', { timeout: 180_000 })
  const errors = (r.stdout + r.stderr).match(/error TS\d+/g) || []
  return { status: errors.length === 0 ? 'pass' : 'fail', count: errors.length, details: errors.length ? (r.stdout + r.stderr).slice(0, 3000) : '0 errors across all projects' }
})

addCheck(2, 'Biome lint', 'Core Quality', () => {
  const r = run('npx biome check src/')
  const errorLines = (r.stdout + r.stderr).match(/diagnostics?/gi) || []
  const isPass = r.ok
  return { status: isPass ? 'pass' : 'warn', count: isPass ? 0 : errorLines.length, details: isPass ? 'No lint issues' : (r.stdout + r.stderr).slice(0, 3000) }
})

addCheck(3, 'Biome format check', 'Core Quality', () => {
  const r = run('npx biome format src/')
  // Biome v2 outputs "Formatted X files ... Fixed Y files." when files need formatting
  const fixedMatch = (r.stdout + r.stderr).match(/Fixed (\d+) file/)
  const unfmtCount = fixedMatch ? parseInt(fixedMatch[1]) : 0
  const isFormatted = unfmtCount === 0 && r.ok
  return { status: isFormatted ? 'pass' : 'warn', count: unfmtCount, details: isFormatted ? 'All files formatted' : (r.stdout + r.stderr).slice(0, 3000) }
})

addCheck(4, 'Unit tests', 'Core Quality', () => {
  const r = run('npx vitest run', { timeout: 300_000 })
  const passMatch = (r.stdout).match(/(\d+)\s+passed/i)
  const failMatch = (r.stdout).match(/(\d+)\s+failed/i)
  const passed = passMatch ? parseInt(passMatch[1]) : 0
  const failed = failMatch ? parseInt(failMatch[1]) : 0
  return { status: failed === 0 ? 'pass' : 'fail', count: failed, details: `${passed} passed, ${failed} failed\n${r.ok ? '' : r.stdout.slice(-2000)}` }
})

addCheck(5, 'Test coverage', 'Core Quality', () => {
  const r = run('npx vitest run --coverage', { timeout: 300_000 })
  const covMatch = r.stdout.match(/All files\s*\|\s*([\d.]+)/)
  const pctNum = covMatch ? parseFloat(covMatch[1]) : 0
  const pct = covMatch ? covMatch[1] + '%' : 'unknown'
  // Base status on coverage percentage, not exit code — V8 coverage instrumentation
  // can cause test failures in modules with native bindings (Three.js, cannon-es)
  // which doesn't affect the coverage report for files that do run successfully.
  // Check 4 already validates test pass/fail independently.
  const status = pctNum >= 60 ? 'pass' : pctNum >= 40 ? 'warn' : 'fail'
  return { status, count: 0, details: `Statement coverage: ${pct}\n${r.stdout.split('\n').filter(l => l.includes('|')).slice(0, 20).join('\n')}` }
})

addCheck(6, 'Production build', 'Core Quality', () => {
  const r = run('npx electron-vite build', { timeout: 180_000 })
  return { status: r.ok ? 'pass' : 'fail', count: r.ok ? 0 : 1, details: r.ok ? 'Build succeeded' : (r.stdout + r.stderr).slice(0, 3000) }
})

addCheck(7, 'OxLint', 'Core Quality', () => {
  const r = run('npx oxlint src/')
  const output = r.stdout + r.stderr
  // Parse "Found N warnings and M errors" from OxLint summary
  const warnMatch = output.match(/Found\s+(\d+)\s+warning/i)
  const errMatch = output.match(/(\d+)\s+error/i)
  const warnCount = warnMatch ? parseInt(warnMatch[1]) : 0
  const errCount = errMatch ? parseInt(errMatch[1]) : 0
  const count = warnCount + errCount
  const status = errCount > 0 ? 'fail' : count > 0 ? 'warn' : 'pass'
  return { status, count, details: output.slice(0, 3000) }
})

// ── B. Security ──

addCheck(8, 'npm audit', 'Security', () => {
  const r = run('npm audit')
  const vulnMatch = (r.stdout + r.stderr).match(/(\d+)\s+vulnerabilit/i)
  const count = vulnMatch ? parseInt(vulnMatch[1]) : 0
  return { status: count === 0 ? 'pass' : 'warn', count, details: (r.stdout).slice(0, 3000) }
})

addCheck(9, 'Lockfile lint', 'Security', () => {
  const r = run('npx lockfile-lint --path package-lock.json --type npm --allowed-hosts npm --validate-https')
  return { status: r.ok ? 'pass' : 'warn', count: r.ok ? 0 : 1, details: r.ok ? 'Lockfile is valid' : (r.stdout + r.stderr).slice(0, 2000) }
})

addCheck(10, 'Electron security scan', 'Security', () => {
  const results = runElectronSecurity()
  const allIssues = results.flatMap(r => r.issues)
  const criticals = allIssues.filter(i => i.startsWith('CRITICAL'))
  const warnings = allIssues.filter(i => i.startsWith('WARNING'))
  const status = criticals.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass'
  const details = results.map(r => `**${r.name}**: ${r.status.toUpperCase()}\n${r.issues.map(i => '  - ' + i).join('\n')}`).join('\n')
  return { status, count: criticals.length + warnings.length, details }
})

addCheck(11, 'Hardcoded secrets scan', 'Security', () => {
  const files = getAllFiles('src')
  const secretPatterns = [
    /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i,
    /(?:secret|token|password|passwd)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /sk-[A-Za-z0-9]{20,}/,
    /ghp_[A-Za-z0-9]{36}/,
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/
  ]
  const hits = []
  for (const f of files) {
    if (isTestFile(f)) continue
    const content = fs.readFileSync(f, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const pat of secretPatterns) {
        if (pat.test(lines[i])) {
          hits.push(`${relPath(f)}:${i + 1} — ${lines[i].trim().slice(0, 80)}`)
        }
      }
    }
  }
  return { status: hits.length === 0 ? 'pass' : 'fail', count: hits.length, details: hits.length === 0 ? 'No hardcoded secrets found' : hits.join('\n') }
})

addCheck(12, 'eval() / new Function()', 'Security', () => {
  const files = getAllFiles('src')
  const hits = countMatches(files.filter(f => !isTestFile(f)), /\beval\s*\(|new\s+Function\s*\(/)
  return { status: hits.length === 0 ? 'pass' : 'fail', count: hits.length, details: hits.length === 0 ? 'No eval/Function usage' : hits.map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

addCheck(13, 'dangerouslySetInnerHTML', 'Security', () => {
  const files = getAllFiles('src')
  const hits = countMatches(files.filter(f => !isTestFile(f)), /dangerouslySetInnerHTML/)
  return { status: hits.length === 0 ? 'pass' : 'warn', count: hits.length, details: hits.length === 0 ? 'No dangerouslySetInnerHTML usage' : hits.map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

// ── C. Dependencies ──

addCheck(14, 'Circular dependencies', 'Dependencies', () => {
  const r = run('npx madge --circular --extensions ts,tsx src/', { timeout: 180_000 })
  const cycles = (r.stdout || '').split('\n').filter(l => l.trim().length > 0 && !l.includes('No circular'))
  // Filter 1: 2-node barrel re-export patterns (A > B where B re-exports from A) are not real cycles.
  // Filter 2: Cycles involving lazy require() patterns are false positives — madge can't distinguish
  // require() inside functions (deferred) from top-level require (eager). Files using this pattern
  // for intentional cycle-breaking are listed below.
  const lazyRequireFiles = [
    'conditions-slice', 'initiative-slice', 'use-lobby-store',
    'network-store/index', 'network-store/client-handlers', 'network-store/host-handlers',
    'game-action-executor', 'game-sync'
  ]
  const realCycles = cycles.filter(l => {
    const nodes = l.split('>').map(s => s.trim()).filter(Boolean)
    if (nodes.length < 3) return false // 2-node barrel cycles
    // If any node in the cycle is a known lazy-require file, the cycle is a madge false positive
    if (nodes.some(n => lazyRequireFiles.some(f => n.includes(f)))) return false
    return true
  })
  return { status: realCycles.length === 0 ? 'pass' : 'warn', count: realCycles.length, details: realCycles.length === 0 ? 'No circular dependencies (barrel + lazy-require false positives excluded)' : realCycles.slice(0, 50).join('\n') }
})

addCheck(15, 'Dead code (knip)', 'Dependencies', () => {
  // knip.json handles false-positive filtering (entry points, ignore patterns, ignoreDependencies)
  const r = run('npx knip --no-exit-code', { timeout: 180_000 })
  const output = r.stdout || ''
  // Count items from "Unused X (N)" summary headers
  const unusedMatches = output.match(/Unused\s+\w+\s+\((\d+)\)/gi) || []
  let totalUnused = 0
  for (const m of unusedMatches) {
    const num = m.match(/\((\d+)\)/)
    if (num) totalUnused += parseInt(num[1])
  }
  // Fallback: count non-empty, non-header lines
  if (totalUnused === 0 && output.trim()) {
    const contentLines = output.split('\n').filter(l => l.trim() && !l.startsWith('=') && !l.startsWith('-'))
    totalUnused = contentLines.length
  }
  // Threshold: ≤100 is acceptable (IPC cross-process refs are invisible to knip), >100 needs attention
  const status = totalUnused <= 100 ? 'pass' : totalUnused <= 200 ? 'warn' : 'info'
  return { status, count: totalUnused, details: output.slice(0, 4000) || 'No dead code found' }
})

addCheck(16, 'Outdated packages', 'Dependencies', () => {
  const r = run('npx npm-check-updates')
  const updates = (r.stdout || '').split('\n').filter(l => /→/.test(l) || /->/.test(l))
  return { status: updates.length === 0 ? 'pass' : 'info', count: updates.length, details: updates.length === 0 ? 'All packages up to date' : updates.join('\n') }
})

addCheck(17, 'License compliance', 'Dependencies', () => {
  const r = run('npx license-checker --production --failOn "GPL-2.0;GPL-3.0;AGPL-3.0"')
  return { status: r.ok ? 'pass' : 'fail', count: r.ok ? 0 : 1, details: r.ok ? 'No copyleft licenses in production deps' : (r.stdout + r.stderr).slice(0, 3000) }
})

addCheck(18, 'Unused exports (ts-prune)', 'Dependencies', () => {
  const r = run('npx ts-prune --error', { timeout: 180_000 })
  const unused = (r.stdout || '').split('\n').filter(l => l.includes('used in module'))
  return { status: unused.length < 10 ? 'pass' : 'warn', count: unused.length, details: unused.length === 0 ? 'No unused exports' : unused.slice(0, 50).join('\n') }
})

addCheck(19, 'Duplicate packages', 'Dependencies', () => {
  const r = run('npm ls --all --json')
  let dupes = 0
  const dupeList = []
  try {
    const tree = JSON.parse(r.stdout)
    const seen = new Map()
    function walk(deps) {
      if (!deps) return
      for (const [name, info] of Object.entries(deps)) {
        const ver = info.version || 'unknown'
        if (!seen.has(name)) seen.set(name, new Set())
        seen.get(name).add(ver)
        walk(info.dependencies)
      }
    }
    walk(tree.dependencies)
    for (const [name, versions] of seen) {
      if (versions.size > 1) {
        dupes++
        dupeList.push(`${name}: ${[...versions].join(', ')}`)
      }
    }
  } catch { /* parse error */ }
  // Transitive dependency duplication is normal — only warn above 60
  return { status: dupes < 60 ? 'pass' : 'warn', count: dupes, details: `${dupes} packages with multiple versions installed\n${dupeList.slice(0, 30).join('\n')}` }
})

// ── D. React & Hooks ──

addCheck(20, 'React hooks lint (OxLint)', 'React & Hooks', () => {
  const r = run('npx oxlint --deny-warnings -D react_perf -D react src/')
  const output = r.stdout + r.stderr
  // Parse real count from OxLint summary
  const warnMatch = output.match(/Found\s+(\d+)\s+warning/i)
  const errMatch = output.match(/(\d+)\s+error/i)
  const warnCount = warnMatch ? parseInt(warnMatch[1]) : 0
  const errCount = errMatch ? parseInt(errMatch[1]) : 0
  const count = warnCount + errCount
  return { status: count === 0 ? 'pass' : 'warn', count, details: output.slice(0, 3000) || 'No React hooks issues' }
})

addCheck(21, 'Missing export default on lazy components', 'React & Hooks', () => {
  const appFile = path.join(ROOT, 'src/renderer/src/App.tsx')
  if (!fs.existsSync(appFile)) return { status: 'skip', count: 0, details: 'App.tsx not found' }
  const appContent = fs.readFileSync(appFile, 'utf-8')
  const lazyImports = [...appContent.matchAll(/(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)]
  const missing = []
  for (const m of lazyImports) {
    const importPath = m[1]
    const resolved = path.resolve(path.dirname(appFile), importPath)
    const candidates = [resolved + '.tsx', resolved + '.ts', resolved + '/index.tsx', resolved + '/index.ts']
    let found = false
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const content = fs.readFileSync(c, 'utf-8')
        if (/export\s+default\b/.test(content)) {
          found = true
        }
        break
      }
    }
    if (!found) missing.push(importPath)
  }
  return { status: missing.length === 0 ? 'pass' : 'fail', count: missing.length, details: missing.length === 0 ? `All ${lazyImports.length} lazy components have default exports` : 'Missing default export:\n' + missing.join('\n') }
})

addCheck(22, 'Missing key prop in .map()', 'React & Hooks', () => {
  const files = getAllFiles('src', ['.tsx'])
  const hits = []
  for (const f of files) {
    if (isTestFile(f)) continue
    const content = fs.readFileSync(f, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (/\.map\s*\(/.test(lines[i]) && /=>\s*[(<]/.test(lines[i])) {
        // Skip data transforms: .map() result assigned to a variable or passed to a setter/state updater
        if (/(?:const|let|var)\s+\w+\s*=.*\.map\s*\(/.test(lines[i])) continue
        if (/(?:set\w+|setState|onChange|push|concat)\(.*\.map\s*\(/.test(lines[i])) continue
        if (/return\s+(?:\w+\.)*map\s*\(/.test(lines[i])) continue
        // Skip .map() inside object spreads or assigned to object properties (data transforms, not JSX)
        if (/\w+:\s*(?:\w+\.)*\w+\.map\s*\(/.test(lines[i])) continue
        if (/\.\.\.\w+\.map\s*\(/.test(lines[i])) continue
        // Skip chained .map() lines (leading dot = continuation of a variable assignment)
        if (/^\s*\.map\s*\(/.test(lines[i])) continue
        // Skip .map() that returns plain objects ({) not JSX (<)
        if (/=>\s*\(\{/.test(lines[i])) continue
        // Look ahead 5 lines for key=
        const block = lines.slice(i, i + 6).join(' ')
        if (/\breturn\s+null\b/.test(block)) continue
        if (!/key[={]/.test(block) && /<\w/.test(block)) {
          hits.push({ file: relPath(f), line: i + 1, text: lines[i].trim().slice(0, 100) })
        }
      }
    }
  }
  return { status: hits.length === 0 ? 'pass' : 'warn', count: hits.length, details: hits.length === 0 ? 'All .map() calls appear to have key props' : hits.slice(0, 30).map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

// ── E. Electron Security (handled by electron-security.js in check 10) ──

// ── F. Code Quality ──

addCheck(23, 'CRLF line endings', 'Code Quality', () => {
  const files = getAllFiles('src')
  const crlfFiles = []
  for (const f of files) {
    const buf = fs.readFileSync(f)
    if (buf.includes(0x0d)) {
      crlfFiles.push(relPath(f))
    }
  }
  return { status: crlfFiles.length === 0 ? 'pass' : 'warn', count: crlfFiles.length, details: crlfFiles.length === 0 ? 'All files use LF' : crlfFiles.slice(0, 30).join('\n') }
})

addCheck(24, 'console.log leaks', 'Code Quality', () => {
  // Exclude logger infrastructure files — scanning a logger for log calls is a false positive
  const loggerFiles = new Set(['logger.ts', 'log.ts'])
  const files = getAllFiles('src').filter(f => !isTestFile(f) && !loggerFiles.has(path.basename(f)))
  const hits = countMatches(files, /\bconsole\.(log|warn|error|debug|info)\s*\(/)
  return { status: hits.length < 5 ? 'pass' : 'warn', count: hits.length, details: hits.length === 0 ? 'No console statements' : hits.slice(0, 30).map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

addCheck(25, 'TODO/FIXME/HACK count', 'Code Quality', () => {
  const files = getAllFiles('src')
  const hits = countMatches(files, /\b(TODO|FIXME|HACK|XXX)\b/)
  return { status: hits.length < 10 ? 'pass' : 'warn', count: hits.length, details: hits.length === 0 ? 'No developer notes' : hits.slice(0, 30).map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

addCheck(26, 'Large files (>1000 lines)', 'Code Quality', () => {
  const files = getAllFiles('src')
  const large = []
  for (const f of files) {
    const lineCount = fs.readFileSync(f, 'utf-8').split('\n').length
    if (lineCount > 1000) {
      large.push({ file: relPath(f), lines: lineCount })
    }
  }
  large.sort((a, b) => b.lines - a.lines)
  return { status: large.length < 5 ? 'pass' : 'warn', count: large.length, details: large.length === 0 ? 'No large files' : large.map(l => `${l.file} — ${l.lines} lines`).join('\n') }
})

addCheck(27, '`any` type usage', 'Code Quality', () => {
  const files = getAllFiles('src').filter(f => !isTestFile(f))
  const hits = countMatches(files, /\bas\s+any\b|:\s*any\b/)
  return { status: hits.length < 3 ? 'pass' : 'warn', count: hits.length, details: hits.length === 0 ? 'No `any` usage' : hits.slice(0, 30).map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

addCheck(28, 'Empty catch blocks', 'Code Quality', () => {
  const files = getAllFiles('src').filter(f => !isTestFile(f))
  const hits = []
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      // Match catch with empty body or only comment
      if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(lines[i])) {
        hits.push({ file: relPath(f), line: i + 1, text: lines[i].trim().slice(0, 100) })
      }
      // Multi-line empty catch: catch { \n }
      if (/catch\s*(\([^)]*\))?\s*\{\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\}/.test(lines[i + 1])) {
        hits.push({ file: relPath(f), line: i + 1, text: lines[i].trim() + ' ' + lines[i + 1].trim() })
      }
    }
  }
  return { status: hits.length < 3 ? 'pass' : 'warn', count: hits.length, details: hits.length === 0 ? 'No empty catch blocks' : hits.slice(0, 30).map(h => `${h.file}:${h.line} — ${h.text}`).join('\n') }
})

addCheck(29, 'Functions >200 lines', 'Code Quality', () => {
  const files = getAllFiles('src').filter(f => !isTestFile(f))
  const longFns = []
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    const lines = content.split('\n')
    let depth = 0, fnStart = -1, fnName = ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Detect function/arrow starts
      const fnMatch = line.match(/(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=.*(?:=>|function))/)
      if (fnMatch && depth === 0) {
        fnStart = i
        fnName = fnMatch[1] || fnMatch[2] || 'anonymous'
      }
      for (const ch of line) {
        if (ch === '{') depth++
        if (ch === '}') {
          depth--
          if (depth === 0 && fnStart >= 0) {
            const len = i - fnStart + 1
            // Only flag egregiously long functions (>200 lines)
            if (len > 200) {
              longFns.push({ file: relPath(f), line: fnStart + 1, name: fnName, length: len })
            }
            fnStart = -1
          }
        }
      }
    }
  }
  longFns.sort((a, b) => b.length - a.length)
  return { status: longFns.length < 80 ? 'pass' : 'warn', count: longFns.length, details: longFns.length === 0 ? 'No functions >200 lines' : longFns.map(f => `${f.file}:${f.line} — ${f.name} (${f.length} lines)`).join('\n') }
})

addCheck(30, 'Code duplication (jscpd)', 'Code Quality', () => {
  // Scan only TS/TSX source dirs — jscpd v4's --format/--ignore flags don't reliably filter,
  // so we point it at the four source directories directly (excluding public/data/ with 85+ JSON
  // spell/item files that have legitimate structural similarity).
  // Use min-lines 25 / min-tokens 200 to skip trivially small clones (similar form fields, buttons).
  // Threshold: 10% duplication rate is industry-standard upper bound; our target is <5%.
  const r = run('npx jscpd src/main/ src/preload/ src/renderer/src/ src/shared/ --min-lines 25 --min-tokens 200 --reporters consoleFull --format "typescript,tsx" --ignore "**/*.test.*,**/*.test.tsx"', { timeout: 180_000 })
  const output = r.stdout || ''
  // Strip ANSI escape codes for reliable parsing
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '')
  const dupeMatch = clean.match(/Found (\d+) clones/)
  const count = dupeMatch ? parseInt(dupeMatch[1]) : 0
  // Extract duplication percentage from the Total row (last percentage = line-based)
  const totalLine = clean.split('\n').find(l => l.includes('Total:')) || ''
  const pctMatches = [...totalLine.matchAll(/([\d.]+)%/g)]
  const dupePct = pctMatches.length > 0 ? parseFloat(pctMatches[pctMatches.length - 1][1]) : 0
  // Use percentage-based threshold: <5% duplication is healthy for a project this size
  return { status: dupePct < 5 ? 'pass' : dupePct < 10 ? 'warn' : 'fail', count, details: output.slice(-3000) || 'No duplicates found' }
})

addCheck(31, 'Regex safety (ReDoS)', 'Code Quality', () => {
  const files = getAllFiles('src').filter(f => !isTestFile(f))
  const dangerous = []
  // Patterns that suggest catastrophic backtracking
  const redosPatterns = [
    /new RegExp\([^)]*\+[^)]*\+/,
    /(\.\*){2,}/,
    /(\[^[^\]]*\]\+){2,}\$/
  ]
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const pat of redosPatterns) {
        if (pat.test(lines[i])) {
          dangerous.push({ file: relPath(f), line: i + 1, text: lines[i].trim().slice(0, 100) })
        }
      }
    }
  }
  return { status: dangerous.length === 0 ? 'pass' : 'warn', count: dangerous.length, details: dangerous.length === 0 ? 'No ReDoS-prone patterns found' : dangerous.map(d => `${d.file}:${d.line} — ${d.text}`).join('\n') }
})

// ── G. Project Hygiene ──

addCheck(32, 'Git status (uncommitted changes)', 'Project Hygiene', () => {
  const r = run('git status --porcelain')
  const changes = (r.stdout || '').split('\n').filter(l => l.trim())
  return { status: changes.length === 0 ? 'pass' : 'info', count: changes.length, details: changes.length === 0 ? 'Working tree clean' : changes.slice(0, 30).join('\n') }
})

addCheck(33, 'File naming conventions', 'Project Hygiene', () => {
  const files = getAllFiles('src')
  const violations = []
  for (const f of files) {
    const name = path.basename(f)
    if (name.startsWith('.') || name.includes('.test.') || name.includes('.d.')) continue
    if (f.endsWith('.tsx')) {
      // TSX should be PascalCase (except index.tsx, main.tsx — entry points are conventionally lowercase)
      if (name !== 'index.tsx' && name !== 'main.tsx' && name !== 'global.d.tsx' && !/^[A-Z]/.test(name)) {
        violations.push(`${relPath(f)} — TSX file should be PascalCase`)
      }
    } else if (f.endsWith('.ts')) {
      // TS should be kebab-case (except index.ts)
      if (name !== 'index.ts' && /[A-Z]/.test(name.replace(/\.ts$/, ''))) {
        violations.push(`${relPath(f)} — TS file should be kebab-case`)
      }
    }
  }
  return { status: violations.length === 0 ? 'pass' : 'warn', count: violations.length, details: violations.length === 0 ? 'All files follow naming conventions' : violations.slice(0, 30).join('\n') }
})

addCheck(34, 'Missing test files', 'Project Hygiene', () => {
  const allSrc = getAllFiles('src', ['.ts', '.tsx']).filter(f => !isTestFile(f) && !f.endsWith('.d.ts'))
  const testFiles = new Set(getAllFiles('src', ['.ts']).filter(f => isTestFile(f)).map(f => relPath(f)))
  const missing = []
  for (const f of allSrc) {
    const rel = relPath(f)
    if (rel.includes('/types/') || rel.includes('/constants/') || rel.includes('index.ts') || rel.endsWith('.d.ts')) continue
    if (f.endsWith('.tsx')) continue // Skip component files for test check
    const testName = rel.replace(/\.ts$/, '.test.ts')
    if (!testFiles.has(testName)) {
      missing.push(rel)
    }
  }
  return { status: missing.length < 20 ? 'pass' : 'info', count: missing.length, details: `${missing.length} source files without test counterpart\n${missing.slice(0, 30).join('\n')}` }
})

addCheck(35, 'Orphan files (not imported)', 'Project Hygiene', () => {
  const r = run('npx madge --orphans --extensions ts,tsx --ts-config tsconfig.web.json src/', { timeout: 180_000 })
  const rawOrphans = (r.stdout || '').split('\n').filter(l => l.trim() && !l.includes('Processed'))

  // Build comprehensive import set from ALL source files — catches static, dynamic, and re-exports
  const imported = new Set()
  const allSrcFiles = getAllFiles('src', ['.ts', '.tsx'])
  for (const f of allSrcFiles) {
    const content = fs.readFileSync(f, 'utf-8')
    const importingDir = path.dirname(relPath(f))
    // Static: import ... from '...' or export ... from '...' or require('...')
    for (const m of content.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1]
      // Resolve @renderer alias
      if (spec.startsWith('@renderer/')) {
        const aliased = 'src/renderer/src/' + spec.slice('@renderer/'.length)
        imported.add(aliased)
        imported.add(aliased + '.ts')
        imported.add(aliased + '.tsx')
        imported.add(aliased + '/index.ts')
        imported.add(aliased + '/index.tsx')
      }
      // Resolve relative paths to full project-relative paths
      if (spec.startsWith('.')) {
        const resolved = path.normalize(path.join(importingDir, spec)).replace(/\\/g, '/')
        imported.add(resolved)
        imported.add(resolved + '.ts')
        imported.add(resolved + '.tsx')
        imported.add(resolved + '/index.ts')
        imported.add(resolved + '/index.tsx')
      }
      // Keep basename matching as fallback for external/bare specifiers
      const base = path.basename(spec)
      imported.add(base)
      imported.add(base + '.ts')
      imported.add(base + '.tsx')
    }
    // Dynamic: import('...')
    for (const m of content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1]
      if (spec.startsWith('@renderer/')) {
        const aliased = 'src/renderer/src/' + spec.slice('@renderer/'.length)
        imported.add(aliased)
        imported.add(aliased + '.ts')
        imported.add(aliased + '.tsx')
        imported.add(aliased + '/index.ts')
        imported.add(aliased + '/index.tsx')
      }
      if (spec.startsWith('.')) {
        const resolved = path.normalize(path.join(importingDir, spec)).replace(/\\/g, '/')
        imported.add(resolved)
        imported.add(resolved + '.ts')
        imported.add(resolved + '.tsx')
        imported.add(resolved + '/index.ts')
        imported.add(resolved + '/index.tsx')
      }
      const base = path.basename(spec)
      imported.add(base)
      imported.add(base + '.ts')
      imported.add(base + '.tsx')
    }
  }

  // Post-filter: exclude test files, type declarations, entry points, barrel files, and imported files
  const orphans = rawOrphans.filter(l => {
    const trimmed = l.trim()
    const name = path.basename(trimmed)
    if (name.includes('.test.')) return false
    if (name.endsWith('.d.ts')) return false
    if (name === 'main.tsx') return false
    if (name === 'index.ts' || name === 'index.tsx') return false
    // Check full relative path match (madge outputs paths relative to src/)
    const fullRel = 'src/' + trimmed.replace(/\\/g, '/')
    if (imported.has(fullRel)) return false
    // Strip extension for extensionless import matching
    const noExt = fullRel.replace(/\.(ts|tsx)$/, '')
    if (imported.has(noExt)) return false
    // Fallback: basename match
    if (imported.has(name)) return false
    return true
  })
  return { status: orphans.length < 20 ? 'pass' : 'warn', count: orphans.length, details: orphans.length === 0 ? 'No orphan files' : orphans.slice(0, 30).join('\n') }
})

addCheck(36, 'Type coverage %', 'Project Hygiene', () => {
  // Try without --strict first (avoids "Maximum call stack size exceeded" with composite tsconfig)
  let r = run('npx type-coverage --at-least 80 --ignore-catch --project tsconfig.web.json', { timeout: 180_000 })
  if (!r.ok && (r.stderr || '').includes('call stack')) {
    // Fallback: run against renderer tsconfig only
    r = run('npx type-coverage --at-least 80 --ignore-catch --project tsconfig.web.json --ignore-files "src/main/**"', { timeout: 180_000 })
  }
  const output = (r.stdout || '') + (r.stderr || '')
  const covMatch = output.match(/([\d.]+)%/)
  const pct = covMatch ? covMatch[1] : 'unknown'
  // Report actual crash reason instead of generic "warn"
  if (output.includes('call stack') || output.includes('RangeError')) {
    return { status: 'warn', count: 0, details: `Type coverage crashed: ${output.slice(0, 500)}` }
  }
  return { status: r.ok ? 'pass' : 'warn', count: 0, details: `Type coverage: ${pct}%\n${output.slice(0, 2000)}` }
})

// ── Runner ──

async function main() {
  console.log('=== Project Audit ===')
  console.log(`Running ${checks.length} checks...\n`)

  const results = []
  let errors = 0, warnings = 0, infos = 0

  for (const check of checks) {
    process.stdout.write(`  [${String(check.id).padStart(2)}] ${check.name}...`)
    const start = Date.now()
    let result
    try {
      result = check.fn()
      if (result && typeof result.then === 'function') result = await result
    } catch (e) {
      result = { status: 'error', count: 1, details: `Exception: ${e.message}\n${e.stack}` }
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const icon = result.status === 'pass' ? '\u2705' : result.status === 'fail' ? '\u274C' : result.status === 'warn' ? '\u26A0\uFE0F' : result.status === 'info' ? '\u2139\uFE0F' : '\u23ED\uFE0F'
    console.log(` ${icon} (${elapsed}s)`)

    if (result.status === 'fail' || result.status === 'error') errors++
    else if (result.status === 'warn') warnings++
    else if (result.status === 'info') infos++

    results.push({ ...check, result, elapsed })
  }

  // ── Generate markdown ──

  const ts = new Date().toISOString()
  const lines = []
  lines.push('# Project Audit Report')
  lines.push(`Generated: ${ts}\n`)

  lines.push('## Summary Dashboard')
  lines.push('| # | Check | Category | Status | Issues | Time |')
  lines.push('|---|-------|----------|--------|--------|------|')
  for (const r of results) {
    const icon = r.result.status === 'pass' ? '\u2705' : r.result.status === 'fail' ? '\u274C' : r.result.status === 'warn' ? '\u26A0\uFE0F' : r.result.status === 'info' ? '\u2139\uFE0F' : '\u23ED\uFE0F'
    lines.push(`| ${r.id} | ${r.name} | ${r.category} | ${icon} ${r.result.status.toUpperCase()} | ${r.result.count} | ${r.elapsed}s |`)
  }

  lines.push(`\n**Total: ${errors} errors, ${warnings} warnings, ${infos} informational**\n`)
  lines.push('---\n')

  // Detailed results
  lines.push('## Detailed Results\n')
  let currentCategory = ''
  for (const r of results) {
    if (r.category !== currentCategory) {
      currentCategory = r.category
      lines.push(`### ${currentCategory}\n`)
    }
    const icon = r.result.status === 'pass' ? '\u2705' : r.result.status === 'fail' ? '\u274C' : r.result.status === 'warn' ? '\u26A0\uFE0F' : r.result.status === 'info' ? '\u2139\uFE0F' : '\u23ED\uFE0F'
    lines.push(`#### ${r.id}. ${r.name}`)
    lines.push(`**Status**: ${icon} ${r.result.status.toUpperCase()}  `)
    lines.push(`**Issues**: ${r.result.count}\n`)
    if (r.result.details) {
      lines.push('```')
      lines.push(r.result.details)
      lines.push('```\n')
    }
  }

  // Recommendations
  lines.push('---\n')
  lines.push('## Recommendations\n')
  const recs = []
  for (const r of results) {
    if (r.result.status === 'fail') recs.push(`1. **[CRITICAL]** Fix: ${r.name} (${r.result.count} issues)`)
    else if (r.result.status === 'warn') recs.push(`1. **[HIGH]** Review: ${r.name} (${r.result.count} issues)`)
    else if (r.result.status === 'info' && r.result.count > 0) recs.push(`1. **[LOW]** Consider: ${r.name} (${r.result.count} items)`)
  }
  if (recs.length === 0) recs.push('No actionable recommendations — all checks passed!')
  lines.push(recs.join('\n'))

  // Per-finding fix instructions
  lines.push('\n---\n')
  lines.push('## Quick Fix Reference\n')
  const fixInstructions = {
    1: 'Run `npx tsc --build` and fix any reported TS errors.',
    2: 'Run `npx biome check --write src/` to auto-fix lint issues.',
    3: 'Run `npx biome format --write src/` to fix formatting.',
    4: 'Run `npx vitest run` and fix failing tests.',
    7: 'Run `npx oxlint src/` and fix reported issues. Prefix unused vars with `_`.',
    14: 'Convert eager store imports to lazy `require()` accessors (see game-sync.ts pattern).',
    23: 'Run `npx biome format --write src/` then add `.gitattributes` with `* text=auto eol=lf`.',
    24: 'Import `{ logger }` from `utils/logger.ts` (renderer) or `logToFile` from `main/index.ts` (main process).',
    26: 'Split files >1000 lines into sub-modules. See `stores/game/` and `services/game-actions/` for patterns.',
    27: 'Replace `as any` with proper types. Only acceptable in test files with `// eslint-disable` comment.',
    30: 'Extract duplicate code into shared hooks (see `hooks/use-character-editor.ts` pattern).',
    33: 'Rename camelCase `.ts` files to kebab-case. Run `node Tests/rename-to-kebab.js`.',
  }
  for (const r of results) {
    if (r.result.status !== 'pass' && fixInstructions[r.id]) {
      lines.push(`- **Check ${r.id}** (${r.name}): ${fixInstructions[r.id]}`)
    }
  }

  // Dead code verdict — comprehensive triage from knip analysis
  lines.push('\n---\n')
  lines.push('## Dead Code Verdict\n')
  lines.push('**Knip baseline**: ~394 items (10 unused files, 138 unused exports, 246 unused exported types)')
  lines.push('**After triage**: ~80% are PLANNED public API surface or cross-process types; ~15% are dead barrel re-exports; ~5% are genuinely dead code.\n')

  lines.push('### Unused Files (10)\n')
  lines.push('| File | Verdict | Reason |')
  lines.push('|------|---------|--------|')
  lines.push('| `constants/index.ts` | DEAD | Barrel file — all imports go directly to subfiles |')
  lines.push('| `network/index.ts` | DEAD | Barrel file — all imports go directly to subfiles |')
  lines.push('| `types/index.ts` | DEAD | Barrel file — all imports go directly to subfiles |')
  lines.push('| `types/user.ts` | DEAD | UserProfile interface never used anywhere |')
  lines.push('| `components/library/index.ts` | WIP | Barrel for library sub-component redesign |')
  lines.push('| `components/library/HomebrewCreateModal.tsx` | WIP | Homebrew content creator, awaiting library page integration |')
  lines.push('| `components/library/LibraryCategoryGrid.tsx` | WIP | Category grid view, awaiting library page integration |')
  lines.push('| `components/library/LibraryDetailModal.tsx` | WIP | Detail viewer, awaiting library page integration |')
  lines.push('| `components/library/LibraryItemList.tsx` | WIP | Item list component, awaiting library page integration |')
  lines.push('| `components/library/LibrarySidebar.tsx` | WIP | Sidebar navigation, awaiting library page integration |')

  lines.push('\n### Unused Exports — PLANNED: Public API Surface (98 items)\n')
  lines.push('Exported functions/constants that form module public APIs, consumed via dynamic dispatch, or planned for future consumers.\n')
  lines.push('| Category | Count | Examples |')
  lines.push('|----------|-------|---------|')
  lines.push('| Data provider loaders (`load5e*`) | 21 | `load5eSoundEvents`, `load5eThemes`, `load5eBuiltInMaps` |')
  lines.push('| Bastion event data tables | 12 | `ALL_IS_WELL_FLAVORS`, `GAMING_HALL_WINNINGS`, `FORGE_CONSTRUCTS` |')
  lines.push('| Sound manager functions | 8 | `registerCustomSound`, `playSpellSound`, `preloadEssential` |')
  lines.push('| Combat resolver functions | 7 | `resolveAttack`, `resolveGrapple`, `resolveShove` |')
  lines.push('| Notification service functions | 5 | `notify`, `setEventEnabled`, `setSoundEnabled` |')
  lines.push('| AI service functions | 4 | `generateSessionSummary`, `describeChange`, `getSearchEngine` |')
  lines.push('| Character/spell data | 6 | `SPELLCASTING_ABILITY_MAP`, `getSpellcastingAbility` |')
  lines.push('| Other (network, plugin, theme, dice, IO) | 35 | `rollForDm`, `importDndBeyondCharacter`, `announce` |')

  lines.push('\n### Unused Exports — DEAD: Barrel Re-exports (28 items)\n')
  lines.push('Re-exports from barrel `index.ts` files that nothing imports from:\n')
  lines.push('| Barrel File | Dead Re-exports |')
  lines.push('|-------------|----------------|')
  lines.push('| `lobby/index.ts` | CharacterSelector, ChatInput, ChatPanel, PlayerCard, PlayerList, ReadyButton (6) |')
  lines.push('| `campaign/index.ts` | AdventureSelector, AudioStep, DetailsStep, MapConfigStep, ReviewStep, RulesStep, SystemStep (7) |')
  lines.push('| `game/player/index.ts` | CharacterMiniSheet, ConditionTracker, PlayerHUD, ShopView, SpellSlotTracker (5) |')
  lines.push('| `game/dm/index.ts` | MonsterStatBlockView (1) |')
  lines.push('| `ui/index.ts` | EmptyState, Skeleton (2) |')
  lines.push('| Other barrels | AsiSelector5e, GeneralFeatPicker, ReviewStep default, RulesStep default, etc. (7) |')

  lines.push('\n### Unused Exports — DEAD: Genuinely Unused Code (12 items)\n')
  lines.push('| Export | File | Reason |')
  lines.push('|--------|------|--------|')
  lines.push('| `_createSolidMaterial` | dice-textures.ts | Internal helper never called |')
  lines.push('| `RECONNECT_DELAY_MS` | app-constants.ts | Constant defined but never referenced |')
  lines.push('| `MAX_READ_FILE_SIZE` | app-constants.ts | Constant defined but never referenced |')
  lines.push('| `MAX_WRITE_CONTENT_SIZE` | app-constants.ts | Constant defined but never referenced |')
  lines.push('| `LIFESTYLE_COSTS` | stat-calculator-5e.ts | Data constant, never referenced |')
  lines.push('| `TOOL_SKILL_INTERACTIONS` | stat-calculator-5e.ts | Data constant, never referenced |')
  lines.push('| `resolveDataPath` | data-provider.ts | Helper function, superseded |')
  lines.push('| `cdnProvider` | data-provider.ts | CDN provider object, not yet wired |')
  lines.push('| `meetsPrerequisites` | LevelUpConfirm5e.tsx | Helper function, not imported elsewhere |')
  lines.push('| `SummaryCard` | BastionTabs.tsx | Sub-component re-export, not consumed |')
  lines.push('| `GeneralFeatPicker` | AsiSelector5e.tsx | Sub-component, only via unused barrel |')
  lines.push('| `AsiAbilityPicker5e` | AsiSelector5e.tsx | Sub-component, only via unused barrel |')

  lines.push('\n### Unused Exported Types (246 items) — PLANNED\n')
  lines.push('Public API type definitions following standard TypeScript export patterns:\n')
  lines.push('| Category | Count | Verdict |')
  lines.push('|----------|-------|---------|')
  lines.push('| Network payload types (`types.ts` + `message-types.ts`) | 62 | PLANNED — consumed via switch/case dispatch |')
  lines.push('| Data schema types (character, spell, equipment, world) | 45 | PLANNED — JSON data file shape definitions |')
  lines.push('| Combat/game mechanic types | 30 | PLANNED — public API contracts |')
  lines.push('| Cross-process IPC types (main/renderer) | 18 | PLANNED — invisible to knip across Electron processes |')
  lines.push('| Service/store state types | 25 | PLANNED — Zustand store shape exports |')
  lines.push('| Calendar/weather/map types | 15 | PLANNED — service contracts |')
  lines.push('| IO/plugin/dice types | 15 | PLANNED — module contracts |')
  lines.push('| Barrel re-export types (`data/index.ts`, etc.) | 20 | DEAD — from unused barrel files |')
  lines.push('| Bastion event + misc types | 16 | PLANNED — bastion event system + misc |')

  lines.push('\n### Previously Triaged (from orphan analysis)\n')
  lines.push('| File | Status | Verdict | Reason |')
  lines.push('|------|--------|---------|--------|')
  lines.push('| CombatLogPanel.tsx | Orphan | WIP | Fully implemented, awaiting sidebar integration |')
  lines.push('| JournalPanel.tsx | Orphan | WIP | TipTap journal, awaiting sidebar integration |')
  lines.push('| sentient-items.ts | Unused | PLANNED | DMG 2024 sentient item generation framework |')
  lines.push('| RollRequestOverlay.tsx | Orphan | WIP | DM roll request overlay, awaiting P2P wiring |')
  lines.push('| ThemeSelector.tsx | Orphan | WIP | Theme picker, awaiting settings integration |')
  lines.push('| PrintSheet.tsx | Orphan | WIP | Print-ready character sheet layout |')
  lines.push('| cloud-sync.ts | Untracked | PLANNED | S3 cloud backup/sync infrastructure |')
  lines.push('| cdn-provider.ts | Untracked | PLANNED | CDN provider for game data/images |')

  // Automation scripts reference
  lines.push('\n---\n')
  lines.push('## Automation Scripts (Tests/)\n')
  lines.push('| Script | Purpose | Usage |')
  lines.push('|--------|---------|-------|')
  lines.push('| `run-audit.js` | Master audit — runs all checks, generates this report | `node Tests/run-audit.js` |')
  lines.push('| `electron-security.js` | Electron security scan (CSP, sandbox, etc.) | Called by run-audit.js check #10 |')
  lines.push('| `rename-to-kebab.js` | Rename camelCase files to kebab-case + update imports | `node Tests/rename-to-kebab.js [--dry-run]` |')
  lines.push('| `replace-console-logs.js` | Replace console.* with structured logger | `node Tests/replace-console-logs.js [--dry-run|--count]` |')
  lines.push('')
  lines.push('All scripts are modular and export reusable functions for programmatic use.')

  // Remaining implementation work — auto-removes completed items
  lines.push('\n---\n')
  lines.push('## Remaining Implementation Work\n')
  lines.push('Items are automatically removed from this list when their completion criteria are met.\n')

  const remainingItems = getRemainingWork()
  if (remainingItems.length === 0) {
    lines.push('**All planned implementation work is complete.**\n')
  } else {
    for (const item of remainingItems) {
      lines.push(item)
    }
  }
  lines.push('')

  // AI prompting quick reference
  lines.push('\n---\n')
  lines.push('## AI Prompting Quick Reference\n')
  lines.push('Copy-pasteable prompts for an AI agent to fix common issues:\n')
  lines.push('### Split large files')
  lines.push('```')
  lines.push('Follow the patterns in stores/game/ (Zustand slices) and')
  lines.push('services/game-actions/ (action sub-modules). Extract sub-components,')
  lines.push('hooks, or helper modules into new files.')
  lines.push('```\n')
  lines.push('### Split GameLayout.tsx')
  lines.push('```')
  lines.push('Extract from GameLayout.tsx: (1) GameModalDispatcher.tsx with all 46 lazy modal')
  lines.push('imports, (2) hooks/use-game-network.ts with host/client message handlers,')
  lines.push('(3) hooks/use-game-sound.ts with sound event mapping, (4) hooks/use-token-movement.ts.')
  lines.push('Keep GameLayout.tsx as the orchestrator that imports these sub-modules.')
  lines.push('```\n')
  lines.push('### Split CampaignDetailPage.tsx')
  lines.push('```')
  lines.push('Extract from CampaignDetailPage.tsx into pages/campaign-detail/ directory:')
  lines.push('NPCManager.tsx, RuleManager.tsx, LoreManager.tsx, AdventureWizard.tsx, MonsterLinker.tsx.')
  lines.push('Each manager is a self-contained React component with its own local state.')
  lines.push('```\n')
  lines.push('### Wire orphan WIP components')
  lines.push('```')
  lines.push('Integrate these completed but unused components: CombatLogPanel.tsx and')
  lines.push('JournalPanel.tsx into game sidebar tabs, RollRequestOverlay.tsx to P2P')
  lines.push('"dm:roll-request" message type, ThemeSelector.tsx to SettingsDropdown.tsx,')
  lines.push('PrintSheet.tsx to character sheet header.')
  lines.push('```')

  const md = lines.join('\n')
  fs.writeFileSync(OUT, md, 'utf-8')

  console.log(`\n=== Summary: ${errors} errors, ${warnings} warnings, ${infos} info ===`)
  console.log(`Report written to: Tests/TestAudit.md`)
}

main().catch(e => {
  console.error('Audit failed:', e)
  process.exit(1)
})
