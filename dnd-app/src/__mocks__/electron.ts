/**
 * Vitest stub for the `electron` package so main-process tests run without a
 * downloaded Electron binary (e.g. Linux ARM, minimal CI images).
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mockUserData = join(tmpdir(), 'dnd-vtt-vitest-electron')

export const app = {
  getPath: (name: string): string => {
    if (name === 'userData') return mockUserData
    return join(mockUserData, name)
  },
  getAppPath: (): string => join(mockUserData, 'app'),
  getVersion: (): string => '0.0.0-test',
  isPackaged: false,
  on: (): void => {},
  whenReady: (): Promise<void> => Promise.resolve(),
  quit: (): void => {}
}

export class BrowserWindow {
  webContents = { send: (): void => {} }
  on(): void {}
  loadURL = async (): Promise<void> => {}
  isDestroyed(): boolean {
    return false
  }
}

export const ipcMain = {
  on: (): void => {},
  handle: (): void => {},
  removeHandler: (): void => {}
}

export const dialog = {
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
    canceled: true,
    filePaths: []
  }),
  showSaveDialog: async (): Promise<{ canceled: boolean; filePath?: string }> => ({ canceled: true })
}

export const protocol = {
  registerFileProtocol: (): void => {},
  handle: (): void => {}
}

export const shell = {
  openPath: async (): Promise<string> => '',
  openExternal: async (): Promise<void> => {}
}

export const nativeImage = {
  createFromPath: (): { toDataURL: () => string } => ({
    toDataURL: () => 'data:image/png;base64,'
  })
}

const electron = { app, BrowserWindow, ipcMain, dialog, protocol, shell, nativeImage }
export default electron
