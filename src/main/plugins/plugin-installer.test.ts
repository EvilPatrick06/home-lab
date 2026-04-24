import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn()
}))

vi.mock('node:child_process', () => ({
  exec: vi.fn()
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }))
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('../storage/types', () => ({}))

vi.mock('./plugin-config', () => ({
  removePluginConfig: vi.fn()
}))

vi.mock('./plugin-scanner', () => ({
  getPluginsDir: vi.fn(() => Promise.resolve('/tmp/test-userdata/plugins')),
  validateManifest: vi.fn()
}))

import { rm } from 'node:fs/promises'
import { removePluginConfig } from './plugin-config'
import { uninstallPlugin } from './plugin-installer'

describe('plugin-installer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rm).mockResolvedValue(undefined)
  })

  describe('uninstallPlugin', () => {
    it('should reject invalid plugin IDs', async () => {
      const result = await uninstallPlugin('../evil')
      expect(result).toEqual({ success: false, error: 'Invalid plugin ID' })
    })

    it('should reject plugin IDs with special characters', async () => {
      const result = await uninstallPlugin('plugin/path')
      expect(result).toEqual({ success: false, error: 'Invalid plugin ID' })
    })

    it('should accept valid plugin IDs with alphanumeric, dash, underscore, dot', async () => {
      const result = await uninstallPlugin('my-plugin.v2_beta')
      expect(result).toEqual({ success: true, data: true })
    })

    it('should remove plugin directory', async () => {
      await uninstallPlugin('my-plugin')

      expect(rm).toHaveBeenCalledWith(expect.stringContaining('my-plugin'), { recursive: true, force: true })
    })

    it('should remove plugin config entry', async () => {
      await uninstallPlugin('my-plugin')

      expect(removePluginConfig).toHaveBeenCalledWith('my-plugin')
    })

    it('should return error on removal failure', async () => {
      vi.mocked(rm).mockRejectedValue(new Error('permission denied'))

      const result = await uninstallPlugin('my-plugin')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Uninstall failed')
    })
  })
})
