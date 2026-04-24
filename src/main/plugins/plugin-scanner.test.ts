import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(() => []),
  mkdir: vi.fn()
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./plugin-config', () => ({
  getEnabledPluginIds: vi.fn(() => Promise.resolve(new Set()))
}))

import { mkdir, readdir, readFile } from 'node:fs/promises'
import { getEnabledPluginIds } from './plugin-config'
import { getPluginsDir, scanPlugins, validateManifest } from './plugin-scanner'

describe('plugin-scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('getPluginsDir', () => {
    it('should return a path containing "plugins"', async () => {
      // Reset module-level cache by re-importing (but the mock ensures consistent behavior)
      const dir = await getPluginsDir()
      expect(dir).toContain('plugins')
    })
  })

  describe('validateManifest', () => {
    const validManifest = {
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      author: 'Test Author',
      type: 'content-pack',
      gameSystem: 'dnd5e',
      data: {}
    }

    it('should accept a valid content-pack manifest', () => {
      const result = validateManifest(validManifest)
      expect(result.valid).toBe(true)
      expect(result.manifest).toBeDefined()
    })

    it('should reject null', () => {
      const result = validateManifest(null)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('JSON object')
    })

    it('should reject non-object', () => {
      const result = validateManifest('string')
      expect(result.valid).toBe(false)
    })

    it('should reject missing id', () => {
      const result = validateManifest({ ...validManifest, id: '' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('id')
    })

    it('should reject id with invalid characters', () => {
      const result = validateManifest({ ...validManifest, id: 'bad/id' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid characters')
    })

    it('should reject id that is too long', () => {
      const result = validateManifest({ ...validManifest, id: 'a'.repeat(129) })
      expect(result.valid).toBe(false)
    })

    it('should reject missing name', () => {
      const result = validateManifest({ ...validManifest, name: '' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('name')
    })

    it('should reject missing version', () => {
      const result = validateManifest({ ...validManifest, version: '' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('version')
    })

    it('should reject non-string description', () => {
      const result = validateManifest({ ...validManifest, description: 123 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('description')
    })

    it('should reject non-string author', () => {
      const result = validateManifest({ ...validManifest, author: null })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('author')
    })

    it('should reject invalid type', () => {
      const result = validateManifest({ ...validManifest, type: 'unknown' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('type')
    })

    it('should require gameSystem for non-game-system types', () => {
      const result = validateManifest({ ...validManifest, gameSystem: undefined })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('gameSystem')
    })

    it('should require entry for code plugin type', () => {
      const result = validateManifest({
        ...validManifest,
        type: 'plugin',
        entry: undefined
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('entry')
    })

    it('should accept valid plugin type with entry', () => {
      const result = validateManifest({
        ...validManifest,
        type: 'plugin',
        entry: 'main.js',
        permissions: ['commands']
      })
      expect(result.valid).toBe(true)
    })

    it('should require entry for game-system type', () => {
      const result = validateManifest({
        ...validManifest,
        type: 'game-system',
        gameSystem: undefined
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('entry')
    })
  })

  describe('scanPlugins', () => {
    it('should return empty list when no plugins exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await scanPlugins()
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should scan plugin directories and parse manifests', async () => {
      vi.mocked(readdir).mockResolvedValue([{ name: 'my-plugin', isDirectory: () => true }] as never)
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          id: 'my-plugin',
          name: 'My Plugin',
          version: '1.0.0',
          description: 'Test',
          author: 'Author',
          type: 'content-pack',
          gameSystem: 'dnd5e',
          data: {}
        })
      )
      vi.mocked(getEnabledPluginIds).mockResolvedValue(new Set(['my-plugin']))

      const result = await scanPlugins()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].id).toBe('my-plugin')
      expect(result.data![0].enabled).toBe(true)
      expect(result.data![0].loaded).toBe(false)
    })

    it('should skip non-directory entries', async () => {
      vi.mocked(readdir).mockResolvedValue([{ name: 'readme.txt', isDirectory: () => false }] as never)

      const result = await scanPlugins()
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('should report invalid manifests with error', async () => {
      vi.mocked(readdir).mockResolvedValue([{ name: 'bad-plugin', isDirectory: () => true }] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: '' }))

      const result = await scanPlugins()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].error).toBeDefined()
      expect(result.data![0].enabled).toBe(false)
    })

    it('should handle manifest read errors', async () => {
      vi.mocked(readdir).mockResolvedValue([{ name: 'broken-plugin', isDirectory: () => true }] as never)
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const result = await scanPlugins()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].error).toContain('Failed to read manifest')
    })

    it('should return error on overall scan failure', async () => {
      vi.mocked(readdir).mockRejectedValue(new Error('access denied'))

      // getPluginsDir will have been cached from previous calls
      // We need to simulate the scan itself failing
      const result = await scanPlugins()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Plugin scan failed')
    })
  })
})
