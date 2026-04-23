import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') },
  ipcMain: { handle: mockHandle },
  dialog: { showOpenDialog: vi.fn() }
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(() => []),
  unlink: vi.fn(),
  access: vi.fn()
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    AUDIO_UPLOAD_CUSTOM: 'audio:upload-custom',
    AUDIO_LIST_CUSTOM: 'audio:list-custom',
    AUDIO_DELETE_CUSTOM: 'audio:delete-custom',
    AUDIO_GET_CUSTOM_PATH: 'audio:get-custom-path',
    AUDIO_PICK_FILE: 'audio:pick-file'
  }
}))

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerAudioHandlers } from './audio-handlers'

describe('audio-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register all audio IPC handlers', () => {
    registerAudioHandlers()

    const registeredChannels = mockHandle.mock.calls.map((call) => call[0])
    expect(registeredChannels).toContain(IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM)
    expect(registeredChannels).toContain(IPC_CHANNELS.AUDIO_LIST_CUSTOM)
    expect(registeredChannels).toContain(IPC_CHANNELS.AUDIO_DELETE_CUSTOM)
    expect(registeredChannels).toContain(IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH)
    expect(registeredChannels).toContain(IPC_CHANNELS.AUDIO_PICK_FILE)
  })

  it('should register exactly 5 handlers', () => {
    registerAudioHandlers()
    expect(mockHandle).toHaveBeenCalledTimes(5)
  })

  describe('AUDIO_UPLOAD_CUSTOM handler', () => {
    it('should reject invalid campaign ID', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM)![1]

      const result = await handler({}, 'invalid-id', 'file.mp3', new ArrayBuffer(0), 'Test', 'music')
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should accept valid campaign ID and save file', async () => {
      const { mkdir, writeFile } = await import('fs/promises')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_UPLOAD_CUSTOM)![1]

      const campaignId = '12345678-1234-1234-1234-123456789abc'
      const result = await handler({}, campaignId, 'song.mp3', new ArrayBuffer(8), 'My Song', 'music')
      expect(result.success).toBe(true)
      expect(result.data.fileName).toBe('song.mp3')
    })
  })

  describe('AUDIO_LIST_CUSTOM handler', () => {
    it('should reject invalid campaign ID', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_LIST_CUSTOM)![1]

      const result = await handler({}, 'bad-id')
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return empty array when directory does not exist', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_LIST_CUSTOM)![1]

      const campaignId = '12345678-1234-1234-1234-123456789abc'
      const result = await handler({}, campaignId)
      expect(result).toEqual({ success: true, data: [] })
    })
  })

  describe('AUDIO_DELETE_CUSTOM handler', () => {
    it('should reject invalid campaign ID', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_DELETE_CUSTOM)![1]

      const result = await handler({}, 'bad-id', 'file.mp3')
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should reject unsafe file names', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_DELETE_CUSTOM)![1]

      const campaignId = '12345678-1234-1234-1234-123456789abc'
      const result = await handler({}, campaignId, '../../../etc/passwd')
      expect(result).toEqual({ success: false, error: 'Invalid file name' })
    })
  })

  describe('AUDIO_GET_CUSTOM_PATH handler', () => {
    it('should reject invalid campaign ID', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH)![1]

      const result = await handler({}, 'bad-id', 'file.mp3')
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should reject unsafe file names', async () => {
      registerAudioHandlers()

      const handler = mockHandle.mock.calls.find((call) => call[0] === IPC_CHANNELS.AUDIO_GET_CUSTOM_PATH)![1]

      const campaignId = '12345678-1234-1234-1234-123456789abc'
      const result = await handler({}, campaignId, 'has spaces.mp3')
      expect(result).toEqual({ success: false, error: 'Invalid file name' })
    })
  })
})
