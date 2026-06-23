import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { app } from 'electron'
// `extract-zip` (yauzl under the hood) — cross-platform, zip-slip-protected,
// no shell exec. Was previously a transitive dep of electron-builder; we
// promote it to a direct prod dep so behavior is stable across upgrades.
import extract from 'extract-zip'
import { logToFile } from '../log'
import { isPathInside } from '../path-guard'
import { logSecurityEvent } from '../security-log'
import type { StorageResult } from '../storage/types'
import { removePluginConfig } from './plugin-config'
import { getPluginsDir, validateManifest } from './plugin-scanner'

// Phase 20d — plugin integrity hardening (defense-in-depth on top of
// extract-zip's zip-slip protection).
const MAX_PLUGIN_ZIP_BYTES = 50 * 1024 * 1024
const ALLOWED_PLUGIN_EXTENSIONS = new Set([
  '.json',
  '.js',
  '.ts',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.md',
  '.txt',
  '.woff',
  '.woff2'
])

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })
  // `extract-zip` resolves entries against `dir` and rejects any whose
  // resolved path escapes (zip-slip protection — see yauzl docs / the
  // CVE-2018-1002201 family). No shell exec → no shell-injection surface
  // even if `zipPath` contains shell metacharacters from a Linux/macOS
  // file dialog (filename can contain `"`, `;`, `$`, `\`` etc. on POSIX).
  await extract(zipPath, { dir: resolve(destDir) })
}

/** Phase 20d — sha256 of the source archive, for the audit log + optional manifest pin. */
async function computeChecksum(zipPath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(zipPath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolvePromise())
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

/** Phase 20d — reject extracted files with a disallowed extension or `..` in the path. */
async function assertAllowedEntries(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.includes('..')) return entry.name
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const bad = await assertAllowedEntries(full)
      if (bad) return bad
    } else if (!ALLOWED_PLUGIN_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      return entry.name
    }
  }
  return null
}

/**
 * Install a plugin from a .zip or .dndpack file.
 * Extracts to userData/plugins/<id>/ and validates the manifest.
 */
export async function installFromZip(zipPath: string): Promise<StorageResult<string>> {
  const tempId = randomUUID()
  const tempDir = join(app.getPath('userData'), 'plugins', `_install-temp-${tempId}`)
  try {
    const pluginsDir = await getPluginsDir()

    // Phase 20d — size cap before we extract anything.
    const zipStat = await stat(zipPath)
    if (zipStat.size > MAX_PLUGIN_ZIP_BYTES) {
      logSecurityEvent('plugin.install.rejected', { reason: 'oversized', bytes: zipStat.size })
      return { success: false, error: `Plugin archive too large (max ${MAX_PLUGIN_ZIP_BYTES / (1024 * 1024)} MB)` }
    }

    // Phase 20d — checksum the source archive for the audit trail + optional pin.
    const checksum = await computeChecksum(zipPath)

    // Extract to a temp directory first, then validate
    await rm(tempDir, { recursive: true, force: true })

    await extractZip(zipPath, tempDir)

    // The zip might contain files directly or inside a subdirectory
    const { readdir, readFile: rf } = await import('node:fs/promises')
    const tempContents = await readdir(tempDir, { withFileTypes: true })

    // If there's a single directory, look inside it
    let manifestDir = tempDir
    if (tempContents.length === 1 && tempContents[0].isDirectory()) {
      manifestDir = join(tempDir, tempContents[0].name)
    }

    // Read and validate manifest
    const manifestPath = join(manifestDir, 'manifest.json')
    let manifestRaw: unknown
    try {
      manifestRaw = JSON.parse(await rf(manifestPath, 'utf-8'))
    } catch {
      await rm(tempDir, { recursive: true, force: true })
      return { success: false, error: 'No valid manifest.json found in archive' }
    }

    const validation = validateManifest(manifestRaw)
    if (!validation.valid || !validation.manifest) {
      await rm(tempDir, { recursive: true, force: true })
      return { success: false, error: `Invalid manifest: ${validation.error}` }
    }

    // Phase 20d — if the manifest pins an expectedChecksum, enforce it.
    const expectedChecksum = (manifestRaw as { expectedChecksum?: unknown }).expectedChecksum
    if (typeof expectedChecksum === 'string' && expectedChecksum.toLowerCase() !== checksum) {
      await rm(tempDir, { recursive: true, force: true })
      logSecurityEvent('plugin.install.rejected', {
        reason: 'checksum-mismatch',
        id: validation.manifest.id,
        expected: expectedChecksum,
        actual: checksum
      })
      return { success: false, error: 'Checksum mismatch' }
    }

    // Phase 20d — entry-extension allowlist (defense-in-depth over zip-slip).
    const badEntry = await assertAllowedEntries(manifestDir)
    if (badEntry) {
      await rm(tempDir, { recursive: true, force: true })
      logSecurityEvent('plugin.install.rejected', { reason: 'disallowed-entry', entry: badEntry })
      return { success: false, error: `Disallowed file in plugin archive: ${badEntry}` }
    }

    const pluginId = validation.manifest.id
    const targetDir = resolve(join(pluginsDir, pluginId))

    // Path traversal protection
    if (!isPathInside(pluginsDir, targetDir)) {
      await rm(tempDir, { recursive: true, force: true })
      return { success: false, error: 'Invalid plugin ID (path traversal)' }
    }

    // Remove existing if present, then move
    await rm(targetDir, { recursive: true, force: true })
    const { rename } = await import('node:fs/promises')
    await rename(manifestDir, targetDir)

    // Clean up temp dir
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})

    logToFile('INFO', `Plugin installed: ${pluginId}`)
    // Phase 20d/20g — record the install with its archive sha256. `verified`
    // marks whether the manifest pinned (and matched) a checksum. Unverified
    // installs are trust-on-install **by design** (decision 2026-06-10, PHASE-38 38D):
    // there is no runtime sandbox — the mitigations are structural validation, the
    // checksum pin, this security log, the Settings install warning, and the
    // permission-gated PluginAPI. See docs/PLUGIN-SYSTEM.md §Trust model.
    logSecurityEvent('plugin.install.success', {
      id: pluginId,
      sha256: checksum,
      verified: typeof expectedChecksum === 'string'
    })
    return { success: true, data: pluginId }
  } catch (err) {
    // Clean up temp on error
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    logSecurityEvent('plugin.install.failed', { error: (err as Error).message })
    return { success: false, error: `Installation failed: ${(err as Error).message}` }
  }
}

/**
 * Uninstall a plugin by removing its directory.
 */
export async function uninstallPlugin(id: string): Promise<StorageResult<boolean>> {
  try {
    // Validate id format to prevent path traversal
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      return { success: false, error: 'Invalid plugin ID' }
    }

    const pluginsDir = await getPluginsDir()
    const pluginDir = resolve(join(pluginsDir, id))

    // Path traversal protection
    if (!isPathInside(pluginsDir, pluginDir)) {
      return { success: false, error: 'Invalid plugin path' }
    }

    await rm(pluginDir, { recursive: true, force: true })
    await removePluginConfig(id)

    logToFile('INFO', `Plugin uninstalled: ${id}`)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Uninstall failed: ${(err as Error).message}` }
  }
}
