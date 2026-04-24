import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { logToFile } from '../log'
import type { StorageResult } from '../storage/types'
import { removePluginConfig } from './plugin-config'
import { getPluginsDir, validateManifest } from './plugin-scanner'

// Use tar-style extraction for zip files via the built-in 'unzipper' approach
// Since Node.js doesn't have built-in zip support, we'll use a simple approach:
// Read the file, extract using the yauzl-free approach with streams
// For simplicity and security, we'll use a pipeline with the 'extract' npm module
// Actually, Electron apps on Windows can use PowerShell or we can use a minimal approach.

// For maximum compatibility without extra dependencies, we'll use Node.js child_process
// to call tar (available on Windows 10+ Git Bash) or PowerShell's Expand-Archive.
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })

  // Use PowerShell on Windows for zip extraction (no extra deps needed)
  const psCommand = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
  await execAsync(`powershell -NoProfile -Command "${psCommand}"`)
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

    const pluginId = validation.manifest.id
    const targetDir = resolve(join(pluginsDir, pluginId))

    // Path traversal protection
    if (!targetDir.startsWith(resolve(pluginsDir))) {
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
    return { success: true, data: pluginId }
  } catch (err) {
    // Clean up temp on error
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
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
    if (!pluginDir.startsWith(resolve(pluginsDir))) {
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
