import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { logToFile } from '../log'
import { getRendererPublicDir } from '../paths'
import { logSecurityEvent } from '../security-log'
import { handle } from './_safe'

export function registerGameDataHandlers(): void {
  // Phase 19b — dev/packaged base for the renderer public/ tree (shared resolver).
  const dataBase = getRendererPublicDir()

  const resolvedBase = resolve(dataBase)

  handle(IPC_CHANNELS.GAME_LOAD_JSON, async (_event, relativePath: string) => {
    if (typeof relativePath !== 'string' || !relativePath) {
      throw new Error('Invalid path: expected non-empty string')
    }

    // Strip leading ./ if present
    const normalized = relativePath.replace(/^\.\//, '')
    const fullPath = resolve(join(dataBase, normalized))

    // Security: prevent path traversal outside the data directory
    if (!fullPath.startsWith(resolvedBase)) {
      logSecurityEvent('ipc.path_traversal.denied', { channel: 'GAME_LOAD_JSON', path: relativePath })
      throw new Error('Access denied: path traversal detected')
    }

    // Phase 17b (RUN-1/NET-7) — a single corrupt JSON file among 85+ data files must not crash
    // the whole data pipeline (blank screen). Log the path + return null; callers handle null.
    const content = await readFile(fullPath, 'utf-8')
    try {
      return JSON.parse(content)
    } catch (err) {
      logToFile('ERROR', `GAME_LOAD_JSON: failed to parse ${normalized}: ${String(err)}`)
      return null
    }
  })
}
