import { app, dialog, ipcMain } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/

function isValidUUID(str: string): boolean {
  return UUID_RE.test(str)
}

function isSafeFileName(str: string): boolean {
  return SAFE_FILENAME_RE.test(str) && !str.includes('..') && str.length <= 255
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  const resolved = path.resolve(filePath)
  const rel = path.relative(directory, resolved)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function registerAudioHandlers(): void {
  // Upload custom audio file for a campaign
  ipcMain.handle(
    IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM,
    async (
      _event,
      campaignId: string,
      fileName: string,
      buffer: ArrayBuffer,
      displayName: string,
      category: string
    ) => {
      if (!isValidUUID(campaignId)) {
        return { success: false, error: 'Invalid campaign ID' }
      }
      try {
        const campaignDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'custom-audio')
        await fs.mkdir(campaignDir, { recursive: true })
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
        if (!sanitizedFileName || sanitizedFileName.startsWith('.')) {
          return { success: false, error: 'Invalid file name' }
        }
        const filePath = path.join(campaignDir, sanitizedFileName)
        if (!isWithinDirectory(filePath, campaignDir)) {
          return { success: false, error: 'Invalid file path' }
        }
        await fs.writeFile(filePath, Buffer.from(buffer))
        return { success: true, data: { fileName: sanitizedFileName, displayName, category } }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // List custom audio files for a campaign
  ipcMain.handle(IPC_CHANNELS.AUDIO_LIST_CUSTOM, async (_event, campaignId: string) => {
    if (!isValidUUID(campaignId)) {
      return { success: false, error: 'Invalid campaign ID' }
    }
    try {
      const campaignDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'custom-audio')
      try {
        const files = await fs.readdir(campaignDir)
        return { success: true, data: files }
      } catch {
        return { success: true, data: [] }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Delete a custom audio file
  ipcMain.handle(IPC_CHANNELS.AUDIO_DELETE_CUSTOM, async (_event, campaignId: string, fileName: string) => {
    if (!isValidUUID(campaignId)) {
      return { success: false, error: 'Invalid campaign ID' }
    }
    if (!isSafeFileName(fileName)) {
      return { success: false, error: 'Invalid file name' }
    }
    try {
      const campaignDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'custom-audio')
      const filePath = path.join(campaignDir, fileName)
      if (!isWithinDirectory(filePath, campaignDir)) {
        return { success: false, error: 'Invalid file path' }
      }
      await fs.unlink(filePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Get the full path to a custom audio file (for playback)
  ipcMain.handle(IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH, async (_event, campaignId: string, fileName: string) => {
    if (!isValidUUID(campaignId)) {
      return { success: false, error: 'Invalid campaign ID' }
    }
    if (!isSafeFileName(fileName)) {
      return { success: false, error: 'Invalid file name' }
    }
    try {
      const campaignDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'custom-audio')
      const filePath = path.join(campaignDir, fileName)
      if (!isWithinDirectory(filePath, campaignDir)) {
        return { success: false, error: 'Invalid file path' }
      }
      await fs.access(filePath)
      return { success: true, data: filePath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Open file dialog for audio selection
  ipcMain.handle(IPC_CHANNELS.AUDIO_PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'webm', 'm4a'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }
    const filePath = result.filePaths[0]
    const buffer = await fs.readFile(filePath)
    const fileName = path.basename(filePath)
    return { success: true, data: { fileName, buffer: buffer.buffer } }
  })
}
