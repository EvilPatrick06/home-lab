import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}))

import { mkdir, readFile, writeFile } from 'fs/promises'
import type { AppSettings } from './settings-storage'
import { loadSettings, saveSettings } from './settings-storage'

describe('settings-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadSettings', () => {
    it('should return empty object when file does not exist', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const result = await loadSettings()
      expect(result).toEqual({})
    })

    it('should parse and return settings from file', async () => {
      const settings: AppSettings = {
        turnServers: [{ urls: 'turn:example.com', username: 'user', credential: 'pass' }]
      }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(settings))

      const result = await loadSettings()
      expect(result).toEqual(settings)
    })

    it('should return empty object on parse error', async () => {
      vi.mocked(readFile).mockResolvedValue('invalid json{{{')

      const result = await loadSettings()
      expect(result).toEqual({})
    })
  })

  describe('saveSettings', () => {
    it('should write settings as formatted JSON', async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const settings: AppSettings = {
        turnServers: [{ urls: 'stun:stun.example.com' }]
      }

      await saveSettings(settings)

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
        JSON.stringify(settings, null, 2),
        'utf-8'
      )
    })

    it('should save empty settings object', async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)

      await saveSettings({})

      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('settings.json'), '{}', 'utf-8')
    })
  })
})
