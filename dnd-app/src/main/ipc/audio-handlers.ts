import { app, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { z } from 'zod'
import { MAX_READ_FILE_SIZE } from '../../shared/constants'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { validateUploadExtension } from '../upload-validation'
import { handle, withArgsSchema } from './_safe'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/

// Phase 35c — schema primitives. Close path traversal at the schema layer:
// fileName must be a basename (no separators, no `..`), campaignId a UUID.
const CampaignIdSchema = z.string().regex(UUID_RE, 'invalid campaign id')
const FileNameSchema = z
  .string()
  .max(255)
  .regex(SAFE_FILENAME_RE, 'invalid file name')
  .refine((s) => !s.includes('..'), 'path traversal')

function isWithinDirectory(filePath: string, directory: string): boolean {
  const resolved = path.resolve(filePath)
  const rel = path.relative(directory, resolved)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function registerAudioHandlers(): void {
  // Upload custom audio file for a campaign
  handle(
    IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM,
    withArgsSchema(
      IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM,
      z.tuple([CampaignIdSchema, FileNameSchema, z.instanceof(ArrayBuffer), z.string().max(255), z.string().max(64)]),
      async (
        _event,
        campaignId: string,
        fileName: string,
        buffer: ArrayBuffer,
        displayName: string,
        category: string
      ) => {
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
          const buf = Buffer.from(buffer)
          // Phase 20f — reject audio whose magic bytes don't match the extension.
          const mismatch = validateUploadExtension(buf, path.extname(sanitizedFileName))
          if (mismatch) {
            return { success: false, error: mismatch }
          }
          await fs.writeFile(filePath, buf)
          return { success: true, data: { fileName: sanitizedFileName, displayName, category } }
        } catch (err) {
          return { success: false, error: String(err) }
        }
      }
    )
  )

  // List custom audio files for a campaign
  handle(
    IPC_CHANNELS.AUDIO_LIST_CUSTOM,
    withArgsSchema(IPC_CHANNELS.AUDIO_LIST_CUSTOM, z.tuple([CampaignIdSchema]), async (_event, campaignId: string) => {
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
  )

  // Delete a custom audio file
  handle(
    IPC_CHANNELS.AUDIO_DELETE_CUSTOM,
    withArgsSchema(
      IPC_CHANNELS.AUDIO_DELETE_CUSTOM,
      z.tuple([CampaignIdSchema, FileNameSchema]),
      async (_event, campaignId: string, fileName: string) => {
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
      }
    )
  )

  // Get the full path to a custom audio file (for playback)
  handle(
    IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH,
    withArgsSchema(
      IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH,
      z.tuple([CampaignIdSchema, FileNameSchema]),
      async (_event, campaignId: string, fileName: string) => {
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
      }
    )
  )

  // Open file dialog for audio selection (no payload to validate)
  handle(IPC_CHANNELS.AUDIO_PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'webm', 'm4a'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }
    const filePath = result.filePaths[0]
    // Phase 17a (NET-16) — stat first to enforce a size cap and to avoid a TOCTOU read of a
    // file that vanished/grew between the dialog return and the read; wrap the read in try-catch.
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_READ_FILE_SIZE) {
        return { success: false, error: `Audio file too large: ${stat.size} bytes (max ${MAX_READ_FILE_SIZE})` }
      }
      const buffer = await fs.readFile(filePath)
      const fileName = path.basename(filePath)
      return { success: true, data: { fileName, buffer: buffer.buffer } }
    } catch (err) {
      return { success: false, error: `Failed to read audio file: ${String(err)}` }
    }
  })
}
