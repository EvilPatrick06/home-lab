import { execFile, execSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { app } from 'electron'
import { listOllamaModels } from './ollama-client'

export const OLLAMA_BASE_URL = 'http://localhost:11434'

export interface OllamaStatus {
  installed: boolean
  running: boolean
  path?: string
}

export interface VramInfo {
  totalMB: number
}

export interface CuratedModel {
  id: string
  name: string
  vramMB: number
  contextSize: number
  desc: string
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

export const CURATED_MODELS: CuratedModel[] = [
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    vramMB: 2500,
    contextSize: 8192,
    desc: 'Lightweight, great for weaker GPUs'
  },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', vramMB: 5000, contextSize: 8192, desc: 'Good quality, runs on most GPUs' },
  { id: 'mistral:7b', name: 'Mistral 7B', vramMB: 4500, contextSize: 8192, desc: 'Fast and capable' },
  { id: 'gemma2:9b', name: 'Gemma 2 9B', vramMB: 6000, contextSize: 8192, desc: 'High quality from Google' },
  { id: 'phi3:14b', name: 'Phi-3 14B', vramMB: 8000, contextSize: 4096, desc: 'Strong reasoning from Microsoft' },
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', vramMB: 5000, contextSize: 8192, desc: 'Versatile and capable' },
  { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', vramMB: 5000, contextSize: 8192, desc: 'Excellent reasoning skills' },
  {
    id: 'mixtral:8x7b',
    name: 'Mixtral 8x7B',
    vramMB: 26000,
    contextSize: 4096,
    desc: 'Mixture of experts, great quality'
  },
  {
    id: 'command-r:35b',
    name: 'Command R 35B',
    vramMB: 20000,
    contextSize: 4096,
    desc: 'RAG-optimized, great for DM context'
  },
  {
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B',
    vramMB: 40000,
    contextSize: 4096,
    desc: 'Best quality, needs powerful GPU'
  }
]

/**
 * Get the bundled Ollama path (shipped inside the app's resources directory).
 * Returns the path if the bundled binary exists, undefined otherwise.
 */
function getBundledOllamaPath(): string | undefined {
  // In production, electron-builder's per-platform `extraResources` flattens
  //   resources/ollama/{linux,windows}/{ollama,ollama.exe}
  // into the installed app's resources tree, so the runtime path is just
  //   process.resourcesPath/ollama/{ollama,ollama.exe}
  // In dev, scripts/build/fetch-ollama.mjs writes the per-platform tree to
  //   dnd-app/resources/ollama/{linux,windows}/{ollama,ollama.exe}
  const ollamaName = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  const platformDir = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
  const resourcePaths = [
    // Packaged build — flat layout from extraResources `to: ollama/`
    join(process.resourcesPath ?? '', 'ollama', ollamaName),
    // Dev — fetch-ollama.mjs writes the per-platform layout
    join(app.getAppPath(), 'resources', 'ollama', platformDir, ollamaName)
  ]

  for (const candidate of resourcePaths) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
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
  return [
    '/usr/local/bin/ollama',
    '/usr/bin/ollama',
    '/opt/ollama/bin/ollama',
    join(home, '.local', 'bin', 'ollama')
  ]
}

/**
 * Detect whether Ollama is installed and running.
 *
 * Checks (in order):
 *   1. Bundled binary (shipped inside the installer's resources)
 *   2. Per-platform standard install paths
 *   3. PATH lookup (`where ollama` on Windows, `which ollama` elsewhere)
 *   4. Running server on `OLLAMA_BASE_URL`
 */
export async function detectOllama(): Promise<OllamaStatus> {
  let installed = false
  let path: string | undefined

  // 1. Check for bundled Ollama binary (shipped with installer)
  const bundledPath = getBundledOllamaPath()
  if (bundledPath) {
    installed = true
    path = bundledPath
  }

  // 2. Check per-platform system install paths
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
 * Download the Ollama installer for Windows.
 *
 * Linux and macOS: errors out with an actionable message. Those platforms have
 * one-line install scripts (`curl -fsSL https://ollama.com/install.sh | sh`) and
 * package-manager paths (Homebrew on macOS) that don't fit the .exe-installer
 * model the renderer's "Install Ollama" button assumes. Users on those
 * platforms install Ollama themselves; the in-app *detect* path then picks it
 * up automatically.
 */
export async function downloadOllama(onProgress?: (percent: number) => void): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error(
      'Ollama installer download is Windows-only. ' +
        'On Linux: run `curl -fsSL https://ollama.com/install.sh | sh`. ' +
        'On macOS: install the Ollama.app from https://ollama.com/download or `brew install ollama`. ' +
        "Then restart this app — it'll auto-detect the installed binary."
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

  // eslint-disable-next-line no-constant-condition
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
 * Run the Ollama silent installer.
 * Only accepts paths under the app's temp directory to prevent arbitrary execution.
 * Windows-only — see `downloadOllama` for the rationale.
 */
export async function installOllama(installerPath: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error(
      'Ollama silent install is Windows-only. ' +
        'See downloadOllama() error for per-platform install steps.'
    )
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

  // Spawn detached process
  const child = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
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

/**
 * Pull a model via Ollama's API with streaming progress.
 */
export async function pullModel(model: string, onProgress?: (percent: number) => void): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
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

  // eslint-disable-next-line no-constant-condition
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
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
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
  const res = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to delete model ${model}: HTTP ${res.status} ${body}`)
  }
}
