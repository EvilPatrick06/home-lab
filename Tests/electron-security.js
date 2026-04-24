/**
 * Electron Security Scanner
 * Scans main process, preload, and IPC files for security issues.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function readFile(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) return null
  return fs.readFileSync(full, 'utf-8')
}

function readAllTsFiles(dir) {
  const results = []
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) return results
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isFile() && /\.(ts|tsx|js)$/.test(entry.name)) {
      results.push({
        path: path.join(dir, entry.name),
        content: fs.readFileSync(path.join(full, entry.name), 'utf-8')
      })
    } else if (entry.isDirectory()) {
      results.push(...readAllTsFiles(path.join(dir, entry.name)))
    }
  }
  return results
}

/** Check 23: nodeIntegration must be false */
function checkNodeIntegration(mainContent) {
  const issues = []
  if (/nodeIntegration\s*:\s*true/.test(mainContent)) {
    issues.push('CRITICAL: nodeIntegration is set to true')
  }
  if (!/nodeIntegration\s*:\s*false/.test(mainContent)) {
    issues.push('WARNING: nodeIntegration: false not explicitly set')
  }
  return {
    name: 'nodeIntegration must be false',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 24: contextIsolation must be true */
function checkContextIsolation(mainContent) {
  const issues = []
  if (/contextIsolation\s*:\s*false/.test(mainContent)) {
    issues.push('CRITICAL: contextIsolation is set to false')
  }
  if (!/contextIsolation\s*:\s*true/.test(mainContent)) {
    issues.push('WARNING: contextIsolation: true not explicitly set')
  }
  return {
    name: 'contextIsolation must be true',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 25: sandbox must be true */
function checkSandbox(mainContent) {
  const issues = []
  if (/sandbox\s*:\s*false/.test(mainContent)) {
    issues.push('CRITICAL: sandbox is set to false')
  }
  if (!/sandbox\s*:\s*true/.test(mainContent)) {
    issues.push('WARNING: sandbox: true not explicitly set')
  }
  return {
    name: 'sandbox must be true',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 26: CSP headers present */
function checkCSP(mainContent) {
  const issues = []
  const hasCSP = /Content-Security-Policy/.test(mainContent)
  if (!hasCSP) {
    issues.push('CRITICAL: No Content-Security-Policy found in main process')
  }
  // Check for unsafe-inline or unsafe-eval in CSP
  const cspMatch = mainContent.match(/Content-Security-Policy[^"]*"([^"]+)"/)
  if (cspMatch) {
    const csp = cspMatch[1]
    if (csp.includes("'unsafe-inline'")) {
      issues.push("WARNING: CSP contains 'unsafe-inline'")
    }
    if (csp.includes("'unsafe-eval'")) {
      issues.push("CRITICAL: CSP contains 'unsafe-eval'")
    }
  }
  return {
    name: 'CSP headers present',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 27: webSecurity not disabled */
function checkWebSecurity(mainContent) {
  const issues = []
  if (/webSecurity\s*:\s*false/.test(mainContent)) {
    issues.push('CRITICAL: webSecurity is set to false')
  }
  return {
    name: 'webSecurity not disabled',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 28: shell.openExternal validated */
function checkOpenExternal(mainContent) {
  const issues = []
  const hasOpenExternal = /shell\.openExternal/.test(mainContent)
  if (hasOpenExternal) {
    // Check if there's URL validation before openExternal
    const hasURLValidation = /new URL\(/.test(mainContent)
    const hasProtocolCheck = /protocol\s*===\s*['"]https:['"]/.test(mainContent)
    if (!hasURLValidation && !hasProtocolCheck) {
      issues.push('WARNING: shell.openExternal called without URL validation')
    }
  }
  return {
    name: 'shell.openExternal validated',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 29: IPC channel validation */
function checkIpcChannels(ipcFiles, channelsContent) {
  const issues = []

  // Extract defined channels from ipc-channels.ts
  const definedChannels = new Set()
  const channelMatches = channelsContent.matchAll(/:\s*'([^']+)'/g)
  for (const m of channelMatches) {
    definedChannels.add(m[1])
  }

  // Find all ipcMain.handle calls
  for (const file of ipcFiles) {
    // Find string-literal channel registrations not using IPC_CHANNELS constant
    const literalHandles = file.content.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)
    for (const m of literalHandles) {
      const channel = m[1]
      if (!definedChannels.has(channel)) {
        issues.push(`WARNING: Unregistered IPC channel '${channel}' in ${file.path}`)
      } else {
        issues.push(`INFO: Hardcoded channel '${channel}' in ${file.path} — prefer IPC_CHANNELS constant`)
      }
    }
  }

  return {
    name: 'IPC channel validation',
    status: issues.filter(i => i.startsWith('WARNING') || i.startsWith('CRITICAL')).length === 0 ? 'pass' : 'warn',
    issues
  }
}

/** Check 30: No allowRunningInsecureContent */
function checkInsecureContent(mainContent) {
  const issues = []
  if (/allowRunningInsecureContent\s*:\s*true/.test(mainContent)) {
    issues.push('CRITICAL: allowRunningInsecureContent is set to true')
  }
  return {
    name: 'No allowRunningInsecureContent',
    status: issues.length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Check 31: Preload script isolation */
function checkPreloadIsolation(preloadContent) {
  const issues = []
  if (!preloadContent) {
    issues.push('ERROR: Could not read preload script')
    return { name: 'Preload script isolation', status: 'fail', issues }
  }

  const usesContextBridge = /contextBridge\.exposeInMainWorld/.test(preloadContent)
  if (!usesContextBridge) {
    issues.push('CRITICAL: Preload does not use contextBridge.exposeInMainWorld')
  }

  // Check for dangerous patterns in preload
  if (/require\s*\(\s*['"]child_process/.test(preloadContent)) {
    issues.push('CRITICAL: Preload imports child_process')
  }
  if (/require\s*\(\s*['"]fs['"]/.test(preloadContent)) {
    issues.push('WARNING: Preload directly imports fs module')
  }

  // Verify contextIsolated check
  const hasIsolationCheck = /process\.contextIsolated/.test(preloadContent)
  if (!hasIsolationCheck) {
    issues.push('INFO: No contextIsolated runtime check in preload')
  }

  return {
    name: 'Preload script isolation',
    status: issues.filter(i => i.startsWith('CRITICAL')).length === 0 ? 'pass' : 'fail',
    issues
  }
}

/** Run all Electron security checks */
function runElectronSecurity() {
  const results = []

  const mainContent = readFile('src/main/index.ts')
  if (!mainContent) {
    return [{
      name: 'Electron main process',
      status: 'fail',
      issues: ['ERROR: Could not read src/main/index.ts']
    }]
  }

  const preloadContent = readFile('src/preload/index.ts')
  const channelsContent = readFile('src/shared/ipc-channels.ts') || ''
  const ipcFiles = readAllTsFiles('src/main/ipc')

  results.push(checkNodeIntegration(mainContent))
  results.push(checkContextIsolation(mainContent))
  results.push(checkSandbox(mainContent))
  results.push(checkCSP(mainContent))
  results.push(checkWebSecurity(mainContent))
  results.push(checkOpenExternal(mainContent))
  results.push(checkIpcChannels(ipcFiles, channelsContent))
  results.push(checkInsecureContent(mainContent))
  results.push(checkPreloadIsolation(preloadContent))

  return results
}

module.exports = { runElectronSecurity }
