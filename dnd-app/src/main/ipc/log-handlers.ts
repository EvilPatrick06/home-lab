import { shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getLogDir, getLogFilePath } from '../log'
import { handle } from './_safe'

// In-app access to the rotating app.log so users can attach it to bug reports
// without hunting through userData. (suggestions-log 2026-06-22)
export function registerLogHandlers(): void {
  handle(IPC_CHANNELS.LOG_GET_PATH, async () => getLogFilePath())
  handle(IPC_CHANNELS.LOG_OPEN_FOLDER, async () => {
    const file = getLogFilePath()
    try {
      shell.showItemInFolder(file)
      return { ok: true as const, path: file }
    } catch {
      const dir = getLogDir()
      await shell.openPath(dir)
      return { ok: true as const, path: dir }
    }
  })
}
