import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn()
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./plugin-scanner', () => ({
  getPluginsDir: vi.fn(() => Promise.resolve('/tmp/test-userdata/plugins'))
}))

import { readFile } from 'node:fs/promises'
import type { PluginManifest } from '../../shared/plugin-types'
import { loadAllContentPackData, loadContentPackData } from './content-pack-loader'

describe('content-pack-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadContentPackData', () => {
    it('should return empty data if manifest has no data mapping', async () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack' as const,
        gameSystem: 'dnd5e',
        data: {}
      }

      const result = await loadContentPackData('test-plugin', 'spells', manifest)
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should return empty data if category not in manifest', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { feats: 'feats.json' }
      }

      const result = await loadContentPackData('test-plugin', 'spells', manifest)
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should load and tag items with plugin source', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { spells: 'spells.json' }
      }

      const mockSpells = [
        { name: 'Fireball', level: 3 },
        { name: 'Ice Storm', level: 4 }
      ]
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSpells))

      const result = await loadContentPackData('test-plugin', 'spells', manifest)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect((result.data![0] as Record<string, unknown>).source).toBe('plugin:test-plugin')
    })

    it('should handle multiple file references for a category', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { spells: ['cantrips.json', 'leveled.json'] }
      }

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify([{ name: 'Firebolt' }]))
        .mockResolvedValueOnce(JSON.stringify([{ name: 'Fireball' }]))

      const result = await loadContentPackData('test-plugin', 'spells', manifest)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should handle single object in JSON file (non-array)', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { spells: 'spell.json' }
      }

      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: 'Fireball' }))

      const result = await loadContentPackData('test-plugin', 'spells', manifest)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })

    it('should skip files that fail to read', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { spells: ['good.json', 'bad.json'] }
      }

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify([{ name: 'Fireball' }]))
        .mockRejectedValueOnce(new Error('file not found'))

      const result = await loadContentPackData('test-plugin', 'spells', manifest)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })
  })

  describe('loadAllContentPackData', () => {
    it('should return empty data if manifest has no data mapping', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: {}
      }

      const result = await loadAllContentPackData('test-plugin', manifest)
      expect(result).toEqual({ success: true, data: {} })
    })

    it('should load data from all categories', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { spells: 'spells.json', feats: 'feats.json' }
      }

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify([{ name: 'Fireball' }]))
        .mockResolvedValueOnce(JSON.stringify([{ name: 'Alert' }]))

      const result = await loadAllContentPackData('test-plugin', manifest)
      expect(result.success).toBe(true)
      expect(result.data!.spells).toHaveLength(1)
      expect(result.data!.feats).toHaveLength(1)
    })

    it('should skip categories with no items', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: { spells: 'spells.json' }
      }

      vi.mocked(readFile).mockResolvedValue(JSON.stringify([]))

      const result = await loadAllContentPackData('test-plugin', manifest)
      expect(result.success).toBe(true)
      expect(result.data!.spells).toBeUndefined()
    })
  })
})
