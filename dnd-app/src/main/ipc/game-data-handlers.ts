import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { logToFile } from '../log'

export function registerGameDataHandlers(): void {
  // In dev: public/ files are under src/renderer/public/
  // In prod: they're copied to out/renderer/ inside the asar
  const dataBase = is.dev ? join(app.getAppPath(), 'src', 'renderer', 'public') : join(__dirname, '..', 'renderer')

  const resolvedBase = resolve(dataBase)

  ipcMain.handle(IPC_CHANNELS.GAME_LOAD_JSON, async (_event, relativePath: string) => {
    if (typeof relativePath !== 'string' || !relativePath) {
      throw new Error('Invalid path: expected non-empty string')
    }

    // Strip leading ./ if present
    const normalized = relativePath.replace(/^\.\//, '')
    const fullPath = resolve(join(dataBase, normalized))

    // Security: prevent path traversal outside the data directory
    if (!fullPath.startsWith(resolvedBase)) {
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
