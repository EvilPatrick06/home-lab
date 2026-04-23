import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock logger ---
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// --- Mock event-bus ---
vi.mock('./event-bus', () => ({
  pluginEventBus: {
    on: vi.fn(),
    onAsync: vi.fn(),
    off: vi.fn(),
    emit: vi.fn((_event: string, payload: unknown) => payload)
  }
}))

// --- Mock plugin-registry ---
vi.mock('./plugin-registry', () => ({
  getPluginCommandRegistry: vi.fn(() => []),
  getPluginUIRegistry: vi.fn(() => ({ contextMenuItems: [], bottomBarWidgets: [] }))
}))

// --- Mock window.api ---
vi.stubGlobal('window', {
  api: {
    plugins: {
      storageGet: vi.fn(),
      storageSet: vi.fn(),
      storageDelete: vi.fn()
    }
  }
})

import type { CodePluginManifest, PluginPermission } from '../../../../shared/plugin-types'
import { createPluginAPI } from './plugin-api'

function makeManifest(permissions: PluginPermission[] = []): CodePluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Tester',
    type: 'plugin',
    gameSystem: 'dnd5e',
    entry: 'main.js',
    permissions
  } as CodePluginManifest
}

describe('createPluginAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('module file exists', () => {
    expect(existsSync(resolve(__dirname, './plugin-api.ts'))).toBe(true)
  })

  it('module source exports createPluginAPI', () => {
    const src = readFileSync(resolve(__dirname, './plugin-api.ts'), 'utf-8')
    expect(src).toContain('export function createPluginAPI')
  })

  it('returns an API object with expected keys', () => {
    const api = createPluginAPI('test-plugin', makeManifest([]))
    expect(api).toHaveProperty('events')
    expect(api).toHaveProperty('commands')
    expect(api).toHaveProperty('ui')
    expect(api).toHaveProperty('storage')
    expect(api).toHaveProperty('log')
  })

  describe('events API', () => {
    it('has on, off, emit methods', () => {
      const api = createPluginAPI('test-plugin', makeManifest([]))
      expect(typeof api.events.on).toBe('function')
      expect(typeof api.events.off).toBe('function')
      expect(typeof api.events.emit).toBe('function')
    })
  })

  describe('commands API', () => {
    it('has register and unregister methods', () => {
      const api = createPluginAPI('test-plugin', makeManifest([]))
      expect(typeof api.commands.register).toBe('function')
      expect(typeof api.commands.unregister).toBe('function')
    })
  })

  describe('storage API', () => {
    it('has get, set, delete methods', () => {
      const api = createPluginAPI('test-plugin', makeManifest(['storage']))
      expect(typeof api.storage.get).toBe('function')
      expect(typeof api.storage.set).toBe('function')
      expect(typeof api.storage.delete).toBe('function')
    })

    it('rejects without storage permission', async () => {
      const api = createPluginAPI('test-plugin', makeManifest([]))
      await expect(api.storage.get('key')).rejects.toThrow(/lacks "storage" permission/)
    })
  })

  describe('ui API', () => {
    it('has registerContextMenuItem and registerBottomBarWidget methods', () => {
      const api = createPluginAPI('test-plugin', makeManifest([]))
      expect(typeof api.ui.registerContextMenuItem).toBe('function')
      expect(typeof api.ui.registerBottomBarWidget).toBe('function')
    })

    it('throws without ui-extensions permission', () => {
      const api = createPluginAPI('test-plugin', makeManifest([]))
      expect(() => api.ui.registerContextMenuItem({ label: 'X', onClick: vi.fn() })).toThrow(
        /lacks "ui-extensions" permission/
      )
    })
  })

  describe('log API', () => {
    it('has info, warn, error methods', () => {
      const api = createPluginAPI('test-plugin', makeManifest([]))
      expect(typeof api.log.info).toBe('function')
      expect(typeof api.log.warn).toBe('function')
      expect(typeof api.log.error).toBe('function')
    })
  })
})
