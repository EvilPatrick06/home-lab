import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { protocol } from 'electron'
import { logToFile } from '../log'
import { getPluginsDir } from './plugin-scanner'

const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
}

/**
 * Register the plugin:// custom protocol.
 * Must be called inside app.whenReady() BEFORE createWindow().
 *
 * URLs have the form: plugin://<pluginId>/path/to/file.js
 */
export function registerPluginProtocol(): void {
  protocol.handle('plugin', async (request) => {
    try {
      const url = new URL(request.url)
      const pluginId = url.hostname
      const filePath = decodeURIComponent(url.pathname).replace(/^\//, '')

      // Validate plugin ID
      if (!/^[a-zA-Z0-9._-]+$/.test(pluginId)) {
        return new Response('Invalid plugin ID', { status: 400 })
      }

      const pluginsDir = await getPluginsDir()
      const resolvedPath = resolve(join(pluginsDir, pluginId, filePath))
      const resolvedBase = resolve(join(pluginsDir, pluginId))

      // Path traversal protection
      if (!resolvedPath.startsWith(resolvedBase)) {
        logToFile('WARN', `Plugin protocol: path traversal blocked for ${pluginId}: ${filePath}`)
        return new Response('Access denied', { status: 403 })
      }

      const content = await readFile(resolvedPath)
      const ext = extname(resolvedPath).toLowerCase()
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

      return new Response(content, {
        headers: { 'Content-Type': contentType }
      })
    } catch (err) {
      logToFile('WARN', `Plugin protocol error: ${(err as Error).message}`)
      return new Response('Not found', { status: 404 })
    }
  })
}

/**
 * Register the plugin:// scheme as privileged.
 * Must be called BEFORE app.whenReady().
 */
export function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'plugin',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true
      }
    }
  ])
}
