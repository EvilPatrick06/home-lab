import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

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

    const content = await readFile(fullPath, 'utf-8')
    return JSON.parse(content)
  })
}
