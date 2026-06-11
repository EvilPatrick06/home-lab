import { execFile, execSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { app } from 'electron'
import { getOllamaUrl, listOllamaModels } from './ollama-client'
import { OLLAMA_BASE_URL } from './ollama-constants'
import { getOllamaKvCacheType } from './ollama-context'

// CURATED_MODELS + CuratedModel moved to ./ollama-context (leaf) in PHASE-01 so
// the num_ctx resolver can read them without an import cycle. Re-exported here so
// existing `import { CURATED_MODELS, type CuratedModel } from './ollama-manager'`
// call sites (ai-handlers) keep working.
export { CURATED_MODELS, type CuratedModel } from './ollama-context'
// Re-exported from the leaf so existing `import { OLLAMA_BASE_URL } from './ollama-manager'`
// call sites (ai-service) keep working without re-introducing the ollama-client cycle.
export { OLLAMA_BASE_URL }

export interface OllamaStatus {
  installed: boolean
  running: boolean
  path?: string
}

export interface VramInfo {
  totalMB: number
}

export type PerformanceTier = 'optimal' | 'good' | 'limited' | 'insufficient'

export function getPerformanceTier(systemVramMb: number, modelVramMb: number): PerformanceTier {
  const ratio = systemVramMb / modelVramMb
  if (ratio >= 2) return 'optimal'
  if (ratio >= 1.2) return 'good'
  if (ratio >= 0.8) return 'limited'
  return 'insufficient'
}

export interface InstalledModelInfo {
  name: string
  size: number
  modifiedAt: string
  digest: string
  parameterSize?: string
  quantization?: string
  family?: string
}

export interface OllamaVersionInfo {
  installed: string
  latest?: string
  updateAvailable: boolean
}

/**
 * Per-platform standard install locations for Ollama.
 *
 * - Windows: `LOCALAPPDATA/Programs/Ollama/ollama.exe`, `Program Files`, etc.
 * - Linux: `/usr/local/bin/ollama` (the official install script's default),
 *   `/usr/bin/ollama` (some distros), `~/.local/bin/ollama` (user-scoped).
 * - macOS: `/usr/local/bin/ollama`, `/opt/homebrew/bin/ollama` (Apple Silicon
 *   Homebrew), `/Applications/Ollama.app/Contents/Resources/ollama` (the
 *   official .app bundle).
 */
function getPlatformInstallCandidates(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    return [
      join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
      join(programFiles, 'Ollama', 'ollama.exe'),
      join(localAppData, 'Ollama', 'ollama.exe')
    ]
  }
  if (process.platform === 'darwin') {
    const home = process.env.HOME || ''
    return [
      '/usr/local/bin/ollama',
      '/opt/homebrew/bin/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
      join(home, '.local', 'bin', 'ollama')
    ]
  }
  // Linux + other POSIX
  const home = process.env.HOME || ''
  return ['/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/ollama/bin/ollama', join(home, '.local', 'bin', 'ollama')]
}

/**
 * Detect whether Ollama is installed and running.
 *
 * Checks (in order):
 *   1. Per-platform standard install paths
 *   2. PATH lookup (`where ollama` on Windows, `command -v ollama` elsewhere)
 *   3. Running server on `OLLAMA_BASE_URL`
 *
 * Phase 14a — the previous "bundled binary" check was removed: Ollama is no
 * longer shipped inside the installer (it bloated the Windows build to ~1.7 GB).
 * Ollama is installed via the in-app flow (`downloadOllama`/`installOllama`) and
 * detected here from system paths.
 */
// PHASE-03 — registry operations (pull/delete/list-details) follow the CONFIGURED
// server URL (getOllamaUrl); binary-lifecycle operations (detect/start/stop/version/
// update) always target localhost because they manage the locally installed binary.
export async function detectOllama(): Promise<OllamaStatus> {
  let installed = false
  let path: string | undefined

  // 1. Check per-platform system install paths
  if (!installed) {
    const candidates = getPlatformInstallCandidates()

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        installed = true
        path = candidate
        break
      }
    }
  }

  // 3. Try the PATH-resolution helper for the current platform
  if (!installed) {
    try {
      const lookupCmd = process.platform === 'win32' ? 'where ollama' : 'command -v ollama'
      const result = execSync(lookupCmd, { encoding: 'utf-8', timeout: 5000 }).trim()
      if (result) {
        installed = true
        path = result.split('\n')[0].trim()
      }
    } catch {
      // Not found
    }
  }

  // Check if running
  let running = false
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    })
    running = res.ok
    if (running) installed = true // If running, it's definitely installed
  } catch {
    // Not running
  }

  return { installed, running, path }
}

/**
 * Get system VRAM info (NVIDIA only).
 */
export async function getSystemVram(): Promise<VramInfo> {
  try {
    const result = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', {
      encoding: 'utf-8',
      timeout: 5000
    })
    const totalMB = parseInt(result.trim().split('\n')[0], 10)
    if (!Number.isNaN(totalMB)) {
      return { totalMB }
    }
  } catch {
    // No NVIDIA GPU or nvidia-smi not found
  }

  return { totalMB: 0 }
}

/**
 * Phase 14b — sentinels returned by `downloadOllama` for platforms that install in a single
 * step (no discrete .exe download). `installOllama` branches on them. Indeterminate progress
 * (`onProgress(-1)`) tells the UI to show a spinner, not a fake percentage bar.
 */
const LINUX_INSTALL_MARKER = '__ollama_linux_install_script__'
const MACOS_BREW_MARKER = '__ollama_macos_brew__'

/** True if a `brew` binary is on PATH (macOS best-effort install). */
function hasBrew(): boolean {
  try {
    execSync('command -v brew', { encoding: 'utf-8', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Download/prepare the Ollama install for the current platform (Phase 14b — cross-platform).
 *
 * - **Windows:** download the signed `OllamaSetup.exe` to the app temp dir (with progress %),
 *   return its path for `installOllama` to run.
 * - **Linux:** no discrete download — the official `install.sh` fetches + installs in one shot
 *   (run by `installOllama`). Returns `LINUX_INSTALL_MARKER`; emits indeterminate progress.
 * - **macOS (best-effort, not a shipped target):** if Homebrew is present, return
 *   `MACOS_BREW_MARKER`; otherwise throw an actionable message pointing at ollama.com/download.
 */
export async function downloadOllama(onProgress?: (percent: number) => void): Promise<string> {
  if (process.platform === 'linux') {
    onProgress?.(-1) // indeterminate — install.sh has no parseable progress
    return LINUX_INSTALL_MARKER
  }
  if (process.platform === 'darwin') {
    if (hasBrew()) {
      onProgress?.(-1)
      return MACOS_BREW_MARKER
    }
    throw new Error(
      'On macOS, install Ollama from https://ollama.com/download (or `brew install ollama`), ' +
        "then restart this app — it'll auto-detect the installed binary."
    )
  }
  const url = 'https://ollama.com/download/OllamaSetup.exe'
  const tempDir = app.getPath('temp')
  const destPath = join(tempDir, 'OllamaSetup.exe')

  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download Ollama: HTTP ${res.status}`)
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
  let downloaded = 0

  const fileStream = createWriteStream(destPath)
  const reader = res.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    fileStream.write(Buffer.from(value))
    downloaded += value.length

    if (contentLength > 0 && onProgress) {
      onProgress(Math.round((downloaded / contentLength) * 100))
    }
  }

  fileStream.end()
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
  })

  return destPath
}

/**
 * Run a hardcoded, official install command through the shell, capturing stderr for errors.
 * The command is a fixed constant (no caller-supplied URL/args) — no arbitrary execution.
 */
function runOfficialInstall(command: string): Promise<void> {
  return new Promise((res, reject) => {
    execFile('sh', ['-c', command], { timeout: 300000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`Ollama installation failed: ${stderr?.trim() || error.message}`))
      } else {
        res()
      }
    })
  })
}

/**
 * Install Ollama for the current platform (Phase 14b — cross-platform).
 *
 * - **Windows:** run the downloaded `OllamaSetup.exe /SILENT /NORESTART`. The installer path
 *   MUST be under the app temp dir and end in `.exe` (security guard — no arbitrary exec).
 * - **Linux:** run the official `curl -fsSL https://ollama.com/install.sh | sh` (fixed HTTPS URL).
 * - **macOS (best-effort):** `brew install ollama`.
 */
export async function installOllama(installerPath: string): Promise<void> {
  if (process.platform === 'linux') {
    if (installerPath !== LINUX_INSTALL_MARKER) throw new Error('Unexpected Linux install marker')
    return runOfficialInstall('curl -fsSL https://ollama.com/install.sh | sh')
  }
  if (process.platform === 'darwin') {
    if (installerPath !== MACOS_BREW_MARKER) throw new Error('Unexpected macOS install marker')
    return runOfficialInstall('brew install ollama')
  }
  const resolvedPath = resolve(installerPath)
  const tempDir = resolve(app.getPath('temp'))
  const rel = relative(tempDir, resolvedPath)
  if (!rel || rel.startsWith('..') || rel.includes('..')) {
    throw new Error('Access denied: installer path must be within the app temp directory')
  }
  if (!resolvedPath.toLowerCase().endsWith('.exe')) {
    throw new Error('Access denied: installer must be an .exe file')
  }

  return new Promise((res, reject) => {
    execFile(resolvedPath, ['/SILENT', '/NORESTART'], { timeout: 120000 }, (error) => {
      if (error) {
        reject(new Error(`Ollama installation failed: ${error.message}`))
      } else {
        res()
      }
    })
  })
}

/**
 * Start the Ollama server as a background process.
 */
export async function startOllama(): Promise<void> {
  // First check if already running
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000)
    })
    if (res.ok) return // Already running
  } catch {
    // Not running, proceed to start
  }

  // Find ollama executable
  const status = await detectOllama()
  const ollamaPath = status.path

  if (!ollamaPath) {
    throw new Error('Ollama executable not found')
  }

  // Spawn detached process. On a machine with a dedicated NVIDIA GPU, force Ollama's
  // Vulkan backend off so it uses the discrete CUDA GPU. Vulkan (enabled via
  // OLLAMA_VULKAN in the user's environment) can enumerate an integrated GPU — e.g.
  // Intel Arc on hybrid laptops, even mislabeled type=discrete — and run the model
  // there, where the runner crashes on large prefills ("connection forcibly closed by
  // the remote host") and is far slower. Only override when an NVIDIA GPU is present so
  // AMD/Apple/Vulkan-only setups keep their working backend.
  const nvidiaPresent = (await getSystemVram()).totalMB > 0
  // Opt-in KV-cache quantization (PHASE-01 01E): flash attention is its prerequisite,
  // so both are set together — only when a type is configured, and only for a server
  // THIS app spawns (an already-running/system Ollama is unaffected until restarted here).
  const kv = getOllamaKvCacheType()
  const tuningEnv = kv ? { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: kv } : {}
  const child = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ...(nvidiaPresent ? { OLLAMA_VULKAN: '0' } : {}), ...tuningEnv }
  })
  child.unref()

  // Poll until responsive
  const maxWait = 15000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      })
      if (res.ok) return
    } catch {
      // Keep polling
    }
  }

  throw new Error('Ollama server failed to start within 15 seconds')
}

/** True when the environment will push Ollama onto its Vulkan backend, which on hybrid
 * laptops can select the integrated GPU instead of the discrete one. */
function envPrefersVulkan(): boolean {
  const v = (process.env.OLLAMA_VULKAN ?? '').trim().toLowerCase()
  return v !== '' && v !== '0' && v !== 'false' && v !== 'no' && v !== 'off'
}

let dedicatedGpuRestartAttempted = false

/**
 * Stop any running Ollama server (and, on Windows, the tray supervisor that may respawn
 * it). Best-effort: ignores "not running" errors and waits for the port to free up.
 */
export async function stopOllama(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /T /IM "ollama app.exe"', { timeout: 8000, stdio: 'ignore' })
    }
  } catch {
    // tray not running
  }
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM ollama.exe', { timeout: 8000, stdio: 'ignore' })
    } else {
      execSync('pkill -f "ollama serve"', { timeout: 8000, stdio: 'ignore' })
    }
  } catch {
    // server already down
  }
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(1000) })
      await new Promise((r) => setTimeout(r, 300))
    } catch {
      return
    }
  }
}

/**
 * On a machine with a dedicated NVIDIA GPU, make sure Ollama actually uses it. When the
 * environment prefers Vulkan AND a discrete NVIDIA GPU is present, restart Ollama once
 * with Vulkan disabled (startOllama forces it off) so the model runs on the dedicated
 * GPU instead of the integrated one (where the runner crashes on large prefills and is
 * far slower). No-ops when there is no NVIDIA GPU (don't disturb iGPU-only or AMD/Apple
 * setups), when Ollama isn't installed, or once already handled this run.
 */
export async function ensureOllamaUsesDedicatedGpu(): Promise<boolean> {
  if (dedicatedGpuRestartAttempted) return false
  if (!envPrefersVulkan()) return false
  if ((await getSystemVram()).totalMB <= 0) return false
  if (!(await detectOllama()).installed) return false
  dedicatedGpuRestartAttempted = true
  await stopOllama()
  await startOllama()
  return true
}

/**
 * Pull a model via Ollama's API with streaming progress.
 */
export async function pullModel(model: string, onProgress?: (percent: number) => void): Promise<void> {
  const res = await fetch(`${getOllamaUrl()}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true })
  })

  if (!res.ok || !res.body) {
    throw new Error(`Failed to pull model: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const data = JSON.parse(trimmed) as {
          status?: string
          total?: number
          completed?: number
          error?: string
        }

        if (data.error) {
          throw new Error(`Model pull failed: ${data.error}`)
        }

        if (data.total && data.completed && onProgress) {
          onProgress(Math.round((data.completed / data.total) * 100))
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Model pull failed')) throw e
        // Skip malformed JSON
      }
    }
  }
}

/**
 * List installed Ollama models.
 */
export async function listInstalledModels(): Promise<string[]> {
  return listOllamaModels()
}

/**
 * List installed models with full detail (size, digest, family, etc.).
 */
export async function listInstalledModelsDetailed(): Promise<InstalledModelInfo[]> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      models?: Array<{
        name: string
        size: number
        modified_at: string
        digest: string
        details?: {
          parameter_size?: string
          quantization_level?: string
          family?: string
        }
      }>
    }
    return (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      digest: m.digest,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
      family: m.details?.family
    }))
  } catch {
    return []
  }
}

/**
 * Get the installed Ollama version from the local API.
 */
export async function getOllamaVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      signal: AbortSignal.timeout(3000)
    })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

/**
 * Check whether a newer Ollama release is available on GitHub.
 */
export async function checkOllamaUpdate(): Promise<OllamaVersionInfo> {
  const installed = await getOllamaVersion()
  if (!installed) {
    return { installed: 'unknown', updateAvailable: false }
  }

  try {
    const res = await fetch('https://api.github.com/repos/ollama/ollama/releases/latest', {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/vnd.github.v3+json' }
    })
    if (!res.ok) {
      return { installed, updateAvailable: false }
    }
    const data = (await res.json()) as { tag_name?: string }
    const latest = data.tag_name?.replace(/^v/, '') ?? null
    if (!latest) {
      return { installed, updateAvailable: false }
    }
    return {
      installed,
      latest,
      updateAvailable: compareVersions(latest, installed) > 0
    }
  } catch {
    return { installed, updateAvailable: false }
  }
}

/**
 * Download and install the latest Ollama release.
 */
export async function updateOllama(onProgress?: (percent: number) => void): Promise<void> {
  const installerPath = await downloadOllama(onProgress)
  await installOllama(installerPath)
}

/**
 * Delete a model via the Ollama API.
 */
export async function deleteModel(model: string): Promise<void> {
  const res = await fetch(`${getOllamaUrl()}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to delete model ${model}: HTTP ${res.status} ${body}`)
  }
}
