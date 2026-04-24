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

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getEnabledPluginIds, removePluginConfig, setPluginEnabled } from './plugin-config'

describe('plugin-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(writeFile).mockResolvedValue(undefined)
  })

  describe('getEnabledPluginIds', () => {
    it('should return empty set when config file does not exist', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const ids = await getEnabledPluginIds()
      expect(ids).toBeInstanceOf(Set)
      expect(ids.size).toBe(0)
    })

    it('should return empty set when config is invalid JSON', async () => {
      vi.mocked(readFile).mockResolvedValue('not json')

      const ids = await getEnabledPluginIds()
      expect(ids.size).toBe(0)
    })

    it('should return enabled plugin IDs', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          plugins: [
            { id: 'plugin-a', enabled: true },
            { id: 'plugin-b', enabled: false },
            { id: 'plugin-c', enabled: true }
          ]
        })
      )

      const ids = await getEnabledPluginIds()
      expect(ids.size).toBe(2)
      expect(ids.has('plugin-a')).toBe(true)
      expect(ids.has('plugin-c')).toBe(true)
      expect(ids.has('plugin-b')).toBe(false)
    })

    it('should return empty set when plugins array is missing', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ other: 'data' }))

      const ids = await getEnabledPluginIds()
      expect(ids.size).toBe(0)
    })
  })

  describe('setPluginEnabled', () => {
    it('should add new plugin entry when not in config', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ plugins: [] }))

      await setPluginEnabled('new-plugin', true)

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('plugin-config.json'),
        expect.stringContaining('"new-plugin"'),
        'utf-8'
      )
    })

    it('should update existing plugin entry', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ plugins: [{ id: 'existing', enabled: false }] }))

      await setPluginEnabled('existing', true)

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.plugins[0].enabled).toBe(true)
    })

    it('should disable a plugin', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ plugins: [{ id: 'plugin-a', enabled: true }] }))

      await setPluginEnabled('plugin-a', false)

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.plugins[0].enabled).toBe(false)
    })
  })

  describe('removePluginConfig', () => {
    it('should remove plugin entry from config', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          plugins: [
            { id: 'keep', enabled: true },
            { id: 'remove', enabled: true }
          ]
        })
      )

      await removePluginConfig('remove')

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.plugins).toHaveLength(1)
      expect(writtenData.plugins[0].id).toBe('keep')
    })

    it('should not fail if plugin is not in config', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ plugins: [{ id: 'other', enabled: true }] }))

      await removePluginConfig('nonexistent')

      const writtenData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenData.plugins).toHaveLength(1)
    })
  })
})
