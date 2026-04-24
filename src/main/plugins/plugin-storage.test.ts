import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./plugin-scanner', () => ({
  getPluginsDir: vi.fn(() => Promise.resolve('/tmp/test-userdata/plugins'))
}))

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { deletePluginStorage, getPluginStorage, setPluginStorage } from './plugin-storage'

describe('plugin-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(writeFile).mockResolvedValue(undefined)
  })

  describe('getPluginStorage', () => {
    it('should return null for non-existent key', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const result = await getPluginStorage('my-plugin', 'missing-key')
      expect(result).toBeNull()
    })

    it('should return stored value for existing key', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ theme: 'dark', volume: 0.8 }))

      const result = await getPluginStorage('my-plugin', 'theme')
      expect(result).toBe('dark')
    })

    it('should return null for invalid plugin ID', async () => {
      const result = await getPluginStorage('../evil', 'key')
      expect(result).toBeNull()
    })

    it('should return null when storage file contains non-object', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify([1, 2, 3]))

      const result = await getPluginStorage('my-plugin', 'key')
      expect(result).toBeNull()
    })
  })

  describe('setPluginStorage', () => {
    it('should write value to storage', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const result = await setPluginStorage('my-plugin', 'theme', 'dark')
      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('storage.json'),
        expect.stringContaining('"theme"'),
        'utf-8'
      )
    })

    it('should merge with existing storage data', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ existing: 'value' }))

      await setPluginStorage('my-plugin', 'newKey', 42)

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.existing).toBe('value')
      expect(writtenData.newKey).toBe(42)
    })

    it('should overwrite existing key', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ theme: 'light' }))

      await setPluginStorage('my-plugin', 'theme', 'dark')

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.theme).toBe('dark')
    })

    it('should return success even for invalid plugin ID (no-op)', async () => {
      const result = await setPluginStorage('../evil', 'key', 'value')
      expect(result).toEqual({ success: true })
      // writeFile should not have been called since getStoragePath returns null
      expect(writeFile).not.toHaveBeenCalled()
    })
  })

  describe('deletePluginStorage', () => {
    it('should remove key from storage', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ keep: 'yes', remove: 'no' }))

      const result = await deletePluginStorage('my-plugin', 'remove')
      expect(result).toEqual({ success: true })

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.keep).toBe('yes')
      expect(writtenData.remove).toBeUndefined()
    })

    it('should not fail if key does not exist', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ other: 'data' }))

      const result = await deletePluginStorage('my-plugin', 'nonexistent')
      expect(result).toEqual({ success: true })
    })
  })
})
