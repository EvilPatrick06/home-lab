import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRemovePlugin = vi.hoisted(() => vi.fn())

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
    emit: vi.fn().mockImplementation((_e: string, p: unknown) => p),
    removePlugin: mockRemovePlugin
  }
}))

// --- Mock window.api for plugin-api storage calls ---
vi.stubGlobal('window', {
  api: {
    plugins: {
      storageGet: vi.fn(),
      storageSet: vi.fn(),
      storageDelete: vi.fn()
    }
  }
})

import type { CodePluginManifest, ContentPackManifest } from '../../../../shared/plugin-types'
import {
  getLoadedPlugin,
  getLoadedPlugins,
  getPluginCommandRegistry,
  getPluginUIRegistry,
  loadPlugin,
  unloadAllPlugins,
  unloadPlugin
} from './plugin-registry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContentPackManifest(id = 'cp-1'): ContentPackManifest {
  return {
    id,
    name: 'Test Content Pack',
    version: '1.0.0',
    description: 'Test',
    author: 'Tester',
    type: 'content-pack',
    gameSystem: 'dnd5e',
    data: {}
  }
}

function makeCodePluginManifest(id = 'code-1', entry = 'index.js'): CodePluginManifest {
  return {
    id,
    name: 'Test Code Plugin',
    version: '1.0.0',
    description: 'Test',
    author: 'Tester',
    type: 'plugin',
    gameSystem: 'dnd5e',
    entry,
    permissions: ['commands', 'game-events']
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plugin-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unloadAllPlugins()
    // Clear command and UI registries
    getPluginCommandRegistry().length = 0
    getPluginUIRegistry().contextMenuItems.length = 0
    getPluginUIRegistry().bottomBarWidgets.length = 0
  })

  // =========================================================================
  // getPluginCommandRegistry / getPluginUIRegistry
  // =========================================================================

  describe('registries', () => {
    it('getPluginCommandRegistry returns a mutable array', () => {
      const reg = getPluginCommandRegistry()
      expect(Array.isArray(reg)).toBe(true)
    })

    it('getPluginUIRegistry returns object with contextMenuItems and bottomBarWidgets', () => {
      const reg = getPluginUIRegistry()
      expect(reg).toHaveProperty('contextMenuItems')
      expect(reg).toHaveProperty('bottomBarWidgets')
    })
  })

  // =========================================================================
  // loadPlugin - content pack
  // =========================================================================

  describe('loadPlugin (content-pack)', () => {
    it('loads a content pack without requiring entry point', async () => {
      const manifest = makeContentPackManifest('cp-test')
      const loaded = await loadPlugin(manifest)

      expect(loaded.id).toBe('cp-test')
      expect(loaded.status).toBe('loaded')
      expect(loaded.instance).toBeUndefined()
    })

    it('appears in getLoadedPlugins() and getLoadedPlugin()', async () => {
      const manifest = makeContentPackManifest('cp-2')
      await loadPlugin(manifest)

      expect(getLoadedPlugins()).toHaveLength(1)
      expect(getLoadedPlugin('cp-2')).toBeDefined()
      expect(getLoadedPlugin('cp-2')!.status).toBe('loaded')
    })
  })

  // =========================================================================
  // loadPlugin - code plugin with missing entry
  // =========================================================================

  describe('loadPlugin (code plugin, no entry)', () => {
    it('sets status to error when entry is missing', async () => {
      const manifest = makeCodePluginManifest('bad-plugin', '')
      const loaded = await loadPlugin(manifest)

      expect(loaded.status).toBe('error')
      expect(loaded.errorMessage).toBe('No entry point')
    })
  })

  // =========================================================================
  // loadPlugin - code plugin with dynamic import failure
  // =========================================================================

  describe('loadPlugin (code plugin, import fails)', () => {
    it('sets status to error when dynamic import throws', async () => {
      const manifest = makeCodePluginManifest('fail-plugin', 'main.js')
      // Dynamic import of plugin:// URL will fail in test environment
      const loaded = await loadPlugin(manifest)

      expect(loaded.status).toBe('error')
      expect(loaded.errorMessage).toBeTruthy()
    })
  })

  // =========================================================================
  // unloadPlugin
  // =========================================================================

  describe('unloadPlugin', () => {
    it('unloads a loaded content pack and removes it from registry', async () => {
      await loadPlugin(makeContentPackManifest('cp-unload'))
      expect(getLoadedPlugin('cp-unload')).toBeDefined()

      unloadPlugin('cp-unload')

      expect(getLoadedPlugin('cp-unload')).toBeUndefined()
      expect(mockRemovePlugin).toHaveBeenCalledWith('cp-unload')
    })

    it('does nothing when unloading an unknown plugin id', () => {
      unloadPlugin('nonexistent')
      // Should not throw
      expect(mockRemovePlugin).not.toHaveBeenCalled()
    })

    it('removes plugin commands from the command registry', async () => {
      await loadPlugin(makeContentPackManifest('cp-cmd'))

      // Manually add a command entry as if the plugin registered one
      const cmdRegistry = getPluginCommandRegistry()
      cmdRegistry.push({
        name: 'test-cmd',
        description: 'test',
        pluginId: 'cp-cmd',
        execute: vi.fn()
      } as any)
      expect(cmdRegistry).toHaveLength(1)

      unloadPlugin('cp-cmd')

      expect(cmdRegistry).toHaveLength(0)
    })

    it('removes plugin UI contributions', async () => {
      await loadPlugin(makeContentPackManifest('cp-ui'))

      const uiRegistry = getPluginUIRegistry()
      uiRegistry.contextMenuItems.push({ pluginId: 'cp-ui', label: 'X', onClick: vi.fn() })
      uiRegistry.bottomBarWidgets.push({ pluginId: 'cp-ui', id: 'w1', label: 'W', render: () => null })

      unloadPlugin('cp-ui')

      expect(uiRegistry.contextMenuItems).toHaveLength(0)
      expect(uiRegistry.bottomBarWidgets).toHaveLength(0)
    })
  })

  // =========================================================================
  // unloadAllPlugins
  // =========================================================================

  describe('unloadAllPlugins', () => {
    it('unloads all currently loaded plugins', async () => {
      await loadPlugin(makeContentPackManifest('cp-a'))
      await loadPlugin(makeContentPackManifest('cp-b'))
      expect(getLoadedPlugins()).toHaveLength(2)

      unloadAllPlugins()

      expect(getLoadedPlugins()).toHaveLength(0)
    })
  })
})
