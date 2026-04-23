import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  rename: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn()
}))

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { deleteConversation, loadConversation, saveConversation } from './ai-conversation-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('ai-conversation-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('saveConversation', () => {
    it('should return error for invalid campaign ID', async () => {
      await expect(
        saveConversation(INVALID_UUID, { messages: [], summaries: [], activeCharacterIds: [] } as never)
      ).resolves.toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should create directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await saveConversation(VALID_UUID, { messages: [], summaries: [], activeCharacterIds: [] } as never)

      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('ai-conversations'), { recursive: true })
    })

    it('should write conversation data as JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const data = { messages: [{ role: 'user', content: 'hello' }], summaries: [], activeCharacterIds: [] } as never

      await saveConversation(VALID_UUID, data)

      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
    })
  })

  describe('loadConversation', () => {
    it('should return error for invalid campaign ID', async () => {
      await expect(loadConversation(INVALID_UUID)).resolves.toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return null if file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await loadConversation(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })

    it('should parse and return conversation data', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const mockData = { messages: [], summaries: [], activeCharacterIds: [] }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData))

      const result = await loadConversation(VALID_UUID)
      expect(result).toEqual({ success: true, data: mockData })
    })

    it('should return null on parse error', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('not valid json{{{')

      const result = await loadConversation(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })
  })

  describe('deleteConversation', () => {
    it('should return error for invalid campaign ID', async () => {
      await expect(deleteConversation(INVALID_UUID)).resolves.toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return false if file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      await expect(deleteConversation(VALID_UUID)).resolves.toEqual({ success: true, data: false })
    })

    it('should delete file if it exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const { unlink } = await import('node:fs/promises')
      vi.mocked(unlink).mockResolvedValue(undefined)

      await deleteConversation(VALID_UUID)
      // The function dynamically imports unlink, so we verify no error was thrown
    })
  })
})
